import assert from "node:assert/strict";
import test from "node:test";
import { performance as perf } from "node:perf_hooks";
const performance_now = () => perf.now();

import { calculateDsr } from "./dsr-core.js";
import { perPeriodMoments } from "./moments-core.js";
import { BACKTEST_LIMITS, cscvSplits, expandGrid, fastCscv, performance, positionsFor, runBacktest, simulate } from "./backtest-core.js";
import { pboCscv } from "./pbo-core.js";
import { makeRandom } from "./selection-risk-core.js";

// A seeded random walk with drift, long enough for every family's warm-up.
function walk(n, seed = 7, drift = 0.0004, vol = 0.012) {
  const next = makeRandom(seed);
  const prices = [100];
  for (let i = 1; i < n; i += 1) {
    const u = Math.max(1e-12, next());
    const v = next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    prices.push(prices.at(-1) * Math.exp(drift + vol * z));
  }
  return prices;
}

test("buy and hold earns exactly the close-to-close returns, less one entry cost", () => {
  const prices = [100, 101, 99, 102, 102, 105];
  const sim = simulate(prices, positionsFor("buy_and_hold", {}, prices), { costBps: 10 });
  const expected = prices.slice(1).map((p, i) => p / prices[i] - 1);
  expected[0] -= 0.001;
  sim.returns.forEach((r, i) => assert.ok(Math.abs(r - expected[i]) < 1e-15, `period ${i}`));
  assert.equal(sim.trades, 1);
  assert.equal(sim.turnover, 1);
});

test("no family looks ahead: changing future prices never changes an earlier position", () => {
  const prices = walk(600);
  const families = [
    ["sma_cross", { fast: 10, slow: 40 }],
    ["momentum", { lookback: 60, skip: 5 }],
    ["mean_reversion", { window: 20, entry_z: 1.5 }],
    ["breakout", { lookback: 30 }],
  ];
  for (const [family, params] of families) {
    for (const allowShort of [false, true]) {
      const base = positionsFor(family, params, prices, { allowShort });
      for (const cut of [100, 250, 480]) {
        const altered = prices.map((p, i) => (i > cut ? p * (i % 2 ? 1.7 : 0.4) : p));
        const changed = positionsFor(family, params, altered, { allowShort });
        for (let t = 0; t <= cut; t += 1) assert.equal(changed[t], base[t], `${family} short=${allowShort} t=${t} cut=${cut}`);
      }
    }
  }
});

test("each family follows its stated rule on a hand-checked case", () => {
  const prices = [10, 11, 12, 13, 14, 13, 12, 11, 10, 9];
  const sma = positionsFor("sma_cross", { fast: 2, slow: 4 }, prices, { allowShort: true });
  // t=3: fast (12+13)/2=12.5 > slow 11.5 -> long; t=7: fast 11.5 < slow 12.5 -> short.
  assert.equal(sma[3], 1);
  assert.equal(sma[7], -1);
  const mom = positionsFor("momentum", { lookback: 3, skip: 0 }, prices);
  assert.equal(mom[3], 1); // 13/10 - 1 > 0
  assert.equal(mom[8], 0); // 10/13 - 1 < 0, long-only stands aside
  const brk = positionsFor("breakout", { lookback: 3 }, prices, { allowShort: true });
  assert.equal(brk[3], 1); // 13 > max(10, 11, 12)
  assert.equal(brk[6], -1); // 12 < min(13, 14, 13)
});

test("costs are charged on every unit of turnover, including a flip from long to short", () => {
  const prices = [100, 100, 100, 100];
  const pos = Int8Array.from([1, -1, -1, 0]);
  const sim = simulate(prices, pos, { costBps: 25 });
  assert.deepEqual(Array.from(sim.returns), [-0.0025, -0.005, 0]);
  assert.equal(sim.turnover, 3);
  assert.equal(sim.trades, 2);
});

test("the grid expands to every valid combination and refuses unknown or oversized grids", () => {
  const { variants, rejected } = expandGrid("sma_cross", { fast: [5, 20, 50], slow: [20, 50, 100] });
  assert.equal(variants.length, 6); // fast < slow only
  assert.equal(rejected, 3);
  assert.throws(() => expandGrid("sma_cross", { fast: [5], slow: [20], period: [3] }), /has no parameter period/);
  assert.throws(() => expandGrid("nope", {}), /Unknown strategy family/);
  const big = Array.from({ length: 15 }, (_, i) => i + 1);
  assert.throws(() => expandGrid("momentum", { lookback: big, skip: big }), new RegExp(`at most ${BACKTEST_LIMITS.max_variants}`));
});

test("validation counts every variant the call ran, with their measured Sharpe dispersion", () => {
  const prices = walk(1500, 11);
  const out = runBacktest({ prices, family: "sma_cross", grid: { fast: [5, 10, 20], slow: [50, 100, 200] }, cost_bps: 5 });
  assert.equal(out.variants.count, 9);
  assert.equal(out.validation.trials_counted, 9);
  // Recompute the deflated Sharpe from the selected variant's own returns and the nine Sharpes.
  const start = out.window.warmup_periods;
  const sharpes = [];
  let best = null;
  for (const params of expandGrid("sma_cross", { fast: [5, 10, 20], slow: [50, 100, 200] }).variants) {
    const sim = simulate(prices, positionsFor("sma_cross", params, prices), { start, costBps: 5 });
    const s = performance(sim.returns, 252, sim).sharpe;
    sharpes.push(s);
    if (JSON.stringify(params) === JSON.stringify(out.selected.params)) best = sim.returns;
  }
  const m = perPeriodMoments(Array.from(best));
  const mean = sharpes.reduce((a, b) => a + b, 0) / sharpes.length;
  const sd = Math.sqrt(sharpes.reduce((a, b) => a + (b - mean) ** 2, 0) / (sharpes.length - 1));
  const dsr = calculateDsr({ observed_sharpe_annualized: m.sharpe_per_period * Math.sqrt(252), observations: m.observations, periods_per_year: 252, skew: m.skew, non_excess_kurtosis: m.non_excess_kurtosis, effective_independent_trials: 9, cross_trial_sharpe_sd_annualized: sd });
  assert.equal(out.validation.deflated_sharpe.probability, Number(dsr.deflated_sharpe_ratio.toFixed(4)));
  assert.ok(out.validation.overfitting.probability >= 0 && out.validation.overfitting.probability <= 1);
  assert.equal(out.validation.overfitting.splits, 16);
  assert.match(out.plain_reading, /^Best of 9 sma_cross variants/);
  assert.match(out.plain_reading, /None of this is a forecast\.$/);
});

test("the selected variant is the highest Sharpe, and the table is sorted and capped", () => {
  const out = runBacktest({ prices: walk(900, 3), family: "momentum", grid: { lookback: [5, 10, 20, 40, 60, 120], skip: [0, 5] } });
  const sharpeAt = out.variants.columns.indexOf("sharpe");
  const shown = out.variants.top.map((row) => row[sharpeAt]);
  assert.equal(shown.length, BACKTEST_LIMITS.top_variants_shown);
  assert.deepEqual(shown, [...shown].sort((a, b) => b - a));
  assert.equal(out.selected.metrics.sharpe, shown[0]);
});

test("a single variant reports its probabilistic Sharpe and says why there is no deflation", () => {
  const out = runBacktest({ prices: walk(400, 5), family: "buy_and_hold" });
  assert.equal(out.variants.count, 1);
  assert.ok(out.validation.probabilistic_sharpe_vs_zero > 0 && out.validation.probabilistic_sharpe_vs_zero < 1);
  assert.match(out.validation.deflated_sharpe.not_run, /One variant was run/);
  assert.equal(out.validation.overfitting, undefined);
});

test("bad input is refused by position with what to send instead", () => {
  assert.throws(() => runBacktest({ prices: [100, 101, -1, 102], family: "buy_and_hold" }), /prices\[2\] is -1; prices must be positive/);
  assert.throws(() => runBacktest({ prices: walk(60), family: "sma_cross", grid: { fast: [10], slow: [50] } }), /Only 10 returns are left after the longest warm-up \(49 periods\)/);
  assert.throws(() => runBacktest({ prices: walk(300), family: "sma_cross", grid: { fast: [10] } }), /sma_cross needs slow/);
});

test("CSCV block count is the largest even number up to 16 with blocks of at least 4", () => {
  assert.equal(cscvSplits(1000), 16);
  assert.equal(cscvSplits(40), 10);
  assert.equal(cscvSplits(30), 6);
  assert.equal(cscvSplits(7), 0);
});

test("a run is deterministic: the same inputs give byte-identical output", () => {
  const args = { prices: walk(800, 21), family: "mean_reversion", grid: { window: [10, 20, 40], entry_z: [1, 1.5, 2] }, allow_short: true };
  assert.equal(JSON.stringify(runBacktest(args)), JSON.stringify(runBacktest(args)));
});

test("the fast CSCV returns exactly the shared validator's exhaustive probability", () => {
  const next = makeRandom(99);
  for (const [rows, configs, splits] of [[64, 6, 8], [300, 12, 12], [1200, 25, 16], [97, 4, 10]]) {
    // Variants with a common factor, some duplicated and one constant, to exercise ties and zero variance.
    const common = Array.from({ length: rows }, () => (next() - 0.5) / 50);
    const columns = Array.from({ length: configs }, (_, j) => Float64Array.from(common, (c) => (j === 1 ? 0 : c * (0.5 + (j % 3)) + (next() - 0.5) / 100)));
    columns[configs - 1] = Float64Array.from(columns[2]);
    const matrix = Array.from({ length: rows }, (_, t) => columns.map((col) => col[t]));
    const shared = pboCscv(matrix, { nSplits: splits, maxCombinations: 20000 });
    const fast = fastCscv(columns, splits);
    assert.equal(shared.exhaustive, true);
    assert.equal(fast.n_combinations, shared.n_combinations, `${rows}x${configs}/${splits}`);
    assert.equal(fast.pbo, shared.pbo, `${rows}x${configs}/${splits}`);
  }
});

test("the worst case (20,000 prices, 200 variants) finishes well inside the hosted endpoint's 10 seconds", () => {
  const prices = walk(20000, 17);
  const started = performance_now();
  const out = runBacktest({ prices, family: "momentum", grid: { lookback: Array.from({ length: 20 }, (_, i) => 10 + i * 10), skip: [0, 1, 2, 3, 4, 5, 10, 15, 20, 25] } });
  const seconds = (performance_now() - started) / 1000;
  assert.equal(out.variants.count, 200);
  assert.equal(out.validation.overfitting.combinations, 12870);
  assert.ok(seconds < 5, `${seconds.toFixed(2)} s`);
});
