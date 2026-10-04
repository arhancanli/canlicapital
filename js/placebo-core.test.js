import assert from "node:assert/strict";
import test from "node:test";

import { makeRandom } from "./selection-risk-core.js";
import { PLACEBO_LIMITS, checkPanel, placeboOrder, placeboPValue, placeboPanel, placeboPanels } from "./placebo-core.js";

const walk = (n, seed, drift = 0.0003) => {
  const next = makeRandom(seed);
  const out = [100];
  for (let t = 1; t < n; t++) out.push(out[t - 1] * (1 + drift + 0.01 * (next() - 0.5) * 3.4));
  return out;
};
const isPermutation = (order, n) => order.length === n && new Set(order).size === n && [...order].every((i) => i >= 0 && i < n);

test("permute and block_permute reorder every period exactly once; the bootstrap stays in range", () => {
  const next = makeRandom(5);
  assert.ok(isPermutation(placeboOrder(500, { method: "permute", next }), 500));
  const blocks = placeboOrder(500, { method: "block_permute", block: 7, next });
  assert.ok(isPermutation(blocks, 500));
  // Inside a block the real order survives: a period's successor is the next real period, except at block ends.
  let breaks = 0;
  for (let t = 1; t < 500; t++) if (blocks[t] !== blocks[t - 1] + 1) breaks++;
  assert.ok(breaks <= Math.ceil(500 / 7) - 1, `${breaks} breaks for ${Math.ceil(500 / 7)} blocks`);
  const boot = placeboOrder(500, { method: "stationary_bootstrap", block: 7, next });
  assert.ok(boot.every((i) => i >= 0 && i < 500));
  assert.throws(() => placeboOrder(10, { method: "shuffle", next }), /method must be one of/);
});

test("a price placebo keeps the first and last prices, every return, and every period's cross-section", () => {
  const a = walk(300, 1), b = walk(300, 2, -0.0002);
  const order = placeboOrder(299, { method: "permute", next: makeRandom(9) });
  const [pa, pb] = placeboPanel([a, b], { kind: "prices", order });
  assert.equal(pa[0], a[0]);
  assert.ok(Math.abs(pa[299] / a[299] - 1) < 1e-12, "a permutation ends at the real last price");
  const returns = (xs) => xs.slice(1).map((x, t) => x / xs[t] - 1);
  const sorted = (xs) => [...xs].sort((x, y) => x - y);
  sorted(returns(pa)).forEach((r, t) => assert.ok(Math.abs(r - sorted(returns(a))[t]) < 1e-12));
  // Period t of the placebo is real period order[t] in every column at once.
  const ra = returns(a), rb = returns(b), qa = returns(pa), qb = returns(pb);
  for (let t = 0; t < 299; t++) {
    assert.ok(Math.abs(qa[t] - ra[order[t]]) < 1e-12 && Math.abs(qb[t] - rb[order[t]]) < 1e-12);
  }
  const [ret] = placeboPanel([ra], { kind: "returns", order });
  assert.deepEqual(ret, Array.from(order, (i) => ra[i]));
});

test("placebos reproduce from their seed and differ from each other", () => {
  const panel = [walk(120, 3)];
  const first = [...placeboPanels(panel, { placebos: 19, seed: 11 })];
  const again = [...placeboPanels(panel, { placebos: 19, seed: 11 })];
  assert.deepEqual(first, again);
  assert.equal(new Set(first.map((p) => p[0].join(","))).size, 19);
  assert.throws(() => [...placeboPanels(panel, { placebos: 5 })], /placebos must be a whole number from 19/);
});

test("on data with nothing to find, the real result beats all 19 placebos about 1 time in 20", () => {
  // A pipeline that searches 8 momentum lookbacks and reports the best Sharpe, run on i.i.d. noise:
  // under exchangeable periods the permutation p-value is exact, so P(p <= 0.05) = 1/20.
  const best = ([r]) => {
    let top = -Infinity;
    for (const lookback of [2, 3, 5, 8, 13, 21, 34, 55]) {
      let sum = 0, sq = 0, n = 0, window = 0;
      for (let t = 0; t < r.length; t++) {
        if (t >= lookback) {
          const s = Math.sign(window) * r[t];
          sum += s; sq += s * s; n++;
          window -= r[t - lookback];
        }
        window += r[t];
      }
      const mean = sum / n;
      top = Math.max(top, mean / Math.sqrt(sq / n - mean * mean));
    }
    return top;
  };
  const tests = 1500;
  let rejected = 0;
  for (let i = 0; i < tests; i++) {
    const next = makeRandom(1000 + i);
    const real = [Array.from({ length: 250 }, () => (next() - 0.5) * 0.02)];
    const results = [...placeboPanels(real, { kind: "returns", placebos: 19, seed: 5000 + i })].map(best);
    if (placeboPValue(best(real), results).p_value <= 0.05) rejected++;
  }
  const rate = rejected / tests;
  assert.ok(rate > 0.035 && rate < 0.065, `rejection rate ${rate}`);
});

test("the p-value counts ties against the real result, and says how small it can be", () => {
  const results = Array.from({ length: 19 }, (_, k) => k / 10);
  const top = placeboPValue(5, results);
  assert.equal(top.p_value, 1 / 20);
  assert.equal(top.smallest_possible_p, 1 / 20);
  assert.equal(placeboPValue(1.8, results).p_value, 2 / 20, "a tie counts as a placebo at least as good");
  assert.equal(placeboPValue(-1, results, { higherIsBetter: false }).p_value, 1 / 20);
  assert.equal(top.placebo.median, 0.9);
  assert.equal(top.placebo.max, 1.8);
  assert.throws(() => placeboPValue(1, results.slice(0, 10)), /send 19 to 199 placebo results/);
  assert.throws(() => placeboPValue(1, [...results.slice(0, 18), Number.NaN]), /placebo_results\[18\] is not a finite number/);
});

test("checkPanel refuses gaps, non-positive prices and ragged columns, naming the position", () => {
  const ok = walk(40, 4);
  assert.equal(checkPanel([ok], "prices"), 39);
  assert.equal(checkPanel([ok], "returns"), 40);
  assert.throws(() => checkPanel([[...ok.slice(0, 10), null, ...ok.slice(11)]]), /column 1, row 11 is not a finite number/);
  assert.throws(() => checkPanel([[...ok.slice(0, 5), -1, ...ok.slice(6)]]), /column 1, row 6 is not a positive price/);
  assert.throws(() => checkPanel([ok, ok.slice(1)]), /column 2 has 39 rows; column 1 has 40/);
  assert.throws(() => checkPanel([ok.slice(0, PLACEBO_LIMITS.min_rows - 1)]), /each column needs 30/);
});
