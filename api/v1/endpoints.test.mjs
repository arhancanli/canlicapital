import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { MANIFEST } from "../_lib/manifest.js";
import { compute as dsr } from "./validate/deflated-sharpe.js";
import { compute as pbo } from "./validate/overfitting.js";
import { compute as evidence } from "./validate/paper-evidence.js";
import { compute as breadth } from "./validate/breadth.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VECTORS = JSON.parse(readFileSync(resolve(ROOT, "standards/validation-api/vectors.json"), "utf8"));

test("the manifest names every route file and every route has a summary and an example", () => {
  const paths = MANIFEST.map((m) => `${m.method} ${m.path}`).sort();
  assert.deepEqual(paths, [
    "GET /api/v1/receipts/{id}", "GET /api/v1/validate/status", "POST /api/v1/keys",
    "POST /api/v1/validate/breadth", "POST /api/v1/validate/deflated-sharpe",
    "POST /api/v1/validate/overfitting", "POST /api/v1/validate/paper-evidence",
  ]);
  for (const m of MANIFEST) { assert.ok(m.summary.length > 20, m.path); if (m.method === "POST") assert.ok(m.requestExample, m.path); }
});

test("deflated-sharpe accepts contract inputs or a series, and refuses both at once", () => {
  const direct = dsr({ observed_sharpe_annualized: 1.2, observations: 756, periods_per_year: 252, skew: 0, non_excess_kurtosis: 3, effective_independent_trials: 30, cross_trial_sharpe_sd_annualized: 0.5 });
  assert.ok(direct.result.deflated_sharpe_ratio > 0 && direct.result.deflated_sharpe_ratio < 1);
  assert.equal(direct.input_mode, "contract_inputs");
  const v = VECTORS.moments[0];
  const series = dsr({ returns: v.returns, periods_per_year: v.periods_per_year, effective_independent_trials: v.effective_independent_trials, cross_trial_sharpe_sd_annualized: v.cross_trial_sharpe_sd_annualized });
  assert.equal(series.input_mode, "return_series");
  assert.ok(Math.abs(series.result.deflated_sharpe_ratio - v.expected.dsr) < 1e-6);
  assert.throws(() => dsr({ returns: v.returns, observed_sharpe_annualized: 1, periods_per_year: 252, effective_independent_trials: 2, cross_trial_sharpe_sd_annualized: 0.1 }), /either/);
  assert.throws(() => dsr({ returns: new Array(20001).fill(0.001), periods_per_year: 252, effective_independent_trials: 2, cross_trial_sharpe_sd_annualized: 0.1 }), /observations/);
});

test("overfitting caps variants and combinations and reports the sampler honestly", () => {
  const v = VECTORS.pbo[0];
  const out = pbo({ matrix: v.matrix, n_splits: v.n_splits });
  assert.ok(Math.abs(out.pbo - v.expected.pbo) < 1e-12);
  assert.equal(out.exhaustive, true);
  assert.ok(out.plain_reading.length > 40);
  const wide = Array.from({ length: 32 }, () => new Array(201).fill(0.001));
  assert.throws(() => pbo({ matrix: wide }), /variants/);
  assert.throws(() => pbo({ matrix: v.matrix, max_combinations: 5000 }), /combinations/);
});

test("paper-evidence reports structural and semantic failures with pointers", () => {
  const out = evidence({ record: { schema: "canli.paper-evidence.v0" } });
  assert.equal(out.valid, false);
  assert.ok(out.structural.length > 0);
  assert.ok(out.structural.every((f) => typeof f.pointer === "string"));
  assert.match(out.standard, /paper-evidence\.v0/);
});

test("breadth returns the ceiling, sleeves required and whether a target is reachable", () => {
  const out = breadth({ sleeve_sharpe: 0.5, average_pairwise_correlation: 0.05, sleeves: 4, target: 2.5 });
  assert.ok(Math.abs(out.ceiling - 0.5 / Math.sqrt(0.05)) < 1e-12);
  assert.equal(out.target.reachable, false);
  const ok = breadth({ sleeve_sharpe: 0.9, average_pairwise_correlation: 0.05, sleeves: 12, target: 2.5 });
  assert.equal(ok.target.reachable, true);
  assert.ok(Number.isInteger(ok.target.sleeves_required));
});
