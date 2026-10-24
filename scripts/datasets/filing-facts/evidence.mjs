// Offline scoring and replay. Captures are local records, not provider attestations or human review.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { canonicalJson } from "../../canonical-json.mjs";
import { behaviour, SCORING_VERSION, scoreAnswer, stratifiedSample } from "./eval.mjs";

export const CAPTURE_SCHEMA = "canli.filing-facts-answer-capture.v1";
export const EVIDENCE_SCHEMA = "canli.filing-facts-evaluation.v1";
export const SCORING_SOURCE_FILES = Object.freeze([
  "eval.mjs", "evidence.mjs", "generate.mjs", "check.mjs", "templates.mjs",
  "../../canonical-json.mjs", "replay-evaluation.mjs",
]);
const KINDS = { lookup: "number", change: "percent", ratio: "ratio", net_assets: "number", unanswerable: "not_reported", restatement: "number" };
// v1 adds restatement items and the fresh split (generate-v1.mjs); a dataset file holds one schema.
const ITEM_SCHEMAS = new Set(["canli.filing-facts-item.v0", "canli.filing-facts-item.v1"]);
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const digest = (value) => sha256(canonicalJson(value));
const nonempty = (value) => typeof value === "string" && Boolean(value.trim());
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const noAnswer = () => ({ answered: false, correct: false, parsed: null });

export function readDataset(bytes) {
  const source = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const lines = source.toString("utf8").trim().split(/\r?\n/);
  const items = lines.map((line) => JSON.parse(line));
  const ids = new Set();
  for (const item of items) {
    if (!ITEM_SCHEMAS.has(item.schema) || item.schema !== items[0].schema || !nonempty(item.id) || ids.has(item.id) ||
      !Object.hasOwn(KINDS, item.template) || item.answer?.kind !== KINDS[item.template] ||
      !nonempty(item.question) || !nonempty(item.company?.cik) ||
      (item.answer.kind === "not_reported" ? item.answer.value !== null : !Number.isFinite(item.answer.value))) {
      throw new RangeError("dataset contains an invalid, duplicate or unsupported filing-facts item");
    }
    ids.add(item.id);
  }
  return { items, sha256: sha256(source), bytes: source.length };
}

function selectedItems(dataset, capture) {
  if (capture?.schema !== CAPTURE_SCHEMA) throw new RangeError(`expected ${CAPTURE_SCHEMA}; legacy evaluations without raw answers cannot be rescored`);
  if (capture.dataset_sha256 !== dataset.sha256) throw new RangeError("capture dataset_sha256 does not match the exact source bytes");
  if (!nonempty(capture.model) || !nonempty(capture.provider) || !["closed", "mcp"].includes(capture.arm) ||
    !nonempty(capture.recorded_at) || !/^\d{4}-\d{2}-\d{2}T/.test(capture.recorded_at) || !Number.isFinite(Date.parse(capture.recorded_at))) {
    throw new RangeError("capture needs model, provider, arm and an ISO recorded_at");
  }
  if (capture.sampling?.method !== "stratified") throw new RangeError("capture needs a declared stratified sample");
  const sample = stratifiedSample(dataset.items, capture.sampling.per_template, capture.sampling.seed);
  if (!sample.length || canonicalJson(capture.sampling.item_ids) !== canonicalJson(sample.map((item) => item.id))) {
    throw new RangeError("capture item_ids do not match its deterministic source sample");
  }
  if (capture.arm === "mcp" && (!capture.tool_contract || !Array.isArray(capture.tool_contract.tools) || !capture.tool_contract.tools.length)) {
    throw new RangeError("MCP capture needs the observed tool contract");
  }
  if (capture.arm === "closed" && Object.hasOwn(capture, "tool_contract")) throw new RangeError("closed-book capture cannot declare a tool contract");
  return sample;
}

export function evaluateCapture(bytes, capture) {
  const dataset = readDataset(bytes);
  const sample = selectedItems(dataset, capture);
  if (!Array.isArray(capture.runs)) throw new RangeError("capture needs a runs array");
  const selected = new Set(sample.map((item) => item.id));
  const supplied = new Map();
  for (const run of capture.runs) {
    if (!run || !selected.has(run.id) || supplied.has(run.id)) throw new RangeError("capture contains an unknown, out-of-sample or duplicate item");
    if (!Object.hasOwn(run, "response_text") || (run.response_text !== null && typeof run.response_text !== "string") ||
      !Object.hasOwn(run, "error") || (run.error !== null && !nonempty(run.error)) || !count(run.tokens) || !count(run.tool_calls)) {
      throw new RangeError(`capture ${run.id} needs raw response_text, error, and nonnegative integer token/tool counts`);
    }
    if (run.tool_trace !== undefined && !Array.isArray(run.tool_trace)) throw new RangeError(`capture ${run.id} tool_trace must be an array`);
    if (capture.arm === "closed" && (run.tool_calls !== 0 || run.tool_trace?.length)) {
      throw new RangeError("closed-book capture cannot include tool calls or tool traces");
    }
    supplied.set(run.id, run);
  }
  const runs = sample.map((item) => {
    const raw = supplied.get(item.id);
    const status = !raw ? "missing_capture" : raw.error ? "request_error" : raw.response_text === null ? "missing_response" : "response";
    const scored = status === "response" ? scoreAnswer(item, raw.response_text) : noAnswer();
    return { id: item.id, template: item.template, status, response_text: raw?.response_text ?? null,
      ...scored, expected: item.answer.value, tokens: raw?.tokens ?? 0, tool_calls: raw?.tool_calls ?? 0, error: raw?.error ?? null };
  });
  const byTemplate = {};
  for (const run of runs) {
    const row = byTemplate[run.template] ??= { n: 0, correct: 0, tokens: 0 };
    row.n++; row.correct += Number(run.correct); row.tokens += run.tokens;
  }
  const correct = runs.filter((run) => run.correct).length;
  const responses = runs.filter((run) => run.status === "response");
  return {
    schema: EVIDENCE_SCHEMA,
    scoring: { version: SCORING_VERSION, scorer_sha256: sha256(readFileSync(new URL("./eval.mjs", import.meta.url))),
      evidence_runner_sha256: sha256(readFileSync(new URL("./evidence.mjs", import.meta.url))),
      sources: Object.fromEntries(SCORING_SOURCE_FILES.map((path) => [path, sha256(readFileSync(new URL(path, import.meta.url)))])) },
    dataset: { schema: dataset.items[0].schema, sha256: dataset.sha256, bytes: dataset.bytes, items: dataset.items.length },
    capture_sha256: digest(capture), capture,
    summary: { model: capture.model, arm: capture.arm, items: sample.length, accuracy: correct / sample.length,
      coverage: { expected: sample.length, captured: supplied.size, responses: responses.length,
        missing_captures: runs.filter((run) => run.status === "missing_capture").length,
        missing_responses: runs.filter((run) => run.status === "missing_response").length,
        request_errors: runs.filter((run) => run.status === "request_error").length,
        no_final_answers: responses.filter((run) => !run.answered).length },
      response_accuracy: responses.length ? responses.filter((run) => run.correct).length / responses.length : null,
      behaviour: behaviour(runs), errors: runs.filter((run) => run.error).length,
      mean_tokens: Math.round(runs.reduce((sum, run) => sum + run.tokens, 0) / sample.length),
      by_template: Object.fromEntries(Object.entries(byTemplate).map(([key, row]) => [key,
        { n: row.n, accuracy: row.correct / row.n, mean_tokens: Math.round(row.tokens / row.n) }])) },
    runs,
    limits: [
      "Accuracy uses every selected item; missing captures, missing responses and request errors count as failures. Response accuracy uses only captured responses without request errors.",
      "Abstention requires a complete absence answer; contradictory prose and malformed numbers are incorrect, not abstentions.",
      "Offline replay checks source binding and scoring only. Local captures do not authenticate provider responses, human review, expert qualifications or filing truth.",
    ],
  };
}

export function auditEvidence(bytes, record) {
  if (record?.schema !== EVIDENCE_SCHEMA) {
    const runs = Array.isArray(record?.runs) ? record.runs : [];
    return { status: "unrescorable", runs: runs.length,
      raw_answers_present: runs.filter((run) => typeof run?.response_text === "string").length,
      reasons: ["No supported source-bound capture and scoring version. Parsed or expected values cannot reconstruct raw model answers."],
      recorded_summary: record?.summary ?? null };
  }
  const replayed = evaluateCapture(bytes, record.capture);
  if (canonicalJson(record) !== canonicalJson(replayed)) throw new RangeError("evaluation evidence does not match source-bound scoring replay");
  return { status: "recomputed", dataset_sha256: replayed.dataset.sha256,
    capture_sha256: replayed.capture_sha256, scoring_version: replayed.scoring.version,
    runs: replayed.runs.length, accuracy: replayed.summary.accuracy,
    limits: ["This verifies deterministic scoring of the supplied local capture, not provider authenticity or expert review."] };
}
