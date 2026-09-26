// Minimum Backtest Length against its source: Bailey, Borwein, López de Prado and Zhu,
// "Pseudo-Mathematics and Financial Charlatanism: The Effects of Backtest Overfitting on
// Out-of-Sample Performance", Notices of the American Mathematical Society 61(5), 2014.
// Checked against the authors' preprint of April 1, 2014,
// https://www.davidhbailey.com/dhbpapers/backtest-pseudo.pdf
// (sha256 6e790c4185bf3932..., downloaded 2026-09-26). Every statement below is the paper's own.
import assert from "node:assert/strict";
import test from "node:test";

import { expectedMaxStandardNormal, maximumIndependentTrials, minimumBacktestLength } from "./dsr-core.js";

test("p. 9: trying N = 10 configurations, the best is expected to show an in-sample Sharpe of 1.57", () => {
  assert.equal(expectedMaxStandardNormal(10).toFixed(2), "1.57");
});

test("p. 11: with only 5 years of data, no more than 45 independent configurations should be tried (target Sharpe 1)", () => {
  assert.equal(maximumIndependentTrials({ years: 5, targetSharpe: 1 }), 45);
  assert.equal(minimumBacktestLength({ trials: 45, targetSharpe: 1 }).years.toFixed(0), "5");
});

test("p. 12: after only 7 configurations, a best in-sample Sharpe of 1 is expected for a 2-year backtest", () => {
  assert.equal(maximumIndependentTrials({ years: 2, targetSharpe: 1 }), 7);
  assert.equal(minimumBacktestLength({ trials: 7, targetSharpe: 1 }).years.toFixed(0), "2");
});

test("Eq. 3.2: MinBTL stays below its upper bound 2 ln N / target^2", () => {
  for (const trials of [2, 7, 45, 1000, 1e6]) {
    for (const targetSharpe of [0.5, 1, 2]) {
      const r = minimumBacktestLength({ trials, targetSharpe });
      assert.ok(r.years < r.upper_bound_years, `N=${trials}, target=${targetSharpe}`);
    }
  }
});

test("MinBTL and the trial ceiling are inverses: the ceiling for MinBTL(N) years is at least N", () => {
  for (const trials of [2, 3, 10, 45, 500, 12345]) {
    const years = minimumBacktestLength({ trials, targetSharpe: 1 }).years;
    assert.ok(maximumIndependentTrials({ years: years * (1 + 1e-12), targetSharpe: 1 }) >= trials, `N=${trials}`);
    assert.ok(maximumIndependentTrials({ years: years * (1 - 1e-9), targetSharpe: 1 }) < trials, `N=${trials}`);
  }
});

test("inputs outside the formula are refused", () => {
  assert.throws(() => expectedMaxStandardNormal(1), RangeError);
  assert.throws(() => minimumBacktestLength({ trials: 10, targetSharpe: 0 }), RangeError);
  assert.throws(() => maximumIndependentTrials({ years: 0, targetSharpe: 1 }), RangeError);
  assert.equal(maximumIndependentTrials({ years: 0.1, targetSharpe: 0.5 }), 1);
});
