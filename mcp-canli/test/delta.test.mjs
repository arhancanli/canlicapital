// Changes since the last read: table rows added and removed, fields changed at any depth, retrieval details left out
// of the comparison; and over stdio, a first read in full, an unchanged repeat answered in a few words, and a changed
// repeat answered with only the change.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { createDelta, diff } from "../src/delta.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");

test("diff names rows added and removed, fields changed at any depth, and ignores where and when a figure was read", () => {
  const before = { company: "AAPL", filings: { columns: ["form", "filed"], rows: [["10-Q", "2026-07-31"], ["10-Q", "2026-05-01"]] }, price: { last: 100, currency: "USD" }, evidence: { rows: [["u", "a", "t1"]] } };
  const after = { company: "AAPL", filings: { columns: ["form", "filed"], rows: [["10-K", "2026-11-03"], ["10-Q", "2026-07-31"]] }, price: { last: 101.5, currency: "USD" }, evidence: { rows: [["u", "a", "t2"]] } };
  assert.deepEqual(diff(before, after), {
    filings: { columns: ["form", "filed"], rows_added: [["10-K", "2026-11-03"]], rows_removed: [["10-Q", "2026-05-01"]] },
    price: { last: { from: 100, to: 101.5 } },
  });
  assert.equal(diff(before, { ...before, evidence: { rows: [] } }), undefined, "a new retrieval time is no change");
  assert.deepEqual(diff({ tags: ["a", "b", "b"] }, { tags: ["b", "c", "a"] }), { tags: { added: ["c"], removed: ["b"] } });
  const delta = createDelta();
  assert.match(delta.changes("t", { x: 1 }, { v: 1 }, "2026-11-04T07:00:00Z").changes, /first read/);
  assert.deepEqual(delta.changes("t", { x: 1 }, { v: 1 }, "2026-11-04T07:01:00Z"), { changes_since: "2026-11-04T07:00:00Z", unchanged: true });
  assert.deepEqual(delta.changes("t", { x: 1 }, { v: 2 }, "2026-11-04T07:02:00Z"), { changes_since: "2026-11-04T07:01:00Z", changed: { v: { from: 1, to: 2 } } });
  assert.match(delta.changes("t", { x: 2 }, { v: 2 }).changes, /first read/, "other arguments are another call");
});

test("over stdio, changes_only answers a repeat with what changed, and an unchanged repeat in a few words", async () => {
  const c = new Client({ name: "delta-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } }));
  try {
    const prices = Array.from({ length: 300 }, (_, i) => 100 * Math.exp(0.0005 * i + 0.01 * Math.sin(i)));
    const read = async (p) => JSON.parse((await c.callTool({ name: "run_tool", arguments: { name: "sharpe_ratio", arguments: { prices: p }, changes_only: true } })).content[0].text);
    const first = await read(prices);
    assert.match(first.changes, /first read/);
    const again = await read(prices);
    assert.equal(again.unchanged, true);
    assert.ok(JSON.stringify(again).length < 200, "a few words, not the whole answer again");
    assert.ok(again.ref, "the whole result is still kept under its ref");
    const other = await read(prices.map((x, i) => (i === 299 ? x * 1.5 : x)));
    assert.match(other.changes, /first read/, "different prices are a different call");
  } finally {
    await c.close();
  }
});
