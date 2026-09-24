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
  toolValidateDeflatedSharpe,
  toolValidateOverfitting,
  toolValidatePaperEvidence,
  toolCompanyFinancialHistory,
  columnarObservations,
} from "../src/server.mjs";
import { COMPANY_REFERENCE_BOUNDARY } from "../src/schemas.mjs";

const LIMITS_TEXT = [
  "This verdict is about the series exactly as submitted. The service never saw the data source, its costs, survivorship, or any lookahead in how the series was built.",
  "A deflated Sharpe or overfitting probability above or below any threshold is not admission to anything and is not a forecast.",
  "The receipt is content-hashed and reproducible from the open-source core it names. It is not signed.",
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

  assert.deepEqual(parsedText(result), body);
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

  assert.deepEqual(parsedText(result), body);
});

test("validate_deflated_sharpe: quota 429 passthrough", async () => {
  const body = envelope({
    endpoint: "validate/deflated-sharpe",
    error: { code: "quota_exhausted", message: "Daily quota of 1000 validations reached" },
  });
  const fetchImpl = fakeFetch([{ status: 429, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateDeflatedSharpe(session, RETURN_SERIES_INPUT);

  assert.deepEqual(parsedText(result), body);
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

  assert.deepEqual(parsedText(result), body);
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

  assert.deepEqual(parsedText(result), body);
});

test("validate_overfitting: error envelope passthrough", async () => {
  const body = envelope({ endpoint: "validate/overfitting", error: { code: "invalid_input", message: "A matrix may hold at most 200 variants" } });
  const fetchImpl = fakeFetch([{ status: 422, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateOverfitting(session, OVERFITTING_INPUT);

  assert.deepEqual(parsedText(result), body);
});

test("validate_overfitting: quota 429 passthrough", async () => {
  const body = envelope({ endpoint: "validate/overfitting", error: { code: "quota_exhausted", message: "Daily quota of 1000 validations reached" } });
  const fetchImpl = fakeFetch([{ status: 429, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateOverfitting(session, OVERFITTING_INPUT);

  assert.deepEqual(parsedText(result), body);
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

  assert.deepEqual(parsedText(result), body);
});

test("validate_paper_evidence: error envelope passthrough", async () => {
  const body = envelope({ endpoint: "validate/paper-evidence", error: { code: "invalid_input", message: 'Send the record to validate under the key "record"' } });
  const fetchImpl = fakeFetch([{ status: 422, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidatePaperEvidence(session, PAPER_EVIDENCE_INPUT);

  assert.deepEqual(parsedText(result), body);
});

test("validate_paper_evidence: quota 429 passthrough", async () => {
  const body = envelope({ endpoint: "validate/paper-evidence", error: { code: "quota_exhausted", message: "Daily quota of 1000 validations reached" } });
  const fetchImpl = fakeFetch([{ status: 429, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidatePaperEvidence(session, PAPER_EVIDENCE_INPUT);

  assert.deepEqual(parsedText(result), body);
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

  assert.deepEqual(parsedText(result), body);
});

test("validate_breadth: error envelope passthrough", async () => {
  const body = envelope({ endpoint: "validate/breadth", error: { code: "invalid_input", message: "sleeve_sharpe must be a positive number" } });
  const fetchImpl = fakeFetch([{ status: 422, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateBreadth(session, BREADTH_INPUT);

  assert.deepEqual(parsedText(result), body);
});

test("validate_breadth: quota 429 passthrough", async () => {
  const body = envelope({ endpoint: "validate/breadth", error: { code: "quota_exhausted", message: "Daily quota of 1000 validations reached" } });
  const fetchImpl = fakeFetch([{ status: 429, body }]);
  const session = createSession({ base: "https://example.test", fetchImpl, envKey: "ck_live_env" });

  const result = await toolValidateBreadth(session, BREADTH_INPUT);

  assert.deepEqual(parsedText(result), body);
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
