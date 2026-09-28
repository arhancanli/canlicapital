// js/pretrade-core.test.js
// The pre-trade check against AlphaForge's PreTradeChecker (5,000 random batches recorded by
// scripts/research/execution-parity/alphaforge_pretrade.py) and against each rule it adds.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { checkOrders, effectiveLimits, REASONS } from "./pretrade-core.js";

const FIX = JSON.parse(gunzipSync(readFileSync(new URL("../mcp-execution/test/fixtures/alphaforge-pretrade.json.gz", import.meta.url))).toString("utf8"));

function fromCase(c) {
  const market = Object.fromEntries(Object.keys(c.closes).map((s) => [s, { price: c.closes[s], adv_usd: c.adv[s], daily_vol: c.sigma[s] }]));
  const orders = c.orders.map((o) => (o.decision_price === c.closes[o.symbol]
    ? { symbol: o.symbol, side: o.side, qty: o.qty, type: "market", reduce_only: o.reduce_only }
    : { symbol: o.symbol, side: o.side, qty: o.qty, type: "limit", limit_price: o.decision_price, reduce_only: o.reduce_only }));
  return checkOrders({ orders, market, account: { equity: c.equity, positions: c.positions }, limits: c.limits });
}

test("verdicts and reasons match AlphaForge's checker on 5,000 random batches; systemic breaches agree", () => {
  let orders = 0;
  let rejected = 0;
  let systemic = 0;
  const crashes = FIX.cases.filter((c) => c.error === "cost_model_misuse").length;
  for (const c of FIX.cases) {
    if (c.error === "cost_model_misuse") continue;
    const out = fromCase(c);
    if (c.systemic) {
      assert.equal(out.systemic_breach, true, "AlphaForge halted on a systemic breach");
      systemic += 1;
      continue;
    }
    assert.equal(out.systemic_breach, false);
    c.verdicts.forEach((v, i) => {
      orders += 1;
      if (!v.accepted) rejected += 1;
      assert.equal(out.rows[i].accepted, v.accepted, `order ${i}: ${JSON.stringify(out.rows[i].reasons)} vs ${JSON.stringify(v.reasons)}`);
      assert.deepEqual([...out.rows[i].reasons].sort(), v.reasons, `order ${i}`);
    });
  }
  assert.equal(FIX.cases.length, 5000);
  assert.ok(rejected > 5000 && systemic > 50, `the fixtures exercise rejections (${rejected}) and breaches (${systemic})`);
  assert.ok(crashes <= 5, `AlphaForge cost-model crashes on large reduce-only orders: ${crashes}, handled here without raising`);
  assert.ok(orders > 15000);
});

test("the one AlphaForge crash case (a reduce-only order above 5% of ADV) is checked here without raising", () => {
  for (const c of FIX.cases.filter((x) => x.error === "cost_model_misuse")) {
    const out = fromCase(c);
    const big = out.rows.find((r) => r.reduce_only && r.cost?.regime === "refused");
    assert.ok(big, "a reduce-only order beyond the law's range is present");
    assert.equal(big.cost.impact_bps_base, null, "no impact number beyond 5% of ADV");
    assert.ok(out.not_modelled.some((s) => /above 5% of ADV/.test(s)));
  }
});

test("limits can only be tightened: the smaller cap, the shared symbols, never a looser request", () => {
  const base = { max_position_frac: 0.1, max_gross: 1, allowed_symbols: ["AAPL", "MSFT"] };
  assert.deepEqual(effectiveLimits(base, { max_position_frac: 0.5, allowed_symbols: ["AAPL", "TSLA"] }), { max_position_frac: 0.1, max_gross: 1, allowed_symbols: ["AAPL"] });
  assert.deepEqual(effectiveLimits(base, { max_position_frac: 0.05 }).max_position_frac, 0.05);
  assert.deepEqual(effectiveLimits(undefined, { max_gross: 2 }), { max_gross: 2 });
  assert.throws(() => effectiveLimits({}, { max_gross: -1 }), /max_gross from the request must be a number/);
});

const MARKET = { AAPL: { price: 100, bid: 99.99, ask: 100.01, adv_usd: 5e9, daily_vol: 0.015, as_of: "2026-09-28T14:30:00Z" } };
const buy = (extra = {}) => ({ symbol: "AAPL", side: "buy", qty: 100, type: "market", ...extra });
const reasons = (input) => checkOrders({ market: MARKET, ...input }).rows.map((r) => r.reasons);

test("each added check refuses with its own reason", () => {
  assert.deepEqual(reasons({ orders: [buy()], kill: { engaged: true } }), [["kill_switch_engaged"]]);
  assert.deepEqual(reasons({ orders: [buy()], limits: { allowed_symbols: ["MSFT"] } }), [["symbol_not_allowed"]]);
  assert.deepEqual(reasons({ orders: [buy()], limits: { allowed_types: ["limit"] } }), [["order_type_not_allowed"]]);
  assert.deepEqual(reasons({ orders: [buy()], market_state: { AAPL: { state: "closed", source: "test" } } }), [["market_closed"]]);
  assert.deepEqual(reasons({ orders: [buy()], market_state: { AAPL: { state: "halted", source: "test" } } }), [["halted"]]);
  // Closed: market, DAY and IOC orders are refused; only a GTC limit may rest until the open.
  const closed = { AAPL: { state: "closed", source: "test" } };
  const limit = (tif) => buy({ type: "limit", limit_price: 100, tif });
  assert.deepEqual(reasons({ orders: [limit("day"), limit("ioc"), limit("gtc"), buy({ tif: "gtc" }), limit()], market_state: closed }), [["market_closed"], ["market_closed"], [], ["market_closed"], ["market_closed"]]);
  assert.deepEqual(reasons({ orders: [limit("gtc")], market_state: { AAPL: { state: "halted", source: "test" } } }), [["halted"]], "a halt refuses even a GTC limit");
  assert.deepEqual(reasons({ orders: [buy({ tif: "fok" })] }), [["inputs_missing"]]);
  assert.deepEqual(reasons({ orders: [buy()], market_state: {} }), [["market_status_unknown"]]);
  assert.deepEqual(reasons({ orders: [buy()], limits: { require_market_state: true } }), [["market_status_unknown"]]);
  assert.deepEqual(reasons({ orders: [buy()], limits: { max_mark_age_seconds: 60 }, as_of: "2026-09-28T14:35:00Z" }), [["stale_mark"]]);
  assert.deepEqual(reasons({ orders: [buy()], limits: { max_order_notional: 5000 } }), [["order_notional_cap"]]);
  assert.deepEqual(reasons({ orders: [buy(), buy()], limits: { max_daily_notional: 15000 } }), [[], ["daily_notional_cap"]]);
  assert.deepEqual(reasons({ orders: [buy({ type: "limit", limit_price: 120 })], limits: { price_collar_frac: 0.05 } }), [["price_collar"]]);
  assert.deepEqual(reasons({ orders: [{ symbol: "ZZZ", side: "buy", qty: 1 }] }), [["inputs_missing"]]);
  for (const r of reasons({ orders: [buy()], kill: { engaged: true }, limits: { allowed_symbols: ["MSFT"] } })[0]) assert.ok(REASONS.includes(r));
});

test("a check without its input is listed as skipped, never passed silently", () => {
  const out = checkOrders({ orders: [buy()], market: { AAPL: { price: 100 } }, limits: { max_position_frac: 0.1, max_adv_frac: 0.01 } });
  const skipped = Object.fromEntries(out.checks_skipped.map((s) => [s.check, s.reason]));
  assert.match(skipped.position_cap, /no account given/);
  assert.match(skipped.adv_participation, /no adv_usd/);
  assert.match(skipped.market_state, /no market state/);
  assert.ok(out.not_modelled.includes("commission: no fee schedule given"));
  assert.ok(out.not_modelled.includes("spread: no bid and ask given"));
  assert.equal(out.rows[0].cost.total_bps_base, null, "nothing supplied, nothing summed");
});

test("costs: stated commission, the quoted spread, and the impact band, summed at the base coefficient", () => {
  const out = checkOrders({ orders: [{ symbol: "AAPL", side: "buy", qty: 1e5, type: "market" }], market: MARKET, fees: { commission_bps: 1, source_url: "https://example.test/fees", as_of: "2026-09-01" } });
  const c = out.rows[0].cost;
  assert.equal(c.notional_usd, 1e7);
  assert.ok(Math.abs(c.commission_bps - 1) < 1e-9);
  assert.ok(Math.abs(c.half_spread_bps - 1) < 1e-9, "a 2-cent spread on a 100 mid is 1 bp each side");
  // 1e7 of 5e9 is 0.2% of ADV: 0.015 * sqrt(0.002) = 6.708 bp at the base coefficient.
  assert.ok(Math.abs(c.impact_bps_base - 0.015 * Math.sqrt(0.002) * 1e4) < 1e-9);
  assert.ok(Math.abs(c.impact_bps_low * 3 - c.impact_bps_high) < 1e-9);
  assert.equal(c.regime, "ok");
  assert.ok(Math.abs(c.total_bps_base - (1 + 1 + c.impact_bps_base)) < 1e-9);
});

test("a systemic breach refuses opening orders, even ones the caps passed, but still lets a reduce-only order de-risk", () => {
  // 2,000 shares at 100 is 200,000 of stock on 100,000 of equity, over a gross cap of 1. A plain
  // (not reduce-only) sale of 1,500 passes every cap on the working book, but with opening orders
  // dropped the book is still 150,000 after the reduce-only sale of 500: the positions are wrong.
  const out = checkOrders({
    orders: [{ symbol: "AAPL", side: "sell", qty: 500, type: "market", reduce_only: true }, { symbol: "AAPL", side: "sell", qty: 1000, type: "market" }, buy({ qty: 10 })],
    market: MARKET,
    account: { equity: 100000, positions: { AAPL: 2000 } },
    limits: { max_gross: 1, max_position_frac: 5 },
  });
  assert.equal(out.systemic_breach, true);
  assert.deepEqual(out.rows.map((r) => [r.accepted, r.reasons]), [[true, []], [false, ["systemic_breach"]], [false, ["systemic_breach"]]]);
});

test("a walked book is reported beside the modelled cost", () => {
  const out = checkOrders({ orders: [buy({ qty: 150 })], market: { AAPL: { ...MARKET.AAPL, book: { asks: [[100.01, 100], [100.05, 100]], bids: [] } } } });
  assert.equal(out.walked_book[0].levels_used, 2);
  assert.equal(out.walked_book[0].book_exhausted, false);
  assert.ok(Math.abs(out.walked_book[0].vwap - (100.01 * 100 + 100.05 * 50) / 150) < 1e-9);
});
