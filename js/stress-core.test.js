import assert from "node:assert/strict";
import test from "node:test";

import { pathStats, stressTest } from "./stress-core.js";
import { makeRandom } from "./selection-risk-core.js";

function gaussianReturns(n, seed, sd = 0.01, mean = 0.0004) {
  const next = makeRandom(seed);
  return Array.from({ length: n }, () => {
    const u = Math.max(1e-12, next());
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  });
}

test("path statistics on a hand-built path", () => {
  const s = pathStats([0.1, -0.5, 0.2], 252);
  assert.ok(Math.abs(s.total_return - (1.1 * 0.5 * 1.2 - 1)) < 1e-12);
  assert.ok(Math.abs(s.max_drawdown - (0.5 - 1)) < 1e-12);
});

test("a run reproduces exactly from its seed, and a different seed gives different resamples", () => {
  const r = gaussianReturns(750, 4);
  const a = stressTest({ returns: r, paths: 400, seed: 7 });
  const b = stressTest({ returns: r, paths: 400, seed: 7 });
  const c = stressTest({ returns: r, paths: 400, seed: 8 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.notEqual(JSON.stringify(a.resampled), JSON.stringify(c.resampled));
});

test("percentile bands are ordered and the fragility is the stated share", () => {
  const out = stressTest({ returns: gaussianReturns(1000, 9, 0.012), paths: 500, drawdown_limit: 0.15 });
  for (const key of ["sharpe", "max_drawdown", "cagr"]) {
    const b = out.resampled[key];
    assert.ok(b.p5 <= b.median && b.median <= b.p95, key);
  }
  const r = out.resampled;
  assert.ok(out.fragility.value >= Math.max(r.probability_drawdown_beyond_limit, r.probability_negative_sharpe) - 1e-9);
  assert.ok(out.fragility.value <= r.probability_drawdown_beyond_limit + r.probability_negative_sharpe + 1e-9);
  assert.match(out.fragility.definition, /worse than 15%/);
});

test("named scenarios follow their rules", () => {
  const r = gaussianReturns(500, 2, 0.008, 0.001);
  const out = stressTest({ returns: r, paths: 200, crash: -0.3, volatility_multiplier: 3, outage_periods: 4 });
  const byName = Object.fromEntries(out.scenarios.map((s) => [s.name, s]));
  assert.ok(byName.crash_at_the_peak.max_drawdown <= -0.3 + 1e-12, "a 30% crash at the high is at least a 30% drawdown");
  assert.match(byName.crash_at_the_peak.rule, /losing -30\.0%/);
  assert.ok(byName.volatility_multiplied.max_drawdown < out.baseline.max_drawdown, "tripled volatility deepens the drawdown");
  assert.ok(byName.worst_stretch_twice.max_drawdown <= out.baseline.max_drawdown);
  assert.match(byName.stuck_after_the_worst_period.rule, /The 4 periods after the worst one|the 4 periods after the worst one/);
});

test("the default crash is at least a 20% loss and three times the worst period", () => {
  const calm = gaussianReturns(300, 5, 0.002);
  const out = stressTest({ returns: calm, paths: 100 });
  assert.match(out.scenarios[0].rule, /losing -20\.0%/);
  const rough = gaussianReturns(300, 5, 0.03);
  const worst = Math.min(...rough);
  const roughOut = stressTest({ returns: rough, paths: 100 });
  assert.match(roughOut.scenarios[0].rule, new RegExp(`losing ${(3 * worst * 100).toFixed(1)}%`));
});

test("inputs are bounded and explained", () => {
  const r = gaussianReturns(100, 1);
  assert.throws(() => stressTest({ returns: r.slice(0, 20) }), /at least 60 returns/);
  assert.throws(() => stressTest({ returns: r, paths: 50 }), /paths must be a whole number from 100/);
  assert.throws(() => stressTest({ returns: r, drawdown_limit: 20 }), /fraction between 0 and 1/);
  assert.throws(() => stressTest({ returns: [...r.slice(0, 70), -1] }), /-100% or worse/);
});
