// stock_snapshot against a captured shape of Yahoo Finance's quote summary.
import assert from "node:assert/strict";
import test from "node:test";

import { NotFound, createSession } from "../src/sources.mjs";
import { stockSnapshot } from "../src/snapshot.mjs";

const SUMMARY = {
  price: { longName: "Apple Inc.", currency: "USD", regularMarketTime: 1793653200, regularMarketPrice: { raw: 339.4 }, marketCap: { raw: 4953119129600 } },
  financialData: { targetMeanPrice: { raw: 332.3858 }, targetMedianPrice: { raw: 337.5 }, targetHighPrice: { raw: 405 }, targetLowPrice: { raw: 245 }, numberOfAnalystOpinions: { raw: 38 }, recommendationMean: { raw: 2.23256 }, recommendationKey: "buy" },
  defaultKeyStatistics: { sharesShort: { raw: 131591865 }, dateShortInterest: { raw: 1792022400 }, shortRatio: { raw: 3.48 }, heldPercentInstitutions: { raw: 0.66366 }, heldPercentInsiders: { raw: 0.01648 }, priceToBook: { raw: 46.11 } },
  summaryDetail: { trailingPE: { raw: 38.92 }, forwardPE: { raw: 35.53 }, fiftyTwoWeekHigh: { raw: 360 }, fiftyTwoWeekLow: { raw: 200 }, dividendRate: { raw: 1.08 }, dividendYield: { raw: 0.0031 } },
  recommendationTrend: { trend: [{ period: "0m", strongBuy: 6, buy: 18, hold: 13, sell: 3, strongSell: 3 }] },
  earningsTrend: { trend: [{ period: "+1y", endDate: "2027-09-30", growth: { raw: 0.0806 }, earningsEstimate: { avg: { raw: 9.5687 }, low: { raw: 8.5 }, high: { raw: 10.67 }, numberOfAnalysts: { raw: 40 }, yearAgoEps: { raw: 8.84 } }, revenueEstimate: { avg: { raw: 4.5e11 }, numberOfAnalysts: { raw: 38 } } }, { period: "-5y", endDate: null }] },
  calendarEvents: { earnings: { earningsDate: [{ raw: 1793653200 }], isEarningsDateEstimate: false, earningsAverage: { raw: 1.99 } } },
};

function yahoo({ missing = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push([String(url), opts.headers ?? {}]);
    if (new URL(url).hostname === "fc.yahoo.com") return new Response("not found", { status: 404, headers: { "set-cookie": "A3=abc; Domain=.yahoo.com; Path=/" } });
    if (String(url).includes("getcrumb")) return new Response("crumb-1");
    if (missing) return new Response(JSON.stringify({ quoteSummary: { result: null, error: { code: "Not Found" } } }), { status: 404 });
    return new Response(JSON.stringify({ quoteSummary: { result: [SUMMARY], error: null } }));
  };
  return { s: createSession({ fetchImpl, env: {}, sleep: async () => {} }), calls };
}

test("stock_snapshot: analysts, estimates, valuation and short interest, labeled as a vendor's", async () => {
  const { s, calls } = yahoo();
  const r = await stockSnapshot(s, { symbol: "aapl" });
  assert.equal(r.symbol, "AAPL");
  assert.deepEqual(r.analysts.price_target, { mean: 332.3858, median: 337.5, high: 405, low: 245 });
  assert.equal(r.analysts.analysts, 38);
  assert.deepEqual(r.analysts.ratings_now, { strong_buy: 6, buy: 18, hold: 13, sell: 3, strong_sell: 3 });
  assert.deepEqual(r.estimates.rows.map((x) => x.slice(0, 3)), [["+1y", "2027-09-30", 9.5687]], "only the periods estimates exist for");
  assert.equal(r.valuation.market_cap, 4953119129600);
  assert.equal(r.short_interest.shares_short, 131591865);
  assert.equal(r.holders.institutions_pct, 66.37);
  assert.equal(r.dividend.yield_pct, 0.31);
  assert.match(r.limits.join(" "), /vendor's aggregates.*No primary source/);
  assert.equal(JSON.stringify(r).includes("crumb-1"), false, "the token never reaches an answer");
  const summary = calls.find(([u]) => u.includes("quoteSummary"));
  assert.equal(summary[1].Cookie, "A3=abc");
  // The cookie and token are reused.
  await stockSnapshot(s, { symbol: "MSFT" });
  assert.equal(calls.filter(([u]) => u.includes("getcrumb")).length, 1);
});

test("stock_snapshot: an unknown symbol says so", async () => {
  await assert.rejects(stockSnapshot(yahoo({ missing: true }).s, { symbol: "NOPE123" }), (e) => e instanceof NotFound && /NOPE123 is not a symbol/.test(e.message));
});
