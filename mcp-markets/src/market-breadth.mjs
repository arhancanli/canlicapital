// market_breadth: how many of an index's members take part in its moves, computed from the members themselves: the
// share above their 50- and 200-day averages, those that rose and fell on the day, new 52-week highs and lows, how far
// the typical member is below its high, and the average member's return beside the index's own over a day, a month,
// the year to date and a year; the shares above each average session by session; and, for the S&P 500, the same by
// sector. Members and weights are State Street's daily holdings of SPY, MDY, DIA or a Select Sector SPDR; prices are
// each member's daily closes. No key.
import { z } from "zod";

import { dailyHoldings } from "./funds.mjs";
import { getJson, NotFound, own } from "./sources.mjs";

const INDEXES = { "s&p 500": "SPY", "sp 500": "SPY", spx: "SPY", spy: "SPY", "s&p 400": "MDY", "s&p midcap 400": "MDY", midcap: "MDY", mdy: "MDY", dow: "DIA", "dow jones": "DIA", "dow jones industrial average": "DIA", djia: "DIA", dia: "DIA" };
// The Select Sector SPDRs split the S&P 500 by GICS sector.
const SECTORS = { XLK: "Information Technology", XLF: "Financials", XLV: "Health Care", XLE: "Energy", XLI: "Industrials", XLY: "Consumer Discretionary", XLP: "Consumer Staples", XLU: "Utilities", XLB: "Materials", XLRE: "Real Estate", XLC: "Communication Services" };
const SPARK = (symbols) => `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(symbols.join(","))}&range=1y&interval=1d`;
const DAY = 86400000;

export const breadthInput = z.object({
  index: z.string().min(2).max(40).optional().describe("S&P 500 (default), S&P 400, Dow, or a Select Sector SPDR's ticker (XLK, XLF, XLE...) for breadth inside one sector."),
  by_sector: z.boolean().optional().describe("S&P 500: the same measures for each of its eleven sectors (reads the Select Sector SPDRs' holdings too)."),
  days: z.number().int().min(1).max(40).optional().describe("Sessions of daily breadth shown, latest last; default 20."),
}).strict();

const round = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const pct = (n, of) => (of ? round((100 * n) / of) : null);
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const yahoo = (ticker) => ticker.replace(/\./g, "-");

// Whether the quote's regular session has ended: its trading period's end when that is the quote's own day (after the
// close the period still describes it), or else 16:00 in New York. During the session its price is live, not a close.
export function closed(m) {
  const end = m.currentTradingPeriod?.regular?.end, day = (s) => new Date(s * 1000).toISOString().slice(0, 10);
  if (end && day(end) === day(m.regularMarketTime)) return m.regularMarketTime >= end;
  return (((m.regularMarketTime + (m.gmtoffset ?? -18000)) % 86400) + 86400) % 86400 >= 16 * 3600;
}

// Each member's daily closes over the past year, twenty to a request. Until the day's bar is filled in, the latest
// session's close is the quote's regular market price, once that session has closed; a session still trading is left out.
async function yearOfCloses(session, tickers) {
  const out = new Map(), batches = [];
  for (let i = 0; i < tickers.length; i += 20) batches.push(tickers.slice(i, i + 20));
  const worker = async () => {
    for (let b; (b = batches.shift());) {
      try {
        const d = await getJson(session, SPARK(b), { timeoutMs: 15000 });
        for (const x of d?.spark?.result ?? []) {
          const r = x?.response?.[0], ts = r?.timestamp ?? [], close = r?.indicators?.quote?.[0]?.close ?? [], m = r?.meta ?? {};
          // US sessions open at 13:30 or 14:30 UTC and close by 21:00, so a bar's UTC date is its session's.
          const rows = ts.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), close[i]]);
          if (rows.length && rows.at(-1)[1] == null && m.regularMarketPrice > 0 && m.regularMarketTime && closed(m) && new Date(m.regularMarketTime * 1000).toISOString().slice(0, 10) === rows.at(-1)[0]) rows.at(-1)[1] = m.regularMarketPrice;
          const kept = rows.filter(([, v]) => Number.isFinite(v) && v > 0);
          if (kept.length) out.set(x.symbol, kept);
        }
      } catch { /* a failed batch leaves its members unpriced, and the count says so */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

// One member on one session (its index i in its own closes): above its averages, its change on the day, at a 52-week
// high or low (closing prices, against the year before), and how far below its high it closed.
export function memberOn(c, i) {
  const avg = (k) => (i + 1 >= k ? c.slice(i + 1 - k, i + 1).reduce((s, x) => s + x, 0) / k : null);
  const prior = c.slice(Math.max(0, i - 250), i), last = c[i];
  const high = Math.max(last, ...prior), low = Math.min(last, ...prior);
  const s50 = avg(50), s200 = avg(200);
  return {
    above50: s50 == null ? null : last > s50, above200: s200 == null ? null : last > s200,
    move: i > 0 ? Math.sign(last - c[i - 1]) : null,
    newHigh: prior.length >= 240 && last > Math.max(...prior), newLow: prior.length >= 240 && last < Math.min(...prior),
    fromHigh: (last / high - 1) * 100, low,
  };
}

// The share above each average and the day's moves across members, on one session.
export function across(list) {
  const known = (k) => list.filter((x) => x[k] != null);
  const above50 = list.filter((x) => x.above50).length, above200 = list.filter((x) => x.above200).length;
  return {
    members: list.length,
    // Each share is of the members with closes enough for that average.
    above_50d: above50, with_50d: known("above50").length, pct_above_50d: pct(above50, known("above50").length),
    above_200d: above200, with_200d: known("above200").length, pct_above_200d: pct(above200, known("above200").length),
    advancers: list.filter((x) => x.move > 0).length, decliners: list.filter((x) => x.move < 0).length, unchanged: list.filter((x) => x.move === 0).length,
    new_highs: list.filter((x) => x.newHigh).length, new_lows: list.filter((x) => x.newLow).length,
    median_from_high_pct: round(median(list.map((x) => x.fromHigh))),
    down_20pct_from_high: list.filter((x) => x.fromHigh <= -20).length,
  };
}

// A member's close on a date: the last on or before it, or its first close when that is a few days after (a year's
// closes start the session after the same day a year before).
function closeOn(rows, date, slack = 10) {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i][0] <= date) return Date.parse(rows[i][0]) >= Date.parse(date) - slack * DAY ? rows[i][1] : null;
  return rows.length && Date.parse(rows[0][0]) <= Date.parse(date) + slack * DAY ? rows[0][1] : null;
}

// The average member's return, and the index's own rebuilt from the shares the fund holds: the index moves as the sum
// of shares times price, so from a date to the latest close it returned sum(s * p1) / sum(s * p0) - 1.
export function returns(members, date) {
  const r = members.map((m) => { const p0 = closeOn(m.rows, date); return p0 == null ? null : { s: m.shares, p0, p1: m.rows.at(-1)[1] }; }).filter(Boolean);
  if (!r.length) return [null, null, 0];
  const held = r.filter((x) => x.s > 0);
  const index = held.length ? held.reduce((t, x) => t + x.s * x.p1, 0) / held.reduce((t, x) => t + x.s * x.p0, 0) - 1 : null;
  return [round(100 * r.reduce((t, x) => t + (x.p1 / x.p0 - 1), 0) / r.length, 2), index == null ? null : round(100 * index, 2), r.length];
}

export async function marketBreadth(session, args) {
  const a = breadthInput.parse(args);
  if (session.env?.CANLI_KEYLESS_PRICES === "0") throw new Error("Breadth needs each member's prices, which are off on this server (CANLI_KEYLESS_PRICES=0). On the hosted server, run the local one: npx -y canli-mcp.");
  const asked = String(a.index ?? "S&P 500").trim();
  const etf = own(INDEXES, asked.toLowerCase().replace(/\s+index$/, "").replace(/\s+/g, " ")) ?? (own(SECTORS, asked.toUpperCase()) ? asked.toUpperCase() : null);
  if (!etf) throw new NotFound(`market_breadth reads the S&P 500, the S&P 400, the Dow and the eleven Select Sector SPDRs (${Object.keys(SECTORS).join(", ")}); "${asked}" is not one of them.`);
  if (a.by_sector && etf !== "SPY") throw new Error("by_sector splits the S&P 500; for one sector, name its Select Sector SPDR as the index (XLK, XLF...).");
  const holdings = await dailyHoldings(session, etf, 5000);
  const listed = holdings.rows.map(([name, ticker, , weight, shares]) => ({ name, ticker, weight, shares }));
  const closes = await yearOfCloses(session, listed.map((m) => yahoo(m.ticker)));
  const priced = listed.map((m) => ({ ...m, rows: closes.get(yahoo(m.ticker)) })).filter((m) => m.rows?.length);
  if (priced.length < listed.length / 2) throw new Error(`Prices came back for ${priced.length} of ${holdings.index}'s ${listed.length} members; too few to measure breadth. Retry in a minute.`);
  // The latest session most members have; a member not priced for it is left out of that session's counts.
  const tally = new Map();
  for (const m of priced) tally.set(m.rows.at(-1)[0], (tally.get(m.rows.at(-1)[0]) ?? 0) + 1);
  const session0 = [...tally].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? 1 : -1))[0][0];
  const current = priced.filter((m) => m.rows.at(-1)[0] === session0);
  const sessions = current.reduce((best, m) => (m.rows.length > best.length ? m.rows.map(([d]) => d) : best), []);
  const shown = sessions.slice(-(a.days ?? 20));
  const at = (m, date) => { const i = m.index.get(date); return i == null ? null : memberOn(m.closes, i); };
  for (const m of current) { m.closes = m.rows.map(([, v]) => v); m.index = new Map(m.rows.map(([d], i) => [d, i])); }
  const latest = across(current.map((m) => memberOn(m.closes, m.closes.length - 1)));
  const daily = shown.map((d) => { const x = across(current.map((m) => at(m, d)).filter(Boolean)); return [d, x.pct_above_50d, x.pct_above_200d, x.advancers, x.decliners]; });
  const y = Number(session0.slice(0, 4));
  const ago = (days) => new Date(Date.parse(session0) - days * DAY).toISOString().slice(0, 10);
  const periods = [["day", sessions.at(-2)], ["month", ago(30)], ["year_to_date", `${y - 1}-12-31`], ["year", ago(365)]];
  const rets = periods.map(([p, d]) => [p, ...(d ? returns(current, d) : [null, null, 0])]);
  const top10 = holdings.top_10_weight;
  const name = holdings.index, dow = etf === "DIA";
  const summary = [
    `On ${session0}, ${latest.above_200d} of the ${latest.with_200d} ${name} members ${latest.with_200d === current.length ? "priced" : "with 200 sessions of closes"} (${latest.pct_above_200d}%) closed above their 200-day average and ${latest.above_50d}${latest.with_50d === latest.with_200d ? "" : ` of ${latest.with_50d}`} (${latest.pct_above_50d}%) above their 50-day; ${latest.advancers} rose and ${latest.decliners} fell${latest.unchanged ? ` (${latest.unchanged} unchanged)` : ""}; ${latest.new_highs} closed at a 52-week high and ${latest.new_lows} at a 52-week low.`,
    `The typical member closed ${Math.abs(latest.median_from_high_pct)}% below its 52-week closing high; ${latest.down_20pct_from_high} (${pct(latest.down_20pct_from_high, current.length)}%) are 20% or more below theirs.`,
  ];
  const [yr, mo] = [rets.find((r) => r[0] === "year"), rets.find((r) => r[0] === "month")];
  if (yr[1] != null) summary.push(`Over the past year the average member returned ${yr[1]}%${yr[2] != null ? ` and the index, weighted ${dow ? "by share price as the Dow is" : "by size"}, about ${yr[2]}%` : ""}${mo[1] != null ? `; over the month ${mo[1]}%${mo[2] != null ? ` against ${mo[2]}%` : ""}` : ""}.${top10 != null && !dow ? ` The ten largest members are ${round(top10 * 100)}% of the index.` : ""}`);
  if (daily.length > 1) summary.push(`${daily.length - 1} sessions earlier (${daily[0][0]}), ${daily[0][2]}% were above their 200-day average and ${daily[0][1]}% above their 50-day.`);
  let sectors = null;
  if (a.by_sector) {
    const of = new Map();
    const files = await Promise.all(Object.keys(SECTORS).map((s) => dailyHoldings(session, s, 5000).then((h) => [s, h], () => [s, null])));
    for (const [s, h] of files) for (const r of h?.rows ?? []) of.set(r[1], SECTORS[s]);
    const groups = new Map();
    for (const m of current) { const s = of.get(m.ticker) ?? "not in a sector file"; if (!groups.has(s)) groups.set(s, []); groups.get(s).push(m); }
    sectors = {
      columns: ["sector", "members", "pct_above_50d", "pct_above_200d", "advancers", "decliners", "new_highs", "new_lows", "median_from_high_pct", "average_return_1y_pct"],
      rows: [...groups].map(([s, ms]) => { const x = across(ms.map((m) => memberOn(m.closes, m.closes.length - 1))); return [s, x.members, x.pct_above_50d, x.pct_above_200d, x.advancers, x.decliners, x.new_highs, x.new_lows, x.median_from_high_pct, returns(ms, ago(365))[0]]; })
        .sort((p, q) => (q[3] ?? -1) - (p[3] ?? -1)),
      missing_files: files.filter(([, h]) => !h).map(([s]) => s),
    };
  }
  return {
    index: name, through: etf, holdings_as_of: holdings.as_of, session: session0,
    members: listed.length, priced: current.length,
    summary,
    latest: { ...latest, top_10_weight: top10 },
    returns: { columns: ["period", "average_member_pct", "index_weighted_pct", "members_with_prices"], rows: rets },
    daily: { columns: ["date", "pct_above_50d", "pct_above_200d", "advancers", "decliners"], rows: daily },
    ...(sectors ? { sectors } : {}),
    reading: "Breadth across the index's members on the latest session: the share closing above their 50- and 200-day averages, how many rose and fell, closes at a 52-week high or low, and the median distance below a 52-week closing high. returns sets the average member's return beside the index's own, rebuilt from the shares the fund holds; daily gives the shares above each average for each recent session.",
    source: `${holdings.source} (members and weights); https://query1.finance.yahoo.com/v7/finance/spark?symbols=<members>&range=1y&interval=1d (daily closes, Yahoo Finance)`,
    limits: [
      "Computed here from each member's daily closes (Yahoo Finance's quotes, no key; CANLI_KEYLESS_PRICES=0 turns them off) and State Street's holdings for the date shown. Averages and highs are of closing prices, and today's members stand in for every past day, so a company added after rising counts as if it had always been a member.",
      `The index's own return is rebuilt from the shares the fund holds and each member's price change. Checked on 4 November 2026: the rebuilt Dow matched the index itself over the day and the month, and the rebuilt S&P 500 was within 0.1 points of SPY's price change over them (about a point above it over the year, as members added during the year bring their gains with them). A session still trading is left out until it closes.${current.length < listed.length ? ` ${listed.length - current.length} of ${listed.length} members had no price for ${session0} and are left out.` : ""}`,
      "Not investment advice.",
    ],
  };
}
