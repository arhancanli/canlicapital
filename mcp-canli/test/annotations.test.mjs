// What run_tool tells a client about itself decides whether every call needs a confirmation.
import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";

import { registerAll } from "../src/server.mjs";

async function runTool(packs, options) {
  const server = new McpServer({ name: "t", version: "1" });
  registerAll(server, packs, undefined, options);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const { tools } = await client.listTools();
  await client.close();
  return tools.find((t) => t.name === "run_tool").annotations;
}

test("destructive only with the paper pack; read-only only where the caller says so", async () => {
  assert.equal((await runTool(["quant", "paper"])).destructiveHint, true);
  const local = await runTool(["quant", "markets"]);
  assert.deepEqual([local.destructiveHint, local.readOnlyHint], [false, false]);
  const hosted = await runTool(["quant", "markets"], { readOnly: true });
  assert.deepEqual([hosted.destructiveHint, hosted.readOnlyHint, hosted.title], [false, true, "Run tools"]);
});
