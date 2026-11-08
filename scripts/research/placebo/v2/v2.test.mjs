// Placebo study v2: the pipelines use no future rows, the parser reads French blocks, and a
// permutation leaves what it should unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { expand, legSize, momentumRules, volManagedRules, warmup } from "./pipelines.mjs";
import { firstBlock, panel } from "./data.mjs";
import { holm } from "./evaluate.mjs";
import { simulatePanel, xoshiro } from "./sim.mjs";

const grid = { universe: ["a", "b"], lookback: [1, 3, 12], skip: [0, 1], hold: [1, 3] };
const universes = { a: [0, 1, 2], b: [0, 1, 2, 3] };
const vgrid = { factor: ["f0", "f1"], window: [1, 3], power: [2, 1] };

function panelOf(seed, months = 120) {
  return simulatePanel("garch_const", 4, months, xoshiro(seed));
}

for (const kind of ["ts", "cs"]) {
  test(`${kind} momentum: changing row t moves no strategy return before t`, () => {
    const v = panelOf(1);
    const from = warmup("momentum", grid);
    const before = momentumRules(kind, v, grid, universes, from, { keepSeries: true });
    const t = 80;
    const changed = { returns: v.returns.map((c) => Float64Array.from(c)), variance: v.variance };
    for (const c of changed.returns) c[t] += 0.5;
    const after = momentumRules(kind, changed, grid, universes, from, { keepSeries: true });
    before.forEach((r, k) => {
      for (let i = 0; i <= t - from - 1; i++) assert.equal(after[k].series[i], r.series[i]);
    });
  });
}

test("vol managed: a month's own variance never sets that month's weight", () => {
  const v = panelOf(2);
  const factors = { f0: 0, f1: 1 };
  const from = warmup("vol_managed", vgrid);
  // Score rows up to and including t; change only row t's variance: nothing may move.
  const t = 90;
  const head = (p) => ({ returns: p.returns.map((c) => c.subarray(0, t + 1)), variance: p.variance.map((c) => c.subarray(0, t + 1)) });
  const changed = { returns: v.returns, variance: v.variance.map((c) => Float64Array.from(c)) };
  changed.variance[0][t] *= 9; changed.variance[1][t] /= 9;
  assert.deepEqual(volManagedRules(head(v), vgrid, factors, from), volManagedRules(head(changed), vgrid, factors, from));
  // And a change in the variance of row t - 1 does move row t's weight.
  const earlier = { returns: v.returns, variance: v.variance.map((c) => Float64Array.from(c)) };
  earlier.variance[0][t - 1] *= 9;
  assert.notDeepEqual(volManagedRules(head(v), vgrid, factors, from), volManagedRules(head(earlier), vgrid, factors, from));
});

test("cross-sectional legs follow the rank order, ties in universe order", () => {
  // Four assets, lookback 1: past returns 0.02, 0.02, -0.01, 0.03 -> ranked 3, 0, 1, 2; legs of 2.
  const r = [[0.02, 0], [0.02, 0], [-0.01, 0], [0.03, 0]].map((x) => Float64Array.from(x));
  const one = { universe: ["u"], lookback: [1], skip: [0], hold: [1] };
  const legs = (rets) => momentumRules("cs", { returns: rets.map((x) => Float64Array.from(x)), variance: [] }, one, { u: [0, 1, 2, 3] }, 1, { keepSeries: true })[0].series[0];
  // Month 1 returns pick out each asset's weight: long 3 and 0, short 1 and 2.
  const w = [0, 1, 2, 3].map((i) => legs(r.map((x, j) => [x[0], j === i ? 1 : 0])));
  assert.deepEqual(w, [0.5, -0.5, -0.5, 0.5]);
});

test("cross-sectional legs: half and third of the universe", () => {
  assert.equal(legSize("half", 7), 3);
  assert.equal(legSize("half", 8), 4);
  assert.equal(legSize("third", 12), 4);
  assert.equal(legSize("third", 30), 10);
});

test("a time-series rule on one constant-sign series earns its static Sharpe", () => {
  // With every past return positive, the rule is always long: its Sharpe is the series' own.
  const r = Float64Array.from({ length: 60 }, (_, t) => 0.01 + 0.001 * (t % 5));
  const out = momentumRules("ts", { returns: [r], variance: [null] }, { universe: ["u"], lookback: [1], skip: [0], hold: [1] }, { u: [0] }, 1);
  const s = r.subarray(1);
  const mean = s.reduce((a, x) => a + x, 0) / s.length;
  const sd = Math.sqrt(s.reduce((a, x) => a + x * x, 0) / s.length - mean * mean);
  assert.ok(Math.abs(out[0].stat - (mean / sd) * Math.sqrt(12)) < 1e-9);
});

test("expand lists every rule in key order", () => {
  assert.equal(expand(grid).length, 2 * 3 * 2 * 2);
  assert.deepEqual(expand({ a: [1, 2], b: ["x"] }), [{ a: 1, b: "x" }, { a: 2, b: "x" }]);
});

test("firstBlock reads the first date block and stops at the next", () => {
  const text = "note\n\n,A,B\n196307,  1.00, -2.00\n196308, 0.50, 0.25\n\n Annual\n,A,B\n1963, 3, 4\n";
  const b = firstBlock(text);
  assert.deepEqual(b.columns, ["A", "B"]);
  assert.deepEqual(b.dates, [196307, 196308]);
  assert.deepEqual(b.rows, [[0.01, -0.02], [0.005, 0.0025]]);
  assert.throws(() => firstBlock(",A\n196307, -99.99\n"));
});

test("realized variance is demeaned within the month", () => {
  const monthly = firstBlock(",F\n196307, 1.00\n");
  const daily = firstBlock(",F\n19630701, 1.00\n19630702, 3.00\n");
  const p = panel({ m: monthly, d: daily }, [{ name: "F", file: "m", column: "F", daily: { file: "d", column: "F" } }], 196307, 196307);
  assert.ok(Math.abs(p.variance[0][0] - 2 * 0.01 ** 2) < 1e-15);
});

test("Holm adjusts step-down and keeps input order", () => {
  assert.deepEqual(holm([0.01, 0.04, 0.03]).map((x) => Number(x.toFixed(6))), [0.03, 0.06, 0.06]);
});
