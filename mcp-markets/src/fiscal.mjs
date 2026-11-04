// treasury_cash and federal_budget, from the US Treasury's own statements on Fiscal Data (no key).
// treasury_cash: the Treasury General Account at the Fed each business day (the Daily Treasury Statement),
// the cash the government holds, which drains bank reserves when it rises; with the day's biggest deposits
// and withdrawals by category. federal_budget: receipts, outlays and the deficit each month (the Monthly
// Treasury Statement), this fiscal year against the same months of the last.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";

const FISCAL = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const num = (s) => (s == null || s === "" || s === "null" || !Number.isFinite(Number(s)) ? null : Number(s));
const isoDay = (session, back = 0) => new Date(session.now() - back * 86400000).toISOString().slice(0, 10);
const q = (s) => encodeURIComponent(s);
// The same cash under three names: the Federal Reserve Account until late 2021, then the Treasury General
// Account (TGA), both with a closing balance column; from spring 2022 a line of its own, the TGA Closing
// Balance, which the statement prints in its open_today_bal column.
const TGA_NOW = "Treasury General Account (TGA) Closing Balance", TGA_THEN = ["Treasury General Account (TGA)", "Federal Reserve Account"];

export const cashInput = z.object({
  start: DATE.optional().describe("First day; default 90 days ago."),
  end: DATE.optional().describe("Last day; default today."),
  flows: z.boolean().optional().describe("Also the last day's largest deposits and withdrawals by category, with the month and fiscal year to date."),
}).strict();

export async function treasuryCash(session, args) {
  const a = cashInput.parse(args ?? {});
  const end = a.end ?? isoDay(session), start = a.start ?? isoDay(session, 90);
  if (start > end) throw new Error("start is after end.");
  const window = `record_date:gte:${start},record_date:lte:${end}`;
  const read = (name) => getJson(session, `${FISCAL}/v1/accounting/dts/operating_cash_balance?filter=account_type:eq:${q(name)},${window}&sort=record_date&page[size]=10000`);
  const [now, ...then] = await Promise.all([read(TGA_NOW), ...(start < "2022-06-01" ? TGA_THEN.map(read) : [])]);
  const byDay = new Map();
  for (const r of then.flatMap((t) => t?.data ?? [])) if (num(r.close_today_bal) != null) byDay.set(r.record_date, num(r.close_today_bal));
  for (const r of now?.data ?? []) if (num(r.open_today_bal) != null) byDay.set(r.record_date, num(r.open_today_bal));
  const rows = [...byDay].sort((x, y) => x[0].localeCompare(y[0])).map(([d, v]) => [d, v]);
  if (!rows.length) throw new NotFound(`No Daily Treasury Statement between ${start} and ${end} (one is published each business day, the afternoon after).`);
  const first = rows[0], last = rows[rows.length - 1];
  const values = rows.map((r) => r[1]);
  let flows;
  if (a.flows) {
    const d = await getJson(session, `${FISCAL}/v1/accounting/dts/deposits_withdrawals_operating_cash?filter=record_date:eq:${last[0]}&page[size]=1000`);
    // The statement's own totals come as lines with no category.
    const lines = (d?.data ?? []).filter((r) => r.transaction_catg && r.transaction_catg !== "null" && !/^(Total|Sub-Total)/i.test(r.transaction_catg) && num(r.transaction_today_amt) != null);
    const top = (type) => lines.filter((r) => r.transaction_type === type).sort((x, y) => num(y.transaction_today_amt) - num(x.transaction_today_amt)).slice(0, 12).map((r) => [r.transaction_catg, num(r.transaction_today_amt), num(r.transaction_mtd_amt), num(r.transaction_fytd_amt)]);
    flows = { date: last[0], units: "millions of US dollars", columns: ["category", "today", "month_to_date", "fiscal_year_to_date"], deposits: top("Deposits"), withdrawals: top("Withdrawals") };
  }
  return {
    latest: { date: last[0], balance: last[1] },
    change: { from: first[0], to: last[0], balance: last[1] - first[1] },
    range: { low: Math.min(...values), high: Math.max(...values) },
    units: "millions of US dollars",
    columns: ["date", "balance"], rows: rows.slice(-2000), ...(rows.length > 2000 ? { truncated_to_last: 2000 } : {}),
    ...(flows ? { flows } : {}),
    source: "https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/",
    limits: [
      "The Daily Treasury Statement as published by the Bureau of the Fiscal Service, the afternoon of the next business day.",
      "The balance is the Treasury General Account at the Federal Reserve, closing; before 2012 the Treasury also held cash in tax and loan accounts at banks, which this leaves out.",
      "Not investment advice.",
    ],
  };
}

export const budgetInput = z.object({
  statement: z.string().regex(/^\d{4}-\d{2}$/, "a month as YYYY-MM").optional().describe("The month of the Monthly Treasury Statement to read (it covers its fiscal year to that month). Default the latest."),
}).strict();

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// A fiscal year's month as a calendar month: FY 2026 runs from October 2025 to September 2026.
const calendarMonth = (fy, name) => { const m = MONTHS.indexOf(name) + 1; return `${m >= 10 ? fy - 1 : fy}-${String(m).padStart(2, "0")}`; };

export async function federalBudget(session, args) {
  const a = budgetInput.parse(args ?? {});
  let date;
  if (a.statement) {
    const [y, m] = a.statement.split("-").map(Number);
    date = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  } else {
    const latest = await getJson(session, `${FISCAL}/v1/accounting/mts/mts_table_1?sort=-record_date&page[size]=1`);
    date = latest?.data?.[0]?.record_date;
    if (!date) throw new NotFound("The Monthly Treasury Statement could not be found.");
  }
  const d = await getJson(session, `${FISCAL}/v1/accounting/mts/mts_table_1?filter=record_date:eq:${date}&page[size]=200`);
  const rows = d?.data ?? [];
  if (!rows.length) throw new NotFound(`No Monthly Treasury Statement for ${date.slice(0, 7)}; each comes out about the eighth business day of the next month.`);
  const years = new Map(rows.filter((r) => /^FY \d{4}$/.test(r.classification_desc)).map((r) => [r.classification_id, Number(r.classification_desc.slice(3))]));
  const months = rows.filter((r) => MONTHS.includes(r.classification_desc) && years.has(r.parent_id))
    .map((r) => { const fy = years.get(r.parent_id); return [calendarMonth(fy, r.classification_desc), fy, num(r.current_month_gross_rcpt_amt), num(r.current_month_gross_outly_amt), num(r.current_month_dfct_sur_amt)]; })
    .sort((x, y) => x[0].localeCompare(y[0]));
  const fy = Math.max(...years.values());
  const cents = (x) => Math.round(x * 100) / 100;
  const sum = (list, i) => cents(list.reduce((t, r) => t + (r[i] ?? 0), 0));
  const current = months.filter((r) => r[1] === fy);
  // The same months of the year before, so a part year is set against a part year.
  const same = months.filter((r) => r[1] === fy - 1 && current.some((c) => Number(c[0].slice(5)) === Number(r[0].slice(5))));
  const total = (list) => ({ months: list.length, receipts: sum(list, 2), outlays: sum(list, 3), deficit: sum(list, 4) });
  return {
    statement: date.slice(0, 7), fiscal_year: fy,
    year_to_date: total(current), same_months_last_year: total(same),
    change: { receipts: cents(sum(current, 2) - sum(same, 2)), outlays: cents(sum(current, 3) - sum(same, 3)), deficit: cents(sum(current, 4) - sum(same, 4)) },
    units: "US dollars; deficit is outlays less receipts (negative is a surplus)",
    columns: ["month", "fiscal_year", "receipts", "outlays", "deficit"], rows: months,
    source: "https://fiscaldata.treasury.gov/datasets/monthly-treasury-statement/",
    limits: ["The Monthly Treasury Statement (Table 1) as published by the Bureau of the Fiscal Service; a month's figures can shift slightly when the next statement revises them.", "Calendar effects (a payment date falling on a weekend moves outlays between months) are not adjusted for.", "Not investment advice."],
  };
}
