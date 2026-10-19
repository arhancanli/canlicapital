// Tables in filing documents and filing_tables. The parser is checked on small tables written the
// way EDGAR's generators write them (a figure split over "$", the number and ")"; self-closing
// spacer cells; a header spanning its figures), and the tool on real responses
// (scripts/capture-analyst-fixtures.mjs): Costco's paid members through three 10-Ks, Walmart's
// guidance tables, Microsoft's geographic revenue report.
import assert from "node:assert/strict";
import test from "node:test";

import { filingTables } from "../src/filing-tables.mjs";
import { createSession } from "../src/sources.mjs";
import { figure, matchedRows, parseTable, rowTokens, scoreTable, searchTerms, together } from "../src/tables.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });
const cells = (...xs) => xs.map((x) => (typeof x === "string" ? { text: x, span: 1 } : { text: x[0], span: x[1] }));

test("a figure's pieces join: currency before it, a closing parenthesis and percent after it", () => {
  const t = rowTokens(cells("Net loss", "", "$", "(1,234", ")", "", "12.5", "%", ""));
  assert.deepEqual(t.map((x) => x.text), ["Net loss", "$ (1,234)", "12.5%"]);
  assert.equal(figure(t[1].text), -1234);
  assert.deepEqual(t.map((x) => [x.start, x.end]), [[0, 1], [2, 5], [6, 8]]);
  assert.deepEqual(rowTokens(cells("", "$", "", "2026"), false).map((x) => x.text), ["$", "2026"], "header rows keep their cells apart");
});

test("figures: amounts as numbers, percentages kept as percentages, other text as written", () => {
  assert.equal(figure("$(1,234)"), -1234);
  assert.equal(figure("$ 45,183"), 45183);
  assert.equal(figure("12.1 %"), "12.1%");
  assert.equal(figure("(0.5)%"), "-0.5%");
  assert.equal(figure("NP"), "NP");
  assert.equal(figure("Increase 3.0% to 3.75%"), "Increase 3.0% to 3.75%");
  assert.equal(figure("~510 bps"), "~510 bps");
});

test("a table written with self-closing spacer cells, headers over their figures", () => {
  // As Costco's 10-K writes its membership table.
  const html = `<table>
    <tr><td /><td /><td /><td /><td /><td /><td /><td /><td /></tr>
    <tr><td colspan="3" /><td colspan="3"><span>2026</span></td><td colspan="3" /><td colspan="3"><span>2025</span></td></tr>
    <tr><td colspan="3"><span>Paid members</span></td><td colspan="2"><span>84,100&#160;</span></td><td /><td colspan="3" /><td colspan="2"><span>81,000&#160;</span></td><td /></tr>
    <tr><td colspan="3"><span>Change</span></td><td colspan="2"><span>(3.2</span></td><td>)%</td><td colspan="3" /><td colspan="2"><span>6.3</span></td><td>%</td></tr>
  </table>`;
  const t = parseTable(html, "Membership");
  assert.deepEqual(t.columns, ["line", "2026", "2025"]);
  assert.deepEqual(t.rows, [["Paid members", 84100, 81000], ["Change", "-3.2%", "6.3%"]]);
});

test("a header over several figures of one row is split where they sit", () => {
  const html = `<table>
    <tr><td></td><td colspan="8">Three Months Ended July 31, 2026</td></tr>
    <tr><td>Reported EPS</td><td colspan="6"></td><td>$</td><td>0.80</td></tr>
    <tr><td>Adjustments:</td><td colspan="2">Pre-Tax</td><td colspan="2">Tax</td><td colspan="2">NCI</td><td colspan="2">Net</td></tr>
    <tr><td>Equity investments</td><td>$</td><td>0.15</td><td>$</td><td>(0.03)</td><td></td><td>-</td><td>$</td><td>0.12</td></tr>
  </table>`;
  const t = parseTable(html);
  assert.equal(t.columns.length, 5);
  assert.deepEqual(t.rows.find((r) => r[0] === "Equity investments"), ["Equity investments", 0.15, -0.03, "-", 0.12]);
  assert.deepEqual(t.rows.find((r) => r[0] === "Reported EPS"), ["Reported EPS", null, null, null, 0.8]);
});

test("search words: every one must be in the table, and together they outrank scattered", () => {
  assert.deepEqual(searchTerms('the "paid members" of 2025'), ["paid members", "2025"]);
  assert.deepEqual(searchTerms("Paid Members"), ["paid", "members"]);
  const members = { caption: "Membership", columns: ["line", "2026"], rows: [["Total paid members", 84100], ["Household cards", 66300]] };
  const balance = { caption: "Balance sheet", columns: ["line", "2026"], rows: [["Deferred membership fees", 3006], ["Additional paid-in capital", 8830]] };
  const terms = searchTerms("paid members");
  assert.ok(scoreTable(members, terms) > scoreTable(balance, terms));
  assert.equal(together(members, terms), true);
  assert.equal(together(balance, terms), false);
  assert.equal(scoreTable(members, searchTerms("paid subscribers")), 0, "a word missing from the table rules it out");
  assert.equal(scoreTable({ caption: "Timeshare sales", columns: ["line"], rows: [["x", 1]] }, ["share"]), 0, "words match at word starts only");
});

test("rows shown: the lines that name the words with the heading above them", () => {
  const t = { caption: "Operating data", columns: ["line", "2026"], rows: [["Stores", null], ["Opened", 10], ["Closed", 2], ...Array.from({ length: 12 }, (_, i) => [`Other ${i}`, i]), ["Members", null], ["Paid members", 84100]] };
  const { rows, all } = matchedRows(t, ["paid"]);
  assert.deepEqual(rows, [["Members", null], ["Paid members", 84100]]);
  assert.equal(all, false);
});

test("Costco's paid members through three 10-Ks, from the MD&A table the XBRL does not tag", async () => {
  const r = await filingTables(session(), { company: "909832", find: "paid members", filings: 3 });
  assert.deepEqual(r.results.map((x) => x.filing.accession), ["0000909832-26-000093", "0000909832-25-000101", "0000909832-24-000049"]);
  const series = r.results.map((x) => x.tables[0]);
  assert.deepEqual(series[0].columns, ["line", "2026", "2025", "2024"]);
  assert.deepEqual(series[0].rows[0], ["Paid members 1", 84100, 81000, 76200]);
  assert.deepEqual(series[1].rows.find((x) => /paid members/i.test(x[0])), ["Total paid members 1", 81000, 76200, 71000]);
  assert.deepEqual(series[2].rows.find((x) => /paid members/i.test(x[0])), ["Total paid members 1", 76200, 71000, 65800]);
  assert.ok(r.results.every((x) => x.tables.length === 1 && x.tables[0].source === "document table"), "the balance sheet (paid-in capital, membership fees) is not a match");
  assert.equal(r.results[0].searched.document, "cost-20260830.htm");
});

test("Walmart's results release: the guidance tables, with the year's guide as first given and as raised", async () => {
  const r = await filingTables(session(), { company: "104169", form: "8-K", find: "guidance", accession: "0000104169-26-000145" });
  assert.equal(r.results[0].searched.document, "earningsreleasefy27q2.htm");
  const tables = r.results[0].tables;
  const year = tables.find((t) => t.rows.some((x) => x[0] === "Adj. EPS"));
  assert.deepEqual(year.rows.find((x) => x[0] === "Consolidated metric"), ["Consolidated metric", "Original from 2.19.2026", "As of 5.21.2026", "As of 8.20.2026"]);
  assert.deepEqual(year.rows.find((x) => x[0] === "Adj. EPS"), ["Adj. EPS", "$2.75 to $2.85", "Unchanged", "$2.80 to $2.87"]);
  const quarter = tables.find((t) => t.rows.some((x) => x[0] === "Adjusted EPS"));
  assert.deepEqual(quarter.rows.find((x) => x[0] === "Adjusted EPS"), ["Adjusted EPS", "$0.62 to $0.64"]);
  assert.ok(quarter.notes[0].startsWith("The following guidance reflects the Company's expectations as of August 20, 2026."));
});

test("Microsoft's geographic revenue: the XBRL detail report first, with its units and footnote", async () => {
  const r = await filingTables(session(), { company: "MSFT", find: "geographic revenue" });
  const [top, next] = r.results[0].tables;
  assert.equal(top.source, "xbrl report");
  assert.equal(top.title, "Revenue Classified by Major Geographic Areas (Detail)");
  assert.equal(top.units, "USD ($) $ in Millions");
  assert.deepEqual(top.columns, ["line", "12 Months Ended Jun. 30, 2026", "12 Months Ended Jun. 30, 2025", "12 Months Ended Jun. 30, 2024"]);
  assert.deepEqual(top.rows.find((x) => x[0] === "Revenue [1]"), ["Revenue [1]", 170794, 144546, 124704]);
  assert.match(top.footnotes[0][1], /^Includes billings to OEMs/);
  assert.equal(next.source, "document table");
  assert.deepEqual(next.rows.find((x) => x[0] === "Other countries"), ["Other countries", 161045, 137178, 120418]);
});

test("without words, the filing's tables are listed", async () => {
  const r = await filingTables(session(), { company: "MSFT" });
  const { xbrl_reports: reports, document_tables: docs } = r.results[0];
  assert.deepEqual(reports.rows[0], ["INCOME STATEMENTS", "Statements", "https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/R2.htm"]);
  assert.ok(reports.rows.length > 100);
  assert.equal(docs.document, "msft-20260630.htm");
  assert.ok(docs.count > 50);
});

test("words that name nothing, and history without words, are refused with what to do", async () => {
  await assert.rejects(filingTables(session(), { company: "MSFT", find: "the of" }), /no words to look for/);
  await assert.rejects(filingTables(session(), { company: "MSFT", filings: 3 }), /pass find/);
});
