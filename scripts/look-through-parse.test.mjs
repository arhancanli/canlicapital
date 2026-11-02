// What people type into the look-through: amounts in any common form, and what cannot be read is said back.
import assert from "node:assert/strict";
import test from "node:test";

import { fromLink, parseHoldings, toLink } from "../js/look-through-parse.js";

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
