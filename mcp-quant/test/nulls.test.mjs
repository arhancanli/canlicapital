// Clients that send every optional argument they leave unset as null (CrewAI through mcpadapt, OpenAI's strict function
// calling): for every tool, such nulls change nothing. A call with the optional arguments null gets exactly the answer the
// same call gets with them left out, here a call missing its required arguments, so no tool runs and nothing is fetched.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
const answer = (c, name, args) => c.callTool({ name, arguments: args }).then((r) => JSON.stringify({ error: !!r.isError, content: r.content }), (e) => JSON.stringify({ thrown: String(e?.message ?? e) }));

test("optional arguments sent as null are taken as not given, on every tool", async (t) => {
  const c = new Client({ name: "nulls", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" } }));
  t.after(() => c.close());
  const { tools } = await c.listTools();
  let checked = 0;
  for (const tool of tools) {
    const props = Object.keys(tool.inputSchema?.properties ?? {});
    const required = new Set(tool.inputSchema?.required ?? []);
    const optional = props.filter((p) => !required.has(p));
    if (!required.size || !optional.length) continue;
    const plain = await answer(c, tool.name, {});
    const nulls = await answer(c, tool.name, Object.fromEntries(optional.map((p) => [p, null])));
    assert.equal(nulls, plain, `${tool.name}: optional nulls changed the answer`);
    assert.match(plain, new RegExp([...required][0]), `${tool.name}: the answer names a missing required argument`);
    checked += 1;
  }
  t.diagnostic(`${checked} of ${tools.length} tools checked`);
  assert.ok(checked > 0, "at least one tool has required and optional arguments");
});

test("run_tool with its options and the tool's own optional arguments null gives the same answer as with them left out", async (t) => {
  const c = new Client({ name: "nulls", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" } }));
  t.after(() => c.close());
  const text = (r) => r.content?.[0]?.text ?? "";
  const returns = Array.from({ length: 120 }, (_, i) => 0.001 * Math.sin(i) + 0.0004);
  const found = await c.callTool({ name: "find_tool", arguments: { query: "sharpe ratio", toolset: null, limit: null } });
  assert.ok(!found.isError, text(found));
  assert.match(text(found), /sharpe_ratio/);
  const plain = await c.callTool({ name: "run_tool", arguments: { name: "sharpe_ratio", arguments: { returns } } });
  const nulls = await c.callTool({ name: "run_tool", arguments: { name: "sharpe_ratio", arguments: { returns, prices: null, periods_per_year: null, risk_free: null }, receipt: null, digits: null } });
  assert.ok(!nulls.isError, text(nulls));
  assert.equal(text(nulls), text(plain));
  const bad = await c.callTool({ name: "run_tool", arguments: { name: "sharpe_ratio", arguments: { returns: null, risk_free: null } } });
  assert.ok(bad.isError || /returns/.test(text(bad)), text(bad));
  assert.doesNotMatch(text(bad), /risk_free/);
});
