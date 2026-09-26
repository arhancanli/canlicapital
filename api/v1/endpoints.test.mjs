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
import { compute as trackRecord } from "./validate/track-record.js";
import { compute as backtestLength } from "./validate/backtest-length.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VECTORS = JSON.parse(readFileSync(resolve(ROOT, "standards/validation-api/vectors.json"), "utf8"));

test("the manifest names every route file and every route has a summary and an example", () => {
  const paths = MANIFEST.map((m) => `${m.method} ${m.path}`).sort();
  assert.deepEqual(paths, [
    "GET /api/v1/receipts/{id}", "GET /api/v1/receipts/{id}/badge.svg", "GET /api/v1/validate/status",
    "POST /api/v1/keys", "POST /api/v1/keys/revoke", "POST /api/v1/validate/backtest-length", "POST /api/v1/validate/breadth", "POST /api/v1/validate/deflated-sharpe",
    "POST /api/v1/validate/overfitting", "POST /api/v1/validate/paper-evidence", "POST /api/v1/validate/track-record",
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

test("deflated-sharpe's declared modes round-trip through its own validator, both of them", () => {
  const entry = MANIFEST.find((m) => m.path === "/api/v1/validate/deflated-sharpe");
  assert.equal(entry.modes.length, 2);
  for (const mode of entry.modes) {
    for (const key of mode.required) assert.ok(key in mode.example, `${mode.name} example is missing required field ${key}`);
    const out = dsr(mode.example);
    assert.equal(out.input_mode, mode.name, `${mode.name} example did not resolve to its own input_mode`);
    assert.ok(Number.isFinite(out.result.deflated_sharpe_ratio), `${mode.name} example did not produce a finite deflated Sharpe`);
  }
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


test("missing database configuration preserves API unavailable and badge contracts", async (t) => {
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => { for (const name of names) {
    if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
  } });
  for (const name of names) delete process.env[name];
  const { Readable } = await import("node:stream");
  const { validatorHandler } = await import("../_lib/handler.js");
  const { default: status } = await import("./validate/status.js");
  const { default: receipt } = await import("./receipts/[id].js");
  const { default: badge } = await import("./receipts/[id]/badge.js");
  let computeCalls = 0;
  const validate = validatorHandler({ endpoint: "validate/breadth", sourcesPaths: ["js/breadth-core.js"], compute: () => { computeCalls++; return {}; } });
  for (const [name, handler, expected] of [["status", status, 503], ["receipt", receipt, 503], ["badge", badge, 404], ["validator", validate, 503]]) {
    const req = Readable.from([Buffer.from("{}")]);
    req.method = name === "validator" ? "POST" : "GET";
    req.headers = { authorization: "Bearer ck_live_" + "a".repeat(43), "content-length": "2" };
    req.query = { id: "0".repeat(24) };
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
    await handler(req, res);
    assert.equal(res.statusCode, expected, name);
    assert.doesNotMatch(res.body, /SUPABASE|service_role|stack/i);
    if (name === "badge") assert.match(res.headers["Content-Type"], /image\/svg/);
    else {
      const body = JSON.parse(res.body);
      assert.equal(body.schema, "canli.api.v1");
      assert.equal(res.headers["Cache-Control"], "no-store");
      if (name === "status") {
        assert.equal(body.data.store_reachable, false);
        assert.equal(body.data.usage_available, false);
        assert.equal(body.data.usage, null);
      } else assert.equal(body.error.code, "store_unavailable");
    }
  }
  assert.equal(computeCalls, 0);
});

test("track-record reproduces the paper's daily example and judges a record's length", () => {
  const base = { observed_sharpe_annualized: 2, benchmark_sharpe_annualized: 1, periods_per_year: 252, skew: 0, non_excess_kurtosis: 3 };
  const out = trackRecord(base);
  assert.ok(Math.abs(out.result.minimum_years - 2.73) <= 0.005, String(out.result.minimum_years));
  assert.equal(out.result.record, undefined);
  const short = trackRecord({ ...base, observations: 504 });
  assert.equal(short.result.record.long_enough, false);
  assert.ok(short.result.record.psr_against_benchmark < 0.95);
  const enough = trackRecord({ ...base, observations: out.result.minimum_observations });
  assert.equal(enough.result.record.long_enough, true);
  assert.ok(enough.result.record.psr_against_benchmark >= 0.95);
  assert.match(out.plain_reading, /not a forecast/);
  assert.throws(() => trackRecord({ ...base, observed_sharpe_annualized: 1 }), /must exceed the benchmark/);
  assert.throws(() => trackRecord({ periods_per_year: 252 }), /Missing required fields/);
});

test("backtest-length reproduces the paper's statements and refuses a request with neither input", () => {
  const out = backtestLength({ effective_independent_trials: 45, backtest_years: 5, target_sharpe_annualized: 1 });
  assert.equal(out.result.maximum_independent_trials, 45);
  assert.equal(out.result.minimum_backtest_years.toFixed(0), "5");
  assert.equal(out.result.long_enough, true);
  assert.ok(out.result.minimum_backtest_years < out.result.upper_bound_years);
  assert.equal(backtestLength({ backtest_years: 2 }).result.maximum_independent_trials, 7);
  assert.match(out.plain_reading, /necessary, not sufficient/);
  assert.throws(() => backtestLength({}), /Send effective_independent_trials, backtest_years, or both/);
  assert.throws(() => backtestLength({ effective_independent_trials: 1 }), RangeError);
});
