import assert from "node:assert/strict";
import test from "node:test";

import { calculateDsr, checkGoldenVectors, normalCdf, normalPpf } from "./dsr-core.js";
import * as tool from "./dsr-tool.js";

test("the core has no DOM dependency and the tool re-exports it", () => {
  assert.equal(typeof document, "undefined");
  assert.equal(tool.calculateDsr, calculateDsr);
  assert.equal(tool.checkGoldenVectors, checkGoldenVectors);
  assert.equal(tool.normalCdf, normalCdf);
  assert.equal(tool.normalPpf, normalPpf);
});

test("a known point: 30 trials and 0.5 dispersion deflate a 1.2 Sharpe below 0.95", () => {
  const out = calculateDsr({
    observed_sharpe_annualized: 1.2, observations: 756, periods_per_year: 252,
    skew: 0, non_excess_kurtosis: 3, effective_independent_trials: 30,
    cross_trial_sharpe_sd_annualized: 0.5,
  });
  assert.ok(out.deflated_sharpe_ratio < 0.95);
  assert.ok(out.psr_against_zero > out.deflated_sharpe_ratio);
});
