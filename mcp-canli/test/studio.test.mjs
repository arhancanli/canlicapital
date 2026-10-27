// The interactive views (studio.js): indicators that agree with the quant pack, the treemap and
// chain layouts, which results get which view, and how a view asks for its call again.
import assert from "node:assert/strict";
import test from "node:test";

import { runTool } from "canli-quant-mcp/src/registry.mjs";

import { renderRunResult } from "../src/view/render.js";
import { againInput, bollingerSeries, emaSeries, macdSeries, pivotChain, placed, rsiSeries, sliderRange, smaSeries, squarify, studioCall, studioFor, studioReset, sweepGrid, treemapData } from "../src/view/studio.js";

const close = Array.from({ length: 300 }, (_, i) => 100 * Math.exp(0.0006 * i + 0.03 * Math.sin(i / 7) + 0.01 * Math.cos(i / 3)));
const near = (a, b, label) => {
  assert.equal(a.length, b.length, label);
  a.forEach((x, i) => { if (x === null || b[i] === null) assert.equal(x, b[i], `${label}[${i}]`); else assert.ok(Math.abs(x - b[i]) < 1e-9 * Math.max(1, Math.abs(x)), `${label}[${i}]: ${x} vs ${b[i]}`); });
};

test("the chart's indicators are the quant pack's (TA-Lib's), value for value", () => {
  near(smaSeries(close, 20), runTool("sma", { close, period: 20, tail: 0 }).values ?? runTool("sma", { close, period: 20, tail: 0 }).sma, "sma");
  const q = (name, args) => runTool(name, { close, tail: 0, ...args });
  const e = q("ema", { period: 12 }); near(emaSeries(close, 12), e.values ?? e.ema, "ema");
  const r = q("rsi", { period: 14 }); near(rsiSeries(close, 14), r.values ?? r.rsi, "rsi");
  const m = q("macd", {}), mine = macdSeries(close);
  near(mine.macd, m.macd, "macd"); near(mine.signal, m.signal, "signal"); near(mine.histogram, m.histogram, "histogram");
  const b = q("bollinger_bands", {}), bb = bollingerSeries(close);
  near(bb.mid, b.middle ?? b.mid, "mid"); near(bb.up, b.upper ?? b.up, "upper"); near(bb.lo, b.lower ?? b.lo, "lower");
});

test("a treemap fills its rectangle, each block in proportion to its value", () => {
  const items = [6, 6, 4, 3, 2, 2, 1].map((value, i) => ({ label: `x${i}`, value }));
  const cells = squarify(items, 0, 0, 600, 400);
  assert.equal(cells.length, items.length);
  const total = items.reduce((s, x) => s + x.value, 0);
  for (const c of cells) {
    assert.ok(Math.abs(c.w * c.h - (c.value / total) * 600 * 400) < 1e-6, c.label);
    assert.ok(c.x >= -1e-9 && c.y >= -1e-9 && c.x + c.w <= 600 + 1e-6 && c.y + c.h <= 400 + 1e-6, c.label);
  }
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const a = cells[i], b = cells[j], ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    assert.ok(ox <= 1e-6 || oy <= 1e-6, `${a.label} and ${b.label} overlap`);
  }
  assert.deepEqual(squarify([], 0, 0, 10, 10), []);
});

const CHAIN = {
  underlying: { symbol: "AAPL", price: 347.61 }, expiration: "2026-10-26", days_to_expiration: 2, summary: { max_pain: 345 },
  columns: ["strike", "type", "bid", "ask", "mid", "last", "iv", "delta", "gamma", "theta", "vega", "open_interest", "volume"],
  rows: [[345, "call", 3.1, 3.3, 3.2, 3.2, 0.2, 0.6, 0.05, -0.2, 0.1, 900, 50], [345, "put", 0.5, 0.6, 0.55, 0.5, 0.21, -0.4, 0.05, -0.2, 0.1, 1200, 80], [350, "put", 2.9, 3.1, 3, 3, 0.19, -0.6, 0.05, -0.2, 0.1, 700, 20], [350, "call", 0.4, 0.5, 0.45, 0.4, 0.18, 0.35, 0.05, -0.2, 0.1, 1500, 300]],
  expirations: { columns: ["expiration", "days", "open_interest"], rows: [["2026-10-26", 2, 4300], ["2026-11-20", 27, 9000]] },
};

test("a chain pivots to strikes with their call and put", () => {
  const s = pivotChain(CHAIN.columns, CHAIN.rows);
  assert.deepEqual(s.map((x) => x.strike), [345, 350]);
  assert.equal(s[0].call.bid, 3.1);
  assert.equal(s[0].put.open_interest, 1200);
  assert.equal(s[1].call.volume, 300);
});

test("each result gets its view, and what a view draws is not drawn twice", () => {
  studioReset({ name: "price_history", arguments: { symbol: "AAPL" } });
  const bars = { symbol: "AAPL", dates: ["2026-01-02", "2026-01-05", "2026-01-06"], open: [1, 2, 3], high: [2, 3, 4], low: [0.5, 1.5, 2.5], close: [1.5, 2.5, 3.5], volume: [10, 20, 30] };
  const html = renderRunResult(bars, { name: "price_history" });
  assert.deepEqual(placed(), ["candles"]);
  assert.match(html, /data-kind="candles"/);
  assert.doesNotMatch(html, /<svg/, "the static close chart is left to the candles");
  const kinds = (r) => { studioReset({}); studioCall("t", null); studioFor(r); return placed(); };
  assert.deepEqual(kinds(CHAIN), ["chain"]);
  assert.deepEqual(kinds({ rule: "x", parameters: { fast: 20 }, sharpe: 1, curve: { columns: ["date", "strategy", "buy_and_hold", "drawdown", "exposure"], rows: [["2026-01-02", 1, 1, 0, 1]] } }), ["backtest"]);
  assert.deepEqual(kinds({ paper: true, accepted: true, token: "a.b", columns: ["symbol", "side", "qty", "accepted", "reasons", "est_cost_bps", "price", "notional"], rows: [["AAPL", "buy", 10, true, [], 1, 200, 2000]] }), ["ticket"]);
  assert.deepEqual(kinds({ recipe: "ma_crossover", columns: ["params", "sharpe"], rows: [[{ fast: 5, slow: 40 }, 1], [{ fast: 10, slow: 40 }, 2]] }), ["sweep"]);
  assert.deepEqual(kinds({ paper: true, positions: { columns: ["symbol", "qty", "market_value", "avg_entry_price", "unrealized_pl"], rows: [["AAPL", 10, 2000, 150, 500], ["MSFT", 5, 2000, 420, -100]] } }), ["treemap"]);
  assert.deepEqual(kinds({ assets: ["SPY", "TLT", "GLD"], weights: [0.5, 0.3, 0.2] }), ["treemap"]);
  assert.deepEqual(kinds({ columns: ["date", "value"], rows: [["2026-01-01", 1], ["2026-01-02", 2]] }), []);
});

test("holdings carry their return on cost; shorts keep their size", () => {
  const t = treemapData({ columns: ["symbol", "market_value", "unrealized_pl"], rows: [["AAPL", 2000, 500], ["TSLA", -1000, 100], ["MSFT", 1000, 0]] });
  assert.deepEqual(t.items.map((x) => [x.label, x.value, x.short, Number(x.change.toFixed(4))]), [["AAPL", 2000, false, 0.3333], ["TSLA", 1000, true, 0.0909], ["MSFT", 1000, false, 0]]);
  assert.equal(treemapData({ columns: ["symbol", "qty"], rows: [["A", 1], ["B", 2]] }), null, "no size column, no treemap");
});

test("a view's call again patches its own call and cuts the batch after it", () => {
  const input = { calls: [{ name: "price_history", arguments: { symbol: "SPY" } }, { name: "backtest_ma_crossover", arguments: { prices: { $result: 0, path: "close" }, fast: 20, slow: 100 } }, { name: "return_stats", arguments: {} }], return: "all" };
  assert.deepEqual(againInput({ input, call: { name: "backtest_ma_crossover", index: 1 } }, { fast: 30, curve: true }), {
    calls: [input.calls[0], { name: "backtest_ma_crossover", arguments: { prices: { $result: 0, path: "close" }, fast: 30, slow: 100, curve: true } }], return: "last", digits: 6, view: true,
  });
  assert.deepEqual(againInput({ input: { name: "options_chain", arguments: { symbol: "AAPL" } }, call: { name: "options_chain", index: null } }, { expiration: "2026-11-20" }), { name: "options_chain", arguments: { symbol: "AAPL", expiration: "2026-11-20" }, digits: 6, view: true });
  assert.deepEqual(againInput({ input: {}, call: null }, { symbol: "SPY" }, "price_history"), { name: "price_history", arguments: { symbol: "SPY" }, digits: 6, view: true });
});

test("sliders span sensible ranges; a sweep over two parameters is a grid", () => {
  assert.deepEqual(sliderRange("fast", 20, 700), { min: 1, max: 60, step: 1 });
  assert.deepEqual(sliderRange("slow", 200, 300), { min: 2, max: 150, step: 1 });
  assert.deepEqual(sliderRange("top_fraction", 0.25), { min: 0.01, max: 1, step: 0.01 });
  assert.deepEqual(sliderRange("entry_z", 2), { min: 0.5, max: 6, step: 0.05 });
  const g = sweepGrid([[{ fast: 5, slow: 40 }, 1], [{ fast: 10, slow: 40 }, 2], [{ fast: 5, slow: 80 }, 0.5]]);
  assert.deepEqual([g.a, g.b, g.xs, g.ys, g.at(10, 40), g.at(10, 80)], ["fast", "slow", [5, 10], [40, 80], 2, undefined]);
  assert.equal(sweepGrid([[{ fast: 5 }, 1], [{ fast: 10 }, 2]]), null);
});
