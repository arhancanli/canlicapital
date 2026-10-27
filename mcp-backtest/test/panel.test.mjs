// price_panel's industry grouping and its argument rules (its downloads are checked live).
import assert from "node:assert/strict";
import test from "node:test";

import { buildPanel, ff12 } from "../src/panel.mjs";

test("SIC codes fall into the twelve Fama-French industries", () => {
  assert.deepEqual([3571, 3674, 7372, 2834, 6022, 4911, 1311, 5331, 3711, 4813, 2080, 8062, 1000, null].map(ff12),
    ["BusEq", "BusEq", "BusEq", "Hlth", "Money", "Utils", "Enrgy", "Shops", "Durbl", "Telcm", "NoDur", "Hlth", "Other", null]);
});

test("tickers or an index fund, and a start before the end", async () => {
  const s = { now: () => Date.parse("2026-10-24T00:00:00Z") };
  await assert.rejects(buildPanel(s, { start: "2020-01-01" }), /Send tickers or index_fund/);
  await assert.rejects(buildPanel(s, { tickers: ["AAPL", "MSFT"], index_fund: "IVV", start: "2020-01-01" }), /Send tickers or index_fund/);
  await assert.rejects(buildPanel(s, { tickers: ["AAPL", "MSFT"], start: "2027-01-01" }), /start must be before end/);
});
