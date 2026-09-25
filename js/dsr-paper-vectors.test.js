// The deflated Sharpe ratio against the worked example published with it.
//
// Source: D. H. Bailey and M. López de Prado, "The Deflated Sharpe Ratio: Correcting for Selection
// Bias, Backtest Overfitting and Non-Normality", Journal of Portfolio Management 40(5), 2014.
// Preprint: https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf, "A numerical example",
// pages 9-10. The paper prints its results to four decimals, so the tolerance is half a unit in
// the fourth decimal. These are the paper's numbers, not values this engine produced; our own
// golden vectors (dsr-core.test.js) only prove the engine agrees with itself.
//
// Inputs from the paper: an annualized SR of 2.5 on daily data with 250 observations per year,
// T = 1250, N = 100 independent trials, V[{SR_n}] = 1/2 (annualized variance, so the cross-trial
// SD is sqrt(1/2)), skewness -3 and kurtosis 10. calculateDsr is the function the
// /api/v1/validate/deflated-sharpe route and the MCP tool call.
import assert from "node:assert/strict";
import test from "node:test";

import { calculateDsr } from "./dsr-core.js";

const PAPER = {
  observed_sharpe_annualized: 2.5,
  observations: 1250,
  periods_per_year: 250,
  skew: -3,
  non_excess_kurtosis: 10,
  effective_independent_trials: 100,
  cross_trial_sharpe_sd_annualized: Math.sqrt(0.5),
};
const HALF_UNIT_4DP = 0.00005;

test("paper, page 10: SR0 is about 0.1132 (non-annualized) and DSR is 0.9004", () => {
  const r = calculateDsr(PAPER);
  assert.ok(Math.abs(r.expected_max_sharpe_per_period - 0.1132) <= HALF_UNIT_4DP, `SR0 ${r.expected_max_sharpe_per_period}`);
  assert.ok(Math.abs(r.deflated_sharpe_ratio - 0.9004) <= HALF_UNIT_4DP, `DSR ${r.deflated_sharpe_ratio}`);
});

test("paper, page 10: after only N = 46 trials the DSR would have been 0.9505", () => {
  const r = calculateDsr({ ...PAPER, effective_independent_trials: 46 });
  assert.ok(Math.abs(r.deflated_sharpe_ratio - 0.9505) <= HALF_UNIT_4DP, `DSR ${r.deflated_sharpe_ratio}`);
});

test("paper, page 10: with Normal returns (skew 0, kurtosis 3) the DSR is 0.9505 after N = 88", () => {
  const r = calculateDsr({ ...PAPER, skew: 0, non_excess_kurtosis: 3, effective_independent_trials: 88 });
  assert.ok(Math.abs(r.deflated_sharpe_ratio - 0.9505) <= HALF_UNIT_4DP, `DSR ${r.deflated_sharpe_ratio}`);
});
