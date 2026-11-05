// options_sentiment: how much protection options traders buy, from Cboe's daily market statistics: the total, equity,
// index, ETF, VIX and SPX put/call ratios of the latest trading day with the calls and puts traded, and the total,
// equity and index ratios day by day with their 10- and 20-day averages. A day's file never changes once published.
// No key.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";

const DAY_FILE = (iso) => `https://cdn.cboe.com/data/us/options/market_statistics/daily/${iso}_daily_options`;
const PAGE = "https://www.cboe.com/us/options/market_statistics/daily/";
const RATIOS = [["TOTAL PUT/CALL RATIO", "total"], ["EQUITY PUT/CALL RATIO", "equity"], ["INDEX PUT/CALL RATIO", "index"], ["EXCHANGE TRADED PRODUCTS PUT/CALL RATIO", "etp"], ["CBOE VOLATILITY INDEX (VIX) PUT/CALL RATIO", "vix"], ["SPX + SPXW PUT/CALL RATIO", "spx"]];
const GROUPS = [["SUM OF ALL PRODUCTS", "total"], ["EQUITY OPTIONS", "equity"], ["INDEX OPTIONS", "index"], ["EXCHANGE TRADED PRODUCTS", "etp"], ["SPX + SPXW", "spx"]];

export const putCallInput = z.object({
  days: z.number().int().min(1).max(60).optional().describe("Trading days shown, latest last; default 20."),
}).strict();

const DAY = 86400000;
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

// The weekdays from a date back, newest first (Cboe publishes none for weekends and holidays).
export function weekdaysBack(fromMs, count) {
  const out = [];
  for (let t = fromMs; out.length < count; t -= DAY) { const d = new Date(t).getUTCDay(); if (d !== 0 && d !== 6) out.push(new Date(t).toISOString().slice(0, 10)); }
  return out;
}

export function dayStats(json) {
  const ratio = (name) => { const v = Number(json?.ratios?.find((r) => r.name === name)?.value); return Number.isFinite(v) ? v : null; };
  const volume = (group) => json?.[group]?.find((x) => x.name === "VOLUME") ?? null;
  return { ratios: Object.fromEntries(RATIOS.map(([name, key]) => [key, ratio(name)])), volumes: Object.fromEntries(GROUPS.map(([g, key]) => [key, volume(g) && { calls: volume(g).call, puts: volume(g).put }])) };
}

export async function putCallRatios(session, args) {
  const a = putCallInput.parse(args);
  const want = a.days ?? 20;
  // Today's file comes the next morning; the window reaches back far enough for holidays.
  const dates = weekdaysBack(session.now() - DAY, want + 25);
  const days = [];
  for (let i = 0; i < dates.length && days.length < want; i += 8) {
    const got = await Promise.all(dates.slice(i, i + 8).map((d) => getJson(session, DAY_FILE(d), { retries: 0, timeoutMs: 10000 }).then((j) => [d, dayStats(j)], () => null)));
    for (const g of got) if (g && g[1].ratios.total != null) days.push(g);
  }
  if (!days.length) throw new NotFound("Cboe published no daily options statistics for the last weeks.");
  days.sort((x, y) => x[0].localeCompare(y[0]));
  const shown = days.slice(-want);
  const [date, latest] = shown.at(-1);
  const series = (k) => shown.map(([, s]) => s.ratios[k]);
  const averages = Object.fromEntries(["total", "equity", "index"].map((k) => [k, { avg_10d: round(avg(series(k).slice(-10))), avg_20d: round(avg(series(k).slice(-20))) }]));
  return {
    date,
    summary: [`On ${date} the equity put/call ratio on Cboe's options was ${latest.ratios.equity} (its 10-day average ${averages.equity.avg_10d}), the total ${latest.ratios.total} and the index ${latest.ratios.index}; above 1, more puts traded than calls.`],
    latest: { ratios: latest.ratios, volumes: latest.volumes },
    averages,
    columns: ["date", "total", "equity", "index", "spx"], rows: shown.map(([d, s]) => [d, s.ratios.total, s.ratios.equity, s.ratios.index, s.ratios.spx]),
    reading: "Puts traded over calls traded on Cboe's exchanges each trading day, by product; volumes are contracts.",
    source: `${DAY_FILE(date)} (${PAGE})`,
    limits: [
      "Cboe's own exchanges only, not every US options exchange; a day's statistics appear the next morning.",
      "A high ratio means more hedging or more bearish bets, and is often read the other way, as a sign of fear near a low. Not investment advice.",
    ],
  };
}
