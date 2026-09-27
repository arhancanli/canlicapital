#!/usr/bin/env node
// canli-fundamentals-mcp: SEC company fundamentals point in time. For any value a company reported
// in XBRL, it says what was first reported, what the latest filing says, and what was known on a
// given date, each with the filing behind it. That is the difference between a backtest that only
// uses what investors could have known and one that quietly reads restated numbers.
//
// Source: for every company in its reference, canlicapital.com serves the SEC companyfacts response
// byte for byte (a gzip snapshot) and names its SHA-256 in the company record. This server fetches
// the record, fetches the snapshot, refuses it unless the hash matches, and computes everything on
// this machine. Nothing is sent anywhere but the two GETs.
//
// Built to the family's cost and latency rules: five tools, so the tool list an agent re-reads
// every turn stays small and byte-identical; one snapshot download per company, cached on disk by
// its hash (a hash-named file can never go stale); compact columnar results.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

export const SERVER_NAME = "canli-fundamentals-mcp";
export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const DEFAULT_BASE = "https://canlicapital.com";
const REQUEST_TIMEOUT_MS = 30000;
const MIB = 1024 * 1024;
const MAX_RECORD_BYTES = 16 * MIB;
const MAX_SNAPSHOT_BYTES = 16 * MIB;
const MAX_RAW_BYTES = 256 * MIB;

// The boundary every result carries.
export const LIMITS = Object.freeze([
  "Values are as the SEC's XBRL companyfacts API reported them for this company in the snapshot named here; filings made after the snapshot date are missing.",
  "filed is the date the filing reached EDGAR. To avoid lookahead in a backtest, treat a value as known from the next trading day after it was filed.",
  "A value that changed in a later filing may be a restatement, a reclassification or a correction; accn names the filing to read.",
  "Company-reported data, not investment advice.",
]);

export function createSession({ base, fetchImpl, cacheDir } = {}) {
  const envCache = process.env.CANLI_CACHE_DIR;
  return {
    base: base ?? process.env.CANLI_API_BASE ?? DEFAULT_BASE,
    fetchImpl: fetchImpl ?? fetch,
    // A path, or an empty value to keep nothing on disk.
    cacheDir: cacheDir !== undefined ? cacheDir : envCache !== undefined ? envCache : join(homedir(), ".cache", "canli-fundamentals"),
    companies: new Map(),
    tickers: null,
  };
}

async function fetchBytes(session, path, maxBytes) {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let res;
  let body;
  try {
    res = await session.fetchImpl(`${session.base}${path}`, { signal, redirect: "error" });
    const declared = Number(res.headers?.get?.("content-length"));
    if (declared > maxBytes) return { status: 413, body: null };
    body = Buffer.from(await res.arrayBuffer());
  } catch {
    throw new Error(signal.aborted ? `${path} exceeded the request deadline.` : `${path} could not be reached.`);
  }
  if (body.length > maxBytes) return { status: 413, body: null };
  return { status: res.status, body };
}

function parseJson(buf, what) {
  try {
    return JSON.parse(buf);
  } catch {
    throw new Error(`${what} did not return JSON.`);
  }
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const isGzip = (buf) => buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;

// ---------------------------------------------------------------------------------------------
// Loading a company: ticker or CIK, then the record, then the hash-checked SEC snapshot
// ---------------------------------------------------------------------------------------------

async function tickerMap(session) {
  if (!session.tickers) {
    const { status, body } = await fetchBytes(session, "/api/v1/company-tickers.json", 8 * MIB);
    if (status >= 400) throw new Error(`The ticker list returned HTTP ${status}.`);
    session.tickers = parseJson(body, "The ticker list").tickers ?? {};
  }
  return session.tickers;
}

export async function resolveCompany(session, company) {
  const text = String(company).trim();
  if (/^\d{1,10}$/.test(text)) return { cik: text.padStart(10, "0"), ticker: null };
  const ticker = text.toUpperCase().replace(/^\$/, "");
  const map = await tickerMap(session);
  const cik = map[ticker] ?? map[ticker.replace(/\./g, "-")] ?? map[ticker.replace(/-/g, ".")];
  if (!cik) throw new Error(`${text} is not a ticker in the Canli company reference (${Object.keys(map).length} tickers). Try the company's SEC CIK instead.`);
  return { cik, ticker };
}

async function snapshotBytes(session, sha, snapshotPath) {
  const file = session.cacheDir ? join(session.cacheDir, `${sha}.json.gz`) : null;
  if (file) {
    try {
      const raw = gunzipSync(readFileSync(file), { maxOutputLength: MAX_RAW_BYTES });
      if (sha256(raw) === sha) return raw;
    } catch {
      // Missing or unreadable: fetch it again.
    }
  }
  const { status, body } = await fetchBytes(session, snapshotPath, MAX_SNAPSHOT_BYTES);
  if (status === 413) throw new Error(`The SEC snapshot ${snapshotPath} is larger than ${MAX_SNAPSHOT_BYTES / MIB} MiB; not read.`);
  if (status >= 400) throw new Error(`The SEC snapshot ${snapshotPath} returned HTTP ${status}.`);
  let raw;
  try {
    raw = isGzip(body) ? gunzipSync(body, { maxOutputLength: MAX_RAW_BYTES }) : body;
  } catch {
    throw new Error(`The SEC snapshot ${snapshotPath} is not valid gzip.`);
  }
  if (sha256(raw) !== sha) throw new Error(`The SEC snapshot for this company does not match the SHA-256 its record publishes (${sha.slice(0, 12)}); nothing was used.`);
  if (file) {
    try {
      mkdirSync(session.cacheDir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, isGzip(body) ? body : gzipSync(raw));
      renameSync(tmp, file);
    } catch {
      // A cache that cannot be written only costs a download next time.
    }
  }
  return raw;
}

export async function loadCompany(session, company) {
  const { cik, ticker } = await resolveCompany(session, company);
  const cached = session.companies.get(cik);
  if (cached) return ticker ? { ...cached, ticker } : cached;
  const recordPath = `/company-data/${cik}.json`;
  const { status, body } = await fetchBytes(session, recordPath, MAX_RECORD_BYTES);
  if (status === 404) throw new Error(`CIK ${cik} is not in the Canli company reference. It covers the SEC filers listed at ${session.base}/companies.`);
  if (status >= 400) throw new Error(`${recordPath} returned HTTP ${status}.`);
  const record = parseJson(body, recordPath);
  const sha = record.source_sha256;
  const snapshotPath = record.source_snapshot;
  if (!/^[0-9a-f]{64}$/.test(sha ?? "") || typeof snapshotPath !== "string" || !snapshotPath.startsWith("/company-data/sources/")) {
    throw new Error(`The company record for CIK ${cik} names no verifiable SEC snapshot.`);
  }
  const facts = parseJson(await snapshotBytes(session, sha, snapshotPath), "The SEC snapshot");
  const entry = {
    cik,
    ticker,
    name: record.name ?? facts.entityName ?? null,
    index: indexFacts(facts),
    page: `${session.base}/companies/${cik}`,
    snapshot: { fetched_at: record.fetched_at ?? null, sha256: sha, url: `${session.base}${snapshotPath}`, sec_url: record.source_url ?? null },
  };
  session.companies.set(cik, { ...entry, ticker: null });
  return entry;
}

// ---------------------------------------------------------------------------------------------
// The point-in-time index: every reported period with every filing that reported it
// ---------------------------------------------------------------------------------------------

const DAY_MS = 86400000;
const ANNUAL_FORM = /^(10-K|10-KT|20-F|40-F)/;
const QUARTERLY_FORM = /^10-Q/;

// A duration is annual at 350 to 380 days (52- and 53-week years included) and quarterly at 80 to
// 100; anything else (six- and nine-month year-to-date figures) is "other". An instant (a balance)
// has no length, so it takes the kind of the report that first carried it: a year-end balance is
// first reported in an annual report, a quarter-end balance in a 10-Q.
export function instantKind(firstForm) {
  if (ANNUAL_FORM.test(firstForm ?? "")) return "annual";
  return QUARTERLY_FORM.test(firstForm ?? "") ? "quarterly" : "other";
}

export function durationKind(start, end) {
  const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;
  if (days >= 350 && days <= 380) return "annual";
  if (days >= 80 && days <= 100) return "quarterly";
  return "other";
}

export function indexFacts(facts) {
  const concepts = new Map();
  for (const [taxonomy, tags] of Object.entries(facts?.facts ?? {})) {
    for (const [tag, body] of Object.entries(tags ?? {})) {
      const units = {};
      for (const [unit, rows] of Object.entries(body?.units ?? {})) {
        if (!Array.isArray(rows)) continue;
        const periods = new Map();
        for (const r of rows) {
          if (!r || typeof r.end !== "string" || typeof r.filed !== "string" || typeof r.val !== "number") continue;
          const key = `${r.start ?? ""}/${r.end}`;
          let p = periods.get(key);
          if (!p) periods.set(key, (p = { start: r.start ?? null, end: r.end, vintages: [] }));
          p.vintages.push({ val: r.val, filed: r.filed, form: r.form ?? null, accn: r.accn ?? null, fy: r.fy ?? null, fp: r.fp ?? null });
        }
        const list = [...periods.values()];
        for (const p of list) {
          // Filing order: by date, then accession number, so the order never depends on the file.
          p.vintages.sort((a, b) => a.filed.localeCompare(b.filed) || String(a.accn).localeCompare(String(b.accn)));
          p.kind = p.start ? durationKind(p.start, p.end) : instantKind(p.vintages[0].form);
          p.changed = new Set(p.vintages.map((v) => v.val)).size > 1;
        }
        list.sort((a, b) => b.end.localeCompare(a.end) || String(b.start).localeCompare(String(a.start)));
        if (list.length) units[unit] = list;
      }
      if (Object.keys(units).length) concepts.set(`${taxonomy}:${tag}`, { taxonomy, tag, label: body.label ?? tag, units });
    }
  }
  return concepts;
}

const TAXONOMY_ORDER = ["us-gaap", "ifrs-full", "dei", "srt"];
const conceptName = (c) => (c.taxonomy === "us-gaap" ? c.tag : `${c.taxonomy}:${c.tag}`);
const periodCount = (c) => Object.values(c.units).reduce((n, list) => n + list.length, 0);

function findConcept(entry, concept) {
  const q = concept.trim();
  const lower = q.toLowerCase();
  const all = [...entry.index.values()];
  const exact = q.includes(":")
    ? all.filter((c) => `${c.taxonomy}:${c.tag}`.toLowerCase() === lower)
    : all.filter((c) => c.tag.toLowerCase() === lower);
  if (exact.length) {
    return exact.sort((a, b) => rank(a.taxonomy) - rank(b.taxonomy))[0];
  }
  const words = lower.replace(/^[a-z-]+:/, "").match(/[a-z0-9]+/g) ?? [];
  const close = all
    .map((c) => ({ c, hits: words.filter((w) => c.tag.toLowerCase().includes(w) || String(c.label).toLowerCase().includes(w)).length }))
    .filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits || periodCount(b.c) - periodCount(a.c))
    .slice(0, 8)
    .map((r) => conceptName(r.c));
  throw new Error(`${entry.name} reports no concept named ${q}.${close.length ? ` Close matches: ${close.join(", ")}.` : ""} list_concepts shows every concept it reports.`);
}

const rank = (taxonomy) => {
  const i = TAXONOMY_ORDER.indexOf(taxonomy);
  return i === -1 ? TAXONOMY_ORDER.length : i;
};

function chooseUnit(concept, unit) {
  const units = Object.keys(concept.units);
  if (unit !== undefined) {
    if (!concept.units[unit]) throw new Error(`${conceptName(concept)} is reported in ${units.join(", ")}, not ${unit}.`);
    return unit;
  }
  return units.sort((a, b) => concept.units[b].length - concept.units[a].length || a.localeCompare(b))[0];
}

const matchesKind = (p, periods) => periods === "all" || p.kind === periods;

// The vintage a basis selects, and whether any later filing reported a different value.
function select(p, basis, asOf) {
  let i;
  if (basis === "first_reported") i = 0;
  else if (basis === "latest") i = p.vintages.length - 1;
  else {
    i = -1;
    for (let k = 0; k < p.vintages.length && p.vintages[k].filed <= asOf; k += 1) i = k;
    if (i === -1) return null;
  }
  const v = p.vintages[i];
  const changedLater = p.vintages.slice(i + 1).some((x) => x.val !== v.val);
  return { v, changedLater };
}

// ---------------------------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------------------------

const company = z.string().min(1).max(20).describe("Ticker (AAPL) or SEC CIK.");
const conceptArg = z.string().min(1).max(200).describe("XBRL concept, e.g. Revenues or Assets (us-gaap unless prefixed, e.g. dei:...).");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const periodsArg = z.enum(["annual", "quarterly", "all"]).optional().describe("annual (default), quarterly, or all (adds year-to-date).");
const unitArg = z.string().min(1).max(40).optional().describe("Default: the unit with most periods.");

const asText = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });

function parse(schema, args, tool) {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) throw new Error(`${tool}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

const head = (e) => ({
  company: { cik: e.cik, name: e.name, ...(e.ticker ? { ticker: e.ticker } : {}), page: e.page },
  snapshot: e.snapshot,
});

export const listInput = z.object({
  company,
  search: z.string().min(1).max(100).optional().describe("Words in concept names or labels, e.g. revenue."),
  limit: z.number().int().min(1).max(300).optional().describe("Default 40."),
}).strict();

export async function toolListConcepts(session, args) {
  const { company: who, search, limit = 40 } = parse(listInput, args, "list_concepts");
  const e = await loadCompany(session, who);
  const words = search ? (search.toLowerCase().match(/[a-z0-9]+/g) ?? []) : [];
  const rows = [...e.index.values()]
    .map((c) => {
      const unit = chooseUnit(c);
      const list = c.units[unit];
      const text = `${c.tag} ${c.label}`.toLowerCase();
      return { c, unit, list, hits: words.filter((w) => text.includes(w)).length };
    })
    .filter((r) => !words.length || r.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.list[0].end.localeCompare(a.list[0].end) || b.list.length - a.list.length || a.c.tag.localeCompare(b.c.tag));
  return asText({
    ...head(e),
    concepts: e.index.size,
    matched: rows.length,
    columns: ["concept", "label", "unit", "periods", "first_end", "last_end", "changed_periods"],
    rows: rows.slice(0, limit).map(({ c, unit, list }) => [conceptName(c), c.label, unit, list.length, list[list.length - 1].end, list[0].end, list.filter((p) => p.changed).length]),
    next: "history reads one concept's values; known_as_of reads several as they stood on a date; restatements lists the periods whose value later changed.",
    limits: LIMITS,
  });
}

export const historyInput = z.object({
  company,
  concept: conceptArg,
  basis: z.enum(["first_reported", "latest", "as_of"]).optional().describe("first_reported (default), latest, or as_of (the value known on as_of)."),
  as_of: date.optional().describe("For basis as_of: only filings on or before this date count."),
  periods: periodsArg,
  unit: unitArg,
  limit: z.number().int().min(1).max(400).optional().describe("Default 20, newest first."),
}).strict();

export async function toolHistory(session, args) {
  const { company: who, concept, basis = "first_reported", as_of: asOf, periods = "annual", unit, limit = 20 } = parse(historyInput, args, "history");
  if (basis === "as_of" && !asOf) throw new Error("history: basis as_of needs an as_of date.");
  const e = await loadCompany(session, who);
  const c = findConcept(e, concept);
  const u = chooseUnit(c, unit);
  const picked = c.units[u]
    .filter((p) => matchesKind(p, periods))
    .map((p) => ({ p, s: select(p, basis, asOf) }))
    .filter((r) => r.s);
  return asText({
    ...head(e),
    concept: { name: conceptName(c), label: c.label, unit: u, units: Object.keys(c.units) },
    basis,
    ...(basis === "as_of" ? { as_of: asOf } : {}),
    periods,
    total: picked.length,
    columns: ["end", "start", "val", "filed", "form", "accn", "changed"],
    rows: picked.slice(0, limit).map(({ p, s }) => [p.end, p.start, s.v.val, s.v.filed, s.v.form, s.v.accn, basis === "latest" ? p.changed : s.changedLater]),
    meaning: basis === "latest"
      ? "changed: this period was reported with a different value in at least one earlier filing."
      : "changed: a filing after the one shown reported a different value for the period (see restatements or vintages).",
    limits: LIMITS,
  });
}

// When no concepts are named, known_as_of reads these; for each, the first name the company
// actually uses as of the date wins, since companies move between tags (Apple reported revenue as
// SalesRevenueNet before 2018 and as RevenueFromContractWithCustomerExcludingAssessedTax after).
export const DEFAULT_CONCEPTS = Object.freeze([
  ["Revenue", ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"]],
  ["NetIncomeLoss", ["NetIncomeLoss", "ProfitLoss"]],
  ["OperatingIncomeLoss", ["OperatingIncomeLoss"]],
  ["EarningsPerShareDiluted", ["EarningsPerShareDiluted"]],
  ["Assets", ["Assets"]],
  ["Liabilities", ["Liabilities"]],
  ["StockholdersEquity", ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]],
  ["CashAndCashEquivalentsAtCarryingValue", ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]],
  ["NetCashProvidedByUsedInOperatingActivities", ["NetCashProvidedByUsedInOperatingActivities"]],
  ["WeightedAverageNumberOfDilutedSharesOutstanding", ["WeightedAverageNumberOfDilutedSharesOutstanding"]],
]);

export const knownInput = z.object({
  company,
  as_of: date.describe("Decision date: only filings on or before it count."),
  concepts: z.array(z.string().min(1).max(200)).min(1).max(20).optional().describe("Default: ten common ones (revenue, net income, EPS, assets, equity, cash flow...)."),
  periods: z.enum(["annual", "quarterly"]).optional().describe("annual (default) or quarterly."),
}).strict();

// For one concept: the latest-ending period with a value filed on or before the date, and that value.
function knownFor(c, asOf, periods) {
  const u = chooseUnit(c);
  for (const p of c.units[u]) {
    if (p.kind !== periods) continue;
    const s = select(p, "as_of", asOf);
    if (s) return { u, p, s };
  }
  return null;
}

export async function toolKnownAsOf(session, args) {
  const { company: who, as_of: asOf, concepts, periods = "annual" } = parse(knownInput, args, "known_as_of");
  const e = await loadCompany(session, who);
  const wanted = concepts ? concepts.map((name) => [name, [name]]) : DEFAULT_CONCEPTS;
  const rows = [];
  const missing = [];
  for (const [label, names] of wanted) {
    let best = null;
    for (const name of names) {
      let c;
      try {
        c = findConcept(e, name);
      } catch (err) {
        if (concepts) throw err;
        continue;
      }
      const hit = knownFor(c, asOf, periods);
      if (hit && (!best || hit.p.end > best.hit.p.end)) best = { c, hit };
    }
    if (!best) {
      missing.push(label);
      continue;
    }
    const { c, hit } = best;
    rows.push([conceptName(c), hit.p.end, hit.p.start, hit.s.v.val, hit.u, hit.s.v.filed, hit.s.v.form, hit.s.v.accn, hit.s.changedLater]);
  }
  return asText({
    ...head(e),
    as_of: asOf,
    periods,
    columns: ["concept", "end", "start", "val", "unit", "filed", "form", "accn", "changed_after"],
    rows,
    ...(missing.length ? { missing } : {}),
    meaning: "Each row is the most recent period whose value had been filed on or before as_of, with the value as it stood then. changed_after: a later filing reported a different value for that period, so a backtest reading today's data would have used a number nobody knew on as_of.",
    limits: LIMITS,
  });
}

export const restatementsInput = z.object({
  company,
  concept: conceptArg.optional().describe("Default: every concept."),
  periods: periodsArg,
  since: date.optional().describe("Only periods ending on or after."),
  min_change_pct: z.number().min(0).max(1e6).optional().describe("Minimum absolute change, % of first value."),
  limit: z.number().int().min(1).max(400).optional().describe("Default 25, newest first."),
}).strict();

export async function toolRestatements(session, args) {
  const { company: who, concept, periods = "annual", since, min_change_pct: minPct = 0, limit = 25 } = parse(restatementsInput, args, "restatements");
  const e = await loadCompany(session, who);
  const scope = concept ? [findConcept(e, concept)] : [...e.index.values()];
  let scanned = 0;
  const found = [];
  for (const c of scope) {
    for (const [u, list] of Object.entries(c.units)) {
      for (const p of list) {
        if (!matchesKind(p, periods) || (since && p.end < since)) continue;
        scanned += 1;
        if (!p.changed) continue;
        const first = p.vintages[0];
        const last = p.vintages[p.vintages.length - 1];
        const pct = first.val === 0 ? null : ((last.val - first.val) / Math.abs(first.val)) * 100;
        if (minPct > 0 && (pct === null || Math.abs(pct) < minPct)) continue;
        found.push({ c, u, p, first, last, pct });
      }
    }
  }
  found.sort((a, b) => b.p.end.localeCompare(a.p.end) || Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0) || conceptName(a.c).localeCompare(conceptName(b.c)));
  const round = (x) => (x === null ? null : Math.round(x * 100) / 100);
  return asText({
    ...head(e),
    periods,
    scanned,
    changed: found.length,
    columns: ["concept", "unit", "end", "start", "first_val", "first_filed", "latest_val", "latest_filed", "change_pct", "filings"],
    rows: found.slice(0, limit).map(({ c, u, p, first, last, pct }) => [conceptName(c), u, p.end, p.start, first.val, first.filed, last.val, last.filed, round(pct), p.vintages.length]),
    meaning: "Periods whose value in the latest filing differs from the first report. change_pct is relative to the first reported value (null when that was zero); vintages shows every filing in between.",
    limits: LIMITS,
  });
}

export const vintagesInput = z.object({
  company,
  concept: conceptArg,
  end: date.describe("Period end."),
  start: date.optional().describe("Period start, when several periods share the end (quarter vs year-to-date)."),
  unit: unitArg,
}).strict();

export async function toolVintages(session, args) {
  const { company: who, concept, end, start, unit } = parse(vintagesInput, args, "vintages");
  const e = await loadCompany(session, who);
  const c = findConcept(e, concept);
  const u = chooseUnit(c, unit);
  const hits = c.units[u].filter((p) => p.end === end && (start === undefined || p.start === start));
  if (!hits.length) throw new Error(`${e.name} reports no ${conceptName(c)} period ending ${end}${start ? ` and starting ${start}` : ""} in ${u}; history lists the periods it does report.`);
  const rows = [];
  for (const p of hits) for (const v of p.vintages) rows.push([p.start, p.end, v.filed, v.form, v.accn, v.fy, v.fp, v.val]);
  return asText({
    ...head(e),
    concept: { name: conceptName(c), label: c.label, unit: u },
    columns: ["start", "end", "filed", "form", "accn", "fy", "fp", "val"],
    rows,
    filing_url: `https://www.sec.gov/Archives/edgar/data/${Number(e.cik)}/{accn without dashes}/`,
    meaning: "Every filing that reported this period, oldest first. fy and fp are the fiscal year and period of the filing that carried the value, not of the period itself.",
    limits: LIMITS,
  });
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export const TOOL_DESCRIPTIONS = Object.freeze({
  known_as_of: "What a company had reported as of a date: per concept, the latest period filed by as_of, its value then, and whether it was later restated. For point-in-time backtests and 'what was known on date X'.",
  history: "One concept over time, newest first: as first reported (default), as latest filed, or as known on as_of, each with its filing and whether it later changed.",
  restatements: "Periods whose value changed in a later filing, with first and latest values and % change. Omit concept to scan everything.",
  vintages: "Every filing that reported one period of one concept, oldest first: the revision history behind a number.",
  list_concepts: "The XBRL concepts a company reports, with units, periods, date range and changed-period counts. Search here for exact concept names.",
});

// Output schemas: published OPEN (extra fields always pass), every field optional. A client
// validates a result against the schema it listed, and a closed schema turns any field a later
// version adds into a failed call.
const table = { columns: z.array(z.string()).optional(), rows: z.array(z.unknown()).optional() };
const common = { company: z.looseObject({}).optional(), snapshot: z.looseObject({}).optional(), limits: z.array(z.string()).optional(), meaning: z.string().optional() };
export const OUTPUT_SCHEMAS = Object.freeze({
  known_as_of: z.looseObject({ ...common, as_of: z.string().optional(), ...table, missing: z.array(z.string()).optional() })
    .describe("rows: one per concept in the order of columns, the value as it stood on as_of; changed_after flags values later restated."),
  history: z.looseObject({ ...common, concept: z.looseObject({}).optional(), basis: z.string().optional(), total: z.number().optional(), ...table })
    .describe("rows: one per period, newest first, in the order of columns."),
  restatements: z.looseObject({ ...common, scanned: z.number().optional(), changed: z.number().optional(), ...table })
    .describe("rows: one per changed period, newest first, with first and latest values and change_pct."),
  vintages: z.looseObject({ ...common, concept: z.looseObject({}).optional(), ...table, filing_url: z.string().optional() })
    .describe("rows: every filing that reported the period, oldest first."),
  list_concepts: z.looseObject({ ...common, concepts: z.number().optional(), matched: z.number().optional(), ...table })
    .describe("rows: one per concept in the order of columns; concept is the name the other tools take."),
});

export function registerTools(server, session) {
  const tool = (name, title, inputSchema, fn) => server.registerTool(name, { title, annotations: { title, ...READ_ONLY }, description: TOOL_DESCRIPTIONS[name], inputSchema, outputSchema: OUTPUT_SCHEMAS[name] }, fn);
  tool("known_as_of", "Known as of a date", knownInput, (args) => toolKnownAsOf(session, args));
  tool("history", "Concept history", historyInput, (args) => toolHistory(session, args));
  tool("restatements", "Restated periods", restatementsInput, (args) => toolRestatements(session, args));
  tool("vintages", "Filing vintages", vintagesInput, (args) => toolVintages(session, args));
  tool("list_concepts", "List concepts", listInput, (args) => toolListConcepts(session, args));
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server, createSession());
  await server.connect(new StdioServerTransport());
}
