// Frameworks that send every optional argument as null when it is unset (CrewAI through mcpadapt; OpenAI's strict
// function calling): such a call works, at the front tools and inside run_tool, and a null where a value is required
// is still refused.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { withoutNulls } from "../src/server.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
const returns = Array.from({ length: 120 }, (_, i) => 0.001 * Math.sin(i) + 0.0004);

test("withoutNulls drops null keys of a plain object, and says when there is nothing to drop", () => {
  assert.deepEqual(withoutNulls({ a: 1, b: null, c: [null] }), { a: 1, c: [null] });
  assert.equal(withoutNulls({ a: 1 }), null);
  assert.equal(withoutNulls([null]), null);
  assert.equal(withoutNulls(null), null);
});

test("a call with every optional argument null works as if they were left out", async (t) => {
  const c = new Client({ name: "nulls", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } }));
  t.after(() => c.close());
  const text = (r) => r.content?.[0]?.text ?? "";

  // CrewAI's shape for find_tool: limit unset, sent as null.
  const found = await c.callTool({ name: "find_tool", arguments: { query: "sharpe ratio", limit: null } });
  assert.ok(!found.isError, text(found));
  assert.match(text(found), /sharpe_ratio/);

  // CrewAI's shape for run_tool, one call: every option null, and nulls inside the tool's own arguments too.
  const envelope = { calls: null, return: null, digits: null, select: null, receipt: null, max_chars: null, as_of: null, changes_only: null };
  const one = await c.callTool({ name: "run_tool", arguments: { name: "sharpe_ratio", arguments: { returns, periods_per_year: null }, ...envelope } });
  assert.ok(!one.isError, text(one));
  const reference = await c.callTool({ name: "run_tool", arguments: { name: "sharpe_ratio", arguments: { returns } } });
  assert.ok(Number.isFinite(JSON.parse(text(one)).sharpe), text(one));
  assert.equal(JSON.parse(text(one)).sharpe, JSON.parse(text(reference)).sharpe, "same answer as with them left out");

  // Several calls, with name and arguments null.
  const many = await c.callTool({ name: "run_tool", arguments: { ...envelope, name: null, arguments: null, calls: [{ name: "sharpe_ratio", arguments: { returns } }] } });
  assert.ok(!many.isError, text(many));

  // A null where a value is needed is still refused, with the message as sent.
  const bad = await c.callTool({ name: "find_tool", arguments: { query: null } }).catch((e) => ({ isError: true, content: [{ text: String(e?.message ?? e) }] }));
  assert.ok(bad.isError);
  assert.match(text(bad), /query/);
  const badInner = await c.callTool({ name: "run_tool", arguments: { name: "sharpe_ratio", arguments: { returns: null } } });
  assert.ok(badInner.isError || /returns/.test(text(badInner)), text(badInner));
});
