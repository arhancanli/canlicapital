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
import { runWorlds, WORLDS_TOOL } from "./worlds.mjs";
import { OMITTED, PACKS, PLUGINS, RENAMES, enabledPacks, loadPack, loadPlugins, packInfo } from "./packs.mjs";
import { signature } from "./signature.mjs";
import { buildIndex, search } from "./search.mjs";
import { registerPrompts } from "./prompts.mjs";
import { clientDrawsApps, registerView, VIEW_URI } from "./view.mjs";
import { registerPackGuides } from "./guides.mjs";
import { governance, publicKeys, verifyAudit } from "./governance.mjs";
import { watchFilings } from "./watch.mjs";

const PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const INDEX = JSON.parse(readFileSync(new URL("./index.json", import.meta.url), "utf8"));
export const SERVER_NAME = "canli-mcp";
export const SERVER_VERSION = PKG.version;
export const SERVER_INFO = Object.freeze({
  name: SERVER_NAME, version: SERVER_VERSION, title: "Canli Capital",
  websiteUrl: "https://canlicapital.com/developers",
  icons: [{ src: "https://canlicapital.com/icon-512.png", mimeType: "image/png", sizes: ["512x512"] }, { src: "https://canlicapital.com/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] }],
});

const DESK = [...FANOUT, WORLDS_TOOL];
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
const ok = (result) => ({ content: [{ type: "text", text: JSON.stringify((result && typeof result === "object" && SUMMARIES.get(result)) ?? result) }], structuredContent: result });
const fail = (err) => ({ isError: true, content: [{ type: "text", text: String(err?.message ?? err) }] });
const guard = (fn) => async (args) => { try { return ok(await fn(args)); } catch (err) { return fail(err); } };

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
  };
}

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
const LIST_KEEP = 5, LIST_MAX = 40;
export function preview(v, path = "", cut = []) {
  const at = (k) => (path ? `${path}.${k}` : String(k));
  if (Array.isArray(v)) {
    if (v.length <= LIST_MAX) return v.map((x, i) => preview(x, at(i), cut));
    cut.push({ path: path || "result", items: v.length });
    return { list_of: v.length, first: v.slice(0, LIST_KEEP).map((x, i) => preview(x, at(i), cut)), last: v.slice(-LIST_KEEP).map((x, i) => preview(x, at(v.length - LIST_KEEP + i), cut)) };
  }
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, preview(x, at(k), cut)]));
  if (typeof v === "string" && v.length > 2000) {
    cut.push({ path: path || "result", chars: v.length });
    return `${v.slice(0, 2000)}… (${v.length} characters)`;
  }
  return v;
}
function trimmed(result, ref, limit = RESULT_CHARS) {
  const chars = JSON.stringify(result).length;
  if (chars <= limit) return result;
  const cut = [], shown = preview(result, "", cut);
  const parts = cut.slice(0, 6).map((c) => `${c.path} (${c.items !== undefined ? `${c.items} items` : `${c.chars} characters`})`).join(", ") + (cut.length > 6 ? ` and ${cut.length - 6} more` : "");
  const first = cut[0]?.path === "result" ? "" : cut[0]?.path ?? "";
  return {
    ...shown,
    preview_only: {
      chars,
      shortened: cut.slice(0, 20),
      note: `This result is ${chars} characters. Lists show their first and last ${LIST_KEEP} items; long text shows its first 2000 characters. Shortened: ${parts || "large fields"}. ${ref ? `The whole result is kept as ${ref}: read a part with run_tool {"name": "show_result", "arguments": {"ref": "${ref}", "path": "${first}", "offset": 0, "limit": 200}}, pass {"$result": "${ref}", "path": "${first}"} to another tool, or call again with select.` : "Call again with select to choose the fields you need."}`,
    },
  };
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
      name: z.string().max(100).optional().describe("Tool name from find_tool (single call)."),
      arguments: z.record(z.string(), z.unknown()).optional().describe("The tool's arguments (single call)."),
      calls: z.array(z.object({ name: z.string().max(100), arguments: z.record(z.string(), z.unknown()).optional() }).strict()).min(1).max(25).optional().describe("Several calls in one round trip. Calls without $result references run concurrently."),
      return: z.enum(["all", "last"]).optional().describe("For a batch: every result (default) or only the last one."),
      digits: z.number().int().min(3).max(10).optional().describe("Round fractional numbers in the results to this many significant figures (4-6 saves output tokens); whole numbers such as counts, shares and IDs are never changed. Default: as each tool returns them."),
      select: z.array(z.string().max(200)).min(1).max(30).optional().describe("Return only these fields of each result, as dotted paths, e.g. [\"verdict\", \"multiple_testing.best\", \"rows.0.accession\"] (table rows take column names)."),
      receipt: z.boolean().optional().describe("Add input and output SHA-256 and pack versions so the result can be recomputed and compared."),
      view: z.boolean().optional().describe("Draw the whole result for the person (charts, comparisons, option chains, yield curves, statements, backtest dashboards, order tickets) and return you a summary, where MCP Apps are drawn."),
    }).strict();

export const canliHome = (env = process.env) => env.CANLI_HOME ?? join(homedir(), ".canli");

// Every pack tool call passes the policy (CANLI_POLICY) first and is written to its audit log,
// refusals and failures too.
async function runOne(packs, { name, arguments: args }, opts, files, gov) {
  const tool = await toolFor(name, packs);
  if (!gov?.policy) return execute(tool, name, args, opts, files);
  try {
    gov.check(BY_NAME.get(name), { destructive: Boolean(tool.annotations?.destructiveHint) });
    const result = await execute(tool, name, args, opts, files);
    gov.record({ tool: name, pack: tool.pack, args, result });
    return result;
  } catch (e) { gov.record({ tool: name, pack: tool.pack, args, error: e.message }); throw e; }
}
async function execute(tool, name, args, { digits }, files) {
  const parsed = tool.input.safeParse(resolveRefs(args ?? {}, files));
  if (!parsed.success) throw new Error(`${name}: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`).join("; ")}. Arguments: ${BY_NAME.get(name).args}. describe_tool ${name} explains each one.`);
  // Packs return full precision (quant's own default); rounding happens once, here.
  const out = await tool.run(parsed.data, tool.pack === "quant" ? { digits: 15 } : undefined);
  const bad = nonFinitePaths(out);
  const result = digits ? roundNumbers(out, digits) : out;
  if (!bad.length || !result || typeof result !== "object" || Array.isArray(result)) return result;
  return { ...result, non_finite_values: { count: bad.length, paths: bad.slice(0, 8), note: "These numbers are not finite (an overflow, or a division by zero in the inputs) and print as null." } };
}

// No pack filter: in an agent evaluation a model narrowed its search to one pack and missed the tool
// that fitted its inputs in another.
function findTool(packs, { query, limit }) {
  if (typeof query !== "string" || !query.trim()) throw new Error("find_tool: query is what you need, in plain words.");
  const found = search(SEARCH, query, { packs: [...packs, "desk"], limit: Math.min(Math.max(Number(limit) || 6, 1), 50) });
  return { columns: ["name", "pack", "args", "description"], rows: found.map((t) => [t.name, t.pack, t.args, t.description.split(/(?<=\.)\s/)[0]]), next: "run_tool with these args (? = optional); describe_tool only if you need each argument's meaning or limits." };
}
async function describeTool(packs, { name }) {
  const t = await toolFor(String(name), packs), schema = z.toJSONSchema(t.input, { io: "input" });
  delete schema.$schema;
  return { name: t.name, pack: t.pack, title: t.title, description: t.description, input_schema: schema, ...(t.annotations?.destructiveHint ? { destructive: true } : {}) };
}

// readOnly: the hosted server, where a call changes nothing that outlives its request, says so, so a
// client need not ask before each one.
export function registerAll(server, packs = enabledPacks(), gov = governance(process.env, canliHome()), { readOnly = false } = {}) {
  const keeper = createKeeper();
  server.registerTool("find_tool", {
    title: "Find a tool",
    description: `Search the ${ENTRIES.filter((e) => packs.includes(e.pack)).length} finance tools (packs: ${packs.join(", ")}) by what you need, e.g. "deflated sharpe", "black scholes greeks", "revenue as of 2019". Returns names, packs, argument signatures and one-line descriptions, best first.`,
    annotations: { title: "Find a tool", ...READ_ONLY },
    inputSchema: z.object({ query: z.string().max(200).describe("What you need, in plain words."), limit: z.number().int().min(1).max(50).optional().describe("Default 6.") }).strict(),
    outputSchema: open,
  }, guard(({ query, limit }) => findTool(packs, { query, limit })));
  server.registerTool("describe_tool", {
    title: "Describe a tool",
    description: "One tool's full description and exact input JSON Schema.",
    annotations: { title: "Describe a tool", ...READ_ONLY },
    inputSchema: z.object({ name: z.string().max(100).describe("A tool name from find_tool.") }).strict(),
    outputSchema: open,
  }, guard(({ name }) => describeTool(packs, { name })));
  server.registerTool("run_tool", {
    title: "Run tools",
    description: "Run one tool ({name, arguments}) or several in one call ({calls: [...]}). Any argument can be {\"$file\": \"path.csv\", \"column\": \"close\"} (or \"columns\": [...] / \"all\") instead of pasted numbers. {\"$result\": i, \"path\": \"close\"} passes batch call i's output into a later call; every result also has a ref (\"r1\", \"r2\", ...) that later run_tool calls can pass the same way, {\"$result\": \"r1\", \"path\": \"close\"}, so data never needs to be copied.",
    // Only the paper pack can send anything that changes an account; without it nothing here is destructive.
    annotations: { title: "Run tools", readOnlyHint: Boolean(readOnly), destructiveHint: packs.includes("paper"), idempotentHint: false, openWorldHint: true },
    inputSchema: RUN_INPUT,
    outputSchema: open,
    // Hosts that draw MCP Apps show the result in the viewer; others ignore this.
    _meta: { ui: { resourceUri: VIEW_URI } },
  }, guard(async (a) => {
    // Models sometimes call run_tool through itself ({"name": "run_tool", "arguments": {...}});
    // unwrap it, and its calls inside a batch.
    if (a.name === "run_tool" && a.arguments && typeof a.arguments === "object") { const { name, arguments: inner, ...outer } = a; a = { ...inner, ...Object.fromEntries(Object.entries(outer).filter(([, v]) => v !== undefined)) }; }
    if (a.calls) a.calls = a.calls.flatMap((c) => (c.name === "run_tool" && c.arguments ? (c.arguments.calls ?? [{ name: c.arguments.name, arguments: c.arguments.arguments }]) : [c]));
    // Models sometimes put run_tool's own options inside a call's arguments; move them out when the
    // tool itself has no argument of that name.
    for (const c of a.calls ?? [a]) for (const k of ["return", "digits", "select", "receipt"]) {
      if (c.arguments && k in c.arguments && !(BY_NAME.get(c.name)?.args ?? "").split(", ").some((x) => x.replace(/\?.*$/, "").replace(/:.*$/, "") === k)) { if (a[k] === undefined) a[k] = c.arguments[k]; delete c.arguments[k]; }
    }
    // The SDK validates the outer envelope. Wrapping and lifting options changes that envelope,
    // so validate the resulting request again before loading or executing any tool.
    a = RUN_INPUT.parse(a);
    if (!a.calls && !a.name) throw new Error("Pass name (and arguments) for one call, or calls for several.");
    if (a.calls && a.name) throw new Error("Pass either name or calls, not both.");
    const calls = a.calls ?? [{ name: a.name, arguments: a.arguments }], files = [], opts = { digits: a.digits };
    // A view is drawn only where the host draws MCP Apps; elsewhere view changes nothing but the
    // backtest curve. A backtest shown as a view gets its curve and trades.
    const viewing = Boolean(a.view) && clientDrawsApps(server);
    if (a.view) for (const c of calls) if (/^backtest_/.test(c.name) && !(c.arguments && "curve" in c.arguments)) { try { if ((await toolFor(c.name, packs)).input?.shape?.curve) c.arguments = { ...(c.arguments ?? {}), curve: true }; } catch { /* reported when it runs */ } }
    // Models sometimes reach find_tool and describe_tool through run_tool; they run here as well.
    const desk = { call: (name, args) => runOne(packs, { name, arguments: args }, {}, [], gov), keep: (r) => keeper.put(r), get: (ref) => keeper.get(ref), at, toolFor: (name) => toolFor(name, packs), hosted: Boolean(readOnly) };
    const SELF = { brief: (args) => runBrief(desk, args), swarm: (args) => runSwarm(desk, args), stress_worlds: (args) => runWorlds(desk, args), show_result: (args) => showResult(keeper, args), find_tool: (args) => findTool(packs, args ?? {}), describe_tool: (args) => describeTool(packs, args ?? {}), ...(gov?.audit ? { audit_log: (args) => auditLog(gov, args) } : {}) };
    const run = (c, args) => (SELF[c.name] ? Promise.resolve().then(() => SELF[c.name](args)) : runOne(packs, { name: c.name, arguments: args }, opts, files, gov));
    const destructive = await Promise.all(calls.map(async (c) => { if (SELF[c.name]) return false; try { return (await toolFor(c.name, packs)).annotations?.destructiveHint; } catch { return false; } }));
    if (calls.length > 1 && destructive.some(Boolean)) throw new Error("A tool that sends orders cannot run inside a batch; call it on its own after previewing.");
    const done = [];
    if (calls.some((c) => usesResults(c.arguments))) {
      for (const c of calls) {
        try { done.push({ name: c.name, result: await run(c, resolveResults(c.arguments ?? {}, done, keeper)) }); }
        catch (e) { done.push({ name: c.name, error: e.message }); }
      }
    } else {
      done.push(...await Promise.all(calls.map((c) => run(c, c.arguments).then((result) => ({ name: c.name, result }), (e) => ({ name: c.name, error: e.message })))));
    }
    // Keep each full result (before select) under a ref for later calls.
    for (const d of done) if (d.result !== undefined && !SELF[d.name]) { const ref = keeper.put(d.result); if (ref) d.ref = ref; }
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
    const receipt = a.receipt ? { server: `${SERVER_NAME}@${SERVER_VERSION}`, packs: Object.fromEntries([...new Set(calls.map((c) => BY_NAME.get(c.name)?.pack))].filter(Boolean).map((p) => [p, INDEX.versions[p]])), input_sha256: sha256({ calls, digits: a.digits ?? null }), output_sha256: sha256(done.map(({ ref, ...d }) => d)) } : undefined;
    // After the receipt, which hashes the full results: an oversized one is sent as a preview.
    for (const d of done) if (d.result !== undefined) d.result = trimmed(d.result, d.ref, viewing ? VIEW_CHARS : RESULT_CHARS);
    const shown = (out) => {
      if (!viewing) return out;
      const refs = (out.results ?? [out]).map((r) => r.ref).filter(Boolean);
      const summary = { viewed: `The person sees the whole result drawn as an interactive view; this is a summary of it.${refs.length ? ` show_result with ref ${refs.join(" or ")} reads any part.` : ""}`, ...glance(out) };
      // A result smaller than its summary is sent whole.
      if (JSON.stringify(summary).length < JSON.stringify(out).length) SUMMARIES.set(out, summary);
      return out;
    };
    if (!a.calls) { if (done[0].error) throw new Error(done[0].error); return shown({ ...(done[0].ref ? { ref: done[0].ref } : {}), ...done[0].result, ...(files.length ? { files_read: files } : {}), ...(receipt ? { receipt } : {}) }); }
    const results = (a.return === "last" ? done.slice(-1) : done).map(({ name, ref, result, error }) => ({ name, ...(ref ? { ref } : {}), ...(error ? { error } : { result }) }));
    return shown({ results, ...(files.length ? { files_read: files } : {}), ...(receipt ? { receipt } : {}) });
  }));
  registerResources(server, packs, gov);
  registerView(server);
  registerPrompts(server, BY_NAME, packs);
  registerPackGuides(server, packs);
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
  telemetry: "none: no analytics, logging or crash reporting",
  offline: "CANLI_OFFLINE=1 enables only the packs whose network is none (quant, validation), and no other pack's code is loaded",
  receipts: "opt-in receipts carry SHA-256 hashes, never the data",
  policy: gov?.policy ? { tools: gov.policy.tools ?? "all", orders: gov.policy.orders ?? "on", calls_per_minute: gov.policy.calls_per_minute ?? null, audit_log: gov.audit ? { file: gov.audit.path, arguments: gov.policy.audit.arguments ?? "hash" } : "off" } : "none (CANLI_POLICY unset): no policy and no audit log",
});

function registerResources(server, packs, gov) {
  const json = (uri, v) => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify(v) }] });
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
export function frontTools(packs, env = process.env) {
  const names = env.CANLI_FRONT === undefined ? FRONT_DEFAULT : env.CANLI_FRONT.split(",").map((x) => x.trim()).filter(Boolean);
  return [...new Set(names)].filter((n) => BY_NAME.has(n) && packs.includes(BY_NAME.get(n).pack));
}
export async function registerFront(server, packs, names = frontTools(packs), gov = null) {
  for (const name of names) {
    const t = await toolFor(name, packs);
    server.registerTool(name, {
      title: t.title, description: t.description, inputSchema: t.input, outputSchema: open,
      annotations: { title: t.title, ...(t.annotations ?? READ_ONLY) },
    }, guard(async (args) => trimmed(await runOne(packs, { name, arguments: args }, {}, [], gov))));
  }
  return names;
}

const isMain = (() => { try { return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
// Besides serving MCP over stdio: `canli-mcp audit verify [log] [--ed25519 pub.pem] [--ml-dsa pub.pem]`
// checks an audit log, and `canli-mcp watch [--forms 8-K,4] [--company words] [--event earnings]
// [--every 60]` prints each new EDGAR filing as a line of JSON.
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
} else if (isMain) {
  const packs = [...enabledPacks(), ...await addPlugins()];
  const front = frontTools(packs);
  const gov = governance(process.env, canliHome());
  const server = new McpServer(SERVER_INFO, { instructions: instructions(packs, front) });
  registerAll(server, packs, gov);
  await registerFront(server, packs, front, gov);
  // Signing is synchronous, so the last calls are signed even as the process exits.
  process.on("exit", () => gov.close());
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));
  await server.connect(new StdioServerTransport());
}
