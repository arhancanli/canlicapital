// The second set of views (atlas.js): their arithmetic agrees with the quant pack, and each result
// gets its view (market map, yield curve, statements, volatility surface, correlations, several
// prices compared), with sortable tables everywhere else.
import assert from "node:assert/strict";
import test from "node:test";

import { runTool } from "canli-quant-mcp/src/registry.mjs";

import { alignCloses, baseLine, closeStats, clusterOrder, correlationOf, effectiveBets, eigenSym, tenorYears } from "../src/view/atlas.js";
import { renderRunResult, table } from "../src/view/render.js";
import { placed, studioFor, studioReset } from "../src/view/studio.js";

// Four assets: two that move together, one against them, one on its own.
const T = 400, base = Array.from({ length: T }, (_, t) => Math.sin(t * 1.7) * 0.01), own = Array.from({ length: T }, (_, t) => Math.cos(t * 2.3 + 1) * 0.012);
const cols = [base.map((x, t) => x + Math.sin(t * 0.9) * 0.002), base.map((x, t) => x * 1.2 + Math.cos(t * 1.1) * 0.003), base.map((x, t) => -x + Math.sin(t * 3.1) * 0.004), own];

test("correlations, the first factor's share and the returns' volatility are the quant pack's", () => {
  const mine = correlationOf(cols), q = runTool("correlation_matrix", { returns: Array.from({ length: T }, (_, t) => cols.map((c) => c[t])) });
  mine.forEach((row, i) => row.forEach((v, j) => assert.ok(Math.abs(v - q.matrix[i][j]) < 1e-9, `rho[${i}][${j}] ${v} vs ${q.matrix[i][j]}`)));
  assert.ok(Math.abs(effectiveBets(mine).first_share - q.first_eigenvalue_share) < 1e-6);
  const close = [100];
  for (const r of cols[0]) close.push(close.at(-1) * (1 + r));
  const st = closeStats(close), rs = runTool("return_stats", { returns: cols[0], periods_per_year: 252 });
  assert.ok(Math.abs(st.volatility - rs.volatility) < 1e-9, `${st.volatility} vs ${rs.volatility}`);
});

test("eigenvalues, independent bets and the clustered order", () => {
  const ev = eigenSym([[1, 0.6], [0.6, 1]]);
  assert.ok(Math.abs(ev[0] - 1.6) < 1e-12 && Math.abs(ev[1] - 0.4) < 1e-12);
  const m = correlationOf(cols), e = eigenSym(m);
  assert.ok(Math.abs(e.reduce((a, b) => a + b, 0) - 4) < 1e-9, "the eigenvalues add up to the trace");
  assert.ok(Math.abs(effectiveBets([[1, 0, 0], [0, 1, 0], [0, 0, 1]]).bets - 3) < 1e-12, "three unrelated assets are three bets");
  assert.ok(Math.abs(effectiveBets([[1, 1, 1], [1, 1, 1], [1, 1, 1]]).bets - 1) < 1e-9, "three that move as one are one bet");
  const order = clusterOrder([[1, 0.1, 0.9, 0], [0.1, 1, 0.1, 0.8], [0.9, 0.1, 1, 0], [0, 0.8, 0, 1]]);
  assert.equal(Math.abs(order.indexOf(0) - order.indexOf(2)), 1, "the 0.9 pair sits together");
  assert.equal(Math.abs(order.indexOf(1) - order.indexOf(3)), 1, "the 0.8 pair sits together");
});

test("maturities, common dates and the line a statement is read against", () => {
  assert.deepEqual(["1 Mo", "1.5 Month", "4 Mo", "10 Yr", "30 yr", "Total"].map(tenorYears), [1 / 12, 1.5 / 12, 4 / 12, 10, 30, null]);
  const a = alignCloses([{ dates: ["2026-01-02", "2026-01-05", "2026-01-06"], close: [1, 2, 3] }, { dates: ["2026-01-05T00:00:00Z", "2026-01-06", "2026-01-07"], close: [5, 6, 7] }]);
  assert.deepEqual(a, { dates: ["2026-01-05", "2026-01-06"], closes: [[2, 3], [5, 6]] });
  const income = [["Net sales", "c", 10, 9], ["Cost of sales", "c", 5, 4], ["Net income", "c", 2, 1]];
  assert.equal(baseLine("income", income, 2), 0);
  assert.equal(baseLine("income", [["Cost of revenue", "c", 1], ["Total revenues", "c", 9]], 2), 1, "not the cost line");
  assert.equal(baseLine("balance_sheet", [["Cash", 1], ["Total assets", 9]], 1), 1);
  assert.equal(baseLine("cash_flow", income, 2), null);
});

test("each result gets its view, and what the view draws is not drawn again", () => {
  const kinds = (r) => { studioReset({}); const { used } = studioFor(r); return { kinds: placed(), used }; };
  const market = kinds({ columns: ["symbol", "name", "date", "close", "day", "week", "month", "three_months", "year_to_date", "year"], us: [["^GSPC", "S&P 500", "2026-10-23", 7624, -0.005, 0.01, 0.02, 0.05, 0.1, 0.14]], rates: [["^TNX", "10-year", "2026-10-23", 4.99, 0.03, -0.1, -0.17, 0.35, 0.8, 1]], meaning: "m" });
  assert.deepEqual(market.kinds, ["market"]);
  assert.ok(market.used.has("us") && market.used.has("rates"));
  const curve = kinds({ curve: "nominal", columns: ["date", "1 Mo", "3 Mo", "2 Yr", "10 Yr", "30 Yr"], rows: [["2026-10-23", 4.1, 4.2, 4.7, 5, 5.3]], yields: { "1 Mo": 4.1 } });
  assert.deepEqual(curve.kinds, ["curve"]);
  const st = kinds({ company: { name: "Apple" }, income: { title: "OPS", columns: ["line", "concept", "12 months to 2025-09-27", "12 months to 2024-09-28"], rows: [["Net sales", "x", 416, 391], ["Net income", "y", 112, 94]] } });
  assert.deepEqual(st.kinds, ["statements"]);
  const surface = kinds({ underlying: { symbol: "SPY" }, term_structure: { columns: ["expiration", "days", "atm_iv"], rows: [["2026-10-26", 2, 0.11]] }, smile: { columns: ["expiration", "iv_at_0.9", "iv_at_1"], rows: [["2026-10-26", 0.4, 0.11]] } });
  assert.deepEqual(surface.kinds, ["surface"]);
  assert.deepEqual(kinds({ assets: ["A", "B"], matrix: [[1, 0.2], [0.2, 1]], average_pairwise: 0.2 }).kinds, ["corr"]);
  assert.deepEqual(kinds({ matrix: [[1, 2], [3, 4]] }).kinds, [], "a matrix that is not a correlation matrix");
});

test("several prices in a batch are compared once, above them, and not charted one by one", () => {
  const px = (symbol, k) => ({ symbol, dates: Array.from({ length: 40 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`), open: [], high: [], low: [], close: Array.from({ length: 40 }, (_, i) => 100 + k * i) });
  const one = (r) => ({ ...r, open: r.close, high: r.close, low: r.close });
  studioReset({ calls: [] });
  const html = renderRunResult({ results: [{ name: "price_history", result: one(px("SPY", 1)) }, { name: "price_history", result: one(px("AAPL", 2)) }] }, { calls: [] });
  assert.deepEqual(placed(), ["compare"]);
  assert.ok(html.indexOf("<h2>Compared</h2>") < html.indexOf("<h2>price_history"));
  studioReset({});
  renderRunResult({ results: [{ name: "price_history", result: one(px("SPY", 1)) }] }, {});
  assert.deepEqual(placed(), ["candles"], "one series is still its own chart");
});

test("plain tables sort by any heading and a long one can be filtered; a statement keeps its order", () => {
  const rows = Array.from({ length: 14 }, (_, i) => [`n${i}`, i * 3]);
  const html = table({ columns: ["name", "value"], rows });
  assert.match(html, /<input type="search" class="filter" placeholder="Filter 14 rows"/);
  assert.match(html, /<table class="sortable">/);
  assert.match(html, /<td class="num" data-v="39">39<\/td>/);
  assert.doesNotMatch(table({ columns: ["line", "2025"], rows: [["Revenue", 1], ["Costs:", null], ["Cost", 2]] }), /sortable/, "a heading row keeps the order");
  assert.doesNotMatch(table({ columns: ["a"], rows: [[1], [2]] }), /sortable|filter/, "two rows need neither");
});
