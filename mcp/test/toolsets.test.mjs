// Toolsets: a client can list only the tools it needs, because the tool list is re-sent to the model
// on every turn. Every tool belongs to exactly one toolset, so no tool can silently disappear; the
// default is every tool; an unknown name is refused.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { McpServer } from "@modelcontextprotocol/server";

import { TOOLSETS, configuredToolsets, createSession, registerTools } from "../src/server.mjs";

function registeredNames(toolsets) {
  const names = [];
  const fake = { registerTool: (name) => names.push(name) };
  registerTools(fake, createSession({ toolsets }));
  return names;
}

test("every registered tool is in exactly one toolset, and every toolset name is a registered tool", () => {
  const all = registeredNames(Object.keys(TOOLSETS));
  const members = Object.values(TOOLSETS).flat();
  assert.equal(new Set(members).size, members.length, "no tool is in two toolsets");
  assert.deepEqual([...members].sort(), [...all].sort());
  assert.equal(all.length, 23, "0.12.0 folded get_receipt into verify_receipt; check_leakage and placebo_test joined the lab; the ledger added three");
  // A real McpServer accepts the same registrations.
  registerTools(new McpServer({ name: "t", version: "0" }), createSession({ toolsets: ["company"] }));
});

test("each toolset lists exactly its own tools", () => {
  for (const [name, tools] of Object.entries(TOOLSETS)) assert.deepEqual(registeredNames([name]).sort(), [...tools].sort(), name);
  assert.deepEqual(registeredNames(["receipts", "company"]).sort(), [...TOOLSETS.receipts, ...TOOLSETS.company].sort());
});

test("configuration: empty or unsubstituted means every toolset but company and ledger; 'all' adds them; names are trimmed and case-folded; unknown names are refused", () => {
  const every = Object.keys(TOOLSETS);
  for (const v of [undefined, "", "  ", "${CANLI_TOOLSETS}"]) assert.deepEqual(configuredToolsets(v), every.filter((n) => n !== "company" && n !== "ledger"), String(v));
  for (const v of ["all", "ALL"]) assert.deepEqual(configuredToolsets(v), every, v);
  assert.deepEqual(configuredToolsets(" Company , validate,company"), ["company", "validate"]);
  assert.throws(() => configuredToolsets("company,validaet"), /Unknown toolset validaet; choose from validate, receipts, company, status, lab, ledger or all/);
  assert.throws(() => configuredToolsets(","), /Unknown toolset/);
});

test("over stdio, CANLI_TOOLSETS=company lists one tool", async (t) => {
  const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
  const client = new Client({ name: "toolsets-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env: { ...process.env, CANLI_TOOLSETS: "company", CANLI_KEY: "" } }));
  t.after(() => client.close());
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((x) => x.name), ["company_financial_history"]);
});

test("get_key is listed only for a session with no key, and company only when asked for", async () => {
  const { createSession, registerTools } = await import("../src/server.mjs");
  const listed = (session) => {
    const names = [];
    registerTools({ registerTool: (name) => names.push(name) }, session);
    return names;
  };
  const fetchImpl = async () => { throw new Error("no network"); };
  assert.ok(listed(createSession({ fetchImpl, envKey: "" })).includes("get_key"), "no key: listed");
  assert.ok(!listed(createSession({ fetchImpl, envKey: "k".repeat(24) })).includes("get_key"), "CANLI_KEY set: not listed");
  assert.ok(!listed(createSession({ fetchImpl, envKey: "", hosted: { keySource: "shared" } })).includes("get_key"), "hosted shared key: not listed");
  assert.ok(!listed(createSession({ fetchImpl, envKey: "", hosted: { keySource: "caller" } })).includes("get_key"), "hosted caller key: not listed");
  assert.ok(listed(createSession({ fetchImpl, envKey: "", hosted: { keySource: "none" } })).includes("get_key"), "hosted with no key: listed");
  assert.ok(!listed(createSession({ fetchImpl, envKey: "" })).includes("company_financial_history"), "default: no company tool");
  assert.ok(listed(createSession({ fetchImpl, envKey: "", toolsets: configuredToolsets("all") })).includes("company_financial_history"), "all: company tool listed");
});
