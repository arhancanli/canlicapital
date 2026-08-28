import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { calculateDsr, checkGoldenVectors, normalCdf, normalPpf } from "./dsr-tool.js";


const contract = JSON.parse(
  readFileSync(new URL("../public/glassbox/deflated_sharpe_calculator_contract.json", import.meta.url)),
);

test("browser arithmetic reproduces all production golden vectors", () => {
  assert.deepEqual(checkGoldenVectors(contract.test_vectors), []);
});

test("normal CDF and inverse are mutually consistent across the calculator domain", () => {
  for (const probability of [0.0001, 0.01, 0.1, 0.5, 0.9, 0.99, 0.9999]) {
    assert.ok(Math.abs(normalCdf(normalPpf(probability)) - probability) < 8e-7);
  }
});

test("more trials cannot improve DSR when dispersion is positive", () => {
  const base = {
    observed_sharpe_annualized: 1.5,
    observations: 730,
    periods_per_year: 365,
    skew: -0.5,
    non_excess_kurtosis: 5,
    effective_independent_trials: 10,
    cross_trial_sharpe_sd_annualized: 0.57,
  };
  const few = calculateDsr(base).deflated_sharpe_ratio;
  const many = calculateDsr({ ...base, effective_independent_trials: 1000 }).deflated_sharpe_ratio;
  assert.ok(many < few);
});

test("invalid estimator variance fails closed", () => {
  assert.throws(
    () => calculateDsr({
      observed_sharpe_annualized: 10,
      observations: 100,
      periods_per_year: 1,
      skew: 5,
      non_excess_kurtosis: 1,
      effective_independent_trials: 10,
      cross_trial_sharpe_sd_annualized: 0.5,
    }),
    /non-positive estimator variance/,
  );
});
