// filing_check on Apple's 10-Q for the quarter to 27 June 2026 and Microsoft's FY2026 10-K, replayed from
// what SEC serves (scripts/capture-filing-check-fixtures.mjs), and each check's rules on small documents
// whose figures are known: for each, a case it must flag and cases it must not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { checkInput, companyFactsCheck, displayedNumber, duplicateCheck, filingCheck, groupFacts, inputFiles, readDocument, readUnitPhrase, scaleCheck, scaled, sumCheck, unitStatement, valueOf } from "../src/filing-check.mjs";
import { OUTPUT_SCHEMAS } from "../src/server.mjs";
import { htmlToText } from "../src/html.mjs";
import { createSession, getText } from "../src/sources.mjs";
import { parseCalculations } from "../src/trace.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const DIR = new URL("./fixtures/", import.meta.url);
const MANIFEST = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
const gunzip = (file) => gunzipSync(readFileSync(new URL(file, DIR))).toString("utf8");
// The manifest's Apple company facts are cut to other tools' tags, so these tests serve their own cuts.
const FACTS = {
  "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json": gunzip("filing-check/CIK0000320193.json.gz"),
  "https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json": gunzip("filing-check/CIK0000789019.json.gz"),
};
const session = (extra = {}) => createSession({ fetchImpl: replayFetch({ ...FACTS, ...extra }).fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });
const row = (findings, i = 0) => Object.fromEntries(findings.columns.map((c, k) => [c, findings.rows[i][k]]));

// ---------------------------------------------------------------------------------------------
// A small inline XBRL document with known figures
// ---------------------------------------------------------------------------------------------

const ctx = (id, period, dims = "") => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000000001</xbrli:identifier>${dims ? `<xbrli:segment>${dims}</xbrli:segment>` : ""}</xbrli:entity><xbrli:period>${period}</xbrli:period></xbrli:context>`;
const FY = "<xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate>";
const RESOURCES = `${ctx("fy", FY)}${ctx("end", "<xbrli:instant>2025-12-31</xbrli:instant>")}${ctx("day", "<xbrli:startDate>2025-06-30</xbrli:startDate><xbrli:endDate>2025-06-30</xbrli:endDate>")}${ctx("seg", FY, '<xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">ex:WidgetsMember</xbrldi:explicitMember>')}
<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit><xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit><xbrli:unit id="pure"><xbrli:measure>xbrli:pure</xbrli:measure></xbrli:unit>
<xbrli:unit id="usdPerShare"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>`;
const fact = (id, name, context, unit, text, { scale = 6, decimals = -6, sign = "", format = "ixt:num-dot-decimal" } = {}) => `<ix:nonFraction id="${id}" name="${name}" contextRef="${context}" unitRef="${unit}" decimals="${decimals}" scale="${scale}"${sign ? ` sign="${sign}"` : ""}${format ? ` format="${format}"` : ""}>${text}</ix:nonFraction>`;
const cells = (label, ...values) => `<tr><td colspan="3">${label}</td>${values.map((v) => `<td>$</td><td>${v}</td><td></td>`).join("")}</tr>`;
const page = (body, hidden = "") => `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Example 10-K</title><style>td { padding: 0 }</style></head><body><div style="display:none"><ix:header><ix:hidden>${hidden}</ix:hidden><ix:resources>${RESOURCES}</ix:resources></ix:header></div>${body}</body></html>`;

const STATEMENT = `<div>CONSOLIDATED STATEMENTS OF OPERATIONS</div><div>(In millions, except number of shares, which are reflected in thousands, and per-share amounts)</div>
<table><tr><td colspan="3"></td><td colspan="3">2025</td></tr>
${cells("Net sales", fact("rev", "us-gaap:Revenues", "fy", "usd", "1,000"))}
${cells("Cost of sales", fact("cost", "us-gaap:CostOfRevenue", "fy", "usd", "600", { scale: 3 }))}
${cells("Gross margin", fact("gm", "us-gaap:GrossProfit", "fy", "usd", "400"))}
${cells("Other income", fact("other", "us-gaap:OtherNonoperatingIncomeExpense", "fy", "usd", "—", { format: "ixt:fixed-zero", scale: 3 }))}
${cells("Shares used in computing earnings per share", fact("wso", "us-gaap:WeightedAverageNumberOfSharesOutstandingBasic", "fy", "shares", "15,000", { scale: 3, decimals: -3 }))}
${cells("Shares outstanding", fact("so", "us-gaap:CommonStockSharesOutstanding", "end", "shares", "14,900", { scale: 0, decimals: 0 }))}
${cells("Basic earnings per share", fact("eps", "us-gaap:EarningsPerShareBasic", "fy", "usdPerShare", "6.11", { scale: 0, decimals: 2 }))}
${cells("Diluted earnings per share", fact("epsd", "us-gaap:EarningsPerShareDiluted", "fy", "usdPerShare", "6.08", { scale: 6, decimals: 2 }))}
${cells("Gross margin percentage", `${fact("gmp", "us-gaap:GrossMarginPercent", "fy", "pure", "40", { scale: -2, decimals: 2 })}</td><td>%`)}
${cells("Tax rate", `${fact("tax", "us-gaap:EffectiveIncomeTaxRateContinuingOperations", "fy", "pure", "21", { scale: 0, decimals: 2 })}</td><td>%`)}
${cells("Employees (in thousands)", fact("staff", "ex:CostPerEmployee", "fy", "usd", "75", { scale: 3, decimals: -3 }))}
<tr><td colspan="3">Shares repurchased (in thousands):</td></tr>
${cells("Repurchased", fact("rep", "us-gaap:StockRepurchasedDuringPeriodShares", "fy", "shares", "120", { scale: 3, decimals: -3 }))}
</table>`;
const COLUMNS = `<div>The following table summarizes RSU activity:</div>
<table><tr><td colspan="3"></td><td colspan="3">Number of RSUs (in thousands)</td><td colspan="3">Fair value (in millions)</td></tr>
${cells("Granted", fact("rsu", "us-gaap:ShareBasedCompensationArrangementByShareBasedPaymentAwardEquityInstrumentsOtherThanOptionsGrantsInPeriod", "fy", "shares", "80", { scale: 3, decimals: -3 }), fact("rsuv", "us-gaap:ShareBasedCompensationArrangementByShareBasedPaymentAwardEquityInstrumentsOtherThanOptionsGrantsInPeriodTotalFairValue", "fy", "usd", "21", { scale: 6 }))}
</table>`;
const UNSTATED = `<div>Lease costs were as follows:</div><table>${cells("Lease cost", fact("lease", "us-gaap:LeaseCost", "fy", "usd", "2,100", { scale: 3, decimals: -3 }))}</table>`;
const SHARE_DATA = `<div>(in millions, except share data)</div><table>${cells("Treasury shares", fact("treas", "us-gaap:TreasuryStockCommonShares", "end", "shares", "1,234,567", { scale: 0, decimals: 0 }))}</table>`;
const TEXT = `<div>Item 9B. Other Information</div>
<p>The plan permits the sale of up to ${fact("plan", "ecd:TrdArrSecuritiesAggAvailAmt", "fy", "shares", "48,700", { scale: 6 })} shares of our common stock.</p>
<p>Deferred revenue was $${fact("def", "us-gaap:ContractWithCustomerLiability", "end", "usd", "3.8", { scale: 9, decimals: -8 })} billion and $${fact("def2", "us-gaap:ContractWithCustomerLiabilityCurrent", "end", "usd", "1.2", { scale: 6, decimals: -5 })} billion.</p>
<p>Remaining obligations were approximately $${fact("rpo", "us-gaap:RevenueRemainingPerformanceObligation", "end", "usd", "1,375.1", { scale: 6, decimals: -5 })} at December 31, 2025.</p>
<p>Amortization was $${fact("am1", "us-gaap:AmortizationOfIntangibleAssets", "fy", "usd", "4.9", { scale: 9, decimals: -8 })}, $${fact("am2", "us-gaap:CapitalizedComputerSoftwareAmortization1", "fy", "usd", "3.7", { scale: 6, decimals: -5 })} and $${fact("am3", "us-gaap:AmortizationOfDebtDiscountPremium", "fy", "usd", "3.6", { scale: 9, decimals: -8 })} billion.</p>
<p>Dividends were $${fact("div", "us-gaap:CommonStockDividendsPerShareDeclared", "fy", "usdPerShare", "1.04", { scale: 0, decimals: 2 })} per share.</p>`;
const HIDDEN = fact("hid", "us-gaap:Revenues", "seg", "usd", "300", { scale: 3 });
const SAMPLE = page(`${STATEMENT}${COLUMNS}${UNSTATED}${SHARE_DATA}${TEXT}`, HIDDEN);

test("the reader: displayed numbers, scales, signs, nil facts, nested tags and cells placed in the table's grid", () => {
  assert.equal(displayedNumber("1,234.5", "ixt:num-dot-decimal"), "1234.5");
  assert.equal(displayedNumber("1.234,5", "ixt:num-comma-decimal"), "1234.5");
  assert.equal(displayedNumber("—", "ixt:fixed-zero"), "0");
  assert.equal(displayedNumber("twenty-five", "ixt-sec:numwordsen"), "25");
  assert.equal(displayedNumber("No", "ixt-sec:numwordsen"), "0");
  assert.equal(displayedNumber("321", null), "321");
  assert.equal(displayedNumber("1,234", null), null, "without a format the text must be a plain decimal");
  assert.equal(displayedNumber("12/31/2025", "ixt:date-monthdayyear"), null, "an unknown transform is not guessed");
  assert.deepEqual([scaled("0.00001", 0), scaled("0.1", 9), scaled("0.6", -2), scaled("1375.1", 6), scaled(".5", 0)], [0.00001, 100000000, 0.006, 1375100000, 0.5]);
  const doc = readDocument(page(`<table><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table><p>Up to ${fact("o", "ex:Outer", "fy", "usd", fact("i", "ex:Inner", "end", "usd", "2,500", { scale: 3 }), { scale: 6, sign: "-" })} million.</p><p><ix:nonFraction id="n" name="ex:Nil" contextRef="fy" unitRef="usd" xs:nil="true"></ix:nonFraction></p>`));
  assert.equal(doc.tables[0].rows[1].cells[0].col, 1, "the cell under a cell two rows high sits in the next column");
  const [o, i, n] = ["o", "i", "n"].map((id) => doc.facts.find((f) => f.id === id));
  assert.deepEqual([valueOf(o), valueOf(i), o.text, i.text, o.after.trim()], [-2500000000, 2500000, "2,500", "2,500", "million."], "each tag on a figure is read with its own scale and sign");
  assert.equal(valueOf(n), null, "a nil fact has no value, whatever prefix its nil attribute has");
  assert.deepEqual([doc.units.get("usdPerShare"), doc.kinds.get("usdPerShare"), doc.kinds.get("usd"), doc.kinds.get("pure")], ["USD/shares", "per_share", "money", "pure"]);
  assert.ok(!doc.blocks.some((b) => /td \{/.test(b.text)), "a style sheet is not text");
});

test("statements of units: money and share counts, with their exceptions", () => {
  const read = (t) => { const u = unitStatement(t); return u && [u.money, u.shares]; };
  assert.deepEqual(read("(In millions, except number of shares, which are reflected in thousands, and per-share amounts)"), [6, 3]);
  assert.deepEqual(read("The following table shows the computation of earnings per share (net income in millions and shares in thousands):"), [6, 3]);
  assert.deepEqual(read("(In millions, except per share amounts)"), [6, 6]);
  assert.deepEqual(read("(in millions, except share data)"), [6, null], "share counts excepted with no scale of their own");
  assert.deepEqual(read("(Dollars in millions)"), [6, undefined]);
  assert.deepEqual(read("$ in millions"), [6, undefined]);
  assert.deepEqual(read("(Shares in millions)"), [undefined, 6]);
  assert.deepEqual(read("(in thousands of U.S. dollars)"), [3, undefined]);
  assert.deepEqual(read("(in billions, except ratios and where otherwise noted)"), [9, 9]);
  assert.equal(unitStatement("(Square feet in millions)"), null, "a scale stated for something else");
  assert.equal(unitStatement("The Company had $5.0 billion in cash."), null);
  assert.equal(readUnitPhrase("per share"), null);
});

test("scale: figures tagged at another scale than the one stated for them are flagged, and only those", () => {
  const doc = readDocument(SAMPLE);
  const r = scaleCheck(doc);
  assert.deepEqual(r.findings.map((x) => [x.fact.id, x.fact.scale, x.expected, x.stated.where]).sort(), [
    ["cost", 3, 6, "the line above the table"],
    ["def2", 6, 9, "the words after the figure"],
    ["epsd", 6, 0, "its unit (an amount per share)"],
    ["plan", 6, 0, "the words after the figure"],
    ["so", 0, 3, "the line above the table"],
    ["tax", 0, -2, "the sign after the figure"],
  ]);
  // Not flagged: figures at the stated scale (rev, gm, wso, eps, gmp, def, am3, div), the row's own unit
  // (staff, in thousands), a heading row in the table (rep), each column's own heading (rsu, rsuv).
  // Not compared: a zero (other), a hidden fact, a table that states no unit (lease: the sentence above
  // it introduces a table of its own, so the unit of the tables before does not carry over), share
  // counts a table excepts with no scale (treas), money in a sentence with no scale word after it
  // (rpo), and figures in a list whose scale is written once at its end (am1, am2).
  assert.deepEqual(r.counts, { compared: 18, money: 8, shares: 5, per_share: 3, percent: 2, not_compared_no_stated_unit: 1, not_compared_unclear: 1 });
});

test("duplicates: one fact tagged twice is flagged when the values differ beyond their rounding, not within it", () => {
  const doc = readDocument(page(`<p>${fact("a", "us-gaap:Revenues", "fy", "usd", "1,234")} ${fact("b", "us-gaap:Revenues", "fy", "usd", "1,235")} ${fact("c", "us-gaap:CostOfRevenue", "fy", "usd", "617")} ${fact("d", "us-gaap:CostOfRevenue", "fy", "usd", "617.4", { decimals: -5 })} ${fact("e", "us-gaap:GrossProfit", "fy", "usd", "617")} ${fact("f", "us-gaap:GrossProfit", "seg", "usd", "600")}</p>`));
  const r = duplicateCheck(groupFacts(doc));
  assert.deepEqual(r.counts, { facts_tagged_more_than_once: 2, tags_on_them: 4 });
  assert.deepEqual(r.findings.map((x) => [x.fact.id, x.value, x.other.id, x.other_value]), [["a", 1234000000, "b", 1235000000]]);
});

const CAL = `<link:linkbase><link:calculationLink xlink:role="http://example.com/role/Operations" xlink:type="extended">
<link:loc xlink:href="ex.xsd#us-gaap_GrossProfit" xlink:label="gp"/><link:loc xlink:href="ex.xsd#us-gaap_Revenues" xlink:label="r"/><link:loc xlink:href="ex.xsd#us-gaap_CostOfRevenue" xlink:label="c"/>
<link:calculationArc xlink:from="gp" xlink:to="r" weight="1.0" order="1"/><link:calculationArc xlink:from="gp" xlink:to="c" weight="-1.0" order="2"/>
</link:calculationLink><link:calculationLink xlink:role="http://example.com/role/Purchase" xlink:type="extended">
<link:loc xlink:href="ex.xsd#us-gaap_BusinessCombinationConsiderationTransferred1" xlink:label="t"/><link:loc xlink:href="ex.xsd#us-gaap_PaymentsToAcquireBusinessesGross" xlink:label="p"/><link:loc xlink:href="ex.xsd#us-gaap_BusinessCombinationContingentConsiderationLiability" xlink:label="l"/>
<link:calculationArc xlink:from="t" xlink:to="p" weight="1" order="1"/><link:calculationArc xlink:from="t" xlink:to="l" weight="1" order="2"/>
</link:calculationLink></link:linkbase>`;

test("sums: a total its lines do not add up to is flagged; rounding, a missing line and a precise duplicate are not", () => {
  const links = parseCalculations(CAL);
  const check = (body) => sumCheck(groupFacts(readDocument(page(body))), links);
  const adds = check(`<p>${fact("r", "us-gaap:Revenues", "fy", "usd", "1,000.4", { decimals: -5 })} ${fact("c", "us-gaap:CostOfRevenue", "fy", "usd", "600.3", { decimals: -5 })} ${fact("g", "us-gaap:GrossProfit", "fy", "usd", "400")}</p>`);
  assert.deepEqual(adds.counts, { checked: 1, adding_up: 1, incomplete: 0, not_adding_up: 0, not_checked_duplicates_differ: 0 }, "400.1 against 400, within the rounding of three figures");
  const off = check(`<p>${fact("r", "us-gaap:Revenues", "fy", "usd", "1,000")} ${fact("c", "us-gaap:CostOfRevenue", "fy", "usd", "600")} ${fact("g", "us-gaap:GrossProfit", "fy", "usd", "410")}</p>`);
  assert.equal(off.counts.not_adding_up, 1);
  assert.deepEqual([off.findings[0].fact.id, off.findings[0].sum, off.findings[0].difference, off.findings[0].lines.map((l) => [l.concept, l.weight, l.value])], ["g", 400000000, -10000000, [["us-gaap:Revenues", 1, 1000000000], ["us-gaap:CostOfRevenue", -1, 600000000]]]);
  const missing = check(`<p>${fact("r", "us-gaap:Revenues", "fy", "usd", "1,000")} ${fact("g", "us-gaap:GrossProfit", "fy", "usd", "400")} ${fact("c", "us-gaap:CostOfRevenue", "seg", "usd", "600")}</p>`);
  assert.deepEqual(missing.counts, { checked: 1, adding_up: 0, incomplete: 1, not_adding_up: 0, not_checked_duplicates_differ: 0 }, "cost of revenue is filed only by segment");
  const differ = check(`<p>${fact("r", "us-gaap:Revenues", "fy", "usd", "1,000")} ${fact("r2", "us-gaap:Revenues", "fy", "usd", "1,100")} ${fact("c", "us-gaap:CostOfRevenue", "fy", "usd", "600")} ${fact("g", "us-gaap:GrossProfit", "fy", "usd", "400")}</p>`);
  assert.equal(differ.counts.not_checked_duplicates_differ, 1);
  // The text's "$339 million" and the table's 338,745 thousand are one fact; the sum uses the table's.
  const precise = check(`<p>${fact("p1", "us-gaap:PaymentsToAcquireBusinessesGross", "day", "usd", "339")} million</p><table>${cells("Cash paid", fact("p2", "us-gaap:PaymentsToAcquireBusinessesGross", "day", "usd", "338,745", { scale: 3, decimals: -3 }))}${cells("Contingent consideration", fact("l", "us-gaap:BusinessCombinationContingentConsiderationLiability", "day", "usd", "11,387", { scale: 3, decimals: -3 }))}${cells("Total", fact("t", "us-gaap:BusinessCombinationConsiderationTransferred1", "day", "usd", "350,132", { scale: 3, decimals: -3 }))}</table>`);
  assert.deepEqual(precise.counts, { checked: 1, adding_up: 1, incomplete: 0, not_adding_up: 0, not_checked_duplicates_differ: 0 });
});

test("company facts: another value or none for the filing's accession is flagged; the same value, a one-day period and dimensional facts are not", () => {
  const groups = groupFacts(readDocument(page(`<p>${fact("r", "us-gaap:Revenues", "fy", "usd", "1,000")} ${fact("c", "us-gaap:CostOfRevenue", "fy", "usd", "600")} ${fact("g", "us-gaap:GrossProfit", "fy", "usd", "400")} ${fact("p", "us-gaap:PaymentsToAcquireBusinessesGross", "day", "usd", "339")} ${fact("s", "us-gaap:Revenues", "seg", "usd", "300")} ${fact("x", "ex:Widgets", "fy", "usd", "9")}</p>`)));
  const accn = "0000000001-26-000001", row1 = (val, more = {}) => ({ start: "2025-01-01", end: "2025-12-31", val, accn, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01", ...more });
  const cf = { facts: { "us-gaap": {
    Revenues: { units: { USD: [row1(1000000000), row1(900000000, { accn: "0000000001-25-000001" })] } },
    CostOfRevenue: { units: { USD: [row1(610000000)] } },
    PaymentsToAcquireBusinessesGross: { units: { USD: [{ end: "2025-06-30", val: 339000000, accn, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" }] } },
  } } };
  const r = companyFactsCheck(groups, cf, accn);
  assert.deepEqual(r.counts, { compared: 4, same: 2, different: 1, missing: 1, rows_for_this_filing: 3 });
  assert.deepEqual(r.findings.map((x) => [x.kind, x.fact.id, x.value, x.company_facts ?? null]), [["company_facts_value", "c", 600000000, [610000000]], ["company_facts_missing", "g", 400000000, null]]);
  assert.equal(companyFactsCheck(groups, cf, "0000000001-26-000099").unavailable, true, "company facts that hold nothing from the filing yet are not read as all missing");
});

test("SEC's FilingSummary names the inline documents and the calculation", () => {
  assert.deepEqual(inputFiles(`<FilingSummary><InputFiles><File doctype="10-K" original="a.htm">a.htm</File><File doctype="EX-13">ex13.htm</File><File>a.xsd</File><File>a_cal.xml</File></InputFiles></FilingSummary>`), { documents: ["a.htm", "ex13.htm"], calculation: "a_cal.xml", schema: "a.xsd" });
  assert.deepEqual(inputFiles("<InputFiles><File doctype=\"10-K\">m.htm</File><File>m.xsd</File></InputFiles>"), { documents: ["m.htm"], calculation: null, schema: "m.xsd" });
  assert.equal(inputFiles("<html/>"), null);
});

// ---------------------------------------------------------------------------------------------
// Real filings
// ---------------------------------------------------------------------------------------------

test("the reader takes every value of Apple's 10-Q from the document exactly as SEC's own extraction of its XBRL holds it", () => {
  const doc = readDocument(gunzip(MANIFEST["https://www.sec.gov/Archives/edgar/data/320193/000032019326000020/aapl-20260627.htm"]));
  const instance = gunzip("filing-check/aapl-20260627_htm.xml.gz");
  const held = new Map();
  for (const m of instance.matchAll(/<([\w-]+:[\w-]+)\b([^>]*?\bunitRef="[^"]*"[^>]*?)(?:\/>|>([^<]*)<\/\1>)/g)) {
    const key = `${m[1]}|${m[2].match(/contextRef="([^"]*)"/)[1]}|${m[2].match(/unitRef="([^"]*)"/)[1]}`;
    (held.get(key) ?? held.set(key, []).get(key)).push(m[3] === undefined || /nil="true"/.test(m[2]) ? null : Number(m[3]));
  }
  assert.equal(doc.facts.length, 762);
  for (const f of doc.facts) assert.ok((held.get(`${f.name}|${f.contextRef}|${f.unitRef}`) ?? []).includes(valueOf(f)), `${f.id} ${f.name}: ${valueOf(f)}`);
});

test("Apple's 10-Q for the quarter to 27 June 2026: every check runs, and nothing disagrees", async () => {
  const r = await filingCheck(session(), { company: "AAPL", form: "10-Q" });
  assert.deepEqual(r.company, { cik: 320193, name: "Apple Inc.", ticker: "AAPL" });
  assert.equal(r.results.length, 1);
  const [x] = r.results;
  assert.deepEqual(x.filing, { accession: "0000320193-26-000020", form: "10-Q", filed: "2026-07-31", period: "2026-06-27", document: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000020/aapl-20260627.htm", index: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000020/0000320193-26-000020-index.htm" });
  assert.deepEqual([x.checked.facts_read, x.checked.facts_hidden, x.checked.tables_with_facts], [762, 0, 19]);
  assert.deepEqual(x.checked.scale, { compared: 715, money: 635, shares: 35, per_share: 27, percent: 18, not_compared_no_stated_unit: 0, not_compared_unclear: 0 });
  assert.deepEqual(x.checked.duplicates, { facts_tagged_more_than_once: 65, tags_on_them: 141 });
  assert.deepEqual(x.checked.sums, { checked: 155, adding_up: 155, incomplete: 0, not_adding_up: 0, not_checked_duplicates_differ: 0, calculation: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000020/aapl-20260627_cal.xml" });
  assert.deepEqual(x.checked.company_facts, { compared: 283, same: 283, different: 0, missing: 0, rows_for_this_filing: 283 });
  assert.equal(x.findings.total, 0);
  assert.match(x.plain_reading, /^Read 762 tagged figures in the document: 715 had their scale set against .* No disagreement found\.$/);
  assert.ok(OUTPUT_SCHEMAS.filing_check.safeParse(r).success);
  assert.ok(r.limits.some((l) => l.startsWith("No finding means")));
});

test("a session that has read the 10-Q's text first (read_filing caches it, tags stripped, under its URL) still reads its tags", async () => {
  const s = session();
  const url = "https://www.sec.gov/Archives/edgar/data/320193/000032019326000020/aapl-20260627.htm";
  await getText(s, url, { maxBytes: 24 * 1024 * 1024, transform: htmlToText });
  const r = await filingCheck(s, { company: "AAPL", form: "10-Q" });
  assert.equal(r.results[0].checked.facts_read, 762);
});

test("Microsoft's FY2026 10-K: 48,700 shares tagged as 48.7 billion, and a par value company facts hold rounded", async () => {
  const r = await filingCheck(session(), { company: "MSFT", accession: "0001193125-26-323660" });
  const [x] = r.results;
  assert.deepEqual([x.checked.facts_read, x.checked.scale.compared, x.checked.duplicates.facts_tagged_more_than_once, x.checked.sums.checked, x.checked.sums.not_adding_up, x.checked.company_facts.compared], [1583, 1484, 98, 186, 0, 601]);
  assert.equal(x.checked.sums.calculation, "https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.xsd", "its calculation links sit in its schema");
  assert.deepEqual(x.findings.by_kind, { scale: 1, company_facts_value: 1 });
  const scale = row(x.findings, 0);
  assert.deepEqual({ ...scale, compared_with: undefined, reading: undefined }, {
    kind: "scale", concept: "ecd:TrdArrSecuritiesAggAvailAmt", period: "2026-06-30", unit: "shares", dimensions: "IndividualAxis=AmyEHoodMember", displayed: "48,700 shares", value: 48700000000,
    compared_with: undefined, where: "Insider Trading Arrangements", url: "https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm#F_146e6ee5-d08d-4fba-a636-95f9ec2bc088", reading: undefined,
  });
  assert.deepEqual(scale.compared_with, { stated: "48,700 shares", stated_in: "the words after the figure", scale_stated: 0, scale_tagged: 6, a_person_reads: 48700 });
  assert.equal(scale.reading, "Shown as 48,700 shares; tagged at scale 6, so a machine reads 48,700,000,000, 1,000,000 times the 48,700 a person reads.");
  // The 10-K's words.
  const words = gunzip(MANIFEST["https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm"]).replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  assert.match(words, /The trading plan is intended to permit Ms\. Hood to sell \(i\) up to 48,700 shares of our common stock/);
  assert.match(words, /Common stock, \$0\.00000625 par value per share/);
  const par = row(x.findings, 1);
  assert.deepEqual([par.kind, par.concept, par.value, par.compared_with], ["company_facts_value", "dei:EntityListingParValuePerShare", 0.00000625, { company_facts: 0.000006 }]);
  assert.match(par.reading, /rounded to six decimal places is what company facts hold/);
  assert.ok(OUTPUT_SCHEMAS.filing_check.safeParse(r).success);
});

// ---------------------------------------------------------------------------------------------
// Several filings, and the errors
// ---------------------------------------------------------------------------------------------

const BASE = "https://www.sec.gov/Archives/edgar/data/1";
const submissions = (rows) => JSON.stringify({ cik: "1", name: "Example Corp", tickers: ["EXMP"], filings: { recent: Object.fromEntries(["accessionNumber", "filingDate", "reportDate", "form", "primaryDocument", "isInlineXBRL"].map((k, i) => [k, rows.map((r) => r[i])])), files: [] } });
const EXAMPLE = {
  "https://data.sec.gov/submissions/CIK0000000001.json": submissions([
    ["0000000001-26-000002", "2026-05-01", "2026-03-31", "10-Q", "ex-20260331.htm", 1],
    ["0000000001-26-000001", "2026-02-01", "2025-12-31", "10-K", "ex-20251231.htm", 1],
    ["0000000001-19-000001", "2019-05-01", "2019-03-31", "10-Q", "ex-20190331.htm", 0],
    ["0000000001-26-000003", "2026-05-02", "2026-05-01", "8-K", "ex8k.htm", 0],
  ]),
  [`${BASE}/000000000126000002/FilingSummary.xml`]: "<FilingSummary><InputFiles><File doctype=\"10-Q\">ex-20260331.htm</File><File>ex.xsd</File><File>ex_cal.xml</File></InputFiles></FilingSummary>",
  [`${BASE}/000000000126000002/ex-20260331.htm`]: SAMPLE,
  [`${BASE}/000000000126000002/ex_cal.xml`]: CAL,
  [`${BASE}/000000000126000001/FilingSummary.xml`]: "<FilingSummary><InputFiles><File doctype=\"10-K\">ex-20251231.htm</File><File>ex.xsd</File></InputFiles></FilingSummary>",
  [`${BASE}/000000000126000001/ex-20251231.htm`]: "<html><body><p>A 10-K whose figures carry no tags.</p></body></html>",
  [`${BASE}/000000000126000001/ex.xsd`]: "<schema/>",
};

test("a filing in inline XBRL is read end to end; one that is not gets a plain error naming what to use instead", async () => {
  const r = await filingCheck(session(EXAMPLE), { company: "1", form: "10-Q" });
  const [x] = r.results;
  assert.deepEqual(x.findings.by_kind, { scale: 6, sum: 1 }, "the sample's six scale slips, and the gross margin its cost of sales, a thousandth of what it shows, no longer adds up to");
  const margin = row(x.findings, 6);
  assert.deepEqual([margin.kind, margin.concept, margin.value, margin.compared_with.lines_sum], ["sum", "us-gaap:GrossProfit", 400000000, 999400000]);
  assert.equal(margin.reading, "The filing's calculation gives 1,000,000,000 - 600,000 = 999,400,000; the total is tagged 400,000,000, 599,400,000 apart, more than the 1,500,000 their rounding allows.");
  assert.equal(x.checked.company_facts.not_compared, "SEC's company facts could not be read for this company.");
  const plan = x.findings.rows.map((_, i) => row(x.findings, i)).find((f) => f.concept === "ecd:TrdArrSecuritiesAggAvailAmt");
  assert.deepEqual([plan.where, plan.url], ["Item 9B. Other Information", `${BASE}/000000000126000002/ex-20260331.htm#plan`]);
  const cost = x.findings.rows.map((_, i) => row(x.findings, i)).find((f) => f.concept === "us-gaap:CostOfRevenue");
  assert.equal(cost.where, "CONSOLIDATED STATEMENTS OF OPERATIONS / Cost of sales");
  assert.equal(cost.reading, "Shown as 600, in millions by the line above the table; tagged at scale 3, so a machine reads 600,000, 1/1,000 of the 600,000,000 a person reads.");
  await assert.rejects(filingCheck(session(EXAMPLE), { company: "1", accession: "0000000001-19-000001" }), /Example Corp's 10-Q 0000000001-19-000001 \(filed 2019-05-01\) is not in inline XBRL: .* figure_trace checks its sums .* financial_statements gives its statements/);
  await assert.rejects(filingCheck(session(EXAMPLE), { company: "1" }), /10-K 0000000001-26-000001 .* is not in inline XBRL/, "a document with no tags in it, whatever the list of filings says");
  await assert.rejects(filingCheck(session(EXAMPLE), { company: "1", accession: "0000000001-26-000003" }), /is a 8-K; filing_check reads 10-Ks and 10-Qs/);
  await assert.rejects(filingCheck(session(EXAMPLE), { company: "1", accession: "0000000001-26-000099" }), /is not one of Example Corp's filings/);
});

test("several filings: each is checked, and one that cannot be read says why without stopping the rest", async () => {
  const rows = [["0000000001-26-000002", "2026-05-01", "2026-03-31", "10-Q", "ex-20260331.htm", 1], ["0000000001-19-000001", "2019-05-01", "2019-03-31", "10-Q", "ex-20190331.htm", 0]];
  const r = await filingCheck(session({ ...EXAMPLE, "https://data.sec.gov/submissions/CIK0000000001.json": submissions(rows) }), { company: "1", form: "10-Q", filings: 2 });
  assert.deepEqual(r.results.map((x) => [x.filing.accession, x.findings?.total ?? null]), [["0000000001-26-000002", 7], ["0000000001-19-000001", null]]);
  assert.match(r.results[1].error, /^Example Corp's 10-Q 0000000001-19-000001 \(filed 2019-05-01\) is not in inline XBRL/);
  const one = await filingCheck(session(EXAMPLE), { company: "1", accession: "0000000001-26-000002", filings: 3 });
  assert.equal(one.filings_note, "An accession names one filing, so filings was not used.");
  for (const bad of [{ company: "AAPL", filings: 0 }, { company: "AAPL", filings: 6 }, { company: "AAPL", filings: 1.5 }, { company: "AAPL", form: "8-K" }, { company: "AAPL", accession: "123" }, { company: "AAPL", year: 2025 }, { company: "" }]) assert.equal(checkInput.safeParse(bad).success, false, JSON.stringify(bad));
});
