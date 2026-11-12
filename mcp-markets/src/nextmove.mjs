// What happened next: every past time something like this happened to a market or a stock, what
// followed each time, and how that compares with an ordinary day. It answers the question people
// really ask when a market falls, with the cases laid out instead of an opinion. It is a record, not
// a forecast, and the comparison with ordinary days is there so that a lift in stocks everywhere is
// not mistaken for something special about the moment.
import { z } from "zod";

import { priceHistory } from "./tools.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
export const nextInput = z.object({
  symbol: z.string().min(1).max(40).optional().describe("A market or ticker: S&P 500 (default), Nasdaq, AAPL, BTC-USD."),
  condition: z.enum(["fell", "rose", "below_high", "new_high"]).describe("fell or rose: by percent within days. below_high: at least percent under its highest close so far. new_high: a new highest close."),
  percent: z.number().positive().max(95).optional().describe("How far; needed for all but new_high."),
  days: z.number().int().min(1).max(504).optional().describe("For fell and rose: within this many trading days; default 21, about a month."),
  horizons: z.array(z.number().int().min(1).max(2520)).min(1).max(6).optional().describe("Trading days ahead to look; default 21, 63, 126 and 252 (a month, a quarter, six months, a year)."),
  since: DATE.optional().describe("First date to look from; default as far back as the prices go."),
  gap_days: z.number().int().min(1).max(504).optional().describe("Episodes must be at least this many trading days apart, so one slide is not counted many times; default 63."),
}).strict();

const round = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

// Days the condition first holds, oldest first, at least gap apart.
export function episodes(close, { condition, percent, days = 21, gap = 63 }) {
  const out = [];
  let high = -Infinity, last = -Infinity;
  for (let i = 0; i < close.length; i += 1) {
    const before = high;
    high = Math.max(high, close[i]);
    let hit = false;
    if (condition === "new_high") hit = i > 251 && close[i] > before;
    else if (condition === "below_high") hit = i > 0 && close[i] <= high * (1 - percent / 100);
    else {
      const from = Math.max(0, i - days);
      for (let j = from; j < i && !hit; j += 1) hit = condition === "fell" ? close[i] <= close[j] * (1 - percent / 100) : close[i] >= close[j] * (1 + percent / 100);
    }
    if (hit && i - last >= gap) { out.push(i); last = i; }
  }
  return out;
}

export function summarize(close, picked, horizons) {
  return horizons.map((h) => {
    const after = picked.filter((i) => i + h < close.length).map((i) => (close[i + h] / close[i] - 1) * 100);
    const usual = [];
    for (let i = 0; i + h < close.length; i += 1) usual.push((close[i + h] / close[i] - 1) * 100);
    const m = median(after), u = median(usual);
    return [h, after.length, round(m), round(after.filter((x) => x > 0).length / (after.length || 1) * 100, 0), after.length ? round(Math.min(...after)) : null, after.length ? round(Math.max(...after)) : null, round(u), round(usual.filter((x) => x > 0).length / (usual.length || 1) * 100, 0), m != null ? round(m - u) : null];
  });
}

export async function whatHappenedNext(session, args) {
  const a = nextInput.parse(args);
  if (a.condition !== "new_high" && !a.percent) throw new Error(`${a.condition} needs percent: how far.`);
  const symbol = a.symbol ?? "S&P 500", horizons = a.horizons ?? [21, 63, 126, 252];
  const p = await priceHistory(session, { symbol, start: a.since ?? "1950-01-01", interval: "1Day" });
  const dates = p.dates ?? [], close = p.close ?? [];
  if (close.length < 300) throw new Error(`Only ${close.length} days of prices for ${symbol}, too few to look back on.`);
  const gap = a.gap_days ?? 63, picked = episodes(close, { condition: a.condition, percent: a.percent, days: a.days ?? 21, gap });
  const rows = [...picked].reverse().slice(0, 40).map((i) => [dates[i], round(close[i], 2), ...horizons.map((h) => (i + h < close.length ? round((close[i + h] / close[i] - 1) * 100) : null))]);
  const what = a.condition === "new_high" ? "a new highest close" : a.condition === "below_high" ? `at least ${a.percent}% below its highest close so far` : `${a.condition === "fell" ? "a fall" : "a rise"} of ${a.percent}% or more within ${a.days ?? 21} trading days`;
  const lastIndex = close.length - 1, high = Math.max(...close.slice(0, lastIndex)), now = close[lastIndex], recent = close.slice(-(a.days ?? 21) - 1, -1);
  const nowHolds = a.condition === "new_high" ? now > high : a.condition === "below_high" ? now <= Math.max(high, now) * (1 - a.percent / 100) : a.condition === "fell" ? recent.some((x) => now <= x * (1 - a.percent / 100)) : recent.some((x) => now >= x * (1 + a.percent / 100));
  return {
    symbol: p.symbol ?? symbol, what, from: dates[0], to: dates[lastIndex], episodes_found: picked.length, true_today: nowHolds,
    summary: { columns: ["trading_days_ahead", "times", "median_percent", "share_higher_percent", "worst_percent", "best_percent", "all_days_median_percent", "all_days_share_higher_percent", "median_against_all_days"], rows: summarize(close, picked, horizons) },
    episodes: { columns: ["date", "close", ...horizons.map((h) => `after_${h}_days_percent`)], rows },
    meaning: `Each episode is the first day of ${what}, with later days inside ${gap} trading days not counted again. The all-days columns are the same look ahead from every day in the record, so the difference is what is special about these moments, if anything.`,
    source: p.source,
    limits: [
      "A record of what followed, not a forecast and not advice. The next time can be unlike all of these.",
      `${picked.length} episodes is a small number, and they are not independent: long stretches of one market's history carry the same few regimes.`,
      "These prices are adjusted for splits and dividends where the source adjusts them; an index's own price leaves dividends out. No costs or taxes.",
      "A single stock's record only exists because it survived; companies that did not are not in it.",
    ],
  };
}
