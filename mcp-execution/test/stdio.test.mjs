// The real server over stdio, as a client meets it: the tool list first (clients validate results
// only against a schema they have listed), a byte-identical list on every launch, the trader's
// limits file and kill switch read from CANLI_HOME, and the instructions sent in initialize.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function connect(home = mkdtempSync(join(tmpdir(), "canli-exec-")), extra = {}) {
  const client = new Client({ name: "stdio-test", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(ROOT, "src/server.mjs")], env: { ...process.env, CANLI_HOME: home, ...extra } }));
  return client;
}

const ORDER_ARGS = {
  asset_class: "us_equity",
  orders: [{ symbol: "AAPL", side: "buy", qty: 100 }, { symbol: "AAPL", side: "sell", qty: 50, type: "limit", limit_price: 130 }],
  market: { AAPL: { price: 100, bid: 99.99, ask: 100.01, adv_usd: 5e9, daily_vol: 0.015 } },
  limits: { price_collar_frac: 0.05 },
};

test("one read-only tool, the package version, and a byte-identical list on every launch", async () => {
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
  assert.deepEqual(tools.map((t) => t.name), ["check_orders"]);
  const [t] = tools;
  assert.deepEqual(t.annotations, { title: "Check orders", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  assert.ok(t.outputSchema, "check_orders has an output schema");
  assert.doesNotMatch(JSON.stringify(t.outputSchema), /"additionalProperties":false/, "the output schema is open");
  assert.equal(first.version, JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version);
  assert.equal((await list()).json, first.json);
});

test("list tools, then call: the result passes the listed schema and reads the limits file and kill switch", async () => {
  const home = mkdtempSync(join(tmpdir(), "canli-exec-"));
  writeFileSync(join(home, "limits.json"), JSON.stringify({ max_order_notional: 20000 }));
  const client = await connect(home);
  try {
    await client.listTools();
    const r = await client.callTool({ name: "check_orders", arguments: ORDER_ARGS });
    assert.notEqual(r.isError, true, JSON.stringify(r.content));
    assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
    assert.deepEqual(r.structuredContent.rows.map((x) => [x[3], x[4]]), [[true, []], [false, ["price_collar"]]]);
    assert.deepEqual(r.structuredContent.effective_limits, { max_order_notional: 20000, price_collar_frac: 0.05 });
    writeFileSync(join(home, "KILL"), "");
    const killed = await client.callTool({ name: "check_orders", arguments: ORDER_ARGS });
    assert.equal(killed.structuredContent.kill_switch, "engaged");
    assert.equal(killed.structuredContent.accepted, 0);
    const bad = await client.callTool({ name: "check_orders", arguments: { ...ORDER_ARGS, venue: "alpaca_live" } });
    assert.equal(bad.isError, true, "a field the schema does not name is refused, not ignored");
    const negative = await client.callTool({ name: "check_orders", arguments: { ...ORDER_ARGS, orders: [{ symbol: "AAPL", side: "buy", qty: -5 }] } });
    assert.match(negative.content[0].text, /orders\.0\.qty: Too small/, "the refused field is named");
    const limits = await client.readResource({ uri: "execution://limits" });
    assert.equal(JSON.parse(limits.contents[0].text).kill_switch, "engaged");
  } finally {
    await client.close();
  }
});

test("an unknown toolset stops the server at start instead of dropping a tool", async () => {
  await assert.rejects(connect(undefined, { CANLI_EXEC_TOOLSETS: "plan,brokr" }));
});

test("initialize introduces the server: title, documentation page, icons and instructions", async () => {
  const client = await connect();
  try {
    const info = client.getServerVersion();
    assert.equal(info.title, "Canli Execution");
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
  const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  for (const f of [resolve(ROOT, "package.json"), ...walk(resolve(ROOT, "src"))]) assert.ok(!readFileSync(f, "utf8").includes("—"), f);
});
