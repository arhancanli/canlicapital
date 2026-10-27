// The equity curve and trade log a backtest returns with curve: true: they end where the summary
// says, start at 1, label rows with the dates given, and leave the default answer unchanged.
import assert from "node:assert/strict";
import test from "node:test";

import { CURVE_POINTS, TOOLS } from "../src/tools/strategies.mjs";

const tool = (n) => TOOLS.find((x) => x.name === n);
const run = (n, a) => tool(n).run(tool(n).input.parse(a));
const prices = Array.from({ length: 400 }, (_, i) => 100 * Math.exp(0.0004 * i + 0.05 * Math.sin(i / 17)));
const dates = prices.map((_, i) => new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10));

test("the curve ends at the total return, the drawdown at its maximum, and trades are the weight changes", () => {
  const r = run("backtest_ma_crossover", { prices, fast: 10, slow: 40, curve: true, dates });
  assert.deepEqual(r.curve.columns, ["date", "strategy", "buy_and_hold", "drawdown", "exposure"]);
  assert.equal(r.curve.rows.length, prices.length);
  assert.deepEqual(r.curve.rows[0], [dates[0], 1, 1, 0, 0]);
  const last = r.curve.rows.at(-1);
  assert.equal(last[0], dates.at(-1));
  assert.ok(Math.abs(last[1] - (1 + r.total_return)) < 1e-12);
  assert.ok(Math.abs(Math.min(...r.curve.rows.map((x) => x[3])) - r.max_drawdown) < 1e-12);
  assert.ok(Math.abs(last[2] - prices.at(-1) / prices[0]) < 1e-9, "buy and hold is the price relative");
  assert.equal(r.trades.total, r.weight_changes);
  assert.deepEqual(r.trades.columns, ["date", "price", "weight_before", "weight_after", "side"]);
  for (const [d, p, from, to, side] of r.trades.rows) {
    assert.equal(p, prices[dates.indexOf(d)]);
    assert.equal(side, to > from ? "buy" : "sell");
  }
});

test("without curve the answer is as before; many assets name the asset; long series are thinned", () => {
  const plain = run("backtest_ma_crossover", { prices, fast: 10, slow: 40 });
  assert.equal(plain.curve, undefined);
  assert.equal(plain.trades, undefined);
  const m = run("backtest_equal_weight_rebalance", { prices: prices.map((x, i) => [x, 100 + i * 0.1]), curve: true });
  assert.deepEqual(m.trades.columns, ["period", "asset", "price", "weight_before", "weight_after", "side"]);
  assert.deepEqual(m.trades.rows.slice(0, 2), [[0, 0, prices[0], 0, 0.5, "buy"], [0, 1, 100, 0, 0.5, "buy"]]);
  const long = Array.from({ length: 6000 }, (_, i) => 100 + Math.sin(i / 50) * 5 + i * 0.01);
  const l = run("backtest_ma_crossover", { prices: long, fast: 20, slow: 100, curve: true });
  assert.ok(l.curve.rows.length <= CURVE_POINTS + 1);
  assert.equal(l.curve.every, 6);
  assert.equal(l.curve.rows.at(-1)[0], long.length - 1);
  assert.throws(() => run("backtest_ma_crossover", { prices, curve: true, dates: dates.slice(1) }), /dates has 399 entries and prices 400/);
});

test("a sweep never builds curves", () => {
  const s = run("strategy_sweep", { recipe: "ma_crossover", arguments: { prices, curve: true }, grid: { fast: [5, 10], slow: [40, 80] } });
  assert.equal(s.rows.length, 4);
  assert.ok(!JSON.stringify(s).includes("buy_and_hold\""));
});
