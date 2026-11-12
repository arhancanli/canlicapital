// A company's fiscal calendar from the period dates in its own filings: each fiscal year's start and end, whether
// it ran 52 or 53 weeks, where each quarter ended, and the calendar quarter that holds most of each one's days, so
// quarters line up across companies with different years (Apple's ends on the last Saturday of September). Read
// from net income, which every company reports for the year and each quarter.
import { z } from "zod";

export const fiscalInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  years: z.number().int().min(1).max(15).optional().describe("How many fiscal years, newest first; default 5."),
}).strict();

export const FISCAL_TOOL = Object.freeze({
  name: "fiscal_calendar", pack: "desk", toolset: "desk", title: "A company's fiscal calendar from its filings", input: fiscalInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  description: "Each fiscal year's start and end from the company's own filings, 52 or 53 weeks, where each quarter ended, and the calendar quarter holding most of each one's days, to line quarters up across companies with different years.",
  keywords: "fiscal year calendar quarter end 52 53 week year align quarters calendar quarter fiscal period when does the quarter end",
  args: "company: string, years?: integer",
});

const DAY = 86400000;
const shift = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY) + 1;
// The calendar quarter holding most of [start, end].
function calendarQuarter(start, end) {
  const tally = new Map();
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += DAY) {
    const d = new Date(t), q = `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    tally.set(q, (tally.get(q) ?? 0) + 1);
  }
  return [...tally].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
}

export async function runFiscal(ctx, args) {
  const a = fiscalInput.parse(args ?? {});
  const n = a.years ?? 5;
  const rowsOf = (r) => (r?.rows ?? []).map((row) => Object.fromEntries((r.columns ?? []).map((c, i) => [c, row[i]])));
  const [annual, quarterly] = await Promise.all([
    ctx.call("history", { company: a.company, concept: "net_income", periods: "annual", limit: n }),
    ctx.call("history", { company: a.company, concept: "net_income", periods: "quarterly", limit: n * 3 + 3 }),
  ]);
  const quarters = rowsOf(quarterly).filter((q) => q.start && q.end);
  const rows = rowsOf(annual).filter((y) => y.start && y.end).slice(0, n).map((y) => {
    const inside = quarters.filter((q) => q.start >= y.start && q.end < y.end).sort((p, q) => p.end.localeCompare(q.end));
    // Q1 to Q3 from the 10-Qs, Q4 the rest of the year; a quarter the filings do not give is left empty.
    const bounds = [];
    let from = y.start;
    for (const q of inside.slice(0, 3)) { bounds.push([from, q.end]); from = shift(q.end, 1); }
    if (bounds.length === 3) bounds.push([from, y.end]);
    const length = days(y.start, y.end);
    // A year of whole weeks (364 or 371 days) is a 52-53 week year; any other length follows calendar months.
    return [y.start, y.end, length, length % 7 === 0 ? length / 7 : null, ...[0, 1, 2, 3].map((i) => (bounds[i] ? bounds[i][1] : null)), bounds.length === 4 ? bounds.map(([s, e]) => calendarQuarter(s, e)) : null];
  });
  return {
    company: annual.company ?? { name: a.company },
    columns: ["start", "end", "days", "weeks", "q1_end", "q2_end", "q3_end", "q4_end", "calendar_quarters"],
    rows,
    reading: !rows.length ? "No fiscal years were found." : rows.some((r) => r[3]) ? `A 52-53 week year: ${rows.filter((r) => r[3] === 53).length} of ${rows.length} ran 53 weeks. calendar_quarters gives the calendar quarter holding most of each fiscal quarter's days.` : "Fiscal years that follow calendar months (weeks is empty). calendar_quarters gives the calendar quarter holding most of each fiscal quarter's days.",
    limits: ["Dates are as the company's filings give them, from net income's periods; a quarter the filings do not give separately is left empty.", "Companies number fiscal years differently (some by the calendar year they start in): the dates here settle which year is meant."],
  };
}
