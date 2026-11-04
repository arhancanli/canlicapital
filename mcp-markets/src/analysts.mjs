// analyst_history and market_movers, from Yahoo Finance as stock_snapshot reads it: a vendor's aggregates, which no
// primary source publishes, and each answer says so. analyst_history: every upgrade, downgrade and price-target
// change by firm, the last four quarters' earnings against the estimate, how the consensus moved over 90 days,
// and the count of buy, hold and sell ratings month by month. market_movers: the day's biggest gainers, losers or
// most traded US stocks, and Yahoo's other ready-made lists.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";
import { BROWSER, access } from "./snapshot.mjs";

const raw = (x) => (x && typeof x === "object" ? x.raw ?? null : x ?? null);
const pct = (x) => { const v = raw(x); return v === null ? null : Math.round(v * 1e4) / 100; };
const day = (epoch) => (typeof epoch === "number" ? new Date(epoch * 1000).toISOString().slice(0, 10) : null);
const ACTIONS = Object.freeze({ up: "upgrade", down: "downgrade", init: "initiated", main: "maintained", reit: "reiterated" });
const VENDOR = "Yahoo Finance's aggregates of what brokers' analysts publish, which no primary source does; firms report to it on their own terms, so a change can be missing or late.";

async function summary(session, symbol, modules) {
  const { cookie, crumb } = await access(session);
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
  let data;
  try { data = await getJson(session, url, { headers: { "User-Agent": BROWSER, Cookie: cookie }, maxAgeMs: 300000, secret: true }); } catch (err) {
    if (/HTTP 404|not found/i.test(err.message)) throw new NotFound(`${symbol} is not a symbol on Yahoo Finance.`);
    throw err;
  }
  const r = data?.quoteSummary?.result?.[0];
  if (!r) throw new NotFound(`${symbol} is not a symbol on Yahoo Finance.`);
  return r;
}

export const historyInput = z.object({
  symbol: z.string().min(1).max(20).describe("The ticker on Yahoo Finance: AAPL, BRK-B, 7203.T."),
  days: z.number().int().min(1).max(3650).optional().describe("Rating changes over this many days; default 180."),
  firm: z.string().min(2).max(60).optional().describe("Only this firm's rating changes (part of its name)."),
}).strict();

export async function analystHistory(session, args) {
  const a = historyInput.parse(args);
  const symbol = a.symbol.trim().toUpperCase();
  const r = await summary(session, symbol, "upgradeDowngradeHistory,earningsHistory,earningsTrend,recommendationTrend");
  const since = new Date(session.now() - (a.days ?? 180) * 86400000).toISOString().slice(0, 10);
  const firm = a.firm?.toLowerCase();
  const changes = (r.upgradeDowngradeHistory?.history ?? [])
    .map((h) => [day(h.epochGradeDate), h.firm ?? null, ACTIONS[h.action] ?? h.action ?? null, h.fromGrade || null, h.toGrade || null, h.priceTargetAction ?? null, raw(h.currentPriceTarget) || null, raw(h.priorPriceTarget) || null])
    .filter((c) => c[0] && c[0] >= since && (!firm || String(c[1]).toLowerCase().includes(firm)))
    .sort((x, y) => y[0].localeCompare(x[0]));
  const count = (i, v) => changes.filter((c) => c[i] === v).length;
  const surprises = (r.earningsHistory?.history ?? []).map((h) => [day(raw(h.quarter)), raw(h.epsActual), raw(h.epsEstimate), pct(h.surprisePercent)]).filter((x) => x[0]).sort((x, y) => x[0].localeCompare(y[0]));
  const revisions = (r.earningsTrend?.trend ?? []).filter((t) => t.epsTrend).map((t) => {
    const e = t.epsTrend, v = t.epsRevisions ?? {};
    return [t.period, t.endDate ?? null, raw(e.current), raw(e["7daysAgo"]), raw(e["30daysAgo"]), raw(e["60daysAgo"]), raw(e["90daysAgo"]), raw(v.upLast7days), raw(v.upLast30days), raw(v.downLast7days ?? v.downLast7Days), raw(v.downLast30days)];
  });
  // "0m" is this month, "-1m" the one before.
  const month = (p) => { const n = Number(String(p).replace("m", "")) || 0, d = new Date(session.now()); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
  const recs = (r.recommendationTrend?.trend ?? []).map((t) => [month(t.period), t.strongBuy, t.buy, t.hold, t.sell, t.strongSell]).sort((x, y) => x[0].localeCompare(y[0]));
  return {
    symbol, since,
    rating_changes: {
      count: changes.length,
      summary: { upgrades: count(2, "upgrade"), downgrades: count(2, "downgrade"), initiated: count(2, "initiated"), targets_raised: count(5, "Raises"), targets_lowered: count(5, "Lowers") },
      columns: ["date", "firm", "action", "from", "to", "price_target_action", "price_target", "prior_price_target"], rows: changes.slice(0, 200),
      ...(changes.length > 200 ? { truncated_to_newest: 200 } : {}),
    },
    earnings_surprises: { columns: ["quarter_end", "eps_actual", "eps_estimate", "surprise_pct"], rows: surprises },
    estimate_revisions: { note: "period: 0q this quarter, +1q next, 0y this fiscal year, +1y next. EPS consensus now and days ago; how many analysts raised or lowered.", columns: ["period", "ends", "eps_now", "eps_7d_ago", "eps_30d_ago", "eps_60d_ago", "eps_90d_ago", "raised_7d", "raised_30d", "lowered_7d", "lowered_30d"], rows: revisions },
    recommendations: { columns: ["month", "strong_buy", "buy", "hold", "sell", "strong_sell"], rows: recs },
    source: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/analysis`,
    limits: [VENDOR, "Not investment advice."],
  };
}

const LISTS = Object.freeze({ gainers: "day_gainers", losers: "day_losers", most_active: "most_actives", small_cap_gainers: "small_cap_gainers", most_shorted: "most_shorted_stocks", undervalued_growth: "undervalued_growth_stocks", growth_technology: "growth_technology_stocks", aggressive_small_caps: "aggressive_small_caps", undervalued_large_caps: "undervalued_large_caps" });
export const moversInput = z.object({
  list: z.enum(Object.keys(LISTS)).optional().describe("gainers, losers or most_active today (default gainers), or one of Yahoo's ready-made screens: small_cap_gainers, most_shorted, undervalued_growth, growth_technology, aggressive_small_caps, undervalued_large_caps."),
  count: z.number().int().min(1).max(100).optional().describe("How many; default 25."),
}).strict();

export async function marketMovers(session, args) {
  const a = moversInput.parse(args ?? {});
  const list = a.list ?? "gainers", { cookie, crumb } = await access(session);
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${LISTS[list]}&count=${a.count ?? 25}&crumb=${encodeURIComponent(crumb)}`;
  const d = await getJson(session, url, { headers: { "User-Agent": BROWSER, Cookie: cookie }, maxAgeMs: 120000, secret: true });
  const result = d?.finance?.result?.[0];
  if (!result?.quotes?.length) throw new NotFound(`Yahoo Finance's ${list.replace(/_/g, " ")} list is empty just now (outside trading hours it can be).`);
  const r1 = (x) => (typeof x === "number" ? Math.round(x * 100) / 100 : null);
  return {
    list, title: result.title ?? null, as_of: new Date(session.now()).toISOString(),
    columns: ["symbol", "name", "price", "change_pct", "volume", "average_volume_3m", "market_cap", "exchange"],
    rows: result.quotes.map((q) => [q.symbol, q.longName ?? q.shortName ?? null, r1(q.regularMarketPrice), r1(q.regularMarketChangePercent), q.regularMarketVolume ?? null, q.averageDailyVolume3Month ?? null, q.marketCap ?? null, q.fullExchangeName ?? q.exchange ?? null]),
    source: "https://finance.yahoo.com/markets/stocks/gainers/",
    limits: ["Yahoo Finance's lists of US stocks as it shows them (delayed quotes); it chooses which stocks qualify (gainers above a minimum price and market value).", "Not investment advice."],
  };
}

export const etfInput = z.object({
  symbol: z.string().min(1).max(20).describe("The fund's ticker on Yahoo Finance: SPY, QQQ, VTI, VFIAX."),
}).strict();

// etf_profile: what a fund costs and holds, from Yahoo Finance's fund profile. The expense ratio beside its
// category's average, turnover, assets, yield, returns, the top holdings, the mix of stocks, bonds and cash, and
// the sector weights. fund_portfolio reads every holding from the fund's own N-PORT filing; this is the vendor's
// current summary.
export async function etfProfile(session, args) {
  const a = etfInput.parse(args);
  const symbol = a.symbol.trim().toUpperCase();
  const r = await summary(session, symbol, "fundProfile,topHoldings,defaultKeyStatistics,summaryDetail,price");
  const f = r.fundProfile, t = r.topHoldings, k = r.defaultKeyStatistics ?? {}, s = r.summaryDetail ?? {};
  if (!f && !t) throw new NotFound(`${symbol} is not a fund on Yahoo Finance (no fund profile).`);
  const fees = f?.feesExpensesInvestment ?? {}, cat = f?.feesExpensesInvestmentCat ?? {};
  const weight = (x) => { const v = raw(x); return v === null ? null : Math.round(v * 1e6) / 1e4; };
  const sectors = (t?.sectorWeightings ?? []).flatMap((o) => Object.entries(o)).map(([k2, v]) => [k2.replace(/_/g, " "), weight(v)]).filter((x) => x[1] !== null).sort((x, y) => y[1] - x[1]);
  return {
    symbol, name: r.price?.longName ?? r.price?.shortName ?? null,
    family: f?.family ?? null, category: f?.categoryName ?? k.category ?? null, legal_type: f?.legalType ?? k.legalType ?? null,
    inception: day(raw(k.fundInceptionDate)),
    costs: { expense_ratio_pct: weight(fees.annualReportExpenseRatio), category_average_pct: weight(cat.annualReportExpenseRatio), turnover_pct: weight(fees.annualHoldingsTurnover) },
    size: { total_assets: raw(k.totalAssets), currency: r.price?.currency ?? null },
    returns: { yield_pct: weight(s.yield), ytd_pct: weight(k.ytdReturn), five_year_average_pct: weight(k.fiveYearAverageReturn), beta_3y: raw(k.beta3Year) },
    allocation_pct: { stocks: weight(t?.stockPosition), bonds: weight(t?.bondPosition), cash: weight(t?.cashPosition), preferred: weight(t?.preferredPosition), convertible: weight(t?.convertiblePosition), other: weight(t?.otherPosition) },
    top_holdings: { columns: ["symbol", "name", "weight_pct"], rows: (t?.holdings ?? []).map((h) => [h.symbol ?? null, h.holdingName ?? null, weight(h.holdingPercent)]) },
    sectors_pct: { columns: ["sector", "weight_pct"], rows: sectors },
    source: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/holdings`,
    limits: ["Yahoo Finance's fund profile (a vendor's summary, from the fund's reports through a data provider); every holding as the fund itself filed it is in fund_portfolio (SEC N-PORT).", "Not investment advice."],
  };
}
