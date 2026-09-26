// audit_backtest runs the deflated Sharpe, track record and (with variants) overfitting validators
// on one series. Each check must equal what the standalone tool returns for the same inputs, in
// local mode and through the API, and the audit must not invent a verdict of its own.
import assert from "node:assert/strict";
import test from "node:test";

import {
  createSession,
  toolAuditBacktest,
  toolValidateDeflatedSharpe,
  toolValidateOverfitting,
  toolValidateTrackRecord,
} from "../src/server.mjs";

const parsed = (result) => JSON.parse(result.content[0].text);

let seed = 11;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const RETURNS = Array.from({ length: 504 }, () => Number(((rnd() - 0.47) * 0.02).toFixed(6)));
const VARIANTS = RETURNS.map((r) => [r, Number(((rnd() - 0.5) * 0.02).toFixed(6)), Number(((rnd() - 0.49) * 0.02).toFixed(6))]);
const BASE = { returns: RETURNS, periods_per_year: 252, effective_independent_trials: 12, cross_trial_sharpe_sd_annualized: 0.4 };

function localSession() {
  const fetchImpl = async () => { throw new Error("local mode must not use the network"); };
  return createSession({ base: "https://example.test", fetchImpl, local: true });
}

test("local: each check equals the standalone tool's result for the same inputs", async () => {
  const session = localSession();
  const audit = parsed(await toolAuditBacktest(session, { ...BASE, variants: VARIANTS, n_splits: 6, benchmark_sharpe_annualized: 0.2 }));
  const dsr = parsed(await toolValidateDeflatedSharpe(session, BASE));
  assert.deepEqual(audit.checks.deflated_sharpe.data, dsr.data);
  const d = dsr.data.derived_inputs;
  const track = parsed(await toolValidateTrackRecord(session, {
    observed_sharpe_annualized: d.observed_sharpe_annualized, periods_per_year: 252, skew: d.skew,
    non_excess_kurtosis: d.non_excess_kurtosis, observations: d.observations, benchmark_sharpe_annualized: 0.2,
  }));
  assert.deepEqual(audit.checks.track_record.data, track.data);
  const overfit = parsed(await toolValidateOverfitting(session, { matrix: VARIANTS, n_splits: 6 }));
  assert.deepEqual(audit.checks.overfitting.data, overfit.data);
});

test("local: the shared limits are stated once, every reading is the check's own, and no grade is added", async () => {
  const audit = parsed(await toolAuditBacktest(localSession(), BASE));
  assert.equal(audit.schema, "canli.audit.v1");
  assert.ok(Array.isArray(audit.limits) && audit.limits.length > 0);
  for (const check of Object.values(audit.checks)) assert.equal(check.limits, undefined);
  assert.equal(audit.readings.deflated_sharpe, audit.checks.deflated_sharpe.data.plain_reading);
  assert.equal(audit.readings.track_record, audit.checks.track_record.data.plain_reading);
  assert.deepEqual(Object.keys(audit.checks), ["deflated_sharpe", "track_record"]);
  assert.ok(audit.not_run.overfitting);
  for (const key of ["grade", "verdict", "pass", "score"]) assert.equal(audit[key], undefined);
});

test("local: a Sharpe that cannot beat the benchmark is that check's refusal, not a failed audit", async () => {
  const result = await toolAuditBacktest(localSession(), { ...BASE, benchmark_sharpe_annualized: 9 });
  assert.equal(result.isError, undefined);
  const audit = parsed(result);
  assert.equal(audit.checks.track_record.data, null);
  assert.match(audit.checks.track_record.error.message, /must exceed the benchmark/);
  assert.equal(audit.readings.track_record, audit.checks.track_record.error.message);
});

test("input outside the schema is refused before anything runs", async () => {
  await assert.rejects(() => toolAuditBacktest(localSession(), { periods_per_year: 252 }));
  await assert.rejects(() => toolAuditBacktest(localSession(), { ...BASE, effective_independent_trials: 1 }));
  await assert.rejects(() => toolAuditBacktest(localSession(), { ...BASE, surprise: true }));
});

// Through the API: a fake fetch answers each route, so the test sees exactly what is sent where.
function apiEnvelope(endpoint, data, receipt, error) {
  return { schema: "canli.api.v1", endpoint, limits: ["L1", "L2"], data, ...(receipt ? { receipt } : {}), ...(error ? { error } : {}) };
}

function routedFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization });
    const r = routes[path];
    return { status: r.status, text: async () => JSON.stringify(r.body) };
  };
  impl.calls = calls;
  return impl;
}

const DERIVED = { observed_sharpe_annualized: 1.1, observations: 504, periods_per_year: 252, skew: -0.3, non_excess_kurtosis: 4.2, effective_independent_trials: 12, cross_trial_sharpe_sd_annualized: 0.4 };

test("API: three validations in order, the track record sent the derived statistics, receipts kept per check", async () => {
  const fetchImpl = routedFetch({
    "/api/v1/validate/deflated-sharpe": { status: 200, body: apiEnvelope("dsr", { derived_inputs: DERIVED, plain_reading: "R1" }, { id: "a".repeat(24) }) },
    "/api/v1/validate/track-record": { status: 200, body: apiEnvelope("trl", { plain_reading: "R2" }, { id: "b".repeat(24) }) },
    "/api/v1/validate/overfitting": { status: 200, body: apiEnvelope("pbo", { plain_reading: "R3" }, { id: "c".repeat(24) }) },
  });
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "k-test", local: false });
  const audit = parsed(await toolAuditBacktest(session, { ...BASE, variants: VARIANTS, confidence: 0.9 }));
  assert.deepEqual(fetchImpl.calls.map((c) => c.path), ["/api/v1/validate/deflated-sharpe", "/api/v1/validate/track-record", "/api/v1/validate/overfitting"]);
  assert.ok(fetchImpl.calls.every((c) => c.auth === "Bearer k-test"));
  assert.deepEqual(fetchImpl.calls[1].body, {
    observed_sharpe_annualized: 1.1, periods_per_year: 252, skew: -0.3, non_excess_kurtosis: 4.2, observations: 504, confidence: 0.9,
  });
  assert.deepEqual(fetchImpl.calls[2].body, { matrix: VARIANTS });
  assert.deepEqual([audit.checks.deflated_sharpe.receipt.id, audit.checks.track_record.receipt.id, audit.checks.overfitting.receipt.id], ["a".repeat(24), "b".repeat(24), "c".repeat(24)]);
  assert.deepEqual(audit.readings, { deflated_sharpe: "R1", track_record: "R2", overfitting: "R3" });
  assert.deepEqual(audit.limits, ["L1", "L2"]);
});

test("API: a failed first check is the audit's error and nothing else is sent", async () => {
  const fetchImpl = routedFetch({
    "/api/v1/validate/deflated-sharpe": { status: 429, body: apiEnvelope("dsr", null, null, { code: "quota_exceeded", message: "quota" }) },
  });
  const result = await toolAuditBacktest(createSession({ base: "https://example.test", fetchImpl, envKey: "k", local: false }), BASE);
  assert.equal(result.isError, true);
  assert.equal(parsed(result).error.code, "quota_exceeded");
  assert.equal(fetchImpl.calls.length, 1);
});

test("API: envelopes with different limits keep their own limits", async () => {
  const fetchImpl = routedFetch({
    "/api/v1/validate/deflated-sharpe": { status: 200, body: apiEnvelope("dsr", { derived_inputs: DERIVED, plain_reading: "R1" }) },
    "/api/v1/validate/track-record": { status: 200, body: { ...apiEnvelope("trl", { plain_reading: "R2" }), limits: ["other"] } },
  });
  const audit = parsed(await toolAuditBacktest(createSession({ base: "https://example.test", fetchImpl, envKey: "k", local: false }), BASE));
  assert.equal(audit.limits, undefined);
  assert.deepEqual(audit.checks.deflated_sharpe.limits, ["L1", "L2"]);
  assert.deepEqual(audit.checks.track_record.limits, ["other"]);
});
