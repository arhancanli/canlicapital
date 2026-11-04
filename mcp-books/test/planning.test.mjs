// Canli Treasury and Planning on the fixture month and two more months of rent: runway from the bank's own
// history, budget against actual, a forecast, and a valuation checked against a perpetuity's known value.
import assert from "node:assert/strict";
import test from "node:test";

import { post } from "../src/ledger.mjs";
import { budgetVsActual, dcf, forecast, runway } from "../src/planning.mjs";
import { month } from "./fixture.mjs";

const rent = (date) => ({ date, memo: "Rent", lines: [{ account: "6100", debit: "3000" }, { account: "1000", credit: "3000" }] });

test("runway is cash over the average monthly fall", () => {
  const book = month();
  post(book, rent("2026-02-15"));
  post(book, rent("2026-03-15"));
  const r = runway(book, { through: "2026-03-31", months: 2 });
  assert.deepEqual(r.months.map((m) => [m.month, m.change]), [["2026-02", -300000], ["2026-03", -300000]]);
  assert.deepEqual([r.cash, r.averageChange, r.burning, r.runwayMonths], [4100000, -300000, true, 13.7]);
  const january = runway(book, { through: "2026-01-31", months: 1 });
  assert.deepEqual([january.burning, january.runwayMonths], [false, null], "January took in the capital");
});

test("budget against actual, line by line", () => {
  const book = month();
  const rows = budgetVsActual(book, { 4000: "1200", 6100: "3000" }, { from: "2026-01-01", to: "2026-01-31" });
  assert.deepEqual(rows.map((r) => [r.code, r.budget, r.actual, r.variance, r.pct]), [["4000", 120000, 100000, -20000, -16.7], ["6100", 300000, 300000, 0, 0]]);
  assert.throws(() => budgetVsActual(book, { 1000: "5" }), /income and expense/);
});

test("a forecast grows the trailing average", () => {
  const f = forecast(month(), { from: "2026-01-01", to: "2026-01-31", months: 2, growth: 0.1 });
  assert.deepEqual(f.rows.map((r) => [r.income, r.costs, r.net]), [[110000, 300000, -190000], [121000, 300000, -179000]]);
  assert.equal(f.basis.months, 1);
});

test("a discounted cash flow value shows every input, and refuses growth at or above the rate", () => {
  const v = dcf({ cashFlows: [100, 100, 100], rate: 0.1 });
  assert.ok(Math.abs(v.value - 1000) < 1e-9, "a flat 100 a year at 10% is worth 1,000");
  assert.ok(Math.abs(v.terminalShare - 0.7513148009015777) < 1e-12);
  assert.deepEqual(v.inputs, { cashFlows: [100, 100, 100], rate: 0.1, terminalGrowth: 0 });
  assert.throws(() => dcf({ cashFlows: [100], rate: 0.05, terminalGrowth: 0.05 }), /below the discount rate/);
});
