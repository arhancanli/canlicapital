// Shareholder returns: what a company has paid its owners, year by year, from its own annual XBRL.
// Dividends per share and in total, buybacks and new shares issued, the share count, and those set
// against earnings and free cash flow; with the last close, the dividend yield and the shareholder
// yield (dividends plus net buybacks over the market value). Each figure names its tag.
import { z } from "zod";

import { marketValue } from "./listing.mjs";
import { getJson, resolveEntity, submissions, tickerTable } from "./sources.mjs";
import { priceHistory } from "./tools.mjs";

export const payoutsInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  years: z.number().int().min(2).max(20).optional().describe("Fiscal years to show, newest first; default 10."),
  price: z.boolean().optional().describe("Add the dividend and shareholder yields at the last close; default true."),
}).strict();

const ANNUAL = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const days = (a, b) => (Date.parse(a) - Date.parse(b)) / 86400000;
// [tags, unit, flow]: a flow is a full fiscal year (a duration of about a year), the rest are balances.
export const MEASURES = {
  dps_declared: [["CommonStockDividendsPerShareDeclared"], "USD/shares", true],
  dps_paid: [["CommonStockDividendsPerShareCashPaid"], "USD/shares", true],
  dividends_paid: [["PaymentsOfDividendsCommonStock", "PaymentsOfDividends", "PaymentsOfOrdinaryDividends"], "USD", true],
  buybacks: [["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"], "USD", true],
  issued: [["ProceedsFromIssuanceOfCommonStock", "ProceedsFromStockOptionsExercised", "ProceedsFromIssuanceOfSharesUnderIncentiveAndShareBasedCompensationPlans"], "USD", true],
  net_income: [["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"], "USD", true],
  cfo: [["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"], "USD", true],
  capex: [["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], "USD", true],
  diluted_shares: [["WeightedAverageNumberOfDilutedSharesOutstanding"], "shares", true],
};
const round = (x, d = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

// One measure's annual values by fiscal-year end (the latest filing's figure for each), from the tag
// the company reports most recently.
export function annualValues(facts, name) {
  const [tags, unit, flow] = MEASURES[name];
  let best = null;
  for (const tag of tags) {
    const rows = (facts[tag]?.units?.[unit] ?? []).filter((x) => ANNUAL.has(x.form) && (flow ? x.start && days(x.end, x.start) >= 350 && days(x.end, x.start) <= 380 : !x.start));
    if (!rows.length) continue;
    const by = new Map();
    for (const r of rows) if (!by.has(r.end) || r.filed > by.get(r.end).filed) by.set(r.end, r);
    const values = new Map([...by].sort((x, y) => x[0].localeCompare(y[0])).map(([end, r]) => [end, r.val]));
    const last = [...values.keys()].at(-1);
    if (!best || last > best.last || (last === best.last && values.size > best.values.size)) best = { tag, values, last };
  }
  return best && { tag: best.tag, values: best.values };
}

// Years in a row, back from the latest, that the yearly dividend per share rose (a cut or a flat year
// ends the run).
export function raisedYears(dps) {
  const v = [...dps.values()];
  let n = 0;
  for (let i = v.length - 1; i > 0 && v[i] > v[i - 1]; i -= 1) n += 1;
  return n;
}

// Dividends per share on today's shares: a year whose diluted share count jumps by a whole factor
// (2, 3, 4...) while the dividend per share falls by about the same is a split, and the years before
// it are divided by the factor. Older 10-Ks are not restated, so without this a split reads as a cut.
export function splitAdjusted(dps, shares) {
  const ends = [...dps.keys()], out = new Map(dps), splits = [];
  for (let i = ends.length - 1; i > 0; i -= 1) {
    const s1 = shares?.get(ends[i]), s0 = shares?.get(ends[i - 1]), d1 = dps.get(ends[i]), d0 = dps.get(ends[i - 1]);
    if (!s1 || !s0 || !d1 || !d0) continue;
    const factor = Math.round(s1 / s0);
    if (factor >= 2 && Math.abs(s1 / s0 / factor - 1) < 0.1 && d0 / d1 > factor * 0.6) {
      splits.push({ fiscal_year_end: ends[i], factor });
      for (const k of ends.slice(0, i)) out.set(k, out.get(k) / factor);
    }
  }
  return { values: out, splits };
}

const cagr = (values, n) => {
  const v = [...values.values()];
  if (v.length < n + 1) return null;
  const a = v.at(-1 - n), b = v.at(-1);
  return a > 0 && b > 0 ? (b / a) ** (1 / n) - 1 : null;
};

// The dividend's record on split-adjusted figures: years raised in a row (within the years tagged in
// XBRL, which began in 2009-2011) and its growth.
function dividendRecord(dps, shares) {
  const adj = splitAdjusted(dps, shares);
  return {
    raised_years_in_a_row: raisedYears(adj.values), years_tagged: adj.values.size,
    growth_5y: round(cagr(adj.values, 5)), growth_10y: round(cagr(adj.values, 10)),
    ...(adj.splits.length ? { splits_adjusted: adj.splits } : {}),
  };
}

export async function shareholderReturns(session, args) {
  const a = payoutsInput.parse(args);
  const e = await resolveEntity(session, a.company);
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(e.cik).padStart(10, "0")}.json`;
  const cf = await getJson(session, url, { maxBytes: 96 * 1024 * 1024 });
  const f = cf.facts?.["us-gaap"] ?? {};
  const m = Object.fromEntries(Object.keys(MEASURES).map((k) => [k, annualValues(f, k)]));
  const dps = m.dps_declared ?? m.dps_paid;
  const ends = [...new Set(Object.values(m).filter(Boolean).flatMap((s) => [...s.values.keys()]))].sort();
  if (!ends.length || !(m.dividends_paid || m.buybacks || dps)) throw new Error(`${cf.entityName ?? a.company} (CIK ${e.cik}) tags no annual dividends or buybacks in its XBRL.`);
  const v = (k, end) => m[k]?.values.get(end) ?? null;
  const rows = ends.slice(-(a.years ?? 10)).reverse().map((end, i, list) => {
    const div = v("dividends_paid", end), back = v("buybacks", end), iss = v("issued", end), ni = v("net_income", end), cfo = v("cfo", end), capex = v("capex", end);
    const fcf = cfo != null ? cfo - (capex ?? 0) : null, paid = (div ?? 0) + (back ?? 0);
    const sh = v("diluted_shares", end), prior = list[i + 1] ? v("diluted_shares", list[i + 1]) : null;
    return [end, dps?.values.get(end) ?? null, div, back, iss, round(ni ? (div ?? 0) / ni : null), round(fcf ? paid / fcf : null), sh, round(sh && prior ? sh / prior - 1 : null)];
  });
  let yields = null;
  if (a.price !== false) {
    const symbol = e.ticker ?? Object.values(await tickerTable(session)).find((t) => t.cik_str === e.cik)?.ticker;
    const shares = (cf.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? []).sort((x, y) => (x.end < y.end ? 1 : -1))[0]?.val ?? null;
    if (symbol && shares) {
      const today = new Date(session.now()).toISOString().slice(0, 10);
      const px = await priceHistory(session, { symbol, start: new Date(session.now() - 12 * 86400000).toISOString().slice(0, 10), end: today, adjusted: false }).catch(() => null);
      const price = px?.close?.at(-1) ?? null, end = ends.at(-1);
      const mv = price ? await marketValue(session, e.cik, await submissions(session, e.cik), price, shares) : null;
      if (mv?.market_cap) {
        const cap = mv.market_cap, div = v("dividends_paid", end) ?? 0, net = (v("buybacks", end) ?? 0) - (v("issued", end) ?? 0);
        yields = {
          price, price_date: px?.dates?.at(-1) ?? px?.date?.at(-1) ?? null, market_value: round(cap, 0), fiscal_year_end: end,
          dividend_yield: dps?.values.has(end) ? round(dps.values.get(end) / mv.price_per_share) : round(div / cap),
          net_buyback_yield: round(net / cap), shareholder_yield: round((div + net) / cap),
          source: px?.source ?? null,
        };
      }
    }
  }
  return {
    company: { cik: e.cik, name: cf.entityName ?? e.name, ticker: e.ticker ?? null },
    columns: ["fiscal_year_end", "dividend_per_share", "dividends_paid", "buybacks", "shares_issued_for_cash", "payout_ratio", "paid_out_of_free_cash_flow", "diluted_shares", "diluted_shares_change"],
    rows,
    dividends: dps ? { per_share_tag: dps.tag, ...dividendRecord(dps.values, m.diluted_shares?.values) } : { note: "No dividend per share tagged for full years." },
    ...(yields ? { yields } : {}),
    tags: Object.fromEntries(Object.entries(m).map(([k, s]) => [k, s?.tag ?? null])),
    sources: [url, ...(yields?.source ? [yields.source] : [])],
    meaning: "payout_ratio is common dividends paid over net income; paid_out_of_free_cash_flow is dividends plus buybacks over operating cash flow less capital spending (above 1 means more was paid out than the business made in cash). A falling diluted share count means buybacks outran new shares. shareholder_yield is the latest year's dividends plus buybacks less shares issued for cash, over the market value at the last close.",
    limits: ["Figures are the full fiscal years in annual reports; the current year's payments are not in until its 10-K.", "Dividends per share are as declared (or paid, when only that is tagged) and are not adjusted for later splits; a split shows as a step in the share count.", "Buybacks are cash paid for repurchases, which can include shares withheld for taxes on stock awards.", "For banks, brokers and insurers, operating cash flow moves with loans, deposits and trading, so paid_out_of_free_cash_flow says little; use payout_ratio.", "raised_years_in_a_row counts only the years tagged in XBRL (filings since 2009-2011), so a longer record is cut at its start.", "Not investment advice."],
  };
}
