#!/usr/bin/env node
// canli-mcp: every Canli Capital MCP server in one process, behind three discovery tools.
//
// Efficiency, by design:
// - Context: the model sees find_tool, describe_tool and run_tool (about 1,000 tokens) instead of
//   seven servers' tool lists (24,858 tokens measured); the list is byte-identical across launches.
// - Startup: only a prebuilt index is read; a pack's code loads the first time one of its tools is
//   described or run.
// - Round trips: run_tool takes a batch of calls, runs independent ones concurrently, and lets a
//   call take an earlier call's output ({"$result": i, "path": "..."}) so intermediate data never
//   passes through the model; return: "last" sends back only the final result.
// - Input tokens: any argument can be {"$file": "data.csv", "column": "close"}, read here.
// - Output tokens: select returns only named fields; digits rounds; find_tool rows carry each
//   tool's argument signature, so describe_tool is rarely needed.
// Privacy: canli://privacy states what each pack sends and stores; CANLI_OFFLINE=1 keeps only the
// packs that never use the network, and their code is the only code loaded.
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import { resolveRefs } from "./files.mjs";
import { DESK as FANOUT, runBrief, runSwarm } from "./desk.mjs";
import { runTriangulate, TRIANGULATE_TOOL } from "./triangulate.mjs";
import { runWorlds, WORLDS_TOOL } from "./worlds.mjs";
import { HUB_TOOLS, runHubCheck, runHubList, runHubRun } from "./hub.mjs";
import { DRAFT_TOOL, runDraft } from "./draft.mjs";
import { OMITTED, PACKS, PLUGINS, RENAMES, enabledPacks, loadPack, loadPlugins, offlineMode, packInfo } from "./packs.mjs";
import { signature } from "./signature.mjs";
import { buildIndex, search } from "./search.mjs";
import { registerPrompts } from "./prompts.mjs";
import { clientDrawsApps, registerView, VIEW_URI } from "./view.mjs";
import { registerPackGuides } from "./guides.mjs";
import { governance, publicKeys, verifyAudit } from "./governance.mjs";
import { watchFilings } from "./watch.mjs";
import { createTimeMachine } from "./timemachine.mjs";
import { signedTrialCount, TRIALS_TOOL } from "./trials.mjs";
import { createLuck, shownTrials } from "./luck.mjs";
import { createVault, HOLDOUT_TOOLS } from "./holdout.mjs";
import { createRegistry, PREREG_TOOL } from "./prereg.mjs";
import { CAUSES_TOOL, runCauses } from "./causes.mjs";
import { RECEIPT_CHECK_TOOL, runReceiptCheck } from "./receipt-check.mjs";
import { runShares, SHARES_TOOL } from "./shares.mjs";
import { RED_FLAGS_TOOL, runRedFlags } from "./redflags.mjs";
import { EXPORT_TOOL, exportInput } from "./export.mjs";
import { addressedToAi, CAUTION } from "./injection.mjs";
import { installTripwire, withoutNetwork } from "./tripwire.mjs";
import { createDelta } from "./delta.mjs";
import { runWeek, WEEK_TOOL } from "./week.mjs";
import { channelSink, CHANNEL_INSTRUCTIONS, SENTINEL_TOOLS } from "./sentinel.mjs";

const PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const INDEX = JSON.parse(readFileSync(new URL("./index.json", import.meta.url), "utf8"));
export const SERVER_NAME = "canli-mcp";
export const SERVER_VERSION = PKG.version;
export const SERVER_INFO = Object.freeze({
  name: SERVER_NAME, version: SERVER_VERSION, title: "Canli Capital",
  websiteUrl: "https://canlicapital.com/developers",
  icons: [{ src: "https://canlicapital.com/icon-512.png", mimeType: "image/png", sizes: ["512x512"] }, { src: "https://canlicapital.com/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] }],
});

const DESK = [...FANOUT, WORLDS_TOOL, TRIANGULATE_TOOL, ...HUB_TOOLS, DRAFT_TOOL, ...SENTINEL_TOOLS, TRIALS_TOOL, WEEK_TOOL, ...HOLDOUT_TOOLS, PREREG_TOOL, CAUSES_TOOL, RECEIPT_CHECK_TOOL, SHARES_TOOL, RED_FLAGS_TOOL, EXPORT_TOOL];
export const ENTRIES = [...INDEX.tools.map(([name, pack, toolset, title, description, keywords, args]) => ({ name, pack, toolset, title, description, keywords, args })), ...DESK.map(({ name, pack, toolset, title, description, keywords, args }) => ({ name, pack, toolset, title, description, keywords, args }))];
const BY_NAME = new Map(ENTRIES.map((e) => [e.name, e]));
let SEARCH = buildIndex(ENTRIES);

// Adds plugin packs' tools (CANLI_PLUGINS) to the catalog and the search; returns their packs.
export async function addPlugins(env = process.env) {
  const plugins = await loadPlugins(env, new Set(BY_NAME.keys()));
  for (const { pack, tools } of plugins) for (const t of tools) {
    const e = { name: t.name, pack, toolset: pack, title: t.title, description: t.description, keywords: t.keywords, args: signature(t.input) };
    ENTRIES.push(e); BY_NAME.set(e.name, e);
  }
  if (plugins.length) SEARCH = buildIndex(ENTRIES);
  return plugins.map((p) => p.pack);
}

// The most asked-for tools, which run_tool takes without a find_tool first: each saves the model a
// search turn on the commonest questions. Only tools in enabled packs are named.
const STARTS = [
  ["fundamentals", "a company's SEC-reported figures over time: history {company, concept} or, for several at once, {company, concepts: [...]} (plain names like revenue or XBRL tags; basis first_reported or latest)"],
  ["fundamentals", "figures as known on a date: known_as_of {company, as_of}"],
  ["markets", "statements as filed: financial_statements {company}"],
  ["markets", "filings and their text: list_filings, read_filing, search_filings"],
  ["markets", "prices: price_history {symbol}; macro series: economic_series"],
];
export function instructions(packs, front = []) {
  const n = ENTRIES.filter((e) => packs.includes(e.pack)).length;
  const starts = STARTS.filter(([pack]) => packs.includes(pack)).map(([, text]) => text);
  return `Canli Capital's finance tools in one server: ${n} tools in ${packs.length} packs (${packs.join(", ")}). ${front.length ? `${front.join(" and ")} ${front.length > 1 ? "are tools of their own" : "is a tool of its own"} here: call ${front.length > 1 ? "them" : "it"} directly. ` : ""}${starts.length ? `Common tools, which run_tool takes without a search first (as {name, arguments})${front.length ? " unless listed above" : ""}: ${starts.join("; ")}. For anything else, call the find_tool tool` : "Call the find_tool tool"} with what you need in plain words; its results include each tool's arguments, so you can usually call run_tool next (describe_tool explains arguments in full). To save tokens: pass long data as {"$file": "path.csv", "column": "close"} instead of pasting numbers; put several calls in one run_tool, using {"$result": i, "path": "field"} to feed one call's output into the next, and return: "last" when only the final answer matters. To show prices (several are compared), markets, yields, statements, options, a backtest, holdings or orders, add view: true: the person gets an interactive view, you a summary. Returns are simple fractions (0.01 = 1%), oldest first. canli://privacy says what each pack sends and stores.${packs.includes("markets") ? " To double-check figures in a written draft, verify_claims (through run_tool) marks each confirmed, contradicted (with the filed figure) or not reported; figures that came from these tools need no second check." : ""}`;
}

const sha256 = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const open = z.looseObject({});
// A result drawn as a view has a summary for the model in SUMMARIES: the model reads the summary,
// the view the whole result.
const SUMMARIES = new WeakMap();
// Every run_tool answer's receipt, for the client in _meta (RECEIPT_KEY): what was asked, a hash of the whole result,
// and the source documents it was read from.
const RECEIPTS = new WeakMap();
export const RECEIPT_KEY = "canlicapital.com/receipt";
const ok = (result) => ({ content: [{ type: "text", text: JSON.stringify((result && typeof result === "object" && SUMMARIES.get(result)) ?? result) }], structuredContent: result, ...(result && typeof result === "object" && RECEIPTS.has(result) ? { _meta: { [RECEIPT_KEY]: RECEIPTS.get(result) } } : {}) });
const fail = (err) => ({ isError: true, content: [{ type: "text", text: String(err?.message ?? err) }] });
// What each call cost, for the client in MCP's _meta, which hosts do not put in front of the model, so measuring
// costs no tokens: wall time, the process's CPU time over the call where the runtime reports it (other calls
// running at the same time included), and the characters the model reads.
export const COST_KEY = "canlicapital.com/cost";
const cpuNow = () => (typeof process?.cpuUsage === "function" ? process.cpuUsage() : null);
// extra: the request's own, with its cancellation signal and progress token, for the tools that use them.
const guard = (fn) => async (args, extra) => {
  const started = performance.now(), cpu = cpuNow();
  let out;
  try { out = ok(await fn(args, extra)); } catch (err) { out = fail(err); }
  const used = cpu ? process.cpuUsage(cpu) : null;
  const cost = { ms: Math.round(performance.now() - started), ...(used ? { cpu_ms: Math.round((used.user + used.system) / 1000) } : {}), chars: out.content.reduce((t, c) => t + (c.text?.length ?? 0), 0) };
  return { ...out, _meta: { ...out._meta, [COST_KEY]: cost } };
};

async function toolFor(name, packs) {
  const desk = DESK.find((t) => t.name === name);
  if (desk) return desk;
  const e = BY_NAME.get(name);
  if (!e || !packs.includes(e.pack)) {
    const near = search(SEARCH, name.replace(/_/g, " "), { packs, limit: 3 }).map((t) => t.name);
    const off = e ? ` It is in the ${e.pack} pack, which is not enabled here (CANLI_PACKS, CANLI_OFFLINE).` : "";
    throw new Error(`No tool ${name}.${off}${near.length ? ` Closest: ${near.join(", ")}.` : ""} find_tool searches all of them.`);
  }
  return (await loadPack(e.pack)).get(name);
}

// Dotted path into a result: "rows", "multiple_testing.best.id", "rows.0". A table (columns plus
// rows) also takes column names: "rows.0.accession" is one cell, "rows.close" the whole column.
export function at(v, path) {
  if (!path) return v;
  let o = v, cols = null;
  for (const k of String(path).split(".")) {
    if (o == null) return undefined;
    if (cols && Array.isArray(o) && !/^\d+$/.test(k) && cols.includes(k)) {
      const i = cols.indexOf(k);
      o = Array.isArray(o[0]) ? o.map((r) => r[i]) : o[i];
      cols = null;
      continue;
    }
    if (k === "rows" && o && typeof o === "object" && !Array.isArray(o) && Array.isArray(o.columns)) cols = o.columns;
    else if (!(cols && Array.isArray(o) && /^\d+$/.test(k) && Array.isArray(o[k]))) cols = null;
    // Own fields only: "constructor" is not a field of a result.
    o = Object.hasOwn(o, k) ? o[k] : undefined;
  }
  return o;
}
// Results kept for later run_tool calls, by ref ("r1", "r2", ...): the last KEEP_COUNT, within
// KEEP_CHARS of JSON, in this process only.
const KEEP_COUNT = 32, KEEP_CHARS = 32 * 1024 * 1024;
export function createKeeper() {
  const kept = new Map();
  let n = 0, chars = 0;
  return {
    put(result) {
      const ref = `r${++n}`, size = JSON.stringify(result ?? null).length;
      if (size > KEEP_CHARS) return null;
      kept.set(ref, { result, size });
      chars += size;
      while (kept.size > KEEP_COUNT || chars > KEEP_CHARS) { const [k, v] = kept.entries().next().value; kept.delete(k); chars -= v.size; }
      return ref;
    },
    get: (ref) => kept.get(ref)?.result,
    has: (ref) => kept.has(ref),
    clear: () => { kept.clear(); chars = 0; },
    // The receipt of the answer a kept result came in, for the receipts of answers built from it.
    sign: (ref, receipt) => { const k = kept.get(ref); if (k) k.receipt = receipt; },
    receiptOf: (ref) => kept.get(ref)?.receipt,
  };
}

// Receipt chains: the kept results a call reads ($result refs in its arguments, or show_result's ref), each with
// the receipt of the answer it came in, which names its own in turn. An answer's receipt writes out those it was
// built from and theirs; below that, a receipt is named by its hashes.
const RECEIPT_DEPTH = 3;
function refsRead(calls) {
  const refs = new Set();
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { if (typeof v.$result === "string") refs.add(v.$result); Object.values(v).forEach(walk); } };
  for (const c of calls) { walk(c.arguments); if (c.name === "show_result" && typeof c.arguments?.ref === "string") refs.add(c.arguments.ref); }
  return [...refs];
}
const named = ({ ref, input_sha256, output_sha256, at }) => ({ ref, input_sha256, output_sha256, at });
const cut = (receipt, depth) => { const { from, ...own } = receipt; return from ? { ...own, from: from.map((p) => (depth > 1 ? cut(p, depth - 1) : named(p))) } : own; };
const builtFrom = (refs, keeper) => refs.flatMap((ref) => { const r = keeper.receiptOf(ref); return r ? [{ ref, ...cut(r, RECEIPT_DEPTH - 1) }] : []; });

function resolveResults(value, done, keeper) {
  if (Array.isArray(value)) return value.map((v) => resolveResults(v, done, keeper));
  if (value && typeof value === "object") {
    if (typeof value.$result === "string") {
      const ref = value.$result;
      if (!keeper?.has(ref)) throw new Error(`$result "${ref}" is not kept; refs name earlier results (the last ${KEEP_COUNT} are kept), for example "r1".`);
      let v = at(keeper.get(ref), value.path);
      if (v === undefined) throw new Error(`$result "${ref}" has nothing at "${value.path}".`);
      if (Array.isArray(value.pick)) v = v.map((row) => (value.pick.length === 1 ? row[value.pick[0]] : value.pick.map((c) => row[c])));
      return v;
    }
    if (Number.isInteger(value.$result)) {
      const i = value.$result;
      if (!(i >= 0 && i < done.length)) throw new Error(`$result ${i} refers to a call that has not run in this batch. A number refers to an earlier call in the same batch; to use a result from an earlier run_tool call, pass its ref, for example {"$result": "r1", "path": "close"}.`);
      if (done[i].error) throw new Error(`$result ${i} failed: ${done[i].error}`);
      let v = at(done[i].result, value.path);
      if (v === undefined) throw new Error(`$result ${i} has nothing at "${value.path}".`);
      if (Array.isArray(value.pick)) v = v.map((row) => (value.pick.length === 1 ? row[value.pick[0]] : value.pick.map((c) => row[c])));
      return v;
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveResults(v, done, keeper)]));
  }
  return value;
}
const usesResults = (v) => (Array.isArray(v) ? v.some(usesResults) : v && typeof v === "object" ? Number.isInteger(v.$result) || typeof v.$result === "string" || Object.values(v).some(usesResults) : false);

// Rounds fractional numbers to `digits` significant figures and never changes a whole number
// (counts, share amounts, CIKs, dollar totals) or the integer part of a large value.
export function roundNumbers(v, digits) {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || Number.isInteger(v)) return v;
    if (Math.abs(v) >= 10 ** digits) return Math.round(v);
    return Number(v.toPrecision(digits));
  }
  if (Array.isArray(v)) return v.map((x) => roundNumbers(x, digits));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundNumbers(x, digits)]));
  return v;
}

// JSON prints NaN and Infinity as null, so a model would read an overflow or a division by zero as
// a missing value. They are named instead.
export function nonFinitePaths(v, path = "", out = []) {
  if (typeof v === "number") { if (!Number.isFinite(v)) out.push(path || "result"); }
  else if (Array.isArray(v)) v.forEach((x, i) => nonFinitePaths(x, path ? `${path}.${i}` : String(i), out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) nonFinitePaths(x, path ? `${path}.${k}` : k, out);
  return out;
}

// A result above RESULT_CHARS of JSON (about 50,000 tokens) is sent as a preview: every field, with
// long lists cut to their first and last items. The full result stays under its ref, and the
// show_result call (named in the preview's note) reads any part of it.
export const RESULT_CHARS = 200_000;
const LIST_KEEP = 5, LIST_MAX = 40, TEXT_KEEP = 2000;
// keep, max and text shorten further for a tighter budget (fit, below).
export function preview(v, path = "", cut = [], { keep = LIST_KEEP, max = LIST_MAX, text = TEXT_KEEP } = {}) {
  const at = (k) => (path ? `${path}.${k}` : String(k));
  const limits = { keep, max, text };
  if (Array.isArray(v)) {
    if (v.length <= max) return v.map((x, i) => preview(x, at(i), cut, limits));
    cut.push({ path: path || "result", items: v.length });
    return { list_of: v.length, first: v.slice(0, keep).map((x, i) => preview(x, at(i), cut, limits)), last: keep ? v.slice(-keep).map((x, i) => preview(x, at(v.length - keep + i), cut, limits)) : [] };
  }
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, preview(x, at(k), cut, limits)]));
  if (typeof v === "string" && v.length > text) {
    cut.push({ path: path || "result", chars: v.length });
    return `${v.slice(0, text)}… (${v.length} characters)`;
  }
  return v;
}
// What a model reads of a result. The whole result stays under its ref, so nothing is lost: show_result
// gets it, and $result passes it on. On the 33 recorded answers this reads 15% fewer characters on a
// first call and 22% fewer when a tool is called again (bench/result-chars.mjs).
// - The list of source documents becomes a count and where to find it: a model rarely reads it.
// - A tool's limits and meaning come once a session: the words do not change, and reading them twice costs tokens.
// - Numbers show six significant figures unless digits says otherwise. Whole numbers stay exact.
// The source documents results were read from, as the packs report them: the markets pack's evidence (URL, the
// first 16 hex digits of the SHA-256 of the bytes received, and when) and the fundamentals pack's snapshot (URL,
// full SHA-256, when it was taken). At most 200, each once.
export function sourcesOf(results) {
  const out = [], seen = new Set();
  const add = (url, sha256, at, kind) => {
    if (typeof url !== "string" || seen.has(`${url} ${sha256}`)) return;
    seen.add(`${url} ${sha256}`);
    out.push({ url, [kind]: sha256 ?? null, retrieved_at: at ?? null });
  };
  for (const r of results) {
    if (!r || typeof r !== "object") continue;
    const ev = r.evidence;
    if (Array.isArray(ev?.rows) && Array.isArray(ev.columns)) {
      const [u, h, t] = ["url", "sha256_16", "retrieved_at"].map((c) => ev.columns.indexOf(c));
      for (const row of ev.rows) if (Array.isArray(row)) add(row[u], row[h], row[t], "sha256_16");
    }
    if (r.snapshot?.url) add(r.snapshot.url, r.snapshot.sha256, r.snapshot.fetched_at, "sha256");
  }
  return out.slice(0, 200);
}
export const DEFAULT_DIGITS = 6;
export function leanResult(result, { name, ref, seen, digits } = {}) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  let out = result;
  // Only where the list can still be had: the hosted server keeps nothing between requests.
  if (ref && Array.isArray(out.evidence?.rows)) out = { ...out, evidence: { documents: out.evidence.documents ?? out.evidence.rows.length, list: `show_result with ref ${ref} and path evidence` } };
  if (seen && name) {
    if (seen.has(name) && (out.limits || out.meaning)) {
      const { limits: _limits, meaning: _meaning, ...rest } = out;
      out = { ...rest, limits_and_meaning: `As in your earlier call of ${name}.` };
    }
    seen.add(name);
  }
  return digits === undefined ? roundNumbers(out, DEFAULT_DIGITS) : out;
}

function trimmed(result, ref, limit = RESULT_CHARS, shorten = {}) {
  const chars = JSON.stringify(result).length;
  if (chars <= limit) return result;
  const { keep = LIST_KEEP, text = TEXT_KEEP } = shorten;
  const cut = [], shown = preview(result, "", cut, shorten);
  const parts = cut.slice(0, 6).map((c) => `${c.path} (${c.items !== undefined ? `${c.items} items` : `${c.chars} characters`})`).join(", ") + (cut.length > 6 ? ` and ${cut.length - 6} more` : "");
  const first = cut[0]?.path === "result" ? "" : cut[0]?.path ?? "";
  return {
    ...shown,
    preview_only: {
      chars,
      shortened: cut.slice(0, 20),
      note: `This result is ${chars} characters. Lists show their first and last ${keep} items; long text shows its first ${text} characters. Shortened: ${parts || "large fields"}. ${ref ? `The whole result is kept as ${ref}: read a part with run_tool {"name": "show_result", "arguments": {"ref": "${ref}", "path": "${first}", "offset": 0, "limit": 200}}, pass {"$result": "${ref}", "path": "${first}"} to another tool, or call again with select.` : "Call again with select to choose the fields you need."}`,
    },
  };
}

// A result within `budget` characters of JSON (run_tool's max_chars): shortened step by step, with lists cut to
// fewer ends and long text to fewer characters, and as a last resort only the shape of its top level. The whole
// result stays under its ref either way.
const SHORTER = [{}, { keep: 3, max: 12, text: 600 }, { keep: 1, max: 4, text: 200 }, { keep: 0, max: 0, text: 80 }];
export function fit(result, ref, budget = RESULT_CHARS) {
  for (const shorten of SHORTER) {
    const out = trimmed(result, ref, budget, shorten);
    if (JSON.stringify(out).length <= budget) return out;
  }
  const shape = result && typeof result === "object" && !Array.isArray(result)
    ? Object.fromEntries(Object.entries(result).map(([k, v]) => [k, Array.isArray(v) ? `list of ${v.length}` : v && typeof v === "object" ? "object" : typeof v === "string" && v.length > 80 ? `text of ${v.length} characters` : v]))
    : { result: Array.isArray(result) ? `list of ${result.length}` : typeof result };
  return { ...shape, preview_only: { chars: JSON.stringify(result).length, note: `Only the shape fits max_chars ${budget}.${ref ? ` The whole result is kept as ${ref}: read parts with show_result, or call again with select.` : " Call again with select or a larger max_chars."}` } };
}

// What the model reads of a result the person sees as a view: every field, with each long list as
// its length, first and last items (and range, for numbers); labels such as columns kept whole.
export const VIEW_CHARS = 2_000_000;
export function glance(v, depth = 0) {
  if (Array.isArray(v)) {
    if (v.length <= 6 || (v.length <= 40 && v.every((x) => typeof x === "string" && x.length <= 60))) return v.map((x) => glance(x, depth + 1));
    let lo = Infinity, hi = -Infinity, nums = true;
    for (const x of v) { if (typeof x !== "number" || !Number.isFinite(x)) { nums = false; break; } if (x < lo) lo = x; if (x > hi) hi = x; }
    return { items: v.length, first: glance(v[0], depth + 1), last: glance(v.at(-1), depth + 1), ...(nums ? { min: lo, max: hi } : {}) };
  }
  if (v && typeof v === "object") return depth > 5 ? "…" : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, glance(x, depth + 1)]));
  return typeof v === "string" && v.length > 400 ? `${v.slice(0, 400)}…` : v;
}

// Part of a kept result: one path, and for a list a window of it.
export function showResult(keeper, args) {
  const a = z.object({ ref: z.string().max(20), path: z.string().max(200).optional(), offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(1000).optional() }).strict().parse(args ?? {});
  if (!keeper?.has(a.ref)) throw new Error(`show_result: "${a.ref}" is not kept; refs name earlier results (the last ${KEEP_COUNT} are kept), for example "r1".`);
  const full = keeper.get(a.ref), v = at(full, a.path);
  if (v === undefined) throw new Error(`show_result: ${a.ref} has no ${a.path}.`);
  const offset = a.offset ?? 0, limit = a.limit ?? 200;
  if (typeof v === "string") return { ref: a.ref, path: a.path ?? null, unit: "characters", total: v.length, offset, value: v.slice(offset, offset + limit), ...(offset + limit < v.length ? { next_offset: offset + limit } : {}) };
  if (!Array.isArray(v)) return { ref: a.ref, ...(a.path ? { path: a.path } : {}), value: v };
  const match = a.path?.match(/^(?:(.*)\.)?rows$/);
  const table = match ? at(full, match[1]) : null;
  const columns = table && Object.hasOwn(table, "columns") && Array.isArray(table.columns) ? table.columns : null;
  return { ref: a.ref, path: a.path ?? null, ...(columns ? { columns } : {}), total: v.length, offset, items: v.slice(offset, offset + limit), ...(offset + limit < v.length ? { next_offset: offset + limit } : {}) };
}

const RUN_INPUT = z.object({
      name: z.string().max(100).optional().describe("Tool name from find_tool."),
      arguments: z.record(z.string(), z.unknown()).optional().describe("The tool's arguments."),
      calls: z.array(z.object({ name: z.string().max(100), arguments: z.record(z.string(), z.unknown()).optional() }).strict()).min(1).max(25).optional().describe("Several calls in one round trip; calls without $result run concurrently."),
      return: z.enum(["all", "last"]).optional().describe("Batch: every result (default) or only the last."),
      digits: z.number().int().min(3).max(10).optional().describe("Round fractional numbers to this many significant figures (default 6; 4 saves tokens); whole numbers never change."),
      select: z.array(z.string().max(200)).min(1).max(30).optional().describe("Only these fields of each result, as dotted paths, e.g. [\"verdict\", \"rows.0.accession\"] (rows take column names)."),
      receipt: z.boolean().optional().describe("Add input and output SHA-256 and pack versions, to recompute and compare later."),
      max_chars: z.number().int().min(1000).max(RESULT_CHARS).optional().describe("Cap each result at this many JSON characters; the rest stays under its ref."),
      as_of: z.string().max(10).optional().describe("As of this past date (YYYY-MM-DD): only what was public then."),
      changes_only: z.boolean().optional().describe("Only what changed since this call last ran in this session."),
      view: z.boolean().optional().describe("Draw the result for the person (charts, statements, yield curves, backtests) where MCP Apps are drawn; you get a summary."),
    }).strict();

export const canliHome = (env = process.env) => env.CANLI_HOME ?? join(homedir(), ".canli");

// Every pack tool call passes the policy (CANLI_POLICY) first and is written to its audit log,
// refusals and failures too.
// --as-of or CANLI_AS_OF, read once when the server starts: no call can change it. See timemachine.mjs.
const AS_OF_ARG = process.argv.includes("--as-of") ? process.argv[process.argv.indexOf("--as-of") + 1] : process.env.CANLI_AS_OF;
const TIME_MACHINE = AS_OF_ARG ? createTimeMachine(AS_OF_ARG) : null;

async function runOne(packs, { name, arguments: given }, opts, files, gov, machine = TIME_MACHINE) {
  const tool = await toolFor(name, packs);
  // Offline with packs, what the fundamentals pack cannot find was never saved: its own words would say the SEC
  // has no figures, so they are put right.
  if (OFFLINE_PACKS && tool.pack === "fundamentals") return runOneAt(packs, tool, name, given, opts, files, gov, machine).catch((e) => { throw new Error(`${e.message} Offline: only the companies saved with canli-mcp pack add are here (canli-mcp pack list).`); });
  return runOneAt(packs, tool, name, given, opts, files, gov, machine);
}
async function runOneAt(packs, tool, name, given, opts, files, gov, machine) {
  const args = machine ? machine.admit(name, tool.pack, given) : given;
  const finish = (result) => (machine ? machine.seal(name, result) : result);
  if (!gov?.policy) return finish(await execute(tool, name, args, opts, files));
  try {
    gov.check(BY_NAME.get(name), { destructive: Boolean(tool.annotations?.destructiveHint) });
    const result = finish(await execute(tool, name, args, opts, files));
    gov.record({ tool: name, pack: tool.pack, args, result });
    return result;
  } catch (e) { gov.record({ tool: name, pack: tool.pack, args, error: e.message }); throw e; }
}
// Identical read-only calls in flight share one computation: a batch that asks the same thing twice, or concurrent
// requests in one process. The first caller keeps the result and each later one gets its own copy, so no caller
// can change another's. A tool that writes or sends anything always runs.
const INFLIGHT = new Map();
// A pack that sends nothing runs with fetch refused (tripwire.mjs).
// With CANLI_OFFLINE=packs, the fundamentals pack is one of them: it reads only what canli-mcp pack add saved.
const OFFLINE_PACKS = offlineMode() === "packs";
const sendsNothing = (pack) => Boolean(PACKS[pack]?.offline) || PLUGINS.get(pack)?.network === "none" || (OFFLINE_PACKS && pack === "fundamentals");
function shared(tool, name, data) {
  const run = sendsNothing(tool.pack) ? () => withoutNetwork(name, tool.pack, () => tool.run(data, tool.pack === "quant" ? { digits: 15 } : undefined)) : () => tool.run(data, tool.pack === "quant" ? { digits: 15 } : undefined);
  if (!tool.annotations?.readOnlyHint || tool.annotations?.destructiveHint) return run();
  const key = `${name}\u0000${JSON.stringify(data)}`;
  const running = INFLIGHT.get(key);
  if (running) return running.then((out) => structuredClone(out));
  const started = Promise.resolve().then(run);
  INFLIGHT.set(key, started);
  started.then(() => INFLIGHT.delete(key), () => INFLIGHT.delete(key));
  return started;
}
// An argument a model got nearly right: the tool's own key it most likely meant, by the names models reach for
// (ticker for symbol, start_date for start) or by spelling. When renaming fixes the call, the error gives the call.
const MEANT = { ticker: ["symbol", "company"], tickers: ["symbols", "companies", "holdings"], symbols: ["tickers", "holdings"], company: ["symbol", "ticker"], symbol: ["ticker", "company"], start_date: ["start", "since", "from"], end_date: ["end", "until", "to"], from: ["start", "since"], to: ["end", "until"], date: ["as_of", "end"], n: ["limit", "top"], count: ["limit", "top"], max: ["limit"], form: ["forms"], forms: ["form"], query: ["search", "q"], search: ["query"], period: ["periods"], cik: ["company"] };
const apart = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
// given: the arguments as sent, resolved: with $file read in, which is what is checked; the call shown is the one
// sent, so nothing read from a file comes back in an error.
function corrected(tool, given, resolved, issues) {
  const keys = Object.keys(tool.input?.shape ?? {}), fixed = { ...given }, checked = { ...resolved }, renames = [];
  for (const bad of issues.filter((i) => i.code === "unrecognized_keys").flatMap((i) => i.keys)) {
    const meant = (MEANT[bad] ?? []).find((k) => keys.includes(k) && !(k in fixed)) ?? keys.filter((k) => !(k in fixed)).map((k) => [k, apart(bad, k)]).filter(([, n]) => n <= 2).sort((x, y) => x[1] - y[1])[0]?.[0];
    if (!meant) continue;
    for (const o of [fixed, checked]) { o[meant] = o[bad]; delete o[bad]; }
    renames.push(`${bad} is ${meant}`);
  }
  if (!renames.length) return "";
  if (!tool.input.safeParse(checked).success) return ` ${renames.join("; ")}.`;
  const call = JSON.stringify({ name: tool.name, arguments: fixed });
  return call.length <= 600 ? ` ${renames.join("; ")}: the call is ${call}.` : ` ${renames.join("; ")}, and with that the call checks.`;
}
async function execute(tool, name, args, { digits }, files) {
  const resolved = resolveRefs(args ?? {}, files);
  const parsed = tool.input.safeParse(resolved);
  const plain = args && typeof args === "object" && !Array.isArray(args) && resolved && typeof resolved === "object" && !Array.isArray(resolved);
  if (!parsed.success) throw new Error(`${name}: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`).join("; ")}.${plain ? corrected({ ...tool, name }, args, resolved, parsed.error.issues) : ""} Arguments: ${BY_NAME.get(name).args}. describe_tool ${name} explains each one.`);
  // Packs return full precision (quant's own default); rounding happens once, here.
  const out = await shared(tool, name, parsed.data);
  const bad = nonFinitePaths(out);
  const result = digits ? roundNumbers(out, digits) : out;
  if (!bad.length || !result || typeof result !== "object" || Array.isArray(result)) return result;
  return { ...result, non_finite_values: { count: bad.length, paths: bad.slice(0, 8), note: "These numbers are not finite (an overflow, or a division by zero in the inputs) and print as null." } };
}

// No pack filter: in an agent evaluation a model narrowed its search to one pack and missed the tool
// that fitted its inputs in another.
function findTool(packs, { query, limit }) {
  if (typeof query !== "string" || !query.trim()) throw new Error("find_tool: query is what you need, in plain words.");
  const want = Math.min(Math.max(Number(limit) || 6, 1), 50);
  const all = search(SEARCH, query, { packs: [...packs, "desk"], limit: TIME_MACHINE ? 50 : want });
  const found = TIME_MACHINE ? all.filter((t) => TIME_MACHINE.admits(t.name, t.pack) || TIME_MACHINE.selfAllowed(t.name)).slice(0, want) : all;
  return { columns: ["name", "pack", "args", "description"], rows: found.map((t) => [t.name, t.pack, t.args, t.description.split(/(?<=\.)\s/)[0]]), next: "run_tool with these args (? = optional); describe_tool only if you need each argument's meaning or limits." };
}
async function describeTool(packs, { name }) {
  const t = await toolFor(String(name), packs), schema = z.toJSONSchema(t.input, { io: "input" });
  delete schema.$schema;
  return { name: t.name, pack: t.pack, title: t.title, description: t.description, input_schema: schema, ...(t.annotations?.destructiveHint ? { destructive: true } : {}) };
}

// readOnly: the hosted server, where a call changes nothing that outlives its request, says so, so a
// client need not ask before each one.
// The tools this server answers itself rather than through a pack. run_tool and the shell command both
// come here, so a desk tool is never handed to a pack's runner.
// machine: the time machine this call answers under (the server's, its own as_of, or a holdout's), which every call a
// desk tool makes is held to as well.
export function selfTools(packs, gov, keeper, readOnly = false, vault = null, preregs = null, machine = TIME_MACHINE) {
  const desk = { call: (name, args) => (name === "triangulate" ? runTriangulate(desk, args) : runOne(packs, { name, arguments: args }, {}, [], gov, machine)), keep: (r) => keeper.put(r), get: (ref) => keeper.get(ref), at, toolFor: (name) => toolFor(name, packs), hosted: Boolean(readOnly) };
  // A rule outlives the call that sets it, so it lives on your machine and never on the hosted server.
  const sentinel = async () => {
    if (readOnly) throw new Error("The sentinel watches from your own machine. Run it locally: npx -y canli-mcp");
    const { createSentinel } = await import("../local/sentinel.mjs");
    return createSentinel({ home: canliHome(), call: desk.call });
  };
  // A policy that bars these tools bars them here too, as it does for any pack's.
  const allowed = (name) => { if (gov?.policy) gov.check(BY_NAME.get(name), { destructive: false }); };
  const tools = { my_week: (args) => { allowed("my_week"); return runWeek(desk, args); }, signed_trial_count: (args) => { allowed("signed_trial_count"); if (readOnly) throw new Error("The signed log is on your own machine. Run it locally: npx -y canli-mcp"); return signedTrialCount(args, { dir: join(canliHome(), "audit"), keys: publicKeys(canliHome()) }); }, sentinel_add: async (args) => { allowed("sentinel_add"); return (await sentinel()).add(args); }, sentinel_list: async () => { allowed("sentinel_list"); return (await sentinel()).list(); }, sentinel_remove: async ({ id }) => { allowed("sentinel_remove"); return (await sentinel()).remove(id); }, sentinel_events: async (args) => { allowed("sentinel_events"); return (await sentinel()).events(args ?? {}); }, brief: (args) => runBrief(desk, args), swarm: (args) => runSwarm(desk, args), stress_worlds: (args) => runWorlds(desk, args), hub_list: (args) => runHubList(args), hub_check: (args) => runHubCheck(args), hub_run: (args) => runHubRun(desk, args), draft_orders: (args) => runDraft(args), triangulate: (args) => runTriangulate(desk, args), show_result: (args) => showResult(keeper, args), find_tool: (args) => findTool(packs, args ?? {}), describe_tool: (args) => describeTool(packs, args ?? {}), ...(gov?.audit ? { audit_log: (args) => auditLog(gov, args) } : {}) };
  // The holdout vault keeps a session, so it lives on your machine (holdout.mjs).
  const vaulted = (name) => { allowed(name); if (readOnly || !vault) throw new Error("The holdout vault keeps a session, and the hosted server keeps nothing between requests. Run it locally: npx -y canli-mcp"); return vault; };
  tools.restatement_causes = (args) => { allowed("restatement_causes"); return runCauses(desk, args); };
  tools.receipt_check = (args) => { allowed("receipt_check"); return runReceiptCheck(desk, args); };
  tools.reconcile_shares = (args) => { allowed("reconcile_shares"); return runShares(desk, args); };
  tools.red_flags = (args) => { allowed("red_flags"); return runRedFlags(desk, args); };
  tools.export_result = async (args) => {
    allowed("export_result");
    if (readOnly) throw new Error("export_result writes to your own machine. Run it locally: npx -y canli-mcp");
    const a = exportInput.parse(args ?? {});
    if (!keeper.has(a.ref)) throw new Error(`${a.ref} is not kept; refs name earlier results (the last ${KEEP_COUNT} are kept).`);
    const value = a.path ? at(keeper.get(a.ref), a.path) : keeper.get(a.ref);
    if (value === undefined) throw new Error(`${a.ref} has nothing at "${a.path}".`);
    const { toCsv, writeExport } = await import("../local/export.mjs");
    const text = a.name.endsWith(".csv") ? toCsv(value) : JSON.stringify(value, null, 1);
    const out = writeExport(canliHome(), a.name, text, keeper.receiptOf(a.ref));
    return { ...out, bytes: Buffer.byteLength(`${text}\n`), ...(a.name.endsWith(".csv") ? { lines: text.split("\n").length } : {}) };
  };
  tools.preregister = async (args) => {
    allowed("preregister");
    if (readOnly || !preregs) throw new Error("A pre-registration is named in the receipts of a session's later answers, and the hosted server keeps nothing between requests. Run it locally: npx -y canli-mcp");
    const entry = await preregs.add(args);
    gov?.audit?.record?.({ tool: "preregister", pack: "desk", args: { sha256: entry.sha256 }, result: { id: entry.id, at: entry.at } });
    return entry;
  };
  tools.holdout_set = (args) => vaulted("holdout_set").set(args);
  tools.holdout_status = () => vaulted("holdout_status").status();
  tools.holdout_test = async (args) => {
    const v = vaulted("holdout_test");
    v.check();
    const a = HOLDOUT_TOOLS[1].input.parse(args ?? {});
    if (BY_NAME.get(a.name)?.pack === "desk") throw new Error(`holdout_test runs a pack's tool, not ${a.name}.`);
    // Held only to the server's own date, if it runs as of one: the holdout is what this call may see.
    const result = await runOne(packs, { name: a.name, arguments: a.arguments ?? {} }, {}, [], gov, TIME_MACHINE ?? undefined);
    const test = v.record({ tool: a.name, input_sha256: sha256({ name: a.name, arguments: a.arguments ?? {} }), output_sha256: sha256(result) });
    gov?.audit?.record?.({ tool: "holdout_test", pack: "desk", args: { tool: a.name, from: v.from() }, result: test });
    return { ...result, holdout: { from: v.from(), test, reading: "The one test of this holdout. It stays hidden after this test, so a second one is refused." } };
  };
  if (!TIME_MACHINE) return tools;
  return Object.fromEntries(Object.entries(tools).map(([name, run]) => [name, TIME_MACHINE.selfAllowed(name) ? run : () => { throw TIME_MACHINE.refuse(name); }]));
}

export function registerAll(server, packs = enabledPacks(), gov = governance(process.env, canliHome()), { readOnly = false } = {}) {
  const keeper = createKeeper();
  const readLimits = new Set();
  // Every strategy result counted against the whole search (luck.mjs): a session here, one request when hosted.
  const luck = createLuck({ scope: readOnly ? "request" : "session" });
  // Each call's last whole result, for changes_only (delta.mjs).
  const delta = createDelta();
  installTripwire();
  // A holdout period hidden from every tool until its one test (holdout.mjs); setting it clears what was kept.
  const vault = createVault({ onSet: () => { keeper.clear(); delta.clear(); } });
  // Hypotheses hashed before the data, named in every later receipt (prereg.mjs); kept in CANLI_HOME on this machine.
  const preregs = createRegistry({ keep: readOnly ? null : async (line) => (await import("../local/prereg.mjs")).keepPreregistration(canliHome(), line) });
  server.registerTool("find_tool", {
    title: "Find a tool",
    description: `Search the ${ENTRIES.filter((e) => packs.includes(e.pack)).length} finance tools (packs: ${packs.join(", ")}) in plain words, e.g. "deflated sharpe", "revenue as of 2019". Returns the closest matches first, with names, argument signatures and one line each, even when none fits, so check them. Next: run_tool, or describe_tool if an argument is unclear.`,
    annotations: { title: "Find a tool", ...READ_ONLY },
    inputSchema: z.object({ query: z.string().max(200).describe("What you need, in plain words."), limit: z.number().int().min(1).max(50).optional().describe("1 to 50, default 6.") }).strict(),
    outputSchema: open,
  }, guard(({ query, limit }) => findTool(packs, { query, limit })));
  server.registerTool("describe_tool", {
    title: "Describe a tool",
    description: "Read one tool's full description and input JSON Schema, between find_tool and run_tool, when find_tool's signature does not settle an argument. An unknown name returns an error.",
    annotations: { title: "Describe a tool", ...READ_ONLY },
    inputSchema: z.object({ name: z.string().max(100).describe("The exact tool name, as find_tool returned it.") }).strict(),
    outputSchema: open,
  }, guard(({ name }) => describeTool(packs, { name })));
  server.registerTool("run_tool", {
    title: "Run tools",
    description: "Run a tool find_tool named: one ({name, arguments}), or up to 25 ({calls: [...]}). Independent calls run at once; a failed call returns its own error. Read-only unless the paper-trading pack is on. Any argument can be {\"$file\": \"path.csv\", \"column\": \"close\"} (or \"columns\": [...] / \"all\") instead of pasted numbers. {\"$result\": i, \"path\": \"close\"} passes batch call i's output into a later call; every result also has a ref (\"r1\", ...) later calls pass the same way, {\"$result\": \"r1\", \"path\": \"close\"}, so data never needs copying.",
    // Only the paper pack can send anything that changes an account; without it nothing here is destructive.
    annotations: { title: "Run tools", readOnlyHint: Boolean(readOnly), destructiveHint: packs.includes("paper"), idempotentHint: false, openWorldHint: true },
    inputSchema: RUN_INPUT,
    outputSchema: open,
    // Hosts that draw MCP Apps show the result in the viewer; others ignore this.
    _meta: { ui: { resourceUri: VIEW_URI } },
  }, guard(async (a, extra) => {
    // Models sometimes call run_tool through itself ({"name": "run_tool", "arguments": {...}});
    // unwrap it, and its calls inside a batch.
    if (a.name === "run_tool" && a.arguments && typeof a.arguments === "object") { const { name, arguments: inner, ...outer } = a; a = { ...inner, ...Object.fromEntries(Object.entries(outer).filter(([, v]) => v !== undefined)) }; }
    if (a.calls) a.calls = a.calls.flatMap((c) => (c.name === "run_tool" && c.arguments ? (c.arguments.calls ?? [{ name: c.arguments.name, arguments: c.arguments.arguments }]) : [c]));
    // Models sometimes put run_tool's own options inside a call's arguments; move them out when the
    // tool itself has no argument of that name.
    for (const c of a.calls ?? [a]) for (const k of ["return", "digits", "select", "receipt", "max_chars", "as_of", "changes_only"]) {
      if (c.arguments && k in c.arguments && !(BY_NAME.get(c.name)?.args ?? "").split(", ").some((x) => x.replace(/\?.*$/, "").replace(/:.*$/, "") === k)) { if (a[k] === undefined) a[k] = c.arguments[k]; delete c.arguments[k]; }
    }
    // The SDK validates the outer envelope. Wrapping and lifting options changes that envelope,
    // so validate the resulting request again before loading or executing any tool.
    a = RUN_INPUT.parse(a);
    if (!a.calls && !a.name) throw new Error("Pass name (and arguments) for one call, or calls for several.");
    if (a.calls && a.name) throw new Error("Pass either name or calls, not both.");
    const calls = a.calls ?? [{ name: a.name, arguments: a.arguments }], files = [], opts = { digits: a.digits };
    // The pre-registrations made before this answer, which its receipt names.
    const registered = preregs.list();
    // as_of: this call as of a past date, under the time machine's locks, and never later than the server's own date.
    let machine = a.as_of ? createTimeMachine(TIME_MACHINE && TIME_MACHINE.asOf < a.as_of ? TIME_MACHINE.asOf : a.as_of, { call: !TIME_MACHINE }) : TIME_MACHINE;
    // A holdout hides its years from every call but its one test, which runs on its own (holdout_test).
    const hidden = readOnly ? null : vault.until();
    if (hidden && (!machine || hidden < machine.asOf)) machine = createTimeMachine(hidden, { reason: `while the holdout from ${vault.from()} is set (holdout_status)` });
    // A view is drawn only where the host draws MCP Apps; elsewhere view changes nothing but the
    // backtest curve. A backtest shown as a view gets its curve and trades.
    const viewing = Boolean(a.view) && clientDrawsApps(server);
    if (a.view) for (const c of calls) if (/^backtest_/.test(c.name) && !(c.arguments && "curve" in c.arguments)) { try { if ((await toolFor(c.name, packs)).input?.shape?.curve) c.arguments = { ...(c.arguments ?? {}), curve: true }; } catch { /* reported when it runs */ } }
    // Models sometimes reach find_tool and describe_tool through run_tool; they run here as well.
    const SELF = selfTools(packs, gov, keeper, readOnly, vault, preregs, machine);
    const run = (c, args) => (SELF[c.name] ? Promise.resolve().then(() => { if (machine && !machine.selfAllowed(c.name)) throw machine.refuse(c.name); return SELF[c.name](args); }) : runOne(packs, { name: c.name, arguments: args }, opts, files, gov, machine));
    const destructive = await Promise.all(calls.map(async (c) => { if (SELF[c.name]) return false; try { return (await toolFor(c.name, packs)).annotations?.destructiveHint; } catch { return false; } }));
    if (calls.length > 1 && destructive.some(Boolean)) throw new Error("A tool that sends orders cannot run inside a batch; call it on its own after previewing.");
    const done = [];
    // A batch reports each call as it finishes when the client asked for progress, which also keeps a long batch
    // from timing out on clients that wait longer while progress comes; a cancelled batch starts no further call.
    // The SDK gives these as ctx.mcpReq (v2) or on the handler's extra (v1).
    const req = extra?.mcpReq ?? extra ?? {};
    const token = req._meta?.progressToken, notify = req.notify ?? req.sendNotification;
    let finished = 0;
    const progress = () => {
      finished += 1;
      if (token === undefined || calls.length < 2 || typeof notify !== "function") return;
      Promise.resolve(notify({ method: "notifications/progress", params: { progressToken: token, progress: finished, total: calls.length, message: `${finished} of ${calls.length} calls done` } })).catch(() => {});
    };
    const cancelled = () => Boolean(req.signal?.aborted);
    if (calls.some((c) => usesResults(c.arguments))) {
      for (const c of calls) {
        if (cancelled()) { done.push({ name: c.name, error: "not run: the request was cancelled" }); continue; }
        try { done.push({ name: c.name, result: await run(c, resolveResults(c.arguments ?? {}, done, keeper)) }); }
        catch (e) { done.push({ name: c.name, error: e.message }); }
        progress();
      }
    } else {
      done.push(...await Promise.all(calls.map((c) => run(c, c.arguments).then((result) => ({ name: c.name, result }), (e) => ({ name: c.name, error: e.message })).finally(progress))));
    }
    // Each strategy result says what is left after luck across everything tried so far (luck.mjs).
    done.forEach((d, i) => {
      if (d.result === undefined || SELF[d.name]) return;
      const note = luck.record(d.name, calls[i]?.arguments, d.result);
      if (note) d.result = { ...d.result, luck: note };
    });
    // Text from outside that speaks to an AI is marked where it is, and kept as the source gave it (injection.mjs).
    // A pack that sends nothing reads no outside text, so its results are not read for it.
    for (const d of done) {
      if (d.result === undefined || SELF[d.name] || !d.result || typeof d.result !== "object" || sendsNothing(BY_NAME.get(d.name)?.pack)) continue;
      const found = addressedToAi(d.result);
      if (found.length) d.result = { ...d.result, caution: { note: CAUTION, found } };
    }
    // Calls that read the world before a holdout was set may have seen it; its status counts them.
    for (const d of done) if (!SELF[d.name] && !["quant", "validation"].includes(BY_NAME.get(d.name)?.pack)) vault.saw();
    // Keep each full result (before select) under a ref for later calls.
    for (const d of done) if (d.result !== undefined && !SELF[d.name]) { const ref = keeper.put(d.result); if (ref) d.ref = ref; }
    // The receipt's sources come from the whole results, before select or changes_only narrow them.
    const sources = sourcesOf(done.map((d) => d.result));
    // A sweep's list of every variant's Sharpe was for the count; the model reads how many (luck.mjs).
    for (const d of done) if (d.result !== undefined && !SELF[d.name]) d.result = shownTrials(d.result);
    if (a.changes_only) done.forEach((d, i) => { if (d.result !== undefined && !SELF[d.name]) d.result = delta.changes(d.name, calls[i]?.arguments, d.result); });
    if (a.select) for (const d of done) if (d.result) {
      const full = d.result;
      // Rows without their column names are unreadable: selecting a table's rows keeps its columns.
      const paths = [...a.select];
      for (const p of a.select) {
        const m = String(p).match(/^(.*?)(?:^|\.)rows(?:\.\d+)?$/);
        if (!m) continue;
        const prefix = m[1] ? `${m[1].replace(/\.$/, "")}.` : "";
        const cols = `${prefix}columns`;
        if (!paths.includes(cols) && Array.isArray(at(full, cols))) paths.push(cols);
      }
      d.result = Object.fromEntries(paths.map((p) => [p, at(full, p) ?? null]));
      if (paths.some((p) => at(full, p) === undefined)) d.result.available_fields = Object.entries(full).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).slice(0, 12).map((x) => `${k}.${x}`) : [k])).slice(0, 60);
    }
    const hashes = { server: `${SERVER_NAME}@${SERVER_VERSION}`, packs: Object.fromEntries([...new Set(calls.map((c) => BY_NAME.get(c.name)?.pack))].filter(Boolean).map((p) => [p, INDEX.versions[p]])), input_sha256: sha256({ calls, digits: a.digits ?? null }), output_sha256: sha256(done.map(({ ref, ...d }) => d)) };
    // receipt: true puts the receipt in the answer, with the documents it names, for receipt_check.
    const receipt = a.receipt ? { ...hashes, sources } : undefined;
    // Every answer's receipt goes to the client in _meta, with the sources the full results were read from.
    const parents = builtFrom(refsRead(calls), keeper);
    const quiet = calls.every((c) => (SELF[c.name] ? ["find_tool", "describe_tool", "show_result"].includes(c.name) : sendsNothing(BY_NAME.get(c.name)?.pack)));
    const kept = { ...hashes, sources, at: new Date().toISOString(), ...(quiet ? { network: "none: every call ran where fetch is refused" } : {}), ...(parents.length ? { from: parents } : {}), ...(registered.length ? { after: registered } : {}) };
    for (const d of done) if (d.ref) keeper.sign(d.ref, kept);
    // After the receipt, which hashes the full results: an oversized one is sent as a preview.
    if (!a.select) for (const d of done) if (d.result !== undefined && !SELF[d.name]) d.result = leanResult(d.result, { name: d.name, ref: readOnly ? undefined : d.ref, seen: readLimits, digits: a.digits });
    for (const d of done) if (d.result !== undefined) d.result = viewing ? trimmed(d.result, d.ref, VIEW_CHARS) : fit(d.result, d.ref, a.max_chars ?? RESULT_CHARS);
    const shown = (out) => {
      if (!viewing) return out;
      const refs = (out.results ?? [out]).map((r) => r.ref).filter(Boolean);
      const summary = { viewed: `The person sees the whole result drawn as an interactive view; this is a summary of it.${refs.length ? ` show_result with ref ${refs.join(" or ")} reads any part.` : ""}`, ...glance(out) };
      // A result smaller than its summary is sent whole.
      if (JSON.stringify(summary).length < JSON.stringify(out).length) SUMMARIES.set(out, summary);
      return out;
    };
    const sealed = (out) => { RECEIPTS.set(out, kept); return out; };
    if (!a.calls) { if (done[0].error) throw new Error(done[0].error); return sealed(shown({ ...(done[0].ref ? { ref: done[0].ref } : {}), ...done[0].result, ...(files.length ? { files_read: files } : {}), ...(receipt ? { receipt } : {}) })); }
    const results = (a.return === "last" ? done.slice(-1) : done).map(({ name, ref, result, error }) => ({ name, ...(ref ? { ref } : {}), ...(error ? { error } : { result }) }));
    return sealed(shown({ results, ...(files.length ? { files_read: files } : {}), ...(receipt ? { receipt } : {}) }));
  }));
  registerResources(server, packs, gov, { readOnly, vault });
  registerView(server);
  registerPrompts(server, BY_NAME, packs);
  registerPackGuides(server, packs);
  // What the tools listed beside run_tool share with it: kept results, what was read once, and the holdout.
  return { keeper, readLimits, vault };
}

// audit_log (through run_tool, when the policy keeps a log): its state, a signed checkpoint now, or
// a check of the whole log.
function auditLog(gov, args) {
  const a = z.object({ action: z.enum(["status", "checkpoint", "verify"]).optional() }).strict().parse(args ?? {});
  if (a.action === "checkpoint") gov.audit.checkpoint();
  if (a.action === "verify") return { ...verifyAudit(gov.audit.path, publicKeys(canliHome())), status: gov.audit.status() };
  return gov.audit.status();
}

export const PRIVACY = (packs, gov) => ({
  packs: Object.fromEntries(packs.map((p) => [p, { network: packInfo(p).network, disk: packInfo(p).disk, ...(PLUGINS.has(p) ? { plugin: packInfo(p).package } : {}) }])),
  files: "{\"$file\": ...} arguments are read on this machine; nothing is uploaded and nothing is written by the reader",
  compile_cache: "Node keeps compiled JavaScript in its temp folder to start faster; it holds this server's code and nothing of yours",
  sentinel: "off until you use it: rules and events are kept in CANLI_HOME/sentinel on this machine, and sent only where you say with --webhook, --slack, --discord, --exec or --channel",
  local_models: "off until you run canli-mcp models install: they run on this machine, and no text leaves it",
  telemetry: "none: no analytics, logging or crash reporting",
  offline: "CANLI_OFFLINE=1 enables only the packs whose network is none (quant, validation), and no other pack's code is loaded; CANLI_OFFLINE=packs adds the fundamentals pack, which then reads only what canli-mcp pack add saved on this machine, with fetch refused",
  receipts: "every answer's receipt, in MCP's _meta, carries SHA-256 hashes and the URLs and times of the documents read, never the data",
  preregistrations: "off until you use preregister: each record is kept in CANLI_HOME/preregistrations.jsonl on this machine, readable only by you",
  holdout: "a holdout vault is kept in memory for the session and written nowhere",
  exports: "off until you use export_result: files are written only into CANLI_HOME/exports, under plain names, never over a file already there",
  network_tripwire: "packs that send nothing (quant, validation, and plugins whose network is none) run each tool with fetch refused, and an answer whose every call ran so says network none in its receipt",
  policy: gov?.policy ? { tools: gov.policy.tools ?? "all", orders: gov.policy.orders ?? "on", calls_per_minute: gov.policy.calls_per_minute ?? null, audit_log: gov.audit ? { file: gov.audit.path, arguments: gov.policy.audit.arguments ?? "hash" } : "off" } : "none (CANLI_POLICY unset): no policy and no audit log",
});

function registerResources(server, packs, gov, { readOnly = false, vault = null } = {}) {
  const json = (uri, v) => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify(v) }] });
  // The week, for a host to attach at the start of a session: my_week over the holdings in the address, with the
  // sentinel's events of the same days on a local server. It reads the present, so a server running as of a past
  // date, or with a holdout set, does not answer it.
  server.registerResource("week", new ResourceTemplate("canli://week/{holdings*}", { list: undefined }), { title: "This week", description: "my_week over the holdings in the address, comma-separated (canli://week/AAPL,NVDA,VOO), with the sentinel's events of the same seven days on a local server.", mimeType: "application/json" },
    async (uri, { holdings }) => {
      if (TIME_MACHINE) throw TIME_MACHINE.refuse("canli://week");
      if (vault?.until()) throw new Error(`canli://week reads this week, which the holdout from ${vault.from()} hides; holdout_status shows it.`);
      const list = [holdings].flat().flatMap((x) => decodeURIComponent(String(x)).split(/[,+\s]+/)).filter(Boolean).slice(0, 25);
      const week = await runWeek({ call: (name, args) => runOne(packs, { name, arguments: args }, {}, [], gov) }, { holdings: list });
      if (readOnly) return json(uri.href, week);
      const { createSentinel } = await import("../local/sentinel.mjs");
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const events = createSentinel({ home: canliHome(), call: async () => { throw new Error("not watching"); } }).events({ last: 100 }).events.filter((e) => e.at >= since);
      return json(uri.href, { ...week, sentinel_events: events.length ? events : "none in these seven days (canli-mcp sentinel run, or --channel, watches)" });
    });
  // A company to attach to a conversation by its address (in Claude Code, @canli:canli://company/AAPL): company_report,
  // its profile, five fiscal years of figures and its price and risk, cut to the size of an answer.
  server.registerResource("company", new ResourceTemplate("canli://company/{company}", { list: undefined }), { title: "A company", description: "company_report for the ticker, CIK or name in the address (canli://company/AAPL): profile, five fiscal years of financials, price and risk.", mimeType: "application/json" },
    async (uri, { company }) => {
      if (vault?.until()) throw new Error(`canli://company reads the present, which the holdout from ${vault.from()} hides; holdout_status shows it.`);
      const report = await runOne(packs, { name: "company_report", arguments: { company: decodeURIComponent(String(company)) } }, {}, [], gov);
      return json(uri.href, fit(report, null, RESULT_CHARS));
    });
  server.registerResource("catalog", "canli://catalog", { title: "Tool catalog", description: "Every tool: name, pack and title.", mimeType: "application/json" },
    (uri) => json(uri.href, { tools: ENTRIES.filter((e) => packs.includes(e.pack)).length, columns: ["name", "pack", "title"], rows: ENTRIES.filter((e) => packs.includes(e.pack)).map((e) => [e.name, e.pack, e.title]) }));
  server.registerResource("packs", "canli://packs", { title: "Packs", description: "Each pack: its source package and version, tool count, network and disk use, and renamed or omitted tools.", mimeType: "application/json" },
    (uri) => json(uri.href, { enabled: packs, packs: Object.fromEntries([...Object.entries(PACKS), ...PLUGINS].map(([k, p]) => [k, { ...p, version: INDEX.versions[k] ?? null, tools: ENTRIES.filter((e) => e.pack === k).length, renamed: RENAMES[k] ?? {}, omitted: OMITTED[k] ?? {} }])) }));
  server.registerResource("privacy", "canli://privacy", { title: "Privacy", description: "What each enabled pack sends off this machine and keeps on disk.", mimeType: "application/json" },
    (uri) => json(uri.href, PRIVACY(packs, gov)));
  server.registerResource("tool-schema", new ResourceTemplate("canli://tools/{name}", { list: undefined, complete: { name: (v) => ENTRIES.filter((e) => packs.includes(e.pack)).map((e) => e.name).filter((n) => n.startsWith(v ?? "")).slice(0, 50) } }), { title: "Tool schema", description: "One tool's description and input JSON Schema.", mimeType: "application/json" },
    async (uri, { name }) => { const t = await toolFor(String(name), packs), s = z.toJSONSchema(t.input, { io: "input" }); delete s.$schema; return json(uri.href, { name: t.name, pack: t.pack, description: t.description, input_schema: s }); });
}

// The most-used tools are also listed directly, with their own schemas, beside the three discovery
// tools: a model calls them in one step instead of searching first, for a few hundred more tokens of
// tool list. CANLI_FRONT names them, comma-separated; set it empty to list only the three.
export const FRONT_DEFAULT = Object.freeze(["history", "financial_statements"]);
// Which of the two to reach for: both can give a company's revenue.
const FRONT_GUIDE = {
  history: " Use it for one measure across periods or as known on a past date; financial_statements for whole statements. Long answers come in pages.",
  financial_statements: " Use it for every line in the company's own words; history for one measure over many years.",
};
export function frontTools(packs, env = process.env) {
  const names = env.CANLI_FRONT === undefined ? FRONT_DEFAULT : env.CANLI_FRONT.split(",").map((x) => x.trim()).filter(Boolean);
  return [...new Set(names)].filter((n) => BY_NAME.has(n) && packs.includes(BY_NAME.get(n).pack));
}
export async function registerFront(server, packs, names = frontTools(packs), gov = null, shared = null) {
  for (const name of names) {
    const t = await toolFor(name, packs);
    server.registerTool(name, {
      title: t.title, description: t.description + (FRONT_GUIDE[name] ?? ""), inputSchema: t.input, outputSchema: open,
      annotations: { title: t.title, ...(t.annotations ?? READ_ONLY) },
    }, guard(async (args) => {
      // A holdout hides its years from these tools as from run_tool, and they count toward what read the world before one.
      const hidden = shared?.vault?.until();
      const machine = hidden && (!TIME_MACHINE || hidden < TIME_MACHINE.asOf) ? createTimeMachine(hidden, { reason: `while the holdout from ${shared.vault.from()} is set (holdout_status)` }) : TIME_MACHINE;
      const full = await runOne(packs, { name, arguments: args }, {}, [], gov, machine), ref = shared?.keeper.put(full) || undefined;
      shared?.vault?.saw();
      const shown = trimmed(leanResult(full, { name, ref, seen: shared?.readLimits }), ref);
      return ref && shown && typeof shown === "object" && !Array.isArray(shown) ? { ref, ...shown } : shown;
    }));
  }
  return names;
}

const isMain = (() => { try { const run = realpathSync(process.argv[1] ?? ""); return run === realpathSync(fileURLToPath(import.meta.url)) || run === realpathSync(fileURLToPath(new URL("./start.mjs", import.meta.url))); } catch { return false; } })();
// Besides serving MCP over stdio: `canli-mcp audit verify [log] [--ed25519 pub.pem] [--ml-dsa pub.pem]`
// checks an audit log, and `canli-mcp watch [--forms 8-K,4] [--company words] [--event earnings]
// [--every 60]` prints each new EDGAR filing as a line of JSON. `canli-mcp gui` opens the tools and
// result views in a browser; `canli-mcp serve` offers MCP over Streamable HTTP and WebSocket. Both
// answer only on the loopback address, and live apart in local/: nothing in src listens.
// `canli-mcp check returns.csv --trials 40` is the luck check for a CI job, and `canli-mcp run <tool>
// '<json>'` runs one tool from a shell.
const flag = (argv, name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
if (isMain && process.argv[2] === "audit") {
  const argv = process.argv.slice(3), home = canliHome();
  if (argv[0] !== "verify") { process.stderr.write("usage: canli-mcp audit verify [file or directory] [--ed25519 pub.pem] [--ml-dsa pub.pem]\n"); process.exit(2); }
  const target = argv[1] && !argv[1].startsWith("--") ? argv[1] : join(home, "audit");
  // The keys beside the log (its CANLI_HOME is the audit folder's parent) come first, then this
  // machine's CANLI_HOME: a log copied with its home checks without flags.
  const at = resolve(target), folder = (() => { try { return statSync(at).isDirectory() ? at : dirname(at); } catch { return dirname(at); } })();
  const near = publicKeys(dirname(folder)), mine = publicKeys(home);
  const keys = { ed25519: near.ed25519 ?? mine.ed25519, ml_dsa_65: near.ml_dsa_65 ?? mine.ml_dsa_65 }, read = (p) => (p ? readFileSync(p, "utf8") : undefined);
  const out = verifyAudit(target, { ed25519: read(flag(argv, "--ed25519")) ?? keys.ed25519, ml_dsa_65: read(flag(argv, "--ml-dsa")) ?? keys.ml_dsa_65 });
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(out.valid ? 0 : 1);
} else if (isMain && process.argv[2] === "watch") {
  const argv = process.argv.slice(3);
  const tool = await toolFor("latest_filings", enabledPacks({ ...process.env, CANLI_PACKS: "markets" }));
  await watchFilings((args) => tool.run(tool.input.parse(args)), {
    forms: flag(argv, "--forms")?.split(",").map((s) => s.trim()).filter(Boolean),
    company: flag(argv, "--company"), event: flag(argv, "--event"),
    every: Number(flag(argv, "--every") ?? 60),
  }, (line) => process.stdout.write(`${line}\n`));
} else if (isMain && process.argv[2] === "pack") {
  // `canli-mcp pack add <ticker, CIK or name>... | list`: companies saved for CANLI_OFFLINE=packs (local/pack.mjs).
  const [verb, ...rest] = process.argv.slice(3);
  const show = (x) => process.stdout.write(`${JSON.stringify(x)}\n`);
  if (verb === "list") { show((await import("../local/pack.mjs")).packList(canliHome())); process.exit(0); }
  if (verb !== "add" || !rest.length) { process.stderr.write("usage: canli-mcp pack add <ticker, CIK or name>... | list\n"); process.exit(2); }
  if (OFFLINE_PACKS) { process.stderr.write("canli-mcp pack add reads from the network: run it without CANLI_OFFLINE.\n"); process.exit(2); }
  const packs = enabledPacks({ ...process.env, CANLI_PACKS: "fundamentals" }), gov = governance(process.env, canliHome());
  process.on("exit", () => gov.close());
  show(await (await import("../local/pack.mjs")).packAdd(canliHome(), (name, args) => runOne(packs, { name, arguments: args }, {}, [], gov), rest.slice(0, 200)));
} else if (isMain && process.argv[2] === "sentinel") {
  // `canli-mcp sentinel add '<rule as JSON>' | list | remove <id> | events | run [--webhook url] [--slack url] [--discord url] [--exec 'command'] [--once]`.
  // Where events go is set here, by whoever runs this, and never by a rule.
  const [verb, ...rest] = process.argv.slice(3);
  if (TIME_MACHINE) { process.stderr.write("The sentinel watches the present, so it does not run as of a past date.\n"); process.exit(2); }
  const packs = enabledPacks({ ...process.env, CANLI_PACKS: "markets,fundamentals" }), gov = governance(process.env, canliHome());
  process.on("exit", () => gov.close());
  const call = (name, args) => runOne(packs, { name, arguments: args }, {}, [], gov);
  const { chatSink, createSentinel, webhookSink } = await import("../local/sentinel.mjs");
  const s = createSentinel({ home: canliHome(), call, say: (m) => process.stderr.write(`${m}\n`) });
  const show = (x) => process.stdout.write(`${JSON.stringify(x)}\n`);
  if (verb === "add") show(s.add(JSON.parse(rest[0] ?? "{}")));
  else if (verb === "list") show(s.list());
  else if (verb === "remove") show(s.remove(rest[0]));
  else if (verb === "events") show(s.events({ last: Number(flag(rest, "--last") ?? 20) }));
  else if (verb === "run") {
    if (!s.rules().length) { process.stderr.write("No rules yet. Add one: canli-mcp sentinel add '{\"kind\":\"price_move\",\"symbol\":\"BTC-USD\",\"percent\":2,\"within_minutes\":30}'\n"); process.exit(2); }
    s.sinks.add((event) => show(event));
    if (flag(rest, "--webhook")) s.sinks.add(webhookSink(flag(rest, "--webhook")));
    for (const service of ["slack", "discord"]) if (flag(rest, `--${service}`)) s.sinks.add(chatSink(flag(rest, `--${service}`), service));
    if (flag(rest, "--exec")) s.sinks.add((await import("../local/commands.mjs")).execSink(flag(rest, "--exec")));
    if (rest.includes("--once")) { await s.pollDue(); process.exit(0); }
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { s.stop(); process.exit(0); });
    s.start();
    setInterval(() => {}, 60000);
  } else { process.stderr.write("usage: canli-mcp sentinel add '<rule as JSON>' | list | remove <id> | events [--last n] | run [--webhook url] [--slack url] [--discord url] [--exec 'command'] [--once]\n"); process.exit(2); }
} else if (isMain && process.argv[2] === "models") {
  // `canli-mcp models install | status | index <company> [--years n]`. Installing is the one way the
  // optional local models get onto a machine: no tool ever does it.
  const [verb, ...rest] = process.argv.slice(3);
  const M = await import("canli-markets-mcp/src/models.mjs");
  if (verb === "install") {
    const dir = M.modelsDir(), { installPackage } = await import("../local/commands.mjs");
    process.stderr.write(`Installing ${M.RUNTIME_PACKAGE} into ${dir} (about 500 MB). Models come down from Hugging Face on first use (about 140 MB).\nFinBERT is licensed for non-commercial use: ${M.MODELS.sentiment.license}\n`);
    process.exit(installPackage(dir, M.RUNTIME_PACKAGE));
  } else if (verb === "status") {
    process.stdout.write(`${JSON.stringify({ installed: M.modelsInstalled(), at: M.modelsDir(), runtime: M.RUNTIME_PACKAGE, models: M.MODELS })}\n`);
  } else if (verb === "index" && rest[0]) {
    const { buildMemoryVectors } = await import("canli-markets-mcp/src/memory.mjs");
    const { createSession } = await import("canli-markets-mcp/src/sources.mjs");
    const n = await buildMemoryVectors(createSession(), rest[0], { years: Number(flag(rest, "--years") ?? 25), onReport: (filed, paragraphs) => process.stderr.write(`${filed}: ${paragraphs} paragraphs\n`) });
    process.stdout.write(`${JSON.stringify({ indexed_reports: n, company: rest[0] })}\n`);
  } else { process.stderr.write("usage: canli-mcp models install | status | index <company> [--years n]\n"); process.exit(2); }
} else if (isMain && process.argv[2] === "check") {
  const argv = process.argv.slice(3), file = argv[0];
  // --trials log: the number comes from the signed audit log, which someone else can check.
  const fromLog = flag(argv, "--trials") === "log" ? signedTrialCount({ since: flag(argv, "--since") }, { dir: join(canliHome(), "audit"), keys: publicKeys(canliHome()) }) : null;
  if (fromLog && !fromLog.log_on) { process.stderr.write(`${fromLog.how}\n`); process.exit(2); }
  const trials = fromLog ? Math.max(fromLog.trials, 1) : Number(flag(argv, "--trials"));
  if (!file || file.startsWith("--") || !Number.isInteger(trials) || trials < 1) { process.stderr.write("usage: canli-mcp check returns.csv --trials <how many variants were tried> [--column name] [--periods 252] [--spread 0.5] [--format markdown|json] [--at-least 0.95]\n"); process.exit(2); }
  const { asMarkdown, checkReport, readReturns } = await import("./check.mjs");
  const bytes = readFileSync(file), { column, returns } = readReturns(bytes.toString("utf8"), flag(argv, "--column"));
  const tool = await toolFor("validate_deflated_sharpe", enabledPacks({ ...process.env, CANLI_PACKS: "validation" }));
  const result = await tool.run(tool.input.parse({ returns, periods_per_year: Number(flag(argv, "--periods") ?? 252), effective_independent_trials: Math.max(2, trials), cross_trial_sharpe_sd_annualized: Number(flag(argv, "--spread") ?? 0.5) }));
  const report = checkReport({ file, bytes, column, count: returns.length, trials, result, version: SERVER_VERSION });
  process.stdout.write(flag(argv, "--format") === "json" ? `${JSON.stringify(report, null, 2)}\n` : `${asMarkdown(report)}\n`);
  // A floor is the caller's own choice for its own pipeline; the report itself never says passed.
  const floor = flag(argv, "--at-least");
  if (floor !== undefined && !(report.deflated_sharpe_probability >= Number(floor))) process.exit(1);
} else if (isMain && process.argv[2] === "run") {
  const [name, json] = process.argv.slice(3);
  if (!name) { process.stderr.write("usage: canli-mcp run <tool> '<arguments as JSON>'\n"); process.exit(2); }
  const packs = [...enabledPacks(), ...await addPlugins()];
  const args = JSON.parse(json ?? "{}"), self = selfTools(packs, null, createKeeper());
  if (!self[name] && (await toolFor(name, packs)).annotations?.destructiveHint) { process.stderr.write(`${name} sends orders, so it cannot run from the command line.\n`); process.exit(2); }
  const out = self[name] ? await self[name](args) : await runOne(packs, { name, arguments: args }, {}, [], null);
  process.stdout.write(`${JSON.stringify(out)}\n`);
} else if (isMain && (process.argv[2] === "gui" || process.argv[2] === "serve")) {
  const argv = process.argv.slice(3), packs = [...enabledPacks(), ...await addPlugins()], gov = governance(process.env, canliHome());
  const makeServer = async () => { const server = new McpServer(SERVER_INFO, { instructions: instructions(packs, []) }); registerAll(server, packs, gov); return server; };
  process.on("exit", () => gov.close());
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));
  const port = Number(flag(argv, "--port") ?? 0);
  if (process.argv[2] === "gui") {
    const { startGui } = await import("../local/gui.mjs");
    const gui = await startGui({ makeServer, port });
    process.stdout.write(`Open this address in your browser:\n${gui.url}\nIt answers only on this machine. Press Ctrl-C to stop.\n`);
  } else {
    const { startServe } = await import("../local/serve.mjs");
    const s = await startServe({ makeServer, port, token: process.env.CANLI_SERVE_TOKEN || undefined });
    process.stdout.write(`${JSON.stringify({ http: s.http, websocket: s.ws, token: s.token, note: "Send Authorization: Bearer <token>. Loopback only." })}\n`);
  }
} else if (isMain) {
  const packs = [...enabledPacks(), ...await addPlugins()];
  const front = frontTools(packs);
  const gov = governance(process.env, canliHome());
  // --channel: the sentinel runs inside this server and each event wakes a Claude Code session started
  // with channels on. Other hosts ignore the notification; for them, canli-mcp sentinel run --exec.
  const channel = process.argv.includes("--channel");
  const server = new McpServer(SERVER_INFO, { instructions: `${TIME_MACHINE ? `${TIME_MACHINE.instructions} ` : ""}${instructions(packs, front)}${channel ? ` ${CHANNEL_INSTRUCTIONS}` : ""}` });
  if (channel) server.server.registerCapabilities({ experimental: { "claude/channel": {} } });
  await registerFront(server, packs, front, gov, registerAll(server, packs, gov));
  // Signing is synchronous, so the last calls are signed even as the process exits.
  process.on("exit", () => gov.close());
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));
  await server.connect(new StdioServerTransport());
  // Its reads go through the same policy and audit log as any call. It watches the present, so a server
  // running as of a past date never starts it.
  if (channel && !TIME_MACHINE) {
    const { createSentinel } = await import("../local/sentinel.mjs");
    const s = createSentinel({ home: canliHome(), call: (name, args) => runOne(packs, { name, arguments: args }, {}, [], gov) });
    s.sinks.add(channelSink(server));
    s.start();
  }
}
