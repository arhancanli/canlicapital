// breadth_sweep: the grid's combinations, the luck benchmark, every variant's Sharpe for a server that counts each
// try, a parallel run, and shards that list their own variants as they run and merge back into the same result while
// a shard of other data, a gap or a duplicate is refused; each variant's daily book returns handed over beside the
// answer, never in it or in a file.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runBreadth } from "../src/breadth.mjs";
import { breadthSweep, combinations, expectedMaxSharpe, loadInputs, summarize, TRIAL_DATES, TRIAL_RETURNS } from "../src/sweep.mjs";

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

test("every variant's Sharpe goes back best first with the days behind it, in the table's order", () => {
  const combos = combinations({ smoothing: [2, 4, 8] }), stat = (sharpe, days) => ({ days, sharpe });
  const whole = summarize([{ k: 0, ok: true, all: stat(0.4, 500) }, { k: 1, ok: true, all: stat(1.1, 500) }, { k: 2, ok: false, error: "too few names" }], combos, null);
  assert.deepEqual(whole.every_trial, { periods: 500, periods_per_year: 252, k: [1, 0], sharpes: [1.1, 0.4] }, "a failed variant is no try");
  assert.deepEqual(whole.rows.slice(0, 2).map((r) => [r[0], r[8]]), [[1, 1.1], [0, 0.4]], "in the table's order, each with its k");
  // With split_date, the Sharpe the settings were chosen on and its days; one number of days per variant where they differ.
  const split = summarize([0.4, 1.1, -0.2].map((x, k) => ({ k, ok: true, all: stat(9, 700), search: stat(x, [480, 450, 470][k]), test: stat(0, 200) })), combos, "2023-12-29");
  assert.deepEqual(split.every_trial, { periods: [450, 480, 470], periods_per_year: 252, k: [1, 0, 2], sharpes: [1.1, 0.4, -0.2] });
  assert.deepEqual(summarize([{ k: 0, ok: false, error: "x" }], [{ k: 0 }], null).every_trial, { periods: [], periods_per_year: 252, k: [], sharpes: [] });
});

test("a parallel sweep, and its shards merged, give the same ranking; each shard lists its own variants; mismatched shards are refused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "canli-sweep-"));
  try {
    const prices = join(dir, "p.csv"), other = join(dir, "q.csv");
    panel(prices); panel(other, 99);
    const args = { prices_file: prices, grid: { smoothing: [2, 6], cost_bps: [5, 20] }, split_date: "2023-12-29", workers: 2 };
    const full = await breadthSweep({}, args);
    assert.equal(full.trials, 4);
    assert.ok(full.luck.expected_best_sharpe_by_luck > 0);
    assert.deepEqual(full.every_trial.sharpes, full.rows.map((r) => r[8]), "every variant, best first");
    assert.deepEqual(full.every_trial.k, full.rows.map((r) => r[0]));
    assert.ok(Number.isInteger(full.every_trial.periods) && full.every_trial.periods >= 60, "the days before the split");
    // Each variant's daily book returns beside the answer, in every_trial's order: its own book over every date of the
    // file as its settings give it, a flat day as 0.
    const handed = full[TRIAL_RETURNS], base = loadInputs({ prices_file: prices }), combos = combinations(args.grid);
    assert.equal(handed.length, full.every_trial.k.length);
    for (const [i, k] of full.every_trial.k.entries()) {
      const book = runBreadth({ ...base, smoothing: combos[k].smoothing, costBps: combos[k].cost_bps, splitDate: args.split_date }).series.book;
      assert.deepEqual(handed[i], Float64Array.from(book, (v) => (Number.isNaN(v) ? 0 : v)), `variant ${k}`);
    }
    assert.ok(handed.every((x) => x.length === 700 && x.every(Number.isFinite) && x.some((v) => v !== 0)), "every date of the file");
    assert.deepEqual(full[TRIAL_DATES], base.dates, "each day's date, the file's own");
    assert.ok(!JSON.stringify(full).includes(base.dates[350]), "and JSON leaves them out");
    const s0 = await breadthSweep({}, { ...args, shard: { index: 0, of: 2 }, out_file: join(dir, "s0.json") });
    const s1 = await breadthSweep({}, { ...args, shard: { index: 1, of: 2 }, out_file: join(dir, "s1.json") });
    assert.equal(s0.ran + s1.ran, 4);
    // Each shard lists its own variants as the whole sweep does, written to a file or not, so they are counted as they run.
    const inline = await breadthSweep({}, { ...args, shard: { index: 1, of: 2 } });
    assert.ok(Array.isArray(inline.results) && !s1.results, "the results themselves only when not written to a file");
    assert.deepEqual(inline.every_trial, s1.every_trial);
    const sharpeOf = new Map(full.every_trial.k.map((k, i) => [k, full.every_trial.sharpes[i]]));
    for (const [s, index] of [[s0, 0], [s1, 1]]) {
      assert.equal(s.sweep_id, full.sweep_id);
      assert.ok(s.every_trial.k.length === 2 && s.every_trial.k.every((k) => k % 2 === index), "only the shard's combinations");
      assert.deepEqual(s.every_trial.sharpes, s.every_trial.k.map((k) => sharpeOf.get(k)), "with the whole sweep's Sharpes");
      assert.deepEqual(s.every_trial.sharpes, [...s.every_trial.sharpes].sort((x, y) => y - x), "best first");
      assert.equal(s.every_trial.periods, full.every_trial.periods);
    }
    // A shard hands over its own variants' returns, the whole sweep's; neither its results nor its file carry them.
    const at = new Map(full.every_trial.k.map((k, i) => [k, handed[i]]));
    for (const s of [s0, s1, inline]) assert.deepEqual(s[TRIAL_RETURNS], s.every_trial.k.map((k) => at.get(k)));
    assert.ok(inline.results.every((r) => !("daily" in r)), "not in the answer's results");
    assert.ok(JSON.parse(readFileSync(join(dir, "s0.json"), "utf8")).results.every((r) => !("daily" in r)), "nor in the shard file");
    const merged = await breadthSweep({}, { merge_files: [join(dir, "s0.json"), join(dir, "s1.json")] });
    assert.deepEqual(merged.rows, full.rows, "the shards add up to the full sweep");
    assert.deepEqual(merged.every_trial, full.every_trial);
    assert.equal(merged[TRIAL_RETURNS], undefined, "a merge has none: a session pools each shard's as it runs");
    assert.equal(merged[TRIAL_DATES], undefined);
    assert.deepEqual(s0[TRIAL_DATES], base.dates);
    await assert.rejects(breadthSweep({}, { merge_files: [join(dir, "s0.json"), join(dir, "s0.json")] }), /appears in two shards/);
    await breadthSweep({}, { ...args, prices_file: other, shard: { index: 1, of: 2 }, out_file: join(dir, "x1.json") });
    await assert.rejects(breadthSweep({}, { merge_files: [join(dir, "s0.json"), join(dir, "x1.json")] }), /not a shard of the same sweep/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
