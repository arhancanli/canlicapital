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
  const broken = [...facts.map((f) => (f.concept === "CashAndCashEquivalentsAtCarryingValue" ? { ...f, value: -f.value } : f)), { ...facts.find((f) => f.concept === "Assets"), value: 4805 }];
  assert.deepEqual(checkFacts(broken, { prior }).findings.map((f) => f.rule).sort(), ["duplicate", "scale", "sign"]);
  assert.equal(checkFacts(facts.map((f) => (f.concept === "Revenues" ? { ...f, value: -f.value } : f))).ok, true, "revenue below zero is not flagged: net of losses it can be");
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
      Assets: usd(fact("A1", "2024-12-31", 1000), fact("A2", "2024-12-31", 1000), fact("A2", "2025-12-31", 1300), fact("Q1", "2026-03-31", 1403)),
      Liabilities: usd(fact("A1", "2024-12-31", 600), fact("A2", "2024-12-31", 600), fact("A2", "2025-12-31", 700), fact("Q1", "2026-03-31", 770)),
      StockholdersEquity: usd(fact("A1", "2024-12-31", 400), fact("A2", "2024-12-31", 400), fact("A2", "2025-12-31", 520), fact("Q1", "2026-03-31", 560)),
      // 2025: 30 of minority interests in equity and 50 of temporary equity between liabilities and equity.
      StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: usd(fact("A2", "2025-12-31", 550)),
      TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests: usd(fact("A2", "2025-12-31", 50)),
      // March 2026: liabilities and equity are 60 short of their total, as when temporary equity has a tag of its own,
      // but assets are 13 over it, more than the figures' rounding.
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
  // Last year's shares authorized, filed again a thousand times smaller: the same date, so the slip is plain. The
  // value compared with is named with its filing; no other filing gives it, so neither is found out of line.
  assert.deepEqual(a2.findings.map((f) => [f.rule, f.concept, f.prior, f.out_of_line, f.others]), [["scale", "CommonStockSharesAuthorized", { value: 1800000000, period: { instant: "2024-12-31" }, accession: "A1", form: "10-K", filed: "2025-02-14" }, null, []]]);
  assert.equal(a2.findings[0].detail, "1800000 at 2024-12-31 is 1/1000 of the prior value 1800000000 at 2024-12-31 in 10-K A1, filed 2025-02-14: check the scale");
  assert.deepEqual(q1.findings.map((f) => [f.rule, f.concept]), [["balance", "Assets"]], "the 60 short is left alone; assets 13 over are not");
  assert.deepEqual([a2.findings[0].unit, a2.findings[0].period, a2.findings[0].value, q1.findings[0].unit, q1.findings[0].period, q1.findings[0].value], ["shares", { instant: "2024-12-31" }, 1800000, "USD", { instant: "2026-03-31" }, 1403], "each finding carries its unit, period and value");
  assert.deepEqual(out.counts, { scale: 1, balance: 1 });
  assert.equal(checkSecFilings(example, { last: 1 }).filings[0].accession, "Q1");
  assert.equal(checkSecFilings(example, { forms: ["10-Q"] }).checked, 1);

  const ifrs = { entityName: "Example plc", facts: { "ifrs-full": { Assets: { units: { EUR: [{ end: "2025-12-31", val: 90, accn: "F1", form: "20-F", filed: "2026-04-01" }] } }, EquityAndLiabilities: { units: { EUR: [{ end: "2025-12-31", val: 90, accn: "F1", form: "20-F", filed: "2026-04-01" }] } } } } };
  assert.deepEqual([checkSecFilings(ifrs).taxonomy, checkSecFilings(ifrs).filings[0].ok], ["ifrs-full", true]);
  assert.throws(() => checkSecFilings({ facts: { dei: {} } }), /no us-gaap or ifrs-full facts/);
});

// A filing's balance sheet at one date, and two years of a flow, as checkSecFilings checks them.
const at = (concept, value) => ({ concept, unit: "USD", value, period: { instant: "2025-12-31" } });
const year = (concept, unit, value, y) => ({ concept, unit, value, period: { start: `${y}-01-01`, end: `${y}-12-31` } });
const asFiled = { untagged: true, rounded: true };
const flags = (facts, options = asFiled) => checkFacts(facts, options).findings.map((f) => `${f.rule} ${f.concept}`);

test("a filing's totals are checked within the figures' rounding, read from the figures themselves", () => {
  // In millions to one decimal: liabilities and equity a tenth of a million over their total, one rounding unit.
  const tenths = [at("Liabilities", 4200100000), at("StockholdersEquity", 3500400000), at("LiabilitiesAndStockholdersEquity", 7700400000)];
  assert.deepEqual(flags(tenths), []);
  assert.deepEqual(flags(tenths, { untagged: true }), ["balance LiabilitiesAndStockholdersEquity"], "without rounding, as for a book");
  assert.deepEqual(flags([...tenths.slice(0, 2), at("LiabilitiesAndStockholdersEquity", 7700300000)]), ["balance LiabilitiesAndStockholdersEquity"], "two tenths are more than rounding");
  // In dollars: a dollar is rounding, two are not.
  const dollars = (total) => [at("Liabilities", 1234567), at("StockholdersEquity", 2345679), at("LiabilitiesAndStockholdersEquity", total)];
  assert.deepEqual([flags(dollars(3580245)), flags(dollars(3580244))], [[], ["balance LiabilitiesAndStockholdersEquity"]]);
  // In thousands: assets a thousand off their total, one rounding unit, though 5,120,000 alone ends in 0000.
  assert.deepEqual(flags([at("Assets", 5120000), at("LiabilitiesAndStockholdersEquity", 5119000)]), []);
  assert.deepEqual(flags([at("Assets", 5121000), at("LiabilitiesAndStockholdersEquity", 5119000)]), ["balance Assets"]);
  // A figure in thousands that ends in 000000 by chance does not widen the rounding: two thousands over is flagged.
  assert.deepEqual(flags([at("Liabilities", 3000000000), at("StockholdersEquity", 1234000), at("LiabilitiesAndStockholdersEquity", 3001232000)]), ["balance LiabilitiesAndStockholdersEquity"]);
  const sec = { facts: { "us-gaap": { Assets: usd(fact("Q1", "2026-03-31", 5120000)), LiabilitiesAndStockholdersEquity: usd(fact("Q1", "2026-03-31", 5119000)) } } };
  assert.equal(checkSecFilings(sec).filings[0].ok, true, "a company's SEC filings are read as rounded");
});

test("a filing's minority interests are counted, one amount under two temporary-equity tags once, and a shortfall is said to be what tags by class leave", () => {
  const sheet = (...facts) => [at("Liabilities", 1204000), ...facts];
  // Minority interests tagged on their own, with no total that includes them.
  assert.deepEqual(flags(sheet(at("TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests", 51000), at("StockholdersEquity", 903000), at("MinorityInterest", 27000), at("LiabilitiesAndStockholdersEquity", 2185000))), []);
  assert.deepEqual(flags(sheet(at("TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests", 51000), at("StockholdersEquity", 903000), at("MinorityInterest", 27000), at("StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", 930000), at("LiabilitiesAndStockholdersEquity", 2185000))), [], "with their total tagged, they are not added again");
  // Redeemable minority interests tagged as both parts of temporary equity: once. Two amounts: both.
  const parts = (parent, redeemable, total) => flags(sheet(at("TemporaryEquityCarryingAmountAttributableToParent", parent), at("RedeemableNoncontrollingInterestEquityCarryingAmount", redeemable), at("StockholdersEquity", 903000), at("LiabilitiesAndStockholdersEquity", total)));
  assert.deepEqual([parts(73000, 73000, 2180000), parts(73000, 19000, 2199000)], [[], []]);
  // Temporary equity tagged, yet the parts are 45,000 short: flagged, and said to be what tags by class or series leave.
  const short = checkFacts(sheet(at("TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests", 51000), at("StockholdersEquity", 903000), at("LiabilitiesAndStockholdersEquity", 2203000)), asFiled).findings;
  assert.deepEqual(short.map((f) => f.detail), ["Liabilities 1204000 plus temporary equity 51000 plus StockholdersEquity 903000 is not LiabilitiesAndStockholdersEquity 2203000 at 2025-12-31: short by 45000, as when temporary equity is tagged only by class or series"]);
  // Equity that includes the temporary equity shown above it: over the total, flagged as it is.
  const over = checkFacts(sheet(at("TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests", 51000), at("StockholdersEquity", 954000), at("LiabilitiesAndStockholdersEquity", 2158000)), asFiled).findings;
  assert.deepEqual(over.map((f) => f.detail), ["Liabilities 1204000 plus temporary equity 51000 plus StockholdersEquity 954000 is not LiabilitiesAndStockholdersEquity 2158000 at 2025-12-31"]);
});

test("tax rates and percentages are not checked for scale; exchange rates, counts and amounts are, whatever their names", () => {
  const scale = (concept, unit, before, now) => checkFacts([year(concept, unit, now, 2025)], { prior: [year(concept, unit, before, 2024)] }).findings.map((f) => f.rule);
  assert.deepEqual(scale("EffectiveIncomeTaxRateContinuingOperations", "pure", 0.0012, 1.25), [], "about 1,042 times, a real change");
  assert.deepEqual(scale("ConcentrationRiskPercentage1", "pure", 0.31, 310), []);
  // A currency rarely moves a thousandfold between filings: a rate tagged with the wrong scale, either way, is a slip.
  assert.deepEqual(scale("ForeignCurrencyExchangeRateTranslation1", "pure", 7.1, 7100), ["scale"], "7,100 yuan to the dollar");
  assert.deepEqual(scale("ForeignCurrencyExchangeRateRemeasurement1", "pure", 1320, 1.32), ["scale"], "1.32 won to the dollar");
  assert.deepEqual(scale("ForeignCurrencyExchangeRateTranslation1", "pure", 7.1, 7.3), [], "a real move");
  assert.deepEqual(scale("DebtSecuritiesAvailableForSaleUnrealizedLossPositionNumberOfPositions", "pure", 150000, 151), ["scale"], "a count filed in thousands");
  assert.deepEqual(scale("PublicUtilitiesApprovedRateIncreaseDecreaseAmount", "USD", 12000, 12000000), ["scale"], "an amount, though its name says Rate");
});

test("a thousandfold change the filing states itself, beside the year before as filed, is real; a slip shows at the period both filings give", () => {
  const trust = (value, y) => ({ concept: "AssetsHeldInTrustNoncurrent", unit: "USD", value, period: { instant: `${y}-12-31` } });
  const income = (value, y) => year("InvestmentIncomeInterest", "USD", value, y);
  const earlier = [trust(25000, 2024), trust(20000, 2023), income(120, 2024), income(95, 2023)];
  // A blank-check company's trust after its IPO, about a thousand times what it held, and a year of interest on it:
  // the filing repeats the year before as it was filed, so the change is its own.
  assert.deepEqual(flags([trust(25100000, 2025), trust(25000, 2024), income(125000, 2025), income(120, 2024)], { prior: earlier }), []);
  // The same new figures in a filing that does not repeat the year before are still compared across the years.
  assert.deepEqual(flags([trust(25100000, 2025), income(125000, 2025)], { prior: earlier }), ["scale AssetsHeldInTrustNoncurrent", "scale InvestmentIncomeInterest"]);
  assert.deepEqual(flags([trust(25100000, 2025), { ...trust(23000, 2024), unit: "EUR" }], { prior: earlier }), ["scale AssetsHeldInTrustNoncurrent"], "the year before in another currency is another figure");
  // The earlier filing's figure a thousand times too large, given rightly in the later one: one flag, at the date both
  // filings give, against the earlier filing's figure; the new year is not flagged across the years as well.
  const found = checkFacts([trust(26000, 2025), trust(25000, 2024)], { prior: [trust(25000000, 2024)] }).findings;
  assert.deepEqual(found.map((f) => [f.rule, f.period, f.value, f.prior]), [["scale", { instant: "2024-12-31" }, 25000, { value: 25000000, period: { instant: "2024-12-31" } }]]);
  // The later filing's year before slipped as well as its new year: the year before shows the slip.
  assert.deepEqual(flags([trust(26000000, 2025), trust(25000000, 2024)], { prior: [trust(25000, 2024)] }), ["scale AssetsHeldInTrustNoncurrent"]);
});

// One company's figures for one concept as [filing, date, value], each filing's form and date as EDGAR gives them,
// and its scale flags with what the company's other filings say about them.
const dated = { K1: ["10-K", "2011-02-25"], Q1: ["10-Q", "2011-05-06"], S1: ["S-1", "2011-06-01"], K2: ["10-K", "2012-02-29"], E1: ["8-K", "2012-04-02"], Q2: ["10-Q", "2012-05-08"], K3: ["10-K", "2013-02-28"], Q3: ["10-Q", "2013-05-08"], E2: ["8-K", "2013-05-20"], KA: ["10-K/A", "2013-06-03"] };
const scaleFlags = (concept, figures) => {
  const facts = { "us-gaap": { [concept]: { units: { USD: figures.map(([accn, end, val]) => ({ end, val, accn, form: dated[accn][0], filed: dated[accn][1] })) } } } };
  const flags = checkSecFilings({ facts }, { last: Infinity }).filings.flatMap((r) => r.findings.map((f) => ({ in: r.accession, at: f.period.instant, earlier: f.prior.accession, out_of_line: f.out_of_line, others: f.others.map((o) => o.accession), said: f.detail.split("check the scale")[1] })));
  return flags.sort((a, b) => (a.in + a.at < b.in + b.at ? -1 : 1));
};

test("a scale flag names both filings, and the company's other filings, by when they were filed, find the one out of line", () => {
  // A table in billions tagged as millions in one annual report (K2). Its own flag finds only a 10-Q before it that
  // agrees with the annual report before, as a scale kept for years and then corrected would also show; the next
  // annual report's flag finds K2 out of line, since a 10-Q filed between the two gave the figure at the later scale.
  const pledged = [["K1", "2010-12-31", 200e9], ["Q1", "2011-03-31", 205e9], ["Q1", "2010-12-31", 200e9], ["K2", "2011-12-31", 210e6], ["K2", "2010-12-31", 200e6], ["K3", "2012-12-31", 220e9], ["K3", "2011-12-31", 210e9]];
  const before = ". Filings before this one give these figures at the earlier filing's scale (10-Q Q1): this filing slipped, or it corrects a scale they shared.";
  assert.deepEqual(scaleFlags("SecurityOwnedAndPledgedAsCollateralFairValue", [...pledged, ["Q2", "2012-03-31", 212e9], ["Q2", "2011-12-31", 210e9]]), [
    { in: "K2", at: "2010-12-31", earlier: "K1", out_of_line: null, others: ["Q1"], said: before },
    { in: "K3", at: "2011-12-31", earlier: "K2", out_of_line: "K2", others: ["Q2"], said: ". Other filings give these figures at this filing's scale (10-Q Q2): the earlier filing is out of line." },
  ]);
  // Without that 10-Q, a later amendment giving K2's date at K3's scale cannot tell a slip from a new scale; with a
  // filing between them at each scale, neither filing is named.
  assert.deepEqual(scaleFlags("SecurityOwnedAndPledgedAsCollateralFairValue", [...pledged, ["KA", "2011-12-31", 210e9]]).map((f) => [f.in, f.out_of_line, f.said]), [
    ["K2", null, before],
    ["K3", null, ". Later filings give these figures at this filing's scale (10-K/A KA): the earlier filing slipped, or a new scale began with this one."],
  ]);
  const split = scaleFlags("SecurityOwnedAndPledgedAsCollateralFairValue", [...pledged, ["E1", "2011-12-31", 210e6], ["Q2", "2011-12-31", 210e9]]).at(-1);
  assert.deepEqual([split.in, split.out_of_line, split.said], ["K3", null, ". Other filings give these figures at both scales (8-K E1, 10-Q Q2)."]);
  // A 10-Q's cash in thousands (Q2), compared across quarters: annual reports before and after it give its date at the
  // earlier 10-Q's scale, so Q2 is out of line. A date no other filing gives is left undecided, and so is the next
  // 10-Q's flag, back to scale against Q2's other date: an annual report that gives the new figure as filed says
  // nothing against the old one. A later amendment at Q2's own scale leaves the two scales side by side.
  const cash = [
    ["K1", "2010-12-31", 9e9], ["Q1", "2011-03-31", 9.1e9], ["Q1", "2010-12-31", 9e9], ["K2", "2011-12-31", 9.5e9], ["K2", "2010-12-31", 9e9], ["Q2", "2012-03-31", 9.6e6],
    ["Q2", "2011-12-31", 9.5e6], ["K3", "2012-12-31", 9.8e9], ["K3", "2011-12-31", 9.5e9], ["Q3", "2013-03-31", 9.9e9], ["Q3", "2012-12-31", 9.8e9],
  ];
  assert.deepEqual(scaleFlags("CashAndCashEquivalentsAtCarryingValue", cash).map((f) => [f.in, f.at, f.earlier, f.out_of_line, f.others.join(" "), f.said.slice(0, 40)]), [
    ["Q2", "2011-12-31", "Q1", "Q2", "K2 K3", ". Other filings give these figures at th"],
    ["Q2", "2012-03-31", "Q1", null, "", ""],
    ["Q3", "2012-12-31", "Q2", null, "K3", ""],
    ["Q3", "2013-03-31", "Q2", null, "", ""],
  ]);
  const amended = scaleFlags("CashAndCashEquivalentsAtCarryingValue", [...cash, ["KA", "2011-12-31", 9.5e6]])[0];
  assert.deepEqual([amended.in, amended.at, amended.out_of_line, amended.said], ["Q2", "2011-12-31", null, ". Other filings give these figures at both scales (10-K K2, 10-K K3, 10-K/A KA)."]);
  // Likewise a later filing that gives the earlier 10-Q's date as filed says nothing against Q2's new figure.
  const asFiled = scaleFlags("CashAndCashEquivalentsAtCarryingValue", [...cash, ["E2", "2011-03-31", 9.1e9]]).find((f) => f.in === "Q2" && f.at === "2012-03-31");
  assert.deepEqual([asFiled.out_of_line, asFiled.others, asFiled.said], [null, ["E2"], ""]);
  // A figure filed at the wrong scale for years, then corrected (K3): the filings before agree with the earlier one,
  // which is no evidence against the correction, so neither is named; a later filing at the corrected scale sets the
  // two scales side by side.
  const years = [["K1", "2010-12-31", 25e3], ["Q1", "2011-03-31", 25.5e3], ["Q1", "2010-12-31", 25e3], ["K2", "2011-12-31", 26e3], ["K2", "2010-12-31", 25e3], ["Q2", "2012-03-31", 26.5e3], ["Q2", "2011-12-31", 26e3], ["K3", "2012-12-31", 27e6], ["K3", "2011-12-31", 26e6]];
  assert.deepEqual(scaleFlags("AssetsHeldInTrustNoncurrent", years), [{ in: "K3", at: "2011-12-31", earlier: "K2", out_of_line: null, others: ["Q2"], said: ". Filings before this one give these figures at the earlier filing's scale (10-Q Q2): this filing slipped, or it corrects a scale they shared." }]);
  assert.deepEqual(scaleFlags("AssetsHeldInTrustNoncurrent", [...years, ["KA", "2011-12-31", 26e6]]).map((f) => [f.out_of_line, f.said]), [[null, ". Other filings give these figures at both scales (10-Q Q2, 10-K/A KA)."]]);
  // A thousandfold change between two years, each year's figure given as filed by another filing, a registration
  // statement before and a current report after: the change may be real, and neither filing is named.
  assert.deepEqual(scaleFlags("AssetsHeldInTrustNoncurrent", [["K1", "2010-12-31", 25e3], ["S1", "2010-12-31", 25e3], ["K2", "2011-12-31", 25.1e6], ["E1", "2011-12-31", 25.1e6]]), [
    { in: "K2", at: "2011-12-31", earlier: "K1", out_of_line: null, others: ["S1", "E1"], said: ". Other filings give both figures as filed (S-1 S1, 8-K E1): the change may be real." },
  ]);
});

test("an account with no concept is listed as unmapped, not guessed", () => {
  const book = month();
  addAccount(book, { code: "7000", name: "Consulting fees", type: "income" });
  post(book, { date: "2026-01-20", memo: "Advice", lines: [{ account: "1100", debit: "500" }, { account: "7000", credit: "500" }] });
  const { facts, unmapped } = toFacts(book, january);
  assert.deepEqual(unmapped, ["7000"]);
  assert.equal(checkFacts(facts).ok, true, "the totals still include it");
});
