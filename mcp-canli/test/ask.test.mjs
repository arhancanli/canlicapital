// A company named in words that matched several filers: the person is asked which (MCP elicitation), on the
// 2025 protocol while the call waits and on the 2026-07-28 protocol by input_required and a retry; a client
// that cannot be asked, a person who declines and CANLI_ASK=0 leave the first match with the others listed.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { askWhich, matches, question } from "../src/ask.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(ROOT, "src", "server.mjs");
const PLUGIN = path.join(ROOT, "test", "fixtures", "ask-plugin.mjs");
const CALL = { name: "run_tool", arguments: { name: "demo_company_revenue", arguments: { company: "Delta" } } };

async function connect(t, { elicit, modern = false, env = {} } = {}) {
  const c = new Client({ name: "ask", version: "0" }, { capabilities: elicit ? { elicitation: { form: {} } } : {}, ...(modern ? { versionNegotiation: { mode: { pin: "2026-07-28" } } } : {}) });
  const asked = [];
  if (elicit) c.setRequestHandler("elicitation/create", async (req) => { asked.push(req.params); return elicit(req.params); });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_PACKS: "quant", CANLI_PLUGINS: PLUGIN, CANLI_HOME: mkdtempSync(path.join(tmpdir(), "canli-ask-")), ...env } }));
  t.after(() => c.close());
  return { c, asked };
}

test("the matches a result names, and the question they make", () => {
  const result = { company: { cik: 27904, name: "DELTA AIR LINES, INC.", ticker: "DAL", matched_by: "name", other_matches: [{ cik: 1101396, name: "Delta Apparel, Inc", ticker: "DLA" }] } };
  assert.deepEqual(matches(result).map((o) => o.cik), ["27904", "1101396"]);
  assert.equal(matches({ company: { cik: 27904, matched_by: "ticker" } }), null);
  const q = question({ name: "x", arguments: { company: "Delta" } }, result);
  assert.equal(q.arg, "company");
  assert.match(q.message, /"Delta" names more than one company/);
  assert.deepEqual(q.requestedSchema.properties.company.oneOf.map((o) => o.const), ["27904", "1101396"]);
  assert.equal(question({ name: "x", arguments: {} }, result), null, "no argument named the company");
});

test("an answer that is not one of the companies offered changes nothing", async () => {
  const done = [{ name: "x", result: { company: { cik: 1, name: "A", matched_by: "name", other_matches: [{ cik: 2, name: "B" }] } } }];
  let reran = 0;
  const extra = { mcpReq: { inputResponses: { company: { action: "accept", content: { company: "999" } } } } };
  assert.equal(await askWhich({ extra, calls: [{ name: "x", arguments: { company: "a" } }], done, rerun: async () => { reran += 1; } }), null);
  assert.equal(reran, 0);
  assert.equal(done[0].result.asked, undefined);
});

test("2025 protocol: the person picks Delta Apparel and the call runs again for it", async (t) => {
  const { c, asked } = await connect(t, { elicit: () => ({ action: "accept", content: { company: "1101396" } }) });
  const r = await c.callTool(CALL);
  assert.ok(!r.isError, r.content?.[0]?.text);
  assert.equal(asked.length, 1);
  assert.match(asked[0].message, /"Delta" names more than one company/);
  assert.equal(r.structuredContent.revenue_billions, 0.4);
  assert.equal(r.structuredContent.company.ticker, "DLA");
  assert.deepEqual(r.structuredContent.asked, { question: asked[0].message, answer: "Delta Apparel, Inc", how: "answered" });
});

test("2026-07-28 protocol: the question rides an input_required result, and the retry carries the answer", async () => {
  const { SdkError, SdkErrorCode, isInputRequiredResult } = await import("@modelcontextprotocol/server");
  const calls = [{ name: "x", arguments: { company: "Delta" } }];
  const first = () => [{ name: "x", result: { company: { cik: 27904, name: "DELTA AIR LINES, INC.", matched_by: "name", other_matches: [{ cik: 1101396, name: "Delta Apparel, Inc" }] }, revenue_billions: 61.6 } }];
  // A modern-era request: elicitInput refuses, the client's capabilities ride the request's envelope.
  const modern = { elicitInput: async () => { throw new SdkError(SdkErrorCode.MethodNotSupportedByProtocolVersion, "not on 2026-07-28"); }, envelope: { "io.modelcontextprotocol/clientCapabilities": { elicitation: { form: {} } } } };
  const ask = await askWhich({ extra: { mcpReq: modern }, calls, done: first(), rerun: async () => assert.fail("not yet") });
  assert.ok(isInputRequiredResult(ask));
  assert.match(JSON.stringify(ask), /names more than one company/);
  // The retry: the same call with the person's answer.
  const done = first();
  const retry = { ...modern, inputResponses: { company: { action: "accept", content: { company: "1101396" } } } };
  assert.equal(await askWhich({ extra: { mcpReq: retry }, calls, done, rerun: async (i, args) => ({ company: { cik: Number(args.company), name: "Delta Apparel, Inc" }, revenue_billions: 0.4 }) }), null);
  assert.equal(done[0].result.revenue_billions, 0.4);
  assert.equal(calls[0].arguments.company, "1101396");
  // A modern client that did not say it can be asked is not sent a question it cannot answer.
  const silent = { elicitInput: modern.elicitInput, envelope: {} };
  assert.equal(await askWhich({ extra: { mcpReq: silent }, calls: [{ name: "x", arguments: { company: "Delta" } }], done: first(), rerun: async () => assert.fail("no") }), null);
});

test("a person who declines keeps the first match; a client that cannot ask, or CANLI_ASK=0, is not asked", async (t) => {
  const declined = await connect(t, { elicit: () => ({ action: "decline" }) });
  const r1 = await declined.c.callTool(CALL);
  assert.equal(r1.structuredContent.revenue_billions, 61.6);
  assert.deepEqual(r1.structuredContent.asked, { question: declined.asked[0].message, answer: "decline", kept: "DELTA AIR LINES, INC." });
  const plain = await connect(t);
  const r2 = await plain.c.callTool(CALL);
  assert.equal(r2.structuredContent.revenue_billions, 61.6);
  assert.equal(r2.structuredContent.asked, undefined);
  assert.equal(r2.structuredContent.company.other_matches.length, 2);
  const off = await connect(t, { elicit: () => ({ action: "accept", content: { company: "1101396" } }), env: { CANLI_ASK: "0" } });
  const r3 = await off.c.callTool(CALL);
  assert.equal(off.asked.length, 0);
  assert.equal(r3.structuredContent.revenue_billions, 61.6);
});
