// stock_snapshot: what a quote page shows and no primary source publishes. Analyst price targets, ratings and
// estimates, valuation ratios, short interest and holder percentages, from Yahoo Finance's quote summary. These are a
// vendor's aggregates, unlike the filings and central-bank data elsewhere in this server, and the answer says so.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";

export const BROWSER = "Mozilla/5.0 (compatible; canli-markets-mcp)";
const MODULES = "price,financialData,defaultKeyStatistics,summaryDetail,recommendationTrend,earningsTrend,calendarEvents,majorHoldersBreakdown";
const FRESH_MS = 60 * 60 * 1000;

export const snapshotInput = z.object({
  symbol: z.string().min(1).max(20).describe("The ticker on Yahoo Finance: AAPL, BRK-B, 7203.T, SHEL.L."),
}).strict();

// Yahoo asks for a cookie and a token, both free and needing no account; kept for an hour.
export async function access(session) {
  if (session.yahooAccess && session.now() - session.yahooAccess.at < FRESH_MS) return session.yahooAccess;
  const headers = { "User-Agent": BROWSER };
  const home = await session.fetchImpl("https://fc.yahoo.com/", { headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
  const cookie = (home.headers.getSetCookie?.() ?? [home.headers.get("set-cookie")]).filter(Boolean).map((c) => c.split(";")[0]).join("; ");
  const res = await session.fetchImpl("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { ...headers, Cookie: cookie }, signal: AbortSignal.timeout(15000) });
  const crumb = (await res.text()).trim();
  if (!res.ok || !crumb || crumb.length > 40) throw new Error("Yahoo Finance did not give access to its quote summary just now; try again later.");
  session.yahooAccess = { cookie, crumb, at: session.now() };
  return session.yahooAccess;
}

const raw = (x) => (x && typeof x === "object" ? x.raw ?? null : x ?? null);
const pct = (x) => { const v = raw(x); return v === null ? null : Math.round(v * 1e4) / 100; };
const day = (x) => { const v = raw(x); return typeof v === "number" ? new Date(v * 1000).toISOString().slice(0, 10) : v; };
// Without nulls, so an empty block costs no tokens.
const some = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

export async function stockSnapshot(session, args) {
  const a = snapshotInput.parse(args);
  const symbol = a.symbol.trim().toUpperCase();
  const { cookie, crumb } = await access(session);
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${MODULES}&crumb=${encodeURIComponent(crumb)}`;
  let data;
  try {
    data = await getJson(session, url, { headers: { "User-Agent": BROWSER, Cookie: cookie }, maxAgeMs: 300000, secret: true });
  } catch (err) {
    if (/HTTP 404|not found/i.test(err.message)) throw new NotFound(`${symbol} is not a symbol on Yahoo Finance.`);
    throw err;
  }
  const r = data?.quoteSummary?.result?.[0];
  if (!r) throw new NotFound(`${symbol} is not a symbol on Yahoo Finance.`);
  const f = r.financialData ?? {}, k = r.defaultKeyStatistics ?? {}, s = r.summaryDetail ?? {}, p = r.price ?? {}, h = r.majorHoldersBreakdown ?? {}, e = r.calendarEvents?.earnings ?? {};
  const now = r.recommendationTrend?.trend?.[0];
  const estimates = (r.earningsTrend?.trend ?? []).filter((t) => raw(t.earningsEstimate?.avg) !== null);
  return {
    symbol,
    name: p.longName ?? p.shortName ?? null,
    currency: p.currency ?? null,
    as_of: typeof p.regularMarketTime === "number" ? new Date(p.regularMarketTime * 1000).toISOString() : null,
    price: raw(p.regularMarketPrice),
    analysts: some({
      price_target: some({ mean: raw(f.targetMeanPrice), median: raw(f.targetMedianPrice), high: raw(f.targetHighPrice), low: raw(f.targetLowPrice) }),
      analysts: raw(f.numberOfAnalystOpinions),
      recommendation_mean: raw(f.recommendationMean),
      recommendation: f.recommendationKey ?? null,
      recommendation_scale: "1 strong buy, 2 buy, 3 hold, 4 sell, 5 strong sell",
      ratings_now: now ? { strong_buy: now.strongBuy, buy: now.buy, hold: now.hold, sell: now.sell, strong_sell: now.strongSell } : null,
    }),
    estimates: estimates.length ? {
      note: "period: 0q this quarter, +1q next quarter, 0y this fiscal year, +1y next fiscal year.",
      columns: ["period", "ends", "eps_average", "eps_low", "eps_high", "eps_analysts", "eps_year_ago", "revenue_average", "revenue_analysts", "growth_pct"],
      rows: estimates.map((t) => [t.period, t.endDate ?? null, raw(t.earningsEstimate?.avg), raw(t.earningsEstimate?.low), raw(t.earningsEstimate?.high), raw(t.earningsEstimate?.numberOfAnalysts), raw(t.earningsEstimate?.yearAgoEps), raw(t.revenueEstimate?.avg), raw(t.revenueEstimate?.numberOfAnalysts), pct(t.growth)]),
    } : null,
    valuation: some({ market_cap: raw(p.marketCap) ?? raw(s.marketCap), enterprise_value: raw(k.enterpriseValue), trailing_pe: raw(s.trailingPE), forward_pe: raw(s.forwardPE) ?? raw(k.forwardPE), price_to_book: raw(k.priceToBook), peg: raw(k.pegRatio), price_to_sales: raw(s.priceToSalesTrailing12Months), ev_to_revenue: raw(k.enterpriseToRevenue), ev_to_ebitda: raw(k.enterpriseToEbitda), beta: raw(s.beta) ?? raw(k.beta) }),
    range: some({ high_52w: raw(s.fiftyTwoWeekHigh), low_52w: raw(s.fiftyTwoWeekLow), average_50d: raw(s.fiftyDayAverage), average_200d: raw(s.twoHundredDayAverage) }),
    dividend: some({ annual_rate: raw(s.dividendRate), yield_pct: pct(s.dividendYield), ex_date: day(s.exDividendDate), payout_ratio_pct: pct(s.payoutRatio) }),
    short_interest: some({ shares_short: raw(k.sharesShort), reported: day(k.dateShortInterest), prior_month: raw(k.sharesShortPriorMonth), days_to_cover: raw(k.shortRatio), pct_of_float: pct(k.shortPercentOfFloat) }),
    holders: some({ institutions_pct: pct(k.heldPercentInstitutions) ?? pct(h.institutionsPercentHeld), insiders_pct: pct(k.heldPercentInsiders) ?? pct(h.insidersPercentHeld), institutions_count: raw(h.institutionsCount), shares_outstanding: raw(k.sharesOutstanding), float_shares: raw(k.floatShares) }),
    next_earnings: some({ date: day(e.earningsDate?.[0]), is_estimate: e.isEarningsDateEstimate ?? null, eps_average: raw(e.earningsAverage), revenue_average: raw(e.revenueAverage) }),
    source: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
    limits: [
      "Yahoo Finance's public data: unofficial, for personal use under Yahoo's terms, and it can change or stop without notice.",
      "Analyst targets, ratings and estimates are a vendor's aggregates of analysts' views. No primary source publishes them, nobody here checked them, and they are often wrong: they are not a forecast Canli Capital makes.",
      "Not investment advice.",
    ],
  };
}
