// breadth_sweep: the grid's combinations, the luck benchmark, a parallel run, and shards that merge
// back into the same result while a shard of other data, a gap or a duplicate is refused.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { breadthSweep, combinations, expectedMaxSharpe } from "../src/sweep.mjs";

function panel(path, seed0 = 7) {
  let seed = seed0; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const tick = Array.from({ length: 40 }, (_, i) => `T${i}`), px = tick.map(() => 50), lines = [`date,${tick.join(",")}`];
  let d = Date.parse("2022-01-03");
  for (let i = 0; i < 700; i++) {
    while ([0, 6].includes(new Date(d).getUTCDay())) d += 86400000;
    lines.push(`${new Date(d).toISOString().slice(0, 10)},${px.map((p, j) => (px[j] = p * (1 + (rnd() - 0.5) * 0.04)).toFixed(4)).join(",")}`);
    d += 86400000;
  }
  writeFileSync(path, lines.join("\n"));
}

test("every combination of the grid, numbered", () => {
  const c = combinations({ smoothing: [2, 4], cost_bps: [5, 10, 20] });
  assert.equal(c.length, 6);
  assert.deepEqual(c[0], { k: 0, smoothing: 2, cost_bps: 5 });
  assert.deepEqual(combinations(), [{ k: 0 }]);
});

test("the best of many trials is expected to look good by luck", () => {
  assert.equal(expectedMaxSharpe([1]), null);
  const few = expectedMaxSharpe([0.1, -0.1, 0.2, -0.2]), many = expectedMaxSharpe(Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.2 : -0.2)));
  assert.ok(many > few && few > 0, "more trials, higher luck bar");
});

test("a parallel sweep, and its shards merged, give the same ranking; mismatched shards are refused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "canli-sweep-"));
  try {
    const prices = join(dir, "p.csv"), other = join(dir, "q.csv");
    panel(prices); panel(other, 99);
    const args = { prices_file: prices, grid: { smoothing: [2, 6], cost_bps: [5, 20] }, split_date: "2023-12-29", workers: 2 };
    const full = await breadthSweep({}, args);
    assert.equal(full.trials, 4);
    assert.ok(full.luck.expected_best_sharpe_by_luck > 0);
    const s0 = await breadthSweep({}, { ...args, shard: { index: 0, of: 2 }, out_file: join(dir, "s0.json") });
    const s1 = await breadthSweep({}, { ...args, shard: { index: 1, of: 2 }, out_file: join(dir, "s1.json") });
    assert.equal(s0.ran + s1.ran, 4);
    const merged = await breadthSweep({}, { merge_files: [join(dir, "s0.json"), join(dir, "s1.json")] });
    assert.deepEqual(merged.rows, full.rows, "the shards add up to the full sweep");
    await assert.rejects(breadthSweep({}, { merge_files: [join(dir, "s0.json"), join(dir, "s0.json")] }), /appears in two shards/);
    await breadthSweep({}, { ...args, prices_file: other, shard: { index: 1, of: 2 }, out_file: join(dir, "x1.json") });
    await assert.rejects(breadthSweep({}, { merge_files: [join(dir, "s0.json"), join(dir, "x1.json")] }), /not a shard of the same sweep/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
