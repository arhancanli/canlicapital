// The real server over stdio, as a client meets it: five read-only tools, a small tool list that
// is byte-identical on every launch (providers cache it), and every result validated against the
// output schema the client listed first. The server reads a local copy of the fixture site.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { files } from "./fixture.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function withSite(fn) {
  const map = files();
  const server = createServer((req, res) => {
    const body = map[new URL(req.url, "http://x").pathname];
    res.writeHead(body ? 200 : 404).end(body ?? "not found");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

async function connect(base) {
  const client = new Client({ name: "stdio-test", version: "1" });
  const env = { ...process.env, CANLI_API_BASE: base ?? "http://127.0.0.1:9", CANLI_CACHE_DIR: mkdtempSync(join(tmpdir(), "canli-fundamentals-")) };
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(ROOT, "src/server.mjs")], env }));
  return client;
}

test("five read-only tools, the package version, and a byte-identical list on every launch", async () => {
  const list = async () => {
    const client = await connect();
    try {
      return { json: JSON.stringify(await client.listTools()), version: client.getServerVersion().version };
    } finally {
      await client.close();
    }
  };
  const first = await list();
  const { tools } = JSON.parse(first.json);
  assert.deepEqual(tools.map((t) => t.name).sort(), ["history", "known_as_of", "list_concepts", "restatements", "vintages"]);
  for (const t of tools) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.destructiveHint, false, t.name);
    assert.ok(t.outputSchema, `${t.name} has no output schema`);
    assert.doesNotMatch(JSON.stringify(t.outputSchema), /"additionalProperties":false/, `${t.name} publishes a closed output schema`);
  }
  assert.equal(first.version, JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version);
  assert.equal((await list()).json, first.json);
});

test("the tool list stays small: under 4500 characters a model reads", async () => {
  const client = await connect();
  try {
    const { tools } = await client.listTools();
    const visible = tools.reduce((n, t) => { const { $schema, ...params } = t.inputSchema; return n + t.description.length + JSON.stringify(params).length; }, 0);
    assert.ok(visible < 4500, `${visible} characters`);
  } finally {
    await client.close();
  }
});

test("list tools, then call each one: every result passes the schema the client listed", async () => {
  await withSite(async (base) => {
    const client = await connect(base);
    try {
      await client.listTools();
      const calls = [
        ["known_as_of", { company: "FIX", as_of: "2020-02-01" }],
        ["history", { company: "FIX", concept: "revenue", as_of: "2020-06-30" }],
        ["restatements", { company: "FIX", include_splits: true }],
        ["vintages", { company: "FIX", concept: "revenue", end: "2019-09-30" }],
        ["list_concepts", { company: "FIX", search: "revenue" }],
      ];
      for (const [name, args] of calls) {
        const r = await client.callTool({ name, arguments: args });
        assert.notEqual(r.isError, true, `${name}: ${JSON.stringify(r.content)}`);
        assert.ok(r.structuredContent?.rows?.length > 0, name);
        assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent, name);
      }
      const bad = await client.callTool({ name: "history", arguments: { company: "FIX", concept: "Nope" } });
      assert.equal(bad.isError, true);
      assert.match(bad.content[0].text, /reports no concept named Nope/);
    } finally {
      await client.close();
    }
  });
});

test("initialize introduces the server: title, documentation page, icons and instructions", async () => {
  const client = await connect();
  try {
    const info = client.getServerVersion();
    assert.equal(info.title, "Canli Fundamentals");
    assert.match(info.websiteUrl, /^https:\/\/canlicapital\.com\/developers#/);
    assert.ok(info.icons.some((i) => i.src === "https://canlicapital.com/icon-512.png" && i.sizes.includes("512x512")));
    const { SERVER_INSTRUCTIONS } = await import("../src/server.mjs");
    assert.equal(client.getInstructions(), SERVER_INSTRUCTIONS, "initialize carries the byte-stable instructions");
    assert.ok(SERVER_INSTRUCTIONS.length < 700, "instructions stay short: they sit in the system prompt");
  } finally {
    await client.close();
  }
});

test("no shipped file contains an em dash", () => {
  const shipped = ["README.md", "package.json", ...readdirSync(resolve(ROOT, "src")).map((f) => `src/${f}`)];
  for (const f of shipped) assert.ok(!readFileSync(resolve(ROOT, f), "utf8").includes("—"), f);
});
