// standardized_financials: the template on small books written by hand, and on SEC facts and exchange rates
// captured by scripts/capture-catchup-fixtures.mjs, replayed with no network.
import assert from "node:assert/strict";
import test from "node:test";

import { createSession } from "../src/sources.mjs";
import { standardize, standardizedFinancials } from "../src/standardized.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {} });
const row = (t, key) => t.rows.find((r) => r[0] === key);
const year = (val, extra = {}) => ({ start: "2025-01-01", end: "2025-12-31", val, form: "20-F", filed: "2026-03-20", fy: 2025, fp: "FY", ...extra });
const at = (val, extra = {}) => ({ end: "2025-12-31", val, form: "20-F", filed: "2026-03-20", fy: 2025, fp: "FY", ...extra });
const facts = (o) => Object.fromEntries(Object.entries(o).map(([tag, rows]) => [tag, { units: { EUR: rows } }]));

test("an IFRS filer's untagged lines are made from tagged ones, and each says how", () => {
  const book = {
    taxonomy: "ifrs-full", currency: "EUR",
    facts: facts({
      Revenue: [year(1000)], CostOfSales: [year(600)], SellingExpense: [year(80)], AdministrativeExpense: [year(70)],
      ProfitLossFromOperatingActivities: [year(250)], DepreciationAndAmortisationExpense: [year(50)],
      EquityAndLiabilities: [at(5000)], Equity: [at(2000)], LongtermBorrowings: [at(700)], NoncurrentPortionOfNoncurrentBondsIssued: [at(900)],
    }),
  };
  const { per, ends } = standardize(book);
  assert.deepEqual(ends, ["2025-12-31"]);
  const y = per.get("2025-12-31");
  assert.deepEqual([y.values.gross_profit, y.how.gross_profit], [400, "derived: revenue less cost of revenue"]);
  assert.deepEqual([y.values.sga_expense, y.how.sga_expense], [150, "derived: selling expense plus administrative expense"]);
  assert.deepEqual([y.values.ebitda, y.how.ebitda], [300, "derived: operating income plus depreciation and amortization"]);
  assert.deepEqual([y.values.total_liabilities, y.how.total_liabilities], [3000, "derived: total liabilities and equity less total equity"]);
  assert.deepEqual([y.values.long_term_debt, y.how.long_term_debt], [1600, "derived: long-term loans, bonds and their current portion"]);
  assert.equal(y.how.revenue, "ifrs-full:Revenue");
});

test("a tagged line is taken as tagged; a later filing's restatement wins and is marked", () => {
  const usd = (o) => Object.fromEntries(Object.entries(o).map(([tag, rows]) => [tag, { units: { USD: rows } }]));
  const book = {
    taxonomy: "us-gaap", currency: "USD",
    facts: usd({
      Revenues: [year(1000, { form: "10-K" })],
      GrossProfit: [year(420, { form: "10-K" }), year(410, { form: "10-K", filed: "2027-03-20" })],
      CostOfRevenue: [year(600, { form: "10-K" })],
    }),
  };
  const y = standardize(book).per.get("2025-12-31");
  assert.deepEqual([y.values.gross_profit, y.how.gross_profit], [410, "us-gaap:GrossProfit (restated)"]);
});

test("one company over its fiscal years: the template, each figure's tag, and the ratios", async () => {
  const r = await standardizedFinancials(session(), { companies: ["AAPL"], years: 3 });
  assert.deepEqual(r.company, { name: "Apple Inc.", ticker: "AAPL", cik: 320193, standard: "US GAAP", currency: "USD", reported_in: "USD" });
  assert.deepEqual(r.fiscal_years, ["2023-09-30", "2024-09-28", "2025-09-27"]);
  assert.deepEqual(row(r.statements, "revenue").slice(2), [383285000000, 391035000000, 416161000000]);
  assert.deepEqual(row(r.how, "gross_profit").slice(1), ["us-gaap:GrossProfit", "us-gaap:GrossProfit", "us-gaap:GrossProfit"]);
  assert.deepEqual(row(r.ratios, "gross_margin").slice(1), [0.4413, 0.4621, 0.4691]);
});

test("Apple beside TSMC across US GAAP and IFRS, in dollars at each year's rates; ratios need no conversion", async () => {
  const r = await standardizedFinancials(session(), { companies: ["AAPL", "1046179"], in_usd: true });
  assert.deepEqual(r.companies.map((c) => [c.standard, c.reported_in, c.currency]), [["US GAAP", "USD", "USD"], ["IFRS", "TWD", "USD"]]);
  assert.equal(r.fiscal_years["Taiwan Semiconductor Manufacturing Company Limited"], "2024-12-31");
  assert.deepEqual(row(r.compare, "revenue").slice(2), [416161000000, 90284657358]);
  assert.deepEqual(row(r.how, "long_term_debt").slice(1), ["us-gaap:LongTermDebt", "derived: long-term loans, bonds and their current portion"]);
  assert.deepEqual(row(r.ratios, "gross_margin").slice(1), [0.4691, 0.5612]);
  const tsmc = row(r.compare, "gross_profit")[3] / row(r.compare, "revenue")[3];
  assert.ok(Math.abs(tsmc - 0.5612) < 1e-4, "converted amounts keep the ratio");
  assert.match(r.usd_rates["Taiwan Semiconductor Manufacturing Company Limited"], /^TWDUSD: flows at each fiscal year's average/);
});

test("without in_usd, amounts stay in each reporting currency and the answer says so", async () => {
  const r = await standardizedFinancials(session(), { companies: ["AAPL", "1046179"] });
  assert.deepEqual(row(r.compare, "revenue").slice(2), [416161000000, 2894307700000]);
  assert.match(r.currencies_differ, /reporting currency/);
});
