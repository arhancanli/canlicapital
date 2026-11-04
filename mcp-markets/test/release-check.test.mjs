// release_check: headers, labels and fiscal labels read by hand, and three real companies' releases set
// against their 10-Qs, captured by scripts/capture-release-check-fixtures.mjs and replayed with no network.
import assert from "node:assert/strict";
import test from "node:test";

import { fiscalLabel, headerDate, headerLength, labelSimilarity, releaseCheck } from "../src/release-check.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} });
const col = (r, name) => r.changed.columns.indexOf(name);
const changed = (r, label, period) => r.changed.rows.find((x) => x[0] === label && x[1] === period);

test("column headers as periods, labels as words, fiscal labels as quarters", () => {
  assert.deepEqual([headerDate("QUARTER ENDED (Unaudited) MAR 31, 2024"), headerDate("Three Months Ended June 27, 2026"), headerDate("Sept. 30, 2025"), headerDate("28 June 2025"), headerDate("6/28/2025"), headerDate("2025")], ["2024-03-31", "2026-06-27", "2025-09-30", "2025-06-28", "2025-06-28", null]);
  assert.deepEqual([headerLength("Nine Months Ended June 27, 2026"), headerLength("QUARTER ENDED"), headerLength("16 weeks ended"), headerLength("Q4 FY26"), headerLength("Year Ended"), headerLength("Year To Date September 30, 2026"), headerLength("June 27, 2026")], [{ days: 274, tol: 12 }, { days: 98, tol: 18 }, { days: 112, tol: 6 }, { days: 98, tol: 18 }, { days: 365, tol: 12 }, null, null]);
  assert.equal(labelSimilarity("Net income attributable to Vicor Corporation", "Net (loss) income attributable to Vicor Corporation"), 1);
  assert.equal(labelSimilarity("Less: Provision for income taxes", "Provision for income taxes"), 1);
  assert.ok(labelSimilarity("Adjusted net income", "Net income") < 1);
  assert.equal(labelSimilarity("Capital stock", "Additional paid-in capital"), 0.25);
  assert.equal(labelSimilarity("Net revenues", "Cost of revenues"), 1 / 3);
  assert.deepEqual([fiscalLabel("Q1 2024"), fiscalLabel("2Q26"), fiscalLabel("FY2025"), fiscalLabel("third quarter 2023"), fiscalLabel("Q2")], [{ quarter: 1, year: 2024, annual: false }, { quarter: 2, year: 2026, annual: false }, { quarter: 4, year: 2025, annual: true }, { quarter: 3, year: 2023, annual: false }, null]);
});

test("Vicor's first quarter of 2024: a $17.2 million litigation charge booked after the release", async () => {
  // The release of 2024-04-23 reported net income of $2,604 thousand; on 2024-04-24 a court entered final
  // judgment for SynQor, and the 10-Q of 2024-05-01 reports a net loss of $14,473 thousand.
  const r = await releaseCheck(session(), { company: "751978", period: "2024-03-31" });
  assert.deepEqual(r.period, { end: "2024-03-31", fiscal: "Q1 2024" });
  assert.deepEqual([r.release.date, r.release.url], ["2024-04-23", "https://www.sec.gov/Archives/edgar/data/751978/000119312524107125/d828945dex991.htm"]);
  assert.deepEqual([r.filing.form, r.filing.date, r.filing.url], ["10-Q", "2024-05-01", "https://www.sec.gov/Archives/edgar/data/751978/000095017024051264/vicr-20240331.htm"]);
  assert.deepEqual(r.counts, { compared: 96, agreeing: 77, changed: 17, release_only: 2, not_in_report_periods: 0 });
  assert.deepEqual(changed(r, "Total operating expenses", "3 months to 2024-03-31").slice(2, 8), [44038, 61238, 17200, 39.06, "us-gaap:OperatingExpenses", "thousands"]);
  assert.deepEqual(changed(r, "Net income attributable to Vicor Corporation", "3 months to 2024-03-31").slice(2, 7), [2604, -14473, -17077, -655.8, "us-gaap:NetIncomeLoss"]);
  assert.deepEqual(changed(r, "Net income per share attributable to Vicor Corporation: Diluted", "3 months to 2024-03-31").slice(2, 8), [0.06, -0.33, -0.39, -650, "us-gaap:EarningsPerShareDiluted", "units (per share)"]);
  // Ordered differently in the two balance sheets, matched by its label and its agreeing December figure.
  const accrued = changed(r, "Accrued litigation", "at 2024-03-31");
  assert.deepEqual(accrued.slice(2, 5), [6500, 23700, 17200]);
  assert.match(accrued[col(r, "matched_by")], /same line of the report \("Accrued litigation"\), where its other period agrees/);
  // The one-thousand-dollar difference in accounts payable is in the two documents as printed.
  assert.deepEqual(changed(r, "Accounts payable", "at 2024-03-31").slice(2, 5), [12438, 12439, 1]);
  assert.deepEqual(r.release_only, ["Capital stock"]);
  assert.deepEqual(r.filed_only.rows[0], ["Litigation-contingency expense", "3 months to 2024-03-31", 17200, "us-gaap:LitigationSettlementExpense"]);
  assert.equal(typeof r.source, "string");
  assert.deepEqual(r.sources, [r.release.url, r.filing.url]);
  assert.match(r.reading, /^17 of the 96 figures VICOR CORP's results release of 2024-04-23/);
  assert.ok(r.limits.includes("Not investment advice."));
  // A fiscal label finds the same quarter.
  const byLabel = await releaseCheck(session(), { company: "751978", period: "Q1 2024", max_rows: 3 });
  assert.equal(byLabel.filing.url, r.filing.url);
  assert.equal(byLabel.changed.rows.length, 3);
  assert.equal(byLabel.changed.rows_shown, "3 of 17");
});

test("Cumberland's third quarter of 2022: a balance sheet adjustment, in figures shown in dollars", async () => {
  // The 10-Q: accounts receivable up $0.15 million, property and equipment down $0.8 million and current
  // liabilities down $0.65 million from the amounts in the earnings release.
  const r = await releaseCheck(session(), { company: "1087294", period: "2022-09-30" });
  assert.deepEqual([r.release.date, r.filing.date], ["2022-11-08", "2022-11-14"]);
  assert.deepEqual(r.counts, { compared: 205, agreeing: 191, changed: 14, release_only: 0, not_in_report_periods: 0 });
  assert.deepEqual(changed(r, "Accounts receivable, net", "at 2022-09-30").slice(2, 8), [15086763, 15232697, 145934, 0.97, "us-gaap:AccountsReceivableNetCurrent", "units"]);
  assert.deepEqual(changed(r, "Property and equipment, net", "at 2022-09-30").slice(2, 5), [1284880, 490826, -794054]);
  assert.deepEqual(changed(r, "Total current liabilities", "at 2022-09-30").slice(2, 5), [25954343, 25306223, -648120]);
  // A payment shown in parentheses in both documents keeps its sign.
  assert.deepEqual(changed(r, "Additions to property and equipment", "9 months to 2022-09-30").slice(2, 5), [-1049730, -255676, 794054]);
  // The release states no scale; its figures agree in dollars.
  assert.ok(r.tables.rows.every((x) => x[6] === "units (read from agreement (none stated))"));
});

test("Apple's latest quarter: every figure in the release is the 10-Q's", async () => {
  const r = await releaseCheck(session(), { company: "AAPL" });
  assert.deepEqual([r.period.end, r.release.date, r.filing.form, r.filing.date], ["2026-06-27", "2026-07-30", "10-Q", "2026-07-31"]);
  assert.deepEqual(r.counts, { compared: 237, agreeing: 237, changed: 0, release_only: 0, not_in_report_periods: 0 });
  assert.deepEqual([r.changed.rows, r.release_only, r.filed_only], [[], [], undefined]);
  assert.match(r.reading, /^Every figure Apple Inc\.'s results release of 2026-07-30 gave that its 10-Q of 2026-07-31 also reports agrees \(237 of 237\)/);
  // Money in millions, share counts in thousands, as the release states.
  assert.ok(r.tables.rows.every((x) => x[6] === "millions (stated)"));
});

test("a period that is neither a date nor a fiscal label is refused before any request", async () => {
  await assert.rejects(releaseCheck(session(), { company: "751978", period: "Q9 2024" }), /neither a date \(2026-06-30\) nor a fiscal label/);
  await assert.rejects(releaseCheck(session(), { company: "751978", extra: 1 }), /Unrecognized key/);
});
