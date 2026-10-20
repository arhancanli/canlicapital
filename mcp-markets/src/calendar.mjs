// The US economic calendar from the agencies' own published schedules: BLS (jobs, CPI, PPI, JOLTS),
// BEA (GDP, personal income and PCE prices, trade), the Census Bureau (retail sales, housing starts,
// durable goods) and the Federal Reserve's FOMC meetings. Times are US Eastern. No key.
import { z } from "zod";

import { parseCalendar } from "./centralbank.mjs";
import { decodeEntities } from "./html.mjs";
import { getText } from "./sources.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const SOURCES = Object.freeze({
  bls: "https://www.bls.gov/schedule/news_release/bls.ics",
  bea: "https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics",
  census: "https://www.census.gov/economic-indicators/calendar-listview.html",
  fed: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
});
// The releases markets watch most, by the words in their titles.
const KEY = [/^Employment Situation/i, /^Consumer Price Index/i, /^Producer Price Index/i, /^Job Openings and Labor Turnover/i, /^Gross Domestic Product|^GDP\b/i, /^Personal Income and Outlays/i, /Retail (and|&) Food Services|Retail Sales/i, /^New Residential Construction/i, /Durable Goods/i, /^Employment Cost Index/i, /^FOMC/i, /International Trade in Goods and Services/i];

// iCalendar events: folded lines unfolded, escapes undone; DTSTART read with its zone (UTC "Z" or
// US-Eastern local time).
export function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out = [];
  let ev = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") ev = {};
    else if (line === "END:VEVENT") { if (ev?.start && ev.summary) out.push(ev); ev = null; }
    else if (ev) {
      const at = line.indexOf(":");
      if (at < 0) continue;
      const key = line.slice(0, at), value = line.slice(at + 1);
      if (key.startsWith("DTSTART")) ev.start = { value, utc: value.endsWith("Z") };
      else if (key === "SUMMARY") ev.summary = value.replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " ").trim();
    }
  }
  return out;
}

// "20250110T083000" in Eastern time, or "20250107T133000Z" in UTC, as an Eastern date and time.
export function easternTime(start) {
  const m = start.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return null;
  if (!start.utc) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : null };
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function parseCensus(html) {
  const out = [];
  for (const r of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => decodeEntities(c[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());
    const d = cells[1]?.match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/);
    if (!d) continue;
    const t = cells[2]?.match(/^(\d{1,2}):(\d{2}) ([AP])M$/i);
    const hour = t ? (Number(t[1]) % 12) + (/p/i.test(t[3]) ? 12 : 0) : null;
    out.push({ date: `${d[3]}-${String(MONTHS.indexOf(d[1]) + 1).padStart(2, "0")}-${d[2].padStart(2, "0")}`, time: t ? `${String(hour).padStart(2, "0")}:${t[2]}` : null, release: cells[0], period: cells[3] || null });
  }
  return out;
}

export const calendarInput = z.object({
  since: DATE.optional().describe("First date; default today."),
  until: DATE.optional().describe("Last date; default 30 days after since."),
  key_only: z.boolean().optional().describe("Only the releases markets watch most (jobs, CPI, PPI, JOLTS, GDP, PCE, retail sales, housing starts, durable goods, trade, the employment cost index, FOMC decisions)."),
}).strict();

export async function economicCalendar(session, args) {
  const a = calendarInput.parse(args);
  const since = a.since ?? new Date(session.now()).toISOString().slice(0, 10);
  const until = a.until ?? new Date(Date.parse(since) + 30 * 86400000).toISOString().slice(0, 10);
  const events = [];
  const failed = [];
  let censusFirst = null;
  // One source at a time; a source that cannot be read is named, and the rest still answer.
  for (const [agency, url] of Object.entries(SOURCES)) {
    try {
      const text = await getText(session, url, { maxBytes: 8 * 1024 * 1024 });
      if (agency === "census") { const list = parseCensus(text); censusFirst = list.map((e) => e.date).sort()[0] ?? null; for (const e of list) events.push({ ...e, agency: "Census Bureau" }); }
      else if (agency === "fed") for (const m of parseCalendar(text)) { if (!m.note) events.push({ date: m.end, time: "14:00", release: `FOMC decision${m.projections ? " and economic projections" : ""}`, period: null, agency: "Federal Reserve" }); }
      else for (const e of parseIcs(text)) { const t = easternTime(e.start); if (t) events.push({ ...t, release: e.summary, period: null, agency: agency === "bls" ? "Bureau of Labor Statistics" : "Bureau of Economic Analysis" }); }
    } catch (err) {
      failed.push(`${agency}: ${err.message}`);
    }
  }
  const rows = events
    .filter((e) => e.date >= since && e.date <= until)
    .map((e) => ({ ...e, key: KEY.some((re) => re.test(e.release)) }))
    .filter((e) => !a.key_only || e.key)
    .sort((x, y) => x.date.localeCompare(y.date) || String(x.time).localeCompare(String(y.time)) || x.release.localeCompare(y.release));
  return {
    since, until, count: rows.length, timezone: "US Eastern",
    columns: ["date", "time", "agency", "release", "period", "key"],
    rows: rows.map((e) => [e.date, e.time, e.agency, e.release, e.period, e.key]),
    ...(failed.length ? { unavailable: failed } : {}),
    // The Census Bureau's page lists one year at a time and turns to the next year early.
    ...(censusFirst && censusFirst > since ? { census_note: `The Census Bureau's schedule page now lists releases from ${censusFirst}; its releases before then (retail sales, housing starts, durable goods) are not included.` } : {}),
    sources: Object.values(SOURCES),
    limits: ["From the agencies' own published schedules, as of the time they were read; agencies occasionally reschedule (a government shutdown postpones releases).", "Not investment advice."],
  };
}
