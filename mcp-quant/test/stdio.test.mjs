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
