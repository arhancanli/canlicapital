// Why a stock moved on a day: its return against the market's that day and how unusual it was for
// this stock, the company's SEC filings in the days around it (an 8-K's items named), and the
// press's headlines from those days, in one call. It gathers the evidence; it does not decide the
// cause, and says so.
import { z } from "zod";

import { news } from "./news.mjs";
import { listFilings, priceHistory } from "./tools.mjs";

export const explainInput = z.object({
  symbol: z.string().min(1).max(20).regex(/^[A-Za-z0-9.\-]+$/, "a US ticker such as NVDA or BRK.B").describe("A US-listed stock's ticker."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("The trading day of the move (YYYY-MM-DD)."),
  benchmark: z.string().min(1).max(20).optional().describe("The market to compare with; default SPY."),
  window_days: z.number().int().min(0).max(5).optional().describe("Calendar days either side of the date for filings and news; default 2."),
  news: z.boolean().optional().describe("Add the press's headlines (GDELT, about five seconds). Default true."),
}).strict();

const shiftDay = (d, k) => new Date(Date.parse(`${d}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);

export async function explainMove(session, args) {
  const a = explainInput.parse(args);
  const w = a.window_days ?? 2, bench = a.benchmark ?? "SPY";
  const start = shiftDay(a.date, -400), end = shiftDay(a.date, 7);
  const [stock, market] = await Promise.all([priceHistory(session, { symbol: a.symbol, start, end }), priceHistory(session, { symbol: bench, start, end })]);
  const move = abnormalMove(stock, market, a.date);
  const filings = await listFilings(session, { company: a.symbol, since: shiftDay(a.date, -w), until: shiftDay(a.date, w), limit: 20 }).catch((err) => ({ error: String(err.message) }));
  const out = {
    symbol: a.symbol.toUpperCase(), date: a.date, benchmark: bench, move,
    filings: filings.error ? { note: filings.error } : { window: [shiftDay(a.date, -w), shiftDay(a.date, w)], columns: filings.columns, rows: filings.rows },
  };
  if (a.news ?? true) {
    // At most eight seconds for the press: a slow or refusing news source never holds up the rest.
    let timer;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve({ error: "GDELT did not answer within eight seconds." }), 8000); });
    const n = await Promise.race([news(session, { company: a.symbol, start: shiftDay(a.date, -w), end: shiftDay(a.date, w), limit: 25, tone: false }, { attempts: 1 }).catch((err) => ({ error: String(err.message) })), late]);
    clearTimeout(timer);
    out.news = n.error ? { note: `${n.error.slice(0, 160)} News can be asked again with the news tool.` }
      : { columns: n.articles.columns, rows: n.articles.rows, searched_as: n.company?.searched_as ?? null, ...(n.articles.rows.length ? {} : { note: "No article in GDELT's index for those days (it covers about the last three months)." }) };
  }
  out.sources = [stock.source, market.source].filter(Boolean);
  out.meaning = "abnormal_return is the day's return minus what a one-year market model (alpha + beta x the benchmark's return) predicts; z_score divides it by the model's residual volatility; larger_moves_in_prior_year counts days of the past year with a residual at least as large. Filings and headlines are the evidence near the day, not a proven cause.";
  out.limits = ["Prices are the provider's (price_history); a split or a data error on the day distorts the move.", "A filing or headline near the day is not proven to be the cause; read them.", "Not investment advice."];
  return out;
}


// The day's return against a one-year market model fitted on the days before it. stock and market
// are price_history results (dates and closes).
export function abnormalMove(stock, market, date) {
  const i = stock.dates.indexOf(date);
  if (i < 1) throw new Error(`${stock.symbol ?? "The stock"} has no close on ${date} after a prior close in the price data; pick a trading day (its closes run ${stock.start} to ${stock.end}).`);
  const mIdx = new Map(market.dates.map((d, k) => [d, k]));
  // Daily returns on days both traded, the year before the move: a market model by least squares.
  const pairs = [];
  for (let k = Math.max(1, i - 252); k < i; k += 1) {
    const m1 = mIdx.get(stock.dates[k]), m0 = mIdx.get(stock.dates[k - 1]);
    if (m1 === undefined || m0 === undefined) continue;
    pairs.push([stock.close[k] / stock.close[k - 1] - 1, market.close[m1] / market.close[m0] - 1]);
  }
  const r = stock.close[i] / stock.close[i - 1] - 1;
  const mi = mIdx.get(date), mp = mIdx.get(stock.dates[i - 1]);
  const rm = mi !== undefined && mp !== undefined ? market.close[mi] / market.close[mp] - 1 : null;
  let move = { return: round(r, 6), market_return: rm === null ? null : round(rm, 6), previous_close: stock.close[i - 1], close: stock.close[i] };
  if (pairs.length >= 60 && rm !== null) {
    const n = pairs.length, my = pairs.reduce((s, p) => s + p[0], 0) / n, mx = pairs.reduce((s, p) => s + p[1], 0) / n;
    let sxy = 0, sxx = 0;
    for (const [y, x] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
    const beta = sxy / sxx, alpha = my - beta * mx;
    const resid = pairs.map(([y, x]) => y - alpha - beta * x), sd = Math.sqrt(resid.reduce((s, e) => s + e * e, 0) / (n - 2));
    const ab = r - alpha - beta * rm;
    const bigger = resid.filter((e) => Math.abs(e) >= Math.abs(ab)).length;
    move = { ...move, beta: round(beta, 3), abnormal_return: round(ab, 6), z_score: round(ab / sd, 2), days_in_model: n, larger_moves_in_prior_year: bigger,
      reading: Math.abs(ab / sd) >= 3 ? "a rare move for this stock: its own news, not the market" : Math.abs(ab / sd) >= 2 ? "an unusual move beyond what the market explains" : "within this stock's usual range after the market's move" };
  }
  return move;
}

const round = (x, d) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
