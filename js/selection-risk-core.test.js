// Tests for the selection-risk sandbox core. The two that matter are the edge test
// (the demonstration is worthless if the generator secretly has drift) and the
// causality test (which perturbs a future bar rather than trusting a comment).

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoLookahead,
  generateSeries,
  makeRandom,
  runCrossover,
  sharpeVariance,
  summarize,
} from "./selection-risk-core.js";

test("the same seed produces the same series on every run", () => {
  const a = generateSeries({ seed: 20260827, bars: 300 });
  const b = generateSeries({ seed: 20260827, bars: 300 });
  assert.deepEqual(a, b);
  const c = generateSeries({ seed: 20260828, bars: 300 });
  assert.notDeepEqual(a, c, "different seeds must not produce the same series");
});

test("the generator is deterministic across independent PRNG instances", () => {
  const first = Array.from({ length: 5 }, makeRandom(42));
  const second = Array.from({ length: 5 }, makeRandom(42));
  assert.deepEqual(first, second);
});

test("THE DEMONSTRATION'S PREMISE: the series has no edge", () => {
  // If the generator had drift, every strategy would look good and the sandbox
  // would be teaching the opposite of its lesson. Average the annualised Sharpe
  // of one fixed configuration over many independent series: it must sit at zero.
  const sharpes = [];
  for (let seed = 1; seed <= 200; seed += 1) {
    const series = generateSeries({ seed, bars: 500 });
    sharpes.push(runCrossover({ series, fast: 10, slow: 50 }).sharpeAnnualised);
  }
  const mean = sharpes.reduce((a, b) => a + b, 0) / sharpes.length;
  const sd = Math.sqrt(sharpeVariance(sharpes));
  const standardError = sd / Math.sqrt(sharpes.length);
  assert.ok(
    Math.abs(mean) < 3 * standardError,
    `mean annualised Sharpe ${mean.toFixed(4)} is more than 3 standard errors ` +
      `(${(3 * standardError).toFixed(4)}) from zero: the generator has drift`,
  );
});

test("but SEARCHING that same edge-free space finds a flattering result anyway", () => {
  // This is the whole point of the tool, asserted rather than merely claimed.
  const series = generateSeries({ seed: 99, bars: 750 });
  let best = -Infinity;
  for (let fast = 2; fast <= 20; fast += 1) {
    for (let slow = fast + 1; slow <= 90; slow += 1) {
      best = Math.max(best, runCrossover({ series, fast, slow }).sharpeAnnualised);
    }
  }
  assert.ok(best > 0.8, `searching found only ${best.toFixed(2)}; the demonstration needs a flattering best`);
});

test("a decision never touches its own bar or its entry bar's outcome", () => {
  const series = generateSeries({ seed: 5, bars: 200 });
  const result = runCrossover({ series, fast: 5, slow: 20 });
  const check = assertNoLookahead(result);
  assert.ok(check.ok, `causality violated at ${JSON.stringify(check.offending)}`);
});

test("MUTATION: perturbing one bar changes no return that was already priced", () => {
  // The structural assertion above could be satisfied by an implementation that
  // still peeked. This proves the property behaviourally: move a late bar and
  // confirm every return settled before it is byte-identical.
  const series = generateSeries({ seed: 11, bars: 260 });
  const baseline = runCrossover({ series, fast: 5, slow: 20 });

  const perturbedIndex = 200;
  const perturbed = series.map((b) =>
    b.i === perturbedIndex ? { ...b, open: b.open * 1.5, close: b.close * 1.5 } : b,
  );
  const after = runCrossover({ series: perturbed, fast: 5, slow: 20 });

  // The earliest return that may legitimately move is the one whose EXIT bar is
  // the perturbed bar: decision at t, exit at t+2, so t = perturbedIndex - 2.
  const firstLegitimate = perturbedIndex - 2 - (20 - 1);
  for (let k = 0; k < firstLegitimate; k += 1) {
    assert.equal(
      baseline.returns[k], after.returns[k],
      `return ${k} moved when a later bar changed: the strategy is reading the future`,
    );
  }
  assert.notEqual(
    baseline.returns[firstLegitimate], after.returns[firstLegitimate],
    "perturbing the bar changed nothing at all, so the mutation test proves nothing",
  );
});

test("costs reduce net return and only bite on turnover", () => {
  const series = generateSeries({ seed: 3, bars: 400 });
  const free = runCrossover({ series, fast: 8, slow: 30, costBps: 0 });
  const charged = runCrossover({ series, fast: 8, slow: 30, costBps: 25 });
  assert.ok(charged.totalReturn < free.totalReturn, "a cost must reduce the net result");
  assert.equal(free.trades, charged.trades, "a cost must not change the positions taken");
});

test("invalid windows fail loudly rather than silently", () => {
  const series = generateSeries({ seed: 1, bars: 100 });
  assert.throws(() => runCrossover({ series, fast: 30, slow: 10 }), /fast window must be shorter/);
  assert.throws(() => runCrossover({ series, fast: 0, slow: 10 }), /positive/);
  assert.throws(() => runCrossover({ series, fast: 1.5, slow: 10 }), /integers/);
  assert.throws(() => generateSeries({ seed: 1, bars: 4 }), /bars must be an integer/);
});

test("summary statistics match hand-computed values", () => {
  const returns = [0.1, -0.05, 0.02];
  const curve = [1];
  for (const r of returns) curve.push(curve[curve.length - 1] * (1 + r));
  const s = summarize(returns, curve);
  const mean = (0.1 - 0.05 + 0.02) / 3;
  const variance = ((0.1 - mean) ** 2 + (-0.05 - mean) ** 2 + (0.02 - mean) ** 2) / 2;
  assert.ok(Math.abs(s.sharpePerPeriod - mean / Math.sqrt(variance)) < 1e-12);
  assert.ok(Math.abs(s.maxDrawdown - 0.05) < 1e-12, "drawdown after a 10% gain then a 5% loss is 5%");
});

test("sample moments use the non-excess kurtosis convention", () => {
  // A Gaussian scores 3, not 0. Getting this wrong shifts the deflation's variance
  // term while leaving the answer plausible, which is the hardest kind of wrong.
  const series = generateSeries({ seed: 21, bars: 4000 });
  const result = runCrossover({ series, fast: 3, slow: 8 });
  assert.ok(
    result.nonExcessKurtosis > 1.5 && result.nonExcessKurtosis < 12,
    `non-excess kurtosis ${result.nonExcessKurtosis} is outside any plausible range; ` +
      "an excess-kurtosis convention would sit near zero",
  );
  assert.equal(result.observations, result.returns.length);
});
