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
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  breadthInput,
  companyHistoryInput,
  deflatedSharpeInput,
  deflatedSharpeToolShape,
  emptyInput,
  getKeyInput,
  getReceiptInput,
  overfittingInput,
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

export function createSession({ base, fetchImpl, envKey, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("Request timeout must be a positive integer");
  return {
    base: base ?? process.env.CANLI_API_BASE ?? DEFAULT_BASE,
    fetchImpl: fetchImpl ?? fetch,
    envKey: envKey ?? process.env.CANLI_KEY ?? undefined,
    key: undefined,
    timeoutMs,
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

const asText = (envelope, failed = false) => ({
  content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
  ...(failed ? { isError: true } : {}),
});

export async function toolGetKey(session, args) {
  const { label } = parseOrThrow(getKeyInput, args, "get_key");
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
  const response = await callApi(session, { path: "/api/v1/validate/deflated-sharpe", method: "POST", body: parsed.data });
  return asText(response.envelope, response.failed);
}

export async function toolValidateOverfitting(session, args) {
  const body = parseOrThrow(overfittingInput, args, "validate_overfitting");
  const response = await callApi(session, { path: "/api/v1/validate/overfitting", method: "POST", body });
  return asText(response.envelope, response.failed);
}

export async function toolValidatePaperEvidence(session, args) {
  const body = parseOrThrow(paperEvidenceInput, args, "validate_paper_evidence");
  const response = await callApi(session, { path: "/api/v1/validate/paper-evidence", method: "POST", body });
  return asText(response.envelope, response.failed);
}

export async function toolValidateBreadth(session, args) {
  const body = parseOrThrow(breadthInput, args, "validate_breadth");
  const response = await callApi(session, { path: "/api/v1/validate/breadth", method: "POST", body });
  return asText(response.envelope, response.failed);
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
export async function toolCompanyFinancialHistory(session, args) {
  const { cik, concept, limit = 40 } = parseOrThrow(companyHistoryInput, args, "company_financial_history");
  const id = cik.padStart(10, "0");
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
      observations,
    },
  });
}

export function registerTools(server, session) {
  server.registerTool(
    "get_key",
    { title: "Get a free validation key", description: TOOL_DESCRIPTIONS.get_key, inputSchema: getKeyInput },
    (args) => toolGetKey(session, args),
  );
  server.registerTool(
    "validate_deflated_sharpe",
    { title: "Validate deflated Sharpe", description: TOOL_DESCRIPTIONS.validate_deflated_sharpe, inputSchema: deflatedSharpeToolShape },
    (args) => toolValidateDeflatedSharpe(session, args),
  );
  server.registerTool(
    "validate_overfitting",
    { title: "Validate overfitting (CSCV)", description: TOOL_DESCRIPTIONS.validate_overfitting, inputSchema: overfittingInput },
    (args) => toolValidateOverfitting(session, args),
  );
  server.registerTool(
    "validate_paper_evidence",
    { title: "Validate paper evidence", description: TOOL_DESCRIPTIONS.validate_paper_evidence, inputSchema: paperEvidenceInput },
    (args) => toolValidatePaperEvidence(session, args),
  );
  server.registerTool(
    "validate_breadth",
    { title: "Validate breadth ceiling", description: TOOL_DESCRIPTIONS.validate_breadth, inputSchema: breadthInput },
    (args) => toolValidateBreadth(session, args),
  );
  server.registerTool(
    "get_receipt",
    { title: "Get a receipt", description: TOOL_DESCRIPTIONS.get_receipt, inputSchema: getReceiptInput },
    (args) => toolGetReceipt(session, args),
  );
  server.registerTool(
    "service_status",
    { title: "Service status", description: TOOL_DESCRIPTIONS.service_status, inputSchema: emptyInput },
    () => toolServiceStatus(session),
  );
  server.registerTool(
    "company_financial_history",
    { title: "Company financial history (SEC)", description: TOOL_DESCRIPTIONS.company_financial_history, inputSchema: companyHistoryInput },
    (args) => toolCompanyFinancialHistory(session, args),
  );
}

export function createServer(session = createSession()) {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server, session);
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
