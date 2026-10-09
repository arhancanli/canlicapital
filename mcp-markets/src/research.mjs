// Research across the market, not one company at a time: screens over every US filer (SEC XBRL
// frames), a full company report in one call, event studies on prices around filings, and how often
// a phrase appears in filings over time. All from public sources; every result names them.
import { z } from "zod";

import { parseForm4 } from "./forms.mjs";
import { archiveBase, filings, getJson, getText, NotFound, resolveEntity, submissions } from "./sources.mjs";
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
export const METRICS = Object.freeze({
  revenue: { kind: D, unit: "USD", tags: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"] },
  net_income: { kind: D, unit: "USD", tags: ["NetIncomeLoss", "ProfitLoss"] },
  operating_income: { kind: D, unit: "USD", tags: ["OperatingIncomeLoss"] },
  gross_profit: { kind: D, unit: "USD", tags: ["GrossProfit"] },
  eps_diluted: { kind: D, unit: "USD/shares", tags: ["EarningsPerShareDiluted"] },
  // R&D tags are alternative versions of one line, and filers use them unevenly (J&J tags a $109M
  // item as ResearchAndDevelopmentExpense and its $14.7B total under ...ExcludingAcquiredInProcessCost
  // for 2025), so the largest is taken.
  rd_expense: { kind: D, unit: "USD", tags: ["ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"], pick: "max" },
  operating_cash_flow: { kind: D, unit: "USD", tags: ["NetCashProvidedByUsedInOperatingActivities"] },
  capex: { kind: D, unit: "USD", tags: ["PaymentsToAcquirePropertyPlantAndEquipment"] },
  assets: { kind: I, unit: "USD", tags: ["Assets"] },
  liabilities: { kind: I, unit: "USD", tags: ["Liabilities"] },
  equity: { kind: I, unit: "USD", tags: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"] },
  cash: { kind: I, unit: "USD", tags: ["CashAndCashEquivalentsAtCarryingValue"] },
  long_term_debt: { kind: I, unit: "USD", tags: ["LongTermDebtNoncurrent", "LongTermDebt"] },
});
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
// failing a check is held out of the results unless include_suspect is set, and listed apart.
const CHECKS = [
  ["net_margin", (v) => Math.abs(v) > 10, "net income more than 10 times revenue"],
  ["operating_margin", (v) => Math.abs(v) > 10, "operating income more than 10 times revenue"],
  ["gross_margin", (v) => v > 1.0001 || v < -10, "gross profit above revenue"],
  ["fcf_margin", (v) => Math.abs(v) > 10, "free cash flow more than 10 times revenue"],
  ["rd_intensity", (v) => v > 50 || v < 0, "R&D more than 50 times revenue"],
  ["roa", (v) => Math.abs(v) > 3, "net income more than 3 times assets"],
  ["revenue_growth", (v) => v > 1000, "revenue up more than 1,000-fold"],
];
function suspect(m) {
  const out = [];
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

// SEC writes a ratio unit as "USD-per-shares" in frame URLs.
export const frameUrl = (tax, tag, unit, frame) => `https://data.sec.gov/api/xbrl/frames/${tax}/${tag}/${unit.replace("/", "-per-")}/${frame}.json`;
async function frame(session, tag, unit, frm, tax = "us-gaap") {
  try { return await getJson(session, frameUrl(tax, tag, unit, frm), { maxBytes: 64 * 1024 * 1024 }); } catch (err) { if (err instanceof NotFound) return null; throw err; }
}

// One metric for every filer at one frame: cik -> { val, end, accn, tag }.
async function metricFrame(session, name, frm) {
  const def = METRICS[name];
  const frames = await Promise.all(def.tags.map((tag) => frame(session, tag, def.unit, frm)));
  const out = new Map(), urls = [];
  frames.forEach((f, i) => {
    if (!f) return;
    urls.push(frameUrl("us-gaap", def.tags[i], def.unit, frm));
    for (const r of f.data ?? []) {
      const cur = out.get(r.cik);
      if (!cur || (def.pick === "max" && r.val > cur.val)) out.set(r.cik, { val: r.val, end: r.end, accn: r.accn, tag: def.tags[i], name: r.entityName });
    }
  });
  return { values: out, urls };
}

async function listedCompanies(session) {
  const t = await getJson(session, "https://www.sec.gov/files/company_tickers_exchange.json");
  const by = new Map();
  for (const [cik, name, ticker, exchange] of t.data ?? []) if (!by.has(cik)) by.set(cik, { name, ticker, exchange });
  return by;
}

// ---------------------------------------------------------------------------------------------
// screen_companies
// ---------------------------------------------------------------------------------------------
const metricName = z.string().refine((m) => ALL_METRICS.includes(m) || VALUATION.includes(m), { message: `a metric: ${ALL_METRICS.join(", ")}` });
export const screenInput = z.object({
  period: z.string().max(12).optional().describe("FY2025 (each company's fiscal year that best overlaps calendar 2025; default the last complete year) or a quarter such as CY2026Q2."),
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

export async function screenCompanies(session, args) {
  const a = screenInput.parse(args);
  const year = Number(today(session).slice(0, 4)) - 1;
  const per = parsePeriod(a.period ?? `FY${year}`);
  const filters = a.filters ?? [];
  const sortBy = a.sort_by ?? filters[0]?.metric ?? "revenue";
  if (VALUATION.includes(sortBy) || filters.some((f) => VALUATION.includes(f.metric))) throw new Error("Valuation metrics need a price per company, so they apply to the returned rows only: filter and sort on fundamentals, and set valuation: true.");
  const shown = [...new Set([...filters.map((f) => f.metric), sortBy, ...(a.columns ?? []).filter((c) => !VALUATION.includes(c))])];
  // Base metrics needed, with @prev for growth.
  const base = new Set(["revenue", "net_income"]);
  for (const m of shown) for (const n of DERIVED[m]?.needs ?? [m]) base.add(n);
  const needed = [...base].map((n) => (n.endsWith("@prev") ? { key: n, metric: n.slice(0, -5), frame: per.prev } : { key: n, metric: n, frame: METRICS[n].kind === I ? per.instant : per.duration }));
  const [listed, ...frames] = await Promise.all([listedCompanies(session), ...needed.map((n) => metricFrame(session, n.metric, n.frame))]);
  const venues = new Set(a.exchanges ?? ["NYSE", "Nasdaq"]);
  const any = venues.has("all");
  // Universe: filers with the sort metric's inputs (or the first filter's) in this period.
  const rows = new Map();
  needed.forEach((n, i) => {
    for (const [cik, v] of frames[i].values) {
      const co = listed.get(cik);
      if (!any && (!co || !venues.has(co.exchange))) continue;
      const r = rows.get(cik) ?? { cik, name: co?.name ?? v.name, ticker: co?.ticker ?? null, exchange: co?.exchange ?? null, m: {}, end: null };
      r.m[n.key] = v.val;
      if (!n.key.endsWith("@prev") && METRICS[n.metric].kind === D) r.end = r.end ?? v.end;
      rows.set(cik, r);
    }
  });
  const value = (r, metric) => (DERIVED[metric] ? DERIVED[metric].f(r.m) : r.m[metric] ?? null);
  const test = (v, f) => v != null && (f.op === ">" ? v > f.value : f.op === ">=" ? v >= f.value : f.op === "<" ? v < f.value : f.op === "<=" ? v <= f.value : Array.isArray(f.value) && v >= f.value[0] && v <= f.value[1]);
  const universe = [...rows.values()].filter((r) => value(r, sortBy) != null);
  const meets = universe.filter((r) => filters.every((f) => test(value(r, f.metric), f)));
  const held = a.include_suspect ? [] : meets.filter((r) => suspect(r.m).length);
  const passing = a.include_suspect ? meets : meets.filter((r) => !suspect(r.m).length);
  const dir = (a.order ?? "desc") === "desc" ? -1 : 1;
  passing.sort((x, y) => dir * (value(x, sortBy) - value(y, sortBy)) || x.cik - y.cik);
  const top = passing.slice(0, a.limit ?? 25);
  const out = {
    period: per.label,
    universe: universe.length, matched: passing.length,
    columns: ["ticker", "name", "cik", "exchange", "period_end", ...shown],
    rows: top.map((r) => [r.ticker, r.name, r.cik, r.exchange, r.end, ...shown.map((m) => round(value(r, m), DERIVED[m] ? 6 : 4))]),
    ...(held.length ? { held_out: { reason: "failed a plausibility check (usually a tagging slip in the filing); pass include_suspect: true to keep them", columns: ["ticker", "name", "cik", "checks"], rows: held.slice(0, 10).map((r) => [r.ticker, r.name, r.cik, suspect(r.m).join("; ")]), count: held.length } } : {}),
  };
  if (a.valuation && top.length) {
    const val = await valuationFor(session, top.slice(0, 50), per);
    out.valuation = { columns: ["ticker", ...VALUATION, "price_date", "shares_basis"], rows: top.slice(0, 50).map((r) => [r.ticker, ...VALUATION.map((k) => val.get(r.cik)?.[k] ?? null), val.get(r.cik)?.price_date ?? null, val.get(r.cik)?.shares_basis ?? null]) };
  }
  out.definitions = Object.fromEntries(shown.map((m) => [m, DERIVED[m] ? `derived from ${DERIVED[m].needs.join(", ")}` : `XBRL ${METRICS[m].tags.join(" | ")} (${METRICS[m].pick === "max" ? "the largest" : "the first"} a company reports), ${METRICS[m].unit}`]));
  out.sources = [...new Set(frames.flatMap((f) => f.urls))];
  out.limits = [...LIMITS, "XBRL frames give one value per filer for the fiscal period that best overlaps the calendar period, as most recently filed; filers tag line items differently, so a missing or unusual tag drops or skews a company. Check a shortlisted company's filing before relying on a figure."];
  return out;
}

// Latest close, market cap, P/E, P/S and FCF yield for up to 50 companies.
async function valuationFor(session, rows, per) {
  const y = Number(per.duration.slice(2, 6));
  const shareFrames = await Promise.all([`CY${y}Q4I`, `CY${y + 1}Q1I`, `CY${y + 1}Q2I`].map((f) => frame(session, "EntityCommonStockSharesOutstanding", "shares", f, "dei")));
  const shares = new Map();
  for (const f of shareFrames) for (const r of f?.data ?? []) { const cur = shares.get(r.cik); if (!cur || r.end > cur.end) shares.set(r.cik, { val: r.val, end: r.end, basis: "cover page" }); }
  // Companies with several share classes report cover-page counts per class, which frames leave
  // out; the period's diluted weighted-average share count stands in for them.
  const diluted = await frame(session, "WeightedAverageNumberOfDilutedSharesOutstanding", "shares", per.duration);
  for (const r of diluted?.data ?? []) if (!shares.has(r.cik)) shares.set(r.cik, { val: r.val, end: r.end, basis: "diluted weighted average" });
  const fund = await Promise.all(["revenue", "net_income", "eps_diluted", "operating_cash_flow", "capex"].map((m) => metricFrame(session, m, per.duration)));
  const [rev, , eps, ocf, capex] = fund.map((f) => f.values);
  const out = new Map();
  const queue = [...rows];
  const worker = async () => {
    for (let r; (r = queue.shift());) {
      if (!r.ticker) continue;
      try {
        const p = await priceHistory(session, { symbol: r.ticker, start: daysAgo(session, 10), end: today(session) });
        const price = p.close.at(-1), sh = shares.get(r.cik)?.val, mcap = sh ? price * sh : null;
        const e = eps.get(r.cik)?.val, rv = rev.get(r.cik)?.val, fcf = ocf.get(r.cik) ? ocf.get(r.cik).val - (capex.get(r.cik)?.val ?? 0) : null;
        out.set(r.cik, { price, price_date: p.dates.at(-1), shares_basis: shares.get(r.cik)?.basis ?? null, market_cap: mcap ? Math.round(mcap) : null, pe: e > 0 ? round(price / e, 2) : null, ps: mcap && rv > 0 ? round(mcap / rv, 2) : null, fcf_yield: mcap && fcf != null ? round(fcf / mcap, 4) : null });
      } catch { /* no price for this ticker: its valuation stays empty */ }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return out;
}

// ---------------------------------------------------------------------------------------------
// company_report
// ---------------------------------------------------------------------------------------------
export const reportInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker (AAPL), CIK (320193) or name (Apple)."),
  years: z.number().int().min(1).max(15).optional().describe("Fiscal years of financials; default 5."),
}).strict();

// Fiscal-year values of one concept from companyfacts: end date -> { val, filed, restated, tag }.
// Companies change tags over the years (Apple's revenue moved from SalesRevenueNet to
// RevenueFromContractWithCustomerExcludingAssessedTax), so the tag is chosen per year: the first in
// priority order that has a value for that fiscal year.
function annual(facts, def) {
  const perTag = def.tags.map((tag) => {
    const out = new Map();
    for (const x of facts?.[tag]?.units?.[def.unit] ?? []) {
      if (!/^10-K/.test(x.form ?? "")) continue;
      if (def.kind === D) {
        if (!x.start) continue;
        const days = (Date.parse(x.end) - Date.parse(x.start)) / 86400000;
        if (days < 330 || days > 400) continue;
      }
      const cur = out.get(x.end);
      if (!cur) out.set(x.end, { val: x.val, filed: x.filed, first: x.val, tag });
      else { if (x.filed >= cur.filed) { cur.val = x.val; cur.filed = x.filed; } if (x.val !== cur.first) cur.restated = true; }
    }
    return out;
  });
  const merged = new Map();
  for (const end of new Set(perTag.flatMap((m) => [...m.keys()]))) {
    const have = perTag.filter((m) => m.has(end)).map((m) => m.get(end));
    merged.set(end, def.pick === "max" ? have.reduce((a, b) => (b.val > a.val ? b : a)) : have[0]);
  }
  return merged;
}

export async function companyReport(session, args) {
  const a = reportInput.parse(args);
  const e = await resolveEntity(session, a.company);
  const [sub, cf] = await Promise.all([submissions(session, e.cik), getJson(session, `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(e.cik).padStart(10, "0")}.json`, { maxBytes: 64 * 1024 * 1024 }).catch((err) => { if (err instanceof NotFound) return null; throw err; })]);
  const g = cf?.facts?.["us-gaap"] ?? {};
  const series = Object.fromEntries(Object.entries(METRICS).map(([k, def]) => [k, annual(g, def)]));
  const ends = [...new Set([...series.revenue.keys(), ...series.net_income.keys()])].sort().slice(-(a.years ?? 5));
  const yearsRows = ends.map((end) => {
    const m = Object.fromEntries(Object.keys(METRICS).map((k) => [k, series[k].get(end)?.val ?? null]));
    const prevEnd = [...series.revenue.keys()].sort().filter((d) => d < end).at(-1);
    m["revenue@prev"] = prevEnd ? series.revenue.get(prevEnd)?.val ?? null : null;
    m["net_income@prev"] = prevEnd ? series.net_income.get(prevEnd)?.val ?? null : null;
    return { end, m, restated: Object.keys(METRICS).filter((k) => series[k].get(end)?.restated) };
  });
  const finCols = ["revenue", "revenue_growth", "gross_margin", "operating_margin", "net_income", "net_margin", "eps_diluted", "operating_cash_flow", "free_cash_flow", "roe", "liabilities_to_equity", "cash"];
  const val = (m, k) => (DERIVED[k] ? round(DERIVED[k].f(m), 6) : m[k]);
  const ticker = sub.tickers?.[0] ?? e.ticker;
  const report = {
    company: { cik: e.cik, name: sub.name, ticker, exchange: sub.exchanges?.[0] ?? null, industry: sub.sicDescription || null, fiscal_year_end: sub.fiscalYearEnd ? `${sub.fiscalYearEnd.slice(0, 2)}-${sub.fiscalYearEnd.slice(2)}` : null, state_of_incorporation: sub.stateOfIncorporation || null },
    financials: { basis: "fiscal years from 10-K XBRL facts, latest filed value (restated where a later 10-K changed it)", columns: ["fiscal_year_end", ...finCols, "restated"], rows: yearsRows.map((y) => [y.end, ...finCols.map((k) => val(y.m, k)), y.restated.length ? y.restated.join(",") : null]) },
  };
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
      const price = p.close.at(-1), mcap = sh ? price * sh.val : null;
      const fcf = DERIVED.free_cash_flow.f(last);
      report.market = {
        price, price_date: p.dates.at(-1), total_return_1y: p.change?.total_return ?? null,
        volatility_1y: round(sd(r.values) * Math.sqrt(252), 4), max_drawdown_1y: round(mdd, 4), beta_1y_vs_spy: round(beta, 3),
        high_52w: Math.max(...p.high.filter((v) => v != null)), low_52w: Math.min(...p.low.filter((v) => v != null)),
        shares_outstanding: sh?.val ?? null, shares_as_of: sh?.end ?? null, market_cap: mcap ? Math.round(mcap) : null,
        pe: last.eps_diluted > 0 ? round(price / last.eps_diluted, 2) : null, ps: mcap && last.revenue > 0 ? round(mcap / last.revenue, 2) : null, fcf_yield: mcap && fcf != null ? round(fcf / mcap, 4) : null,
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
  const keep = new Set(["10-K", "10-Q", "8-K", "DEF 14A", "10-K/A", "10-Q/A", "S-1", "S-3", "SC 13D", "SC 13G"]);
  report.recent_filings = { columns: ["filed", "form", "items", "url"], rows: (rec.form ?? []).map((f, i) => [rec.filingDate[i], f, rec.items[i] || null, `${archiveBase(e.cik, rec.accessionNumber[i])}/${String(rec.primaryDocument[i]).replace(/^xsl[^/]*\//, "")}`]).filter((r) => keep.has(r[1])).slice(0, 8) };
  report.sources = [`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(e.cik).padStart(10, "0")}.json`, `https://data.sec.gov/submissions/CIK${String(e.cik).padStart(10, "0")}.json`];
  report.limits = [...LIMITS, "Financials are XBRL facts as tagged by the company (the first of several revenue tags it uses); market figures use the latest close and the latest cover-page share count."];
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
function sessionAfter(iso, tradingDays) {
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
  let raw = [], source = null;
  if (a.events) raw = a.events.map((d) => ({ at: d, kind: "date", label: d }));
  else {
    const e = await resolveEntity(session, symbol);
    const since = a.since ?? daysAgo(session, 3 * 365);
    const { rows } = await filings(session, e.cik, { since });
    source = `https://data.sec.gov/submissions/CIK${String(e.cik).padStart(10, "0")}.json`;
    const sub = await submissions(session, e.cik);
    const acc = new Map();
    const r = sub.filings?.recent ?? {};
    (r.accessionNumber ?? []).forEach((x, i) => acc.set(x, r.acceptanceDateTime?.[i]));
    if (a.event_type === "earnings" || a.event_type === "8k") {
      for (const f of rows) if (f.form === "8-K" && f.filingDate >= since && (a.event_type === "8k" || String(f.items ?? "").split(",").includes("2.02"))) raw.push({ at: acc.get(f.accessionNumber) ?? `${f.filingDate}T21:00:00.000Z`, kind: "filing", label: `${f.form} ${f.accessionNumber}` });
    } else {
      const code = a.event_type === "insider_buys" ? "P" : "S";
      const f4 = rows.filter((f) => f.form === "4" && f.filingDate >= since).slice(0, 120);
      await Promise.all(f4.map(async (f) => {
        try {
          const doc = parseForm4(await getText(session, `${archiveBase(e.cik, f.accessionNumber)}/${f.primaryDocument.replace(/^xsl[^/]*\//, "")}`, { maxBytes: 4 * 1024 * 1024 }));
          if (doc.rows.some((t) => t.code === code && t.kind === "stock")) raw.push({ at: acc.get(f.accessionNumber) ?? `${f.filingDate}T21:00:00.000Z`, kind: "filing", label: `Form 4 ${f.accessionNumber} (${doc.owners.map((o) => o.name).join("; ")})` });
        } catch { /* unreadable Form 4 skipped */ }
      }));
    }
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
    meaning: "Abnormal return = actual return minus the model's expected return; CAR sums it over the window. t_stat and p_value test whether the mean CAR across events differs from zero (cross-sectional t test). Returns are simple daily returns of adjusted closes.",
    ...(source ? { sources: [source] } : {}),
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
