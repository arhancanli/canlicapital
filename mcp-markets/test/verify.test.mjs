// verify_claims on SEC company-concept facts (scripts/capture-analyst-fixtures.mjs): Apple's true,
// wrong and impossible claims, a draft with last year's figures and a unit slip, Tesla's false
// premises, Home Depot's fiscal year labels and Apple's fourth quarter derived from the year.
import assert from "node:assert/strict";
import test from "node:test";

import { createSession } from "../src/sources.mjs";
import { claimMeasure, claimPeriod, currencyOf, verifyClaims } from "../src/verify.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });
const col = (r, name) => r.columns.indexOf(name);
const verdicts = (r) => r.rows.map((x) => [x[col(r, "measure")], x[col(r, "claimed")], x[col(r, "verdict")]]);

test("Apple: true figures confirmed at their own precision, a wrong one traced to the year it belongs to", async () => {
  const r = await verifyClaims(session(), { company: "AAPL", claims: [
    { measure: "revenue", period: "fiscal 2025", value: 416.2, unit: "USD billion" },
    { measure: "revenue", period: "fiscal 2025", value: 391.0, unit: "USD billion" },
    { measure: "diluted EPS", period: "fiscal 2025", value: 7.46 },
    { measure: "net income", period: "fiscal 2031", value: 120, unit: "USD billion" },
    { measure: "operating margin", period: "fiscal 2025", value: 32 },
    { measure: "revenue", period: "fiscal 2025", value: 6.4, growth: true },
    { measure: "adjusted EBITDA", period: "fiscal 2025", value: 150, unit: "USD billion" },
    { measure: "total assets", period: "fiscal 2025", value: 359.2, unit: "USD billion" },
  ] });
  assert.deepEqual(verdicts(r), [
    ["revenue", 416.2, "confirmed"], ["revenue", 391, "contradicted"], ["eps", 7.46, "confirmed"], ["net_income", 120, "not reported"],
    ["operating_margin", 32, "confirmed"], ["revenue", 6.4, "confirmed"], ["ebitda", 150, "not checkable"], ["total_assets", 359.2, "confirmed"],
  ]);
  const wrong = r.rows[1];
  assert.equal(wrong[col(r, "filed")], 416.161);
  assert.equal(wrong[col(r, "note")], "matches fiscal 2024 instead");
  assert.match(r.rows[3][col(r, "note")], /latest annual figure is for fiscal 2025 \(the year ending 2025-09-27\)/);
  assert.match(r.rows[0][col(r, "source")], /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/320193\/.+-index\.htm$/);
  assert.deepEqual(r.summary, { claims: 8, confirmed: 5, contradicted: 1, not_reported: 1, not_checkable: 1 });
});

test("a draft answer: every figure found with its measure and period, each mistake named", async () => {
  const r = await verifyClaims(session(), { company: "AAPL", text: "In fiscal 2025 Apple had revenue of $391.0 billion and net income of $93.7 billion. Diluted EPS was $6.08. Operating income was $133.1 million." });
  assert.deepEqual(verdicts(r), [["revenue", 391, "contradicted"], ["net_income", 93.7, "contradicted"], ["eps", 6.08, "contradicted"], ["operating_income", 133.1, "contradicted"]]);
  assert.deepEqual(r.rows.map((x) => x[col(r, "period")]), ["fiscal 2025", "fiscal 2025", "fiscal 2025", "fiscal 2025"], "a sentence with no period takes the last one named");
  assert.deepEqual(r.rows.map((x) => x[col(r, "note")]), ["matches fiscal 2024 instead", "matches fiscal 2024 instead", "matches fiscal 2024 instead", "matches the filed figure times 0.001: a slip of units"]);
});

test("false premises come back as not reported, never as a number", async () => {
  const r = await verifyClaims(session(), { company: "TSLA", claims: [{ measure: "dividends per share", period: "fiscal 2024", value: 1.0 }, { measure: "revenue", period: "fiscal 2024", value: 97.7, unit: "USD billion" }] });
  assert.deepEqual(verdicts(r), [["dividends_per_share", 1, "not reported"], ["revenue", 97.7, "confirmed"]]);
  assert.match(r.rows[0][col(r, "note")], /no dividends per share/);
  assert.equal(r.rows[0][col(r, "filed")], null);
});

test("fiscal years as the company labels them, and a fourth quarter derived from its year", async () => {
  const hd = await verifyClaims(session(), { company: "354950", claims: [{ measure: "revenue", period: "fiscal 2025", value: 164.7, unit: "USD billion" }, { measure: "total assets", period: "fiscal 2025", value: 105.1, unit: "USD billion" }] });
  assert.deepEqual(verdicts(hd), [["revenue", 164.7, "confirmed"], ["total_assets", 105.1, "confirmed"]]);
  assert.equal(hd.rows[1][col(hd, "filed")], 105.095, "Home Depot's fiscal 2025 ends in February 2026");
  const q = await verifyClaims(session(), { company: "AAPL", claims: [{ measure: "revenue", period: "Q4 fiscal 2025", value: 102.5, unit: "USD billion" }, { measure: "revenue", period: "Q3 fiscal 2025", value: 94.0, unit: "USD billion" }] });
  assert.deepEqual(verdicts(q), [["revenue", 102.5, "confirmed"], ["revenue", 94, "confirmed"]]);
  assert.match(q.rows[0][col(q, "note")], /^derived: the fiscal year \(10-K\) less the first nine months/);
});

// Before 2026-10-15 every foreign filer came back "not reported": only US GAAP tags in US dollars on
// 10-K and 10-Q were read.
test("foreign filers: IFRS or US GAAP, in the currency the company reports in; a conversion is called one", async () => {
  const novo = await verifyClaims(session(), { company: "353278", claims: [
    { measure: "revenue", period: "fiscal 2025", value: 309.064, unit: "DKK billion" },
    { measure: "net income", period: "2025", value: 102.4, unit: "DKK billion" },
    { measure: "revenue", period: "2025", value: 309.1, unit: "USD billion" },
    { measure: "revenue", period: "2025", value: 45.0, unit: "USD billion" },
    { measure: "diluted EPS", period: "fiscal 2025", value: 23.0 },
    { measure: "operating margin", period: "fiscal 2025", value: 41.3 },
  ] });
  assert.deepEqual(verdicts(novo), [["revenue", 309.064, "confirmed"], ["net_income", 102.4, "confirmed"], ["revenue", 309.1, "contradicted"], ["revenue", 45, "not checkable"], ["eps", 23, "confirmed"], ["operating_margin", 41.3, "confirmed"]]);
  const note = (r, i) => r.rows[i][col(r, "note")];
  assert.equal(novo.rows[1][col(novo, "filed")], 102.434, "Novo Nordisk has no minority interests: profit for the year");
  assert.equal(note(novo, 2), "the number is the filed figure in DKK, not USD: the currency is wrong");
  assert.match(note(novo, 3), /reports in DKK \(DKK 309\.064 billion filed\); a USD figure is a conversion/);
  assert.equal(novo.rows[4][col(novo, "unit")], "DKK per share");
  assert.match(novo.rows[5][col(novo, "note")], /^ifrs-full:ProfitLossFromOperatingActivities \/ ifrs-full:Revenue/);
  const tsmc = await verifyClaims(session(), { company: "1046179", claims: [
    { measure: "revenue", period: "fiscal 2024", value: 88.3, unit: "USD billion" },
    { measure: "revenue", period: "fiscal 2024", value: 2894.3, unit: "TWD billion" },
    { measure: "revenue", period: "fiscal 2024", value: 2.89, unit: "trillion" },
  ] });
  assert.deepEqual(tsmc.rows.map((x) => [x[col(tsmc, "verdict")], x[col(tsmc, "filed")], x[col(tsmc, "note")]]), [
    ["confirmed", 88.268, "the USD figure the filing gives beside its TWD one (a convenience translation)"],
    ["confirmed", 2894.3077, null],
    ["confirmed", 2.894308, "in TWD, the currency the company reports in"],
  ]);
  const drafted = await verifyClaims(session(), { company: "1046179", text: "TSMC's revenue in 2024 was NT$2.89 trillion." });
  assert.deepEqual(drafted.rows.map((x) => [x[col(drafted, "unit")], x[col(drafted, "verdict")]]), [["TWD trillion", "confirmed"]], "NT dollars are not US dollars");
});

test("a quarter from a foreign filer's 6-K, and profit attributable to shareholders", async () => {
  const r = await verifyClaims(session(), { company: "1306965", claims: [
    { measure: "revenue", period: "Q2 2025", value: 65.4, unit: "USD billion" },
    { measure: "revenue", period: "fiscal 2025", value: 266.9, unit: "USD billion" },
    { measure: "net income", period: "fiscal 2025", value: 18.1, unit: "USD billion" },
  ] });
  assert.deepEqual(verdicts(r), [["revenue", 65.4, "confirmed"], ["revenue", 266.9, "confirmed"], ["net_income", 18.1, "contradicted"]]);
  assert.equal(r.rows[2][col(r, "filed")], 17.837);
  assert.match(r.rows[2][col(r, "note")], /^matches ifrs-full:ProfitLoss \(profit including non-controlling interests\) for fiscal 2025 instead/);
});

test("periods and figures in everyday words: a plain year, FY'25, a span by its end date, 9.6bn", async () => {
  const apple = await verifyClaims(session(), { company: "AAPL", text: "Apple's 2025 revenue was $416.2 billion. For the three months ended June 28, 2025, revenue was $94.0 billion. FY'25 net income was $112.0bn." });
  assert.deepEqual(apple.rows.map((x) => [x[col(apple, "period")], x[col(apple, "claimed")], x[col(apple, "verdict")]]), [
    ["fiscal 2025", 416.2, "confirmed"], ["the three months ended 2025-06-28", 94, "confirmed"], ["fiscal 2025", 112, "confirmed"],
  ]);
  const asml = await verifyClaims(session(), { company: "937966", text: "ASML's revenue in 2025 was €32.7 billion and net income was €9.6bn." });
  assert.deepEqual(asml.rows.map((x) => [x[col(asml, "measure")], x[col(asml, "period")], x[col(asml, "verdict")], x[col(asml, "filed")]]), [
    ["revenue", "fiscal 2025", "confirmed", 32.6673], ["net_income", "fiscal 2025", "confirmed", 9.6094],
  ], "ASML files US GAAP in euros");
});

test("claims' measures and periods as people write them", () => {
  assert.deepEqual(claimPeriod("three months ended June 28, 2025"), { end: "2025-06-28", months: 3 });
  assert.deepEqual(claimPeriod("nine months ended September 30, 2025"), { end: "2025-09-30", months: 9 });
  assert.deepEqual(claimPeriod("FY'25"), { fy: 2025, fp: "FY" });
  assert.deepEqual(["DKK billion", "€ billion", "USD per share", "NT dollars", "billion", "%"].map(currencyOf), ["DKK", "EUR", "USD", null, null, null]);
  assert.equal(claimMeasure("diluted EPS"), "eps");
  assert.equal(claimMeasure("basic earnings per share"), "eps_basic");
  assert.equal(claimMeasure("total assets"), "total_assets");
  assert.equal(claimMeasure("research and development expense"), "rnd");
  assert.equal(claimMeasure("operating margin"), "operating_margin");
  assert.equal(claimMeasure("gross profit"), "gross_profit");
  assert.equal(claimMeasure("gross profit margin"), "gross_margin");
  assert.deepEqual(claimPeriod("fiscal 2025"), { fy: 2025, fp: "FY" });
  assert.deepEqual(claimPeriod("FY25"), { fy: 2025, fp: "FY" });
  assert.deepEqual(claimPeriod("Q3 2026"), { fy: 2026, fp: "Q3" });
  assert.deepEqual(claimPeriod("third quarter of fiscal 2026"), { fy: 2026, fp: "Q3" });
  assert.deepEqual(claimPeriod("2024"), { fy: 2024, fp: "FY" });
  assert.equal(claimPeriod("last year"), null);
});

test("input that cannot be checked is refused with what to pass", async () => {
  await assert.rejects(verifyClaims(session(), { company: "AAPL" }), /claims .* or the text/);
  await assert.rejects(verifyClaims(session(), { company: "AAPL", text: "A sentence with no figures in it at all." }), /No figure/);
  const r = await verifyClaims(session(), { company: "AAPL", claims: [{ measure: "revenue", period: "last year", value: 1 }, { measure: "ARPU", period: "fiscal 2025", value: 1 }] });
  assert.deepEqual(r.rows.map((x) => x[col(r, "verdict")]), ["not checkable", "not checkable"]);
});

test("an empty concept answer from SEC falls back to the company's facts file", async () => {
  // As SEC answered for Coca-Cola's Revenues on 2026-10-14: {"units":{"USD":{}}}.
  const empty = { cik: 21344, taxonomy: "us-gaap", tag: "Revenues", units: { USD: {} } };
  const fact = (fy, val, end) => ({ start: `${fy}-01-01`, end, val, accn: `0000021344-${String(fy + 1).slice(2)}-000001`, fy, fp: "FY", form: "10-K", filed: `${fy + 1}-02-20` });
  const facts = { cik: 21344, facts: { "us-gaap": { Revenues: { units: { USD: [fact(2024, 47061000000, "2024-12-31"), fact(2025, 47941000000, "2025-12-31")] } } } } };
  const extra = {
    "https://data.sec.gov/api/xbrl/companyconcept/CIK0000021344/us-gaap/Revenues.json": empty,
    "https://data.sec.gov/api/xbrl/companyfacts/CIK0000021344.json": facts,
  };
  const s = createSession({ fetchImpl: replayFetch(extra).fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });
  const r = await verifyClaims(s, { company: "21344", claims: [{ measure: "revenue", period: "fiscal 2025", value: 47.9, unit: "USD billion" }, { measure: "revenue", period: "fiscal 2025", value: 47.1, unit: "USD billion" }] });
  assert.deepEqual(r.rows.map((x) => [x[5], x[6], x[8]]), [["confirmed", 47.941, null], ["contradicted", 47.941, "matches fiscal 2024 instead"]]);
});
