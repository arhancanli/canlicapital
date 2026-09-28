#!/usr/bin/env node
// canli-fundamentals-mcp: SEC company fundamentals point in time. For any value a company reported
// in XBRL, it says what was first reported, what the latest filing says, and what was known on a
// given date, each with the filing behind it. That is the difference between a backtest that only
// uses what investors could have known and one that quietly reads restated numbers.
//
// Source: for every company in its reference, canlicapital.com serves the SEC companyfacts response
// byte for byte (a gzip snapshot) and names its SHA-256 in the company record. This server fetches
// the record, fetches the snapshot, refuses it unless the hash matches, and computes everything on
// this machine. Names are searched in the site's company name index. Nothing is sent anywhere but
// GETs of those files and the ticker list.
//
// Built to the family's cost and latency rules: six tools, so the tool list an agent re-reads
// every turn stays small and byte-identical; one snapshot download per company, cached on disk by
// its hash (a hash-named file can never go stale); the ticker list, name index and records cached on
// disk for six hours and then revalidated by ETag; compact columnar results.
import { createHash, randomBytes } from "node:crypto";
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
// Sent once in initialize; clients such as Claude Code put it in the system prompt, so the model
// knows the first call to make even when tool definitions are deferred. Byte-stable across runs.
export const SERVER_INSTRUCTIONS = "SEC company fundamentals point in time. company takes a ticker, CIK or name; find_company searches names. For a decision on a date, call known_as_of with the company and as_of: it returns only what had been filed by then, and flags values later restated. Use plain names (revenue, net_income, eps_diluted, assets, cash); they follow a company across tag changes. restatements lists numbers that changed after their first report, and vintages shows every filing behind one number. Treat a value as known from the next trading day after its filed date.";

// How the server introduces itself in initialize: a readable title, the page that documents it
// and its icon, so clients and directories that read serverInfo show more than a package name.
export const SERVER_INFO = Object.freeze({
  name: SERVER_NAME,
  version: SERVER_VERSION,
  title: "Canli Fundamentals",
  websiteUrl: "https://canlicapital.com/developers#mcp-fundamentals",
  icons: [
    { src: "https://canlicapital.com/icon-512.png", mimeType: "image/png", sizes: ["512x512"] },
    { src: "https://canlicapital.com/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
  ],
});
const DEFAULT_BASE = "https://canlicapital.com";
const REQUEST_TIMEOUT_MS = 30000;
const MIB = 1024 * 1024;
const MAX_RECORD_BYTES = 16 * MIB;
const MAX_SNAPSHOT_BYTES = 16 * MIB;
const MAX_RAW_BYTES = 256 * MIB;
const MAX_COMPANIES = 8;
// The ticker list, the name index and company records change only when the company reference is
// released again, so a copy on disk is used without asking for up to six hours, then revalidated
// by its ETag. A snapshot is named by its hash and never needs revalidating.
const REFERENCE_FRESH_MS = 6 * 60 * 60 * 1000;
const MAX_NAMES_BYTES = 8 * MIB;

// The boundary every result carries.
export const LIMITS = Object.freeze([
  "Values are as the SEC's XBRL companyfacts API reported them for this company in the snapshot named here; filings made after the snapshot date are missing.",
  "filed is the date the filing reached EDGAR. To avoid lookahead in a backtest, treat a value as known from the next trading day after it was filed.",
  "A value that changed in a later filing may be a restatement, a reclassification or a correction; accn names the filing to read.",
  "Company-reported data, not investment advice.",
]);

export function createSession({ base, fetchImpl, cacheDir, now = () => Date.now() } = {}) {
  const envCache = process.env.CANLI_CACHE_DIR;
  return {
    base: base ?? process.env.CANLI_API_BASE ?? DEFAULT_BASE,
    fetchImpl: fetchImpl ?? fetch,
    // A path, or an empty value to keep nothing on disk.
    cacheDir: cacheDir !== undefined ? cacheDir : envCache !== undefined ? envCache : join(homedir(), ".cache", "canli-fundamentals"),
    now,
    companies: new Map(),
    tickers: null,
    names: null,
  };
}

async function fetchBytes(session, path, maxBytes, headers) {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let res;
  let body;
  try {
    res = await session.fetchImpl(`${session.base}${path}`, { signal, redirect: "error", ...(headers ? { headers } : {}) });
    const declared = Number(res.headers?.get?.("content-length"));
    if (declared > maxBytes) return { status: 413, body: null };
    body = Buffer.from(await res.arrayBuffer());
  } catch {
    throw new Error(signal.aborted ? `${path} exceeded the request deadline.` : `${path} could not be reached.`);
  }
  if (body.length > maxBytes) return { status: 413, body: null };
  return { status: res.status, body, etag: res.headers?.get?.("etag") ?? null };
}

// Owner-only directory; the temporary file gets an unpredictable name and is created exclusively
// (never written through a file or link that is already there), then renamed into place. A cache
// that cannot be written only costs a download next time.
function writeCache(session, name, bytes) {
  if (!session.cacheDir) return;
  try {
    mkdirSync(session.cacheDir, { recursive: true, mode: 0o700 });
    const file = join(session.cacheDir, name);
    const tmp = `${file}.${randomBytes(8).toString("hex")}.tmp`;
    writeFileSync(tmp, bytes, { flag: "wx", mode: 0o600 });
    renameSync(tmp, file);
  } catch {
    // Not cached.
  }
}

// A reference file (the ticker list, the name index, a company record) as parsed JSON, from the
// disk copy while it is fresh, else from the site with the copy's ETag, so an unchanged file costs
// a 304 and no body. When the site cannot be reached, a stale copy is used rather than failing.
async function referenceJson(session, path, name, maxBytes, what) {
  let cached = null;
  if (session.cacheDir) {
    try {
      cached = JSON.parse(readFileSync(join(session.cacheDir, name), "utf8"));
      if (typeof cached?.at !== "number" || cached.body === undefined) cached = null;
    } catch {
      cached = null;
    }
  }
  if (cached && session.now() - cached.at < REFERENCE_FRESH_MS) return { status: 200, json: cached.body };
  let res;
  try {
    res = await fetchBytes(session, path, maxBytes, cached?.etag ? { "if-none-match": cached.etag } : undefined);
  } catch (err) {
    if (cached) return { status: 200, json: cached.body };
    throw err;
  }
  if (res.status === 304 && cached) {
    writeCache(session, name, JSON.stringify({ ...cached, at: session.now() }));
    return { status: 200, json: cached.body };
  }
  if (res.status >= 500 && cached) return { status: 200, json: cached.body };
  if (res.status !== 200) return { status: res.status, json: null };
  const json = parseJson(res.body, what);
  writeCache(session, name, JSON.stringify({ etag: res.etag, at: session.now(), body: json }));
  return { status: 200, json };
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
    const { status, json } = await referenceJson(session, "/api/v1/company-tickers.json", "company-tickers.json", 8 * MIB, "The ticker list");
    if (status >= 400) throw new Error(`The ticker list returned HTTP ${status}.`);
    session.tickers = json?.tickers ?? {};
  }
  return session.tickers;
}

// Company names compared the way people write them: case, punctuation, a state tag such as /DE/,
// and trailing legal words (Inc, Corp, Holdings) ignored, so "Exxon Mobil Corporation" and
// "ExxonMobil Holdings Corp" have the same key.
const LEGAL_WORDS = new Set(["inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "plc", "llc", "lp", "llp", "holdings", "holding", "group", "sa", "nv", "ag", "se"]);
export function nameWords(name) {
  const words = String(name).toLowerCase().replace(/&/g, " and ").replace(/\/[a-z]{2,3}\/?/g, " ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  // "& Co" leaves "and" behind once "co" is dropped.
  while (words.length > 1 && (LEGAL_WORDS.has(words[words.length - 1]) || words[words.length - 1] === "and")) words.pop();
  if (words.length > 1 && words[0] === "the") words.shift();
  return words;
}

async function nameIndex(session) {
  if (!session.names) {
    const { status, json } = await referenceJson(session, "/api/v1/company-names.json", "company-names.json", MAX_NAMES_BYTES, "The company name index");
    if (status >= 400) throw new Error(`The company name index returned HTTP ${status}.`);
    const cik10 = (cik) => String(cik).padStart(10, "0");
    session.names = {
      companies: (Array.isArray(json?.rows) ? json.rows : []).map(([cik, name, tickers]) => {
        const words = nameWords(name);
        return { cik: cik10(cik), name: String(name), tickers: Array.isArray(tickers) ? tickers : [], words, key: words.join("") };
      }),
      outside: new Map((Array.isArray(json?.outside?.rows) ? json.outside.rows : []).map(([ticker, cik, name]) => [String(ticker), { ticker: String(ticker), cik: cik10(cik), name: String(name) }])),
      captured: json?.source?.captured ?? null,
    };
  }
  return session.names;
}

// How well a company matches, best first. A company is used for a query without asking only when
// it is clearly the one meant: the single match at the best level, where that level is a ticker, a
// CIK, the same name or the start of a name; or, among several there, the only one with a current
// ticker (Alphabet Inc. rather than Alphabet Holding Company; Toyota Motor Corp rather than Toyota
// Motor Credit); or the single match at all.
const MATCH_LEVELS = ["ticker", "cik", "name", "same_name_as_ticker_holder", "name_start", "name_words", "name_contains"];

export async function findCompanies(session, query, limit = 8) {
  const text = String(query).trim().replace(/^\$/, "");
  const ticker = text.toUpperCase();
  const names = await nameIndex(session);
  const found = new Map();
  const add = (c, level) => {
    const prior = found.get(c.cik);
    if (!prior || level < prior.level) found.set(c.cik, { c, level });
  };
  const qWords = nameWords(text);
  const qKey = qWords.join("");
  const outside = names.outside.get(ticker) ?? names.outside.get(ticker.replace(/\./g, "-")) ?? names.outside.get(ticker.replace(/-/g, ".")) ?? null;
  const holderKey = outside ? nameWords(outside.name).join("") : null;
  const cik = /^\d{1,10}$/.test(text) ? text.padStart(10, "0") : null;
  for (const c of names.companies) {
    if (c.tickers.includes(ticker) || c.tickers.includes(ticker.replace(/\./g, "-")) || c.tickers.includes(ticker.replace(/-/g, "."))) add(c, 0);
    if (cik && c.cik === cik) add(c, 1);
    if (!qKey) continue;
    if (c.key === qKey) add(c, 2);
    else if (holderKey && c.key === holderKey) add(c, 3);
    else if (qWords.every((w, i) => c.words[i] === w)) add(c, 4);
    else if (qWords.every((w) => c.words.includes(w))) add(c, 5);
    else if (qKey.length >= 4 && c.key.includes(qKey)) add(c, 6);
  }
  const ranked = [...found.values()].sort((a, b) => a.level - b.level || (b.c.tickers.length > 0) - (a.c.tickers.length > 0) || a.c.words.length - b.c.words.length || a.c.cik.localeCompare(b.c.cik));
  const best = ranked[0];
  const tied = best ? ranked.filter((r) => r.level === best.level) : [];
  const listed = tied.filter((r) => r.c.tickers.length);
  const pick = !best ? null : ranked.length === 1 ? best : best.level > 4 ? null : tied.length === 1 ? best : listed.length === 1 ? listed[0] : null;
  return {
    matches: ranked.slice(0, limit).map(({ c, level }) => ({ cik: c.cik, name: c.name, tickers: c.tickers, match: MATCH_LEVELS[level] })),
    total: ranked.length,
    resolved: pick ? { cik: pick.c.cik, name: pick.c.name, match: MATCH_LEVELS[pick.level] } : null,
    outside,
    captured: names.captured,
  };
}

export async function resolveCompany(session, company) {
  const text = String(company).trim();
  if (/^\d{1,10}$/.test(text)) return { cik: text.padStart(10, "0"), ticker: null };
  const ticker = text.toUpperCase().replace(/^\$/, "");
  const map = await tickerMap(session);
  const cik = map[ticker] ?? map[ticker.replace(/\./g, "-")] ?? map[ticker.replace(/-/g, ".")];
  if (cik) return { cik, ticker };
  // Not a current ticker in the reference: a company name, a ticker whose holder the reference does
  // not cover, or a former company. A site without the name index still answers tickers and CIKs.
  let found;
  try {
    found = await findCompanies(session, text, 5);
  } catch {
    throw new Error(`${text} is not a ticker in the Canli company reference (${Object.keys(map).length} tickers), and its name index could not be read. Try the company's SEC CIK instead.`);
  }
  const heldBy = found.outside ? `${found.outside.ticker} is the SEC's ticker for ${found.outside.name} (CIK ${found.outside.cik}), which the Canli company reference does not cover` : null;
  if (found.resolved) {
    const note = found.resolved.match === "same_name_as_ticker_holder" ? `${heldBy}; the covered filer with the same name was used.` : undefined;
    return { cik: found.resolved.cik, ticker: null, matched: { query: text, by: found.resolved.match, ...(note ? { note } : {}) } };
  }
  const options = found.matches.map((m) => `${m.name} (CIK ${m.cik}${m.tickers.length ? `, ${m.tickers.join("/")}` : ""})`).join("; ");
  if (options) throw new Error(`${heldBy ? `${heldBy}. ` : ""}"${text}" matches ${found.total} companies; pass one CIK as company: ${options}.`);
  throw new Error(`${heldBy ? `${heldBy}. ` : ""}"${text}" is not a current ticker or a company name in the Canli company reference. Former tickers are not listed: find_company searches by name, and the SEC CIK always works.`);
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
  // A cached snapshot is re-hashed on every read, so it can never be trusted blindly.
  if (file) writeCache(session, `${sha}.json.gz`, isGzip(body) ? body : gzipSync(raw));
  return raw;
}

export async function loadCompany(session, company) {
  const { cik, ticker, matched } = await resolveCompany(session, company);
  const cached = session.companies.get(cik);
  if (cached) {
    // Most recently used last, so the oldest company is the one evicted.
    session.companies.delete(cik);
    session.companies.set(cik, cached);
    return ticker || matched ? { ...cached, ticker, matched } : cached;
  }
  const recordPath = `/company-data/${cik}.json`;
  const { status, json: record } = await referenceJson(session, recordPath, `company-${cik}.json`, MAX_RECORD_BYTES, recordPath);
  if (status === 404) throw new Error(`CIK ${cik} is not in the Canli company reference. It covers the SEC filers listed at ${session.base}/companies; find_company searches them by name.`);
  if (status >= 400) throw new Error(`${recordPath} returned HTTP ${status}.`);
  const sha = record.source_sha256;
  const snapshotPath = record.source_snapshot;
  if (!/^[0-9a-f]{64}$/.test(sha ?? "") || typeof snapshotPath !== "string" || !snapshotPath.startsWith("/company-data/sources/")) {
    throw new Error(`The company record for CIK ${cik} names no verifiable SEC snapshot.`);
  }
  const facts = parseJson(await snapshotBytes(session, sha, snapshotPath), "The SEC snapshot");
  const entry = {
    cik,
    ticker,
    matched,
    name: record.name ?? facts.entityName ?? null,
    index: indexFacts(facts),
    page: `${session.base}/companies/${cik}`,
    snapshot: { fetched_at: record.fetched_at ?? null, sha256: sha, url: `${session.base}${snapshotPath}`, sec_url: record.source_url ?? null },
    series: new Map(),
  };
  // A large filer's index takes 12 to 15 MB of heap; keep the eight most recently used. Evicted
  // companies reload from the hash-named disk cache.
  if (session.companies.size >= MAX_COMPANIES) session.companies.delete(session.companies.keys().next().value);
  session.companies.set(cik, { ...entry, ticker: null, matched: undefined });
  return entry;
}

// ---------------------------------------------------------------------------------------------
// The point-in-time index: every reported period with every filing that reported it
// ---------------------------------------------------------------------------------------------

const DAY_MS = 86400000;
const ANNUAL_FORM = /^(10-K|10-KT|20-F|40-F)/;
const INTERIM_FORM = /^(10-Q|6-K)/;
// Filing-fee exhibits (the ffd taxonomy) and registration statements (S-3ASR, S-8, F-1, 424B
// prospectuses) repeat facts that are not a company's periodic results. Read as vintages, they
// look like revisions (two prospectuses on one day with different fee tables), so they are left
// out of every chain.
const SKIP_TAXONOMIES = new Set(["ffd"]);
const NON_PERIODIC_FORM = /^(424B|S-\d|F-\d|POS )/;

// A duration is annual at 350 to 380 days (52- and 53-week years included) and quarterly at 80 to
// 125 days, which covers 12- to 17-week quarters (Kroger's first quarter is 16 weeks, Costco's
// fourth 16 or 17). Six- and nine-month year-to-date figures (168 days and more) are "other". An
// instant (a balance) has no length, so it takes the kind of the report that first carried it: a
// year-end balance is first reported in an annual report, an interim balance in a 10-Q or 6-K.
export function instantKind(firstForm) {
  if (ANNUAL_FORM.test(firstForm ?? "")) return "annual";
  return INTERIM_FORM.test(firstForm ?? "") ? "quarterly" : "other";
}

export function durationKind(start, end) {
  const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;
  if (days >= 350 && days <= 380) return "annual";
  if (days >= 80 && days <= 125) return "quarterly";
  return "other";
}

const byFiling = (a, b) => a.filed.localeCompare(b.filed) || String(a.accn).localeCompare(String(b.accn));

export function indexFacts(facts) {
  const concepts = new Map();
  // Every fact of one filing repeats its accession number, date, form and fiscal period as fresh
  // strings; keeping one copy of each shrinks a large filer's index severalfold.
  const pool = new Map();
  const one = (s) => {
    if (s == null) return null;
    const had = pool.get(s);
    if (had !== undefined) return had;
    pool.set(s, s);
    return s;
  };
  for (const [taxonomy, tags] of Object.entries(facts?.facts ?? {})) {
    if (SKIP_TAXONOMIES.has(taxonomy)) continue;
    for (const [tag, body] of Object.entries(tags ?? {})) {
      const units = {};
      for (const [unit, rows] of Object.entries(body?.units ?? {})) {
        if (!Array.isArray(rows)) continue;
        const periods = new Map();
        for (const r of rows) {
          if (!r || typeof r.end !== "string" || typeof r.filed !== "string" || typeof r.val !== "number") continue;
          if (NON_PERIODIC_FORM.test(r.form ?? "")) continue;
          const key = `${r.start ?? ""}/${r.end}`;
          let p = periods.get(key);
          if (!p) periods.set(key, (p = { start: one(r.start), end: one(r.end), vintages: [] }));
          p.vintages.push({ val: r.val, filed: one(r.filed), form: one(r.form), accn: one(r.accn), fy: r.fy ?? null, fp: one(r.fp) });
        }
        const list = [...periods.values()];
        // Filing order: by date, then accession number, so the order never depends on the file.
        for (const p of list) p.vintages.sort(byFiling);
        list.sort((a, b) => b.end.localeCompare(a.end) || String(b.start).localeCompare(String(a.start)));
        if (list.length) units[unit] = list;
      }
      if (Object.keys(units).length) concepts.set(`${taxonomy}:${tag}`, { taxonomy, tag, label: body.label ?? tag, units });
    }
  }
  return concepts;
}

// ---------------------------------------------------------------------------------------------
// Plain names and series: one or more concepts read as one
// ---------------------------------------------------------------------------------------------

// Plain names for the common measures, each with the tags companies have used for it in order of
// preference. A company that moved between them (Apple from SalesRevenueNet to
// RevenueFromContractWithCustomerExcludingAssessedTax in 2018, Toyota from us-gaap to IFRS) is
// followed across the switch, and every value names the tag it came from.
export const FRIENDLY = Object.freeze({
  revenue: ["us-gaap:Revenues", "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax", "us-gaap:SalesRevenueNet", "ifrs-full:Revenue", "ifrs-full:RevenueFromContractsWithCustomers"],
  net_income: ["us-gaap:NetIncomeLoss", "ifrs-full:ProfitLossAttributableToOwnersOfParent", "us-gaap:ProfitLoss", "ifrs-full:ProfitLoss"],
  operating_income: ["us-gaap:OperatingIncomeLoss", "ifrs-full:ProfitLossFromOperatingActivities"],
  gross_profit: ["us-gaap:GrossProfit", "ifrs-full:GrossProfit"],
  eps_diluted: ["us-gaap:EarningsPerShareDiluted", "ifrs-full:DilutedEarningsLossPerShare"],
  eps_basic: ["us-gaap:EarningsPerShareBasic", "ifrs-full:BasicEarningsLossPerShare"],
  assets: ["us-gaap:Assets", "ifrs-full:Assets"],
  liabilities: ["us-gaap:Liabilities", "ifrs-full:Liabilities"],
  equity: ["us-gaap:StockholdersEquity", "ifrs-full:EquityAttributableToOwnersOfParent", "us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "ifrs-full:Equity"],
  cash: ["us-gaap:CashAndCashEquivalentsAtCarryingValue", "ifrs-full:CashAndCashEquivalents", "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  operating_cash_flow: ["us-gaap:NetCashProvidedByUsedInOperatingActivities", "ifrs-full:CashFlowsFromUsedInOperatingActivities"],
  diluted_shares: ["us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding", "ifrs-full:AdjustedWeightedAverageShares"],
  shares_outstanding: ["dei:EntityCommonStockSharesOutstanding", "us-gaap:CommonStockSharesOutstanding"],
  capex: ["us-gaap:PaymentsToAcquirePropertyPlantAndEquipment", "ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", "us-gaap:PaymentsToAcquireProductiveAssets"],
});
const SYNONYMS = Object.freeze({
  revenues: "revenue", sales: "revenue", net_sales: "revenue", turnover: "revenue", total_revenue: "revenue",
  net_income_loss: "net_income", net_profit: "net_income", profit: "net_income", earnings: "net_income",
  operating_profit: "operating_income", eps: "eps_diluted", diluted_eps: "eps_diluted", basic_eps: "eps_basic",
  total_assets: "assets", total_liabilities: "liabilities", shareholders_equity: "equity", stockholders_equity: "equity",
  cash_and_cash_equivalents: "cash", cash_and_equivalents: "cash", cfo: "operating_cash_flow", cash_from_operations: "operating_cash_flow",
  capital_expenditures: "capex", capital_expenditure: "capex", capital_spending: "capex",
  shares_diluted: "diluted_shares", weighted_diluted_shares: "diluted_shares", shares: "shares_outstanding",
});
// known_as_of reads these when no concepts are named.
export const DEFAULT_CONCEPTS = Object.freeze(["revenue", "net_income", "operating_income", "eps_diluted", "assets", "liabilities", "equity", "cash", "operating_cash_flow", "diluted_shares"]);

const conceptName = (c) => (c.taxonomy === "us-gaap" ? c.tag : `${c.taxonomy}:${c.tag}`);
const tagName = (key) => (key.startsWith("us-gaap:") ? key.slice(8) : key);
const normalize = (s) => s.trim().toLowerCase().replace(/[\s-]+/g, "_");
const lastEnd = (c) => Object.values(c.units).reduce((m, list) => (list[0].end > m ? list[0].end : m), "");

// Words of a name, CamelCase split and plurals folded: "RevenueFromContracts" and "revenues" both
// give "revenue".
const words = (s) => (String(s).replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().match(/[a-z0-9]+/g) ?? [])
  .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));

function suggestions(entry, query) {
  const q = words(query.replace(/^[a-z-]+:/i, ""));
  if (!q.length) return [];
  const friendly = Object.keys(FRIENDLY).filter((k) => q.some((w) => k.includes(w)) && FRIENDLY[k].some((key) => entry.index.has(key)));
  const close = [...entry.index.values()]
    .map((c) => {
      const have = new Set([...words(c.tag), ...words(c.label)]);
      return { c, hits: q.filter((w) => have.has(w)).length };
    })
    .filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits || lastEnd(b.c).localeCompare(lastEnd(a.c)))
    .slice(0, 8)
    .map((r) => conceptName(r.c));
  return [...friendly, ...close].slice(0, 10);
}

// Every period of one or more concepts in one unit, with each filing's value once. When several
// concepts report the same period in one filing, the value comes from the tag that first reported
// the period if that filing still uses it, else from the earliest tag in the list; so a company
// that renames a tag keeps one series, and each vintage names its tag.
function buildSeries(concepts, unit) {
  const periods = new Map();
  concepts.forEach((c, rank) => {
    for (const p of c.units[unit] ?? []) {
      const key = `${p.start ?? ""}/${p.end}`;
      let m = periods.get(key);
      if (!m) periods.set(key, (m = { start: p.start, end: p.end, all: [] }));
      for (const v of p.vintages) m.all.push({ ...v, tag: conceptName(c), rank });
    }
  });
  const list = [...periods.values()];
  for (const m of list) {
    m.all.sort((a, b) => byFiling(a, b) || a.rank - b.rank || a.val - b.val);
    const firstTag = m.all[0].tag;
    const perFiling = new Map();
    for (const v of m.all) {
      const k = `${v.filed}|${v.accn}`;
      const kept = perFiling.get(k);
      if (!kept || (v.tag === firstTag && kept.tag !== firstTag)) perFiling.set(k, v);
    }
    m.vintages = [...perFiling.values()].sort(byFiling);
    delete m.all;
    const first = m.vintages[0];
    const last = m.vintages[m.vintages.length - 1];
    m.kind = m.start ? durationKind(m.start, m.end) : instantKind(first.form);
    m.restated = first.val !== last.val;
    m.reverted = !m.restated && new Set(m.vintages.map((v) => v.val)).size > 1;
    m.tagChanged = first.tag !== last.tag;
  }
  return list.sort((a, b) => b.end.localeCompare(a.end) || String(b.start).localeCompare(String(a.start)));
}

function pickUnit(concepts, unit, label) {
  const counts = new Map();
  for (const c of concepts) for (const [u, list] of Object.entries(c.units)) counts.set(u, (counts.get(u) ?? 0) + list.length);
  if (unit !== undefined) {
    if (!counts.has(unit)) throw new Error(`${label} is reported in ${[...counts.keys()].join(", ")}, not ${unit}.`);
    return unit;
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

// A name becomes a series. A plain name (revenue, eps_diluted, and the synonyms above) reads its
// whole tag list; an XBRL tag reads that tag in every taxonomy that has it, unless the name is
// prefixed with one (us-gaap:Assets).
// keep: false for a scan over every concept (list_concepts, a full restatements scan), which would
// otherwise hold a series for each of a large filer's ~1,000 concepts in memory.
export function resolveSeries(entry, name, unit, { keep = true } = {}) {
  const raw = name.trim();
  const key = normalize(raw);
  const plain = !raw.includes(":") && !/[A-Z]/.test(raw);
  const friendlyKey = FRIENDLY[key] ? key : SYNONYMS[key];
  let exact = [];
  if (!(plain && friendlyKey)) {
    const lower = raw.toLowerCase();
    exact = [...entry.index.values()].filter((c) => (raw.includes(":") ? `${c.taxonomy}:${c.tag}`.toLowerCase() === lower : c.tag.toLowerCase() === lower));
  }
  let concepts;
  let label;
  let display;
  if (exact.length) {
    // The same tag in two taxonomies (Assets in us-gaap, then ifrs-full after a switch to IFRS) is
    // one measure: both are read, the one still reported first.
    concepts = exact.sort((a, b) => lastEnd(b).localeCompare(lastEnd(a)));
    label = concepts[0].label;
    display = concepts.length > 1 ? concepts[0].tag : conceptName(concepts[0]);
  } else if (friendlyKey) {
    concepts = FRIENDLY[friendlyKey].map((k) => entry.index.get(k)).filter(Boolean);
    if (!concepts.length) throw new Error(`${entry.name} reports none of the tags behind ${friendlyKey} (${FRIENDLY[friendlyKey].map(tagName).join(", ")}). list_concepts shows what it reports.`);
    label = friendlyKey;
    display = friendlyKey;
  } else {
    const close = suggestions(entry, raw);
    throw new Error(`${entry.name} reports no concept named ${raw}.${close.length ? ` Close matches: ${close.join(", ")}.` : ""} list_concepts shows every concept it reports.`);
  }
  const u = pickUnit(concepts, unit, display);
  const memo = `${display}|${u}`;
  let periods = entry.series.get(memo);
  if (!periods) {
    periods = buildSeries(concepts, u);
    if (keep) entry.series.set(memo, periods);
  }
  // An XBRL tag the company stopped using: say which plain name follows it to later periods.
  let newer = null;
  if (exact.length === 1) {
    const home = Object.keys(FRIENDLY).find((k) => FRIENDLY[k].includes(`${concepts[0].taxonomy}:${concepts[0].tag}`));
    if (home) {
      const sibling = FRIENDLY[home].map((k) => entry.index.get(k)).filter((c) => c && c !== concepts[0] && lastEnd(c) > lastEnd(concepts[0]));
      if (sibling.length) newer = `${display} ends ${lastEnd(concepts[0])}; ${entry.name} reports later periods as ${sibling.map(conceptName).join(", ")}. Use concept "${home}" to follow the measure across tags.`;
    }
  }
  return { name: display, label, unit: u, units: [...new Set(concepts.flatMap((c) => Object.keys(c.units)))], tags: concepts.map(conceptName), multi: concepts.length > 1, periods, newer };
}

const matchesKind = (p, periods) => periods === "all" || p.kind === periods;

// The vintage a basis selects. With as_of, only filings made on or before it exist: first_reported
// is the first of those, latest and as_of the last. changedLater: some filing after the selected
// one (at any time, before or after as_of) reported a different value.
function select(p, basis, asOf) {
  let last = p.vintages.length - 1;
  if (asOf) {
    last = -1;
    for (let k = 0; k < p.vintages.length && p.vintages[k].filed <= asOf; k += 1) last = k;
    if (last === -1) return null;
  }
  const i = basis === "first_reported" ? 0 : last;
  const v = p.vintages[i];
  return { v, changedLater: p.vintages.slice(i + 1).some((x) => x.val !== v.val) };
}

// ---------------------------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------------------------

const company = z.string().min(1).max(100).describe("Ticker (AAPL), CIK or company name.");
const conceptArg = z.string().min(1).max(200).describe("Plain name (revenue, eps_diluted, assets; follows tag changes) or XBRL tag (Revenues).");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const periodsArg = z.enum(["annual", "quarterly", "all"]).optional().describe("annual (default), quarterly, or all (adds year-to-date).");
const unitArg = z.string().min(1).max(40).optional().describe("Default: the unit with most periods.");
const MAX_CHARS = 10000;

const asText = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });

function parse(schema, args, tool) {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) throw new Error(`${tool}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

// Keep a result under MAX_CHARS of rows, newest first, and say when rows were cut.
function fit(rows) {
  let size = 0;
  for (let i = 0; i < rows.length; i += 1) {
    size += JSON.stringify(rows[i]).length + 1;
    if (size > MAX_CHARS) return { rows: rows.slice(0, Math.max(1, i)), truncated: true };
  }
  return { rows, truncated: false };
}

// One page of a long list: at most limit rows from offset, cut to MAX_CHARS, with next_offset
// whenever rows remain after it.
function page(rows, offset, limit) {
  const shown = fit(rows.slice(offset, offset + limit));
  const next = offset + shown.rows.length;
  return { ...shown, ...(next < rows.length ? { next_offset: next } : {}) };
}

const offsetArg = z.number().int().min(0).max(100000).optional().describe("next_offset from the last page.");

function head(e, asOf) {
  const fetched = e.snapshot.fetched_at;
  const age = fetched ? Math.floor((Date.now() - Date.parse(fetched)) / DAY_MS) : null;
  const out = {
    company: { cik: e.cik, name: e.name, ...(e.ticker ? { ticker: e.ticker } : {}), ...(e.matched ? { matched: e.matched } : {}), page: e.page },
    snapshot: { ...e.snapshot, age_days: age },
  };
  if (asOf && fetched && asOf > fetched.slice(0, 10)) out.snapshot_note = `as_of is after this snapshot (fetched ${fetched.slice(0, 10)}): filings made after that date are not in it.`;
  return out;
}

export const listInput = z.object({
  company,
  search: z.string().min(1).max(100).optional().describe("Words in concept names or labels, e.g. revenue."),
  limit: z.number().int().min(1).max(300).optional().describe("Default 40."),
  offset: offsetArg,
}).strict();

export async function toolListConcepts(session, args) {
  const { company: who, search, limit = 40, offset = 0 } = parse(listInput, args, "list_concepts");
  const e = await loadCompany(session, who);
  const q = search ? words(search) : [];
  const rows = [...e.index.values()]
    .map((c) => {
      const s = resolveSeries(e, `${c.taxonomy}:${c.tag}`, undefined, { keep: false });
      const have = new Set([...words(c.tag), ...words(c.label)]);
      return { c, s, hits: q.filter((w) => have.has(w)).length };
    })
    .filter((r) => !q.length || r.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.s.periods[0].end.localeCompare(a.s.periods[0].end) || b.s.periods.length - a.s.periods.length || a.c.tag.localeCompare(b.c.tag));
  const friendly = Object.entries(FRIENDLY)
    .map(([k, keys]) => [k, keys.filter((key) => e.index.has(key)).map(tagName)])
    .filter(([, tags]) => tags.length);
  const shown = page(rows.map(({ c, s }) => [conceptName(c), c.label, s.unit, s.periods.length, s.periods[s.periods.length - 1].end, s.periods[0].end, s.periods.filter((p) => p.restated).length]), offset, limit);
  return asText({
    ...head(e),
    concepts: e.index.size,
    matched: rows.length,
    plain_names: Object.fromEntries(friendly),
    columns: ["concept", "label", "unit", "periods", "first_end", "last_end", "restated_periods"],
    ...shown,
    next: "history, restatements and vintages take a concept above or a plain name from plain_names; known_as_of reads several as they stood on a date.",
    limits: LIMITS,
  });
}

export const historyInput = z.object({
  company,
  concept: conceptArg,
  basis: z.enum(["first_reported", "latest", "as_of"]).optional().describe("first_reported (default), latest, or as_of (default when as_of is set)."),
  as_of: date.optional().describe("Only filings made on or before this date count, for every basis."),
  periods: periodsArg,
  unit: unitArg,
  limit: z.number().int().min(1).max(400).optional().describe("Default 20, newest first."),
}).strict();

export async function toolHistory(session, args) {
  const { company: who, concept, basis: basisArg, as_of: asOf, periods = "annual", unit, limit = 20 } = parse(historyInput, args, "history");
  const basis = basisArg ?? (asOf ? "as_of" : "first_reported");
  if (basis === "as_of" && !asOf) throw new Error("history: basis as_of needs an as_of date.");
  const e = await loadCompany(session, who);
  const s = resolveSeries(e, concept, unit);
  const picked = s.periods
    .filter((p) => matchesKind(p, periods))
    .map((p) => ({ p, sel: select(p, basis, asOf) }))
    .filter((r) => r.sel);
  const columns = ["end", "start", "val", "filed", "form", "accn", "changed", ...(s.multi ? ["tag"] : [])];
  const shown = fit(picked.slice(0, limit).map(({ p, sel }) => [p.end, p.start, sel.v.val, sel.v.filed, sel.v.form, sel.v.accn, basis === "latest" && !asOf ? p.restated : sel.changedLater, ...(s.multi ? [tagName(sel.v.tag)] : [])]));
  return asText({
    ...head(e, asOf),
    concept: { name: s.name, label: s.label, unit: s.unit, units: s.units, tags: s.tags.map(tagName) },
    basis,
    ...(asOf ? { as_of: asOf } : {}),
    periods,
    total: picked.length,
    columns,
    ...shown,
    ...(s.newer ? { newer_series: s.newer } : {}),
    meaning: basis === "latest" && !asOf
      ? "changed: the latest value differs from the period's first report."
      : "changed: a filing after the one shown reported a different value for the period (restatements and vintages show which).",
    limits: LIMITS,
  });
}

export const knownInput = z.object({
  company,
  as_of: date.describe("Decision date: only filings on or before it count."),
  concepts: z.array(z.string().min(1).max(200)).min(1).max(20).optional().describe("Default: ten common measures."),
  periods: z.enum(["annual", "quarterly"]).optional().describe("annual (default) or quarterly."),
  ratios: z.boolean().optional().describe("Adds margins, ROE, ROA, leverage, free cash flow."),
}).strict();

// A value as it stood on as_of: the newest period `pick` accepts whose value had been filed by then.
function knownValue(e, name, pick, asOf) {
  let s;
  try {
    s = resolveSeries(e, name);
  } catch {
    return null;
  }
  for (const p of s.periods) {
    if (!pick(p)) continue;
    const sel = select(p, "as_of", asOf);
    if (sel) return { name, val: sel.v.val, unit: s.unit, start: p.start, end: p.end, filed: sel.v.filed, accn: sel.v.accn, changed: sel.changedLater };
  }
  return null;
}

const round6 = (x) => (Number.isFinite(x) ? Number(x.toPrecision(6)) : null);

// Ratios point in time: every input is the value as filed by as_of for one period, the latest whose
// revenue (or, with none, net income) had been filed. Flows share that period's start and end;
// balances are read at its end, and ROE and ROA average the balance at the end with the latest
// balance filed before the period began (annual periods only). Each ratio names its inputs and their
// filings, and changed_after says a later filing changed any of them.
export function pointInTimeRatios(e, asOf, kind) {
  const flow = (name, key) => knownValue(e, name, (p) => p.kind === kind && p.start === key.start && p.end === key.end, asOf);
  const anchor = knownValue(e, "revenue", (p) => p.kind === kind, asOf) ?? knownValue(e, "net_income", (p) => p.kind === kind, asOf);
  if (!anchor) return { missing: ["no revenue or net income had been filed by as_of"] };
  const key = { start: anchor.start, end: anchor.end };
  const earliest = new Date(Date.parse(key.start) - 400 * DAY_MS).toISOString().slice(0, 10);
  const balanceAt = (name) => knownValue(e, name, (p) => p.start === null && p.end === key.end, asOf);
  const balanceBefore = (name) => knownValue(e, name, (p) => p.start === null && p.end < key.start && p.end >= earliest, asOf);
  const v = {
    revenue: flow("revenue", key), gross_profit: flow("gross_profit", key), operating_income: flow("operating_income", key),
    net_income: flow("net_income", key), operating_cash_flow: flow("operating_cash_flow", key), capex: flow("capex", key),
    equity: balanceAt("equity"), assets: balanceAt("assets"), liabilities: balanceAt("liabilities"),
    equity_before: balanceBefore("equity"), assets_before: balanceBefore("assets"),
  };
  const rows = [];
  const missing = [];
  const add = (ratio, need, value, unit, basis) => {
    const inputs = need.map((n) => v[n]);
    const absent = need.filter((n, i) => !inputs[i]);
    if (absent.length || !Number.isFinite(value)) { missing.push(`${ratio}: ${absent.length ? `no ${absent.join(", ")} filed by as_of for this period` : "a zero denominator"}`); return; }
    rows.push([ratio, round6(value), unit, basis, inputs.map((x) => [x.name, x.val, x.end, x.filed, x.accn]), inputs.some((x) => x.changed)]);
  };
  const val = (n) => v[n]?.val;
  const share = (a, b) => val(a) / val(b);
  add("gross_margin", ["gross_profit", "revenue"], share("gross_profit", "revenue"), "ratio", "same period");
  add("operating_margin", ["operating_income", "revenue"], share("operating_income", "revenue"), "ratio", "same period");
  add("net_margin", ["net_income", "revenue"], share("net_income", "revenue"), "ratio", "same period");
  if (kind === "annual") {
    for (const [ratio, bal] of [["return_on_equity", "equity"], ["return_on_assets", "assets"]]) {
      const both = v[`${bal}_before`];
      if (both) add(ratio, ["net_income", bal, `${bal}_before`], val("net_income") / ((val(bal) + both.val) / 2), "ratio", "average of the balances at the period's start and end");
      else add(ratio, ["net_income", bal], val("net_income") / val(bal), "ratio", "balance at the period's end (none filed for its start)");
    }
  } else {
    missing.push("return_on_equity, return_on_assets: annual periods only");
  }
  add("liabilities_to_equity", ["liabilities", "equity"], share("liabilities", "equity"), "ratio", "balances at the period's end");
  add("free_cash_flow", ["operating_cash_flow", "capex"], val("operating_cash_flow") - val("capex"), v.operating_cash_flow?.unit ?? null, "operating cash flow less capital expenditure");
  add("free_cash_flow_margin", ["operating_cash_flow", "capex", "revenue"], (val("operating_cash_flow") - val("capex")) / val("revenue"), "ratio", "same period");
  return {
    period: key,
    columns: ["ratio", "value", "unit", "basis", "inputs", "changed_after"],
    rows,
    ...(missing.length ? { missing } : {}),
    inputs_columns: ["concept", "val", "end", "filed", "accn"],
  };
}

export async function toolKnownAsOf(session, args) {
  const { company: who, as_of: asOf, concepts, periods = "annual", ratios = false } = parse(knownInput, args, "known_as_of");
  const e = await loadCompany(session, who);
  const staleBefore = new Date(Date.parse(asOf) - (periods === "annual" ? 456 : 200) * DAY_MS).toISOString().slice(0, 10);
  const rows = [];
  const missing = [];
  for (const name of concepts ?? DEFAULT_CONCEPTS) {
    let s;
    try {
      s = resolveSeries(e, name);
    } catch (err) {
      if (concepts) throw err;
      missing.push(name);
      continue;
    }
    let hit = null;
    for (const p of s.periods) {
      if (p.kind !== periods) continue;
      const sel = select(p, "as_of", asOf);
      if (sel) {
        hit = { p, sel };
        break;
      }
    }
    if (!hit) {
      missing.push(name);
      continue;
    }
    rows.push([s.name, tagName(hit.sel.v.tag), hit.p.end, hit.p.start, hit.sel.v.val, s.unit, hit.sel.v.filed, hit.sel.v.form, hit.sel.v.accn, hit.sel.changedLater, hit.p.end < staleBefore]);
  }
  return asText({
    ...head(e, asOf),
    as_of: asOf,
    periods,
    columns: ["concept", "tag", "end", "start", "val", "unit", "filed", "form", "accn", "changed_after", "stale"],
    rows,
    ...(missing.length ? { missing } : {}),
    ...(ratios ? { ratios: pointInTimeRatios(e, asOf, periods) } : {}),
    meaning: `Each row is the most recent period whose value had been filed on or before as_of, with the value as it stood then. changed_after: a later filing reported a different value, so a backtest reading today's data would use a number nobody knew on as_of. stale: the period ended long before as_of, so the company may have stopped reporting this measure.${ratios ? " ratios: computed only from values filed by as_of for one period; each names its inputs and their filings." : ""}`,
    limits: LIMITS,
  });
}

// Stock splits: a per-share value divides by the split ratio and a share count multiplies by it.
// A change is a split when its ratio matches one the company reported
// (StockholdersEquityNoteStockSplitConversionRatio1), or a product of those; with no reported
// ratio, a per-share or share change by a whole ratio from 2 to 20 is marked split_likely.
function splitRatios(entry) {
  const ratios = [];
  for (const key of ["us-gaap:StockholdersEquityNoteStockSplitConversionRatio1", "us-gaap:StockholdersEquityNoteStockSplitConversionRatio"]) {
    const c = entry.index.get(key);
    if (!c) continue;
    for (const list of Object.values(c.units)) for (const p of list) for (const v of p.vintages) if (v.val > 0 && v.val !== 1 && !ratios.includes(v.val)) ratios.push(v.val);
  }
  const products = new Set(ratios);
  for (const a of ratios) for (const b of ratios) if (a !== b) products.add(a * b);
  return [...products];
}

function splitCause(unit, first, last, ratios) {
  const perShare = /\/shares?$/i.test(unit);
  if (!perShare && !/^shares?$/i.test(unit)) return null;
  if (first.val === 0 || last.val === 0 || Math.sign(first.val) !== Math.sign(last.val)) return null;
  const r = perShare ? first.val / last.val : last.val / first.val;
  const near = (x) => Math.abs(r - x) / x < 0.01;
  if (ratios.some((x) => near(x))) return "split";
  if (!ratios.length) for (let n = 2; n <= 20; n += 1) if (Math.abs(r - n) / n < 0.005 || Math.abs(1 / r - n) / n < 0.005) return "split_likely";
  return null;
}

export const restatementsInput = z.object({
  company,
  concept: conceptArg.optional().describe("Default: every concept."),
  periods: periodsArg,
  since: date.optional().describe("Only periods ending on or after."),
  min_change_pct: z.number().min(0).max(1e6).optional().describe("Minimum absolute change, % of first value."),
  include_splits: z.boolean().optional().describe("Also list stock-split changes; default false."),
  limit: z.number().int().min(1).max(400).optional().describe("Default 25, newest first."),
  offset: offsetArg,
}).strict();

export async function toolRestatements(session, args) {
  const { company: who, concept, periods = "annual", since, min_change_pct: minPct = 0, include_splits: withSplits = false, limit = 25, offset = 0 } = parse(restatementsInput, args, "restatements");
  const e = await loadCompany(session, who);
  const ratios = splitRatios(e);
  const scope = concept
    ? [resolveSeries(e, concept)]
    : [...e.index.values()].flatMap((c) => Object.keys(c.units).map((u) => resolveSeries(e, `${c.taxonomy}:${c.tag}`, u, { keep: false })));
  let scanned = 0;
  let reverted = 0;
  let splits = 0;
  const found = [];
  for (const s of scope) {
    for (const p of s.periods) {
      if (!matchesKind(p, periods) || (since && p.end < since)) continue;
      scanned += 1;
      if (p.reverted) reverted += 1;
      if (!p.restated) continue;
      const first = p.vintages[0];
      const last = p.vintages[p.vintages.length - 1];
      const cause = splitCause(s.unit, first, last, ratios) ?? (p.tagChanged ? "tag_change" : null);
      if (cause === "split" || cause === "split_likely") {
        splits += 1;
        if (!withSplits) continue;
      }
      const pct = first.val === 0 ? null : ((last.val - first.val) / Math.abs(first.val)) * 100;
      if (minPct > 0 && pct !== null && Math.abs(pct) < minPct) continue;
      found.push({ s, p, first, last, pct, cause });
    }
  }
  const size = (x) => (x.pct === null ? Infinity : Math.abs(x.pct));
  found.sort((a, b) => b.p.end.localeCompare(a.p.end) || size(b) - size(a) || a.s.name.localeCompare(b.s.name));
  const round = (x) => (x === null ? null : Math.round(x * 100) / 100);
  const shown = page(found.map(({ s, p, first, last, pct, cause }) => [s.name, s.unit, p.end, p.start, first.val, first.filed, last.val, last.filed, round(pct), p.vintages.length, cause]), offset, limit);
  return asText({
    ...head(e),
    periods,
    scanned,
    changed: found.length,
    ...(splits ? { [withSplits ? "splits_included" : "splits_excluded"]: splits } : {}),
    ...(reverted ? { changed_then_reverted: reverted } : {}),
    columns: ["concept", "unit", "end", "start", "first_val", "first_filed", "latest_val", "latest_filed", "change_pct", "filings", "cause"],
    ...shown,
    meaning: "Periods whose latest filed value differs from the first report. change_pct is relative to the first value (null when that was zero). cause: split (a stock split the company reported), split_likely, tag_change (the value moved to another tag), or null (a restatement, reclassification or correction; read the filings). Periods that changed and later went back to the first value are counted in changed_then_reverted, not listed.",
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
  const s = resolveSeries(e, concept, unit);
  const hits = s.periods.filter((p) => p.end === end && (start === undefined || p.start === start));
  if (!hits.length) throw new Error(`${e.name} reports no ${s.name} period ending ${end}${start ? ` and starting ${start}` : ""} in ${s.unit}; history lists the periods it does report.`);
  const rows = [];
  for (const p of hits) for (const v of p.vintages) rows.push([p.start, p.end, v.filed, v.form, v.accn, v.fy, v.fp, v.val, ...(s.multi ? [tagName(v.tag)] : [])]);
  return asText({
    ...head(e),
    concept: { name: s.name, label: s.label, unit: s.unit, tags: s.tags.map(tagName) },
    columns: ["start", "end", "filed", "form", "accn", "fy", "fp", "val", ...(s.multi ? ["tag"] : [])],
    ...fit(rows),
    filing_url: `https://www.sec.gov/Archives/edgar/data/${Number(e.cik)}/{accn without dashes}/`,
    meaning: "Every filing that reported this period, oldest first. fy and fp are the fiscal year and period of the filing that carried the value, not of the period itself.",
    limits: LIMITS,
  });
}

export const findInput = z.object({
  query: z.string().min(1).max(100).describe("Name (Exxon Mobil), ticker or CIK."),
  limit: z.number().int().min(1).max(20).optional().describe("Default 8."),
}).strict();

export const FIND_LIMITS = Object.freeze([
  "Companies are those in the Canli company reference, named as the SEC records them; tickers are the SEC's current ticker file, so a former ticker is not listed and a company that no longer trades has none.",
  "The CIK is the identity: a ticker can be reused after a delisting.",
]);

export async function toolFindCompany(session, args) {
  const { query, limit = 8 } = parse(findInput, args, "find_company");
  const found = await findCompanies(session, query, limit);
  return asText({
    query,
    ...(found.resolved ? { resolved: found.resolved } : {}),
    total: found.total,
    columns: ["cik", "name", "tickers", "match"],
    rows: found.matches.map((m) => [m.cik, m.name, m.tickers, m.match]),
    ...(found.outside ? { ticker_holder: { ...found.outside, in_reference: false } } : {}),
    tickers_as_of: found.captured,
    next: found.resolved ? `Every other tool takes "${query}" as company and reads CIK ${found.resolved.cik}.` : "Pass one cik above as company to any other tool.",
    meaning: "match: ticker, cik, name (the same name once Inc, Corp and punctuation are ignored), same_name_as_ticker_holder (the SEC gives this ticker to a company outside the reference, named in ticker_holder; this covered filer has the same name), name_start, name_words or name_contains. resolved is the company the other tools use for this query; it is set only when one match is clearly best.",
    limits: FIND_LIMITS,
  });
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export const TOOL_DESCRIPTIONS = Object.freeze({
  known_as_of: "What a company had reported as of a date: per measure, the latest period filed by then, its value, and whether it was later restated; optionally ratios from those filings. For point-in-time backtests.",
  history: "One measure over time, newest first: as first reported (default), as latest filed, or as known on as_of, each with its filing and whether it later changed.",
  restatements: "Periods whose value changed in a later filing, with first and latest values, % change and cause (stock splits left out by default). Omit concept to scan everything.",
  vintages: "Every filing that reported one period of one measure, oldest first: the revision history behind a number.",
  list_concepts: "The XBRL concepts a company reports and the plain names it supports, with units, periods, date range and restated-period counts.",
  find_company: "Find a company's SEC CIK and tickers by name, ticker or CIK. The other tools also take a name as company.",
});

// Output schemas: published OPEN (extra fields always pass), every field optional. A client
// validates a result against the schema it listed, and a closed schema turns any field a later
// version adds into a failed call.
const table = { columns: z.array(z.string()).optional(), rows: z.array(z.unknown()).optional(), truncated: z.boolean().optional(), next_offset: z.number().optional() };
const common = { company: z.looseObject({}).optional(), snapshot: z.looseObject({}).optional(), limits: z.array(z.string()).optional(), meaning: z.string().optional() };
export const OUTPUT_SCHEMAS = Object.freeze({
  known_as_of: z.looseObject({ ...common, as_of: z.string().optional(), ...table, missing: z.array(z.string()).optional(), ratios: z.looseObject({}).optional() })
    .describe("rows: one per measure in the order of columns, the value as it stood on as_of; changed_after flags values later restated."),
  history: z.looseObject({ ...common, concept: z.looseObject({}).optional(), basis: z.string().optional(), total: z.number().optional(), ...table })
    .describe("rows: one per period, newest first, in the order of columns."),
  restatements: z.looseObject({ ...common, scanned: z.number().optional(), changed: z.number().optional(), ...table })
    .describe("rows: one per restated period, newest first, with first and latest values, change_pct and cause."),
  vintages: z.looseObject({ ...common, concept: z.looseObject({}).optional(), ...table, filing_url: z.string().optional() })
    .describe("rows: every filing that reported the period, oldest first."),
  list_concepts: z.looseObject({ ...common, concepts: z.number().optional(), matched: z.number().optional(), plain_names: z.looseObject({}).optional(), ...table })
    .describe("rows: one per concept in the order of columns; plain_names maps each supported plain name to its tags."),
  find_company: z.looseObject({ query: z.string().optional(), resolved: z.looseObject({}).optional(), total: z.number().optional(), ...table, ticker_holder: z.looseObject({}).optional(), limits: z.array(z.string()).optional(), meaning: z.string().optional() })
    .describe("rows: matching companies, best first, in the order of columns; resolved is the one the other tools use for this query."),
});

export function registerTools(server, session) {
  const tool = (name, title, inputSchema, fn) => server.registerTool(name, { title, annotations: { title, ...READ_ONLY }, description: TOOL_DESCRIPTIONS[name], inputSchema, outputSchema: OUTPUT_SCHEMAS[name] }, fn);
  tool("known_as_of", "Known as of a date", knownInput, (args) => toolKnownAsOf(session, args));
  tool("history", "Measure history", historyInput, (args) => toolHistory(session, args));
  tool("restatements", "Restated periods", restatementsInput, (args) => toolRestatements(session, args));
  tool("vintages", "Filing vintages", vintagesInput, (args) => toolVintages(session, args));
  tool("list_concepts", "List concepts", listInput, (args) => toolListConcepts(session, args));
  tool("find_company", "Find a company", findInput, (args) => toolFindCompany(session, args));
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
  registerTools(server, createSession());
  await server.connect(new StdioServerTransport());
}
