// earnings_move: the move the options market prices for a company's next results, beside the moves its shares made
// after its past results. The next release is estimated from the same quarter a year earlier (earnings_calendar's
// window); the price is the at-the-money straddle of the first expiration that takes in the reaction session, from
// Cboe's delayed quotes, with the last expiration before it for comparison; the past moves are close to close across
// each results release (8-K item 2.02), from the session before to the first session after it. No key.
import { z } from "zod";

import { earningsCalendar } from "./earnings.mjs";
import { chain } from "./options.mjs";
import { NotFound } from "./sources.mjs";
import { priceHistory } from "./tools.mjs";

export const earningsMoveInput = z.object({
  company: z.string().min(1).max(20).describe("A company's ticker (NVDA, AAPL)."),
  releases: z.number().int().min(2).max(20).optional().describe("Past results releases measured, latest first; default 8."),
}).strict();

const DAY = 86400000;
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const plusDays = (date, n) => new Date(Date.parse(date) + n * DAY).toISOString().slice(0, 10);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
// Results out after the close move the shares the next session; before the open or during it, the same session.
const afterClose = (timing) => /after the close/i.test(String(timing ?? ""));

// The at-the-money straddle of one expiration: the strike nearest the share price, its call's and put's mid prices.
export function straddle(contracts, expiry, spot) {
  const of = contracts.filter((c) => c.expiry === expiry);
  if (!of.length || !spot) return null;
  const k = of.reduce((b, c) => (b == null || Math.abs(c.strike - spot) < Math.abs(b - spot) ? c.strike : b), null);
  const call = of.find((c) => c.strike === k && c.type === "call"), put = of.find((c) => c.strike === k && c.type === "put");
  if (call?.mid == null || put?.mid == null) return null;
  return { expiration: expiry, strike: k, price: round(call.mid + put.mid, 4), move_pct: round((100 * (call.mid + put.mid)) / spot), atm_iv: call.iv && put.iv ? round((call.iv + put.iv) / 2, 4) : null };
}

// The results' own move from the term structure: the expiration after them carries its normal variance plus the
// results', so with the expiration before them as the normal rate (Cboe's volatilities are annualized over calendar
// days), the results' variance is iv_after^2 * t_after - iv_before^2 * (t_after - 1 day). Its square root is one
// standard deviation of the reaction; sqrt(2 / pi) of that is the expected size of the move either way.
export function resultsMove(after, before, asOf) {
  if (!after?.atm_iv || !before?.atm_iv) return null;
  const t = (Date.parse(after.expiration) - Date.parse(asOf)) / DAY / 365;
  const v = after.atm_iv ** 2 * t - before.atm_iv ** 2 * Math.max(0, t - 1 / 365);
  if (!(t > 0) || !(v > 0)) return null;
  return { one_sd_pct: round(100 * Math.sqrt(v)), expected_abs_pct: round(100 * Math.sqrt(v) * Math.sqrt(2 / Math.PI)) };
}

// Each past release's move: from the close of the session before the reaction session to the reaction session's close.
// A reaction session still trading (open, a day that has not closed yet) has no move yet.
export function pastMoves(releases, dates, closes, open = null) {
  const at = (date) => dates.findIndex((d) => d >= date);
  return releases.map(([date, , , timing]) => {
    const i = at(afterClose(timing) ? plusDays(date, 1) : date);
    if (i <= 0 || Date.parse(dates[i]) - Date.parse(date) > 5 * DAY || dates[i] === open) return [date, timing, null, null];
    return [date, timing, dates[i], round((closes[i] / closes[i - 1] - 1) * 100)];
  });
}

export async function earningsMove(session, args) {
  const a = earningsMoveInput.parse(args);
  const n = a.releases ?? 8;
  const cal = await earningsCalendar(session, { company: a.company });
  const releases = (cal.releases?.rows ?? []).slice(0, n);
  if (!releases.length) throw new NotFound(`No results releases (8-K item 2.02) were found for ${a.company}.`);
  const next = cal.next ?? null;
  const symbol = String(a.company).trim().toUpperCase();
  const limits = [];
  // The options: the first expiration that takes in the reaction session on the expected date, and the last one that
  // ends before the earliest reaction session the window allows.
  let implied = null, before = null, results = null, spot = null;
  try {
    const c = await chain(session, symbol);
    spot = c.spot;
    const asOf = String(c.as_of ?? "").slice(0, 10) || new Date(session.now()).toISOString().slice(0, 10);
    const expiries = [...new Set(c.contracts.map((x) => x.expiry))].filter((e) => e >= asOf).sort();
    if (next?.expected && next.status !== "past") {
      const lag = afterClose(next.last_year_timing) ? 1 : 0;
      const after = expiries.find((e) => e >= plusDays(next.expected, lag));
      const pre = expiries.filter((e) => e < plusDays(next.earliest ?? next.expected, lag)).at(-1);
      implied = after ? straddle(c.contracts, after, spot) : null;
      before = pre ? straddle(c.contracts, pre, spot) : null;
      results = resultsMove(implied, before, asOf);
      if (!after) limits.push(`Cboe lists no ${symbol} option expiring after ${next.expected}, so no price for the move is given.`);
      else if (next.latest && after < plusDays(next.latest, lag)) limits.push(`${after} follows the expected date; if the results come late in their window (by ${next.latest}), it expires before them.`);
      if (results && Date.parse(after) - Date.parse(pre) > 14 * DAY) limits.push(`The expirations either side of the results (${pre} and ${after}) are ${Math.round((Date.parse(after) - Date.parse(pre)) / DAY)} days apart, so the results' own move rests on volatility holding steady across that span.`);
    }
  } catch (err) {
    limits.push(`The options could not be read: ${String(err?.message ?? err).slice(0, 200)}`);
  }
  // The shares: closes from a fortnight before the oldest release measured to today.
  let moves = releases.map(([date, , , timing]) => [date, timing, null, null]);
  try {
    const p = await priceHistory(session, { symbol, start: plusDays(releases.at(-1)[0], -14), end: new Date(session.now()).toISOString().slice(0, 10) });
    // US sessions close by 21:00 UTC; before then today's bar is still moving.
    const now = new Date(session.now());
    moves = pastMoves(releases, p.dates, p.close, now.getUTCHours() < 21 ? now.toISOString().slice(0, 10) : null);
  } catch (err) {
    limits.push(`The share prices could not be read: ${String(err?.message ?? err).slice(0, 200)}`);
  }
  const sizes = moves.map((m) => m[3]).filter((x) => x != null).map(Math.abs);
  const stats = sizes.length ? {
    releases_measured: sizes.length, average_abs_move_pct: round(sizes.reduce((s, x) => s + x, 0) / sizes.length), median_abs_move_pct: round(median(sizes)),
    largest: moves.filter((m) => m[3] != null).reduce((b, m) => (!b || Math.abs(m[3]) > Math.abs(b[3]) ? m : b), null)?.slice(2, 4) ?? null,
    larger_than_implied: results ? sizes.filter((x) => x > results.expected_abs_pct).length : null,
  } : null;
  const name = cal.company?.name ?? symbol;
  const summary = [];
  if (next && next.status !== "past") summary.push(`${name}'s next results are expected about ${next.expected} (estimated from the same quarter a year earlier, between ${next.earliest} and ${next.latest}${next.last_year_timing ? `; last year ${next.last_year_timing}` : ""}).`);
  if (implied) summary.push(`Options expiring ${implied.expiration} price a move of about ${implied.move_pct}% either way by then, the results included (the at-the-money straddle, $${implied.price} on a $${round(spot)} share price)${results ? `; set against the ${before.expiration} expiration before the results, the results alone account for a move of about ${results.expected_abs_pct}% (one standard deviation ${results.one_sd_pct}%)` : ""}.`);
  if (stats) summary.push(`Over its last ${stats.releases_measured} releases the shares moved ${stats.average_abs_move_pct}% on average in the session after the results (median ${stats.median_abs_move_pct}%, largest ${stats.largest?.[1]}% on ${stats.largest?.[0]})${results ? `; ${stats.larger_than_implied} of ${stats.releases_measured} moved more than the ${results.expected_abs_pct}% the options imply for the results alone` : ""}.`);
  return {
    company: cal.company ?? { ticker: symbol }, next, summary,
    implied_move: implied, before_results: before, results_alone: results, share_price: spot,
    past_moves: { columns: ["release", "timing", "reaction_session", "move_pct"], rows: moves },
    stats,
    reading: "implied_move is the at-the-money straddle of the first expiration after the expected results, as a share of the price: the move either way options price by then, the results included. results_alone backs the results' own move out of the volatilities of that expiration and the one before the results (expected size and one standard deviation), the measure to set beside past_moves, each release's move from the session before the reaction session to its close.",
    source: `${cal.source ?? "SEC EDGAR 8-K item 2.02"}; https://www.cboe.com/delayed_quotes/${symbol.toLowerCase()}/quote_table (delayed option quotes); Yahoo Finance daily closes`,
    limits: [
      "The release date is estimated from the same quarter a year earlier, not announced; the company's own announcement is authoritative.",
      "implied_move prices every day to its expiration, the results included; results_alone backs the results out on the assumption that the other days carry the volatility of the expiration before them. Cboe's quotes are delayed at least 15 minutes; past moves are close to close and include the market's own move that day.",
      ...limits,
      "Not investment advice.",
    ],
  };
}
