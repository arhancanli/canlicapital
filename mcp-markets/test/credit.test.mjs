// debt_profile on a companyfacts document whose figures are known.
import assert from "node:assert/strict";
import test from "node:test";

import { profileFromFacts } from "../src/credit.mjs";

const inst = (end, val, form = "10-K") => ({ end, val, form, fp: "FY", filed: "2026-02-01", accn: "0000000000-26-000001" });
const dur = (start, end, val) => ({ start, end, val, form: "10-K", fp: "FY", filed: "2026-02-01", accn: "0000000000-26-000001" });
const tag = (rows) => ({ units: { USD: rows } });
const facts = { entityName: "Example Corp", facts: { "us-gaap": {
  LongTermDebt: tag([inst("2025-12-31", 900), inst("2024-12-31", 700)]),
  LongTermDebtCurrent: tag([inst("2025-12-31", 100)]),
  LongTermDebtNoncurrent: tag([inst("2025-12-31", 800)]),
  CommercialPaper: tag([inst("2025-12-31", 100)]),
  CashAndCashEquivalentsAtCarryingValue: tag([inst("2025-12-31", 250), inst("2024-12-31", 200)]),
  InterestExpense: tag([dur("2025-01-01", "2025-12-31", 45), dur("2025-10-01", "2025-12-31", 12)]),
  OperatingIncomeLoss: tag([dur("2025-01-01", "2025-12-31", 300)]),
  DepreciationDepletionAndAmortization: tag([dur("2025-01-01", "2025-12-31", 100)]),
  LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths: tag([inst("2025-12-31", 100)]),
  LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo: tag([inst("2025-12-31", 200)]),
  LongTermDebtMaturitiesRepaymentsOfPrincipalAfterYearFive: tag([inst("2025-12-31", 700)]),
} } };

test("debt, the maturity ladder, and what the debt costs", () => {
  const r = profileFromFacts(facts);
  assert.equal(r.as_of, "2025-12-31");
  assert.equal(r.debt.total, 1000, "long-term debt 900 + commercial paper 100");
  assert.equal(r.net_debt, 750);
  assert.equal(r.maturities.ladder_total, 1000); assert.equal(r.maturities.due_within_2_years_share, 0.3);
  assert.equal(r.cost_and_cover.interest_expense, 45, "the year's interest, not the quarter's");
  assert.equal(r.cost_and_cover.implied_interest_rate, 0.0529, "45 over the average of 1,000 and 700");
  assert.equal(r.cost_and_cover.interest_coverage, 6.67); assert.equal(r.cost_and_cover.debt_to_ebitda, 2.5);
  assert.deepEqual(r.history.rows, [["2025-12-31", 1000, 250], ["2024-12-31", 700, 200]]);
});

test("debt tagged only in the company's own extension is said plainly", () => {
  const r = profileFromFacts({ facts: { "us-gaap": { CashAndCashEquivalentsAtCarryingValue: tag([inst("2025-12-31", 5)]) } } });
  assert.equal(r.debt.total, null);
  assert.match(r.note, /own extension/);
  assert.throws(() => profileFromFacts({ facts: { "us-gaap": {} } }), /tags no debt or cash/);
});
