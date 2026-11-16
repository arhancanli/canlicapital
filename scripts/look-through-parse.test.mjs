// What people type into the look-through: amounts in any common form, and what cannot be read is said back.
import assert from "node:assert/strict";
import test from "node:test";

import { fromLink, parseHoldings, sourceLine, toLink } from "../js/look-through-parse.js";

const weights = (text) => parseHoldings(text).holdings.map((h) => [h.symbol, h.weight]);

test("percentages, dollars and bare tickers", () => {
  assert.deepEqual(weights("VOO 60\nqqq 30%\nNVDA, 10"), [["VOO", 60], ["QQQ", 30], ["NVDA", 10]]);
  assert.deepEqual(weights("VTI: $6,000\nBND = $2,500.50"), [["VTI", 6000], ["BND", 2500.5]]);
  assert.deepEqual(weights("VOO\nQQQ"), [["VOO", 1], ["QQQ", 1]]);
  assert.deepEqual(weights("$AAPL 5"), [["AAPL", 5]]);
});

test("share classes are written the way the SEC's files write them", () => {
  assert.deepEqual(weights("BRK.B 10"), [["BRK-B", 10]]);
});

test("the same holding twice is added up", () => {
  assert.deepEqual(weights("VOO 10\nvoo 15"), [["VOO", 25]]);
});

test("what cannot be read is reported, not guessed at", () => {
  const r = parseHoldings("VOO 60\nmy house 300000\n<script>\nAAPL 0");
  assert.deepEqual(r.holdings, [{ symbol: "VOO", weight: 60 }]);
  assert.deepEqual(r.unread, ["my house 300000", "<script>", "AAPL 0"]);
});

test("amounts on only some lines cannot be sized, and too many are refused", () => {
  assert.match(parseHoldings("VOO 60\nQQQ").problem, /every holding/);
  assert.match(parseHoldings(Array.from({ length: 26 }, (_, i) => `A${String.fromCharCode(65 + i)} 1`).join("\n")).problem, /more than 25/);
});

test("nothing typed gives no holdings", () => {
  assert.deepEqual(parseHoldings("  \n ").holdings, []);
});

test("a shared link comes back as the same holdings", () => {
  const { holdings } = parseHoldings("VOO 60\nBRK.B 40");
  assert.deepEqual(parseHoldings(fromLink(toLink(holdings))).holdings, holdings);
});

test("each fund's source, with the report checked against itself where the server gives the check", () => {
  const fund = { symbol: "VOO", fund: "Vanguard 500 Index Fund", period: "2026-06-30", filed: "2026-08-27" };
  assert.equal(sourceLine(fund), "VOO: Vanguard 500 Index Fund, its report for 2026-06-30, filed 2026-08-27.");
  assert.equal(sourceLine({ ...fund, values_add_to: 1.0009 }), "VOO: Vanguard 500 Index Fund, its report for 2026-06-30, filed 2026-08-27. Its holdings add up to 100.09% of its net assets; cash and what the fund owes make up the difference.");
  assert.match(sourceLine({ ...fund, values_add_to: 0.9927 }), /add up to 99\.27% of its net assets/);
  assert.equal(sourceLine({ ...fund, values_add_to: null }), sourceLine(fund), "no check from the server: the line as before");
  const series = { ...fund, series_id: "S000002839", class_id: "C000092055" };
  assert.equal(sourceLine(series), "VOO: one share class of Vanguard 500 Index Fund (SEC series S000002839); the series' report for 2026-06-30, filed 2026-08-27, covers all its classes.");
  assert.match(sourceLine({ ...series, values_add_to: 1.0009 }), /covers all its classes\. Its holdings add up to 100\.09% of its net assets/);
  assert.match(sourceLine({ ...series, symbol: "SPY", looked_through: "IVV" }), /^SPY \(through IVV\): one share class of/);
});
