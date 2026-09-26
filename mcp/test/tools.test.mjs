// mcp/test/tools.test.mjs
//
// Unit tests for every tool's handler function against a fake fetch, so no test in this file
// touches the network. Each keyed validator gets a success, an error-envelope and a quota-429
// case; get_key additionally gets the CANLI_KEY skip path; get_receipt and service_status are
// unkeyed GET endpoints with no quota, so they get success and error-envelope cases only.
import assert from "node:assert/strict";
import test from "node:test";

import {
  createSession,
  toolGetKey,
  toolGetReceipt,
  toolServiceStatus,
  toolValidateBreadth,
  toolValidateTrackRecord,
  toolValidateBacktestLength,
  toolValidateHaircutSharpe,
  toolValidateDeflatedSharpe,
  toolValidateOverfitting,
  toolValidatePaperEvidence,
  toolCompanyFinancialHistory,
  columnarObservations,
  compactEnvelope,
} from "../src/server.mjs";
import { COMPANY_REFERENCE_BOUNDARY } from "../src/schemas.mjs";

const LIMITS_TEXT = [
  "This verdict is about the series exactly as submitted. The service never saw the data source, its costs, survivorship, or any lookahead in how the series was built.",
  "A deflated Sharpe or overfitting probability above or below any threshold is not admission to anything and is not a forecast.",
  "The receipt is content-hashed, reproducible from the open-source core it names, and signed with Ed25519 by a key published at https://canlicapital.com/.well-known/canli-receipt-keys.json.",
  "Quotas: 1000 validations per key per UTC day, 5 keys per client per UTC day, 1048576 bytes per validation request, 1024 bytes per key revocation request, 20000 observations per series, 200 variants per matrix.",
];

function envelope({ endpoint, data, receipt, error, claimClass = "USER_SUBMITTED_SCENARIO", capitalKind = "NOT_APPLICABLE_USER_SUBMITTED" }) {
  const body = {
    schema: "canli.api.v1",
    endpoint: `/api/v1/${endpoint}`,
    generated_at: "2026-09-06T00:00:00Z",
    claim_class: claimClass,
    capital_kind: capitalKind,
    canonical_human_page: "https://canlicapital.com/developers",
    limits: LIMITS_TEXT,
    sources: [],
    data: data ?? {},
  };
  if (receipt) body.receipt = receipt;
  if (error) body.error = error;
  return body;
}

function fakeFetch(responses) {
  const calls = [];
  let i = 0;
  const impl = async (url, init) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return { status: r.status, text: async () => JSON.stringify(r.body) };
  };
  impl.calls = calls;
  return impl;
}

const neverFetch = async () => {
  throw new Error("fetch should not have been called");
};

function parsedText(result) {
  return JSON.parse(result.content[0].text);
}

// ---------------------------------------------------------------------------------------------
// get_key
// ---------------------------------------------------------------------------------------------

test("get_key: success envelope passthrough, and the key is stored on the session", async () => {
  const body = envelope({
    endpoint: "keys",
    claimClass: "OBSERVED",
    capitalKind: "NOT_APPLICABLE_SERVICE_STATUS",
    data: { key: "ck_live_test0000000000000000", label: "x", keys_remaining_today: 4 },
  });
  const fetchImpl = fakeFetch([{ status: 201, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl });

  const result = await toolGetKey(session, { label: "x" });

  assert.deepEqual(parsedText(result), body);
  assert.equal(session.key, "ck_live_test0000000000000000");
  assert.equal(fetchImpl.calls[0].url, "https://example.test/api/v1/keys");
  assert.equal(fetchImpl.calls[0].init.method, "POST");
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), { label: "x" });
});

test("get_key: error envelope passthrough (store unavailable), no key stored", async () => {
  const body = envelope({
    endpoint: "keys",
    claimClass: "OBSERVED",
    capitalKind: "NOT_APPLICABLE_SERVICE_STATUS",
    error: { code: "store_unavailable", message: "The key store is unavailable; try again shortly" },
  });
  const fetchImpl = fakeFetch([{ status: 503, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl });

  const result = await toolGetKey(session, {});

  assert.deepEqual(parsedText(result), body);
  assert.equal(session.key, undefined);
});

test("get_key: quota 429 passthrough (issuance exhausted), no key stored", async () => {
  const body = envelope({
    endpoint: "keys",
    claimClass: "OBSERVED",
    capitalKind: "NOT_APPLICABLE_SERVICE_STATUS",
    error: { code: "issuance_exhausted", message: "At most 5 keys per client per UTC day" },
  });
  const fetchImpl = fakeFetch([{ status: 429, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl });

  const result = await toolGetKey(session, {});

  assert.deepEqual(parsedText(result), body);
  assert.equal(session.key, undefined);
});

test("get_key: CANLI_KEY set skips the network call entirely", async () => {
  const session = createSession({ base: "https://example.test", fetchImpl: neverFetch, envKey: "ck_live_from_env" });

  const result = await toolGetKey(session, {});

  const parsed = parsedText(result);
  assert.equal(parsed.key_present, true);
  assert.equal(parsed.key_source, "CANLI_KEY");
});

// ---------------------------------------------------------------------------------------------
// validate_deflated_sharpe
// ---------------------------------------------------------------------------------------------

const RETURN_SERIES_INPUT = {
  returns: [0.004, -0.002, 0.007, 0.001, -0.003, 0.005, 0.002, -0.001],
  periods_per_year: 252,
  effective_independent_trials: 30,
  cross_trial_sharpe_sd_annualized: 0.5,
};

test("validate_deflated_sharpe: success envelope passthrough and the input is forwarded as sent", async () => {
  const body = envelope({
    endpoint: "validate/deflated-sharpe",
    data: { input_mode: "return_series", result: { deflated_sharpe_ratio: 0.58 }, plain_reading: "..." },
    receipt: { id: "a".repeat(24), url: "https://canlicapital.com/api/v1/receipts/" + "a".repeat(24), input_sha256: "sha256:x", output_sha256: "sha256:y" },
  });
  const fetchImpl = fakeFetch([{ status: 200, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateDeflatedSharpe(session, RETURN_SERIES_INPUT);

  assert.deepEqual(parsedText(result), compactEnvelope(body));
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), RETURN_SERIES_INPUT);
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, "Bearer ck_live_env");
});

test("validate_deflated_sharpe: error envelope passthrough (invalid input)", async () => {
  const body = envelope({
    endpoint: "validate/deflated-sharpe",
    error: { code: "invalid_input", message: "A series with zero variance has no Sharpe ratio" },
  });
  const fetchImpl = fakeFetch([{ status: 422, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateDeflatedSharpe(session, RETURN_SERIES_INPUT);

  assert.deepEqual(parsedText(result), compactEnvelope(body));
});

test("validate_deflated_sharpe: quota 429 passthrough", async () => {
  const body = envelope({
    endpoint: "validate/deflated-sharpe",
    error: { code: "quota_exhausted", message: "Daily quota of 1000 validations reached" },
  });
  const fetchImpl = fakeFetch([{ status: 429, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateDeflatedSharpe(session, RETURN_SERIES_INPUT);

  assert.deepEqual(parsedText(result), compactEnvelope(body));
});

test("validate_deflated_sharpe: a mixed input is rejected client-side, before any fetch", async () => {
  const session = createSession({ base: "https://example.test", fetchImpl: neverFetch, envKey: "ck_live_env" });
  const mixed = { ...RETURN_SERIES_INPUT, observed_sharpe_annualized: 1.0 };

  await assert.rejects(() => toolValidateDeflatedSharpe(session, mixed), /never a mix of both/);
});

test("validate_deflated_sharpe: without any key, the real 401 envelope is still returned verbatim", async () => {
  const body = envelope({
    endpoint: "validate/deflated-sharpe",
    error: { code: "unauthorized", message: "Send Authorization: Bearer ck_live_... from POST /api/v1/keys" },
  });
  const fetchImpl = fakeFetch([{ status: 401, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl });

  const result = await toolValidateDeflatedSharpe(session, RETURN_SERIES_INPUT);

  assert.deepEqual(parsedText(result), compactEnvelope(body));
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, undefined);
});

// ---------------------------------------------------------------------------------------------
// validate_overfitting
// ---------------------------------------------------------------------------------------------

const OVERFITTING_INPUT = {
  matrix: [
    [0.01, 0.002, -0.004],
    [-0.003, 0.001, 0.006],
    [0.004, -0.002, 0.001],
    [0.002, 0.003, -0.001],
  ],
  n_splits: 4,
};

test("validate_overfitting: success envelope passthrough", async () => {
  const body = envelope({ endpoint: "validate/overfitting", data: { pbo: 0.4 } });
  const fetchImpl = fakeFetch([{ status: 200, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateOverfitting(session, OVERFITTING_INPUT);

  assert.deepEqual(parsedText(result), compactEnvelope(body));
});

test("validate_overfitting: error envelope passthrough", async () => {
  const body = envelope({ endpoint: "validate/overfitting", error: { code: "invalid_input", message: "A matrix may hold at most 200 variants" } });
  const fetchImpl = fakeFetch([{ status: 422, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateOverfitting(session, OVERFITTING_INPUT);

  assert.deepEqual(parsedText(result), compactEnvelope(body));
});

test("validate_overfitting: quota 429 passthrough", async () => {
  const body = envelope({ endpoint: "validate/overfitting", error: { code: "quota_exhausted", message: "Daily quota of 1000 validations reached" } });
  const fetchImpl = fakeFetch([{ status: 429, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateOverfitting(session, OVERFITTING_INPUT);

  assert.deepEqual(parsedText(result), compactEnvelope(body));
});

// ---------------------------------------------------------------------------------------------
// validate_paper_evidence
// ---------------------------------------------------------------------------------------------

const PAPER_EVIDENCE_INPUT = { record: { schema: "canli.paper-evidence.v0" } };

test("validate_paper_evidence: success envelope passthrough", async () => {
  const body = envelope({ endpoint: "validate/paper-evidence", data: { valid: false, structural: ["..."] } });
  const fetchImpl = fakeFetch([{ status: 200, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidatePaperEvidence(session, PAPER_EVIDENCE_INPUT);

  assert.deepEqual(parsedText(result), compactEnvelope(body));
});

test("validate_paper_evidence: error envelope passthrough", async () => {
  const body = envelope({ endpoint: "validate/paper-evidence", error: { code: "invalid_input", message: 'Send the record to validate under the key "record"' } });
  const fetchImpl = fakeFetch([{ status: 422, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidatePaperEvidence(session, PAPER_EVIDENCE_INPUT);

  assert.deepEqual(parsedText(result), compactEnvelope(body));
});

test("validate_paper_evidence: quota 429 passthrough", async () => {
  const body = envelope({ endpoint: "validate/paper-evidence", error: { code: "quota_exhausted", message: "Daily quota of 1000 validations reached" } });
  const fetchImpl = fakeFetch([{ status: 429, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidatePaperEvidence(session, PAPER_EVIDENCE_INPUT);

  assert.deepEqual(parsedText(result), compactEnvelope(body));
});

// ---------------------------------------------------------------------------------------------
// validate_track_record
// ---------------------------------------------------------------------------------------------

const TRACK_RECORD_INPUT = { observed_sharpe_annualized: 2, benchmark_sharpe_annualized: 1, periods_per_year: 252, skew: 0, non_excess_kurtosis: 3, observations: 504 };

test("validate_track_record: success envelope passthrough to the track-record route", async () => {
  const body = envelope({ endpoint: "validate/track-record", data: { result: { minimum_observations: 689 } } });
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), body: init?.body }); return new Response(JSON.stringify(body), { status: 200 }); };
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });
  const result = await toolValidateTrackRecord(session, TRACK_RECORD_INPUT);
  assert.deepEqual(parsedText(result), compactEnvelope(body));
  assert.equal(calls[0].url, "https://example.test/api/v1/validate/track-record");
  assert.deepEqual(JSON.parse(calls[0].body), TRACK_RECORD_INPUT);
});

test("validate_track_record: error envelope passthrough", async () => {
  const body = envelope({ endpoint: "validate/track-record", error: { code: "invalid_input", message: "The observed Sharpe must exceed the benchmark" } });
  const fetchImpl = fakeFetch([{ status: 422, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });
  const result = await toolValidateTrackRecord(session, TRACK_RECORD_INPUT);
  assert.deepEqual(parsedText(result), compactEnvelope(body));
});

test("validate_track_record: rejects an unknown field before any request", async () => {
  let called = false;
  const session = createSession({ base: "https://example.test", fetchImpl: async () => { called = true; }, envKey: "ck_live_env" });
  await assert.rejects(toolValidateTrackRecord(session, { ...TRACK_RECORD_INPUT, surprise: 1 }), /validate_track_record/);
  assert.equal(called, false);
});

// ---------------------------------------------------------------------------------------------
// validate_backtest_length
// ---------------------------------------------------------------------------------------------

const BACKTEST_LENGTH_INPUT = { effective_independent_trials: 45, backtest_years: 5, target_sharpe_annualized: 1 };

test("validate_backtest_length: success envelope passthrough to the backtest-length route", async () => {
  const body = envelope({ endpoint: "validate/backtest-length", data: { result: { maximum_independent_trials: 45 } } });
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), body: init?.body }); return new Response(JSON.stringify(body), { status: 200 }); };
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });
  const result = await toolValidateBacktestLength(session, BACKTEST_LENGTH_INPUT);
  assert.deepEqual(parsedText(result), compactEnvelope(body));
  assert.equal(calls[0].url, "https://example.test/api/v1/validate/backtest-length");
  assert.deepEqual(JSON.parse(calls[0].body), BACKTEST_LENGTH_INPUT);
});

test("validate_backtest_length: error envelope and quota passthrough", async () => {
  for (const [status, error] of [[422, { code: "invalid_input", message: "Send effective_independent_trials, backtest_years, or both" }], [429, { code: "quota_exceeded", message: "quota" }]]) {
    const body = envelope({ endpoint: "validate/backtest-length", error });
    const session = createSession({ base: "https://example.test", fetchImpl: fakeFetch([{ status, body }]), envKey: "ck_live_env" });
    const result = await toolValidateBacktestLength(session, BACKTEST_LENGTH_INPUT);
    assert.equal(result.isError, true);
    assert.deepEqual(parsedText(result), compactEnvelope(body));
  }
});

test("validate_backtest_length: rejects an unknown field or one trial before any request", async () => {
  let called = false;
  const session = createSession({ base: "https://example.test", fetchImpl: async () => { called = true; }, envKey: "ck_live_env" });
  await assert.rejects(toolValidateBacktestLength(session, { ...BACKTEST_LENGTH_INPUT, surprise: 1 }), /validate_backtest_length/);
  await assert.rejects(toolValidateBacktestLength(session, { effective_independent_trials: 1 }), /validate_backtest_length/);
  assert.equal(called, false);
});

// ---------------------------------------------------------------------------------------------
// validate_haircut_sharpe
// ---------------------------------------------------------------------------------------------

const HAIRCUT_INPUT = { observed_sharpe_annualized: 1, periods_per_year: 12, observations: 120, tests: 100, autocorrelation: 0.1 };

test("validate_haircut_sharpe: success passthrough to the haircut-sharpe route", async () => {
  const body = envelope({ endpoint: "validate/haircut-sharpe", data: { result: { bonferroni: { haircut: 0.746 } } } });
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), body: init?.body }); return new Response(JSON.stringify(body), { status: 200 }); };
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });
  const result = await toolValidateHaircutSharpe(session, HAIRCUT_INPUT);
  assert.deepEqual(parsedText(result), compactEnvelope(body));
  assert.equal(calls[0].url, "https://example.test/api/v1/validate/haircut-sharpe");
  assert.deepEqual(JSON.parse(calls[0].body), HAIRCUT_INPUT);
});

test("validate_haircut_sharpe: errors pass through; a non-positive Sharpe or unknown field never leaves", async () => {
  const body = envelope({ endpoint: "validate/haircut-sharpe", error: { code: "invalid_input", message: "Send tests, other_sharpe_ratios_annualized, or both" } });
  const session = createSession({ base: "https://example.test", fetchImpl: fakeFetch([{ status: 422, body }]), envKey: "ck_live_env" });
  const result = await toolValidateHaircutSharpe(session, HAIRCUT_INPUT);
  assert.equal(result.isError, true);
  let called = false;
  const quiet = createSession({ base: "https://example.test", fetchImpl: async () => { called = true; }, envKey: "ck_live_env" });
  await assert.rejects(toolValidateHaircutSharpe(quiet, { ...HAIRCUT_INPUT, observed_sharpe_annualized: -1 }), /validate_haircut_sharpe/);
  await assert.rejects(toolValidateHaircutSharpe(quiet, { ...HAIRCUT_INPUT, surprise: 1 }), /validate_haircut_sharpe/);
  assert.equal(called, false);
});

// ---------------------------------------------------------------------------------------------
// validate_breadth
// ---------------------------------------------------------------------------------------------

const BREADTH_INPUT = { sleeve_sharpe: 0.5, average_pairwise_correlation: 0.05, sleeves: 4, target: 1.5 };

test("validate_breadth: success envelope passthrough", async () => {
  const body = envelope({ endpoint: "validate/breadth", data: { ceiling: 2.236 } });
  const fetchImpl = fakeFetch([{ status: 200, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateBreadth(session, BREADTH_INPUT);

  assert.deepEqual(parsedText(result), compactEnvelope(body));
});

test("validate_breadth: error envelope passthrough", async () => {
  const body = envelope({ endpoint: "validate/breadth", error: { code: "invalid_input", message: "sleeve_sharpe must be a positive number" } });
  const fetchImpl = fakeFetch([{ status: 422, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateBreadth(session, BREADTH_INPUT);

  assert.deepEqual(parsedText(result), compactEnvelope(body));
});

test("validate_breadth: quota 429 passthrough", async () => {
  const body = envelope({ endpoint: "validate/breadth", error: { code: "quota_exhausted", message: "Daily quota of 1000 validations reached" } });
  const fetchImpl = fakeFetch([{ status: 429, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateBreadth(session, BREADTH_INPUT);

  assert.deepEqual(parsedText(result), compactEnvelope(body));
});

// ---------------------------------------------------------------------------------------------
// get_receipt (unkeyed GET, no quota)
// ---------------------------------------------------------------------------------------------

test("get_receipt: success envelope passthrough", async () => {
  const id = "a".repeat(24);
  const body = envelope({ endpoint: `receipts/${id}`, data: { id, endpoint: "/api/v1/validate/breadth" } });
  const fetchImpl = fakeFetch([{ status: 200, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl });

  const result = await toolGetReceipt(session, { id });

  assert.deepEqual(parsedText(result), body);
  assert.equal(fetchImpl.calls[0].url, `https://example.test/api/v1/receipts/${id}`);
  assert.equal(fetchImpl.calls[0].init.method, "GET");
});

test("get_receipt: error envelope passthrough (not found)", async () => {
  const body = envelope({ endpoint: "receipts", error: { code: "not_found", message: "No receipt with that id" } });
  const fetchImpl = fakeFetch([{ status: 404, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl });

  const result = await toolGetReceipt(session, { id: "b".repeat(24) });

  assert.deepEqual(parsedText(result), body);
});

test("get_receipt: a malformed id is rejected client-side, before any fetch", async () => {
  const session = createSession({ base: "https://example.test", fetchImpl: neverFetch });

  await assert.rejects(() => toolGetReceipt(session, { id: "not-hex" }));
});

// ---------------------------------------------------------------------------------------------
// service_status (unkeyed GET, no quota)
// ---------------------------------------------------------------------------------------------

test("service_status: success envelope passthrough", async () => {
  const body = envelope({ endpoint: "validate/status", claimClass: "OBSERVED", capitalKind: "NOT_APPLICABLE_SERVICE_STATUS", data: { service: "validation-api", store_reachable: true } });
  const fetchImpl = fakeFetch([{ status: 200, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl });

  const result = await toolServiceStatus(session);

  assert.deepEqual(parsedText(result), body);
});

test("service_status: error envelope passthrough (store unreachable)", async () => {
  const body = envelope({ endpoint: "validate/status", claimClass: "OBSERVED", capitalKind: "NOT_APPLICABLE_SERVICE_STATUS", data: { service: "validation-api", store_reachable: false } });
  const fetchImpl = fakeFetch([{ status: 503, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl });

  const result = await toolServiceStatus(session);

  assert.deepEqual(parsedText(result), body);
});

// ---------------------------------------------------------------------------------------------
// company_financial_history (public company reference file, no key)
// ---------------------------------------------------------------------------------------------

const COMPANY_RECORD = {
  schema: "canli.company-reference.v1",
  cik: "0000320193",
  name: "Apple Inc.",
  source_url: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json",
  source_sha256: "a".repeat(64),
  fetched_at: "2026-09-19T00:00:00Z",
  policy: "Latest-filed annual-report facts per unit and reporting period at capture time.",
  claim_boundary: COMPANY_REFERENCE_BOUNDARY,
  source_snapshot: `/company-data/sources/${"a".repeat(64)}.json.gz`,
  concepts: [
    { tag: "Assets", taxonomy: "us-gaap", label: "Total assets", kind: "instant", meaning: "Resources recognized on the balance sheet.", observations: [
      { end: "2024-09-28", val: 364980000000, accn: "0000320193-24-000123", fy: 2024, fp: "FY", form: "10-K", filed: "2024-11-01", unit: "USD" },
      { end: "2025-09-27", val: 359241000000, accn: "0000320193-25-000079", fy: 2025, fp: "FY", form: "10-K", filed: "2025-10-31", unit: "USD" },
      { end: "2023-09-30", val: 352583000000, accn: "0000320193-23-000106", fy: 2023, fp: "FY", form: "10-K", filed: "2023-11-03", unit: "USD" },
    ] },
    { tag: "NetIncomeLoss", taxonomy: "us-gaap", label: "Net income", kind: "duration", meaning: "Profit after expenses.", observations: [] },
  ],
};

function companyFetch(status, body, seen) {
  return async (url, init) => {
    seen?.push({ url, init });
    return { status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
  };
}

test("company_financial_history: overview lists histories with provenance and the record's boundary", async () => {
  const seen = [];
  const session = createSession({ base: "https://example.test", fetchImpl: companyFetch(200, COMPANY_RECORD, seen) });
  const result = await toolCompanyFinancialHistory(session, { cik: "320193" });
  assert.equal(result.isError, undefined);
  assert.equal(seen[0].url, "https://example.test/company-data/0000320193.json");
  assert.equal(seen[0].init.redirect, "error");
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.claim_boundary, COMPANY_REFERENCE_BOUNDARY);
  assert.equal(body.source.sec_response_sha256, "a".repeat(64));
  assert.equal(body.source.snapshot, `https://example.test/company-data/sources/${"a".repeat(64)}.json.gz`);
  assert.deepEqual(body.histories.map((h) => [h.concept, h.observations]), [["Assets", 3], ["NetIncomeLoss", 0]]);
  assert.equal(body.histories[0].page, "https://example.test/companies/0000320193/Assets");
});

test("company_financial_history: a concept returns observations newest first, limited, with units", async () => {
  const session = createSession({ base: "https://example.test", fetchImpl: companyFetch(200, COMPANY_RECORD) });
  const body = JSON.parse((await toolCompanyFinancialHistory(session, { cik: "0000320193", concept: "Assets", limit: 2 })).content[0].text);
  const { unit, columns, rows } = body.history.observations;
  assert.equal(unit, "USD");
  assert.deepEqual(columns, ["end", "val", "accn", "fy", "fp", "form", "filed"]);
  assert.deepEqual(rows.map((r) => r[0]), ["2025-09-27", "2024-09-28"]);
  assert.equal(body.history.total_observations, 3);
  assert.equal(body.history.returned, 2);
  assert.deepEqual(body.history.units, ["USD"]);
  assert.equal(rows[0][columns.indexOf("accn")], "0000320193-25-000079");
  assert.equal(body.page, "https://example.test/companies/0000320193/Assets");
});

test("company_financial_history: unknown concept, missing company and foreign records are errors", async () => {
  const unknown = await toolCompanyFinancialHistory(createSession({ base: "https://example.test", fetchImpl: companyFetch(200, COMPANY_RECORD) }), { cik: "320193", concept: "Goodwill" });
  assert.equal(unknown.isError, true);
  assert.deepEqual(JSON.parse(unknown.content[0].text).error.available, ["Assets", "NetIncomeLoss"]);
  const missing = await toolCompanyFinancialHistory(createSession({ base: "https://example.test", fetchImpl: companyFetch(404, "Company source not found") }), { cik: "9999999999" });
  assert.equal(missing.isError, true);
  assert.equal(JSON.parse(missing.content[0].text).error.code, "not_found");
  const foreign = await toolCompanyFinancialHistory(createSession({ base: "https://example.test", fetchImpl: companyFetch(200, { ...COMPANY_RECORD, cik: "0000000001" }) }), { cik: "320193" });
  assert.equal(foreign.isError, true);
  assert.equal(JSON.parse(foreign.content[0].text).error.code, "unexpected_record");
  const down = await toolCompanyFinancialHistory(createSession({ base: "https://example.test", fetchImpl: companyFetch(503, "unavailable") }), { cik: "320193" });
  assert.equal(down.isError, true);
  await assert.rejects(toolCompanyFinancialHistory(createSession({ base: "https://example.test", fetchImpl: companyFetch(200, COMPANY_RECORD) }), { cik: "AAPL" }), /CIK is 1 to 10 digits/);
});

test("compact context: results are minified JSON that keep every field", async () => {
  const session = createSession({ base: "https://example.test", fetchImpl: companyFetch(200, COMPANY_RECORD) });
  const text = (await toolCompanyFinancialHistory(session, { cik: "320193", concept: "Assets" })).content[0].text;
  assert.equal(text, JSON.stringify(JSON.parse(text)), "no indentation or spacing");
  const body = JSON.parse(text);
  assert.equal(body.claim_boundary, COMPANY_REFERENCE_BOUNDARY);
  assert.equal(body.source.sec_response_sha256, "a".repeat(64));
});

test("compact context: rows rebuild every observation exactly, and mixed units keep a unit column", () => {
  const observations = COMPANY_RECORD.concepts[0].observations;
  const { unit, columns, rows } = columnarObservations(observations);
  const rebuilt = rows.map((row) => ({ ...Object.fromEntries(columns.map((c, i) => [c, row[i]])), unit }));
  assert.deepEqual(rebuilt, observations);
  const mixed = columnarObservations([{ ...observations[0] }, { ...observations[1], unit: "shares" }]);
  assert.equal(mixed.unit, undefined);
  assert.equal(mixed.columns.at(-1), "unit");
  assert.deepEqual(mixed.rows.map((r) => r.at(-1)), ["USD", "shares"]);
});

test("an empty or unsubstituted CANLI_KEY is no key", async () => {
  const { configuredKey } = await import("../src/server.mjs");
  assert.equal(configuredKey(undefined), undefined);
  assert.equal(configuredKey(""), undefined);
  assert.equal(configuredKey("  "), undefined);
  assert.equal(configuredKey("${user_config.api_key}"), undefined);
  assert.equal(configuredKey("canli_realkey123"), "canli_realkey123");
});

// company_financial_history by ticker: resolved through /api/v1/company-tickers.json once per session.
function tickerAwareFetch(record, seen) {
  const index = { schema: "canli.company-tickers.v1", tickers: { AAPL: "0000320193" } };
  return async (url) => {
    seen.push(String(url));
    const body = String(url).endsWith("/api/v1/company-tickers.json") ? index : record;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

test("company_financial_history: a ticker resolves to its CIK through the published index, fetched once", async () => {
  const seen = [];
  const session = createSession({ base: "https://example.test", fetchImpl: tickerAwareFetch(COMPANY_RECORD, seen) });
  const first = await toolCompanyFinancialHistory(session, { ticker: "aapl" });
  assert.ok(!first.isError);
  await toolCompanyFinancialHistory(session, { ticker: "AAPL", concept: "Assets" });
  assert.deepEqual(seen, [
    "https://example.test/api/v1/company-tickers.json",
    "https://example.test/company-data/0000320193.json",
    "https://example.test/company-data/0000320193.json",
  ]);
});

test("company_financial_history: an unknown ticker is an error naming the ticker", async () => {
  const session = createSession({ base: "https://example.test", fetchImpl: tickerAwareFetch(COMPANY_RECORD, []) });
  const result = await toolCompanyFinancialHistory(session, { ticker: "ZZZZ" });
  assert.equal(result.isError, true);
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.error.code, "unknown_ticker");
  assert.match(body.error.message, /ZZZZ/);
});

test("company_financial_history: exactly one of cik or ticker", async () => {
  const session = createSession({ base: "https://example.test", fetchImpl: tickerAwareFetch(COMPANY_RECORD, []) });
  await assert.rejects(toolCompanyFinancialHistory(session, { cik: "320193", ticker: "AAPL" }), /exactly one of cik or ticker/);
  await assert.rejects(toolCompanyFinancialHistory(session, {}), /exactly one of cik or ticker/);
});

// ---------------------------------------------------------------------------------------------
// compact validation results
// ---------------------------------------------------------------------------------------------

const FULL_VALIDATION = envelope({
  endpoint: "validate/breadth",
  data: { ceiling: 2.236, plain_reading: "R" },
  receipt: { id: "a".repeat(24), url: `https://canlicapital.com/api/v1/receipts/${"a".repeat(24)}`, input_sha256: "sha256:x", output_sha256: "sha256:y" },
});

test("compact results keep the answer, every boundary sentence but the quota line, and the receipt link", () => {
  const compact = compactEnvelope(FULL_VALIDATION);
  assert.deepEqual(Object.keys(compact).sort(), ["data", "limits", "receipt"]);
  assert.deepEqual(compact.data, FULL_VALIDATION.data);
  assert.deepEqual(compact.limits, LIMITS_TEXT.filter((s) => !s.startsWith("Quotas:")));
  assert.equal(compact.limits.length, LIMITS_TEXT.length - 1);
  assert.deepEqual(compact.receipt, { id: FULL_VALIDATION.receipt.id, url: FULL_VALIDATION.receipt.url });
  assert.ok(JSON.stringify(compact).length < JSON.stringify(FULL_VALIDATION).length * 0.8);
});

test("an error result keeps its error, and a local result says it was computed locally", () => {
  const failed = compactEnvelope(envelope({ endpoint: "validate/breadth", error: { code: "quota_exhausted", message: "q" } }));
  assert.deepEqual(failed.error, { code: "quota_exhausted", message: "q" });
  const local = compactEnvelope({ schema: "canli.local.v1", computed: "locally", note: "N", limits: LIMITS_TEXT, receipt: null, data: { x: 1 }, error: null });
  assert.deepEqual(local, { computed: "locally", note: "N", data: { x: 1 }, limits: LIMITS_TEXT.slice(0, 3), receipt: null });
});

test("CANLI_FULL_ENVELOPE (fullEnvelope) returns the API's envelope unchanged", async () => {
  const session = createSession({ base: "https://example.test", fetchImpl: fakeFetch([{ status: 200, body: FULL_VALIDATION }]), envKey: "ck_live_env", fullEnvelope: true });
  assert.deepEqual(parsedText(await toolValidateBreadth(session, BREADTH_INPUT)), FULL_VALIDATION);
});

test("get_receipt and service_status are never compacted: they are where the full record lives", async () => {
  const receipt = envelope({ endpoint: "receipts/x", data: { bindings: { "js/dsr-core.js": "sha256:z" } } });
  const s1 = createSession({ base: "https://example.test", fetchImpl: fakeFetch([{ status: 200, body: receipt }]) });
  assert.deepEqual(parsedText(await toolGetReceipt(s1, { id: "a".repeat(24) })), receipt);
  const status = envelope({ endpoint: "validate/status", data: { ok: true } });
  const s2 = createSession({ base: "https://example.test", fetchImpl: fakeFetch([{ status: 200, body: status }]) });
  assert.deepEqual(parsedText(await toolServiceStatus(s2)), status);
});

// ---------------------------------------------------------------------------------------------
// verify_receipt
// ---------------------------------------------------------------------------------------------

import { generateKeyPairSync, sign as signBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { keyIdFor, outputSha256, receiptId, receiptStatement, SIGNATURE_SCHEMA } from "../src/local/js/receipt-statement.js";
import { toolVerifyReceipt } from "../src/server.mjs";

function signedReceipt() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const x = publicKey.export({ format: "jwk" }).x;
  const key = { key_id: keyIdFor(Buffer.from(x, "base64url")), alg: "Ed25519", x, status: "active" };
  const output = { ceiling: 2.236 };
  const bindings = { "js/validate/breadth.js": "sha256:bb" };
  const input_sha256 = "sha256:in";
  const id = receiptId({ endpoint: "validate/breadth", input_sha256, output, bindings });
  const statement = receiptStatement({ id, endpoint: "validate/breadth", input_sha256, output_sha256: outputSha256(output), bindings });
  const value = signBytes(null, Buffer.from(statement), privateKey).toString("base64url");
  const data = { id, endpoint: "/api/v1/validate/breadth", input_sha256, output, output_sha256: outputSha256(output), bindings, signature: { alg: "Ed25519", schema: SIGNATURE_SCHEMA, key_id: key.key_id, value } };
  return { key, data };
}

test("verify_receipt: a receipt fetched by id verifies against the trusted key; only the fetch touches the network", async () => {
  const { key, data } = signedReceipt();
  const fetchImpl = fakeFetch([{ status: 200, body: envelope({ endpoint: `receipts/${data.id}`, data }) }]);
  const session = createSession({ base: "https://example.test", fetchImpl, receiptKeys: [key] });
  const out = parsedText(await toolVerifyReceipt(session, { id: data.id }));
  assert.equal(out.valid, true);
  assert.deepEqual(out.checks, { id_matches_content: true, signature_valid: true, key_published: true });
  assert.equal(fetchImpl.calls.length, 1);
  assert.match(fetchImpl.calls[0].url, /\/api\/v1\/receipts\/[0-9a-f]{24}$/);
});

test("verify_receipt: a receipt passed in verifies offline, and a changed number or an unknown key fails", async () => {
  const { key, data } = signedReceipt();
  const session = createSession({ base: "https://example.test", fetchImpl: neverFetch, receiptKeys: [key] });
  assert.equal(parsedText(await toolVerifyReceipt(session, { receipt: data })).valid, true);
  const changed = parsedText(await toolVerifyReceipt(session, { receipt: { ...data, output: { ceiling: 3 } } }));
  assert.equal(changed.valid, false);
  assert.equal(changed.checks.id_matches_content, false);
  const stranger = createSession({ base: "https://example.test", fetchImpl: neverFetch, receiptKeys: [signedReceipt().key] });
  const unknown = parsedText(await toolVerifyReceipt(stranger, { receipt: data }));
  assert.equal(unknown.valid, false);
  assert.equal(unknown.checks.key_published, false);
});

test("verify_receipt: exactly one of id or receipt, and a missing receipt's error passes through", async () => {
  const session = createSession({ base: "https://example.test", fetchImpl: fakeFetch([{ status: 404, body: envelope({ endpoint: "receipts/x", error: { code: "not_found", message: "No receipt with that id" } }) }]) });
  await assert.rejects(toolVerifyReceipt(session, {}), /exactly one of id or receipt/);
  await assert.rejects(toolVerifyReceipt(session, { id: "a".repeat(24), receipt: {} }), /exactly one of id or receipt/);
  const missing = await toolVerifyReceipt(session, { id: "a".repeat(24) });
  assert.equal(missing.isError, true);
  assert.equal(parsedText(missing).error.code, "not_found");
});

test("the bundled receipt keys are the published ones", () => {
  const bundled = JSON.parse(readFileSync(new URL("../src/receipt-keys.json", import.meta.url), "utf8"));
  assert.equal(bundled.schema, "canli.receipt-keys.v1");
  for (const k of bundled.keys) assert.equal(keyIdFor(Buffer.from(k.x, "base64url")), k.key_id);
});
