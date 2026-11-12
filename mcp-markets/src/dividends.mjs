// A security's dividends and splits from Yahoo Finance's price history: each payment by ex-date,
// totals by year, the trailing year's yield and the streak of rising annual totals.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";
import { yahooChartUrl } from "./tools.mjs";

export const dividendsInput = z.object({
  symbol: z.string().regex(/^[A-Za-z0-9.=^-]{1,12}$/, "a ticker").describe("Ticker, e.g. KO, or a foreign listing such as NESN.SW."),
  years: z.number().int().min(1).max(60).optional().describe("Years of history; default 20."),
}).strict();

const round = (x, n = 4) => Math.round(x * 10 ** n) / 10 ** n;

// Rising years counted back from the last complete one. A year with no dividend ends the streak.
export function growthStreak(byYear, lastComplete) {
  let streak = 0;
  for (let y = lastComplete; byYear[y] !== undefined && byYear[y - 1] !== undefined && byYear[y] > byYear[y - 1]; y--) streak++;
  return streak;
}

export async function dividendHistory(session, args) {
  const a = dividendsInput.parse(args);
  const symbol = a.symbol.toUpperCase();
  const nowIso = new Date(session.now()).toISOString().slice(0, 10);
  const start = `${Number(nowIso.slice(0, 4)) - (a.years ?? 20)}-01-01`;
  const url = yahooChartUrl(symbol, start, nowIso, "1Month");
  let res;
  try { res = (await getJson(session, url))?.chart?.result?.[0]; } catch (err) { if (err instanceof NotFound) throw new NotFound(`Yahoo Finance has no history for ${symbol}.`); throw err; }
  if (!res) throw new NotFound(`Yahoo Finance has no history for ${symbol}.`);
  const off = (res.meta?.gmtoffset ?? 0) * 1000;
  const day = (t) => new Date(t * 1000 + off).toISOString().slice(0, 10);
  const ev = res.events ?? {};
  const dividends = Object.values(ev.dividends ?? {}).sort((x, y) => x.date - y.date).map((d) => [day(d.date), round(d.amount, 6)]);
  const splits = Object.values(ev.splits ?? {}).sort((x, y) => x.date - y.date).map((d) => [day(d.date), `${d.numerator}:${d.denominator}`]);
  const byYear = {};
  for (const [d, x] of dividends) byYear[d.slice(0, 4)] = round((byYear[d.slice(0, 4)] ?? 0) + x, 6);
  const yearAgo = new Date(session.now() - 365 * 86400000).toISOString().slice(0, 10);
  const trailing = round(dividends.filter(([d]) => d > yearAgo).reduce((t, [, x]) => t + x, 0), 6);
  const price = res.meta?.regularMarketPrice ?? null;
  const lastComplete = Number(nowIso.slice(0, 4)) - 1;
  const first = byYear[lastComplete - 5], last = byYear[lastComplete];
  return {
    symbol, currency: res.meta?.currency ?? null,
    price,
    trailing_12m_dividends: trailing,
    trailing_yield_pct: price && trailing ? round((trailing / price) * 100, 3) : null,
    years_of_rising_totals: growthStreak(byYear, lastComplete),
    five_year_growth_pct_a_year: first && last ? round(((last / first) ** (1 / 5) - 1) * 100, 2) : null,
    payments: dividends.length,
    by_year: { columns: ["year", "total"], rows: Object.entries(byYear).sort(([x], [y]) => y.localeCompare(x)).map(([y, x]) => [Number(y), x]) },
    columns: ["ex_date", "amount"],
    rows: dividends.slice(-24).reverse(),
    splits: { columns: ["date", "ratio"], rows: splits.reverse() },
    limits: ["From Yahoo Finance, not the company; amounts are per share adjusted for later splits, so an old payment is smaller than was paid at the time. Special dividends count in the totals, and a year's total depends on how many ex-dates fell in it. A streak here only reaches back as far as the years asked for."],
    source: url,
  };
}
