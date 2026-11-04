// market_calendar: the whole market's schedule for the coming days, from Nasdaq's public calendars. Who reports
// earnings on a day (before the open or after the close, the consensus EPS and how many analysts make it, last
// year's EPS), whose shares go ex-dividend (amount, record and payment dates), and the stock splits coming up.
// Nasdaq's figures as its website shows them: the consensus is a vendor's aggregate, and the answer says so.
// earnings_calendar answers for one company from its own past reports; this answers for every company at once.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";

const API = "https://api.nasdaq.com/api/calendar";
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
export const calendarInput = z.object({
  kind: z.enum(["earnings", "dividends", "splits", "ipos"]).describe("earnings: who reports and the consensus EPS; dividends: who goes ex-dividend; splits: splits coming up; ipos: the month's IPOs, priced, expected, filed and withdrawn."),
  date: DATE.optional().describe("The first day; default today."),
  days: z.number().int().min(1).max(10).optional().describe("How many days from date (earnings and dividends); default 1."),
  symbols: z.array(z.string().min(1).max(12)).max(50).optional().describe("Only these tickers."),
  min_market_cap: z.number().min(0).optional().describe("Earnings: only companies worth at least this many US dollars."),
  limit: z.number().int().min(1).max(500).optional().describe("Most rows; default 100, largest companies first for earnings."),
}).strict();

const num = (s) => { if (typeof s === "number") return s; const t = String(s ?? "").trim(); if (!t || t === "N/A") return null; const v = Number(t.replace(/[$,()\s]/g, "")); return Number.isFinite(v) ? (/^\(.*\)$/.test(t) ? -v : v) : null; };
const iso = (mdy) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(mdy ?? "").trim()); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };
const WHEN = Object.freeze({ "time-pre-market": "before the open", "time-after-hours": "after the close" });
const addDays = (s, n) => new Date(Date.parse(`${s}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export async function marketCalendar(session, args) {
  const a = calendarInput.parse(args);
  const start = a.date ?? new Date(session.now()).toISOString().slice(0, 10), limit = a.limit ?? 100;
  const only = a.symbols ? new Set(a.symbols.map((s) => s.toUpperCase())) : null;
  const read = (kind, day) => getJson(session, `${API}/${kind}?date=${day}`, { headers: { Accept: "application/json" }, maxAgeMs: 3600000 });
  const common = { source: "https://www.nasdaq.com/market-activity/earnings", limits: ["Nasdaq's public calendars as its website shows them; dates can move after they are read, and the consensus is a vendor's aggregate of analysts' estimates.", "Not investment advice."] };
  if (a.kind === "ipos") {
    // A month's IPOs: priced, expected, filed and withdrawn. ipo_pipeline reads the same companies' SEC filings.
    const d = await getJson(session, `https://api.nasdaq.com/api/ipo/calendar?date=${start.slice(0, 7)}`, { headers: { Accept: "application/json" }, maxAgeMs: 3600000 });
    const part = (v) => v?.rows ?? v?.upcomingTable?.rows ?? [];
    const rows = [["priced", "pricedDate"], ["upcoming", "expectedPriceDate"], ["filed", "filedDate"], ["withdrawn", "withdrawDate"]]
      .flatMap(([status, when]) => part(d?.data?.[status]).map((r) => [status, iso(r[when]), r.proposedTickerSymbol ?? null, r.companyName, r.proposedExchange ?? null, r.proposedSharePrice ?? null, num(r.sharesOffered), num(r.dollarValueOfSharesOffered)]))
      .filter((r) => !only || only.has(String(r[2]).toUpperCase()));
    return { kind: "ipos", month: start.slice(0, 7), columns: ["status", "date", "symbol", "company", "exchange", "price", "shares", "value_usd"], rows: rows.slice(0, limit), note: "price is the offer price once priced, or the expected range before.", ...common, source: "https://www.nasdaq.com/market-activity/ipos" };
  }
  if (a.kind === "splits") {
    const d = await read("splits", start);
    const rows = (d?.data?.rows ?? []).map((r) => [r.symbol, r.name, String(r.ratio ?? "").replace(/\s+/g, ""), iso(r.executionDate)]).filter((r) => !only || only.has(r[0])).sort((x, y) => String(x[3]).localeCompare(String(y[3])));
    return { kind: "splits", as_of: d?.data?.asOf ?? null, columns: ["symbol", "name", "ratio", "effective"], rows: rows.slice(0, limit), note: "ratio is new shares to old: 8:1 is eight for one, 1:4 a reverse split of one for four.", ...common, source: "https://www.nasdaq.com/market-activity/stock-splits" };
  }
  const days = Array.from({ length: a.days ?? 1 }, (_, i) => addDays(start, i));
  const rows = [];
  for (const day of days) {
    const d = await read(a.kind, day);
    const list = a.kind === "dividends" ? d?.data?.calendar?.rows : d?.data?.rows;
    for (const r of list ?? []) {
      if (only && !only.has(String(r.symbol).toUpperCase())) continue;
      if (a.kind === "earnings") {
        const cap = num(r.marketCap);
        if (a.min_market_cap && !(cap >= a.min_market_cap)) continue;
        rows.push([day, WHEN[r.time] ?? null, r.symbol, r.name, cap, r.fiscalQuarterEnding || null, num(r.epsForecast), num(r.noOfEsts), num(r.lastYearEPS), iso(r.lastYearRptDt)]);
      } else rows.push([iso(r.dividend_Ex_Date) ?? day, r.symbol, r.companyName, num(r.dividend_Rate), num(r.indicated_Annual_Dividend), iso(r.record_Date), iso(r.payment_Date), iso(r.announcement_Date)]);
    }
  }
  if (a.kind === "earnings") rows.sort((x, y) => x[0].localeCompare(y[0]) || (y[4] ?? 0) - (x[4] ?? 0));
  if (!rows.length && only) throw new NotFound(`None of ${[...only].join(", ")} is on Nasdaq's ${a.kind} calendar from ${days[0]} to ${days[days.length - 1]}.`);
  return a.kind === "earnings"
    ? { kind: "earnings", from: days[0], to: days[days.length - 1], count: rows.length, columns: ["date", "when", "symbol", "name", "market_cap", "fiscal_quarter", "eps_consensus", "estimates", "eps_year_ago", "reported_year_ago"], rows: rows.slice(0, limit), ...(rows.length > limit ? { truncated_to: limit } : {}), ...common }
    : { kind: "dividends", from: days[0], to: days[days.length - 1], count: rows.length, columns: ["ex_date", "symbol", "name", "amount", "annual", "record_date", "payment_date", "announced"], rows: rows.slice(0, limit), ...(rows.length > limit ? { truncated_to: limit } : {}), ...common, source: "https://www.nasdaq.com/market-activity/dividends" };
}
