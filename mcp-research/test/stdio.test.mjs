// The real server over stdio: six read-only tools, a small tool list, byte-identical on every launch
// (providers cache it), and no em dash in anything the package ships.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function listTools() {
  const client = new Client({ name: "stdio-test", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(ROOT, "src/server.mjs")] }));
  try {
    return { json: JSON.stringify(await client.listTools()), version: client.getServerVersion().version };
  } finally {
    await client.close();
  }
}

test("six read-only tools, the package version, and a byte-identical list on every launch", async () => {
  const first = await listTools();
  const { tools } = JSON.parse(first.json);
  assert.deepEqual(tools.map((t) => t.name).sort(), ["chain_head", "get_paper", "list_topics", "live_record", "search_research", "trial_ledger"]);
  for (const t of tools) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.destructiveHint, false, t.name);
  }
  assert.equal(first.version, JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version);
  assert.equal((await listTools()).json, first.json);
});

test("the tool list stays small: under 2500 characters a model reads", async () => {
  const { tools } = JSON.parse((await listTools()).json);
  const visible = tools.reduce((n, t) => { const { $schema, ...params } = t.inputSchema; return n + t.description.length + JSON.stringify(params).length; }, 0);
  assert.ok(visible < 2500, `${visible} characters`);
});

test("no shipped file contains an em dash", () => {
  const files = ["README.md", "package.json", ...readdirSync(resolve(ROOT, "src")).map((f) => `src/${f}`)];
  for (const f of files) assert.ok(!readFileSync(resolve(ROOT, f), "utf8").includes("—"), f);
});
