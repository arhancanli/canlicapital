// mcp/src/ledger.mjs
//
// The trial-ledger tools (toolset "ledger", local stdio mode): ledger_record_trial, ledger_summary
// and ledger_export. The rules and statistics are in ledger-core.mjs; this file stores each ledger as
// one JSON-lines file (a header, then one chained trial per line) under CANLI_LEDGER_DIR, by default
// ~/.canli/ledgers, so a search survives a restart of the agent or the server. Nothing leaves the
// machine. A ledger is appended to, never rewritten.
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { GENESIS, LEDGER_LIMITS_TEXT, LEDGER_SCHEMA, MAX_TRIALS, buildTrial, summarize, verifyChain } from "./ledger-core.mjs";
import { readSeriesFile } from "./series-file.mjs";

export const LEDGER_TOOLS = Object.freeze(["ledger_record_trial", "ledger_summary", "ledger_export"]);

export const ledgerDir = (env = process.env) => env.CANLI_LEDGER_DIR || join(homedir(), ".canli", "ledgers");
const ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const text = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });

function pathFor(dir, id) {
  if (!ID.test(id)) throw new RangeError("ledger must be 3 to 64 lowercase letters, digits or dashes, starting with a letter or digit");
  return join(dir, `${id}.jsonl`);
}

export function readLedger(dir, id) {
  const path = pathFor(dir, id);
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const [header, ...trials] = lines;
  if (header?.schema !== LEDGER_SCHEMA) throw new Error(`${path} is not a ${LEDGER_SCHEMA} file`);
  const check = verifyChain(trials);
  if (!check.ok) throw new Error(`ledger ${id} fails its own hash chain at trial ${check.at}: ${check.reason}`);
  return { header, trials, head: check.head };
}

export function recordTrial(dir, input, now = () => new Date().toISOString()) {
  const id = input.ledger ?? `search-${randomBytes(4).toString("hex")}`;
  let ledger = readLedger(dir, id);
  if (!ledger) {
    if (!(input.periods_per_year > 0)) throw new RangeError("periods_per_year is required for a ledger's first trial (252 for daily stock returns, 365 for daily crypto, 12 for monthly)");
    mkdirSync(dir, { recursive: true });
    const header = { schema: LEDGER_SCHEMA, ledger: id, periods_per_year: input.periods_per_year, created_at: now() };
    writeFileSync(pathFor(dir, id), `${JSON.stringify(header)}\n`, { flag: "wx" });
    ledger = { header, trials: [], head: GENESIS };
  } else if (input.periods_per_year !== undefined && input.periods_per_year !== ledger.header.periods_per_year) {
    throw new RangeError(`ledger ${id} annualizes with periods_per_year ${ledger.header.periods_per_year}; record this trial in a new ledger`);
  }
  if (ledger.trials.length >= MAX_TRIALS) throw new RangeError(`ledger ${id} holds the maximum of ${MAX_TRIALS} trials`);
  const returns = input.returns_file ? readSeriesFile(input.returns_file, input.column) : input.returns;
  const trial = buildTrial({ label: input.label, returns, sharpe_annualized: input.sharpe_annualized, observations: input.observations, params: input.params,
    periodsPerYear: ledger.header.periods_per_year, n: ledger.trials.length + 1, prev: ledger.head, recordedAt: now() });
  appendFileSync(pathFor(dir, id), `${JSON.stringify(trial)}\n`);
  const trials = [...ledger.trials, trial];
  return { ledger: id, trial: trial.n, chain_head: trial.hash, ...summarize({ trials, periodsPerYear: ledger.header.periods_per_year }) };
}

export function ledgerSummary(dir, { ledger: id, effective_trials }) {
  const ledger = readLedger(dir, id);
  if (!ledger) throw new RangeError(`no ledger named ${id} in ${dir}`);
  return { ledger: id, chain_head: ledger.head, ...summarize({ trials: ledger.trials, periodsPerYear: ledger.header.periods_per_year, effectiveTrials: effective_trials }) };
}

// The whole ledger, verifiable offline: recompute each hash from the previous one and the trial body.
export function ledgerExport(dir, { ledger: id, include_returns = false }) {
  const ledger = readLedger(dir, id);
  if (!ledger) throw new RangeError(`no ledger named ${id} in ${dir}`);
  return {
    ...ledger.header, chain_head: ledger.head, trials: ledger.trials.length, file: pathFor(dir, id),
    records: ledger.trials.map((t) => (include_returns ? t : { ...t, returns: t.returns ? `${t.returns.length} values (in the file)` : null })),
    verify: "Each record's hash is sha256(previous hash + canonical JSON of the record without prev and hash), starting from 64 zeros; the file keeps every return value so the chain can be recomputed exactly.",
    limits: LEDGER_LIMITS_TEXT,
  };
}

const ledgerId = z.string().regex(ID).describe("The ledger's name. Omit on the first trial to create one; reuse the name it returns for every later trial of the same search.");
export const recordTrialInput = z.object({
  ledger: ledgerId.optional(),
  label: z.string().min(1).max(200).describe("A short name for this variant, for example 'sma 20/100, 5 bps'."),
  returns: z.array(z.number()).max(20000).optional().describe("The variant's period returns as decimals. Give returns, or returns_file, or sharpe_annualized with observations."),
  returns_file: z.string().optional().describe("A CSV or JSON file of the variant's returns, read on this machine."),
  column: z.string().optional().describe("Column of returns_file to read, when it has several."),
  sharpe_annualized: z.number().optional().describe("The variant's annualized Sharpe ratio, when its returns are not available."),
  observations: z.number().int().min(2).optional().describe("How many return periods the Sharpe was measured on."),
  periods_per_year: z.number().positive().optional().describe("Required on a ledger's first trial: 252 daily stocks, 365 daily crypto, 52 weekly, 12 monthly."),
  params: z.record(z.string(), z.any()).optional().describe("The variant's parameters, recorded as given."),
});
export const summaryInput = z.object({
  ledger: ledgerId,
  effective_trials: z.number().int().min(2).optional().describe("Use instead of the recorded count when many trials are near-copies of each other."),
});
export const exportInput = z.object({
  ledger: ledgerId,
  include_returns: z.boolean().optional().describe("Include every return value in the reply (large). The file always keeps them."),
});
const summaryShape = {
  ledger: z.string(), chain_head: z.string().optional(), trial: z.number().optional(), trials: z.number(), effective_trials: z.number().optional(),
  best: z.object({}).passthrough().optional(), cross_trial_sharpe_sd_annualized: z.number().nullable().optional(), expected_best_by_luck_annualized: z.number().nullable().optional(),
  deflated: z.object({}).passthrough().nullable().optional(), overfitting: z.object({}).passthrough().nullable().optional(), plain_reading: z.string(), limits: z.array(z.string()),
};
export const summaryOutput = z.object(summaryShape).passthrough();
export const exportOutput = z.object({ ledger: z.string(), chain_head: z.string(), trials: z.number(), records: z.array(z.object({}).passthrough()), verify: z.string(), limits: z.array(z.string()) }).passthrough();

export const LEDGER_TOOL_DESCRIPTIONS = Object.freeze({
  ledger_record_trial: `Record every strategy variant you try in one search, as you try it (its returns, or its Sharpe and sample size). Returns the trial count and the best trial's deflated Sharpe after counting all of them, so a lucky best of many is not reported as skill. Local; kept in a hash-chained file. ${LEDGER_LIMITS_TEXT[0]}`,
  ledger_summary: `The verdict on a whole search: best trial, the Sharpe the best of that many skill-less trials reaches by luck, its deflated Sharpe, and the probability of backtest overfitting when trials share aligned returns. ${LEDGER_LIMITS_TEXT[2]}`,
  ledger_export: "Export a ledger with its hash chain, so anyone can check that no trial was removed, reordered or changed after it was recorded.",
});

const ANNOTATIONS_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const ANNOTATIONS_READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function ledgerToolSpecs(session) {
  const dir = session.ledgerDir ?? ledgerDir();
  const wrap = (fn) => async (args) => text(fn(dir, args));
  const spec = (name, title, input, output, handler, annotations) => [name, { title, annotations: { title, ...annotations }, description: LEDGER_TOOL_DESCRIPTIONS[name], inputSchema: input, outputSchema: output }, handler];
  return [
    spec("ledger_record_trial", "Record a trial in a search ledger", recordTrialInput, summaryOutput, wrap(recordTrial), ANNOTATIONS_WRITE),
    spec("ledger_summary", "Judge a whole search", summaryInput, summaryOutput, wrap(ledgerSummary), ANNOTATIONS_READ),
    spec("ledger_export", "Export a ledger with its hash chain", exportInput, exportOutput, wrap(ledgerExport), ANNOTATIONS_READ),
  ];
}
