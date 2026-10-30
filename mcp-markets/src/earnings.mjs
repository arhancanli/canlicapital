// Earnings dates from the companies' own filings. A results release is filed on Form 8-K under Item
// 2.02 (Results of Operations and Financial Condition), so a company's 8-Ks give the dates it
// reported, and the filing index gives the time EDGAR accepted each one (Eastern time).
//
// For one company: its recent releases, the quarter each covered and whether it came before the
// open or after the close, and the next one estimated from the same quarter a year earlier. Across
// the market: the companies that reported in the same weeks last year, with the date that implies
// this year, marked when they have already reported. Estimates, not announcements. No key.
import { z } from "zod";

import { archiveBase, filings, getJson, getText, NotFound, resolveEntity, tickerTable } from "./sources.mjs";

const DAY = 86400000;
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const plus = (d, days) => iso(Date.parse(d) + days * DAY);
const between = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const median = (xs) => { const s = [...xs].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (d) => WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()];
// Fifty-two weeks: the same weekday a year on, as most companies keep.
const YEAR = 364;

// EDGAR prints the acceptance time on the filing index in Eastern time ("2026-07-14 06:30:38").
// The submissions API's acceptanceDateTime is not used: many files shift it by an Eastern offset
// (see acceptanceTimes in sources.mjs).
export function acceptedEastern(indexHtml) {
  const m = String(indexHtml).match(/Accepted<\/div>\s*<div class="info">\s*(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})(?::\d{2})?/);
  return m ? { date: m[1], time: `${m[2]}:${m[3]}`, minutes: Number(m[2]) * 60 + Number(m[3]) } : null;
}
export function timing(minutes) {
  if (minutes == null) return null;
  return minutes < 9 * 60 + 30 ? "before the open" : minutes >= 16 * 60 ? "after the close" : "during market hours";
}

// The releases: 8-Ks carrying Item 2.02, oldest first. A second one within 20 days (a preliminary
// result and then the full one, a correction, a supplement) belongs to the same quarter and is not
// a new release; members lists them all.
export function releasesFrom(rows) {
  const out = [];
  const eightKs = [...rows].filter((x) => x.form === "8-K" && String(x.items ?? "").split(",").map((s) => s.trim()).includes("2.02")).sort((x, y) => x.filingDate.localeCompare(y.filingDate));
  // Between two periodic reports there is one quarter's results. An Item 2.02 8-K more than 20 days
  // before a later one in that stretch is not them: Tesla files its quarterly deliveries this way.
  const periodic = rows.filter((x) => /^(10-Q|10-K|20-F|40-F)/.test(x.form ?? "")).map((x) => x.filingDate).sort();
  const nextReport = (d) => periodic.find((p) => p >= d) ?? null;
  const interim = (r, i) => nextReport(r.filingDate) && eightKs.slice(i + 1).some((s) => nextReport(s.filingDate) === nextReport(r.filingDate) && between(r.filingDate, s.filingDate) > 20);
  // Days into the calendar quarter. With the quarter's report yet to come, an 8-K as early in the
  // quarter as earlier interim ones is another of them, not the results.
  const dayOfQuarter = (d) => { const t = new Date(`${d}T00:00:00Z`); return between(`${t.getUTCFullYear()}-${String(Math.floor(t.getUTCMonth() / 3) * 3 + 1).padStart(2, "0")}-01`, d); };
  const early = eightKs.filter(interim).map((r) => dayOfQuarter(r.filingDate));
  const kept = eightKs.filter((r, i) => !interim(r, i) && (nextReport(r.filingDate) || !early.some((d) => Math.abs(d - dayOfQuarter(r.filingDate)) <= 5)));
  for (const r of kept) {
    const last = out[out.length - 1];
    if (last && between(last.date, r.filingDate) <= 20) {
      last.members.push({ date: r.filingDate, accession: r.accessionNumber });
      // Two weeks on, the later one is the full results (a preliminary figure or Tesla's deliveries came first); sooner, a correction.
      if (between(last.date, r.filingDate) >= 14) { last.also.push(last.accession); last.date = r.filingDate; last.accession = r.accessionNumber; last.document = r.primaryDocument; }
      else last.also.push(r.accessionNumber);
      continue;
    }
    out.push({ date: r.filingDate, accession: r.accessionNumber, document: r.primaryDocument, also: [], members: [{ date: r.filingDate, accession: r.accessionNumber }] });
  }
  return out;
}

// The next release, from the release that followed the same quarter a year earlier; failing that,
// from the usual gap between releases. The window is how far the company's dates have moved from
// one year to the next.
export function nextRelease(releases, today) {
  if (!releases.length) return null;
  const last = releases[releases.length - 1];
  const yearAgo = releases.findIndex((r) => Math.abs(between(r.date, last.date) - YEAR) <= 30);
  const shifts = [];
  for (const r of releases) {
    const before = releases.find((q) => Math.abs(between(q.date, r.date) - YEAR) <= 30);
    if (before) shifts.push(Math.abs(between(before.date, r.date) - YEAR));
  }
  const window = Math.min(21, Math.max(3, Math.ceil(median(shifts) ?? 7) + 2));
  let expected, basis, basedOn = null;
  const prior = yearAgo >= 0 ? releases[yearAgo + 1] : null;
  if (prior && between(last.date, plus(prior.date, YEAR)) > 30) {
    expected = plus(prior.date, YEAR);
    basedOn = prior.date;
    basis = `52 weeks after ${prior.date}, the release that followed the same quarter a year earlier`;
  } else {
    const gaps = releases.slice(-9).map((r, i, a) => (i ? between(a[i - 1].date, r.date) : null)).filter((g) => g != null);
    const gap = median(gaps);
    if (!gap) return null;
    expected = plus(last.date, Math.round(gap));
    basis = `${Math.round(gap)} days after ${last.date}, the usual gap between its releases (less than a year of history to compare with)`;
  }
  const status = today > plus(expected, window) ? "late: no release filed yet" : today >= plus(expected, -window) ? "due now" : "upcoming";
  return { expected, weekday: weekday(expected), window_days: window, earliest: plus(expected, -window), latest: plus(expected, window), basis, based_on: basedOn, status, year_on_year_moves_days: shifts.slice(-8) };
}

export const earningsInput = z.object({
  company: z.string().min(1).max(120).optional().describe("Ticker, CIK or name: its results releases and the next one estimated. Leave out for the market."),
  quarters: z.number().int().min(1).max(20).optional().describe("Past releases to list for a company; default 8."),
  since: DATE.optional().describe("Across the market: first day of the window; default today."),
  until: DATE.optional().describe("Across the market: last day; default 14 days after since, at most 31."),
  limit: z.number().int().min(1).max(500).optional().describe("Across the market: most companies to list (the largest first); default 100."),
}).strict();

async function companyCalendar(session, a) {
  const e = await resolveEntity(session, a.company);
  const today = iso(session.now());
  // The quarters shown, and at least five, so the release a year before the latest is in hand.
  const { sub, rows } = await filings(session, e.cik, { since: plus(today, -(Math.max(a.quarters ?? 8, 5) + 1) * 92) });
  const releases = releasesFrom(rows);
  if (!releases.length) throw new NotFound(`${sub.name} has filed no 8-K under Item 2.02 (results of operations) in the period read${sub.category?.includes("foreign") || (sub.filings?.recent?.form ?? []).includes("6-K") ? "; foreign private issuers furnish results on Form 6-K, which has no item numbers" : ""}.`);
  // The quarter each release covered: the latest fiscal period end from its 10-Qs and 10-Ks in the
  // 100 days before it.
  const ends = [...new Set(rows.filter((r) => /^10-[QK]/.test(r.form) && r.reportDate).map((r) => r.reportDate))].sort();
  const covered = (d) => ends.filter((p) => p < d && between(p, d) <= 100).pop() ?? null;
  const shown = releases.slice(-(a.quarters ?? 8));
  const out = [];
  for (const r of shown) {
    const base = archiveBase(e.cik, r.accession);
    let at = null;
    try { at = acceptedEastern(await getText(session, `${base}/${r.accession}-index.htm`, { maxBytes: 2 * 1024 * 1024 })); } catch (err) { if (!(err instanceof NotFound)) throw err; }
    out.push([r.date, weekday(r.date), at?.time ?? null, timing(at?.minutes), covered(r.date), r.accession, `${base}/${r.document}`]);
  }
  const next = nextRelease(releases, today);
  const lastYearRow = next?.based_on ? out.find((row) => row[0] === next.based_on) : null;
  return {
    company: { cik: e.cik, name: sub.name, ticker: sub.tickers?.[0] ?? e.ticker ?? null, fiscal_year_end: sub.fiscalYearEnd ?? null },
    as_of: today,
    next: next ? { ...next, ...(lastYearRow?.[3] ? { last_year_timing: lastYearRow[3] } : {}) } : null,
    releases: { columns: ["date", "weekday", "accepted_et", "timing", "quarter_ended", "accession", "url"], rows: out.reverse() },
    note: "Dates are when the company filed its results 8-K (Item 2.02); accepted_et is when EDGAR accepted it, usually minutes after the press release. The next date is an estimate from the company's own history, not an announcement: companies move dates, and a release can come before its 8-K.",
    source: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${e.cik}&type=8-K&dateb=&owner=include&count=40`,
    limits: ["From the company's own 8-K filings on EDGAR, as filed. Foreign private issuers furnish results on Form 6-K, which has no item numbers, and are not covered.", "Not investment advice."],
  };
}

// Companies that filed a results 8-K in a window, one row per company (the first release in it).
async function reporters(session, since, until) {
  const by = new Map();
  for (let from = 0; from < 3000; from += 100) {
    const r = await getJson(session, `https://efts.sec.gov/LATEST/search-index?q=%22Item%202.02%22&forms=8-K&dateRange=custom&startdt=${since}&enddt=${until}${from ? `&from=${from}` : ""}`);
    const page = r?.hits?.hits ?? [];
    for (const h of page) {
      const s = h._source ?? {};
      if (!(s.items ?? []).includes("2.02") || !s.ciks?.[0]) continue;
      const cik = Number(s.ciks[0]);
      const prev = by.get(cik);
      if (!prev || s.file_date < prev.date) by.set(cik, { cik, date: s.file_date, name: String(s.display_names?.[0] ?? "").replace(/\s*\(CIK \d+\)\s*$/, "").replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+/g, " ").trim() || null });
    }
    if (page.length < 100) break;
  }
  return by;
}

async function marketCalendar(session, a) {
  const today = iso(session.now());
  const since = a.since ?? today, until = a.until ?? plus(since, 14);
  if (until < since) throw new Error("until must be on or after since.");
  if (between(since, until) > 31) throw new Error("The window can be at most 31 days; narrow since and until.");
  // Last year's same weeks (52 weeks earlier, so weekdays line up), and this year's releases so far.
  const before = await reporters(session, plus(since, -YEAR), plus(until, -YEAR));
  // Reports this year from three weeks before the window to three weeks after it (or today), the
  // same tolerance a release is matched to its expected date with.
  const doneUntil = plus(until, 21) < today ? plus(until, 21) : today;
  const done = since <= today ? await reporters(session, plus(since, -21), doneUntil) : new Map();
  const table = Object.values(await tickerTable(session));
  const rank = new Map(), ticker = new Map();
  table.forEach((r, i) => { if (!rank.has(r.cik_str)) { rank.set(r.cik_str, i); ticker.set(r.cik_str, r.ticker); } });
  const rows = [...before.values()].map((b) => {
    const expected = plus(b.date, YEAR);
    const reported = done.get(b.cik);
    const hit = reported && Math.abs(between(expected, reported.date)) <= 21 ? reported.date : null;
    return { expected, name: b.name, ticker: ticker.get(b.cik) ?? null, status: hit ? "reported" : expected < today ? "expected (date passed, not yet filed)" : "expected", reported_on: hit, last_year: b.date, cik: b.cik, rank: rank.get(b.cik) ?? Infinity };
  });
  const listed = rows.filter((r) => Number.isFinite(r.rank));
  const pick = [...listed].sort((x, y) => x.rank - y.rank).slice(0, a.limit ?? 100).sort((x, y) => x.expected.localeCompare(y.expected) || x.rank - y.rank);
  return {
    since, until, as_of: today,
    companies: rows.length, listed: listed.length, shown: pick.length,
    columns: ["expected", "company", "ticker", "status", "reported_on", "last_year", "cik"],
    rows: pick.map((r) => [r.expected, r.name, r.ticker, r.status, r.reported_on, r.last_year, r.cik]),
    note: "Each expected date is 52 weeks after the company's results 8-K (Item 2.02) in the same weeks last year, an estimate rather than an announcement. Listed companies only, largest first (by the SEC's ticker file) when there are more than the limit. A company is marked reported when it filed a results 8-K within three weeks of its expected date. earnings_calendar with company refines one company from its full history.",
    sources: [`https://efts.sec.gov/LATEST/search-index?q=%22Item%202.02%22&forms=8-K&dateRange=custom&startdt=${plus(since, -YEAR)}&enddt=${plus(until, -YEAR)}`, "https://www.sec.gov/files/company_tickers.json"],
    limits: ["From EDGAR full-text search of 8-Ks under Item 2.02, as filed. Companies that changed their schedule, listed in the past year or furnish results on Form 6-K (foreign private issuers) are missed or misdated.", "Not investment advice."],
  };
}

export async function earningsCalendar(session, args) {
  const a = earningsInput.parse(args);
  return a.company ? companyCalendar(session, a) : marketCalendar(session, a);
}
