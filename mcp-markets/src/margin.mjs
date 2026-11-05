// margin_debt: how much investors borrow against their stocks, from FINRA's monthly margin statistics (customers' debit
// balances in margin accounts at member firms, since 1997), with the free credit balances in cash and margin accounts,
// the change on a month and a year, the record and how far the latest is from it, and the months before. No key.
import { z } from "zod";

import { getZipText, NotFound } from "./sources.mjs";
import { xlsxRows } from "./xlsx.mjs";

const FILE = "https://www.finra.org/sites/default/files/2021-03/margin-statistics.xlsx";
const PAGE = "https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics";

export const marginInput = z.object({
  months: z.number().int().min(1).max(360).optional().describe("Months shown, latest last; default 13."),
}).strict();

const round = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const num = (s) => (s === "" || s == null || !Number.isFinite(Number(s)) ? null : Number(s));
const change = (a, b) => (a == null || !b ? null : round((a / b - 1) * 100));
const usd = (billions) => (billions >= 1000 ? `$${round(billions / 1000, 2)} trillion` : `$${round(billions).toLocaleString("en-US")} billion`);

// FINRA's sheet as months oldest first: debit balances and free credit balances, in billions of dollars.
export const marginSheet = (bytes) => JSON.stringify(xlsxRows(bytes).filter((r) => /^\d{4}-\d{2}$/.test(r[0])).map((r) => [r[0], num(r[1]) / 1e3, num(r[2]) == null ? null : num(r[2]) / 1e3, num(r[3]) == null ? null : num(r[3]) / 1e3]).sort((a, b) => a[0].localeCompare(b[0])));

export async function marginDebt(session, args) {
  const a = marginInput.parse(args);
  const rows = JSON.parse(await getZipText(session, FILE, { decode: marginSheet }));
  if (!rows.length) throw new NotFound("FINRA's margin statistics held no months.");
  const last = rows.at(-1), prev = rows.at(-2), yearAgo = rows.find((r) => r[0] === `${Number(last[0].slice(0, 4)) - 1}${last[0].slice(4)}`);
  const peak = rows.reduce((m, r) => (r[1] > m[1] ? r : m), rows[0]);
  const record = peak[0] === last[0];
  const free = (r) => (r[2] ?? 0) + (r[3] ?? 0);
  return {
    month: last[0],
    summary: [`Investors owed ${usd(last[1])} against their stocks in margin accounts at the end of ${last[0]}, ${change(last[1], prev?.[1]) >= 0 ? "up" : "down"} ${Math.abs(change(last[1], prev?.[1]))}% on the month and ${change(last[1], yearAgo?.[1]) >= 0 ? "up" : "down"} ${Math.abs(change(last[1], yearAgo?.[1]))}% on a year${record ? ", a record" : `, ${Math.abs(change(last[1], peak[1]))}% below the record of ${usd(peak[1])} (${peak[0]})`}.`],
    latest: { margin_debt_billions: round(last[1]), change_on_month_pct: change(last[1], prev?.[1]), change_on_year_pct: change(last[1], yearAgo?.[1]), free_credit_billions: round(free(last)), debt_less_free_credit_billions: round(last[1] - free(last)) },
    record: { month: peak[0], margin_debt_billions: round(peak[1]), latest_is_record: record },
    columns: ["month", "margin_debt_billions", "free_credit_cash_accounts_billions", "free_credit_margin_accounts_billions"],
    rows: rows.slice(-(a.months ?? 13)).map((r) => [r[0], round(r[1]), round(r[2]), round(r[3])]),
    reading: "Debit balances in customers' securities margin accounts at FINRA member firms (margin debt) at each month end, and the free credit balances in cash and margin accounts, in billions of dollars.",
    source: `${FILE} (${PAGE})`,
    limits: [
      "FINRA's figures cover customers of its member broker-dealers, reported monthly; they are not adjusted for the size of the market, so a record in dollars can be ordinary against stock market value.",
      "Not investment advice.",
    ],
  };
}
