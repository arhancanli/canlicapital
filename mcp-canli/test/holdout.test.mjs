// The holdout vault: years hidden from every tool for the rest of a session, under the time machine's locks,
// with results kept before it cleared; one test on them, recorded with its hashes; a second test, a later start
// and a move after the test refused; and over stdio, a tool that cannot be held to the date is off until then.
// The markets pack is on here, so the refusals are shown to come before any network.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { createVault } from "../src/holdout.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");

test("a vault starts on or before today, moves only earlier, counts what read the world before it, and is tested once", () => {
  let cleared = 0;
  const v = createVault({ onSet: () => { cleared += 1; }, now: () => "2026-11-04T08:00:00.000Z" });
  v.saw(); v.saw();
  assert.throws(() => v.check(), /No holdout is set/);
  assert.throws(() => v.set({ from: "2026-12-01" }), /on or before today/);
  const set = v.set({ from: "2024-01-01", note: "the last three years" });
  assert.deepEqual(set.holdout, { from: "2024-01-01", visible_until: "2023-12-31", set_at: "2026-11-04T08:00:00.000Z", note: "the last three years" });
  assert.equal(set.calls_before_it, 2);
  assert.match(set.caution, /2 calls read the world before the holdout was set/);
  assert.equal(cleared, 1);
  v.saw();
  assert.equal(v.status().calls_before_it, 2, "calls after it are not counted against it");
  assert.throws(() => v.set({ from: "2025-01-01" }), /never later/);
  v.set({ from: "2023-07-01" });
  assert.equal(v.until(), "2023-06-30", "earlier hides more");
  v.check();
  v.record({ tool: "sharpe_ratio", input_sha256: "a".repeat(64), output_sha256: "b".repeat(64) });
  assert.throws(() => v.check(), /tested once at 2026-11-04T08:00:00.000Z \(sharpe_ratio\)/);
  assert.throws(() => v.set({ from: "2022-01-01" }), /cannot be moved after its test/);
});

test("over stdio: a holdout hides its years from every tool, clears what was kept, and runs one recorded test", async () => {
  const c = new Client({ name: "holdout-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "" } }));
  try {
    const call = async (name, args) => { const r = await c.callTool({ name: "run_tool", arguments: { name, arguments: args } }); return { error: r.isError ? r.content[0].text : null, body: r.isError ? null : JSON.parse(r.content[0].text) }; };
    const returns = Array.from({ length: 300 }, (_, i) => 0.001 + 0.01 * Math.sin(i * 1.7));
    assert.equal((await call("holdout_status", {})).body.holdout, null);
    const kept = await call("sharpe_ratio", { returns });
    assert.ok(kept.body.ref);
    const set = await call("holdout_set", { from: "2024-01-01" });
    assert.equal(set.body.holdout.visible_until, "2023-12-31");
    assert.equal(set.body.calls_before_it, 0, "a calculation on given data reads nothing");
    assert.match((await call("show_result", { ref: kept.body.ref })).error, /not kept/, "results kept before the vault are cleared");
    assert.match((await call("latest_price", { symbol: "AAPL" })).error, /latest_price cannot be held to 2023-12-31, so it is off while the holdout from 2024-01-01 is set/);
    assert.match((await call("holdout_set", { from: "2025-01-01" })).error, /never later/);
    const first = await call("holdout_test", { name: "sharpe_ratio", arguments: { returns } });
    assert.equal(first.error, null, first.error);
    assert.equal(first.body.holdout.from, "2024-01-01");
    assert.equal(first.body.holdout.test.tool, "sharpe_ratio");
    assert.match(first.body.holdout.test.output_sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isFinite(first.body.sharpe));
    assert.match((await call("holdout_test", { name: "sharpe_ratio", arguments: { returns } })).error, /tested once/);
    assert.equal((await call("holdout_status", {})).body.test.tool, "sharpe_ratio");
    assert.match((await call("latest_price", { symbol: "AAPL" })).error, /off while the holdout/, "it stays hidden after its test");
  } finally {
    await c.close();
  }
});

test("the tools listed beside run_tool are held to a holdout too, and their results are kept", async () => {
  const c = new Client({ name: "holdout-front", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "", CANLI_FRONT: "latest_price,sharpe_ratio" } }));
  try {
    const listed = (await c.listTools()).tools.map((t) => t.name);
    assert.ok(listed.includes("latest_price") && listed.includes("sharpe_ratio"));
    const kept = await c.callTool({ name: "sharpe_ratio", arguments: { returns: Array.from({ length: 60 }, (_, i) => 0.001 * Math.sin(i)) } });
    assert.match(JSON.parse(kept.content[0].text).ref, /^r\d+$/, "a front tool's result is kept under a ref");
    await c.callTool({ name: "run_tool", arguments: { name: "holdout_set", arguments: { from: "2024-01-01" } } });
    const refused = await c.callTool({ name: "latest_price", arguments: { symbol: "AAPL" } });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /latest_price cannot be held to 2023-12-31, so it is off while the holdout from 2024-01-01 is set/);
  } finally {
    await c.close();
  }
});
