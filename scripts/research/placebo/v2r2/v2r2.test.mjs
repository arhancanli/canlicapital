// Placebo study v2, round 2: unit tests on simulated data only.
import test from "node:test";
import assert from "node:assert/strict";
import { blockOrder, partialBlockOrder } from "./blocks.mjs";
import { excessSeries, snoop } from "./snoop.mjs";
import { shapeParams, simulateGarchZero, simulateShaped } from "./sim2.mjs";
import { realTests as realTests2 } from "./tests.mjs";
import { realTests as realTests1 } from "../v2/run.mjs";
import { simulatePanel, xoshiro } from "../v2/sim.mjs";
import { volManagedRules } from "../v2/pipelines.mjs";

test("block order: a permutation of whole blocks, the first n mod b rows in place", () => {
  const next = xoshiro(5).u;
  for (const [n, b] of [[129, 12], [564, 6], [100, 3], [10, 10], [7, 1]]) {
    const o = blockOrder(n, b, next);
    assert.deepEqual([...o].sort((x, y) => x - y), Array.from({ length: n }, (_, i) => i));
    const r = n % b;
    for (let t = 0; t < r; t++) assert.equal(o[t], t);
    for (let k = r; k < n; k += b) {
      assert.equal((o[k] - r) % b, 0);
      for (let j = 1; j < b; j++) assert.equal(o[k + j], o[k] + j);
    }
  }
});

test("block order: every arrangement of three blocks turns up, about equally often", () => {
  const next = xoshiro(9).u, seen = new Map();
  for (let i = 0; i < 6000; i++) { const key = blockOrder(9, 3, next).join(","); seen.set(key, (seen.get(key) ?? 0) + 1); }
  assert.equal(seen.size, 6);
  for (const c of seen.values()) assert.ok(c > 850 && c < 1150);
});

test("partial block order keeps the rows before `from`", () => {
  const o = partialBlockOrder(50, 20, 6, xoshiro(3).u);
  for (let t = 0; t < 20; t++) assert.equal(o[t], t);
  assert.deepEqual([...o].sort((x, y) => x - y), Array.from({ length: 50 }, (_, i) => i));
});

test("hold benchmark: the excess is the rule minus the 1/N long portfolio of its universe", () => {
  const v = simulatePanel("iid_normal", 4, 80, xoshiro(1));
  const claim = { pipeline: "ts_momentum", universes: { u: [0, 1, 2] } };
  const grid = { universe: ["u"], lookback: [3], skip: [0], hold: [1] };
  const zero = excessSeries(claim, v, 10, grid, "zero")[0].d;
  const hold = excessSeries(claim, v, 10, grid, "hold")[0].d;
  for (let t = 10; t < 80; t++) assert.ok(Math.abs(zero[t - 10] - hold[t - 10] - (v.returns[0][t] + v.returns[1][t] + v.returns[2][t]) / 3) < 1e-15);
  assert.throws(() => excessSeries({ ...claim, pipeline: "cs_momentum" }, v, 10, grid, "hold"));
});

test("alpha benchmark: the mean of d is the managed return's intercept on the factor, in factor units", () => {
  const v = simulatePanel("garch_const", 2, 300, xoshiro(2));
  const claim = { pipeline: "vol_managed", columns: { f0: 0, f1: 1 } };
  const grid = { factor: ["f0", "f1"], window: [1, 3], power: [2, 1] };
  const ex = excessSeries(claim, v, 6, grid, "alpha");
  const ar = volManagedRules(v, grid, claim.columns, 6);
  ex.forEach((e, k) => {
    const mean = e.d.reduce((a, x) => a + x, 0) / e.d.length;
    // Same sign as the appraisal ratio, and the excess is uncorrelated with the factor.
    assert.equal(Math.sign(mean), Math.sign(ar[k].stat));
    const f = v.returns[0 + (e.rule.factor === "f1")].subarray(6);
    const mf = f.reduce((a, x) => a + x, 0) / f.length;
    let c = 0;
    for (let i = 0; i < f.length; i++) c += (f[i] - mf) * (e.d[i] - mean);
    assert.ok(Math.abs(c) < 1e-12);
  });
});

test("bootstrap tests run on excess series and give p-values in [0, 1]", () => {
  const v = simulateGarchZero(5, 200, xoshiro(4));
  const claim = { pipeline: "cs_momentum", universes: { u: [0, 1, 2, 3, 4] } };
  const grid = { universe: ["u"], lookback: [1, 6], skip: [0], hold: [1, 3] };
  const s = snoop(excessSeries(claim, v, 10, grid, "zero"), { block: 6, reps: 200, seed: 1 });
  for (const p of [s.rc_p, s.spa_p]) assert.ok(p >= 0 && p <= 1);
  assert.equal(typeof s.stepm_reject, "boolean");
});

test("real-shaped panels: the Cholesky factor reproduces the covariance; long panels match it", () => {
  const base = simulatePanel("iid_normal", 4, 400, xoshiro(6));
  const p = shapeParams(base);
  const k = p.k;
  for (let i = 0; i < k; i++) for (let j = 0; j <= i; j++) {
    let s = 0;
    for (let m = 0; m <= j; m++) s += p.chol[i * k + m] * p.chol[j * k + m];
    const a = base.returns[i], b = base.returns[j];
    const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
    let c = 0;
    for (let t = 0; t < a.length; t++) c += (a[t] - ma) * (b[t] - mb);
    assert.ok(Math.abs(s - c / (a.length - 1)) < 1e-12);
  }
  const long = simulateShaped(p, 60000, xoshiro(7), xoshiro(8), { kind: "trend", s: 0 }, false);
  const q = shapeParams(long);
  for (let i = 0; i < k; i++) {
    assert.ok(Math.abs(q.mu[i] - p.mu[i]) < 4 * p.sd[i] / Math.sqrt(60000) * 2);
    assert.ok(Math.abs(q.sd[i] / p.sd[i] - 1) < 0.05);
  }
});

test("round 2 builds the same real-data tests as round 1 (synthetic registration and files)", () => {
  // A small registration over a simulated 'file' in French block form.
  const sim = simulatePanel("garch_const", 4, 240, xoshiro(11));
  const dates = Array.from({ length: 240 }, (_, t) => (2000 + Math.floor(t / 12)) * 100 + (t % 12) + 1);
  const blocks = { f: { columns: ["a", "b", "c", "d"], dates, rows: dates.map((_, t) => sim.returns.map((c) => c[t])) } };
  const series = Object.fromEntries(["a", "b", "c", "d"].map((c) => [c, { file: "f", column: c }]));
  const pre = {
    data: { last_month: 201912 }, series, tests: { ids: ["in_sample_search", "oos_published", "oos_selected", "oos_search", "full_search"] },
    claims: { x: { pipeline: "cs_momentum", series: ["a", "b", "c", "d"], universes: { u: ["a", "b", "c", "d"] }, grid: { universe: ["u"], lookback: [1, 3], skip: [0], hold: [1, 2] }, published: { universe: "u", lookback: 3, skip: 0, hold: 1 }, sample_start: 200001, sample_end: 201212 } },
  };
  const a = realTests1(pre, blocks), b = realTests2(pre, blocks);
  assert.equal(a.length, b.length);
  a.forEach((t, i) => {
    for (const key of ["claim", "id", "from", "permuteFrom", "aggregate", "index"]) assert.deepEqual(b[i][key], t[key]);
    assert.deepEqual(b[i].grid, t.grid);
    assert.deepEqual(b[i].picked, t.picked);
    assert.deepEqual(b[i].view.returns, t.view.returns);
  });
});

test("real-shaped panels copy a series that is identical to an earlier one", () => {
  const base = simulatePanel("iid_normal", 3, 300, xoshiro(21));
  const view = { returns: [base.returns[0], base.returns[1], base.returns[0], base.returns[2]], variance: [null, null, null, null] };
  const p = shapeParams(view);
  assert.equal(p.k, 3);
  assert.deepEqual(p.map, [0, 1, 0, 2]);
  const sim = simulateShaped(p, 50, xoshiro(1), xoshiro(2), { kind: "trend", s: 0.1 }, false);
  assert.equal(sim.returns.length, 4);
  assert.deepEqual(sim.returns[2], sim.returns[0]);
  assert.notDeepEqual(sim.returns[1], sim.returns[0]);
});
