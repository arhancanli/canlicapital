// financial_statements against real SEC responses (scripts/capture-analyst-fixtures.mjs): Microsoft's
// last two 10-Ks joined (it reclassified cash-flow lines in between), Costco's last two 10-Qs,
// NVIDIA across its 2024 ten-for-one split and Coca-Cola's equity statement.
import assert from "node:assert/strict";
import test from "node:test";

import { createSession, NotFound } from "../src/sources.mjs";
import { buildRows, financialStatements, pruneHeadings, rowKeys, unitScale } from "../src/statements.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });
const line = (t, label, n = 0) => t.rows.filter((r) => r[0] === label)[n];

test("Microsoft: two 10-Ks give four years of income and cash flows and three balance sheets", async () => {
  const r = await financialStatements(session(), { company: "MSFT", filings: 2 });
  assert.deepEqual(r.filings.rows.map((x) => x.slice(0, 4)), [["0001193125-26-323660", "10-K", "2026-07-29", "2026-06-30"], ["0000950170-25-100235", "10-K", "2025-07-30", "2025-06-30"]]);
  assert.deepEqual(r.income.columns, ["line", "concept", "12 months to 2026-06-30", "12 months to 2025-06-30", "12 months to 2024-06-30", "12 months to 2023-06-30"]);
  assert.equal(r.income.units, "USD ($) shares in Millions, $ in Millions");
  assert.equal(r.income.money_scale, 1e6); assert.equal(r.income.shares_scale, 1e6);
  assert.deepEqual(line(r.income, "Revenue").slice(1), ["us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", 331839, 281724, 245122, 211915]);
  assert.deepEqual(line(r.income, "Diluted").slice(2), [17.95, 13.64, 11.8, 9.68]);
  // The breakdown under the statement keeps its member headings: Product, then Service and Other.
  const at = r.income.rows.findIndex((x) => x[0] === "Product");
  assert.deepEqual(r.income.rows[at + 1].slice(2), [64696, 63946, 64773, 64699]);
  assert.equal(r.income.rows.find((x, i) => i > at && x[0] === "Service and Other")[0], "Service and Other");
  assert.deepEqual(r.balance_sheet.columns.slice(2), ["2026-06-30", "2025-06-30", "2024-06-30"]);
  assert.deepEqual(line(r.balance_sheet, "Total assets").slice(2), [758376, 619003, 512163]);
  assert.deepEqual(r.income.sources, ["https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/R2.htm", "https://www.sec.gov/Archives/edgar/data/789019/000095017025100235/R2.htm"]);
});

test("a line the newer 10-K reclassified: the newer figures, the first-reported ones beside them, and the older year left out", async () => {
  const r = await financialStatements(session(), { company: "MSFT", filings: 2 });
  const rev = r.revised.rows.filter((x) => x[1] === "Depreciation, amortization, and other");
  assert.deepEqual(rev, [
    ["cash_flow", "Depreciation, amortization, and other", "12 months to 2025-06-30", 29433, 34153, "0000950170-25-100235"],
    ["cash_flow", "Depreciation, amortization, and other", "12 months to 2024-06-30", 20958, 22287, "0000950170-25-100235"],
  ]);
  assert.deepEqual(line(r.cash_flow, "Depreciation, amortization, and other").slice(2), [38534, 29433, 20958, null], "2023 is on the old classification");
  assert.ok(r.other_basis.rows.some((x) => x[1] === "Depreciation, amortization, and other" && x[2] === "12 months to 2023-06-30" && x[3] === 13861));
  assert.deepEqual(line(r.cash_flow, "Net income").slice(2), [133749, 101832, 88136, 72361], "unchanged lines keep the older year");
  assert.equal(r.splits, undefined);
});

test("NVIDIA across its split: per-share and share counts from before it are not mixed into the table", async () => {
  const r = await financialStatements(session(), { company: "NVDA", statement: "income", filings: 2, fiscal_year: 2025 });
  assert.deepEqual(r.income.columns.slice(2), ["12 months to 2025-01-26", "12 months to 2024-01-28", "12 months to 2023-01-29", "12 months to 2022-01-30"]);
  assert.deepEqual(line(r.income, "Diluted (in USD per share)").slice(2), [2.94, 1.19, 0.17, null]);
  assert.deepEqual(line(r.income, "Net income").slice(2), [72880, 29760, 4368, 9752]);
  assert.ok(r.revised.rows.some((x) => x[1] === "Diluted (in USD per share)" && x[3] === 1.19 && x[4] === 11.93));
  assert.ok(r.other_basis.rows.some((x) => x[1] === "Diluted (in USD per share)" && x[2] === "12 months to 2022-01-30" && x[3] === 3.85));
  assert.deepEqual(r.splits, ["0001045810-24-000029 reports per-share figures 10 times the newer ones and share counts a 10th of them: consistent with a 10-for-1 stock split after it was filed."]);
  // The interest expense concept was renamed between the two filings: one row, agreeing values.
  assert.equal(r.income.rows.filter((x) => x[0] === "Interest expense").length, 1);
  assert.deepEqual(line(r.income, "Interest expense").slice(1), ["us-gaap:InterestExpenseNonoperating", -247, -257, -262, -236]);
});

test("Costco by quarter: each quarter, then each year to date, with the revenue breakdown under its members", async () => {
  const r = await financialStatements(session(), { company: "909832", statement: "income", period: "quarterly", filings: 2 });
  assert.equal(r.company.ticker, "COST");
  assert.deepEqual(r.income.columns.slice(2), ["3 months to 2026-05-10", "3 months to 2026-02-15", "3 months to 2025-05-11", "3 months to 2025-02-16", "6 months to 2026-02-15", "6 months to 2025-02-16", "8 months to 2026-05-10", "8 months to 2025-05-11"]);
  assert.deepEqual(line(r.income, "Total Revenue").slice(2, 4), [70527, 69597]);
  const sales = r.income.rows.findIndex((x) => x[0] === "Net Sales");
  const fees = r.income.rows.findIndex((x) => x[0] === "Membership fees");
  assert.ok(sales > 0 && fees > sales);
  assert.deepEqual(r.income.rows.slice(sales, fees).find((x) => x[0] === "Total Revenue").slice(2, 4), [69154, 68242]);
  assert.deepEqual(r.income.rows.slice(fees).find((x) => x[0] === "Total Revenue").slice(2, 4), [1373, 1355]);
  assert.ok(r.limits.some((l) => /fourth quarter is in the 10-K/.test(l)));
});

test("an equity statement keeps its component columns and does not join filings", async () => {
  const r = await financialStatements(session(), { company: "21344", statement: "equity", fiscal_year: 2025 });
  assert.equal(r.filings.rows.length, 1);
  assert.deepEqual(r.equity.columns.slice(2, 5), ["Total", "Total Equity Attributable To Shareowners Of The Coca-Cola Company", "COMMON STOCK"]);
  assert.deepEqual(line(r.equity, "Balance at beginning of year (in shares) at Dec. 31, 2022").slice(2), [null, null, 4328, null, null, null, null, null]);
});

test("a fiscal year with no 10-K says which years exist", async () => {
  await assert.rejects(financialStatements(session(), { company: "MSFT", fiscal_year: 2031 }), (err) => err instanceof NotFound && /no 10-K for a period ending in 2031; its recent ones end 2026-06-30/.test(err.message));
  await assert.rejects(financialStatements(session(), { company: "MSFT", filings: 9 }), /filings/);
  await assert.rejects(financialStatements(session(), { company: "MSFT", statement: "cashflow" }), /statement/);
});

test("row keys follow the breakdown member a line sits under", () => {
  const rows = [
    { label: "Revenue", concept: "us-gaap:Revenues" },
    { label: "Product", concept: null, member: true, section: true },
    { label: "Revenue", concept: "us-gaap:Revenues" },
    { label: "Service", concept: null, member: true, section: true },
    { label: "Revenue", concept: "us-gaap:Revenues" },
  ];
  assert.deepEqual(rowKeys(rows), ["us-gaap:Revenues@#1", "label:product@#1", "us-gaap:Revenues@product#1", "label:service@#1", "us-gaap:Revenues@service#1"]);
  // The same breakdown listed in the other order keys the same lines the same way.
  const swapped = [rows[0], rows[3], rows[4], rows[1], rows[2]];
  assert.deepEqual(rowKeys(swapped).sort(), rowKeys(rows).sort());
});

test("headings stay only above values", () => {
  const h = (label, member = false) => ({ label, section: true, member, values: [null] });
  const v = (label, x) => ({ label, values: [x] });
  const kept = pruneHeadings([h("Net Sales", true), h("REVENUE"), v("Total Revenue", 5), h("Empty member", true), h("Membership fees", true), v("Total Revenue", 1), h("Trailing")]);
  assert.deepEqual(kept.map((r) => r.label), ["Net Sales", "REVENUE", "Total Revenue", "Membership fees", "Total Revenue"]);
});

test("rows from one filing never merge, however alike; a concept renamed across filings merges only when the values agree", () => {
  const cols = [{ months: 12, end: "2025-12-31" }, { months: 12, end: "2024-12-31" }];
  const entry = (label, concept, cells) => ({ label, concept, section: false, member: false, cells: new Map(cells.map(([k, list]) => [k, list])) });
  const same = buildRows([
    entry("Dividends", "us-gaap:DividendsShares", [["12|2025-12-31", [{ value: 3, filing: 0 }]]]),
    entry("Dividends", "us-gaap:Dividends", [["12|2024-12-31", [{ value: 900, filing: 0 }]]]),
  ], cols);
  assert.equal(same.rows.length, 2);
  const renamed = buildRows([
    entry("Interest expense", "a:Old", [["12|2024-12-31", [{ value: -5, filing: 1 }]]]),
    entry("Interest expense", "a:New", [["12|2025-12-31", [{ value: -6, filing: 0 }]]]),
  ], cols);
  assert.deepEqual(renamed.rows.map((r) => [r.concept, r.values]), [["a:New", [-6, -5]]]);
  const disagree = buildRows([
    entry("Interest expense", "a:Old", [["12|2024-12-31", [{ value: -5, filing: 1 }]]]),
    entry("Interest expense", "a:New", [["12|2024-12-31", [{ value: -7, filing: 0 }]]]),
  ], cols);
  assert.equal(disagree.rows.length, 2);
});

test("a statement title's scale for money and for shares", () => {
  assert.equal(unitScale("USD ($) shares in Thousands, $ in Thousands", "\\$"), 1e3);
  assert.equal(unitScale("USD ($) shares in Millions, $ in Billions", "\\$"), 1e9);
  assert.equal(unitScale("USD ($) shares in Millions, $ in Billions", "shares"), 1e6);
  assert.equal(unitScale("USD ($)", "\\$"), 1);
  assert.equal(unitScale(null, "shares"), 1);
});
