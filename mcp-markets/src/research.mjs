// Research across the market, not one company at a time: screens over every US filer (SEC XBRL
// frames), a full company report in one call, event studies on prices around filings, and how often
// a phrase appears in filings over time. All from public sources; every result names them.
import { z } from "zod";

import { parseForm4 } from "./forms.mjs";
import { releasesFrom } from "./earnings.mjs";
import { financialStatements } from "./statements.mjs";
import { factBook, isScaleSlip, marketValue, priceToEarnings, usdPer } from "./listing.mjs";
import { acceptanceTimes, archiveBase, FACTS_FROM, filings, getJson, getText, NotFound, resolveEntity, submissions } from "./sources.mjs";
import { priceHistory } from "./tools.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const round = (x, d = 6) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const today = (session) => new Date(session.now()).toISOString().slice(0, 10);
const daysAgo = (session, n) => new Date(session.now() - n * 86400000).toISOString().slice(0, 10);
const LIMITS = ["From SEC EDGAR and the other named sources as published; Canli Capital does not edit or verify the filers' statements.", "Not investment advice."];

// ---------------------------------------------------------------------------------------------
// Metrics: XBRL concepts in priority order (the first a company reports is used), and ratios.
// ---------------------------------------------------------------------------------------------
const D = "duration", I = "instant";
// Each metric lists XBRL tags in groups. The first group a company reports is used; within a group
// the largest value wins, because its tags are versions of one line or one is a subset of the other.
// Revenue: BlackRock's 2024 "Revenues" holds a $12.8 billion item while its $20.4 billion total is
// "RevenueFromContractWithCustomerExcludingAssessedTax", hence the larger of the two; the
// tax-inclusive tag (gross of excise taxes) is used only when nothing else is reported. R&D: J&J tags
// a $109 million item as ResearchAndDevelopmentExpense and its $14.7 billion total under
// ...ExcludingAcquiredInProcessCost for 2025.
const metric = (kind, unit, groups) => ({ kind, unit, groups, tags: groups.flat() });
const one = (...tags) => tags.map((t) => [t]);
export const METRICS = Object.freeze({
  // RevenuesNetOfInterestExpense: a lender's total. American Express's "Revenues" holds only its $41.3 billion
  // of non-interest revenue against a $72.2 billion total.
  revenue: metric(D, "USD", [["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenuesNetOfInterestExpense"], ["SalesRevenueNet"], ["RevenueFromContractWithCustomerIncludingAssessedTax"]]),
  // In order, as a company's own figure of one line. Since the 2025 reports many 10-Ks tag only the
  // common-stockholders line or ProfitLoss, and NetIncomeLoss comes from the proxy's pay table, sometimes in
  // the proxy's rounded units: Arista's 3,511 for $3.5114 billion, J.Jill's 27,900 for $27.891 million.
  net_income: { ...metric(D, "USD", [["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "ProfitLoss"]]), ordered: true },
  operating_income: metric(D, "USD", one("OperatingIncomeLoss")),
  gross_profit: metric(D, "USD", one("GrossProfit")),
  eps_diluted: metric(D, "USD/shares", one("EarningsPerShareDiluted")),
  rd_expense: metric(D, "USD", [["ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"]]),
  operating_cash_flow: metric(D, "USD", one("NetCashProvidedByUsedInOperatingActivities")),
  // Capital spending under either tag: Amazon reports it as productive assets.
  capex: metric(D, "USD", [["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"]]),
  assets: metric(I, "USD", one("Assets")),
  liabilities: metric(I, "USD", one("Liabilities")),
  equity: metric(I, "USD", one("StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest")),
  cash: metric(I, "USD", one("CashAndCashEquivalentsAtCarryingValue")),
  long_term_debt: metric(I, "USD", one("LongTermDebtNoncurrent", "LongTermDebt")),
});

// The same measures in the IFRS taxonomy, which foreign filers use on their 20-Fs. Owners' profit comes
// first, to match US GAAP's NetIncomeLoss and the per-share figures.
export const IFRS_METRICS = Object.freeze({
  revenue: metric(D, "USD", [["Revenue", "RevenueFromContractsWithCustomers"]]),
  net_income: metric(D, "USD", one("ProfitLossAttributableToOwnersOfParent", "ProfitLoss")),
  operating_income: metric(D, "USD", one("ProfitLossFromOperatingActivities")),
  gross_profit: metric(D, "USD", one("GrossProfit")),
  eps_diluted: metric(D, "USD/shares", one("DilutedEarningsLossPerShare", "BasicEarningsLossPerShare")),
  rd_expense: metric(D, "USD", one("ResearchAndDevelopmentExpense")),
  operating_cash_flow: metric(D, "USD", one("CashFlowsFromUsedInOperatingActivities")),
  capex: metric(D, "USD", one("PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", "PurchaseOfPropertyPlantAndEquipment")),
  assets: metric(I, "USD", one("Assets")),
  liabilities: metric(I, "USD", one("Liabilities")),
  equity: metric(I, "USD", one("EquityAttributableToOwnersOfParent", "Equity")),
  cash: metric(I, "USD", one("CashAndCashEquivalents")),
  long_term_debt: metric(I, "USD", one("NoncurrentPortionOfNoncurrentBorrowings", "LongtermBorrowings")),
});

// A company's value for a metric from its values by tag: the preferred tag if it has one (so growth
// compares a tag with itself), else by group as above.
export function choose(def, byTag, preferTag) {
  if (!byTag) return null;
  if (preferTag && byTag[preferTag]) return { ...byTag[preferTag], tag: preferTag };
  if (def.ordered) {
    const have = def.tags.filter((t) => byTag[t]);
    if (!have.length) return null;
    // A value a thousand or a million times smaller than another of the same line is in other units.
    const small = (t) => have.some((u) => u !== t && byTag[t].val && [1e3, 1e6, 1e9].some((k) => Math.abs(Math.abs(byTag[u].val / byTag[t].val) / k - 1) < 0.005));
    const t = have.find((x) => !small(x)) ?? have[0];
    return { ...byTag[t], tag: t };
  }
  for (const g of def.groups) {
    const have = g.filter((t) => byTag[t]).sort((a, b) => Math.abs(byTag[b].val) - Math.abs(byTag[a].val));
    if (!have.length) continue;
    // A value exactly 1,000, a million or a billion times another tag's in the group is a scale
    // slip (Tigo Energy's 2025 filing tags revenue as $103,536,000 and as $103,536,000,000), not a
    // larger line: it is passed over. Other gaps are real (J&J's two R&D tags differ 134-fold).
    const slip = (t) => have.some((u) => u !== t && byTag[u].val && [1e3, 1e6, 1e9].some((k) => Math.abs(byTag[t].val / byTag[u].val / k - 1) < 0.005));
    const t = have.find((x) => !slip(x)) ?? have.at(-1);
    return { ...byTag[t], tag: t };
  }
  return null;
}

const pos = (x) => x != null && x > 0;
export const DERIVED = Object.freeze({
  revenue_growth: { needs: ["revenue", "revenue@prev"], f: (m) => (pos(m["revenue@prev"]) && m.revenue != null ? m.revenue / m["revenue@prev"] - 1 : null) },
  net_income_growth: { needs: ["net_income", "net_income@prev"], f: (m) => (pos(m["net_income@prev"]) && m.net_income != null ? m.net_income / m["net_income@prev"] - 1 : null) },
  net_margin: { needs: ["net_income", "revenue"], f: (m) => (pos(m.revenue) && m.net_income != null ? m.net_income / m.revenue : null) },
  operating_margin: { needs: ["operating_income", "revenue"], f: (m) => (pos(m.revenue) && m.operating_income != null ? m.operating_income / m.revenue : null) },
  gross_margin: { needs: ["gross_profit", "revenue"], f: (m) => (pos(m.revenue) && m.gross_profit != null ? m.gross_profit / m.revenue : null) },
  roe: { needs: ["net_income", "equity"], f: (m) => (pos(m.equity) && m.net_income != null ? m.net_income / m.equity : null) },
  roa: { needs: ["net_income", "assets"], f: (m) => (pos(m.assets) && m.net_income != null ? m.net_income / m.assets : null) },
  liabilities_to_equity: { needs: ["liabilities", "equity"], f: (m) => (pos(m.equity) && m.liabilities != null ? m.liabilities / m.equity : null) },
  free_cash_flow: { needs: ["operating_cash_flow", "capex"], f: (m) => (m.operating_cash_flow != null ? m.operating_cash_flow - (m.capex ?? 0) : null) },
  fcf_margin: { needs: ["operating_cash_flow", "capex", "revenue"], f: (m) => (pos(m.revenue) && m.operating_cash_flow != null ? (m.operating_cash_flow - (m.capex ?? 0)) / m.revenue : null) },
  rd_intensity: { needs: ["rd_expense", "revenue"], f: (m) => (pos(m.revenue) && m.rd_expense != null ? m.rd_expense / m.revenue : null) },
});
export const ALL_METRICS = [...Object.keys(METRICS), ...Object.keys(DERIVED)];

// Values no real company reports: almost always a filer's tagging slip (one 2026 filing tagged net
// income of $1.157 billion as $1,157,000,000,000). A ranking would put them first, so a company
// failing a check is held out of the results unless include_suspect is set, and listed apart. The
// checks flag the impossible only: early-stage companies really do lose many times their revenue.
const CHECKS = [
  ["gross_margin", (v) => v > 1.0001, "gross profit above revenue"],
  ["roa", (v) => v > 3, "net income more than 3 times assets"],
  ["revenue_growth", (v) => v > 1000, "revenue up more than 1,000-fold"],
];
export function suspect(m) {
  const out = [];
  if (m.revenue > 0 && m.assets > 0 && m.revenue > 20 * m.assets) out.push("revenue more than 20 times assets");
  for (const [k, bad, why] of CHECKS) { const v = DERIVED[k].f(m); if (v != null && bad(v)) out.push(why); }
  if (m.eps_diluted != null && Math.abs(m.eps_diluted) > 100000) out.push("EPS above $100,000");
  return out;
}
const VALUATION = ["price", "market_cap", "pe", "ps", "fcf_yield"];

// "FY2025"/"CY2025" -> each filer's fiscal year that best overlaps calendar 2025; "CY2025Q2" -> a quarter.
export function parsePeriod(p) {
  const m = String(p).toUpperCase().match(/^(?:CY|FY)(\d{4})(?:Q([1-4]))?$/);
  if (!m) throw new Error(`period: "${p}" is not like FY2025 or CY2025Q2.`);
  const y = Number(m[1]), q = m[2] ? Number(m[2]) : null;
  return q
    ? { duration: `CY${y}Q${q}`, instant: `CY${y}Q${q}I`, prev: `CY${y - 1}Q${q}`, label: `CY${y}Q${q}` }
    : { duration: `CY${y}`, instant: `CY${y}Q4I`, prev: `CY${y - 1}`, label: `FY${y} (calendar frame CY${y})` };
}

// The calendar-quarter instant frames a balance-sheet date in [from, to] can sit in: the quarters
// from the one before from's to the one after to's.
export function quarterInstants([from, to]) {
  const q = (d) => Number(d.slice(0, 4)) * 4 + Math.floor((Number(d.slice(5, 7)) - 1) / 3);
  const out = [];
  for (let k = q(from) - 1; k <= q(to) + 1; k += 1) out.push(`CY${Math.floor(k / 4)}Q${(k % 4) + 1}I`);
  return out;
}

// SEC writes a ratio unit as "USD-per-shares" in frame URLs.
export const frameUrl = (tax, tag, unit, frame) => `https://data.sec.gov/api/xbrl/frames/${tax}/${tag}/${unit.replace("/", "-per-")}/${frame}.json`;
async function frame(session, tag, unit, frm, tax = "us-gaap") {
  try { return await getJson(session, frameUrl(tax, tag, unit, frm), { maxBytes: 64 * 1024 * 1024 }); } catch (err) { if (err instanceof NotFound) return null; throw err; }
}

// One metric for every filer at one frame: cik -> { name, byTag: { tag: { val, end, accn } } }.
async function metricFrame(session, name, frm) {
  const def = METRICS[name];
  const frames = await Promise.all(def.tags.map((tag) => frame(session, tag, def.unit, frm)));
  const out = new Map(), urls = [];
  frames.forEach((f, i) => {
    if (!f) return;
    urls.push(frameUrl("us-gaap", def.tags[i], def.unit, frm));
    for (const r of f.data ?? []) {
      const cur = out.get(r.cik) ?? { name: r.entityName, byTag: {} };
      cur.byTag[def.tags[i]] = { val: r.val, end: r.end, start: r.start, accn: r.accn };
      out.set(r.cik, cur);
    }
  });
  return { values: out, urls, def };
}
const chosen = (mf, cik, prefer) => choose(mf.def, mf.values.get(cik)?.byTag, prefer);

// Re-reads figures that came from a filing other than the one most of a company's figures came from,
// using the company's own periodic report for the same period; returns how many changed.
async function verifyRows(session, rows, per) {
  const jobs = [];
  for (const r of rows) {
    const accs = Object.values(r.src).map((x) => x.accn);
    const main = accs.sort((x, y) => accs.filter((v) => v === y).length - accs.filter((v) => v === x).length)[0];
    // Balance-sheet figures often come from a 10-Q at the calendar quarter end (a September fiscal
    // year has no 10-K balance at December), so they are re-read only when the row fails a check.
    const flagged = suspect(r.m).length > 0;
    for (const [key, src] of Object.entries(r.src)) if (src.accn !== main && (METRICS[key].kind === D || flagged)) jobs.push({ r, key, src });
  }
  let changed = 0;
  const forms = per.duration.includes("Q") ? ["10-Q", "10-Q/A", "10-K", "10-K/A"] : ["10-K", "10-K/A"];
  await Promise.all(jobs.slice(0, 60).map(async ({ r, key, src }) => {
    const def = METRICS[key], tag = r.tag[key];
    try {
      const cc = await getJson(session, `https://data.sec.gov/api/xbrl/companyconcept/CIK${String(r.cik).padStart(10, "0")}/us-gaap/${tag}.json`);
      // SEC answers {} rather than [] for a concept without facts in a unit.
      const units = cc?.units?.[def.unit];
      if (!Array.isArray(units)) return;
      const hits = units.filter((x) => forms.includes(x.form) && x.end === src.end && (def.kind === I || x.start === src.start)).sort((x, y) => (x.filed < y.filed ? -1 : 1));
      const v = hits.at(-1);
      if (v && v.val !== r.m[key]) {
        (r.corrected ??= []).push([key, r.m[key], v.val, `${v.form} ${v.accn}`]);
        r.m[key] = v.val;
        changed++;
      }
    } catch (err) { if (!(err instanceof NotFound)) throw err; }
  }));
  return changed;
}

async function listedCompanies(session) {
  const t = await getJson(session, "https://www.sec.gov/files/company_tickers_exchange.json");
  const by = new Map();
  for (const [cik, name, ticker, exchange] of t.data ?? []) if (!by.has(cik)) by.set(cik, { name, ticker, exchange });
  // The old filer's figures in the frames belong to the listed company that replaced it.
  for (const [now, before] of FACTS_FROM) if (by.has(now) && !by.has(before)) by.set(before, by.get(now));
  return by;
}

// ---------------------------------------------------------------------------------------------
// screen_companies
// ---------------------------------------------------------------------------------------------
const metricName = z.string().refine((m) => ALL_METRICS.includes(m) || VALUATION.includes(m), { message: `a metric: ${ALL_METRICS.join(", ")}` });
export const screenInput = z.object({
  period: z.string().max(12).optional().describe("FY2025 (each company's fiscal year that best overlaps calendar 2025; default the last complete year) or a quarter such as CY2026Q2."),
  fiscal_year_end: z.tuple([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional().describe("Instead of period: each company's fiscal year ending between these dates, e.g. [\"2025-02-01\", \"2026-01-31\"]; balance-sheet figures at that year's end."),
  filters: z.array(z.object({
    metric: metricName,
    op: z.enum([">", ">=", "<", "<=", "between"]),
    value: z.union([z.number(), z.tuple([z.number(), z.number()])]).describe("A number, or [low, high] for between. Ratios and growth are fractions (0.2 = 20%); money in US dollars."),
  }).strict()).max(12).optional().describe("Conditions every company must meet."),
  sort_by: metricName.optional().describe("Metric to rank by; default the first filter's metric, else revenue."),
  order: z.enum(["desc", "asc"]).optional(),
  columns: z.array(metricName).max(16).optional().describe("Extra metrics to show."),
  exchanges: z.array(z.enum(["NYSE", "Nasdaq", "CBOE", "OTC", "TXSE", "all"])).max(6).optional().describe("Listing venues to include; default NYSE and Nasdaq. \"all\" includes unlisted filers."),
  limit: z.number().int().min(1).max(500).optional().describe("Most companies to return; default 25."),
  valuation: z.boolean().optional().describe("Add price, market cap, P/E, P/S and FCF yield for the returned companies (latest close; up to 50 companies)."),
  include_suspect: z.boolean().optional().describe("Keep companies whose figures fail a plausibility check (for example net income above 10 times revenue, usually a tagging slip); default false: they are listed apart."),
}).strict();

// opts.ciks: only these filers (comps uses it); not an argument of the tool.
export async function screenCompanies(session, args, opts = {}) {
  const a = screenInput.parse(args);
  const year = Number(today(session).slice(0, 4)) - 1;
  const win = a.fiscal_year_end;
  if (win && a.period) throw new Error("Send period or fiscal_year_end, not both.");
  if (win && win[0] > win[1]) throw new Error("fiscal_year_end: the first date is after the second.");
  // A window of fiscal-year ends: every calendar frame a fiscal year ending in it can sit in, and,
  // per company, the fiscal year whose end falls in the window (the latest if several do).
  const pers = win
    ? Array.from({ length: Number(win[1].slice(0, 4)) - Number(win[0].slice(0, 4)) + 2 }, (_, i) => parsePeriod(`FY${Number(win[0].slice(0, 4)) - 1 + i}`))
    : [parsePeriod(a.period ?? `FY${year}`)];
  const per = win ? { ...pers.at(-1), label: `each company's fiscal year ending ${win[0]} to ${win[1]}` } : pers[0];
  // Valuation needs a price per company, so it is applied after the fundamentals, to whatever they leave.
  const asked = a.filters ?? [];
  const filters = asked.filter((f) => !VALUATION.includes(f.metric)), priceFilters = asked.filter((f) => VALUATION.includes(f.metric));
  const askedSort = a.sort_by ?? asked[0]?.metric ?? "revenue";
  const priceSort = VALUATION.includes(askedSort) ? askedSort : null;
  const sortBy = priceSort ? "revenue" : askedSort;
  const shown = [...new Set([...filters.map((f) => f.metric), sortBy, ...(a.columns ?? []).filter((c) => !VALUATION.includes(c))])];
  // Base metrics needed, with @prev for growth.
  const base = new Set(["revenue", "net_income", "assets"]);
  for (const m of shown) for (const n of DERIVED[m]?.needs ?? [m]) base.add(n);
  const keys = [...base];
  const durKeys = keys.filter((n) => n.endsWith("@prev") || METRICS[n].kind === D);
  const instKeys = keys.filter((n) => !n.endsWith("@prev") && METRICS[n].kind === I);
  const durJobs = pers.flatMap((p, pi) => durKeys.map((n) => ({ pi, key: n, metric: n.replace(/@prev$/, ""), frame: n.endsWith("@prev") ? p.prev : p.duration })));
  const instJobs = (win ? quarterInstants(win) : [per.instant]).flatMap((f) => instKeys.map((n) => ({ key: n, metric: n, frame: f })));
  const jobs = [...durJobs, ...instJobs];
  const [listed, ...frames] = await Promise.all([listedCompanies(session), ...jobs.map((j) => metricFrame(session, j.metric, j.frame))]);
  jobs.forEach((j, i) => { j.mf = frames[i]; });
  const venues = new Set(a.exchanges ?? ["NYSE", "Nasdaq"]);
  const any = venues.has("all");
  // Every filer in any needed frame, on the chosen venues; current values first, then the prior
  // year's, preferring the tag the current value came from; balance-sheet values at the fiscal
  // year's end when a window is given (else the calendar year-end frame).
  const rows = new Map();
  const ciks = new Set(frames.flatMap((f) => [...f.values.keys()]));
  const inWindow = (end) => !win || (end != null && end >= win[0] && end <= win[1]);
  for (const cik of ciks) {
    const co = listed.get(cik);
    if (!any && (!co || !venues.has(co.exchange))) continue;
    if (opts.ciks && !opts.ciks.has(Number(cik))) continue;
    let r = null;
    for (let pi = pers.length - 1; pi >= 0 && !r; pi -= 1) {
      const t = { cik, name: co?.name ?? frames.find((f) => f.values.has(cik)).values.get(cik).name, ticker: co?.ticker ?? null, exchange: co?.exchange ?? null, m: {}, tag: {}, end: null, src: {} };
      for (const j of durJobs) {
        if (j.pi !== pi || j.key.endsWith("@prev")) continue;
        const c = chosen(j.mf, cik);
        if (!c) continue;
        t.m[j.key] = c.val; t.tag[j.key] = c.tag; t.src[j.key] = { accn: c.accn, end: c.end, start: c.start };
        t.end = t.end ?? c.end;
      }
      if (!inWindow(t.end)) continue;
      for (const j of durJobs) {
        if (j.pi !== pi || !j.key.endsWith("@prev")) continue;
        const c = chosen(j.mf, cik, t.tag[j.metric]);
        if (c) t.m[j.key] = c.val;
      }
      r = t;
    }
    if (!r) continue;
    for (const key of instKeys) {
      const found = instJobs.filter((j) => j.key === key).map((j) => chosen(j.mf, cik)).filter(Boolean);
      const c = win ? (found.find((x) => x.end === r.end) ?? found.filter((x) => r.end && Math.abs(Date.parse(x.end) - Date.parse(r.end)) <= 31 * 86400000)[0]) : found[0];
      if (!c) continue;
      r.m[key] = c.val; r.tag[key] = c.tag; r.src[key] = { accn: c.accn, end: c.end, start: c.start };
    }
    rows.set(cik, r);
  }
  const value = (r, metric) => (DERIVED[metric] ? DERIVED[metric].f(r.m) : r.m[metric] ?? null);
  const test = (v, f) => v != null && (f.op === ">" ? v > f.value : f.op === ">=" ? v >= f.value : f.op === "<" ? v < f.value : f.op === "<=" ? v <= f.value : Array.isArray(f.value) && v >= f.value[0] && v <= f.value[1]);
  const universe = [...rows.values()].filter((r) => value(r, sortBy) != null);
  const dir = (a.order ?? "desc") === "desc" ? -1 : 1;
  const rank = (list) => list.sort((x, y) => dir * (value(x, sortBy) - value(y, sortBy)) || x.cik - y.cik);
  let meets = rank(universe.filter((r) => filters.every((f) => test(value(r, f.metric), f))));
  // Frames carry the latest filing's value, which can be a proxy statement's pay-versus-performance
  // table with a slip (Medline's 2025 net income: $1.159 billion in its 10-K, $1,157 billion in its
  // proxy). For the leading companies and any that fail a check, a figure filed in a different
  // filing from most of the company's other figures is re-read from its own 10-K (or 10-Q).
  const limit = a.limit ?? 25;
  const toCheck = [...meets.slice(0, limit + 10), ...meets.slice(limit + 10).filter((r) => suspect(r.m).length)];
  const corrections = await verifyRows(session, toCheck, per);
  if (corrections) meets = rank(universe.filter((r) => filters.every((f) => test(value(r, f.metric), f))));
  const held = a.include_suspect ? [] : meets.filter((r) => suspect(r.m).length);
  const passing = a.include_suspect ? meets : meets.filter((r) => !suspect(r.m).length);
  const screened = priceFilters.length || priceSort ? await priceScreen(session, passing, per, priceFilters, priceSort, a.order ?? (priceSort === "market_cap" || priceSort === "fcf_yield" ? "desc" : "asc")) : null;
  const top = (screened ? screened.rows : passing).slice(0, a.limit ?? 25);
  const out = {
    period: per.label,
    universe: universe.length, matched: screened ? screened.rows.length : passing.length,
    ...(screened ? { priced: screened.note } : {}),
    columns: ["ticker", "name", "cik", "exchange", "period_end", ...shown],
    rows: top.map((r) => [r.ticker, r.name, r.cik, r.exchange, r.end, ...shown.map((m) => round(value(r, m), DERIVED[m] ? 6 : 4))]),
    ...(toCheck.some((r) => r.corrected) ? { corrected: { reason: "a figure from a different filing (often a proxy statement) disagreed with the company's own 10-K or 10-Q, which was used", columns: ["ticker", "metric", "frame_value", "report_value", "report"], rows: toCheck.filter((r) => r.corrected).flatMap((r) => r.corrected.map((c) => [r.ticker, ...c])).slice(0, 20) } } : {}),
    ...(held.length ? { held_out: { reason: "failed a plausibility check (usually a tagging slip in the filing); pass include_suspect: true to keep them", columns: ["ticker", "name", "cik", "checks"], rows: held.slice(0, 10).map((r) => [r.ticker, r.name, r.cik, suspect(r.m).join("; ")]), count: held.length } } : {}),
  };
  if ((a.valuation || screened) && top.length) {
    const val = screened ? new Map(top.map((r) => [r.cik, r.val])) : await valuationFor(session, top.slice(0, 50), per);
    out.valuation = { columns: ["ticker", ...VALUATION, "price_date", "shares_basis"], rows: top.slice(0, 50).map((r) => [r.ticker, ...VALUATION.map((k) => val.get(r.cik)?.[k] ?? null), val.get(r.cik)?.price_date ?? null, val.get(r.cik)?.shares_basis ?? null]) };
  }
  out.definitions = Object.fromEntries(shown.map((m) => [m, DERIVED[m] ? `derived from ${DERIVED[m].needs.join(", ")}` : `XBRL ${METRICS[m].groups.map((g) => g.join(" or ")).join(", else ")} (the larger within "or"), ${METRICS[m].unit}`]));
  out.sources = [...new Set(frames.flatMap((f) => f.urls))];
  out.limits = [...LIMITS, "XBRL frames give one value per filer for the fiscal period that best overlaps the calendar period, as most recently filed; filers tag line items differently, so a missing or unusual tag drops or skews a company. Check a shortlisted company's filing before relying on a figure.", "Listing is SEC's ticker-and-exchange file: a company that has just moved its ticker to a new holding company (Exxon Mobil, 2026) is listed under the new filer, which may not have filed financial statements yet."];
  return out;
}

// What valuation reads from the frames, for every filer at once.
async function valuationInputs(session, per) {
  const y = Number(per.duration.slice(2, 6));
  const shareFrames = await Promise.all([`CY${y}Q4I`, `CY${y + 1}Q1I`, `CY${y + 1}Q2I`].map((f) => frame(session, "EntityCommonStockSharesOutstanding", "shares", f, "dei")));
  const shares = new Map(), abroad = new Set();
  for (const f of shareFrames) for (const r of f?.data ?? []) { if (r.loc && !String(r.loc).startsWith("US")) abroad.add(r.cik); const cur = shares.get(r.cik); if (!cur || r.end > cur.end) shares.set(r.cik, { val: r.val, end: r.end, basis: "cover page" }); }
  // Companies with several share classes report cover-page counts per class, which frames leave
  // out; the period's diluted weighted-average share count stands in for them.
  const diluted = await frame(session, "WeightedAverageNumberOfDilutedSharesOutstanding", "shares", per.duration);
  const dilutedBy = new Map((diluted?.data ?? []).map((r) => [r.cik, r.val]));
  for (const r of diluted?.data ?? []) if (!shares.has(r.cik)) shares.set(r.cik, { val: r.val, end: r.end, basis: "diluted weighted average" });
  const fund = await Promise.all(["revenue", "eps_diluted", "operating_cash_flow", "capex"].map((m) => metricFrame(session, m, per.duration)));
  const [rev, eps, ocf, capex] = fund.map((f) => ({ get: (cik) => chosen(f, cik) ?? undefined }));
  return { shares, abroad, dilutedBy, rev, eps, ocf, capex };
}

// One company's valuation from a price. A filer abroad may list depositary shares, whose price and share
// count stand on different footings: its ratio is read from its 20-F.
async function valueOne(session, r, price, priceDate, inp) {
  const sh = inp.shares.get(r.cik)?.val, e = inp.eps.get(r.cik)?.val, profit = r.m.net_income;
  // Two checks on the cover page's count: the year's diluted shares, else profit over earnings per share.
  const earned = inp.dilutedBy.get(r.cik) ?? (e > 0 && profit > 0 ? profit / e : null);
  const twoClasses = r.cik === 1067983 || Number(r.cik) === 1067983;
  const mv = inp.abroad.has(r.cik) || twoClasses ? await marketValue(session, r.cik, await submissions(session, r.cik), price, sh, { implied: earned ?? inp.dilutedBy.get(r.cik) })
    : { market_cap: sh ? price * (earned && isScaleSlip(sh, earned) ? earned : sh) : null, price_per_share: price };
  const mcap = mv.market_cap;
  const rv = inp.rev.get(r.cik)?.val, fcf = inp.ocf.get(r.cik) ? inp.ocf.get(r.cik).val - (inp.capex.get(r.cik)?.val ?? 0) : null;
  return { price, price_date: priceDate, shares_basis: inp.shares.get(r.cik)?.basis ?? null, market_cap: mcap ? Math.round(mcap) : null, pe: e > 0 ? round(priceToEarnings({ price_per_share: mv.price_per_share, eps: e, market_cap: mcap, net_income: profit }), 2) : null, ps: mcap && rv > 0 ? round(mcap / rv, 2) : null, fcf_yield: mcap && fcf != null ? round(fcf / mcap, 4) : null };
}

// Latest close, market cap, P/E, P/S and FCF yield for up to 50 companies.
async function valuationFor(session, rows, per) {
  const inp = await valuationInputs(session, per);
  const out = new Map();
  const queue = [...rows];
  const worker = async () => {
    for (let r; (r = queue.shift());) {
      if (!r.ticker) continue;
      try {
        const p = await priceHistory(session, { symbol: r.ticker, start: daysAgo(session, 10), end: today(session) });
        out.set(r.cik, await valueOne(session, r, p.close.at(-1), p.dates.at(-1), inp));
      } catch { /* no price for this ticker: its valuation stays empty */ }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return out;
}

// Latest prices for many tickers at once, 20 to a request: the whole market in seconds.
export async function latestPrices(session, tickers) {
  if (session.env?.CANLI_KEYLESS_PRICES === "0") throw new Error("Valuation filters need prices, which are off on this server (CANLI_KEYLESS_PRICES=0). On the hosted server, run the local one: npx -y canli-mcp.");
  const out = new Map(), batches = [];
  for (let i = 0; i < tickers.length; i += 20) batches.push(tickers.slice(i, i + 20));
  const worker = async () => {
    for (let b; (b = batches.shift());) {
      try {
        const d = await getJson(session, `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(b.join(","))}&range=1d&interval=1d`, { timeoutMs: 12000 });
        for (const x of d?.spark?.result ?? []) {
          const m = x?.response?.[0]?.meta;
          if (m?.regularMarketPrice > 0) out.set(x.symbol, { price: m.regularMarketPrice, date: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString().slice(0, 10) : null });
        }
      } catch { /* a failed batch leaves its tickers unpriced, and the count says so */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

// Valuation over every company the fundamentals left. Filers abroad cost a 20-F each to read, so the 40
// largest are read and the others counted.
const ABROAD_READ = 40;
async function priceScreen(session, rows, per, filters, sortBy, order) {
  const named = rows.filter((r) => r.ticker);
  const [prices, inp] = await Promise.all([latestPrices(session, named.map((r) => r.ticker)), valuationInputs(session, per)]);
  if (named.length && !prices.size) throw new Error("No prices came back for this screen; the price source may be limiting requests. Ask again in a minute.");
  const test = (v, f) => v != null && (f.op === ">" ? v > f.value : f.op === ">=" ? v >= f.value : f.op === "<" ? v < f.value : f.op === "<=" ? v <= f.value : Array.isArray(f.value) && v >= f.value[0] && v <= f.value[1]);
  const home = named.filter((r) => !inp.abroad.has(r.cik)), abroad = named.filter((r) => inp.abroad.has(r.cik) && prices.has(r.ticker)).sort((x, y) => (y.m.revenue ?? 0) - (x.m.revenue ?? 0));
  const out = [];
  for (const r of home) { const p = prices.get(r.ticker); if (p) out.push({ ...r, val: await valueOne(session, r, p.price, p.date, inp) }); }
  const queue = abroad.slice(0, ABROAD_READ);
  await Promise.all(Array.from({ length: 4 }, async () => { for (let r; (r = queue.shift());) { const p = prices.get(r.ticker); try { out.push({ ...r, val: await valueOne(session, r, p.price, p.date, inp) }); } catch { /* left out, and counted */ } } }));
  // Figures no company has, usually a tagging slip that no check could place: held apart, not ranked first.
  const odd = out.filter((r) => r.val.fcf_yield > 1 || (r.val.ps != null && r.val.ps < 0.01));
  const oddSet = new Set(odd.map((r) => r.cik));
  const kept = out.filter((r) => !oddSet.has(r.cik) && filters.every((f) => test(r.val[f.metric], f)));
  const by = sortBy ?? filters[0]?.metric;
  const dir = order === "asc" ? 1 : -1;
  if (by) kept.sort((x, y) => { const p = x.val[by], q = y.val[by]; if (p == null) return 1; if (q == null) return -1; return dir * (p - q); });
  return { rows: kept, note: { companies: named.length, with_a_price: prices.size, abroad_read: Math.min(abroad.length, ABROAD_READ), abroad_left_out: Math.max(0, abroad.length - ABROAD_READ), ...(odd.length ? { held_out_as_implausible: odd.slice(0, 20).map((r) => r.ticker) } : {}), meaning: "P/E, P/S and FCF yield set the latest price against the fiscal-year figures of this screen; market cap uses the latest cover-page share count. Companies with no positive earnings have no P/E and fail a P/E filter.", source: "Yahoo Finance quote data (no key)" } };
}

// ---------------------------------------------------------------------------------------------
// company_report
// ---------------------------------------------------------------------------------------------
export const reportInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker (AAPL), CIK (320193) or name (Apple)."),
  years: z.number().int().min(1).max(15).optional().describe("Fiscal years of financials; default 5."),
}).strict();

// Fiscal-year values of one metric from companyfacts: end date -> { byTag }, each tag's latest filed
// value (restated if a later annual report changed it). The value for a year is chosen by choose().
function annual(facts, def, currency = "USD") {
  const out = new Map();
  const unit = def.unit.replace("USD", currency);
  for (const tag of def.tags) {
    for (const x of facts?.[tag]?.units?.[unit] ?? []) {
      if (!/^(10-K|20-F|40-F)/.test(x.form ?? "")) continue;
      if (def.kind === D) {
        if (!x.start) continue;
        const days = (Date.parse(x.end) - Date.parse(x.start)) / 86400000;
        if (days < 330 || days > 400) continue;
      }
      const year = out.get(x.end) ?? { byTag: {} };
      const cur = year.byTag[tag];
      if (!cur) year.byTag[tag] = { val: x.val, filed: x.filed, first: x.val };
      else { if (x.filed >= cur.filed) { cur.val = x.val; cur.filed = x.filed; } if (x.val !== cur.first) cur.restated = true; }
      out.set(x.end, year);
    }
  }
  return out;
}

const tag0 = (series, defs, end) => choose(defs.revenue, series.revenue.get(end)?.byTag)?.tag ?? "revenue";

export async function companyReport(session, args) {
  const a = reportInput.parse(args);
  const e = await resolveEntity(session, a.company);
  const [sub, cf] = await Promise.all([submissions(session, e.cik), getJson(session, `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(e.cik).padStart(10, "0")}.json`, { maxBytes: 64 * 1024 * 1024 }).catch((err) => { if (err instanceof NotFound) return null; throw err; })]);
  const book = factBook(cf), defs = book.taxonomy === "ifrs-full" ? IFRS_METRICS : METRICS;
  const series = Object.fromEntries(Object.entries(defs).map(([k, def]) => [k, annual(book.facts, def, book.currency)]));
  const all = [...new Set([...series.revenue.keys(), ...series.net_income.keys()])].sort();
  const ends = all.slice(-(a.years ?? 5));
  const yearsRows = ends.map((end) => {
    const m = {}, tag = {}, restated = [];
    for (const k of Object.keys(defs)) {
      const c = choose(defs[k], series[k].get(end)?.byTag);
      m[k] = c?.val ?? null; tag[k] = c?.tag;
      if (c?.restated) restated.push(k);
    }
    const prevEnd = all.filter((d) => d < end).at(-1);
    for (const k of ["revenue", "net_income"]) m[`${k}@prev`] = prevEnd ? choose(defs[k], series[k].get(prevEnd)?.byTag, tag[k])?.val ?? null : null;
    return { end, m, restated };
  });
  // A newer annual report than the facts reach: the figures are a year behind, which must be said.
  const newestAnnual = (sub.filings?.recent?.form ?? []).findIndex((f) => /^(10-K|20-F|40-F)$/.test(f));
  const annualFiled = newestAnnual >= 0 ? sub.filings.recent.filingDate[newestAnnual] : null;
  const lastFiled = ends.length ? Object.values(series.revenue.get(ends.at(-1))?.byTag ?? {}).reduce((m, x) => (x.filed > m ? x.filed : m), "") : "";
  const behind = annualFiled && lastFiled && annualFiled > lastFiled;
  const finCols = ["revenue", "revenue_growth", "gross_margin", "operating_margin", "net_income", "net_margin", "eps_diluted", "operating_cash_flow", "free_cash_flow", "roe", "liabilities_to_equity", "cash"];
  const val = (m, k) => (DERIVED[k] ? round(DERIVED[k].f(m), 6) : m[k]);
  const ticker = sub.tickers?.[0] ?? e.ticker;
  const report = {
    company: { cik: e.cik, name: sub.name, ticker, exchange: sub.exchanges?.[0] ?? null, industry: sub.sicDescription || null, fiscal_year_end: sub.fiscalYearEnd ? `${sub.fiscalYearEnd.slice(0, 2)}-${sub.fiscalYearEnd.slice(2)}` : null, state_of_incorporation: sub.stateOfIncorporation || null, ...(book.taxonomy === "ifrs-full" || book.currency !== "USD" ? { accounts: { standard: book.taxonomy === "ifrs-full" ? "IFRS" : "US GAAP", currency: book.currency } } : {}) },
    financials: { basis: `fiscal years from annual-report XBRL facts (10-K, 20-F or 40-F), latest filed value (restated where a later report changed it), in ${book.currency}`, columns: ["fiscal_year_end", ...finCols, "restated"], rows: yearsRows.map((y) => [y.end, ...finCols.map((k) => val(y.m, k)), y.restated.length ? y.restated.join(",") : null]), ...(behind ? { behind: `An annual report was filed on ${annualFiled}, but SEC's XBRL facts for this company stop at the report filed on ${lastFiled}. Use financial_statements for the newer figures.` } : {}) },
  };
  // Tags can overstate a line: Republic Services' "Revenues" is $19.0 billion gross of intercompany sales, against
  // $16.6 billion on its income statement. The statement as filed decides the latest year's revenue.
  try {
    const st = yearsRows.length ? await financialStatements(session, { company: a.company, statement: "income", period: "annual", filings: 1 }) : null;
    const col = st?.income?.columns?.findIndex((c, i) => i >= 2 && String(c).includes(yearsRows.at(-1).end)) ?? -1;
    const line = col > 0 ? st.income.rows.find((r) => /:(Revenues|RevenuesNetOfInterestExpense|RevenueFromContractWithCustomerExcludingAssessedTax|RevenueFromContractWithCustomerIncludingAssessedTax|SalesRevenueNet|Revenue|RevenueFromContractsWithCustomers)$/.test(String(r[1])) && typeof r[col] === "number" && !st.income.rows.slice(0, st.income.rows.indexOf(r)).some((u) => u[1] === r[1])) : null;
    const m = yearsRows.at(-1)?.m, filed = line ? line[col] * (st.income.money_scale ?? 1) : null;
    // A bank's statement has no total of the two sides: a fee line tagged as contract revenue is Northern Trust's
    // $5.0 billion of $8.1 billion, a part and not the figure to correct the total by.
    const bankPart = line && st.income.rows.some((r) => /:(InterestIncomeExpenseNet|NoninterestIncome)$/.test(String(r[1]))) && !/:(Revenues|RevenuesNetOfInterestExpense)$/.test(String(line[1]));
    if (!bankPart && m && filed > 0 && m.revenue > 0 && Math.abs(filed / m.revenue - 1) > 0.01 && !/^(?:.*\bSegment\b)/i.test(String(line[0]))) {
      const tagged = m.revenue;
      m.revenue = filed;
      yearsRows.at(-1).revenue_note = `Revenue is ${filed.toLocaleString("en-US")} as on the income statement; the XBRL facts' figure of ${tagged.toLocaleString("en-US")} (${tag0(series, defs, yearsRows.at(-1).end)}) is another measure.`;
    }
  } catch { /* the statement could not be read: the facts stand */ }
  const latestEnd = yearsRows.at(-1)?.end;
  if (latestEnd) report.financials.latest_tags = Object.fromEntries(["revenue", "net_income", "cash"].filter((k) => defs[k]).map((k) => [k, choose(defs[k], series[k]?.get(latestEnd)?.byTag)?.tag ?? null]));
  const revenueNote = yearsRows.at(-1)?.revenue_note;
  if (revenueNote) report.financials.note = revenueNote;
  if (revenueNote) report.financials.rows = yearsRows.map((y) => [y.end, ...finCols.map((k) => val(y.m, k)), y.restated.length ? y.restated.join(",") : null]);
  // Price, risk and valuation over the last year, against SPY.
  if (ticker) {
    try {
      const start = daysAgo(session, 372);
      const [p, mkt] = await Promise.all([priceHistory(session, { symbol: ticker, start, end: today(session) }), priceHistory(session, { symbol: "SPY", start, end: today(session) })]);
      const r = rets(p), m = rets(mkt), joint = r.dates.filter((d) => m.byDate.has(d));
      const x = joint.map((d) => m.byDate.get(d)), y = joint.map((d) => r.byDate.get(d));
      const beta = x.length > 20 ? cov(x, y) / cov(x, x) : null;
      let peak = -Infinity, mdd = 0;
      for (const c of p.close) { peak = Math.max(peak, c); mdd = Math.min(mdd, c / peak - 1); }
      const last = yearsRows.at(-1)?.m ?? {};
      const sharesFacts = cf?.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? [];
      const sh = sharesFacts.reduce((b, s) => (!b || s.end > b.end ? s : b), null);
      const price = p.close.at(-1);
      // The listed share against the filing's ordinary shares, and the filing's currency against the
      // dollar price: a foreign filer's multiples need both.
      const [mv, fx] = await Promise.all([marketValue(session, e.cik, sub, price, sh?.val, { book }), usdPer(session, book.currency)]);
      const mcap = mv.market_cap, rate = fx?.rate;
      const fcf = DERIVED.free_cash_flow.f(last);
      report.market = {
        price, price_date: p.dates.at(-1), total_return_1y: p.change?.total_return ?? null,
        volatility_1y: round(sd(r.values) * Math.sqrt(252), 4), max_drawdown_1y: round(mdd, 4), beta_1y_vs_spy: round(beta, 3),
        high_52w: Math.max(...p.high.filter((v) => v != null)), low_52w: Math.min(...p.low.filter((v) => v != null)),
        shares_outstanding: mv.shares_used ?? sh?.val ?? null, shares_as_of: mv.shares_used ? null : sh?.end ?? null, market_cap: mcap ? Math.round(mcap) : null,
        pe: last.eps_diluted > 0 && rate && mv.price_per_share ? round(priceToEarnings({ price_per_share: mv.price_per_share, eps: last.eps_diluted * rate, market_cap: mcap, net_income: last.net_income * rate }), 2) : null, ps: mcap && rate && last.revenue > 0 ? round(mcap / (last.revenue * rate), 2) : null, fcf_yield: mcap && rate && fcf != null ? round((fcf * rate) / mcap, 6) : null,
        ...(mv.ratio && mv.ratio.shares_per_listed_share !== 1 ? { listed_share: { ordinary_shares_each: mv.ratio.shares_per_listed_share, basis: mv.ratio.basis, source: mv.ratio.source } } : {}),
        ...(book.currency !== "USD" ? { fx: fx ? { pair: fx.pair, rate: round(fx.rate, 6), date: fx.date } : { note: `No ${book.currency} rate was available, so the multiples are not computed.` } } : {}),
        ...(mv.note ? { note: mv.note } : {}),
        price_source: p.source,
      };
    } catch (err) {
      report.market = { error: String(err.message ?? err) };
    }
  }
  // Insider activity over 180 days, from the issuer's Form 4 filings.
  const rec = sub.filings?.recent ?? {};
  const since = daysAgo(session, 180);
  const f4 = (rec.form ?? []).map((f, i) => [f, i]).filter(([f, i]) => f === "4" && rec.filingDate[i] >= since).slice(0, 30);
  const tally = { P: [0, 0, 0], S: [0, 0, 0] };
  const people = { P: new Set(), S: new Set() };
  await Promise.all(f4.map(async ([, i]) => {
    try {
      const doc = parseForm4(await getText(session, `${archiveBase(e.cik, rec.accessionNumber[i])}/${rec.primaryDocument[i].replace(/^xsl[^/]*\//, "")}`, { maxBytes: 4 * 1024 * 1024 }));
      for (const t of doc.rows) if (t.kind === "stock" && tally[t.code]) { tally[t.code][0]++; tally[t.code][1] += t.shares ?? 0; tally[t.code][2] += t.value ?? 0; doc.owners.forEach((o) => people[t.code].add(o.name)); }
    } catch { /* an unreadable Form 4 is skipped */ }
  }));
  report.insiders_180d = { form4_filings: f4.length, open_market_purchases: { transactions: tally.P[0], shares: round(tally.P[1], 2), value: round(tally.P[2], 2), insiders: people.P.size }, open_market_sales: { transactions: tally.S[0], shares: round(tally.S[1], 2), value: round(tally.S[2], 2), insiders: people.S.size }, ...(f4.length === 30 ? { note: "the 30 most recent Form 4 filings were read" } : {}) };
  // Recent periodic and current reports.
  const keep = new Set(["10-K", "10-Q", "8-K", "DEF 14A", "10-K/A", "10-Q/A", "S-1", "S-3", "20-F", "20-F/A", "40-F", "6-K", "F-1", "F-3", "SC 13D", "SC 13G", "SCHEDULE 13D", "SCHEDULE 13G"]);
  report.recent_filings = { columns: ["filed", "form", "items", "url"], rows: (rec.form ?? []).map((f, i) => [rec.filingDate[i], f, rec.items[i] || null, `${archiveBase(e.cik, rec.accessionNumber[i])}/${String(rec.primaryDocument[i]).replace(/^xsl[^/]*\//, "")}`]).filter((r) => keep.has(r[1])).slice(0, 8) };
  report.sources = [`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(e.cik).padStart(10, "0")}.json`, `https://data.sec.gov/submissions/CIK${String(e.cik).padStart(10, "0")}.json`];
  report.limits = [...LIMITS, "Financials are XBRL facts as tagged by the company (the first of several revenue tags it uses); market figures use the latest close and the latest cover-page share count.", ...(book.currency !== "USD" ? ["Multiples convert the filing's currency to dollars at the latest close, not at each year's rate."] : [])];
  return report;
}

// ---------------------------------------------------------------------------------------------
// Statistics: returns, OLS, Student t.
// ---------------------------------------------------------------------------------------------
function rets(p) {
  const byDate = new Map(), values = [], dates = [];
  for (let i = 1; i < p.close.length; i++) {
    if (p.close[i - 1] == null || p.close[i] == null) continue;
    const r = p.close[i] / p.close[i - 1] - 1;
    byDate.set(p.dates[i], r); values.push(r); dates.push(p.dates[i]);
  }
  return { byDate, values, dates };
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function cov(a, b) { const ma = mean(a), mb = mean(b); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb); return s / (a.length - 1); }
const sd = (a) => Math.sqrt(cov(a, a));
function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const ci of c) ser += ci / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
function betacf(a, b, x) {
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-300) d = 1e-300;
  d = 1 / d; let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-16) break;
  }
  return h;
}
function ibeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
// Two-sided p-value of Student's t with df degrees of freedom.
export const tTwoSided = (t, df) => (Number.isFinite(t) && df > 0 ? ibeta(df / 2, 0.5, df / (df + t * t)) : null);

// ---------------------------------------------------------------------------------------------
// event_study
// ---------------------------------------------------------------------------------------------
export const eventInput = z.object({
  symbol: z.string().regex(/^[A-Za-z0-9.\-]{1,12}$/, "a ticker such as AAPL").describe("Ticker of the stock."),
  events: z.array(DATE).max(200).optional().describe("Event dates (day 0 is that date, or the next trading day). Leave out to use event_type."),
  event_type: z.enum(["earnings", "insider_buys", "insider_sales", "8k"]).optional().describe("Events from SEC filings: earnings (8-K item 2.02), open-market insider purchases or sales (Form 4 codes P or S, at filing time), or any 8-K. Day 0 is the first trading session after the filing was accepted."),
  since: DATE.optional().describe("For event_type: filings since this date; default three years ago."),
  window: z.tuple([z.number().int().min(-20).max(0), z.number().int().min(0).max(60)]).optional().describe("Event window in trading days around day 0; default [-1, 5]."),
  estimation_days: z.number().int().min(30).max(500).optional().describe("Days used to fit the model, ending 10 days before the window; default 120."),
  benchmark: z.string().regex(/^[A-Za-z0-9.\-^]{1,12}$/).optional().describe("Market index for the model; default SPY."),
  model: z.enum(["market", "market_adjusted", "mean_adjusted"]).optional().describe("market (OLS alpha and beta on the benchmark, default), market_adjusted (return minus benchmark) or mean_adjusted."),
}).strict();

// The first trading session at or after a filing's acceptance time (16:00 New York close).
export function sessionAfter(iso, tradingDays) {
  const t = new Date(iso);
  const nyDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
  const nyHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(t)) % 24;
  const after = nyHour >= 16;
  return tradingDays.find((d) => (after ? d > nyDate : d >= nyDate)) ?? null;
}

export async function eventStudy(session, args) {
  const a = eventInput.parse(args);
  if (!a.events && !a.event_type) throw new Error("Give events (dates) or an event_type (earnings, insider_buys, insider_sales, 8k).");
  const symbol = a.symbol.toUpperCase(), bench = (a.benchmark ?? "SPY").toUpperCase();
  const [pre, post] = a.window ?? [-1, 5], est = a.estimation_days ?? 120, gap = 10, model = a.model ?? "market";
  // Events: dates, or filing acceptance times.
  let raw = [], source = null, eventTimes = null;
  if (a.events) raw = a.events.map((d) => ({ at: d, kind: "date", label: d }));
  else {
    const e = await resolveEntity(session, symbol);
    const since = a.since ?? daysAgo(session, 3 * 365);
    const { sub, rows } = await filings(session, e.cik, { since });
    source = `https://data.sec.gov/submissions/CIK${String(e.cik).padStart(10, "0")}.json`;
    if (a.event_type === "earnings" || a.event_type === "8k") {
      // One event a quarter for earnings: Tesla also files its deliveries under Item 2.02.
      const results = a.event_type === "earnings" ? new Set(releasesFrom(rows).map((r) => r.accession)) : null;
      for (const f of rows) if (f.form === "8-K" && f.filingDate >= since && (!results || results.has(f.accessionNumber))) raw.push({ accession: f.accessionNumber, filed: f.filingDate, kind: "filing", label: `${f.form} ${f.accessionNumber}` });
    } else {
      const code = a.event_type === "insider_buys" ? "P" : "S";
      const f4 = rows.filter((f) => f.form === "4" && f.filingDate >= since).slice(0, 120);
      await Promise.all(f4.map(async (f) => {
        try {
          const doc = parseForm4(await getText(session, `${archiveBase(e.cik, f.accessionNumber)}/${f.primaryDocument.replace(/^xsl[^/]*\//, "")}`, { maxBytes: 4 * 1024 * 1024 }));
          if (doc.rows.some((t) => t.code === code && t.kind === "stock")) raw.push({ accession: f.accessionNumber, filed: f.filingDate, kind: "filing", label: `Form 4 ${f.accessionNumber} (${doc.owners.map((o) => o.name).join("; ")})` });
        } catch { /* unreadable Form 4 skipped */ }
      }));
    }
    // Day 0 turns on before or after the 16:00 close, so the time must be right (acceptanceTimes).
    const { times, shift } = await acceptanceTimes(session, e.cik, sub, raw.map((x) => x.accession));
    for (const x of raw) x.at = times.has(x.accession) ? new Date(times.get(x.accession)).toISOString() : `${x.filed}T21:00:00.000Z`;
    eventTimes = shift == null ? "Acceptance times read from each filing's index page on EDGAR (Eastern time); the submissions file's times did not agree with them."
      : `Acceptance times from EDGAR's submissions file${shift ? `, which shifted them by ${shift > 0 ? "+" : "-"}1 US Eastern offset (4 or 5 hours); corrected` : ""}, checked against the filing index pages of the newest and oldest event.`;
  }
  if (!raw.length) throw new NotFound(`No ${a.event_type ?? "given"} events for ${symbol}${a.event_type ? ` since ${a.since ?? daysAgo(session, 3 * 365)}` : ""}.`);
  raw.sort((x, y) => String(x.at).localeCompare(String(y.at)));
  // Prices covering every estimation and event window.
  const first = String(raw[0].at).slice(0, 10), last = String(raw.at(-1).at).slice(0, 10);
  const start = new Date(Date.parse(first) - Math.ceil((est + gap - pre + 15) * 1.5) * 86400000).toISOString().slice(0, 10);
  const end = new Date(Math.min(Date.parse(last) + Math.ceil((post + 10) * 1.6) * 86400000, session.now())).toISOString().slice(0, 10);
  const [ps, pm] = await Promise.all([priceHistory(session, { symbol, start, end }), priceHistory(session, { symbol: bench, start, end })]);
  const rs = rets(ps), rm = rets(pm);
  const days = rs.dates.filter((d) => rm.byDate.has(d));
  const R = days.map((d) => rs.byDate.get(d)), M = days.map((d) => rm.byDate.get(d));
  const per = [], skipped = [];
  const seen = new Set();
  for (const ev of raw) {
    const t0 = ev.kind === "date" ? days.find((d) => d >= ev.at) : sessionAfter(ev.at, days);
    if (!t0) { skipped.push([ev.label, "no trading day after the event in the price data"]); continue; }
    if (seen.has(t0)) { skipped.push([ev.label, `same day 0 (${t0}) as an earlier event`]); continue; }
    const k = days.indexOf(t0), e0 = k + pre - gap - est, e1 = k + pre - gap;
    if (e0 < 0) { skipped.push([ev.label, `fewer than ${est} days of prices before the window`]); continue; }
    if (k + post >= days.length) { skipped.push([ev.label, "the window runs past the latest price"]); continue; }
    seen.add(t0);
    const er = R.slice(e0, e1), em = M.slice(e0, e1);
    let alpha = 0, beta = 1;
    if (model === "market") { beta = cov(em, er) / cov(em, em); alpha = mean(er) - beta * mean(em); }
    const expect = (i) => (model === "mean_adjusted" ? mean(er) : model === "market_adjusted" ? M[i] : alpha + beta * M[i]);
    const resid = er.map((r, i) => r - (model === "mean_adjusted" ? mean(er) : model === "market_adjusted" ? em[i] : alpha + beta * em[i]));
    const s = sd(resid);
    const ar = [];
    for (let i = k + pre; i <= k + post; i++) ar.push(R[i] - expect(i));
    const car = ar.reduce((x, y) => x + y, 0);
    per.push({ label: ev.label, at: ev.at, t0, car, ar0: ar[-pre], ar, t: car / (s * Math.sqrt(ar.length)), beta: model === "market" ? beta : null });
  }
  if (!per.length) throw new NotFound(`No event could be measured: ${skipped.map((x) => x[1]).join("; ")}.`);
  const cars = per.map((p) => p.car);
  const n = cars.length, mCar = mean(cars), sCar = n > 1 ? sd(cars) : null;
  const tStat = n > 1 && sCar > 0 ? mCar / (sCar / Math.sqrt(n)) : null;
  const sorted = [...cars].sort((x, y) => x - y);
  const path = [];
  for (let j = 0; j <= post - pre; j++) { const v = mean(per.map((p) => p.ar[j])); path.push([pre + j, round(v, 6), round((path.at(-1)?.[2] ?? 0) + v, 6)]); }
  return {
    symbol, benchmark: bench, model, window: [pre, post], estimation_days: est, event_type: a.event_type ?? "dates",
    summary: { events: n, mean_car: round(mCar, 6), median_car: round(n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2, 6), positive_share: round(cars.filter((c) => c > 0).length / n, 4), t_stat: round(tStat, 4), p_value: tStat == null ? null : round(tTwoSided(tStat, n - 1), 6), df: n - 1 },
    average_path: { columns: ["day", "mean_ar", "mean_car"], rows: path },
    events: { columns: ["event", "event_time", "day0", "car", "ar_day0", "t_stat", "beta"], rows: per.map((p) => [p.label, p.at, p.t0, round(p.car, 6), round(p.ar0, 6), round(p.t, 3), round(p.beta, 3)]) },
    ...(skipped.length ? { skipped: { columns: ["event", "reason"], rows: skipped.slice(0, 20) } } : {}),
    meaning: "Abnormal return = actual return minus the model's expected return; CAR sums it over the window. t_stat and p_value test whether the mean CAR across events differs from zero (cross-sectional t test). Returns are simple daily returns of adjusted closes. day0 is the first session that could react to a filing: its own day if accepted before the 4 p.m. New York close on a trading day, else the next session (event_time is UTC); dates passed in events are used as day0 as given.",
    ...(source ? { sources: [source] } : {}),
    ...(eventTimes ? { event_times: eventTimes } : {}),
    price_source: ps.source,
    limits: [...LIMITS, "Daily data; events on nearby days overlap and are not adjusted for; a few events give a weak test; a significant average is not a trading rule after costs."],
  };
}

// ---------------------------------------------------------------------------------------------
// mentions_trend
// ---------------------------------------------------------------------------------------------
export const trendInput = z.object({
  query: z.string().min(1).max(200).describe("Words or a quoted phrase, for example \"\\\"artificial intelligence\\\"\" or tariffs."),
  forms: z.array(z.string().min(1).max(20)).max(10).optional().describe("Form types; default [\"10-K\", \"10-Q\"]."),
  start: DATE.optional().describe("First day; default three years ago."),
  end: DATE.optional().describe("Last day; default today."),
  by: z.enum(["month", "quarter", "year"]).optional().describe("Bucket size; default quarter."),
  company: z.string().min(1).max(120).optional().describe("Only this filer."),
}).strict();

function buckets(start, end, by) {
  const out = [];
  let y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7));
  const step = by === "month" ? 1 : by === "quarter" ? 3 : 12;
  if (by === "quarter") m = Math.floor((m - 1) / 3) * 3 + 1;
  if (by === "year") m = 1;
  while (true) {
    const s = `${y}-${String(m).padStart(2, "0")}-01`;
    if (s > end) break;
    let ny = y, nm = m + step;
    while (nm > 12) { nm -= 12; ny++; }
    const e = new Date(Date.UTC(ny, nm - 1, 1) - 86400000).toISOString().slice(0, 10);
    out.push([by === "month" ? s.slice(0, 7) : by === "quarter" ? `${y}Q${(m + 2) / 3}` : String(y), s < start ? start : s, e > end ? end : e]);
    y = ny; m = nm;
  }
  return out;
}

export async function mentionsTrend(session, args) {
  const a = trendInput.parse(args);
  const start = a.start ?? daysAgo(session, 3 * 365), end = a.end ?? today(session), by = a.by ?? "quarter";
  const periods = buckets(start, end, by);
  if (periods.length > 48) throw new Error(`${periods.length} ${by}s is too many; at most 48 (use a larger bucket or a shorter range).`);
  const forms = (a.forms ?? ["10-K", "10-Q"]).map((f) => f.toUpperCase());
  let cik = null;
  if (a.company) cik = (await resolveEntity(session, a.company)).cik;
  const rows = await Promise.all(periods.map(async ([label, s, e]) => {
    const p = new URLSearchParams({ q: a.query, forms: forms.join(","), dateRange: "custom", startdt: s, enddt: e });
    if (cik) p.set("ciks", String(cik).padStart(10, "0"));
    const r = await getJson(session, `https://efts.sec.gov/LATEST/search-index?${p}`);
    const total = r?.hits?.total ?? {};
    const filers = new Set((r?.hits?.hits ?? []).map((h) => (h._source?.ciks ?? [])[0]));
    return [label, s, e, total.value ?? 0, total.relation === "gte", filers.size];
  }));
  const firstFull = rows.find((r) => r[3] > 0), lastRow = rows.at(-1);
  return {
    query: a.query, forms, by,
    columns: ["period", "start", "end", "documents", "at_least", "filers_in_first_100"],
    rows,
    change: firstFull && lastRow ? { from: firstFull[0], to: lastRow[0], ratio: firstFull[3] ? round(lastRow[3] / firstFull[3], 3) : null } : null,
    meaning: "documents counts filing documents that contain the words (exhibits count separately); at_least marks counts capped by the search engine; the latest period may be incomplete.",
    sources: ["https://efts.sec.gov/LATEST/search-index (EDGAR full-text search, filings from 2001)"],
    limits: [...LIMITS, "Counts follow filing volume too: more filings in a quarter (10-K season) means more matches; compare like quarters or use by: year."],
  };
}

// One company's latest fiscal year from its own facts, in dollars at the latest rate (growth and margins
// are unmoved by that): what comps uses for a company the US-GAAP dollar frames do not hold.
export async function fiscalRow(session, query) {
  const e = await resolveEntity(session, query);
  const [sub, cf] = await Promise.all([submissions(session, e.cik), getJson(session, `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(e.cik).padStart(10, "0")}.json`, { maxBytes: 96 * 1024 * 1024 })]);
  const book = factBook(cf), defs = book.taxonomy === "ifrs-full" ? IFRS_METRICS : METRICS;
  const series = Object.fromEntries(Object.entries(defs).map(([k, def]) => [k, annual(book.facts, def, book.currency)]));
  const all = [...new Set([...series.revenue.keys(), ...series.net_income.keys()])].sort(), end = all.at(-1);
  if (!end) throw new NotFound(`${sub.name ?? query} has no annual revenue or profit in its XBRL.`);
  const fx = await usdPer(session, book.currency);
  const scale = fx?.rate ?? 1, m = {}, tag = {}, prev = all.at(-2);
  for (const k of Object.keys(defs)) { const c = choose(defs[k], series[k].get(end)?.byTag); m[k] = c?.val == null ? null : c.val * scale; tag[k] = c?.tag; }
  for (const k of ["revenue", "net_income"]) { const c = prev ? choose(defs[k], series[k].get(prev)?.byTag, tag[k]) : null; m[`${k}@prev`] = c?.val == null ? null : c.val * scale; }
  return { cik: Number(e.cik), name: sub.name, ticker: sub.tickers?.[0] ?? e.ticker ?? null, sic: sub.sic, period_end: end, currency: book.currency, standard: book.taxonomy === "ifrs-full" ? "IFRS" : "US GAAP", converted: book.currency !== "USD" && fx?.rate ? { pair: fx.pair, rate: round(fx.rate, 6), date: fx.date } : null, get: (k) => (DERIVED[k] ? round(DERIVED[k].f(m), 6) : m[k] ?? null) };
}
