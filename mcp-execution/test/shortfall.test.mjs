import assert from "node:assert/strict";
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { toolShortfall } from "../src/server.mjs";

const base = { fill_source: "self_reported", orders: [{ id: "first", side: "buy", qty: 100, decision_price: 100, decision_ts: "2026-10-01T12:00:00Z", arrival_mid: 101, horizon_price: 104, fills: [{ qty: 60, price: 102, fee: 6, ts: "2026-10-01T12:01:00Z" }] }] };

test("real SDK client lists before calling; the new result conforms to its advertised schema", async () => {
  const client = new Client({ name: "shortfall-test", version: "1" });
  const root = new URL("..", import.meta.url);
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [new URL("src/server.mjs", root).pathname], env: { ...process.env, CANLI_HOME: mkdtempSync(join(tmpdir(), "canli-shortfall-")) } }));
  try {
    const list = await client.listTools();
    assert.ok(list.tools.find((tool) => tool.name === "measure_shortfall"));
    const result = await client.callTool({ name: "measure_shortfall", arguments: base });
    assert.notEqual(result.isError, true, JSON.stringify(result.content));
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    assert.equal(result.structuredContent.aggregate.total_bps, 286);
  } finally { await client.close(); }
});

test("missing fees remain unknown over MCP, and IEX/paper boundaries stay explicit", async () => {
  const order = { ...base.orders[0], arrival_feed: "iex", fills: [{ qty: 60, price: 102, ts: base.orders[0].fills[0].ts }] };
  const result = (await toolShortfall({ fill_source: "broker_paper", orders: [order], max_rows: 1 })).structuredContent;
  assert.equal(result.aggregate.total_bps, null);
  assert.equal(result.rows[0][5], null);
  assert.match(result.feed_warning, /not the NBBO/);
  assert.ok(result.limits.some((text) => /paper engine, not market fills/.test(text)));
});

test("invalid timestamps, hidden credentials, unknown options and unsorted bootstrap data refuse", async () => {
  await assert.rejects(toolShortfall({ ...base, orders: [{ ...base.orders[0], decision_ts: "tomorrow" }] }), /decision_ts/);
  await assert.rejects(toolShortfall({ ...base, api_key: "never-log-this" }), /Unrecognized key/);
  const late = { ...base.orders[0], id: "later", decision_ts: "2026-10-01T13:00:00Z", fills: [] };
  await assert.rejects(toolShortfall({ ...base, orders: [late, base.orders[0]], bootstrap: {} }), /chronological/);
  await assert.rejects(toolShortfall({ ...base, benchmark: "best_price" }), /benchmark/);
});

test("a thousand-order result stays bounded by default; details are opt-in", async () => {
  const result = await toolShortfall({ ...base, orders: Array.from({ length: 1000 }, (_, i) => ({ ...base.orders[0], id: String(i) })) });
  assert.equal(result.structuredContent.orders, 1000);
  assert.equal(result.structuredContent.rows.length, 0);
  assert.equal(result.structuredContent.rows_omitted, 1000);
  assert.ok(result.content[0].text.length < 3300, `${result.content[0].text.length} characters`);
});

test("local JSON input gives the same arithmetic with a captured hash and no raw file content in errors", async () => {
  const dir = mkdtempSync(join(tmpdir(), "canli-shortfall-file-"));
  const path = join(dir, "orders.json");
  try {
    const bytes = JSON.stringify(base.orders);
    writeFileSync(path, bytes);
    const inline = (await toolShortfall(base)).structuredContent;
    const result = (await toolShortfall({ fill_source: base.fill_source, orders_file: path })).structuredContent;
    assert.deepEqual(result.aggregate, inline.aggregate);
    assert.deepEqual(result.input_source, { kind: "local_json", bytes: Buffer.byteLength(bytes), sha256: createHash("sha256").update(bytes).digest("hex") });
    assert.equal(result.rows.length, 0);
    await assert.rejects(toolShortfall({ ...base, orders_file: path }), /exactly one/);
    await assert.rejects(toolShortfall({ fill_source: base.fill_source }), /exactly one/);
    await assert.rejects(toolShortfall({ fill_source: base.fill_source, orders_file: "relative.json" }), /absolute local path/);
    writeFileSync(path, '{"secret":"never-echo-this"}');
    await assert.rejects(toolShortfall({ fill_source: base.fill_source, orders_file: path }), (error) => /invalid order fields/.test(error.message) && !error.message.includes("never-echo-this"));
    writeFileSync(path, "not-json-private-content");
    await assert.rejects(toolShortfall({ fill_source: base.fill_source, orders_file: path }), (error) => /valid JSON array/.test(error.message) && !error.message.includes("not-json-private-content"));
    truncateSync(path, 16 * 1024 * 1024 + 1);
    await assert.rejects(toolShortfall({ fill_source: base.fill_source, orders_file: path }), /at most 16 MiB/);
    await assert.rejects(toolShortfall({ fill_source: base.fill_source, orders_file: dir }), /regular JSON file/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
