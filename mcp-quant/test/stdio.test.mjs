// Over stdio: the default list is the three discovery tools, a toolset lists its tools directly,
// the list is byte-stable across launches, and errors come back as tool errors naming the fix.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { CATALOG, inputJsonSchema } from "../src/registry.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");

async function connect(env = {}) {
  const client = new Client({ name: "stdio-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { ...process.env, CANLI_TOOLSETS: "", ...env } }));
  return client;
}

test("default: three discovery tools that find, describe and run every tool", async (t) => {
  const c = await connect();
  t.after(() => c.close());
  const { tools } = await c.listTools();
  assert.deepEqual(tools.map((x) => x.name), ["find_tool", "describe_tool", "run_tool"]);
  const found = await c.callTool({ name: "find_tool", arguments: { query: "value at risk cornish fisher" } });
  assert.equal(found.structuredContent.rows[0][0], "value_at_risk");
  const described = await c.callTool({ name: "describe_tool", arguments: { name: "sortino_ratio" } });
  assert.ok(described.structuredContent.input_schema.properties.target);
  const ran = await c.callTool({ name: "run_tool", arguments: { name: "kelly_fraction", arguments: { win_probability: 0.6, payoff: 1 } } });
  assert.equal(ran.structuredContent.kelly, 0.2);
  const bad = await c.callTool({ name: "run_tool", arguments: { name: "sharpe_ratio", arguments: { returns: [0.01, -1.2, 0.02] } } });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /cannot be -100%/);
  const unknown = await c.callTool({ name: "run_tool", arguments: { name: "nope" } });
  assert.match(unknown.content[0].text, /find_tool/);
});

test("CANLI_TOOLSETS=all lists every tool directly, byte-identically across launches", async () => {
  const lists = [];
  for (let i = 0; i < 2; i++) {
    const c = await connect({ CANLI_TOOLSETS: "all" });
    lists.push(JSON.stringify(await c.listTools()));
    await c.close();
  }
  assert.equal(lists[0], lists[1]);
  assert.equal(JSON.parse(lists[0]).tools.length, CATALOG.length + 3);
});

test("every tool has a description starting with a verb-like capital and every parameter is described", () => {
  for (const t of CATALOG) {
    assert.match(t.description, /^[A-Z][a-z]+ /, t.name);
    for (const [k, v] of Object.entries(inputJsonSchema(t).properties)) assert.ok(v.description, `${t.name}.${k} has no description`);
  }
});

test("prompts, resources and receipts", async (t) => {
  const c = await connect();
  t.after(() => c.close());
  const { prompts } = await c.listPrompts();
  assert.ok(prompts.length >= 11);
  const p = await c.getPrompt({ name: "audit_backtest", arguments: { recipe: "breakout", prices: "[1,2,3]" } });
  assert.match(p.messages[0].content.text, /strategy_sweep/);
  const done = await c.complete({ ref: { type: "ref/prompt", name: "audit_backtest" }, argument: { name: "recipe", value: "pa" } });
  assert.deepEqual(done.completion.values, ["pairs_trading"]);
  const cat = JSON.parse((await c.readResource({ uri: "canli-quant://catalog" })).contents[0].text);
  assert.equal(cat.tools, CATALOG.length);
  const methods = JSON.parse((await c.readResource({ uri: "canli-quant://methods" })).contents[0].text);
  for (const [k, v] of Object.entries(methods.toolsets)) assert.ok(v.checked_against, `${k} has no reference method`);
  const schema = JSON.parse((await c.readResource({ uri: "canli-quant://tools/black_scholes" })).contents[0].text);
  assert.ok(schema.input_schema.properties.volatility);
  const sl = JSON.parse((await c.readResource({ uri: "canli-quant://sleeves" })).contents[0].text);
  assert.equal(sl.rows.length, 399);
  const one = JSON.parse((await c.readResource({ uri: "canli-quant://sleeves/tsmom-252-long" })).contents[0].text);
  assert.match(one.spec_sha256, /^[0-9a-f]{64}$/);
  const sp = await c.getPrompt({ name: "sleeve_tournament", arguments: { prices: "[1,2,3]" } });
  assert.match(sp.messages[0].content.text, /sleeve_clusters/);
  const args = { name: "net_present_value", arguments: { rate: 0.08, cashflows: [-100, 60, 60] }, receipt: true };
  const a = await c.callTool({ name: "run_tool", arguments: args }), b = await c.callTool({ name: "run_tool", arguments: args });
  assert.match(a.structuredContent.receipt.output_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(a.structuredContent.receipt, b.structuredContent.receipt);
});

test("the default tool list stays small however large the catalog grows", async (t) => {
  const c = await connect();
  t.after(() => c.close());
  const bytes = JSON.stringify((await c.listTools()).tools).length;
  assert.ok(bytes < 4000, `default tool list is ${bytes} bytes`);
});

test("the README lists every tool and the counts it states are the real ones", async () => {
  const { readFileSync } = await import("node:fs");
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  for (const t of CATALOG) assert.ok(readme.includes(`\`${t.name}\``), `README is missing ${t.name}`);
  assert.match(readme, new RegExp(`^${CATALOG.length} quant finance tools`, "m"));
  const { readdirSync } = await import("node:fs");
  const cases = readdirSync(new URL("./fixtures/", import.meta.url)).reduce((s, f) => s + JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8")).cases.length, 0);
  assert.ok(readme.includes(`${cases} reference cases`), `README should say ${cases} reference cases`);
});
