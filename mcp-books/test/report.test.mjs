// Canli Report on the fixture month: its statements as US GAAP and IFRS facts that pass the checks, then the
// checks catching a scale slip, a wrong sign, a fact given twice and totals that do not add up, and an
// account with no concept listed rather than guessed.
import assert from "node:assert/strict";
import test from "node:test";

import { addAccount, post } from "../src/ledger.mjs";
import { checkFacts, toFacts } from "../src/report.mjs";
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

test("an account with no concept is listed as unmapped, not guessed", () => {
  const book = month();
  addAccount(book, { code: "7000", name: "Consulting fees", type: "income" });
  post(book, { date: "2026-01-20", memo: "Advice", lines: [{ account: "1100", debit: "500" }, { account: "7000", credit: "500" }] });
  const { facts, unmapped } = toFacts(book, january);
  assert.deepEqual(unmapped, ["7000"]);
  assert.equal(checkFacts(facts).ok, true, "the totals still include it");
});
