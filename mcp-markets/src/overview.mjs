// The market at a glance: the main US indices and volatility, the eleven S&P sectors (by their SPDR
// funds), Treasury yields, the dollar, oil, gold and copper, bitcoin and ether, and the main markets
// abroad, each with its last close and its change over a day, a week, a month, three months, the
// year to date and a year. Prices are daily closes from price_history's sources; nothing is a quote.
import { z } from "zod";

import { priceHistory } from "./tools.mjs";

export const GROUPS = Object.freeze({
  us: [["^GSPC", "S&P 500"], ["^IXIC", "Nasdaq Composite"], ["^NDX", "Nasdaq 100"], ["^DJI", "Dow Jones Industrial Average"], ["^RUT", "Russell 2000"], ["^VIX", "VIX (S&P 500 volatility)"]],
  sectors: [["XLK", "Technology"], ["XLC", "Communication services"], ["XLY", "Consumer discretionary"], ["XLP", "Consumer staples"], ["XLF", "Financials"], ["XLV", "Health care"], ["XLI", "Industrials"], ["XLE", "Energy"], ["XLB", "Materials"], ["XLU", "Utilities"], ["XLRE", "Real estate"]],
  rates: [["^IRX", "13-week Treasury bill yield"], ["^FVX", "5-year Treasury yield"], ["^TNX", "10-year Treasury yield"], ["^TYX", "30-year Treasury yield"]],
  currencies: [["DX-Y.NYB", "US dollar index"], ["EURUSD=X", "EUR/USD"], ["USDJPY=X", "USD/JPY"], ["GBPUSD=X", "GBP/USD"]],
  commodities: [["CL=F", "WTI crude oil"], ["BZ=F", "Brent crude oil"], ["NG=F", "US natural gas"], ["GC=F", "Gold"], ["SI=F", "Silver"], ["HG=F", "Copper"]],
  crypto: [["BTC-USD", "Bitcoin"], ["ETH-USD", "Ether"]],
  world: [["^STOXX50E", "Euro Stoxx 50"], ["^FTSE", "FTSE 100"], ["^GDAXI", "DAX"], ["^N225", "Nikkei 225"], ["^HSI", "Hang Seng"], ["000001.SS", "Shanghai Composite"], ["^BSESN", "Sensex"]],
});
// Yields are quoted in percent, so their changes are in percentage points, not percent of the level.
const YIELDS = new Set(GROUPS.rates.map(([s]) => s));

export const overviewInput = z.object({
  groups: z.array(z.enum(Object.keys(GROUPS))).min(1).max(7).optional().describe(`Which groups to show (${Object.keys(GROUPS).join(", ")}); default all.`),
}).strict();

const round = (x, d = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

// Changes from closes (oldest first) to the last: n sessions back, and from the last close of the
// year before the last date's.
export function changes(dates, closes, { points = false } = {}) {
  const last = closes.at(-1), at = (n) => closes.at(-1 - n);
  const year = dates.at(-1).slice(0, 4), before = dates.findLastIndex((d) => d.slice(0, 4) < year);
  const ch = (base) => (base == null || !Number.isFinite(base) ? null : points ? round(last - base, 3) : base ? round(last / base - 1) : null);
  return { day: ch(at(1)), week: ch(at(5)), month: ch(at(21)), three_months: ch(at(63)), year_to_date: ch(before >= 0 ? closes[before] : null), year: ch(at(252)) };
}

export async function marketOverview(session, args) {
  const a = overviewInput.parse(args ?? {});
  const groups = a.groups ?? Object.keys(GROUPS);
  const start = new Date(session.now() - 400 * 86400000).toISOString().slice(0, 10);
  const sources = new Set(), missing = [];
  const out = {};
  await Promise.all(groups.map(async (g) => {
    const rows = await Promise.all(GROUPS[g].map(async ([symbol, name]) => {
      const p = await priceHistory(session, { symbol, start, adjusted: false }).catch((err) => { missing.push(`${symbol}: ${String(err.message).slice(0, 120)}`); return null; });
      if (!p?.close?.length) return null;
      if (p.source) sources.add(p.source);
      const c = changes(p.dates, p.close, { points: YIELDS.has(symbol) });
      return [symbol, name, p.dates.at(-1), round(p.close.at(-1), 4), c.day, c.week, c.month, c.three_months, c.year_to_date, c.year];
    }));
    out[g] = rows.filter(Boolean);
    // Sectors are easiest read best to worst over the month.
    if (g === "sectors") out[g].sort((x, y) => (y[6] ?? -Infinity) - (x[6] ?? -Infinity));
  }));
  // Nothing at all came back: say why rather than answer with empty lists.
  if (missing.length && !sources.size) throw new Error(missing.some((m) => /CANLI_KEYLESS_PRICES=0/.test(m)) ? "Prices are off on this server (CANLI_KEYLESS_PRICES=0), so there is no market overview. On the hosted server, run the local one: npx -y canli-mcp." : missing[0].replace(/^[^:]+: /, ""));
  return {
    columns: ["symbol", "name", "date", "close", "day", "week", "month", "three_months", "year_to_date", "year"],
    ...Object.fromEntries(groups.map((g) => [g, out[g]])),
    ...(missing.length ? { missing } : {}),
    meaning: "Changes are close to close over 1, 5, 21, 63 and 252 sessions and from the last close of the year before, as fractions (0.012 is 1.2%); for Treasury yields (quoted in percent) they are percentage points. Sectors are ranked by the month. Dates are each market's last close, so markets abroad and crypto can be a day apart.",
    sources: [...sources],
    limits: ["Daily closes, not live quotes; intraday moves are not shown.", "Index levels are price indices, without dividends; sector funds are SPDR ETFs.", "Not investment advice."],
  };
}
