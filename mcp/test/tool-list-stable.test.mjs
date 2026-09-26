// Model providers cache a repeated prompt prefix and bill it at a fraction of the price, and an MCP
// server's tool list is re-sent on every turn; most prompt tokens in the agent benchmark were served
// from cache (bench/agent/experiments/2026-09-26-compact-results). That holds only while the tool list is the
// same bytes on every launch: no timestamps, no random order, nothing per session.
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");

async function toolListJson(env) {
  const client = new Client({ name: "stability-test", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ...process.env, ...env } }));
  try {
    return JSON.stringify(await client.listTools());
  } finally {
    await client.close();
  }
}

test("the tool list is byte-identical across launches, so providers can cache it", async () => {
  const first = await toolListJson({ CANLI_LOCAL: "1" });
  const second = await toolListJson({ CANLI_LOCAL: "1" });
  assert.equal(first, second);
  assert.equal(await toolListJson({}), first, "local mode must not change the advertised tools");
});
