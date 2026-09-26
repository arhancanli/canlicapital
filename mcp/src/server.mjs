#!/usr/bin/env node
// mcp/src/server.mjs
//
// stdio MCP server over canlicapital.com's free validation API. Every tool returns the FULL API
// envelope as its result text, success or error, so an agent cannot see a number without the
// sentences beside it that say what the number does not establish (see schemas.mjs, LIMITS_SENTENCES
// and TOOL_DESCRIPTIONS). Reads CANLI_API_BASE (default https://canlicapital.com) and an optional
// CANLI_KEY; when CANLI_KEY is set, get_key does not call the network.
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { computeLocally } from "./local.mjs";
import { readMatrixFile, readSeriesFile } from "./series-file.mjs";
import { verifyReceipt } from "./local/js/receipt-statement.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  breadthInput,
  trackRecordInput,
  auditBacktestInput,
  verifyReceiptToolShape,
  backtestLengthInput,
  haircutSharpeInput,
  luckTrialsInput,
  auditBacktestToolShape,
  companyHistoryInput,
  companyHistoryToolShape,
  deflatedSharpeInput,
  deflatedSharpeToolShape,
  emptyInput,
  getKeyInput,
  getReceiptInput,
  overfittingInput,
  LIMITS_SENTENCES,
  paperEvidenceInput,
  TOOL_DESCRIPTIONS,
} from "./schemas.mjs";

export const DEFAULT_BASE = "https://canlicapital.com";
export const SERVER_NAME = "canlicapital-validation-mcp";
export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
export const REQUEST_TIMEOUT_MS = 30_000;

// One place a value fails a zod schema turns into a short, readable message instead of a raw
// ZodError, so a thrown error reads well inside an MCP isError result.
function parseOrThrow(schema, value, label) {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  throw new Error(`${label}: ${issues}`);
}

// An empty CANLI_KEY, or an unsubstituted template such as "${user_config.api_key}" (what a
// desktop extension host passes for an optional field the user left unset), is no key at all, not
// a key to send.
export function configuredKey(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" || /^\$\{[^}]*\}$/.test(trimmed) ? undefined : trimmed;
}

// CANLI_LOCAL=1 (or "true") turns on private local mode: the validators run on this machine and
// nothing about the submitted series leaves it. An empty or unsubstituted value is off.
export function configuredLocal(value) {
  const v = configuredKey(value);
  return v === "1" || v?.toLowerCase() === "true";
}

// Toolsets: which tools the server lists. The tool list is re-sent to the model on every turn and
// is most of each turn's prompt (README, "Toolsets"; bench/tool_list_tokens.py measures it), so a
// client that needs one kind of tool can load only that kind. Default: all.
export const TOOLSETS = Object.freeze({
  validate: Object.freeze(["get_key", "validate_deflated_sharpe", "validate_overfitting", "validate_paper_evidence", "validate_breadth", "validate_track_record", "validate_backtest_length", "validate_haircut_sharpe", "validate_luck_trials", "audit_backtest"]),
  receipts: Object.freeze(["get_receipt", "verify_receipt"]),
  company: Object.freeze(["company_financial_history"]),
  status: Object.freeze(["service_status"]),
});

// CANLI_TOOLSETS=validate,company (or ?toolsets= on the hosted endpoint): a comma-separated list of
// TOOLSETS names, or "all". Empty or unsubstituted means all; an unknown name is refused, so a typo
// never silently leaves a client without the tools it asked for.
export function configuredToolsets(value) {
  const v = configuredKey(value);
  if (!v || v.trim().toLowerCase() === "all") return Object.keys(TOOLSETS);
  const names = [...new Set(v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))];
  const unknown = names.filter((n) => !Object.hasOwn(TOOLSETS, n));
  if (unknown.length || !names.length) throw new Error(`Unknown toolset ${unknown.join(", ") || "(none)"}; choose from ${Object.keys(TOOLSETS).join(", ")} or all`);
  return names;
}

export function createSession({ base, fetchImpl, envKey, timeoutMs = REQUEST_TIMEOUT_MS, hosted, local, fullEnvelope, receiptKeys, toolsets } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("Request timeout must be a positive integer");
  return {
    base: base ?? process.env.CANLI_API_BASE ?? DEFAULT_BASE,
    fetchImpl: fetchImpl ?? fetch,
    envKey: envKey ?? configuredKey(process.env.CANLI_KEY),
    key: undefined,
    timeoutMs,
    // Set by the hosted endpoint (api/mcp.js): which key a request runs under, so get_key can say
    // so instead of issuing a key the next stateless request would never see.
    hosted: hosted ?? undefined,
    local: local ?? configuredLocal(process.env.CANLI_LOCAL),
    fullEnvelope: fullEnvelope ?? configuredFullEnvelope(process.env.CANLI_FULL_ENVELOPE),
    // Tests pass their own keys; everyone else verifies against the bundled published keys.
    receiptKeys: receiptKeys ?? undefined,
    toolsets: toolsets ?? configuredToolsets(process.env.CANLI_TOOLSETS),
  };
}

async function callApi(session, { path, method = "GET", body }) {
  const headers = { "Content-Type": "application/json" };
  const key = session.key ?? session.envKey;
  if (key) headers.Authorization = `Bearer ${key}`;
  const signal = AbortSignal.timeout(session.timeoutMs);
  const init = { method, headers, signal, redirect: "error" };
  if (body !== undefined) init.body = JSON.stringify(body);
  let res, text;
  try {
    res = await session.fetchImpl(`${session.base}${path}`, init);
    text = await res.text();
  } catch {
    throw new Error(signal.aborted
      ? `${path} exceeded the request deadline. The server may have processed the request; no automatic retry was sent.`
      : `${path} could not be reached or read. Check the API base and service status; no automatic retry was sent.`);
  }
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned a non-JSON body (status ${res.status}). Response body omitted.`);
  }
  return { envelope, failed: res.status >= 400 || Boolean(envelope?.error) };
}

// Compact context (0.3.0): minified JSON. Indentation is whitespace an agent pays for in tokens and
// never reads; every field, boundary sentence and provenance value is kept. Measured on the live
// Apple StockholdersEquity record (README, "Compact context"): 2,214 -> 1,560 tokens minified,
// 1,056 with the columnar history below.
// Every result carries the envelope twice: as text, which every client shows, and as structured
// content, which a client can read field by field. The two are the same object.
const asText = (envelope, failed = false) => ({
  content: [{ type: "text", text: JSON.stringify(envelope) }],
  ...(envelope && typeof envelope === "object" && !Array.isArray(envelope) ? { structuredContent: envelope } : {}),
  ...(failed ? { isError: true } : {}),
});

// A validation result as the model reads it: the answer, the sentences saying what it does not
// establish, and the receipt that holds the rest. Metadata (schema, endpoint, timestamps, claim and
// capital class, human page), the source hashes and the quota sentence are about the service, not
// the answer; they stay in the stored receipt (get_receipt) and service_status, and
// CANLI_FULL_ENVELOPE=1 returns every field. On a result this cuts the text roughly in half.
const QUOTA_SENTENCE = /^Quotas:/;

export function compactEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return envelope;
  const out = {};
  if (envelope.computed) { out.computed = envelope.computed; out.note = envelope.note; }
  if ("data" in envelope) out.data = envelope.data;
  if (envelope.error) out.error = envelope.error;
  if (Array.isArray(envelope.limits)) out.limits = envelope.limits.filter((s) => !QUOTA_SENTENCE.test(s));
  if ("receipt" in envelope) out.receipt = envelope.receipt ? { id: envelope.receipt.id, url: envelope.receipt.url } : null;
  return out;
}

export function configuredFullEnvelope(value) {
  return value === "1" || value === "true";
}

const validationText = (session, { envelope, failed }) => asText(session.fullEnvelope ? envelope : compactEnvelope(envelope), failed);

// A history's observations as one header and one row each, instead of every field name repeated
// on every observation. The column order is fixed so a row can be read without its keys; a unit
// shared by every row is stated once.
export const OBSERVATION_COLUMNS = ["end", "val", "accn", "fy", "fp", "form", "filed", "unit"];

export function columnarObservations(observations) {
  const units = [...new Set(observations.map((o) => o.unit))];
  const columns = units.length === 1 ? OBSERVATION_COLUMNS.filter((c) => c !== "unit") : OBSERVATION_COLUMNS;
  return {
    ...(units.length === 1 ? { unit: units[0] } : {}),
    columns,
    rows: observations.map((o) => columns.map((c) => o[c] ?? null)),
  };
}

export async function toolGetKey(session, args) {
  const { label } = parseOrThrow(getKeyInput, args, "get_key");
  if (session.local) {
    // Local mode computes the validators on this machine; issuing a key would be a network call
    // the user turned local mode on to avoid, and would spend the per-client issuance quota.
    return asText({
      note: "Local mode is on: the validators run on this machine and need no key. No key was issued and no request was sent.",
      key_source: "local",
      key_present: false,
    });
  }
  if (session.hosted) {
    // The hosted endpoint is stateless: a key issued here would be gone by the next request, and
    // every hosted caller shares the platform's egress address and so its per-client issuance quota.
    const ownKey = "get a free key at https://canlicapital.com/developers#quickstart and send it as 'Authorization: Bearer <key>' to this endpoint";
    const notes = {
      caller: "This hosted session runs under the key in your Authorization header; no new key was issued.",
      shared: `This hosted session runs under a shared anonymous key with a shared daily quota; no new key was issued. For your own quota, ${ownKey}.`,
      none: `This hosted endpoint has no shared key configured, so validations need your own key: ${ownKey}.`,
    };
    return asText({
      note: notes[session.hosted.keySource] ?? notes.none,
      key_source: session.hosted.keySource,
      key_present: session.hosted.keySource !== "none",
    });
  }
  if (session.envKey) {
    return asText({
      note: "CANLI_KEY is set in the environment; no new key was issued and no request was sent. Using the configured key for this session.",
      key_source: "CANLI_KEY",
      key_present: true,
    });
  }
  const response = await callApi(session, { path: "/api/v1/keys", method: "POST", body: { label } });
  if (!response.failed && response.envelope?.data?.key) session.key = response.envelope.data.key;
  return asText(response.envelope, response.failed);
}

export async function toolValidateDeflatedSharpe(session, args) {
  const parsed = deflatedSharpeInput.safeParse(args ?? {});
  if (!parsed.success) {
    throw new Error(
      "Send either the seven contract inputs (observed_sharpe_annualized, observations, periods_per_year, skew, non_excess_kurtosis, effective_independent_trials, cross_trial_sharpe_sd_annualized) " +
        "or a return series (returns, periods_per_year, effective_independent_trials, cross_trial_sharpe_sd_annualized), never a mix of both and never neither.",
    );
  }
  if (session.local) { const local = computeLocally("validate_deflated_sharpe", parsed.data); return validationText(session, local); }
  const response = await callApi(session, { path: "/api/v1/validate/deflated-sharpe", method: "POST", body: parsed.data });
  return validationText(session, response);
}

export async function toolValidateOverfitting(session, args) {
  const body = parseOrThrow(overfittingInput, args, "validate_overfitting");
  if (session.local) { const local = computeLocally("validate_overfitting", body); return validationText(session, local); }
  const response = await callApi(session, { path: "/api/v1/validate/overfitting", method: "POST", body });
  return validationText(session, response);
}

export async function toolValidatePaperEvidence(session, args) {
  const body = parseOrThrow(paperEvidenceInput, args, "validate_paper_evidence");
  if (session.local) { const local = computeLocally("validate_paper_evidence", body); return validationText(session, local); }
  const response = await callApi(session, { path: "/api/v1/validate/paper-evidence", method: "POST", body });
  return validationText(session, response);
}

export async function toolValidateBreadth(session, args) {
  const body = parseOrThrow(breadthInput, args, "validate_breadth");
  if (session.local) { const local = computeLocally("validate_breadth", body); return validationText(session, local); }
  const response = await callApi(session, { path: "/api/v1/validate/breadth", method: "POST", body });
  return validationText(session, response);
}

export async function toolValidateTrackRecord(session, args) {
  const body = parseOrThrow(trackRecordInput, args, "validate_track_record");
  if (session.local) { const local = computeLocally("validate_track_record", body); return validationText(session, local); }
  const response = await callApi(session, { path: "/api/v1/validate/track-record", method: "POST", body });
  return validationText(session, response);
}

export async function toolValidateBacktestLength(session, args) {
  const body = parseOrThrow(backtestLengthInput, args, "validate_backtest_length");
  if (session.local) { const local = computeLocally("validate_backtest_length", body); return validationText(session, local); }
  const response = await callApi(session, { path: "/api/v1/validate/backtest-length", method: "POST", body });
  return validationText(session, response);
}

export async function toolValidateHaircutSharpe(session, args) {
  const body = parseOrThrow(haircutSharpeInput, args, "validate_haircut_sharpe");
  if (session.local) { const local = computeLocally("validate_haircut_sharpe", body); return validationText(session, local); }
  const response = await callApi(session, { path: "/api/v1/validate/haircut-sharpe", method: "POST", body });
  return validationText(session, response);
}

export async function toolValidateLuckTrials(session, args) {
  const body = parseOrThrow(luckTrialsInput, args, "validate_luck_trials");
  if (session.local) { const local = computeLocally("validate_luck_trials", body); return validationText(session, local); }
  const response = await callApi(session, { path: "/api/v1/validate/luck-trials", method: "POST", body });
  return validationText(session, response);
}

// One validator, run the same way its own tool runs it: on this machine in local mode, otherwise
// through the API (one validation of quota, one receipt).
async function runValidator(session, tool, path, body) {
  if (session.local) return computeLocally(tool, body);
  return callApi(session, { path, method: "POST", body });
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// audit_backtest: deflated Sharpe from the series, then the minimum track record length from the
// Sharpe, skew and kurtosis that check derived, then (with variants) CSCV overfitting. Each check
// keeps its envelope and receipt; the limits every envelope repeats are stated once at the top.
// A refused later check (for example a Sharpe that does not exceed the benchmark) is reported as
// that check's error, not as a failed audit; the audit fails only when the first check does.
export async function toolAuditBacktest(session, args) {
  const input = parseOrThrow(auditBacktestInput, args, "audit_backtest");
  if ((input.returns_file || input.variants_file) && session.hosted) {
    throw new Error("audit_backtest: the hosted endpoint cannot read files on your machine; send returns (and variants) as numbers, or run the server locally with npx -y canli-validation-mcp.");
  }
  const returnsRead = input.returns_file ? readSeriesFile(input.returns_file, input.returns_column) : null;
  const variantsRead = input.variants_file ? readMatrixFile(input.variants_file) : null;
  const returns = input.returns ?? returnsRead.values;
  const variants = input.variants ?? variantsRead?.matrix;
  const { periods_per_year, effective_independent_trials, cross_trial_sharpe_sd_annualized } = input;
  const dsr = await runValidator(session, "validate_deflated_sharpe", "/api/v1/validate/deflated-sharpe", {
    returns, periods_per_year, effective_independent_trials, cross_trial_sharpe_sd_annualized,
  });
  if (dsr.failed) return validationText(session, { envelope: dsr.envelope, failed: true });
  const derived = dsr.envelope?.data?.derived_inputs ?? {};
  const trackBody = {
    observed_sharpe_annualized: derived.observed_sharpe_annualized,
    periods_per_year,
    skew: derived.skew,
    non_excess_kurtosis: derived.non_excess_kurtosis,
    observations: derived.observations,
    ...(input.benchmark_sharpe_annualized !== undefined ? { benchmark_sharpe_annualized: input.benchmark_sharpe_annualized } : {}),
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
  };
  const track = await runValidator(session, "validate_track_record", "/api/v1/validate/track-record", trackBody);
  const overfit = variants
    ? await runValidator(session, "validate_overfitting", "/api/v1/validate/overfitting", {
        matrix: variants,
        ...(input.n_splits !== undefined ? { n_splits: input.n_splits } : {}),
      })
    : null;
  const shape = (e) => (session.fullEnvelope ? e : compactEnvelope(e));
  const envelopes = { deflated_sharpe: shape(dsr.envelope), track_record: shape(track.envelope), ...(overfit ? { overfitting: shape(overfit.envelope) } : {}) };
  const limits = envelopes.deflated_sharpe?.limits;
  const shared = Object.values(envelopes).every((e) => sameJson(e?.limits, limits));
  const checks = Object.fromEntries(
    Object.entries(envelopes).map(([name, e]) => [name, shared ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== "limits")) : e]),
  );
  const readings = Object.fromEntries(
    Object.entries(envelopes).map(([name, e]) => [name, e?.data?.plain_reading ?? e?.error?.message ?? null]),
  );
  return asText({
    schema: "canli.audit.v1",
    note: "Each check is its validator's own result and receipt, side by side. The audit does not grade the strategy.",
    ...(shared ? { limits } : {}),
    readings,
    checks,
    ...(input.returns_file || input.variants_file
      ? { source: {
          ...(returnsRead ? { returns_file: input.returns_file, observations: returns.length, ...(returnsRead.skipped.length ? { skipped_row_counter_columns: returnsRead.skipped } : {}) } : {}),
          ...(variantsRead ? { variants_file: input.variants_file, variants: variants[0].length, periods: variants.length, ...(variantsRead.skipped.length ? { skipped_variant_row_counter_columns: variantsRead.skipped } : {}) } : {}),
        } }
      : {}),
    ...(variants ? {} : { not_run: { overfitting: "Send variants or variants_file (every variant's returns) to add the overfitting check." } }),
  });
}

// The public keys canlicapital.com signs receipts with, as published at
// /.well-known/canli-receipt-keys.json when this package was built; a test keeps the two identical.
const RECEIPT_KEYS = JSON.parse(readFileSync(new URL("./receipt-keys.json", import.meta.url), "utf8"));

// verify_receipt: every check is local; only fetching a receipt by id touches the network.
export async function toolVerifyReceipt(session, args) {
  const input = parseOrThrow(verifyReceiptToolShape, args, "verify_receipt");
  if ((input.id === undefined) === (input.receipt === undefined)) throw new Error("verify_receipt: send exactly one of id or receipt");
  let data = input.receipt;
  if (input.id !== undefined) {
    const response = await callApi(session, { path: `/api/v1/receipts/${input.id}` });
    if (response.failed) return asText(response.envelope, true);
    data = response.envelope?.data;
  }
  const endpoint = String(data?.endpoint ?? "").replace(/^\/api\/v1\//, "");
  const result = verifyReceipt({ ...data, endpoint }, session.receiptKeys ?? RECEIPT_KEYS.keys);
  return asText({
    receipt_id: data?.id ?? null,
    valid: result.valid,
    checks: result.checks,
    key_id: result.key_id,
    keys: "bundled with this package; published at https://canlicapital.com/.well-known/canli-receipt-keys.json",
    meaning: result.valid
      ? "canlicapital.com signed this exact output for this exact input, computed by the source files whose hashes the receipt lists. It says nothing about how the input series was built."
      : "At least one check failed: do not treat this receipt as issued by canlicapital.com for this content.",
  });
}

export async function toolGetReceipt(session, args) {
  const { id } = parseOrThrow(getReceiptInput, args, "get_receipt");
  const response = await callApi(session, { path: `/api/v1/receipts/${id}` });
  return asText(response.envelope, response.failed);
}

export async function toolServiceStatus(session) {
  const response = await callApi(session, { path: "/api/v1/validate/status" });
  return asText(response.envelope, response.failed);
}

// The company reference is a public data file, not an API envelope. The result keeps every
// field that says where a value came from (accession, form, filed date, unit, source hash) and
// the record's own claim_boundary and policy sentences, so an agent cannot quote a number
// without its provenance or boundary.
// Ticker -> CIK through the published index of companies in the release, fetched once per session.
async function resolveTicker(session, ticker) {
  if (!session.tickerIndex) {
    const signal = AbortSignal.timeout(session.timeoutMs);
    let res;
    try {
      res = await session.fetchImpl(`${session.base}/api/v1/company-tickers.json`, { headers: { Accept: "application/json" }, signal, redirect: "error" });
    } catch {
      throw new Error(signal.aborted ? "company_financial_history: the ticker index request timed out" : "company_financial_history: could not reach the ticker index");
    }
    if (!res.ok) throw new Error(`company_financial_history: the ticker index returned HTTP ${res.status}`);
    session.tickerIndex = await res.json();
  }
  const key = ticker.toUpperCase();
  const cik = session.tickerIndex.tickers?.[key];
  if (!cik) {
    return { error: { error: { code: "unknown_ticker", message: `No company in the current company reference release trades as ${key}. Search by name at the page below, or pass the SEC CIK.` }, page: `${session.base}/companies` } };
  }
  return { cik };
}

export async function toolCompanyFinancialHistory(session, args) {
  const { cik, ticker, concept, limit = 40 } = parseOrThrow(companyHistoryInput, args, "company_financial_history");
  let id;
  if (ticker !== undefined) {
    const resolved = await resolveTicker(session, ticker);
    if (resolved.error) return asText(resolved.error, true);
    id = resolved.cik;
  } else {
    id = cik.padStart(10, "0");
  }
  const path = `/company-data/${id}.json`;
  const signal = AbortSignal.timeout(session.timeoutMs);
  let res, text;
  try {
    res = await session.fetchImpl(`${session.base}${path}`, { headers: { Accept: "application/json" }, signal, redirect: "error" });
    text = await res.text();
  } catch {
    throw new Error(signal.aborted
      ? `${path} exceeded the request deadline; no automatic retry was sent.`
      : `${path} could not be reached or read. Check the API base and service status; no automatic retry was sent.`);
  }
  if (res.status === 404) return asText({ error: { code: "not_found", message: `No company record for CIK ${id} in the current company reference release.` }, page: `${session.base}/companies` }, true);
  if (res.status >= 400) return asText({ error: { code: "unavailable", message: `${path} returned status ${res.status}.` } }, true);
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned a non-JSON body (status ${res.status}). Response body omitted.`);
  }
  if (record?.schema !== "canli.company-reference.v1" || record.cik !== id || !Array.isArray(record.concepts) || typeof record.claim_boundary !== "string") {
    return asText({ error: { code: "unexpected_record", message: `${path} did not return a canli.company-reference.v1 record for CIK ${id}.` } }, true);
  }
  const base = {
    schema: "canli.mcp.company-history.v1",
    company: { cik: record.cik, name: record.name },
    claim_boundary: record.claim_boundary,
    policy: record.policy,
    source: {
      sec_response_url: record.source_url,
      sec_response_sha256: record.source_sha256,
      snapshot: record.source_snapshot ? `${session.base}${record.source_snapshot}` : null,
      fetched_at: record.fetched_at,
      record: `${session.base}${path}`,
    },
  };
  if (concept === undefined) {
    return asText({
      ...base,
      page: `${session.base}/companies/${id}`,
      histories: record.concepts.map((c) => ({ concept: c.tag, label: c.label, kind: c.kind, observations: c.observations?.length ?? 0, page: `${session.base}/companies/${id}/${c.tag}` })),
    });
  }
  const history = record.concepts.find((c) => c.tag === concept);
  if (!history) {
    return asText({ ...base, error: { code: "concept_not_found", message: `${record.name} has no ${concept} history in this release.`, available: record.concepts.map((c) => c.tag) } }, true);
  }
  const observations = [...(history.observations ?? [])].sort((a, b) => String(b.end).localeCompare(String(a.end))).slice(0, limit);
  return asText({
    ...base,
    page: `${session.base}/companies/${id}/${history.tag}`,
    history: {
      concept: history.tag,
      taxonomy: history.taxonomy,
      label: history.label,
      kind: history.kind,
      meaning: history.meaning,
      units: [...new Set((history.observations ?? []).map((o) => o.unit))],
      total_observations: history.observations?.length ?? 0,
      returned: observations.length,
      observations: columnarObservations(observations),
    },
  });
}

// MCP tool annotations: every tool reaches the canlicapital.com API (openWorldHint). Reads are
// marked read-only; a validation stores a receipt and get_key creates a key, so neither is
// read-only, and nothing any tool does modifies or deletes a caller's data.
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
const WRITES_RECEIPT = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

export function registerTools(server, session) {
  const enabled = new Set((session.toolsets ?? Object.keys(TOOLSETS)).flatMap((name) => TOOLSETS[name]));
  const register = (name, ...rest) => { if (enabled.has(name)) server.registerTool(name, ...rest); };
  register(
    "get_key",
    { title: "Get a free validation key", annotations: { title: "Get a free validation key", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }, description: TOOL_DESCRIPTIONS.get_key, inputSchema: getKeyInput },
    (args) => toolGetKey(session, args),
  );
  register(
    "validate_deflated_sharpe",
    { title: "Validate deflated Sharpe", annotations: { title: "Validate deflated Sharpe", ...WRITES_RECEIPT }, description: TOOL_DESCRIPTIONS.validate_deflated_sharpe, inputSchema: deflatedSharpeToolShape },
    (args) => toolValidateDeflatedSharpe(session, args),
  );
  register(
    "validate_overfitting",
    { title: "Validate overfitting (CSCV)", annotations: { title: "Validate overfitting (CSCV)", ...WRITES_RECEIPT }, description: TOOL_DESCRIPTIONS.validate_overfitting, inputSchema: overfittingInput },
    (args) => toolValidateOverfitting(session, args),
  );
  register(
    "validate_paper_evidence",
    { title: "Validate paper evidence", annotations: { title: "Validate paper evidence", ...WRITES_RECEIPT }, description: TOOL_DESCRIPTIONS.validate_paper_evidence, inputSchema: paperEvidenceInput },
    (args) => toolValidatePaperEvidence(session, args),
  );
  register(
    "validate_breadth",
    { title: "Validate breadth ceiling", annotations: { title: "Validate breadth ceiling", ...WRITES_RECEIPT }, description: TOOL_DESCRIPTIONS.validate_breadth, inputSchema: breadthInput },
    (args) => toolValidateBreadth(session, args),
  );
  register(
    "validate_track_record",
    { title: "Minimum track record length", annotations: { title: "Minimum track record length", ...WRITES_RECEIPT }, description: TOOL_DESCRIPTIONS.validate_track_record, inputSchema: trackRecordInput },
    (args) => toolValidateTrackRecord(session, args),
  );
  register(
    "validate_backtest_length",
    { title: "Minimum backtest length", annotations: { title: "Minimum backtest length", ...WRITES_RECEIPT }, description: TOOL_DESCRIPTIONS.validate_backtest_length, inputSchema: backtestLengthInput },
    (args) => toolValidateBacktestLength(session, args),
  );
  register(
    "validate_haircut_sharpe",
    { title: "Haircut Sharpe ratio", annotations: { title: "Haircut Sharpe ratio", ...WRITES_RECEIPT }, description: TOOL_DESCRIPTIONS.validate_haircut_sharpe, inputSchema: haircutSharpeInput },
    (args) => toolValidateHaircutSharpe(session, args),
  );
  register(
    "validate_luck_trials",
    { title: "Luck-equivalent trials", annotations: { title: "Luck-equivalent trials", ...WRITES_RECEIPT }, description: TOOL_DESCRIPTIONS.validate_luck_trials, inputSchema: luckTrialsInput },
    (args) => toolValidateLuckTrials(session, args),
  );
  register(
    "audit_backtest",
    { title: "Audit a backtest", annotations: { title: "Audit a backtest", ...WRITES_RECEIPT }, description: TOOL_DESCRIPTIONS.audit_backtest, inputSchema: auditBacktestToolShape },
    (args) => toolAuditBacktest(session, args),
  );
  register(
    "get_receipt",
    { title: "Get a receipt", annotations: { title: "Get a receipt", ...READ_ONLY }, description: TOOL_DESCRIPTIONS.get_receipt, inputSchema: getReceiptInput },
    (args) => toolGetReceipt(session, args),
  );
  register(
    "verify_receipt",
    { title: "Verify a receipt", annotations: { title: "Verify a receipt", ...READ_ONLY }, description: TOOL_DESCRIPTIONS.verify_receipt, inputSchema: verifyReceiptToolShape },
    (args) => toolVerifyReceipt(session, args),
  );
  register(
    "service_status",
    { title: "Service status", annotations: { title: "Service status", ...READ_ONLY }, description: TOOL_DESCRIPTIONS.service_status, inputSchema: emptyInput },
    () => toolServiceStatus(session),
  );
  register(
    "company_financial_history",
    { title: "Company financial history (SEC)", annotations: { title: "Company financial history (SEC)", ...READ_ONLY }, description: TOOL_DESCRIPTIONS.company_financial_history, inputSchema: companyHistoryToolShape },
    (args) => toolCompanyFinancialHistory(session, args),
  );
}

// Guided workflows a user can pick in a client that shows MCP prompts. Arguments are strings, as
// the protocol defines them; the prompt only writes the instructions, the tools do the work.
export function registerPrompts(server) {
  server.registerPrompt(
    "validate_backtest",
    {
      title: "Validate a backtest before trusting it",
      description: "Walk through the deflated Sharpe, overfitting and track-record checks for one strategy, and report what the numbers do not establish.",
      argsSchema: {
        strategy: z.string().describe("What the strategy is and what data it was backtested on"),
        variants_tried: z.string().optional().describe("How many variants, parameter sets or ideas were tried before this one"),
      },
    },
    ({ strategy, variants_tried }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: [
            `Validate this backtest before I trust it: ${strategy}.`,
            variants_tried ? `Variants tried before settling on it: ${variants_tried}.` : "Ask me how many variants were tried before settling on it; do not assume one.",
            "1. validate_deflated_sharpe with the return series (or the seven contract inputs), counting every variant tried as a trial.",
            "2. If I can share the returns of every variant, validate_overfitting on that matrix.",
            "3. validate_track_record for how long a live record must run before this Sharpe clears a benchmark I care about.",
            "Report each number with the limits sentences its result carries, say plainly what they do not establish, and give me each receipt id.",
          ].join("\n"),
        },
      }],
    }),
  );
  server.registerPrompt(
    "track_record_needed",
    {
      title: "How long a track record do I need?",
      description: "The minimum track record length for a Sharpe to clear a benchmark, with the record's own probabilistic Sharpe if its length is known.",
      argsSchema: {
        sharpe: z.string().describe("The observed annualized Sharpe ratio"),
        frequency: z.string().describe("How often returns are measured: daily, weekly or monthly"),
        benchmark: z.string().optional().describe("The annualized Sharpe it must beat; 0 if not given"),
        record_length: z.string().optional().describe("How long the record already is, if known"),
      },
    },
    ({ sharpe, frequency, benchmark, record_length }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: [
            `How long a track record does an annualized Sharpe of ${sharpe} on ${frequency} returns need to be believably above ${benchmark ?? "0"}?`,
            "Call validate_track_record with periods_per_year for that frequency (252 daily, 52 weekly, 12 monthly). Ask me for the skewness and kurtosis of the returns; if I do not know them, run it for Normal returns (skew 0, kurtosis 3) and say that fat tails lengthen the answer.",
            record_length ? `The record already runs ${record_length}; convert it to observations and include it, and tell me whether it is long enough.` : "",
            "State that the answer is about sample uncertainty and the shape of the returns, not a forecast.",
          ].filter(Boolean).join("\n"),
        },
      }],
    }),
  );
}

// Reference documents a client can read: the boundary language every result carries, and the
// sources and independent checks behind each validator.
export const RESOURCE_TEXT = Object.freeze({
  limits: [
    "# What a canlicapital.com validation result does not establish",
    "",
    ...Object.values(LIMITS_SENTENCES).map((s) => `- ${s}`),
  ].join("\n"),
  sources: [
    "# Sources and independent checks",
    "",
    "- Deflated Sharpe ratio: Bailey and López de Prado, \"The Deflated Sharpe Ratio\", Journal of Portfolio Management, 2014. Reproduces the paper's worked example (pages 9 and 10) to its four printed decimals, checked in CI.",
    "- Minimum track record length and probabilistic Sharpe against a benchmark: Bailey and López de Prado, \"The Sharpe Ratio Efficient Frontier\", Journal of Risk, 2012. Reproduces the paper's worked examples (page 11), checked in CI.",
    "- Minimum backtest length: Bailey, Borwein, López de Prado and Zhu, \"Pseudo-Mathematics and Financial Charlatanism\", Notices of the American Mathematical Society, 2014. Reproduces the paper's statements exactly (the best of 10 trials at 1.57; 5 years allow at most 45 trials, 2 years at most 7), checked in CI.",
    "- Haircut Sharpe ratio: Harvey and Liu, \"Backtesting\", Journal of Portfolio Management, 2015. Agrees with the authors' own Haircut_SR.m on every deterministic (Bonferroni) output to 1e-9; Holm and BHY agree with R's p.adjust; the Student t with R's pt and qt. Checked in CI.",
    "- Luck-equivalent trials: Canli Capital's statistic, built from the Student t null of the Sharpe's t-statistic, the Sidak best-of-N probability and the expected maximum of Bailey, Borwein, López de Prado and Zhu (2014). Calibrated by Monte Carlo in CI: correct size for normal and Student t4 returns; too generous for negatively skewed returns (with 252 observations, a nominal 5 percent test rejected 10.8 percent of skill-less searches at skew -1.3).",
    "- Probability of backtest overfitting by CSCV: Bailey, Borwein, López de Prado and Zhu, \"The Probability of Backtest Overfitting\", Journal of Computational Finance, 2017. Agrees with the CRAN package pbo on PBO and on every logit, after its documented rank convention, checked in CI.",
    "- Source code: https://github.com/arhancanli/canli-validation-mcp and https://github.com/arhancanli/canlicapital",
  ].join("\n"),
});

export function registerResources(server) {
  server.registerResource(
    "limits",
    "canli://limits",
    { title: "What a result does not establish", description: "The boundary sentences every validation result carries.", mimeType: "text/markdown" },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: RESOURCE_TEXT.limits }] }),
  );
  server.registerResource(
    "sources",
    "canli://sources",
    { title: "Sources and independent checks", description: "The papers behind each validator and how each is checked against them.", mimeType: "text/markdown" },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: RESOURCE_TEXT.sources }] }),
  );
}

// Everything the server exposes: the npm package and the hosted endpoint both call this.
export function registerAll(server, session) {
  registerTools(server, session);
  registerPrompts(server);
  registerResources(server);
}

export function createServer(session = createSession()) {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerAll(server, session);
  return server;
}

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error(`${SERVER_NAME}: fatal`, err);
    process.exit(1);
  });
}
