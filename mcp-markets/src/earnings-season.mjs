// earnings_season: how the S&P 500's reporting season is going, from Nasdaq's daily earnings calendars with no key: how
// many members have reported in the window, the share that beat, matched or missed the consensus EPS estimate, the
// median surprise, how the ten largest did, the largest beats and misses, the same by sector on request, and the
// members due in the coming days. Members and weights are State Street's daily holdings of SPY.
import { z } from "zod";

import { dailyHoldings, SECTOR_FUNDS } from "./funds.mjs";
import { num } from "./nasdaq.mjs";
import { getJson, NotFound } from "./sources.mjs";

const API = "https://api.nasdaq.com/api/calendar/earnings";
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const WHEN = Object.freeze({ "time-pre-market": "before the open", "time-after-hours": "after the close" });
const DAY = 86400000;

export const seasonInput = z.object({
  since: DATE.optional().describe("The first report date counted; default the day after the last calendar quarter ended."),
  until: DATE.optional().describe("The last report date counted; default today. At most 70 days after since."),
  by_sector: z.boolean().optional().describe("The same for each of the S&P 500's eleven sectors (reads the Select Sector SPDRs' holdings too)."),
  limit: z.number().int().min(1).max(25).optional().describe("Largest beats and misses listed, each; default 5."),
  list: z.number().int().min(0).max(503).optional().describe("Reports listed, largest companies first; default 30."),
  symbols: z.array(z.string().min(1).max(12)).max(50).optional().describe("List these companies' results (and whether each is still due) instead of the largest; the season's tally still covers every member."),
}).strict();

const round = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const key = (ticker) => String(ticker ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const weekdays = (from, to) => { const out = []; for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += DAY) { const d = new Date(t).getUTCDay(); if (d > 0 && d < 6) out.push(iso(t)); } return out; };
// The day after the last calendar quarter that has ended.
export const seasonStart = (today) => { const [y, m] = today.split("-").map(Number); const q = Math.floor((m - 1) / 3) * 3; return q === 0 ? `${y}-01-01` : `${y}-${String(q + 1).padStart(2, "0")}-01`; };

// A result against the consensus: the surprise as the change over the estimate's size, as Nasdaq shows it.
export function surprise(eps, consensus) {
  if (eps == null || consensus == null) return null;
  return consensus === 0 ? null : ((eps - consensus) / Math.abs(consensus)) * 100;
}

// The season's tally over the members that reported: beats, matches and misses, and the median surprise. A consensus
// under ten cents is left out of the surprise, whose size it would swamp.
export function tally(reports) {
  const scored = reports.filter((r) => r.eps != null && r.consensus != null);
  const beat = scored.filter((r) => r.eps > r.consensus).length, missed = scored.filter((r) => r.eps < r.consensus).length;
  const sized = scored.filter((r) => Math.abs(r.consensus) >= 0.1 && r.surprise != null).map((r) => r.surprise);
  return {
    reported: reports.length, with_consensus: scored.length, beat, matched: scored.length - beat - missed, missed,
    beat_pct: scored.length ? round((100 * beat) / scored.length) : null, missed_pct: scored.length ? round((100 * missed) / scored.length) : null,
    median_surprise_pct: round(median(sized)),
  };
}

const read = (session, day) => getJson(session, `${API}?date=${day}`, { headers: { Accept: "application/json" }, maxAgeMs: 3600000 }).then((d) => d?.data?.rows ?? [], () => null);

export async function earningsSeason(session, args) {
  const a = seasonInput.parse(args);
  const today = iso(session.now());
  const until = a.until ?? today, since = a.since ?? seasonStart(until);
  if (since > until) throw new Error(`since (${since}) is after until (${until}).`);
  if (Date.parse(until) - Date.parse(since) > 70 * DAY) throw new Error("The window is at most 70 days; a season runs about six weeks.");
  const holdings = await dailyHoldings(session, "SPY", 5000);
  // A company with two share classes (Alphabet, Fox, News Corp) is one issuer: the first six characters of its CUSIP.
  const members = new Map(holdings.rows.map(([name, ticker, cusip, weight]) => [key(ticker), { name, ticker, weight, issuer: cusip ? String(cusip).slice(0, 6) : key(ticker) }]));
  const issuers = new Map();
  for (const m of members.values()) issuers.set(m.issuer, (issuers.get(m.issuer) ?? 0) + m.weight);
  const companies = issuers.size;
  const days = weekdays(since, until), ahead = until >= today ? weekdays(iso(Date.parse(today) + DAY), iso(Date.parse(today) + 7 * DAY)) : [];
  const pages = new Array(days.length + ahead.length);
  const all = [...days, ...ahead];
  for (let i = 0; i < all.length; i += 6) await Promise.all(all.slice(i, i + 6).map(async (d, j) => { pages[i + j] = await read(session, d); }));
  const missingDays = all.filter((d, i) => pages[i] == null && d <= until);
  if (days.length && missingDays.length === days.length) throw new NotFound("Nasdaq's earnings calendar did not answer for any day in the window.");
  // Each company's latest report in the window. A past day listed with no EPS yet is a report Nasdaq has not filled in;
  // a coming day's, one still due.
  const reports = new Map(), due = new Map(), pending = new Map();
  all.forEach((d, i) => {
    for (const r of pages[i] ?? []) {
      const m = members.get(key(r.symbol));
      if (!m) continue;
      const eps = num(r.eps), consensus = num(r.epsForecast);
      const row = { date: d, when: WHEN[r.time] ?? null, ticker: m.ticker, name: m.name, weight: issuers.get(m.issuer), fiscal_quarter: r.fiscalQuarterEnding || null, eps, consensus, estimates: num(r.noOfEsts), surprise: surprise(eps, consensus) };
      const held = reports.get(m.issuer);
      if (d <= until && eps != null) { if (!held || held.date < d || (held.date === d && m.weight > (members.get(key(held.ticker))?.weight ?? 0))) reports.set(m.issuer, row); }
      else if (d > until || d >= today) due.set(m.issuer, row);
      else if (d <= until) pending.set(m.issuer, row);
    }
  });
  for (const t of reports.keys()) { due.delete(t); pending.delete(t); }
  const list = [...reports.values()].sort((x, y) => x.date.localeCompare(y.date) || y.weight - x.weight);
  if (!list.length) throw new NotFound(`No S&P 500 member reported between ${since} and ${until} on Nasdaq's calendar.`);
  const t = tally(list), n = a.limit ?? 5;
  const asked = a.symbols ? new Set(a.symbols.map(key)) : null;
  if (asked) for (const s of asked) if (!members.has(s)) throw new NotFound(`${s} is not in SPY's holdings of ${holdings.as_of}, so it is not counted in the S&P 500's season.`);
  const waiting = [...pending.values()].sort((x, y) => y.weight - x.weight);
  const sized = list.filter((r) => r.surprise != null && Math.abs(r.consensus) >= 0.1);
  const pick = (rows) => rows.slice(0, n).map((r) => [r.ticker, r.name, r.date, r.eps, r.consensus, round(r.surprise)]);
  const largest = [...list].sort((x, y) => y.weight - x.weight).slice(0, 10);
  const signed = (x) => (x > 0 ? `+${x}` : `${x}`);
  const summary = [
    `Of the S&P 500's ${companies} companies, ${t.reported} reported results between ${list[0].date} and ${list.at(-1).date}: ${t.beat_pct}% beat the consensus EPS estimate, ${round(100 - t.beat_pct - t.missed_pct)}% matched it and ${t.missed_pct}% missed (of ${t.with_consensus} with an estimate); the median surprise was ${signed(t.median_surprise_pct)}%.`,
    `Of the ten largest that reported: ${largest.map((r) => `${r.ticker} ${r.surprise == null ? "no estimate" : `${signed(round(r.surprise))}%`}`).join(", ")}.`,
  ];
  const upcoming = [...due.values()].sort((x, y) => x.date.localeCompare(y.date) || y.weight - x.weight);
  if (waiting.length) summary.push(`${waiting.length} more were listed to report by ${waiting.reduce((m, r) => (r.date > m ? r.date : m), "")} with no figures on Nasdaq's calendar yet: ${waiting.slice(0, 8).map((r) => r.ticker).join(", ")}${waiting.length > 8 ? " and others" : ""}.`);
  if (upcoming.length) summary.push(`Due in the coming days: ${upcoming.slice(0, 8).map((r) => `${r.ticker} (${r.date}${r.when ? `, ${r.when}` : ""})`).join(", ")}${upcoming.length > 8 ? ` and ${upcoming.length - 8} more` : ""}; ${companies - t.reported - waiting.length} companies have not reported in the window.`);
  if (asked) {
    const byTicker = (map) => new Map([...map.values()].map((r) => [key(r.ticker), r]));
    const done = byTicker(reports), soon = byTicker(due), open = byTicker(pending);
    const word = (r) => (r.surprise == null ? "with no estimate to compare" : r.eps > r.consensus ? "beat" : r.eps < r.consensus ? "missed" : "matched");
    summary.unshift(...[...asked].map((s) => {
      const r = done.get(s) ?? [...done.values()].find((x) => members.get(s)?.issuer === members.get(key(x.ticker))?.issuer);
      if (r) return `${r.ticker} reported on ${r.date}: EPS ${r.eps} against a consensus of ${r.consensus ?? "none"}, ${word(r)}${r.surprise == null ? "" : ` by ${Math.abs(round(r.surprise))}%`}.`;
      const w = open.get(s) ?? soon.get(s);
      return w ? `${w.ticker} is listed for ${w.date}${w.when ? ` (${w.when})` : ""}${w.consensus != null ? ` with a consensus of ${w.consensus}` : ""}${open.has(s) ? "; Nasdaq has no figures for it yet" : ""}.` : `${members.get(s).ticker} has no report on Nasdaq's calendar between ${since} and ${until}.`;
    }));
  }
  let sectors = null;
  if (a.by_sector) {
    const of = new Map();
    const files = await Promise.all(Object.keys(SECTOR_FUNDS).map((s) => dailyHoldings(session, s, 5000).then((h) => [s, h], () => [s, null])));
    for (const [s, h] of files) for (const r of h?.rows ?? []) of.set(key(r[1]), SECTOR_FUNDS[s]);
    const groups = new Map();
    for (const r of list) { const s = of.get(key(r.ticker)) ?? "not in a sector file"; if (!groups.has(s)) groups.set(s, []); groups.get(s).push(r); }
    sectors = {
      columns: ["sector", "reported", "beat_pct", "missed_pct", "median_surprise_pct"],
      rows: [...groups].map(([s, rs]) => { const x = tally(rs); return [s, x.reported, x.beat_pct, x.missed_pct, x.median_surprise_pct]; }).sort((p, q) => (q[2] ?? -1) - (p[2] ?? -1)),
      missing_files: files.filter(([, h]) => !h).map(([s]) => s),
    };
  }
  return {
    index: "S&P 500", through: "SPY", holdings_as_of: holdings.as_of, window: { since, until }, members: members.size, companies,
    summary, tally: { ...t, listed_without_figures: waiting.length },
    largest_beats: { columns: ["symbol", "name", "date", "eps", "consensus", "surprise_pct"], rows: pick([...sized].sort((x, y) => y.surprise - x.surprise)) },
    largest_misses: { columns: ["symbol", "name", "date", "eps", "consensus", "surprise_pct"], rows: pick([...sized].filter((r) => r.surprise < 0).sort((x, y) => x.surprise - y.surprise)) },
    ...(sectors ? { sectors } : {}),
    columns: ["date", "when", "symbol", "name", "fiscal_quarter", "eps", "consensus", "surprise_pct", "estimates", "weight_in_index"],
    rows: (asked ? list.filter((r) => [...asked].some((s) => members.get(s).issuer === members.get(key(r.ticker))?.issuer)) : [...list].sort((x, y) => y.weight - x.weight).slice(0, a.list ?? 30)).map((r) => [r.date, r.when, r.ticker, r.name, r.fiscal_quarter, r.eps, r.consensus, round(r.surprise), r.estimates, round(r.weight, 4)]),
    upcoming: { columns: ["date", "when", "symbol", "name", "consensus", "estimates"], rows: upcoming.slice(0, 20).map((r) => [r.date, r.when, r.ticker, r.name, r.consensus, r.estimates]), count: upcoming.length },
    reading: "Each S&P 500 company's latest results in the window beside the consensus EPS estimate Nasdaq shows (the largest companies listed first); the surprise is the difference over the estimate's size. tally counts beats, matches and misses; upcoming lists companies due in the next week.",
    source: "https://www.nasdaq.com/market-activity/earnings (Nasdaq's calendar; the consensus is Zacks'); State Street's SPY holdings for the members",
    limits: [
      "The EPS and the consensus are as Nasdaq's calendar shows them: the consensus is Zacks' aggregate of analysts' estimates, and the EPS is the figure it is compared with, often adjusted rather than the GAAP EPS in the filing (financial_statements and verify_claims read the filed figures). The surprise is computed from the two figures shown: on 5 November 2026 it equalled Nasdaq's own on 1,408 of 1,418 reports, and the ten others, mostly REITs, carry a surprise of Nasdaq's that does not follow from its own figures.",
      `Members are SPY's holdings for ${holdings.as_of ?? "the latest day"}; a report counts in the window by the day Nasdaq lists it, whatever fiscal quarter it covers.${missingDays.length ? ` Nasdaq did not answer for ${missingDays.join(", ")}.` : ""}`,
      "Not investment advice.",
    ],
  };
}
