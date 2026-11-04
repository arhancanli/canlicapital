// market_hours: the US stock market's calendar (NYSE and Nasdaq keep the same one). Whether it is open now,
// the next open and close, a year's holidays and early closes, whether a date trades, and how many trading
// days lie between two dates. Computed, with no network, from the rules NYSE follows: its Rule 7.2 holidays
// (a Saturday holiday moves to Friday, except New Year's Day; a Sunday one to Monday), the 1 p.m. closes on
// the day before Independence Day, the day after Thanksgiving and Christmas Eve, and the market's
// unscheduled closures since 2000. A closure not yet announced (a national day of mourning) cannot be here.
import { z } from "zod";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
export const hoursInput = z.object({
  date: DATE.optional().describe("A day to ask about: whether it trades, and its hours."),
  year: z.number().int().min(2000).max(2100).optional().describe("A year's holidays and early closes."),
  start: DATE.optional().describe("With end: how many trading days from start to end, both included."),
  end: DATE.optional().describe("With start."),
}).strict();

// Closures the rules do not give: events, and national days of mourning.
const UNSCHEDULED = Object.freeze({
  "2001-09-11": "The September 11 attacks", "2001-09-12": "The September 11 attacks", "2001-09-13": "The September 11 attacks", "2001-09-14": "The September 11 attacks",
  "2004-06-11": "National day of mourning for President Reagan", "2007-01-02": "National day of mourning for President Ford",
  "2012-10-29": "Hurricane Sandy", "2012-10-30": "Hurricane Sandy",
  "2018-12-05": "National day of mourning for President George H. W. Bush", "2025-01-09": "National day of mourning for President Carter",
});

const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const weekday = (s) => new Date(`${s}T12:00:00Z`).getUTCDay();
const addDays = (s, n) => new Date(Date.parse(`${s}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
// The nth weekday (0 Sunday) of a month, or the last when n is -1.
function nth(y, m, wd, n) {
  if (n > 0) { const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); return iso(y, m, 1 + ((wd - first + 7) % 7) + (n - 1) * 7); }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(), last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return iso(y, m, lastDay - ((last - wd + 7) % 7));
}
// Easter Sunday in the Gregorian calendar (the anonymous algorithm in Meeus).
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day);
}
// A fixed-date holiday as observed: Saturday to Friday, Sunday to Monday.
const observed = (s) => (weekday(s) === 6 ? addDays(s, -1) : weekday(s) === 0 ? addDays(s, 1) : s);

// A year's full closures and 1 p.m. closes, by date.
export function calendar(y) {
  const closed = new Map(), early = new Map();
  const ny = iso(y, 1, 1);
  // New Year's Day on a Saturday is not moved to the Friday before (the year's last trading day).
  if (weekday(ny) !== 6) closed.set(observed(ny), "New Year's Day");
  if (y >= 1998) closed.set(nth(y, 1, 1, 3), "Martin Luther King Jr. Day");
  closed.set(nth(y, 2, 1, 3), "Washington's Birthday");
  closed.set(addDays(easter(y), -2), "Good Friday");
  closed.set(nth(y, 5, 1, -1), "Memorial Day");
  if (y >= 2022) closed.set(observed(iso(y, 6, 19)), "Juneteenth");
  closed.set(observed(iso(y, 7, 4)), "Independence Day");
  closed.set(nth(y, 9, 1, 1), "Labor Day");
  const thanks = nth(y, 11, 4, 4);
  closed.set(thanks, "Thanksgiving Day");
  closed.set(observed(iso(y, 12, 25)), "Christmas Day");
  for (const [d, why] of Object.entries(UNSCHEDULED)) if (d.startsWith(`${y}-`)) closed.set(d, why);
  const workday = (s) => weekday(s) >= 1 && weekday(s) <= 5 && !closed.has(s);
  // A 1 p.m. close on 3 July and 24 December when each falls Monday to Thursday, and after Thanksgiving.
  for (const [s, why] of [[iso(y, 7, 3), "Day before Independence Day"], [addDays(thanks, 1), "Day after Thanksgiving"], [iso(y, 12, 24), "Christmas Eve"]]) {
    if (workday(s) && (weekday(s) !== 5 || why === "Day after Thanksgiving")) early.set(s, why);
  }
  return { closed, early };
}

// Eastern time: the UTC offset in minutes at an instant, from the system's time zone data.
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
function easternParts(ms) {
  const p = Object.fromEntries(ET.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, offset: Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000) };
}
// An Eastern wall-clock time on a date, as an instant.
function easternInstant(date, hhmm) {
  const [h, m] = hhmm.split(":").map(Number), wall = Date.parse(`${date}T00:00:00Z`) + (h * 60 + m) * 60000;
  let t = wall - easternParts(wall).offset * 60000;
  t = wall - easternParts(t).offset * 60000;
  return t;
}

const SESSIONS = Object.freeze({ pre: "04:00", open: "09:30", close: "16:00", early: "13:00", after: "20:00" });
export function dayOf(s) {
  const y = Number(s.slice(0, 4)), { closed, early } = calendar(y), wd = weekday(s);
  if (wd === 0 || wd === 6) return { date: s, trading_day: false, reason: wd === 0 ? "Sunday" : "Saturday" };
  if (closed.has(s)) return { date: s, trading_day: false, reason: closed.get(s) };
  return { date: s, trading_day: true, open: SESSIONS.open, close: early.has(s) ? SESSIONS.early : SESSIONS.close, ...(early.has(s) ? { early_close: early.get(s) } : {}) };
}
const nextTradingDay = (s) => { let d = s; for (let i = 0; i < 15; i += 1) { d = addDays(d, 1); if (dayOf(d).trading_day) return d; } return null; };

export function marketHours(session, args) {
  const a = hoursInput.parse(args ?? {});
  const now = session.now(), here = easternParts(now), today = dayOf(here.date);
  const at = (d, hhmm) => ({ eastern: `${d} ${hhmm}`, utc: new Date(easternInstant(d, hhmm)).toISOString() });
  let status, nextOpen, nextClose;
  if (today.trading_day && here.time >= SESSIONS.open && here.time < today.close) { status = "open"; nextClose = at(here.date, today.close); }
  else {
    status = !today.trading_day ? `closed (${today.reason})` : here.time < SESSIONS.open ? (here.time >= SESSIONS.pre ? "pre-market" : "closed") : here.time < SESSIONS.after && today.close === SESSIONS.close ? "after-hours" : "closed";
    const day = today.trading_day && here.time < SESSIONS.open ? here.date : nextTradingDay(here.date);
    nextOpen = at(day, SESSIONS.open); nextClose = at(day, dayOf(day).close);
  }
  const out = { now: { eastern: `${here.date} ${here.time}`, status, ...(nextOpen ? { next_open: nextOpen } : {}), next_close: nextClose } };
  if (a.date) out.date = dayOf(a.date);
  if (a.year) {
    const { closed, early } = calendar(a.year);
    out.year = { year: a.year, holidays: [...closed].filter(([d]) => weekday(d) >= 1 && weekday(d) <= 5).sort().map(([date, name]) => ({ date, name })), early_closes: [...early].sort().map(([date, name]) => ({ date, name, close: SESSIONS.early })) };
  }
  if (a.start || a.end) {
    if (!a.start || !a.end) throw new Error("Give start and end together.");
    if (a.start > a.end) throw new Error("start is after end.");
    let n = 0, first = null, last = null;
    for (let d = a.start; d <= a.end; d = addDays(d, 1)) if (dayOf(d).trading_day) { n += 1; first ??= d; last = d; }
    out.trading_days = { start: a.start, end: a.end, count: n, first, last };
  }
  return {
    ...out,
    hours: { pre_market: `${SESSIONS.pre}-${SESSIONS.open}`, regular: `${SESSIONS.open}-${SESSIONS.close}`, early_close: SESSIONS.early, after_hours: `${SESSIONS.close}-${SESSIONS.after}`, time_zone: "America/New_York" },
    source: "https://www.nyse.com/markets/hours-calendars",
    limits: [
      "Computed from the rules NYSE follows and the market's unscheduled closures since 2000; a closure announced later (a national day of mourning, a storm) is not known until this tool is updated.",
      "NYSE and Nasdaq stocks. Bond markets keep a different calendar (SIFMA), with 2 p.m. early closes and some other holidays.",
    ],
  };
}
