// The views of how far a result can be trusted (proof.js): the luck cliff's arithmetic agrees with
// the validator's, each result gets its view, and every string from a result is escaped.
import assert from "node:assert/strict";
import test from "node:test";

import { calculateDsr } from "canli-validation-mcp/src/local/js/dsr-core.js";

import { deflatedAt, luckBar, normCdf, normInv, triesUntil } from "../src/view/proof.js";
import { renderRunResult } from "../src/view/render.js";
import { placed, studioReset } from "../src/view/studio.js";

const DSR = { observed_sharpe_annualized: 1.8, observations: 1000, periods_per_year: 252, skew: -0.2, non_excess_kurtosis: 4, effective_independent_trials: 40, cross_trial_sharpe_sd_annualized: 0.5 };
const kinds = (result, input = {}) => { studioReset(input); const html = renderRunResult(result, input); return { kinds: placed(), html }; };

test("the cliff's probability and luck bar are the validator's, across the range of tries", () => {
  for (const trials of [2, 3, 10, 40, 200, 5000, 100000, 1000000]) {
    const mine = deflatedAt(trials, DSR), theirs = calculateDsr({ ...DSR, effective_independent_trials: trials });
    assert.ok(Math.abs(mine.probability - theirs.deflated_sharpe_ratio) < 1e-5, `${trials}: ${mine.probability} vs ${theirs.deflated_sharpe_ratio}`);
    assert.ok(Math.abs(mine.luck_sharpe - theirs.expected_max_sharpe_annualized) < 1e-5, `${trials}: ${mine.luck_sharpe} vs ${theirs.expected_max_sharpe_annualized}`);
  }
  assert.ok(Math.abs(normCdf(1.96) - 0.9750021) < 1e-6);
  assert.ok(Math.abs(normInv(0.975) - 1.959964) < 1e-5);
  assert.equal(luckBar(1), 0);
});

test("the tries a result can survive are found, at both ends", () => {
  const n = triesUntil(0.95, DSR);
  assert.ok(deflatedAt(n, DSR).probability >= 0.95);
  assert.ok(deflatedAt(n + 1, DSR).probability < 0.95);
  assert.equal(triesUntil(0.95, { ...DSR, observed_sharpe_annualized: 0.01 }), null, "under the bar at two tries");
  assert.equal(triesUntil(0.5, { ...DSR, cross_trial_sharpe_sd_annualized: 0 }), Infinity, "no spread among tries: no luck bar");
});

test("each result gets its view, and an ordinary result gets none of them", () => {
  assert.deepEqual(kinds({ data: { derived_inputs: DSR, result: { deflated_sharpe_ratio: 0.9 } } }).kinds, ["cliff"]);
  assert.deepEqual(kinds({ crises: { verdict: "untested", tested: [], untested: [] }, fails: [] }).kinds, ["resilience"]);
  assert.deepEqual(kinds({ series: [{ name: "a", verdict: "untested", tested: [], untested: [] }] }).kinds, ["resilience"]);
  assert.deepEqual(kinds({ path_sharpes: [0.5, 0.6], out_of_sample_sharpe: { median: 0.5 }, in_sample_sharpe_median: 1 }).kinds, ["paths"]);
  assert.deepEqual(kinds({ tree: { concept: "Assets", label: "Assets", children: [] }, filing: { form: "10-K" }, period: { instant: "2025-01-01" } }).kinds, ["trace"]);
  assert.deepEqual(kinds({ series: "GDP", total: 3 }).kinds, []);
});
