// Canli Report on the fixture month: its statements as US GAAP and IFRS facts that pass the checks, then the
// checks catching a scale slip, a wrong sign, a fact given twice and totals that do not add up, and an
// account with no concept listed rather than guessed.
import assert from "node:assert/strict";
import test from "node:test";

import { addAccount, post } from "../src/ledger.mjs";
import { checkFacts, checkSecFilings, toFacts } from "../src/report.mjs";
import { month } from "./fixture.mjs";

const january = { asOf: "2026-01-31", from: "2026-01-01", to: "2026-01-31" };
const valueOf = (facts, concept) => facts.find((f) => f.concept === concept)?.value;

test("the month's statements become facts that pass the checks, in US GAAP and in IFRS", () => {
  const book = month();
  const us = toFacts(book, january);
  const v = (c) => valueOf(us.facts, c);
  assert.deepEqual([v("Assets"), v("Liabilities"), v("StockholdersEquity"), v("LiabilitiesAndStockholdersEquity")], [4805000, 5000, 4800000, 4805000]);
  assert.deepEqual([v("RetainedEarningsAccumulatedDeficit"), v("NetIncomeLoss"), v("OperatingLeaseCost")], [-200000, -200000, 300000]);
  assert.equal(us.facts.find((f) => f.concept === "Revenues").text, "1000.00");
  assert.deepEqual(us.unmapped, []);
  assert.equal(checkFacts(us.facts).ok, true);
  const ifrs = toFacts(book, { ...january, taxonomy: "ifrs-full" });
  assert.deepEqual([valueOf(ifrs.facts, "EquityAndLiabilities"), valueOf(ifrs.facts, "Equity"), valueOf(ifrs.facts, "ProfitLoss")], [4805000, 4800000, -200000]);
  assert.equal(checkFacts(ifrs.facts, { taxonomy: "ifrs-full" }).ok, true);
  assert.throws(() => toFacts(book, { ...january, taxonomy: "sec" }), /us-gaap, ifrs-full/);
});

test("the checks catch a scale slip, a wrong sign, a fact given twice, and totals that do not add up", () => {
  const { facts } = toFacts(month(), january);
  const prior = [{ concept: "Revenues", unit: "AED", period: { start: "2025-12-01", end: "2025-12-31" }, value: 100 }];
  const broken = [...facts.map((f) => (f.concept === "Revenues" ? { ...f, value: -f.value } : f)), { ...facts.find((f) => f.concept === "Assets"), value: 4805 }];
  assert.deepEqual(checkFacts(broken, { prior }).findings.map((f) => f.rule).sort(), ["duplicate", "scale", "sign"]);
  const off = facts.map((f) => (f.concept === "LiabilitiesAndStockholdersEquity" ? { ...f, value: f.value + 1000 } : f));
  assert.deepEqual(checkFacts(off).findings.map((f) => f.rule), ["balance", "balance"]);
});

// A company's SEC facts in the shape data.sec.gov serves them: each value carries its filing (accn), form and dates.
const filed = { A1: ["10-K", "2025-02-14"], A2: ["10-K", "2026-02-13"], Q1: ["10-Q", "2026-05-08"] };
const fact = (accn, end, val, start) => ({ ...(start ? { start } : {}), end, val, accn, fy: Number(filed[accn][1].slice(0, 4)), fp: filed[accn][0] === "10-K" ? "FY" : "Q1", form: filed[accn][0], filed: filed[accn][1] });
const usd = (...facts) => ({ units: { USD: facts } });
const example = {
  cik: 1234567,
  entityName: "Example Holdings Inc.",
  facts: {
    dei: { EntityCommonStockSharesOutstanding: { units: { shares: [fact("A2", "2026-01-31", 1790000000)] } } },
    "us-gaap": {
      Assets: usd(fact("A1", "2024-12-31", 1000), fact("A2", "2024-12-31", 1000), fact("A2", "2025-12-31", 1300), fact("Q1", "2026-03-31", 1400)),
      Liabilities: usd(fact("A1", "2024-12-31", 600), fact("A2", "2024-12-31", 600), fact("A2", "2025-12-31", 700), fact("Q1", "2026-03-31", 770)),
      StockholdersEquity: usd(fact("A1", "2024-12-31", 400), fact("A2", "2024-12-31", 400), fact("A2", "2025-12-31", 520), fact("Q1", "2026-03-31", 560)),
      // 2025: 30 of minority interests in equity and 50 of temporary equity between liabilities and equity.
      StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: usd(fact("A2", "2025-12-31", 550)),
      TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests: usd(fact("A2", "2025-12-31", 50)),
      // March 2026: liabilities and equity are 60 short of their total, as when temporary equity has a tag of its own,
      // but assets are 10 over it.
      LiabilitiesAndStockholdersEquity: usd(fact("A1", "2024-12-31", 1000), fact("A2", "2024-12-31", 1000), fact("A2", "2025-12-31", 1300), fact("Q1", "2026-03-31", 1390)),
      Revenues: usd(fact("A1", "2024-12-31", 5000, "2024-01-01"), fact("A2", "2024-12-31", 5000, "2024-01-01"), fact("A2", "2025-12-31", 5600, "2025-01-01")),
      // A real change, 753 times: not a slip.
      DebtSecuritiesHeldToMaturityAmortizedCostAfterAllowanceForCreditLoss: usd(fact("A1", "2024-12-31", 6000), fact("A2", "2025-12-31", 4518000)),
    },
  },
};
example.facts["us-gaap"].CommonStockSharesAuthorized = { units: { shares: [fact("A1", "2024-12-31", 1800000000), fact("A2", "2024-12-31", 1800000), fact("A2", "2025-12-31", 1800000000)] } };

test("a company's SEC filings are checked one by one: a scale slip and assets off their total are found, real changes and untagged temporary equity are not", () => {
  const out = checkSecFilings(example);
  assert.deepEqual([out.entityName, out.taxonomy, out.checked, out.withFindings], ["Example Holdings Inc.", "us-gaap", 3, 2]);
  const [a1, a2, q1] = out.filings;
  assert.deepEqual([a1.accession, a1.ok, a1.facts], ["A1", true, 7], "seven us-gaap facts; the dei one is not checked");
  // Last year's shares authorized, filed again a thousand times smaller: the same date, so the slip is plain.
  assert.deepEqual(a2.findings.map((f) => [f.rule, f.concept, f.prior]), [["scale", "CommonStockSharesAuthorized", { value: 1800000000, period: { instant: "2024-12-31" } }]]);
  assert.deepEqual(q1.findings.map((f) => [f.rule, f.concept]), [["balance", "Assets"]], "the 60 short is left alone; assets 10 over are not");
  assert.deepEqual(out.counts, { scale: 1, balance: 1 });
  assert.equal(checkSecFilings(example, { last: 1 }).filings[0].accession, "Q1");
  assert.equal(checkSecFilings(example, { forms: ["10-Q"] }).checked, 1);

  const ifrs = { entityName: "Example plc", facts: { "ifrs-full": { Assets: { units: { EUR: [{ end: "2025-12-31", val: 90, accn: "F1", form: "20-F", filed: "2026-04-01" }] } }, EquityAndLiabilities: { units: { EUR: [{ end: "2025-12-31", val: 90, accn: "F1", form: "20-F", filed: "2026-04-01" }] } } } } };
  assert.deepEqual([checkSecFilings(ifrs).taxonomy, checkSecFilings(ifrs).filings[0].ok], ["ifrs-full", true]);
  assert.throws(() => checkSecFilings({ facts: { dei: {} } }), /no us-gaap or ifrs-full facts/);
});

test("an account with no concept is listed as unmapped, not guessed", () => {
  const book = month();
  addAccount(book, { code: "7000", name: "Consulting fees", type: "income" });
  post(book, { date: "2026-01-20", memo: "Advice", lines: [{ account: "1100", debit: "500" }, { account: "7000", credit: "500" }] });
  const { facts, unmapped } = toFacts(book, january);
  assert.deepEqual(unmapped, ["7000"]);
  assert.equal(checkFacts(facts).ok, true, "the totals still include it");
});
