import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { dsrFromReturns, perPeriodMoments } from "./moments-core.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VECTORS = JSON.parse(readFileSync(resolve(ROOT, "standards/validation-api/vectors.json"), "utf8"));
const close = (a, b, tol) => Math.abs(a - b) <= tol;

for (const v of VECTORS.moments) {
  test(`moments parity: ${v.id}`, () => {
    const m = perPeriodMoments(v.returns);
    assert.equal(m.observations, v.expected.observations);
    assert.ok(close(m.sharpe_per_period, v.expected.sharpe_per_period, 1e-12), `sharpe ${m.sharpe_per_period} vs ${v.expected.sharpe_per_period}`);
    assert.ok(close(m.skew, v.expected.skew, 1e-10), `skew ${m.skew} vs ${v.expected.skew}`);
    assert.ok(close(m.non_excess_kurtosis, v.expected.non_excess_kurtosis, 1e-10));
  });
  test(`dsr-from-returns parity: ${v.id}`, () => {
    const { result } = dsrFromReturns({
      returns: v.returns, periods_per_year: v.periods_per_year,
      effective_independent_trials: v.effective_independent_trials,
      cross_trial_sharpe_sd_annualized: v.cross_trial_sharpe_sd_annualized,
    });
    assert.ok(close(result.psr_against_zero, v.expected.psr, 1e-6), `psr ${result.psr_against_zero} vs ${v.expected.psr}`);
    assert.ok(close(result.deflated_sharpe_ratio, v.expected.dsr, 1e-6), `dsr ${result.deflated_sharpe_ratio} vs ${v.expected.dsr}`);
    assert.ok(close(result.expected_max_sharpe_per_period, v.expected.expected_max_sharpe_per_period, 1e-9));
  });
}

test("a constant series is refused, not reported as infinite", () => {
  assert.throws(() => perPeriodMoments([0.01, 0.01, 0.01, 0.01]), /zero variance/);
});

test("fewer than two finite values is refused", () => {
  assert.throws(() => perPeriodMoments([0.01, NaN]), /at least 2/);
});
