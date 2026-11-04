// lookahead_check reads target weights alone. Weights that peek at the next period's return, every day or one
// day in seven, show an edge that is all in its own period; real momentum and reversal, which the return that had
// just happened explains, and weights with no edge, are not flagged.
import assert from "node:assert/strict";
import test from "node:test";

import { mulberry32 } from "../src/math.mjs";
import { runTool } from "../src/registry.mjs";

const T = 800;
const series = (seed, ar = 0) => {
  const rnd = mulberry32(seed), g = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const r = [0];
  for (let t = 1; t < T; t++) r.push(ar * r[t - 1] + 0.01 * g());
  const p = [100];
  for (let t = 1; t < T; t++) p.push(p[t - 1] * (1 + r[t]));
  return { p, r, rnd };
};
const check = (prices, weights) => runTool("lookahead_check", { prices, weights });
const lag = (x, k) => x.rows.find((row) => row[0] === k)[1];

test("weights that know the next period's return are flagged, every day or one day in seven", () => {
  const { p, r, rnd } = series(21);
  const peek = check(p, p.map((_, t) => (t + 1 < T ? Math.sign(r[t + 1]) : 0)));
  assert.equal(peek.lookahead_pattern, true);
  assert.match(peek.verdict, /^Consistent with lookahead/);
  assert.ok(lag(peek, 0) > 15 && Math.abs(lag(peek, 1)) < 2 * peek.standard_error, JSON.stringify(peek.rows));
  const some = check(p, p.map((_, t) => (t + 1 < T ? (rnd() < 0.15 ? Math.sign(r[t + 1]) : rnd() < 0.5 ? 1 : -1) : 0)));
  assert.equal(some.lookahead_pattern, true);
  assert.match(some.verdict, /lookahead, or an edge that lasts one period/);
});

test("momentum and reversal that the last return explains, and weights with no edge, are not flagged", () => {
  const up = series(21, 0.15);
  const momentum = check(up.p, up.p.map((_, t) => (t ? Math.sign(up.r[t]) : 0)));
  assert.equal(momentum.lookahead_pattern, false);
  assert.ok(lag(momentum, -1) > 10, "the signal is the return that had just happened");
  const down = series(21, -0.25);
  const reversal = check(down.p, down.p.map((_, t) => -Math.sign(down.r[t])));
  assert.equal(reversal.lookahead_pattern, false);
  assert.match(reversal.verdict, /^No sign of lookahead/);
  const flat = series(23);
  assert.match(check(flat.p, flat.p.map(() => (flat.rnd() < 0.5 ? 1 : -1))).verdict, /^Too little edge/);
});

test("several assets take one row each, null rows hold, and rows must match", () => {
  const a = series(5), b = series(6);
  const prices = a.p.map((x, t) => [x, b.p[t]]);
  const weights = prices.map((_, t) => (t % 5 === 0 ? [0.5, 0.5] : null));
  const x = check(prices, weights);
  assert.deepEqual(x.columns, ["lag", "sharpe", "reading"]);
  assert.equal(x.periods, T - 1);
  assert.throws(() => check(prices, weights.slice(1)), /weights has 799 rows and prices 800/);
  assert.throws(() => check(prices, weights.map((w) => (w ? [1] : null))), /has 1 entries for 2 assets/);
});
