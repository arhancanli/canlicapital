// The rendered XBRL report parser against real SEC pages (scripts/capture-analyst-fixtures.mjs):
// Microsoft's 10-K, Costco's 10-Q, Coca-Cola's equity statement and JPMorgan's income statement.
// Expected values were read off the same pages by a separate script, not by this parser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { cellValue, columnOf, isoDate, parseReport, reportList, splitTitle, statementKind } from "../src/reports.mjs";

const DIR = new URL("./fixtures/", import.meta.url);
const MANIFEST = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
const A = "https://www.sec.gov/Archives/edgar/data";
const page = (path) => gunzipSync(readFileSync(new URL(MANIFEST[`${A}/${path}`], DIR))).toString("utf8");
const row = (r, label) => r.rows.find((x) => x.label === label);

test("a filing's reports in its own order, with the statements recognised by name", () => {
  const msft = reportList(page("789019/000119312526323660/FilingSummary.xml"));
  assert.equal(msft[0].file, "R1.htm");
  assert.ok(msft.every((r, i) => i === 0 || r.position > msft[i - 1].position));
  assert.ok(!msft.some((r) => r.name === "All Reports"), "the book of every page is left out");
  const statements = msft.filter((r) => r.category === "Statements").map((r) => [r.name, r.file, statementKind(r.name)]);
  assert.deepEqual(statements, [
    ["INCOME STATEMENTS", "R2.htm", "income"],
    ["COMPREHENSIVE INCOME STATEMENTS", "R3.htm", "comprehensive_income"],
    ["BALANCE SHEETS", "R4.htm", "balance_sheet"],
    ["BALANCE SHEETS (Parenthetical)", "R5.htm", null],
    ["CASH FLOWS STATEMENTS", "R6.htm", "cash_flow"],
    ["STOCKHOLDERS' EQUITY STATEMENTS", "R7.htm", "equity"],
  ]);
  const cost = reportList(page("909832/000090983226000051/FilingSummary.xml"));
  assert.deepEqual(cost.filter((r) => r.category === "Statements").map((r) => statementKind(r.name)), ["income", "comprehensive_income", "balance_sheet", null, "equity", "cash_flow"]);
});

test("statement names companies use", () => {
  const cases = {
    "Consolidated Statements of Operations": "income", "CONSOLIDATED STATEMENTS OF INCOME": "income", "Consolidated Statement of Earnings": "income",
    "Consolidated Statements of Operations and Comprehensive Loss": "income", "CONSOLIDATED STATEMENTS OF COMPREHENSIVE INCOME": "comprehensive_income",
    "Consolidated Statements of Financial Position": "balance_sheet", "Consolidated Statement of Condition": "balance_sheet", "Consolidated Balance Sheets": "balance_sheet",
    "CONSOLIDATED STATEMENTS OF CASH FLOWS": "cash_flow", "Consolidated Statements of Changes in Stockholders' Equity": "equity",
    "CONSOLIDATED STATEMENTS OF SHAREOWNERS’ EQUITY": "equity", "Consolidated Statements of Partners' Capital": "equity",
    "Consolidated Balance Sheets (Parenthetical)": null, "Cover Page": null, "Revenue Recognition": null,
  };
  for (const [name, kind] of Object.entries(cases)) assert.equal(statementKind(name), kind, name);
});

test("Microsoft's income statement: three fiscal years in millions, labels and concepts as filed", () => {
  const r = parseReport(page("789019/000119312526323660/R2.htm"));
  assert.equal(r.title, "INCOME STATEMENTS");
  assert.equal(r.units, "USD ($) shares in Millions, $ in Millions");
  assert.deepEqual(r.columns.map((c) => [c.months, c.end]), [[12, "2026-06-30"], [12, "2025-06-30"], [12, "2024-06-30"]]);
  assert.deepEqual(row(r, "Revenue").values, [331839, 281724, 245122]);
  assert.equal(row(r, "Revenue").concept, "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax");
  assert.deepEqual(row(r, "Other income (expense), net").values, [10697, -4901, -1646], "parentheses are negative");
  assert.deepEqual(row(r, "Diluted").values, [17.95, 13.64, 11.8], "per-share values as shown, not scaled");
  assert.equal(row(r, "Earnings per share:").section, true);
});

test("Microsoft's balance sheet has dates, not periods", () => {
  const r = parseReport(page("789019/000119312526323660/R4.htm"));
  assert.deepEqual(r.columns, [{ label: "Jun. 30, 2026", instant: "2026-06-30" }, { label: "Jun. 30, 2025", instant: "2025-06-30" }]);
  assert.deepEqual(row(r, "Cash and cash equivalents").values, [20935, 30242]);
  assert.deepEqual(row(r, "Total liabilities and stockholders' equity").values, [758376, 619003]);
});

test("Costco's 10-Q: the quarter and the year to date side by side, shares in thousands and dollars in millions", () => {
  const r = parseReport(page("909832/000090983226000051/R2.htm"));
  assert.equal(r.units, "USD ($) shares in Thousands, $ in Millions");
  assert.deepEqual(r.columns.map((c) => c.label), ["3 Months Ended May 10, 2026", "3 Months Ended May 11, 2025", "8 Months Ended May 10, 2026", "8 Months Ended May 11, 2025"]);
  assert.deepEqual(row(r, "Total Revenue").values, [70527, 63205, 207431, 189079]);
  assert.deepEqual(row(r, "Interest expense").values, [-32, -35, -100, -108]);
  assert.deepEqual(row(r, "Basic (in dollars per share)").values, [4.94, 4.29, 14.03, 12.36]);
  assert.ok(!r.rows.some((x) => /\[Abstract\]$/.test(x.label)), "structural rows are dropped");
});

test("an equity statement: components as columns, the dates in the row labels", () => {
  const cost = parseReport(page("909832/000090983226000051/R6.htm"));
  assert.deepEqual(cost.columns.map((c) => c.label), ["Total", "Common Stock [Member]", "Additional Paid-in Capital [Member]", "AOCI Attributable to Parent [Member]", "Retained Earnings [Member]"]);
  assert.deepEqual(cost.columns[1].members, ["Common Stock"]);
  assert.deepEqual(row(cost, "Equity at beginning of period at Sep. 01, 2024").values, [23622, 2, 7829, -1828, 17619]);
  const ko = parseReport(page("21344/000162828026010047/R8.htm"));
  assert.equal(ko.columns.length, 8);
  assert.equal(ko.columns[2].label, "COMMON STOCK");
  assert.deepEqual(row(ko, "Balance at beginning of year (in shares) at Dec. 31, 2022").values, [null, null, 4328, null, null, null, null, null]);
});

test("counts keep their own units and dimension members become section rows", () => {
  const r = parseReport(page("909832/000090983226000051/R26.htm"));
  assert.equal(r.units, null, "no money on the page, so no scale");
  const at = r.rows.findIndex((x) => x.label === "UNITED STATES");
  assert.equal(r.rows[at].member, true);
  assert.equal(r.rows[at].concept, null);
  assert.deepEqual(r.rows[at + 1], { label: "Number of warehouses operated", concept: "us-gaap:NumberOfStores", values: [637] });
  assert.deepEqual(r.rows[at + 2].values, [47]);
  assert.equal(r.rows[at + 2].label, "Number of states in country | states");
  const div = parseReport(page("909832/000090983226000051/R33.htm"));
  assert.equal(div.units, "$ / shares");
  assert.deepEqual(div.rows, [{ label: "Common Stock, Dividends, Per Share, Declared", concept: "us-gaap:CommonStockDividendsPerShareDeclared", values: [1.47, 1.3] }]);
});

test("a bank's income statement, with the company's own concepts", () => {
  const r = parseReport(page("19617/000162828026008131/R3.htm"));
  assert.deepEqual(row(r, "Investment banking fees").values, [9615, 8910, 6519]);
  assert.deepEqual(row(r, "Investment securities losses").values, [-57, -1021, -3180]);
  assert.equal(row(r, "Asset management fees").concept, "jpm:AssetManagementFees");
  assert.equal(row(r, "Revenue").section, true);
});

test("cell values: currency, parentheses, percent, footnote-free text", () => {
  assert.deepEqual(cellValue("$ 45,183,036"), { value: 45183036 });
  assert.deepEqual(cellValue("$ (2)"), { value: -2 });
  assert.deepEqual(cellValue("(0.12)"), { value: -0.12 });
  assert.deepEqual(cellValue("21.00%"), { value: 21, percent: true });
  assert.deepEqual(cellValue("€ 1,250"), { value: 1250 });
  assert.deepEqual(cellValue("-4"), { value: -4 });
  assert.deepEqual(cellValue(""), { value: null });
  assert.deepEqual(cellValue("Yes"), { value: "Yes" });
  assert.deepEqual(cellValue("FY"), { value: "FY" });
  assert.deepEqual(cellValue("(1,234"), { value: "(1,234" }, "an unbalanced parenthesis is not a number");
  assert.deepEqual(cellValue("2025-12-31"), { value: "2025-12-31" });
});

test("titles, dates and column headers", () => {
  assert.deepEqual(splitTitle("Equity - Additional Information - Dividends (Detail) - $ / shares"), { title: "Equity - Additional Information - Dividends (Detail)", units: "$ / shares" });
  assert.deepEqual(splitTitle("Segment Reporting - Narrative (Details)"), { title: "Segment Reporting - Narrative (Details)", units: null });
  assert.deepEqual(splitTitle("Revenue by region - EUR (€) € in Millions"), { title: "Revenue by region", units: "EUR (€) € in Millions" });
  assert.equal(isoDate("Sep. 28, 2024"), "2024-09-28");
  assert.equal(isoDate("May 10, 2026"), "2026-05-10");
  assert.equal(isoDate("no date"), null);
  assert.deepEqual(columnOf(["12 Months Ended", "Dec. 31, 2025"]), { label: "12 Months Ended Dec. 31, 2025", months: 12, end: "2025-12-31" });
  assert.deepEqual(columnOf(["3 Months Ended", "Mar. 31, 2026", "Americas [Member]"]), { label: "3 Months Ended Mar. 31, 2026 Americas [Member]", months: 3, end: "2026-03-31", members: ["Americas"] });
});

test("not a report", () => {
  assert.throws(() => parseReport("<html><body><table><tr><td>x</td></tr></table></body></html>"), /not a rendered XBRL report/);
  assert.deepEqual(reportList("<FilingSummary></FilingSummary>"), []);
});
