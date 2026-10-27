// federal_contracts, drug_pipeline, comment_letters and reverse_dcf: their pure parts, and the two
// keyless sources replayed (USAspending's POST searches, ClinicalTrials.gov and Drugs@FDA).
import assert from "node:assert/strict";
import test from "node:test";

import { federalContracts, lastFiscalYear, searchName } from "../src/contracts.mjs";
import { letterExcerpt, threads, topicsOf } from "../src/letters.mjs";
import { drugPipeline, phaseOf, sponsorName } from "../src/pipeline.mjs";
import { createSession } from "../src/sources.mjs";
import { annualSeries, dcfMultiple, impliedGrowth } from "../src/valuation.mjs";
import { replayFetch } from "./replay.mjs";

const NOW = Date.parse("2026-10-24T00:00:00Z");
const session = (extra) => createSession({ fetchImpl: replayFetch(extra).fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });

test("names searched: suffixes and SEC state tags dropped", () => {
  assert.equal(searchName("LOCKHEED MARTIN CORP"), "LOCKHEED MARTIN");
  assert.equal(searchName("Pfizer Inc /DE/"), "PFIZER");
  assert.equal(sponsorName("VERTEX PHARMACEUTICALS INC / MA"), "VERTEX PHARMACEUTICALS");
  assert.equal(sponsorName("Moderna, Inc."), "Moderna");
});

test("the last complete federal fiscal year ends on 30 September", () => {
  assert.equal(lastFiscalYear(Date.parse("2026-10-24")), 2026);
  assert.equal(lastFiscalYear(Date.parse("2026-09-30")), 2025);
});

test("federal_contracts: the total is the agencies' sum, and contracts link to USAspending", async () => {
  const API = "https://api.usaspending.gov/api/v2/search";
  const filters = { recipient_search_text: ["SIKORSKY"], award_type_codes: ["A", "B", "C", "D"], time_period: [{ start_date: "2025-10-01", end_date: "2026-09-30" }] };
  const key = (path, body) => `POST ${API}${path} ${JSON.stringify(body)}`;
  const extra = {
    [key("/spending_by_category/recipient/", { filters, limit: 10, page: 1 })]: { results: [{ name: "SIKORSKY AIRCRAFT CORPORATION", uei: "UTJWTSLMFNG4", amount: 3036325355.89 }] },
    [key("/spending_by_category/awarding_agency/", { filters, limit: 10, page: 1 })]: { results: [{ name: "Department of Defense", amount: 3000000000 }, { name: "Department of State", amount: 36325355.89 }] },
    [key("/spending_by_category/naics/", { filters, limit: 8, page: 1 })]: { results: [{ code: "336411", name: "Aircraft Manufacturing", amount: 2900000000 }] },
    [key("/spending_by_award/", { filters, fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Description", "Start Date", "End Date", "generated_internal_id"], limit: 1, page: 1, sort: "Award Amount", order: "desc" })]: { results: [{ "Award ID": "W58RGZ16C0023", "Recipient Name": "SIKORSKY AIRCRAFT CORPORATION", "Award Amount": 12e9, "Awarding Agency": "Department of Defense", Description: "UH-60M", "Start Date": "2016-06-27", "End Date": "2027-06-30", generated_internal_id: "CONT_AWD_W58RGZ16C0023_9700_-NONE-_-NONE-" }] },
  };
  const r = await federalContracts(session(extra), { recipients: ["SIKORSKY"], limit: 1 });
  assert.equal(r.fiscal_year, 2026);
  assert.equal(r.obligated_total, 3036325355.89);
  assert.equal(r.largest_contracts.rows[0][7], "https://www.usaspending.gov/award/CONT_AWD_W58RGZ16C0023_9700_-NONE-_-NONE-");
  await assert.rejects(federalContracts(session({}), {}), /needs company or recipients/);
});

test("drug_pipeline: phases named, readouts within the window, approvals newest first", async () => {
  assert.equal(phaseOf(["PHASE2", "PHASE3"]), "Phase 2/Phase 3");
  assert.equal(phaseOf(["NA"]), "Not applicable");
  const trial = (nct, phases, date, status = "RECRUITING") => ({ protocolSection: { identificationModule: { nctId: nct, briefTitle: `Study ${nct}` }, statusModule: { overallStatus: status, primaryCompletionDateStruct: { date } }, sponsorCollaboratorsModule: { leadSponsor: { name: "Vertex Pharmaceuticals Incorporated" } }, conditionsModule: { conditions: ["Cystic Fibrosis"] }, designModule: { studyType: "INTERVENTIONAL", phases, enrollmentInfo: { count: 100 } }, armsInterventionsModule: { interventions: [{ name: "VX-121" }, { name: "Placebo" }] } } });
  const p = new URLSearchParams({ "query.lead": "Vertex Pharmaceuticals", "filter.overallStatus": "RECRUITING|ACTIVE_NOT_RECRUITING|NOT_YET_RECRUITING|ENROLLING_BY_INVITATION", fields: "NCTId,BriefTitle,Phase,OverallStatus,Condition,InterventionName,PrimaryCompletionDate,LeadSponsorName,StudyType,EnrollmentCount", pageSize: "100", countTotal: "true" });
  const fda = `https://api.fda.gov/drug/drugsfda.json?${new URLSearchParams({ search: "sponsor_name:VERTEX*", limit: "100" })}`;
  const extra = {
    [`https://clinicaltrials.gov/api/v2/studies?${p}`]: { studies: [trial("NCT1", ["PHASE3"], "2027-03-01"), trial("NCT2", ["PHASE1"], "2026-12-01"), trial("NCT3", ["PHASE2"], "2029-01-01")] },
    [fda]: { results: [
      { application_number: "NDA206038", sponsor_name: "VERTEX PHARMS INC", products: [{ brand_name: "ORKAMBI", active_ingredients: [{ name: "IVACAFTOR" }, { name: "LUMACAFTOR" }], marketing_status: "Prescription" }], submissions: [{ submission_type: "ORIG", submission_status: "AP", submission_status_date: "20150702", submission_class_code_description: "Type 1 - New Molecular Entity" }] },
      { application_number: "NDA219209", sponsor_name: "VERTEX PHARMS INC", products: [{ brand_name: "JOURNAVX", active_ingredients: [{ name: "SUZETRIGINE" }], marketing_status: "Prescription" }], submissions: [{ submission_type: "ORIG", submission_status: "AP", submission_status_date: "20250130" }] },
    ] },
  };
  const r = await drugPipeline(session(extra), { sponsor: "Vertex Pharmaceuticals", months: 12 });
  assert.equal(r.active_trials, 3);
  assert.deepEqual(r.by_phase.map((x) => x[0]), ["Phase 3", "Phase 2", "Phase 1"]);
  assert.deepEqual(r.readouts.rows.map((x) => x[0]), ["NCT2", "NCT1"], "completions within 12 months, soonest first; 2029 is outside");
  assert.equal(r.readouts.rows[0][5], "VX-121", "placebo is not an intervention to report");
  assert.deepEqual(r.late_stage.rows.map((x) => x[0]), ["NCT1", "NCT3"]);
  assert.deepEqual(r.fda_approvals.rows.map((x) => [x[1], x[4]]), [["JOURNAVX", "2025-01-30"], ["ORKAMBI", "2015-07-02"]]);
});

test("comment letters: topics by their words, the body from the salutation, reviews by gaps", () => {
  assert.deepEqual(topicsOf("Please revise your non-GAAP measures and explain your segment reporting under ASC 280."), ["non-GAAP measures", "segments"]);
  assert.equal(letterExcerpt("UNITED STATES SEC Washington   Dear Mr. Cook: We have reviewed your filing.", 200), "Dear Mr. Cook: We have reviewed your filing.");
  const th = threads([{ filingDate: "2024-03-06", form: "UPLOAD" }, { filingDate: "2024-04-05", form: "CORRESP" }, { filingDate: "2024-05-16", form: "UPLOAD" }, { filingDate: "2021-04-15", form: "UPLOAD" }]);
  assert.deepEqual(th.map((t) => [t.start, t.end, t.letters.length]), [["2024-03-06", "2024-05-16", 3], ["2021-04-15", "2021-04-15", 1]]);
});

test("reverse DCF: the implied growth reproduces the value it was solved for", () => {
  assert.ok(Math.abs(dcfMultiple(0, 0.1, 0, 1) - 10) < 1e-9, "no growth, 10% rate: a perpetuity of 10x");
  const target = 100 * dcfMultiple(0.12, 0.09, 0.025, 10);
  assert.ok(Math.abs(impliedGrowth(target, 100, 0.09, 0.025, 10).growth - 0.12) < 1e-9);
  assert.equal(impliedGrowth(1000, -5, 0.09, 0.025, 10), null, "no growth rate reaches a value from negative cash flow");
  assert.deepEqual(impliedGrowth(1e15, 1, 0.09, 0.025, 10), { growth: null, above: 1.5 });
});

test("annual series come from the tag a company reports most recently", () => {
  const y = (end, val) => ({ start: `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`, end, val, form: "10-K", filed: `${end.slice(0, 4)}-11-01` });
  const facts = { Revenues: { units: { USD: [y("2018-09-29", 265)] } }, RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [y("2024-09-28", 391), y("2025-09-27", 416)] } } };
  const s = annualSeries(facts, "revenue");
  assert.equal(s.tag, "RevenueFromContractWithCustomerExcludingAssessedTax");
  assert.deepEqual([...s.values.values()], [391, 416]);
});

test("bank_financials: the bank whose name holds the words, ratios computed, failures dated", async () => {
  const { bankFinancials, bankWords, isoDate, pickBank } = await import("../src/banks.mjs");
  assert.equal(bankWords("VALLEY NATIONAL BANCORP"), "VALLEY NATIONAL");
  assert.equal(bankWords("ZIONS BANCORPORATION, N.A. /UT/"), "ZIONS");
  assert.equal(isoDate("7/17/2026"), "2026-07-17");
  const fuzzy = [{ NAME: "Fifth Third Bank, National Association", NAMEHCR: "FIFTH THIRD BCORP", ASSET: 299e6, CERT: 6672 }, { NAME: "Valley National Bank", NAMEHCR: "VALLEY NATIONAL BCORP", ASSET: 66e6, CERT: 9396 }];
  assert.equal(pickBank(fuzzy, "VALLEY NATIONAL").CERT, 9396, "the larger bank the search ranked first does not hold the words");
  assert.equal(pickBank([{ NAME: "First-Citizens Bank & Trust Company", ASSET: 1 }], "FIRST CITIZENS").NAME, "First-Citizens Bank & Trust Company");
  const API = "https://api.fdic.gov/banks";
  const inst = `${API}/institutions?${new URLSearchParams({ filters: "CERT:57512", fields: "NAME,CERT,NAMEHCR,CITY,STALP,ASSET,ACTIVE", limit: "1" })}`;
  const fin = `${API}/financials?${new URLSearchParams({ filters: "CERT:57512", fields: "REPDTE,ASSET,DEP,DEPUNA,LNLSNET,NCLNLS,EQTOT,NETINC,ROA,ROE,NIMY,RBC1AAJ,RBCRWAJ,IDT1CER", sort_by: "REPDTE", sort_order: "DESC", limit: "1" })}`;
  const extra = {
    [inst]: { data: [{ data: { NAME: "Western Alliance Bank", CERT: 57512, NAMEHCR: "WESTERN ALLIANCE BCORP", CITY: "Phoenix", STALP: "AZ" } }] },
    [fin]: { data: [{ data: { REPDTE: "20260630", ASSET: 98568765, DEP: 82322362, DEPUNA: 31358475, LNLSNET: 65087517, NCLNLS: 1849780, EQTOT: 8225700, NETINC: 561931, ROA: 1.1623, ROE: 14.37, NIMY: 3.5176, RBC1AAJ: 8.0796, RBCRWAJ: 13.4506, IDT1CER: 11.5823 } }] },
  };
  const r = await bankFinancials(session(extra), { cert: 57512, quarters: 1 });
  const q = Object.fromEntries(r.columns.map((c, i) => [c, r.rows[0][i]]));
  assert.equal(q.quarter_end, "2026-06-30");
  assert.equal(q.uninsured_pct, 38.09); assert.equal(q.noncurrent_loans_pct, 2.84); assert.equal(q.tier1_leverage_pct, 8.08);
  assert.equal(r.bank.place, "Phoenix, AZ");
});

test("filing_drift: change from the prior year, theme counts and the flags they raise", async () => {
  const { cosine, driftFlags, driftMetrics } = await import("../src/drift.mjs");
  assert.equal(cosine(new Map([["a", 1]]), new Map([["a", 2]])), 1);
  const base = "We may face risks from our supply chain. Our suppliers could fail to deliver parts on time. Demand may decline in any year.";
  const texts = [`${base} Tariffs on imports may raise our costs. New tariffs could reduce our margins. Retaliatory tariffs may follow.`, `${base} Tariffs on imports may raise our costs.`, base];
  const m = driftMetrics(texts, "tariff");
  assert.equal(m[2].change, null, "the oldest has nothing before it");
  assert.ok(m[0].change > 0 && m[1].change > 0);
  assert.deepEqual(m.map((x) => x.theme_sentences), [3, 1, 0]);
  const flags = driftFlags(["2026", "2025", "2024"], m, "tariff");
  assert.ok(flags.some((f) => /"tariff" took up more of the section/.test(f)), flags.join(" | "));
});

test("a 10-K whose item heading is a cross-reference index is read from its titled pages", async () => {
  const { crossReferenced } = await import("../src/html.mjs");
  const lines = ["Table of contents", "Risk Factors", ...Array(80).fill("x"), "Risk Factors", "first page", "Risk Factors", "second page", "more", "Properties", "y", ...Array(10).fill("z"), "Item 1A. | Risk Factors", "Pages 37-51"];
  const s = { line: lines.length - 2, end: lines.length, title: "| Risk Factors" };
  assert.deepEqual(crossReferenced(lines, s, [s, { title: "Properties" }]), { line: 82, end: 86 }, "the run of page titles and one page gap after the last; the contents line is passed over");
  assert.equal(crossReferenced(["Item 1A. Risk Factors", "Our business faces many risks ".repeat(40)], { line: 0, end: 2, title: "Risk Factors" }, []), null, "a real section is left alone");
});

test("Form 144: the seller, the shares and value summed over lots, dates as ISO", async () => {
  const { parse144 } = await import("../src/planned.mjs");
  const xml = `<edgarSubmission><formData><issuerInfo><nameOfPersonForWhoseAccountTheSecuritiesAreToBeSold>Colette Kress</nameOfPersonForWhoseAccountTheSecuritiesAreToBeSold><relationshipsToIssuer><relationshipToIssuer>Officer</relationshipToIssuer></relationshipsToIssuer></issuerInfo>
    <securitiesInformation><brokerOrMarketmakerDetails><name>Morgan Stanley</name></brokerOrMarketmakerDetails><noOfUnitsSold>30000</noOfUnitsSold><aggregateMarketValue>6000000</aggregateMarketValue><noOfUnitsOutstanding>24300000000</noOfUnitsOutstanding><approxSaleDate>09/17/2026</approxSaleDate></securitiesInformation>
    <securitiesInformation><noOfUnitsSold>4918</noOfUnitsSold><aggregateMarketValue>1658914.12</aggregateMarketValue></securitiesInformation>
    <securitiesToBeSold><natureOfAcquisitionTransaction>Restricted Stock Units</natureOfAcquisitionTransaction></securitiesToBeSold></formData></edgarSubmission>`;
  const p = parse144(xml);
  assert.equal(p.seller, "Colette Kress"); assert.equal(p.relationship, "Officer");
  assert.equal(p.shares, 34918); assert.equal(p.market_value, 7658914.12);
  assert.equal(p.approx_sale_date, "2026-09-17"); assert.equal(p.acquired, "Restricted Stock Units");
});

test("ipo_pipeline: filers parsed and labelled, and a cover's price is never its par value", async () => {
  const { coverTerms, kindOf, parseFiler } = await import("../src/ipos.mjs");
  const f = parseFiler("Sunshine Biopharma Inc.  (SBFM, SBFMW)  (CIK 0001402328)");
  assert.deepEqual(f, { name: "Sunshine Biopharma Inc.", tickers: ["SBFM", "SBFMW"], cik: 1402328 });
  assert.equal(kindOf(f, ["2834"]), "listed");
  assert.equal(kindOf(parseFiler("WINDWARD BIO GROUP AG  (CIK 0002101234)"), ["2836"]), "ipo");
  assert.equal(kindOf(parseFiler("TCGX Acquisition Corp. II  (CIK 0002100001)"), []), "spac");
  assert.equal(kindOf(parseFiler("Canary Staked INJ ETF  (CIK 0002100002)"), ["6199"]), "fund");
  assert.equal(kindOf(f, ["2834"], { priced: true }), "company", "a priced deal's ticker tells nothing");
  const t = coverTerms("Lycia Therapeutics, Inc. 17,640,000 Shares Common Stock, par value $0.0001 per share. This is the initial public offering. The initial public offering price is $18.00 per share.");
  assert.deepEqual(t, { price: 18, shares: 17640000, gross: 317520000 });
});
