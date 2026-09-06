#!/usr/bin/env node
// mcp/src/server.mjs
//
// stdio MCP server over canlicapital.com's free validation API. Every tool returns the FULL API
// envelope as its result text, success or error, so an agent cannot see a number without the
// sentences beside it that say what the number does not establish (see schemas.mjs, LIMITS_SENTENCES
// and TOOL_DESCRIPTIONS). Reads CANLI_API_BASE (default https://canlicapital.com) and an optional
// CANLI_KEY; when CANLI_KEY is set, get_key does not call the network.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  breadthInput,
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
export const SERVER_VERSION = "0.1.0";

// One place a value fails a zod schema turns into a short, readable message instead of a raw
// ZodError, so a thrown error reads well inside an MCP isError result.
function parseOrThrow(schema, value, label) {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  throw new Error(`${label}: ${issues}`);
}

export function createSession({ base, fetchImpl, envKey } = {}) {
  return {
    base: base ?? process.env.CANLI_API_BASE ?? DEFAULT_BASE,
    fetchImpl: fetchImpl ?? fetch,
    envKey: envKey ?? process.env.CANLI_KEY ?? undefined,
    key: undefined,
  };
}

async function callApi(session, { path, method = "GET", body }) {
  const headers = { "Content-Type": "application/json" };
  const key = session.key ?? session.envKey;
  if (key) headers.Authorization = `Bearer ${key}`;
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await session.fetchImpl(`${session.base}${path}`, init);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} returned a non-JSON body (status ${res.status}): ${text.slice(0, 300)}`);
  }
}

const asText = (envelope) => ({ content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }] });

export async function toolGetKey(session, args) {
  const { label } = parseOrThrow(getKeyInput, args, "get_key");
  if (session.envKey) {
    return asText({
      note: "CANLI_KEY is set in the environment; no new key was issued and no request was sent. Using the configured key for this session.",
      key_source: "CANLI_KEY",
      key_present: true,
    });
  }
  const envelope = await callApi(session, { path: "/api/v1/keys", method: "POST", body: { label } });
  if (envelope?.data?.key) session.key = envelope.data.key;
  return asText(envelope);
}

export async function toolValidateDeflatedSharpe(session, args) {
  const parsed = deflatedSharpeInput.safeParse(args ?? {});
  if (!parsed.success) {
    throw new Error(
      "Send either the seven contract inputs (observed_sharpe_annualized, observations, periods_per_year, skew, non_excess_kurtosis, effective_independent_trials, cross_trial_sharpe_sd_annualized) " +
        "or a return series (returns, periods_per_year, effective_independent_trials, cross_trial_sharpe_sd_annualized), never a mix of both and never neither.",
    );
  }
  const envelope = await callApi(session, { path: "/api/v1/validate/deflated-sharpe", method: "POST", body: parsed.data });
  return asText(envelope);
}

export async function toolValidateOverfitting(session, args) {
  const body = parseOrThrow(overfittingInput, args, "validate_overfitting");
  const envelope = await callApi(session, { path: "/api/v1/validate/overfitting", method: "POST", body });
  return asText(envelope);
}

export async function toolValidatePaperEvidence(session, args) {
  const body = parseOrThrow(paperEvidenceInput, args, "validate_paper_evidence");
  const envelope = await callApi(session, { path: "/api/v1/validate/paper-evidence", method: "POST", body });
  return asText(envelope);
}

export async function toolValidateBreadth(session, args) {
  const body = parseOrThrow(breadthInput, args, "validate_breadth");
  const envelope = await callApi(session, { path: "/api/v1/validate/breadth", method: "POST", body });
  return asText(envelope);
}

export async function toolGetReceipt(session, args) {
  const { id } = parseOrThrow(getReceiptInput, args, "get_receipt");
  const envelope = await callApi(session, { path: `/api/v1/receipts/${id}` });
  return asText(envelope);
}

export async function toolServiceStatus(session) {
  const envelope = await callApi(session, { path: "/api/v1/validate/status" });
  return asText(envelope);
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

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(`${SERVER_NAME}: fatal`, err);
    process.exit(1);
  });
}
