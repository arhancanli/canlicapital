// Guidance parsing on sentences quoted from companies' own results releases (NVIDIA, Texas
// Instruments, Intel, Broadcom, Lululemon, Salesforce, Home Depot, Delta, Target, Walmart; 2026),
// and the comparison of a quarter's guidance with its results.
import assert from "node:assert/strict";
import test from "node:test";

import { compareGuidance, figuresIn, guidanceFromSentence, guidanceFromTable, guidanceFromText, measureOf, periodOf, quarterOf, resultsFromText, unglue } from "../src/guidance.mjs";

const brief = (items) => items.map((x) => [x.measure ?? x.label, x.low, x.high, x.unit]);

test("ranges as companies write them", () => {
  assert.deepEqual(brief(guidanceFromSentence("TI's third quarter outlook is for revenue in the range of $5.65 billion to $6.15 billion and earnings per share between $2.23 and $2.57.")), [["revenue", 5.65, 6.15, "USD billion"], ["eps", 2.23, 2.57, "USD per share"]]);
  assert.deepEqual(brief(guidanceFromSentence("For the third quarter of 2026, the Company expects net revenue to be in the range of $2.290 billion to $2.320 billion, representing a decline of 10% to 11%.")), [["revenue", 2.29, 2.32, "USD billion"], ["revenue", -11, -10, "%"]]);
  assert.deepEqual(brief(guidanceFromSentence("Salesforce raises full year FY27 revenue guidance to $46.1 billion to $46.4 billion, up 11% - 12% Y/Y.")), [["revenue", 46.1, 46.4, "USD billion"], ["revenue", 11, 12, "%"]]);
  assert.deepEqual(brief(guidanceFromSentence("Forecasting third-quarter 2026 revenue of $15.8 billion to $16.8 billion; expecting third-quarter EPS of $0.31.")), [["revenue", 15.8, 16.8, "USD billion"], ["eps", 0.31, 0.31, "USD per share"]]);
  assert.deepEqual(brief(guidanceFromSentence("Outlook for full-year EPS of $5.10 to $5.60 and free cash flow of approximately $2.5 billion")), [["eps", 5.1, 5.6, "USD per share"], ["free_cash_flow", 2.5, 2.5, "USD billion"]]);
});

test("plus or minus: a percentage of the figure, basis points of a margin, an amount", () => {
  const rev = guidanceFromSentence("•Revenue is expected to be $108.0 billion, plus or minus 2%.", { section: true });
  assert.deepEqual(brief(rev), [["revenue", 105.84, 110.16, "USD billion"]]);
  assert.equal(rev[0].stated_as, "plus or minus 2%");
  assert.equal(rev[0].width_pct_of_mid, 4);
  assert.deepEqual(brief(guidanceFromSentence("•GAAP and non-GAAP gross margins are expected to be 74.0%, plus or minus 50 basis points.", { section: true })), [["gross_margin", 73.5, 74.5, "%"]], "the band's own figure is not a second item");
  assert.deepEqual(brief(guidanceFromSentence("We expect revenue of $7.1 billion, plus or minus $300 million.")), [["revenue", 6.8, 7.4, "USD billion"]]);
});

test("approximately is marked; flat to a figure starts at zero; words stay words", () => {
  const avgo = guidanceFromSentence("•Fourth quarter revenue guidance of approximately $34.8 billion;", { section: true });
  assert.deepEqual(brief(avgo), [["revenue", 34.8, 34.8, "USD billion"]]);
  assert.equal(avgo[0].approximate, true);
  assert.deepEqual(brief(guidanceFromSentence("•Comparable sales growth of approximately flat to 2.0%", { section: true })), [["comparable_sales", 0, 2, "%"]]);
  const words = guidanceFromSentence("We expect comparable sales to grow in the low-single digits for the year.");
  assert.deepEqual([words[0].measure, words[0].words, words[0].low], ["comparable_sales", "low-single digits", null]);
});

test("each figure gets its own measure, basis and period", () => {
  const [a, b] = guidanceFromSentence("•Updates full year FY27 GAAP operating margin guidance to 20.1%, and maintains non-GAAP operating margin guidance of 34.3%");
  assert.deepEqual([a.measure, a.basis, a.low], ["operating_margin", "GAAP", 20.1]);
  assert.deepEqual([b.measure, b.basis, b.low], ["operating_margin", "non-GAAP", 34.3]);
  const [q, y] = guidanceFromSentence("We expect Adjusted EPS of $0.62 to $0.64 for Q3 and $2.80 to $2.87 for FY27.");
  assert.deepEqual([q.period, y.period], ["Q3", "FY27"]);
  assert.deepEqual(brief(guidanceFromSentence("For the full year fiscal 2027, NVIDIA expects GAAP and non-GAAP tax rates to be between 16.0% and 18.0%, excluding any discrete items.")), [["tax_rate", 16, 18, "%"]]);
});

test("a part of a measure keeps its own name; a side figure is not the measure's", () => {
  const [ai] = guidanceFromSentence("In Q4 the momentum continues, and we expect AI semiconductor revenue to accelerate to $21.7 billion, up 236% year-over-year.");
  assert.equal(ai.measure, null);
  assert.equal(ai.label, "AI semiconductor revenue");
  const [profit, fuel] = guidanceFromSentence("For the full year, we expect to generate a pre-tax profit of roughly $4.5 billion, absorbing a $6 billion increase in fuel costs.");
  assert.equal(profit.measure, "pretax_income");
  assert.deepEqual([fuel.measure, fuel.label], [null, "increase in fuel costs"]);
  const [, gallon] = guidanceFromSentence("In the December quarter, we expect earnings of $1.15 to $1.65 per share, based on a fuel price of approximately $4.25 per gallon.");
  assert.deepEqual([gallon.measure, gallon.unit], [null, "USD per gallon"]);
  const [margin] = guidanceFromSentence("Excluding tariff refunds, full-year operating income margin rate is expected to be in a range around 50 basis points higher than last year.");
  assert.equal(margin.measure, "operating_margin");
});

test("not guidance: results, a raise's explanation, figures inside words", () => {
  assert.deepEqual(guidanceFromSentence("Second-quarter revenue was $89.0 billion, up 18% from the previous quarter."), [], "a result outside an outlook section");
  assert.deepEqual(guidanceFromSentence("The $200M raise, $300 million CC, reflects $100 million of organic growth.", { section: true }), []);
  assert.deepEqual(figuresIn("Q3 FY27 results in 2026"), []);
  assert.deepEqual(figuresIn("$15.8-16.8 billion").map((f) => [f.low, f.high]), [[15.8, 16.8]], "a hyphen between figures is a range, not a minus");
  assert.deepEqual(figuresIn("Revenue decreased 4% to $2.4 billion").map((f) => [f.low, f.high]), [[4, 4], [2.4, 2.4]], "a change and an amount are not a range");
});

test("an outlook section: its period, its end at the next heading, and table rows left to the tables", () => {
  const text = [
    "Outlook",
    "NVIDIA's outlook for the third quarter of fiscal 2027 is as follows:",
    "•Revenue is expected to be $108.0 billion, plus or minus 2%.",
    "•GAAP and non-GAAP gross margins are expected to be 74.0%, plus or minus 50 basis points.",
    "Gross margin | 74.0% | 74.0%",
    "Highlights",
    "•Second-quarter revenue was $89.0 billion, up 18% from the previous quarter.",
  ].join("\n");
  const items = guidanceFromText(text);
  assert.deepEqual(items.map((x) => [x.measure, x.period]), [["revenue", "third quarter of fiscal 2027"], ["gross_margin", "third quarter of fiscal 2027"]]);
  // "Revenue Environment and Outlook" mixes results with the outlook.
  const mixed = guidanceFromText(["Revenue Environment and Outlook", "September quarter revenue grew approximately 16 percent over prior year.", "We expect total revenue growth of approximately 20 percent in the December quarter."].join("\n"));
  assert.deepEqual(mixed.map((x) => [x.measure, x.low, x.period]), [["revenue", 20, "December quarter"]]);
  // A headline bullet is not a section; a sentence's "for the quarter" is the quarter named before it.
  const lulu = guidanceFromText(["Reaffirms Fiscal 2026 Guidance", "Revenue was $2.4 billion.", "2026 Outlook", "For the third quarter of 2026, the Company expects net revenue to be in the range of $2.290 billion to $2.320 billion.", "Diluted earnings per share are expected to be in the range of $0.93 to $0.98 for the quarter."].join("\n"));
  assert.deepEqual(lulu.map((x) => [x.measure, x.period]), [["revenue", "third quarter of 2026"], ["eps", "third quarter of 2026"]]);
});

test("a guidance table: each cell's range under its row's measure and the table's period", () => {
  const t = { caption: "Guidance", columns: ["line", "", "", ""], notes: ["The Company's fiscal year guidance is based on the following FY26 figures: Net sales: $706.4 billion."], rows: [
    ["Fiscal year 2027", null, null, null],
    ["Consolidated metric", "Original from 2.19.2026", "As of 5.21.2026", "As of 8.20.2026"],
    ["Net sales (cc)", "Increase 3.5% to 4.5%", "Unchanged", "Increase 4.0% to 5.0%"],
    ["Adj. EPS", "$2.75 to $2.85", "Unchanged", "$2.80 to $2.87"],
  ] };
  const items = guidanceFromTable(t);
  assert.deepEqual(items.map((x) => [x.measure, x.basis, x.period, x.low, x.high, x.unit]), [
    ["revenue", "constant currency", "Fiscal year 2027", 3.5, 4.5, "%"],
    ["revenue", "constant currency", "Fiscal year 2027", 4, 5, "%"],
    ["eps", "adjusted", "Fiscal year 2027", 2.75, 2.85, "USD per share"],
    ["eps", "adjusted", "Fiscal year 2027", 2.8, 2.87, "USD per share"],
  ]);
  const scaled = guidanceFromTable({ caption: "", columns: ["line", "Q3 FY2027 Outlook ($ in billions)"], rows: [["GAAP operating expenses", 9.2]] });
  assert.deepEqual([scaled[0].measure, scaled[0].unit, scaled[0].period], ["operating_expenses", "USD billion", "Q3 FY2027"]);
});

test("results, signed: declines are negative, a second figure after \"or\" shares the sign, prior-year comparatives are not results", () => {
  const r = resultsFromText(["Revenue decreased 4% to $2.4 billion, or decreased 5% on a constant dollar basis", "Comparable sales decreased 9%, or 10% on a constant dollar basis", "Income from operations decreased 13% to $453.7 million and operating margin decreased 190 basis points to 18.8%", "Adjusted diluted earnings per share for the second quarter of fiscal 2026 were $4.92, compared with $4.68", "Net earnings for the quarter were $4.8 billion, or $4.79 per diluted share"].join("\n"));
  assert.deepEqual(r.map((x) => [x.measure, x.value, x.unit, x.basis, x.change]), [
    ["revenue", -4, "%", null, "growth"], ["revenue", 2.4, "USD billion", null, null], ["revenue", -5, "%", "constant currency", "growth"],
    ["comparable_sales", -9, "%", null, "growth"], ["comparable_sales", -10, "%", "constant currency", "growth"],
    ["operating_margin", -190, "bps", null, "change"], ["operating_margin", 18.8, "%", null, null],
    ["eps", 4.92, "USD per share", "adjusted", null],
    ["net_income", 4.8, "USD billion", null, null], ["eps", 4.79, "USD per share", null, null],
  ]);
});

test("guidance against results: the position in the range, in basis points for rates; rounded results are not placed", () => {
  const guided = [
    ...guidanceFromSentence("For the second quarter of 2026, the Company expects net revenue to be in the range of $2.450 billion to $2.475 billion, representing a decline of 2% to 3%."),
    ...guidanceFromSentence("Diluted earnings per share are expected to be in the range of $1.76 to $1.81 for the second quarter of 2026."),
    ...guidanceFromSentence("For the second quarter, we expect gross margin to be approximately 58%."),
  ];
  const results = resultsFromText("Revenue decreased 4% to $2.4 billion.\nDiluted EPS of $2.92.\nGross margin was 60.5%.");
  const rows = compareGuidance(guided, results);
  const by = (m, u) => rows.find((x) => x.measure === m && x.unit === u);
  assert.equal(by("revenue", "USD billion").position, "not placed: the result is stated to 1 decimal, the guide to 3");
  assert.deepEqual([by("revenue", "%").guided_low, by("revenue", "%").guided_high, by("revenue", "%").actual, by("revenue", "%").vs_high_bps, by("revenue", "%").position], [-3, -2, -4, -200, "below the range"]);
  assert.equal(by("eps", "USD per share").position, "above the range");
  assert.equal(by("gross_margin", "%").position, "above the range (the guide was approximate)");
  assert.equal(by("gross_margin", "%").vs_low_bps, 250);
});

test("measures, periods, quarters and footnote marks", () => {
  assert.equal(measureOf("Earnings (Loss) Per Share Attributable to Intel-Diluted"), "eps");
  assert.equal(measureOf("Comparable sales growth"), "comparable_sales");
  assert.equal(measureOf("pre-tax profit margin"), "pretax_margin");
  assert.equal(periodOf("for the three months ended October 31, 2026"), "three months ended October 31, 2026");
  assert.deepEqual(quarterOf("LULULEMON ATHLETICA INC. ANNOUNCES SECOND QUARTER FISCAL 2026 RESULTS"), { quarter: 2, year: 2026 });
  assert.deepEqual(quarterOf("Q3 FY27"), { quarter: 3, year: 2027 });
  assert.deepEqual(quarterOf("4Q26"), { quarter: 4, year: 2026 });
  assert.equal(quarterOf("fiscal 2027"), null);
  assert.equal(unglue("Adjusted EPS1 and comp sales2 (cc)1"), "Adjusted EPS 1 and comp sales 2 (cc) 1");
  assert.equal(unglue("FY27 and Q3"), "FY27 and Q3");
});

test("\"X and Y, respectively\" is two values, one for each basis, each with the band", () => {
  const margins = guidanceFromSentence("•GAAP and non-GAAP gross margins are expected to be 74.9% and 75.0%, respectively, plus or minus 50 basis points.", { section: true });
  assert.deepEqual(margins.map((x) => [x.measure, x.basis, x.low, x.high]), [["gross_margin", "GAAP", 74.4, 75.4], ["gross_margin", "non-GAAP", 74.5, 75.5]]);
  const opex = guidanceFromSentence("•GAAP and non-GAAP operating expenses are expected to be approximately $8.5 billion and $8.3 billion, respectively.", { section: true });
  assert.deepEqual(opex.map((x) => [x.basis, x.low, x.approximate]), [["GAAP", 8.5, true], ["non-GAAP", 8.3, true]]);
  const both = compareGuidance(margins, resultsFromText("For the quarter, GAAP and non-GAAP gross margins were both 75.0%."));
  assert.deepEqual(both.map((x) => [x.basis, x.position]), [["GAAP", "within the range"], ["non-GAAP", "within the range"]]);
});

test("guidance tables named by an introducing sentence or a heading row; a band across cells; prose above a results table does not count", async () => {
  const { isGuidanceTable } = await import("../src/guidance.mjs");
  assert.equal(isGuidanceTable({ caption: "x / Cisco expects to achieve the following results for the first quarter of fiscal 2027:", columns: ["line", ""], rows: [["Revenue", "$18.0 billion - $18.2 billion"]] }), true);
  assert.equal(isGuidanceTable({ caption: "Share Repurchase Activity", columns: ["line", ""], rows: [["Fourth Quarter Fiscal 2026 Outlook", null], ["Revenues", "$17.75B - $18.4B"]] }), true);
  assert.equal(isGuidanceTable({ caption: "We've narrowed our fiscal 27 free cash flow expectations reflecting stronger underlying expectations / x", columns: ["line", "Q2 FY27"], rows: [["Revenue", 2046]] }), false);
  const band = guidanceFromTable({ caption: "…are expected to be as follows:", columns: ["line", "Q4 FY2026", "Q4 FY2026", "Q4 FY2026"], rows: [["Total revenue", 10250, "+/-", 500], ["Non-GAAP diluted EPS", 4.02, "+/-", 0.2]] });
  assert.deepEqual(band.map((x) => [x.measure, x.low, x.high]), [["revenue", 9750, 10750], ["eps", 3.82, 4.22]]);
  const lam = guidanceFromTable({ caption: "", columns: ["line", "", "", ""], rows: [["Revenue", "$8.10 Billion", "+/-", "$400 Million"]] });
  assert.deepEqual(lam.map((x) => [x.measure, x.low, x.high, x.unit]), [["revenue", 7.7, 8.5, "USD billion"]]);
});

test("the exact statement of a result is compared, not the rounded headline", () => {
  const g = guidanceFromSentence("Accenture expects revenues for the fourth quarter of fiscal 2026 to be in the range of $17.75 billion to $18.40 billion.");
  const r = resultsFromText("•Revenues of $18.7 billion for the quarter.\nRevenues for the fourth quarter of fiscal 2026 were $18.68 billion.");
  assert.deepEqual(compareGuidance(g, r).map((x) => [x.actual, x.position]), [[18.68, "above the range"]]);
});

// Results read from release text, on sentences from the releases above and from Micron, Cisco,
// Intuit, HP, Lam Research, Cintas, Accenture, Qualcomm, Lennar and Palo Alto Networks (2026).
const facts = (text) => resultsFromText(text).map((x) => [x.measure, x.value, x.unit, x.basis, x.change, x.versus, x.section]);

test("results under a part of the business carry its name; changes say what they are measured against", () => {
  const nvidia = ["•Revenue of $96.2 billion, up 106% from a year ago", "NVIDIA today reported revenue for the second quarter ended July 26, 2026, of $96.2 billion, up 18% from the previous quarter and up 106% from a year ago.", "Highlights", "Data Center", "•Second-quarter revenue was $89.0 billion, up 18% from the previous quarter and up 117% from a year ago.", "Edge Computing", "•Second-quarter Edge Computing revenue was $7.2 billion, up 13% from the previous quarter.", "CFO Commentary"].join("\n");
  assert.deepEqual(facts(nvidia), [
    ["revenue", 96.2, "USD billion", null, null, null, null], ["revenue", 106, "%", null, "growth", "year over year", null],
    ["revenue", 96.2, "USD billion", null, null, null, null], ["revenue", 18, "%", null, "growth", "quarter over quarter", null], ["revenue", 106, "%", null, "growth", "year over year", null],
    ["revenue", 89, "USD billion", null, null, null, "Data Center"], ["revenue", 18, "%", null, "growth", "quarter over quarter", "Data Center"], ["revenue", 117, "%", null, "growth", "year over year", "Data Center"],
    ["revenue", 7.2, "USD billion", null, null, null, "Edge Computing"], ["revenue", 13, "%", null, "growth", "quarter over quarter", "Edge Computing"],
  ]);
  assert.deepEqual(facts("Revenue in Productivity and Business Processes was $33.1 billion.\nWalmart U.S. comp sales grew 2.6%.\n•System Design and Analysis revenue grew 37% year-over-year").map((x) => [x[0], x[1], x[6]]),
    [["revenue", 33.1, "Productivity and Business Processes"], ["comparable_sales", 2.6, "Walmart U.S."], ["revenue", 37, "System Design and Analysis"]]);
  // Before the company's results a short line is a contact's name, not a part; capitals are a table's title.
  assert.deepEqual(facts("Satya Kumar\n•Revenue of $54.23 billion\nNOTES TO TABLE A\nOur effective tax rate for the twelve months was approximately 24%.").map((x) => x[6]), [null, null]);
  // Deferred, recurring or unit revenue is not revenue.
  assert.deepEqual(facts("Deferred revenue increased to $2.43 billion.\n•Agentforce and Data 360 annual recurring revenue reached nearly $3.9 billion.\nMain cabin unit revenue grew 17 percent over prior year."), []);
});

test("a part's result does not answer the company's guide, nor growth from last quarter a growth guide, nor a year's result a quarter's guide", () => {
  const nvidiaGuide = guidanceFromSentence("For the second quarter of fiscal 2027, revenue is expected to be $91.0 billion, plus or minus 2%.", { section: true });
  const nvidia = resultsFromText(["•Revenue of $96.2 billion", "Highlights", "Data Center", "•Second-quarter revenue was $89.04 billion, up 13% from the previous quarter."].join("\n"));
  assert.deepEqual(compareGuidance(nvidiaGuide, nvidia).map((x) => [x.actual, x.position]), [[96.2, "above the range"]], "Data Center's $89.04 billion, though stated more precisely, is not the company's");
  const growthGuide = guidanceFromSentence("For the fourth quarter of fiscal 2026, revenue growth of approximately 11 to 12 percent.", { section: true });
  assert.deepEqual(compareGuidance(growthGuide, resultsFromText("Revenue was $5.0 billion, up 13% sequentially.")), [], "growth from the previous quarter does not answer a growth guide");
  const intuit = resultsFromText(["Financial Highlights", "For the full year:", "•Total revenue increased 14 percent to $21.4 billion.", "For the fourth quarter:", "•Total revenue increased 13 percent to $4.4 billion."].join("\n"));
  assert.deepEqual(compareGuidance(growthGuide, intuit).map((x) => [x.unit, x.actual, x.result_quote]), [["%", 13, "•Total revenue increased 13 percent to $4.4 billion."]], "the year's 14% does not answer the quarter's guide");
});

test("last year's figures, guidance, assumptions, impacts and boilerplate are not results", () => {
  const lines = [
    "•Diluted earnings per share were $2.92 compared to $3.10 in the second quarter of 2025.",
    "•Revenue of $54.23 billion versus $41.46 billion for the prior quarter and $11.32 billion for the same period last year",
    "•GAAP operating income for fiscal 2026 increased 12% to $11.41 billion compared with GAAP operating income of $10.23 billion for fiscal 2025.",
    "This compares to revenue of $5.84 billion, gross margin of $2.91 billion, or 49.8% of revenue.",
    "Revenue for the first quarter was $3.01 billion compared to $2.72 billion in last year's first quarter, an increase of 10.9%.",
    "For Q3 sales guidance, we expect a headwind of over 100bps to growth related to a timing shift.",
    "This assumes a tax rate of approximately 30%.",
    "•Currency rate fluctuations positively affected sales by $1.5 billion and operating income by $0.1 billion",
    "Walmart U.S. comp sales grew 2.6%, led by growth in transactions and includes 80 bps headwind from health & wellness.",
    "The Company ended the quarter with $1.4 billion in cash and cash equivalents and it had $593.7 million of available capacity under its revolving credit facility.",
    "(1)GAAP earnings per share based on approximately 1.15 billion diluted shares.",
    "Transpacific revenue grew 13 percent over prior year on 8 percent higher capacity.",
    "Operating expenses were $6.8 billion, up 10% year over year, and were 39.4% of revenue.",
    "TurboTax Live revenue increased 37 percent, representing 53 percent of total TurboTax revenue.",
    "(NASDAQ: WMT) announces results with strong growth in revenue, including eCommerce, which grew 23% globally.",
    "About Walmart",
    "With fiscal year 2026 revenue of $713 billion, Walmart employs approximately 2.1 million associates worldwide.",
  ].join("\n");
  assert.deepEqual(facts(lines).map((x) => [x[0], x[1], x[2]]), [
    ["eps", 2.92, "USD per share"], ["revenue", 54.23, "USD billion"], ["operating_income", 12, "%"], ["operating_income", 11.41, "USD billion"],
    ["revenue", 3.01, "USD billion"], ["revenue", 10.9, "%"], ["comparable_sales", 2.6, "%"], ["revenue", 13, "%"], ["operating_expenses", 6.8, "USD billion"], ["operating_expenses", 10, "%"], ["revenue", 37, "%"],
  ]);
  // A subheadline is not an outlook section, and a section joining results to the outlook keeps them.
  assert.deepEqual(facts("Reaffirms Fiscal 2026 Guidance\nNet earnings for the quarter were $4.8 billion.\nRevenue Environment and Outlook\nSeptember quarter revenue grew approximately 16 percent over prior year.\nFiscal 2027 Guidance\n•Gross margin of approximately 33.1%").map((x) => [x[0], x[1]]), [["net_income", 4.8], ["revenue", 16]]);
});

test("a rate's change, a margin in dollars, a share of revenue and a change in dollars are read as what they are", () => {
  const lines = [
    "•Gross profit rate up 96 bps, led by Walmart U.S.",
    "For the June 2026 quarter, revenue was $6.72 billion, gross margin was $3.48 billion, or 51.7% of revenue, operating income was 37.4% of revenue, and net income was $2.28 billion.",
    "•Personal Systems net revenue was $11.8 billion, up 18% year over year (up 17% in constant currency) with a 4.6% operating margin.",
    "•Free cash flow of $5.5 billion, a decrease of $1.4 billion",
    "•Net earnings of $284 million",
    "•Operating revenue of $20.2 billion",
    "•GAAP diluted net income per share of $4.29, up 119% Y/Y and non-GAAP diluted net income per share of $5.90, up 103% Y/Y",
    "•Revenues of $18.7 billion for the quarter, an increase of 6% in U.S. dollars and 7% in local currency",
  ].join("\n");
  assert.deepEqual(facts(lines).map((x) => [x[0], x[1], x[2], x[3], x[4]]), [
    ["gross_margin", 96, "bps", null, "change"],
    ["revenue", 6.72, "USD billion", null, null], ["gross_profit", 3.48, "USD billion", null, null], ["gross_margin", 51.7, "%", null, null], ["operating_margin", 37.4, "%", null, null], ["net_income", 2.28, "USD billion", null, null],
    ["revenue", 11.8, "USD billion", null, null], ["revenue", 18, "%", null, "growth"], ["revenue", 17, "%", "constant currency", "growth"], ["operating_margin", 4.6, "%", null, null],
    ["free_cash_flow", 5.5, "USD billion", null, null], ["free_cash_flow", -1.4, "USD billion", null, "change"],
    ["net_income", 284, "USD million", null, null],
    ["revenue", 20.2, "USD billion", null, null],
    ["eps", 4.29, "USD per share", "GAAP", null], ["eps", 119, "%", "GAAP", "growth"], ["eps", 5.9, "USD per share", "non-GAAP", null], ["eps", 103, "%", "non-GAAP", "growth"],
    ["revenue", 18.7, "USD billion", null, null], ["revenue", 6, "%", null, "growth"], ["revenue", 7, "%", "constant currency", "growth"],
  ]);
  assert.deepEqual(facts("GAAP and non-GAAP earnings per diluted share were $2.46 and $2.22, respectively.\nFor the quarter, GAAP and non-GAAP gross margins were both 75.0%.").map((x) => [x[0], x[1], x[3]]),
    [["eps", 2.46, "GAAP"], ["eps", 2.22, "non-GAAP"], ["gross_margin", 75, "GAAP and non-GAAP"]], "respectively gives one basis each; both gives both");
});

test("a guidance table whose footnote starts left of its labels (Lockheed Martin, 2026-10-22)", async () => {
  const { parseTable } = await import("../src/tables.mjs");
  // The release's own layout: an empty spacer cell before every label, the footnote marker in that spacer.
  const cell = (t, span = 3) => `<td colspan="${span}">${t}</td>`;
  const row = (...c) => `<tr>${c.join("")}</tr>`;
  const html = `<table>${[
    row(cell(""), cell("(in millions, except per share data)"), cell(""), cell("Current Update"), cell(""), cell("July 2026"), cell("")),
    row(cell(""), cell("Sales"), cell(""), cell("~$80,000 - $82,000"), cell(""), cell("$79,750 - $81,750"), cell("")),
    row(cell(""), cell("Diluted earnings per share"), cell(""), cell("~$30.35 - $30.75"), cell(""), cell("$29.95 - $30.65"), cell("")),
    row(cell("1"), cell("Business segment operating profit and free cash flow are non-GAAP measures. See the section of this news release.", 15), cell("")),
  ].join("")}</table>`;
  const t = parseTable(html, "Refer to the section for factors that may impact the company's ability to achieve guidance.");
  assert.deepEqual(t.rows.map((r) => r[0]), ["Sales", "Diluted earnings per share"], "labels survive the footnote row");
  assert.equal(t.notes.length, 1);
  assert.deepEqual(brief(guidanceFromTable(t)), [["revenue", 80000, 82000, "USD million"], ["revenue", 79750, 81750, "USD million"], ["eps", 30.35, 30.75, "USD per share"], ["eps", 29.95, 30.65, "USD per share"]],
    "both columns, in millions from the table's own title row");
});

test("a results column beside the outlook is not guidance", () => {
  const t = { caption: "Selected Financial Data", columns: ["line", "2026 Outlook", "2025 Actual"], rows: [["FAS pension expense", -370, -924]] };
  const items = guidanceFromTable(t);
  assert.deepEqual(items.map((x) => [x.label, x.low, x.period]), [["FAS pension expense", -370, "2026"]], "only the outlook column");
});
