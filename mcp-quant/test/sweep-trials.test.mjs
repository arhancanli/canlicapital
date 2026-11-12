// Every variant a sweep tried goes back with the periods it was measured on, so a server that counts a
// session's trials can count each one; and a parameter sweep gives the probability of backtest overfitting
// over its variants, which is near zero when one variant is better throughout and high when the winner of
// one half loses the other. Each variant's returns go, under a symbol key that JSON leaves out, to a server that
// runs the package in its own process, best first as the Sharpes are.
import assert from "node:assert/strict";
import test from "node:test";

import { defaultSplits, pbo, TRIAL_RETURNS } from "../src/cscv.mjs";
import { mulberry32 } from "../src/math.mjs";
import { runTool } from "../src/registry.mjs";
import { statsOf } from "../src/tools/strategies.mjs";

const prices = Array.from({ length: 700 }, (_, i) => 100 * Math.exp(0.0004 * i + 0.05 * Math.sin(i / 17) + 0.02 * Math.sin(i / 5.3)));

test("a sweep returns every variant's Sharpe, best first and in the table's order, with the periods behind them", () => {
  const grid = { fast: [5, 10, 15, 20, 25, 30, 35, 40], slow: [60, 80, 100, 120, 140, 160, 180] };
  const s = runTool("strategy_sweep", { recipe: "ma_crossover", arguments: { prices }, grid });
  assert.equal(s.combinations, 56);
  assert.equal(s.rows.length, 50, "the table shows fifty");
  assert.equal(s.every_trial.sharpes.length, 56, "every variant is there to count");
  assert.deepEqual(s.every_trial.sharpes.slice(0, 50), s.rows.map((r) => r[1]));
  assert.ok(s.every_trial.sharpes.every((x, i, a) => i === 0 || a[i - 1] >= x), "best first");
  assert.equal(s.every_trial.periods, prices.length - 1);
  assert.equal(s.every_trial.periods_per_year, 252);
  assert.equal(s.deflation.trials, 56);
  const cv = s.probability_of_backtest_overfitting;
  assert.equal(cv.splits, defaultSplits(prices.length - 1));
  assert.equal(cv.combinations, 12870, "16 choose 8");
  assert.ok(cv.probability >= 0 && cv.probability <= 1);
});

test("a sweep too short to split, or of one variant, gives no probability of overfitting", () => {
  assert.equal(runTool("strategy_sweep", { recipe: "ma_crossover", arguments: { prices }, grid: { fast: [10], slow: [60] } }).probability_of_backtest_overfitting, null);
  const short = prices.slice(0, 35);
  assert.equal(runTool("strategy_sweep", { recipe: "ma_crossover", arguments: { prices: short }, grid: { fast: [2, 3], slow: [10] } }).probability_of_backtest_overfitting, null);
});

test("the probability of overfitting is zero when one variant wins throughout, and high when each half's winner loses the other", () => {
  const rnd = mulberry32(11);
  const noise = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd()) * 0.01;
  const n = 640, K = 12;
  const series = (drift) => Array.from({ length: n }, (_, t) => drift(t) + noise());
  const steady = [series(() => 0.004), ...Array.from({ length: K - 1 }, () => series(() => 0))];
  assert.equal(pbo(steady, 16).probability, 0);
  // Two variants that each win one half of the sample and lose the other, among noise.
  const flip = [series((t) => (t < n / 2 ? 0.006 : -0.006)), series((t) => (t < n / 2 ? -0.006 : 0.006)), ...Array.from({ length: K - 2 }, () => series(() => 0))];
  assert.ok(pbo(flip, 16).probability > 0.5, `${pbo(flip, 16).probability}`);
});

test("a tournament returns every sleeve's Sharpe on its common window, best first", () => {
  const rnd = mulberry32(5);
  const P = [[100, 100, 100]];
  for (let t = 1; t < 700; t++) P.push(P[t - 1].map((p, j) => p * (1 + 0.0003 * (j + 1) + (rnd() - 0.5) * 0.02)));
  const r = runTool("sleeve_tournament", { prices: P, families: ["time_series_momentum", "risk_parity"], reps: 100, splits: 8 });
  assert.equal(r.every_trial.sharpes.length, r.sleeves_run);
  assert.equal(r.every_trial.periods, r.evaluation.periods);
  assert.deepEqual(r.every_trial.sharpes.slice(0, r.leaderboard.length), r.leaderboard.map((x) => x[2]));
  assert.ok(r.every_trial.sharpes.every((x, i, a) => i === 0 || a[i - 1] >= x));
  const R = r[TRIAL_RETURNS];
  assert.equal(R.length, r.sleeves_run, "every sleeve's returns");
  assert.ok(R.every((x) => x.length === r.evaluation.periods), "on the common window");
  R.forEach((x, i) => assert.ok(Math.abs(statsOf(x, 252).sharpe - r.every_trial.sharpes[i]) < 1e-8, `sleeve ${i + 1} in every_trial's order`));
  assert.ok(Math.abs(pbo(R, 8).probability - r.multiple_testing.pbo.probability) < 1e-9, "the returns the tournament measured");
});

test("each variant's returns go back best first under a key JSON leaves out, and one backtest's own returns too", () => {
  const s = runTool("strategy_sweep", { recipe: "ma_crossover", arguments: { prices }, grid: { fast: [5, 10, 20], slow: [60, 120] } });
  const R = s[TRIAL_RETURNS];
  assert.equal(R.length, 6);
  assert.ok(R.every((x) => x.length === s.every_trial.periods), "each over the whole sample");
  R.forEach((x, i) => assert.ok(Math.abs(statsOf(x, 252).sharpe - s.every_trial.sharpes[i]) < 1e-8, `variant ${i + 1} in every_trial's order`));
  assert.ok(Math.abs(pbo(R, defaultSplits(R[0].length)).probability - s.probability_of_backtest_overfitting.probability) < 1e-9, "the returns the sweep measured");
  assert.equal(JSON.stringify(s), JSON.stringify(Object.fromEntries(Object.entries(s))), "a client reading JSON never gets them");
  const one = runTool("backtest_ma_crossover", { prices, fast: 10, slow: 60 });
  assert.equal(one[TRIAL_RETURNS].length, 1);
  assert.equal(one[TRIAL_RETURNS][0].length, prices.length - 1);
  assert.ok(Math.abs(statsOf(one[TRIAL_RETURNS][0], 252).sharpe - one.sharpe) < 1e-8);
  assert.equal("_net" in one, false);
});
