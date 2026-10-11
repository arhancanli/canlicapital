// Who is positioned how: short interest in US stocks from FINRA (reported twice a month by every
// broker-dealer), and futures positioning from the CFTC's Commitments of Traders (weekly, by trader
// group). No key.
import { z } from "zod";

import { getJson, NotFound, pad10, postJson, resolveEntity } from "./sources.mjs";

const round = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const n = (s) => (s == null || s === "" || !Number.isFinite(Number(s)) ? null : Number(s));

// ---------------------------------------------------------------------------------------------
// short_interest (FINRA consolidated short interest)
// ---------------------------------------------------------------------------------------------
const FINRA = "https://api.finra.org";
const SI = `${FINRA}/data/group/otcMarket/name/consolidatedShortInterest`;

async function settlementDates(session) {
  const d = await getJson(session, `${FINRA}/partitions/group/otcMarket/name/consolidatedShortInterest`, { headers: { Accept: "application/json" } });
  return (d?.availablePartitions ?? []).map((p) => p.partitions?.[0]).filter(Boolean).sort().reverse();
}

// Shares outstanding as the company last reported them on a filing's cover page (dei taxonomy).
async function sharesOutstanding(session, cik) {
  try {
    const d = await getJson(session, `https://data.sec.gov/api/xbrl/companyconcept/CIK${pad10(cik)}/dei/EntityCommonStockSharesOutstanding.json`);
    const facts = d?.units?.shares ?? [];
    const latest = facts.reduce((a, b) => (!a || b.end > a.end || (b.end === a.end && b.filed > a.filed) ? b : a), null);
    return latest ? { shares: latest.val, as_of: latest.end, form: latest.form, filed: latest.filed } : null;
  } catch (err) {
    if (err instanceof NotFound) return null;
    throw err;
  }
}

const SORTS = Object.freeze({ days_to_cover: "daysToCoverQuantity", change_pct: "changePercent", short_position: "currentShortPositionQuantity" });

export const shortInput = z.object({
  symbol: z.string().regex(/^[A-Za-z0-9.\-]{1,12}$/).optional().describe("A US stock ticker. Without it, the whole market at the latest settlement date, ranked."),
  periods: z.number().int().min(1).max(48).optional().describe("Settlement dates to show for a stock, newest last; default 6 (three months)."),
  rank_by: z.enum(["days_to_cover", "change_pct", "short_position"]).optional().describe("Across the market: days to cover (default), the change since the last report, or shares short."),
  min_volume: z.number().min(0).optional().describe("Across the market, only stocks averaging at least this many shares a day; default 1,000,000, so thin stocks do not crowd the list."),
  limit: z.number().int().min(1).max(100).optional().describe("Across the market, most stocks to list; default 25."),
}).strict();

export async function shortInterest(session, args) {
  const a = shortInput.parse(args);
  const dates = await settlementDates(session);
  if (!dates.length) throw new NotFound("FINRA lists no short interest settlement dates.");
  const limits = [
    "FINRA consolidated short interest as reported by broker-dealers under FINRA Rule 4560, twice a month, published about seven business days after each settlement date; days to cover is short interest over average daily volume, as FINRA computes it.",
    "Not investment advice.",
  ];
  if (a.symbol) {
    const symbol = a.symbol.toUpperCase().replace(/-/g, ".");
    const periods = a.periods ?? 6;
    const window = dates.slice(0, periods);
    const rows = await postJson(session, SI, { limit: 100, compareFilters: [{ fieldName: "symbolCode", fieldValue: symbol, compareType: "EQUAL" }], dateRangeFilters: [{ fieldName: "settlementDate", startDate: window[window.length - 1], endDate: window[0] }] });
    if (!Array.isArray(rows) || !rows.length) throw new NotFound(`FINRA has no short interest for ${symbol} on its last ${periods} settlement dates (${window[window.length - 1]} to ${window[0]}).`);
    rows.sort((x, y) => x.settlementDate.localeCompare(y.settlementDate));
    const last = rows[rows.length - 1];
    let outstanding = null;
    try { outstanding = await sharesOutstanding(session, (await resolveEntity(session, symbol)).cik); } catch (err) { if (!(err instanceof NotFound)) throw err; }
    return {
      symbol, name: last.issueName, market: last.marketClassCode,
      latest: {
        settlement_date: last.settlementDate, short_position: n(last.currentShortPositionQuantity), change: n(last.changePreviousNumber), change_pct: round(n(last.changePercent) / 100, 6),
        average_daily_volume: n(last.averageDailyVolumeQuantity), days_to_cover: n(last.daysToCoverQuantity),
        ...(outstanding ? { pct_of_shares_outstanding: round(n(last.currentShortPositionQuantity) / outstanding.shares, 6), shares_outstanding: outstanding } : {}),
      },
      columns: ["settlement_date", "short_position", "change", "change_pct", "average_daily_volume", "days_to_cover"],
      rows: rows.map((r) => [r.settlementDate, n(r.currentShortPositionQuantity), n(r.changePreviousNumber), round(n(r.changePercent) / 100, 6), n(r.averageDailyVolumeQuantity), n(r.daysToCoverQuantity)]),
      source: "https://www.finra.org/finra-data/browse-catalog/equity-short-interest/data",
      limits: [...limits, ...(outstanding ? ["pct_of_shares_outstanding divides by the shares outstanding on the company's latest SEC cover page (as_of), not by the float."] : [])],
    };
  }
  const rankBy = a.rank_by ?? "days_to_cover", minVolume = a.min_volume ?? 1_000_000, limit = a.limit ?? 25;
  const date = dates[0];
  const rows = await postJson(session, SI, {
    limit, sortFields: [`-${SORTS[rankBy]}`],
    compareFilters: [{ fieldName: "settlementDate", fieldValue: date, compareType: "EQUAL" }, { fieldName: "averageDailyVolumeQuantity", fieldValue: minVolume, compareType: "GREATER" }],
  });
  if (!Array.isArray(rows) || !rows.length) throw new NotFound(`FINRA returned no stocks for ${date} averaging over ${minVolume} shares a day.`);
  return {
    settlement_date: date, ranked_by: rankBy, min_average_daily_volume: minVolume,
    columns: ["symbol", "name", "market", "short_position", "change_pct", "average_daily_volume", "days_to_cover"],
    rows: rows.map((r) => [r.symbolCode, r.issueName, r.marketClassCode, n(r.currentShortPositionQuantity), round(n(r.changePercent) / 100, 6), n(r.averageDailyVolumeQuantity), n(r.daysToCoverQuantity)]),
    source: "https://www.finra.org/finra-data/browse-catalog/equity-short-interest/data",
    limits,
  };
}

// ---------------------------------------------------------------------------------------------
// futures_positioning (CFTC Commitments of Traders)
// ---------------------------------------------------------------------------------------------
const CFTC = "https://publicreporting.cftc.gov/resource";
// Disaggregated report for physical commodities; Traders in Financial Futures for financials.
const REPORTS = Object.freeze({
  disaggregated: { id: "72hh-3qpy", name: "Disaggregated Futures Only", groups: [["producer_merchant", "prod_merc_positions_long", "prod_merc_positions_short"], ["swap_dealers", "swap_positions_long_all", "swap__positions_short_all"], ["managed_money", "m_money_positions_long_all", "m_money_positions_short_all"], ["other_reportables", "other_rept_positions_long", "other_rept_positions_short"], ["nonreportable", "nonrept_positions_long_all", "nonrept_positions_short_all"]], speculators: "managed_money" },
  financial: { id: "gpe5-46if", name: "Traders in Financial Futures, Futures Only", groups: [["dealers", "dealer_positions_long_all", "dealer_positions_short_all"], ["asset_managers", "asset_mgr_positions_long", "asset_mgr_positions_short"], ["leveraged_funds", "lev_money_positions_long", "lev_money_positions_short"], ["other_reportables", "other_rept_positions_long", "other_rept_positions_short"], ["nonreportable", "nonrept_positions_long_all", "nonrept_positions_short_all"]], speculators: "leveraged_funds" },
});
// The main contract for the names people use (CFTC contract market codes, checked 2026-10-11).
export const COT_MARKETS = Object.freeze({
  gold: ["088691", "disaggregated"], silver: ["084691", "disaggregated"], copper: ["085692", "disaggregated"], platinum: ["076651", "disaggregated"], palladium: ["075651", "disaggregated"],
  "crude oil": ["067651", "disaggregated"], oil: ["067651", "disaggregated"], wti: ["067651", "disaggregated"], brent: ["06765T", "disaggregated"], "natural gas": ["023651", "disaggregated"],
  gasoline: ["111659", "disaggregated"], "heating oil": ["022651", "disaggregated"], diesel: ["022651", "disaggregated"],
  corn: ["002602", "disaggregated"], wheat: ["001602", "disaggregated"], soybeans: ["005602", "disaggregated"], sugar: ["080732", "disaggregated"], coffee: ["083731", "disaggregated"],
  cocoa: ["073732", "disaggregated"], cotton: ["033661", "disaggregated"], "live cattle": ["057642", "disaggregated"], "lean hogs": ["054642", "disaggregated"],
  "s&p 500": ["13874A", "financial"], "nasdaq 100": ["209742", "financial"], "russell 2000": ["239742", "financial"], dow: ["124603", "financial"], vix: ["1170E1", "financial"],
  "2 year note": ["042601", "financial"], "5 year note": ["044601", "financial"], "10 year note": ["043602", "financial"], "ultra 10 year note": ["043607", "financial"], "treasury bond": ["020601", "financial"], "ultra bond": ["020604", "financial"],
  "fed funds": ["045601", "financial"], sofr: ["134741", "financial"],
  euro: ["099741", "financial"], yen: ["097741", "financial"], "japanese yen": ["097741", "financial"], pound: ["096742", "financial"], "british pound": ["096742", "financial"], "swiss franc": ["092741", "financial"],
  "canadian dollar": ["090741", "financial"], "australian dollar": ["232741", "financial"], "mexican peso": ["095741", "financial"], bitcoin: ["133741", "financial"], ether: ["146021", "financial"],
});

async function findMarket(session, q) {
  const key = String(q).trim().toLowerCase().replace(/[-\s]+/g, " ").replace(/ futures?$/, "");
  if (COT_MARKETS[key]) return { code: COT_MARKETS[key][0], report: COT_MARKETS[key][1] };
  if (/^[0-9A-Z+]{6}$/.test(String(q).trim())) {
    for (const report of ["disaggregated", "financial"]) {
      const r = await getJson(session, `${CFTC}/${REPORTS[report].id}.json?$select=cftc_contract_market_code&$where=cftc_contract_market_code='${String(q).trim()}'&$limit=1`);
      if (r?.length) return { code: String(q).trim(), report };
    }
  }
  // Otherwise the market whose name contains the words: still reported, then the largest.
  const words = key.toUpperCase().replace(/[^A-Z0-9& ]/g, "").trim();
  if (!words) throw new NotFound(`Name a futures market ("gold", "crude oil", "10 year note", "euro") or a CFTC contract code.`);
  const found = [];
  for (const report of ["disaggregated", "financial"]) {
    const r = await getJson(session, `${CFTC}/${REPORTS[report].id}.json?$select=cftc_contract_market_code,market_and_exchange_names,max(open_interest_all),max(report_date_as_yyyy_mm_dd)&$where=upper(market_and_exchange_names) like '%25${encodeURIComponent(words)}%25'&$group=cftc_contract_market_code,market_and_exchange_names&$limit=20`);
    for (const x of r ?? []) found.push({ code: x.cftc_contract_market_code, name: x.market_and_exchange_names, oi: Number(x.max_open_interest_all ?? 0), last: String(x.max_report_date_as_yyyy_mm_dd ?? "").slice(0, 10), report });
  }
  if (!found.length) throw new NotFound(`No CFTC market name contains "${q}". Try "gold", "crude oil", "corn", "s&p 500", "10 year note", "euro", "bitcoin", or a contract code.`);
  found.sort((a, b) => b.last.localeCompare(a.last) || b.oi - a.oi);
  return { code: found[0].code, report: found[0].report, matched_from: String(q), other_matches: found.slice(1, 5).map((f) => ({ code: f.code, name: f.name })) };
}

export const cotInput = z.object({
  market: z.string().min(1).max(60).describe("A futures market by name (\"gold\", \"crude oil\", \"corn\", \"s&p 500\", \"10 year note\", \"euro\", \"bitcoin\", \"vix\") or a CFTC contract market code (088691)."),
  weeks: z.number().int().min(1).max(520).optional().describe("Weekly reports to return, newest last; default 52."),
}).strict();

export async function futuresPositioning(session, args) {
  const a = cotInput.parse(args);
  const m = await findMarket(session, a.market);
  const rep = REPORTS[m.report];
  const weeks = a.weeks ?? 52;
  const fields = ["report_date_as_yyyy_mm_dd", "market_and_exchange_names", "contract_units", "open_interest_all", ...rep.groups.flatMap((g) => [g[1], g[2]])];
  const data = await getJson(session, `${CFTC}/${rep.id}.json?$select=${fields.join(",")}&$where=cftc_contract_market_code='${m.code}'&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=${weeks}`);
  if (!Array.isArray(data) || !data.length) throw new NotFound(`The CFTC has no ${rep.name} reports for contract ${m.code}.`);
  data.reverse();
  const rows = data.map((r) => [r.report_date_as_yyyy_mm_dd.slice(0, 10), n(r.open_interest_all), ...rep.groups.map((g) => (n(r[g[1]]) ?? 0) - (n(r[g[2]]) ?? 0))]);
  const last = data[data.length - 1], prev = data[data.length - 2];
  const net = (r, g) => (n(r[g[1]]) ?? 0) - (n(r[g[2]]) ?? 0);
  const groups = rep.groups.map((g) => ({ group: g[0], long: n(last[g[1]]), short: n(last[g[2]]), net: net(last, g), net_pct_of_open_interest: round(net(last, g) / n(last.open_interest_all), 4), net_change_week: prev ? net(last, g) - net(prev, g) : null }));
  // Where the speculators' net position sits in the window: 0 = the most short, 1 = the most long.
  const spec = rep.groups.findIndex((g) => g[0] === rep.speculators);
  const series = rows.map((r) => r[2 + spec]);
  const lo = Math.min(...series), hi = Math.max(...series);
  return {
    market: { code: m.code, name: last.market_and_exchange_names, units: last.contract_units ?? null, ...(m.matched_from ? { matched_from: m.matched_from, other_matches: m.other_matches } : {}) },
    report: rep.name, as_of: rows[rows.length - 1][0], open_interest: n(last.open_interest_all),
    ...((session.now() - Date.parse(rows[rows.length - 1][0])) / 86400000 > 21 ? { stale: `The latest report for this market is from ${rows[rows.length - 1][0]}; it may have stopped trading or moved to a new contract code.` } : {}),
    latest: { columns: ["group", "long", "short", "net", "net_pct_of_open_interest", "net_change_week"], rows: groups.map((g) => [g.group, g.long, g.short, g.net, g.net_pct_of_open_interest, g.net_change_week]) },
    speculators: { group: rep.speculators, net: series[series.length - 1], range_in_window: [lo, hi], position_in_range: hi > lo ? round((series[series.length - 1] - lo) / (hi - lo), 4) : null, weeks: series.length },
    columns: ["date", "open_interest", ...rep.groups.map((g) => `${g[0]}_net`)],
    rows,
    source: `https://publicreporting.cftc.gov/resource/${rep.id}`,
    limits: [
      "CFTC Commitments of Traders, futures only, as of each Tuesday and published the following Friday; positions are contracts, net is long minus short, and spreading positions are left out of long and short.",
      `${rep.speculators === "managed_money" ? "Managed money (hedge funds and CTAs)" : "Leveraged funds (hedge funds and CTAs)"} is the usual speculators' gauge; position_in_range places their latest net position between the window's extremes.`,
      "Not investment advice.",
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// off_exchange_volume (FINRA OTC transparency: dark pools and other off-exchange trading)
// ---------------------------------------------------------------------------------------------
const WEEKLY = `${FINRA}/data/group/otcMarket/name/weeklySummary`;

export const offExchangeInput = z.object({
  symbol: z.string().regex(/^[A-Za-z0-9.\-]{1,12}$/).describe("A US stock ticker."),
  weeks: z.number().int().min(1).max(52).optional().describe("Weeks to show, newest last; default 8. FINRA publishes Tier 1 stocks two weeks after the week, others four."),
}).strict();

export async function offExchangeVolume(session, args) {
  const a = offExchangeInput.parse(args);
  const symbol = a.symbol.toUpperCase().replace(/-/g, ".");
  const weeks = a.weeks ?? 8;
  const end = new Date(session.now()).toISOString().slice(0, 10);
  const start = new Date(session.now() - (weeks + 5) * 7 * 86400000).toISOString().slice(0, 10);
  const rows = await postJson(session, WEEKLY, { limit: 5000, compareFilters: [{ fieldName: "issueSymbolIdentifier", fieldValue: symbol, compareType: "EQUAL" }], dateRangeFilters: [{ fieldName: "weekStartDate", startDate: start, endDate: end }] });
  if (!Array.isArray(rows) || !rows.length) throw new NotFound(`FINRA has no off-exchange volume for ${symbol} for weeks starting ${start} to ${end}.`);
  const byWeek = new Map();
  for (const r of rows) {
    const kind = /^ATS/.test(r.summaryTypeCode) ? "ats" : /^OTC/.test(r.summaryTypeCode) ? "otc" : null;
    if (!kind || !/_FIRM$/.test(r.summaryTypeCode)) continue;
    const w = byWeek.get(r.weekStartDate) ?? { ats: 0, otc: 0, ats_trades: 0, otc_trades: 0, venues: new Map(), name: r.issueName };
    w[kind] += n(r.totalWeeklyShareQuantity) ?? 0;
    w[`${kind}_trades`] += n(r.totalWeeklyTradeCount) ?? 0;
    const venue = `${kind}|${r.marketParticipantName}`;
    w.venues.set(venue, (w.venues.get(venue) ?? 0) + (n(r.totalWeeklyShareQuantity) ?? 0));
    byWeek.set(r.weekStartDate, w);
  }
  const dates = [...byWeek.keys()].sort().slice(-weeks);
  if (!dates.length) throw new NotFound(`FINRA's rows for ${symbol} carry no firm-level weekly totals.`);
  const latest = byWeek.get(dates[dates.length - 1]);
  const top = (kind) => [...latest.venues].filter(([k]) => k.startsWith(`${kind}|`)).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => [k.slice(4), round(v, 2), round(v / (kind === "ats" ? latest.ats : latest.otc), 4)]);
  return {
    symbol, name: latest.name ?? null, weeks: dates.length,
    columns: ["week_start", "ats_shares", "otc_shares", "off_exchange_shares", "ats_trades", "otc_trades", "average_ats_trade_size"],
    // OTC volume includes fractional shares, so sums are kept to the hundredth of a share.
    rows: dates.map((d) => { const w = byWeek.get(d); return [d, round(w.ats, 2), round(w.otc, 2), round(w.ats + w.otc, 2), w.ats_trades, w.otc_trades, w.ats_trades ? round(w.ats / w.ats_trades, 1) : null]; }),
    latest_week: { week_start: dates[dates.length - 1], dark_pools: { columns: ["venue", "shares", "share_of_ats"], rows: top("ats") }, other_off_exchange: { columns: ["firm", "shares", "share_of_otc"], rows: top("otc") } },
    source: "https://www.finra.org/finra-data/browse-catalog/otc-transparency",
    limits: [
      "FINRA OTC transparency data: ATS (dark pool) volume and non-ATS OTC volume (wholesalers and other dealers) per firm and week, published two weeks after the week for Tier 1 stocks and four for others; small firms' volume is aggregated, so totals can trail the tape.",
      "Exchange volume is not included; compare with price_history's volume for the share traded off exchange.",
      "Not investment advice.",
    ],
  };
}
