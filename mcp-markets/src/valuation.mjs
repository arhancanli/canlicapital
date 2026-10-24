// Reverse DCF: the yearly free-cash-flow growth the share price implies. Instead of guessing growth
// to get a value, it takes the market's value (equity at the latest close plus net debt) and solves
// for the growth over the next years that a discounted cash flow model needs to reach it. Every
// input is read from the company's annual XBRL and named with its tag; the price is the last close.
import { z } from "zod";

import { getJson, resolveEntity, tickerTable } from "./sources.mjs";
import { priceHistory } from "./tools.mjs";

export const reverseDcfInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  ticker: z.string().min(1).max(12).regex(/^[A-Za-z0-9.\-]+$/).optional().describe("The ticker to price, when company is a CIK without one (a predecessor filer)."),
  discount_rate: z.number().min(0.03).max(0.25).optional().describe("Yearly discount rate (cost of capital); default 0.09."),
  terminal_growth: z.number().min(-0.02).max(0.05).optional().describe("Growth for ever after the forecast years; default 0.025."),
  years: z.number().int().min(3).max(20).optional().describe("Forecast years of the implied growth; default 10."),
  base: z.enum(["latest", "average_3y"]).optional().describe("Base free cash flow: the latest year (default) or the last three years' average, which smooths an unusual year."),
}).strict();

const ANNUAL = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const days = (a, b) => (Date.parse(a) - Date.parse(b)) / 86400000;
const TAGS = {
  cfo: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  investments: ["MarketableSecuritiesCurrent", "ShortTermInvestments", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"],
  debt_current: ["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent", "DebtCurrent"],
  debt_noncurrent: ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"],
  debt_total: ["LongTermDebt", "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities"],
  paper: ["CommercialPaper", "ShortTermBorrowings"],
};
const FLOW = new Set(["cfo", "capex", "revenue"]);
const round = (x, d = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

// Annual values of one measure by fiscal-year end, the latest filing's figure for each, from the tag
// the company reports most recently (companies move between revenue tags, for one).
export function annualSeries(facts, name) {
  let best = null;
  for (const tag of TAGS[name]) {
    const rows = (facts[tag]?.units?.USD ?? []).filter((x) => ANNUAL.has(x.form) && (FLOW.has(name) ? x.start && days(x.end, x.start) >= 350 && days(x.end, x.start) <= 380 : !x.start));
    if (!rows.length) continue;
    const by = new Map();
    for (const r of rows) if (!by.has(r.end) || r.filed > by.get(r.end).filed) by.set(r.end, r);
    const values = new Map([...by].sort((x, y) => x[0].localeCompare(y[0])).map(([end, r]) => [end, r.val]));
    const last = [...values.keys()].at(-1);
    if (!best || last > best.last || (last === best.last && values.size > best.values.size)) best = { tag, values, last };
  }
  return best && { tag: best.tag, values: best.values };
}

// Present value per unit of base cash flow: growth g for n years, then terminal growth tg for ever.
export function dcfMultiple(g, r, tg, n) {
  let pv = 0, cf = 1;
  for (let t = 1; t <= n; t += 1) { cf *= 1 + g; pv += cf / (1 + r) ** t; }
  return pv + (cf * (1 + tg)) / (r - tg) / (1 + r) ** n;
}

// The growth g at which base * dcfMultiple(g) equals the target value (it rises with g): bisection.
export function impliedGrowth(target, base, r, tg, n) {
  if (!(base > 0) || !(target > 0) || r <= tg) return null;
  let lo = -0.5, hi = 1.5;
  if (base * dcfMultiple(hi, r, tg, n) < target) return { growth: null, above: hi };
  if (base * dcfMultiple(lo, r, tg, n) > target) return { growth: null, below: lo };
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (base * dcfMultiple(mid, r, tg, n) < target) lo = mid; else hi = mid; }
  return { growth: (lo + hi) / 2 };
}

const cagr = (series, n) => {
  const v = [...series.values()];
  if (v.length < n + 1) return null;
  const a = v.at(-1 - n), b = v.at(-1);
  return a > 0 && b > 0 ? (b / a) ** (1 / n) - 1 : null;
};

export async function reverseDcf(session, args) {
  const a = reverseDcfInput.parse(args);
  const r = a.discount_rate ?? 0.09, tg = a.terminal_growth ?? 0.025, n = a.years ?? 10;
  if (r <= tg) throw new Error("discount_rate must be above terminal_growth.");
  const e = await resolveEntity(session, a.company);
  const symbol = a.ticker?.toUpperCase() ?? e.ticker ?? Object.values(await tickerTable(session)).find((t) => t.cik_str === e.cik)?.ticker;
  if (!symbol) throw new Error(`${a.company} has no listed ticker to price; pass ticker.`);
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(e.cik).padStart(10, "0")}.json`;
  const cf = await getJson(session, url, { maxBytes: 96 * 1024 * 1024 });
  const f = cf.facts?.["us-gaap"] ?? {};
  const cfo = annualSeries(f, "cfo"), capex = annualSeries(f, "capex");
  if (!cfo) throw new Error(`${cf.entityName ?? a.company} (CIK ${e.cik}) tags no annual operating cash flow in its XBRL; a newly formed holding company files under a new CIK, so pass the CIK of the company that filed the earlier 10-Ks.`);
  const fcf = new Map();
  for (const [end, v] of cfo.values) fcf.set(end, v - (capex?.values.get(end) ?? 0));
  const ends = [...fcf.keys()], end = ends.at(-1);
  const base = a.base === "average_3y" && ends.length >= 3 ? ends.slice(-3).reduce((t, k) => t + fcf.get(k), 0) / 3 : fcf.get(end);
  const latest = (name) => { const s = annualSeries(f, name); return s && s.values.has(end) ? { tag: s.tag, val: s.values.get(end) } : null; };
  const sharesFacts = (cf.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? []).sort((x, y) => (x.end < y.end ? 1 : -1));
  const shares = sharesFacts[0]?.val ?? null;
  const today = new Date(session.now()).toISOString().slice(0, 10);
  const px = await priceHistory(session, { symbol, start: new Date(session.now() - 12 * 86400000).toISOString().slice(0, 10), end: today, adjusted: false });
  const price = px?.close?.at(-1) ?? null, priceDate = px?.dates?.at(-1) ?? px?.date?.at(-1) ?? null;
  if (!price || !shares) throw new Error(`${cf.entityName ?? a.company}: ${!price ? "no recent price" : "no shares outstanding on its cover page"}.`);
  const cash = latest("cash"), inv = latest("investments"), dc = latest("debt_current"), dn = latest("debt_noncurrent"), dt = latest("debt_total"), cp = latest("paper");
  // Borrowings as the company tags them: current plus noncurrent when it splits them, else its total
  // long-term debt (which includes the current part), plus commercial paper.
  // DebtCurrent already holds short-term borrowings, so they are not added to it again.
  const short = dc?.tag === "DebtCurrent" ? null : cp;
  const debt = (dn ? (dc?.val ?? 0) + dn.val : dt ? dt.val : dc?.val ?? 0) + (short?.val ?? 0);
  const liquid = (cash?.val ?? 0) + (inv?.val ?? 0);
  const equity = price * shares, ev = equity + debt - liquid;
  const solve = (rr, tt) => impliedGrowth(ev, base, rr, tt, n);
  const main = solve(r, tg);
  const rates = [r - 0.02, r - 0.01, r, r + 0.01, r + 0.02].filter((x) => x > tg + 0.005), terms = [tg - 0.005, tg, tg + 0.005];
  const revenue = annualSeries(f, "revenue");
  const yr = (m) => (m.growth == null ? (m.above ? `above ${m.above}` : m.below != null ? `below ${m.below}` : null) : round(m.growth));
  return {
    company: { cik: e.cik, name: cf.entityName ?? e.name, ticker: symbol }, fiscal_year_end: end,
    implied_growth: main ? yr(main) : null,
    reading: main?.growth != null ? `At ${price} a share, the market's enterprise value needs free cash flow to grow about ${(main.growth * 100).toFixed(1)}% a year for ${n} years, then ${(tg * 100).toFixed(1)}% for ever, discounted at ${(r * 100).toFixed(1)}%.` : base > 0 ? "The implied growth is outside -50% to 150% a year." : "Free cash flow was not positive in the latest year, so no growth rate makes the model reach the market's value; use another base year or a revenue-based method.",
    history: {
      fcf_cagr_3y: round(cagr(fcf, 3)), fcf_cagr_5y: round(cagr(fcf, 5)), revenue_cagr_3y: revenue ? round(cagr(revenue.values, 3)) : null, revenue_cagr_5y: revenue ? round(cagr(revenue.values, 5)) : null,
      free_cash_flow: { columns: ["fiscal_year_end", "operating_cash_flow", "capex", "free_cash_flow"], rows: [...fcf].slice(-6).map(([k, v]) => [k, cfo.values.get(k), capex?.values.get(k) ?? null, v]) },
    },
    sensitivity: { note: "Implied yearly growth for each discount rate (rows) and terminal growth (columns).", columns: ["discount_rate", ...terms.map((t) => `terminal_${round(t, 3)}`)], rows: rates.map((rr) => [round(rr, 3), ...terms.map((tt) => { const m = solve(rr, tt); return m ? yr(m) : null; })]) },
    inputs: {
      price, price_date: priceDate, shares_outstanding: shares, equity_value: round(equity, 0), debt: round(debt, 0), cash_and_investments: round(liquid, 0), enterprise_value: round(ev, 0), base_free_cash_flow: round(base, 0), base: a.base ?? "latest",
      discount_rate: r, terminal_growth: tg, years: n,
      tags: { operating_cash_flow: cfo.tag, capex: capex?.tag ?? "not tagged: taken as 0", cash: cash?.tag ?? null, investments: inv?.tag ?? null, debt: (dn ? [dc?.tag, dn.tag] : dt ? [dt.tag] : [dc?.tag]).concat(short ? [short.tag] : []).filter(Boolean), shares: "dei:EntityCommonStockSharesOutstanding" },
    },
    sources: [url, ...(px?.source ? [px.source] : [])],
    meaning: "A reverse DCF asks what the price already assumes. Compare the implied growth with the company's own history and its industry: an implied rate far above what it has done is a demanding price, far below is a cheap one, if the cash flows and the discount rate are right.",
    limits: ["Free cash flow here is operating cash flow less capital spending, before share-based pay and acquisitions; one year's figure is the base, so an unusual year moves the result.", "Debt is the tagged borrowings; leases, pensions and minority interests are not added.", "Not investment advice."],
  };
}
