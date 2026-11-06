import assert from "node:assert/strict";
import test from "node:test";

import { companyLabel, displayCase } from "./company-label.mjs";

test("legal suffixes and the comma before them are removed; names ending in '& Co' keep it", () => {
  const cases = {
    "LAKELAND INDUSTRIES, INC.": "Lakeland Industries",
    "WEYCO GROUP, INC": "Weyco Group",
    "CRANE NXT, CO.": "Crane NXT",
    "TherapeuticsMD, Inc.": "TherapeuticsMD",
    "Apple Inc.": "Apple",
    "COUSINS PROPERTIES INC": "Cousins Properties",
    "LOEWS CORP": "Loews",
    "MICROSOFT CORPORATION": "Microsoft",
    "3M CO": "3M",
    "Example Holdings, L.P.": "Example Holdings",
    "Example Partners LLC": "Example Partners",
    "Example plc": "Example",
    "AT&T INC.": "AT&T",
    // The SEC writes a bare "Co" after a name in capitals; that is not the company casing its own name.
    "PROCTER & GAMBLE Co": "Procter & Gamble",
    "JPMORGAN CHASE & CO": "JPMorgan Chase & Co",
    "JPMORGAN CHASE & CO.": "JPMorgan Chase & Co.",
    "CO": "Co",
    "Costco Wholesale Corp /NEW": "Costco Wholesale Corp /NEW",
  };
  for (const [name, label] of Object.entries(cases)) assert.equal(companyLabel(name), label, name);
});

test("no label ends in a comma, and a label is never emptied", () => {
  for (const name of ["A, INC.", "BB, Inc.,", "INC.", "X & Y, LTD."]) {
    const label = companyLabel(name);
    assert.ok(!/[,\s]$/.test(label), `${name} -> ${label}`);
    assert.ok(label.length >= 2, `${name} -> ${label}`);
  }
});

test("an all-capitals SEC name reads in ordinary case; acronyms, tickers, states and filed casing stay", () => {
  const cases = [
    ["FINCH THERAPEUTICS GROUP, INC.", null, "Finch Therapeutics Group, Inc."],
    ["INTERNATIONAL BUSINESS MACHINES CORP", null, "International Business Machines Corp"],
    ["BANK OF AMERICA CORP /DE/", null, "Bank of America Corp /DE/"],
    ["AES CORP", null, "AES Corp"],
    ["FTAI AVIATION LTD.", "FTAI", "FTAI Aviation Ltd."],
    ["MCKINLEY ACQUISITION CORP", null, "McKinley Acquisition Corp"],
    ["TECHTARGET HOLDINGS INC", null, "TechTarget Holdings Inc"],
    ["ONE GAS, INC.", null, "One Gas, Inc."],
    ["3M CO", null, "3M Co"],
    ["TherapeuticsMD, Inc.", null, "TherapeuticsMD, Inc."],
  ];
  for (const [name, ticker, shown] of cases) assert.equal(displayCase(name, ticker), shown, name);
});

test("a company with a ticker drops the filer's state or re-registration tag with its suffix; without one the tag stays as filed", () => {
  const cases = [
    ["QUALCOMM INC/DE", "QCOM", "Qualcomm"],
    ["BANK OF AMERICA CORP /DE/", "BAC", "Bank of America"],
    ["COMCAST CORP /NEW/", "CMCSA", "Comcast"],
    ["Costco Wholesale Corp /NEW", "COST", "Costco Wholesale"],
    ["QUALCOMM INC/DE", null, "Qualcomm Inc/DE"],
    ["Costco Wholesale Corp /NEW", null, "Costco Wholesale Corp /NEW"],
    ["NOVO NORDISK A/S", "NVO", "Novo Nordisk A/S"],
  ];
  for (const [name, ticker, label] of cases) assert.equal(companyLabel(name, ticker), label, `${name} ${ticker}`);
  assert.equal(displayCase("QUALCOMM INC/DE"), "Qualcomm Inc/DE");
});

test("an SEC name ending in COM is the company's .com name", () => {
  assert.equal(companyLabel("AMAZON COM INC", "AMZN"), "Amazon.com");
  assert.equal(companyLabel("PRICELINE COM INC"), "Priceline.com");
  assert.equal(companyLabel("Overstock.com, Inc."), "Overstock.com");
});

test("a company is named as the SEC registers it where the release recorded a co-registrant's or an older name", async () => {
  const { registeredName, titleLabel } = await import("./company-label.mjs");
  assert.equal(registeredName({ cik: "0000070858", name: "BofA Finance LLC" }), "BANK OF AMERICA CORP /DE/");
  assert.equal(titleLabel({ cik: "0000070858", name: "BofA Finance LLC" }), "Bank of America (BAC)");
  assert.equal(registeredName({ cik: "0000092103", name: "EDISON INTERNATIONAL" }), "SOUTHERN CALIFORNIA EDISON Co");
  assert.equal(registeredName({ cik: "0000320193", name: "Apple Inc." }), "Apple Inc.");
});

test("the registered names are exactly the name index's other_names, so the two cannot drift apart", async () => {
  const { readFileSync } = await import("node:fs");
  const { REGISTERED_NAMES } = await import("./company-registered-names.mjs");
  const { registeredNames, SOURCE } = await import("../build-company-registered-names.mjs");
  const index = JSON.parse(readFileSync(new URL(`../../${SOURCE}`, import.meta.url), "utf8"));
  assert.deepEqual({ ...REGISTERED_NAMES }, registeredNames(index), "run node scripts/build-company-registered-names.mjs");
});
