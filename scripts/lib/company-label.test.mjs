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
    "PROCTER & GAMBLE Co": "PROCTER & GAMBLE",
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
