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
} from "../src/server.mjs";

const LIMITS_TEXT = [
  "This verdict is about the series exactly as submitted. The service never saw the data source, its costs, survivorship, or any lookahead in how the series was built.",
  "A deflated Sharpe or overfitting probability above or below any threshold is not admission to anything and is not a forecast.",
  "The receipt is content-hashed and reproducible from the open-source core it names. It is not signed.",
  "Quotas: 1000 validations per key per UTC day, 5 keys per client per UTC day, 1048576 bytes per request, 20000 observations per series, 200 variants per matrix.",
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
