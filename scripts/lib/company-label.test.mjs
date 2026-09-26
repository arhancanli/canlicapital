import assert from "node:assert/strict";
import test from "node:test";

import { companyLabel } from "./company-label.mjs";

test("legal suffixes and the comma before them are removed; names ending in '& Co' keep it", () => {
  const cases = {
    "LAKELAND INDUSTRIES, INC.": "LAKELAND INDUSTRIES",
    "WEYCO GROUP, INC": "WEYCO GROUP",
    "CRANE NXT, CO.": "CRANE NXT",
    "TherapeuticsMD, Inc.": "TherapeuticsMD",
    "Apple Inc.": "Apple",
    "COUSINS PROPERTIES INC": "COUSINS PROPERTIES",
    "LOEWS CORP": "LOEWS",
    "MICROSOFT CORPORATION": "MICROSOFT",
    "3M CO": "3M",
    "Example Holdings, L.P.": "Example Holdings",
    "Example Partners LLC": "Example Partners",
    "Example plc": "Example",
    "AT&T INC.": "AT&T",
    "PROCTER & GAMBLE Co": "PROCTER & GAMBLE",
    "JPMORGAN CHASE & CO": "JPMORGAN CHASE & CO",
    "JPMORGAN CHASE & CO.": "JPMORGAN CHASE & CO.",
    "CO": "CO",
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
