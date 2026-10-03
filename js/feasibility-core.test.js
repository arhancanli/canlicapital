import assert from "node:assert/strict";
import test from "node:test";

import { BROKER_FACTS, FACTS_CHECKED, checkFeasibility, impactBps } from "./feasibility-core.js";

const base = {
  broker: "alpaca",
  asset_class: "us_equity",
  account: "margin",
  capital_usd: 100000,
  orders_per_rebalance: 20,
  rebalances_per_year: 12,
  turnover_per_year: 4,
  adv_usd: 50_000_000,
  daily_volatility: 0.02,
};

const check = (out, name) => out.checks.find((c) => c.name === name);

test("square-root impact: coefficient x daily vol x sqrt(participation), in bps", () => {
  assert.equal(impactBps({ dailyVolatility: 0.02, participation: 0.01, coefficient: 1 }), 20);
  assert.ok(Math.abs(impactBps({ dailyVolatility: 0.02, participation: 0.0004, coefficient: 0.5 }) - 2) < 1e-12);
});

test("a small monthly equity strategy at Alpaca is feasible, and the day-trading note reflects the 2026 rule", () => {
  const out = checkFeasibility(base);
  assert.equal(out.verdict, "feasible on these checks");
  assert.equal(out.plan.orders_per_year, 240);
  assert.equal(out.plan.average_order_usd, 1666.67);
  const dt = check(out, "day_trading");
  assert.match(dt.finding, /retired on 4 June 2026/);
  assert.match(dt.finding, /20 October 2027/);
  assert.equal(out.facts_checked, FACTS_CHECKED);
});

test("an order burst over the broker's limit is blocking and says how long to spread it", () => {
  const out = checkFeasibility({ ...base, orders_per_rebalance: 500 });
  const rate = check(out, "order_rate");
  assert.equal(rate.status, "blocking");
  assert.equal(rate.limit_per_minute, BROKER_FACTS.alpaca.orders_per_minute);
  assert.match(rate.finding, /spread each rebalance over at least 3 minutes/);
  assert.equal(out.verdict, "not feasible as specified");
  assert.equal(check(checkFeasibility({ ...base, orders_per_rebalance: 500, minutes_per_rebalance: 3 }), "order_rate").status, "warning");
});

test("copies of the same strategy crowd the book: participation scales with copies and impact with their square root", () => {
  const one = checkFeasibility(base);
  const many = checkFeasibility({ ...base, copies: 100 });
  const p1 = check(one, "participation").participation;
  const p100 = check(many, "participation").participation;
  assert.ok(Math.abs(p100 / p1 - 100) < 1e-2);
  const i1 = check(one, "market_impact").impact_bps_per_order;
  const i100 = check(many, "market_impact").impact_bps_per_order;
  assert.ok(Math.abs(i100 / i1 - 10) < 0.02);
  assert.equal(check(many, "market_impact").crowding_multiplier, 10);
});

test("capacity is where fees plus impact, times turnover, equal the expected gross return", () => {
  const input = { ...base, expected_gross_return: 0.08, spread_and_fees_bps: 2 };
  const out = checkFeasibility(input);
  const cap = check(out, "capacity").capacity_usd;
  // At the capacity, the annual cost drag equals the edge.
  const atCap = checkFeasibility({ ...input, capital_usd: cap });
  assert.ok(Math.abs(check(atCap, "market_impact").annual_cost_drag - 0.08) < 1e-3);
  assert.equal(check(atCap, "capacity").status, "warning");
  assert.equal(check(checkFeasibility({ ...input, capital_usd: cap * 2 }), "capacity").status, "blocking");
});

test("fees that already exceed the edge are blocking before any impact", () => {
  const out = checkFeasibility({ ...base, expected_gross_return: 0.01, spread_and_fees_bps: 50 });
  assert.equal(check(out, "capacity").status, "blocking");
  assert.match(check(out, "capacity").finding, /consume the expected gross return/);
});

test("a cash account rebalancing intraday is warned about T+1 settlement", () => {
  const out = checkFeasibility({ ...base, account: "cash", rebalances_per_year: 2520 });
  assert.equal(check(out, "settlement").status, "warning");
  assert.match(check(out, "settlement").finding, /settle T\+1/);
});

test("every broker fact names a source, and unknown brokers ask for the limit instead of guessing", () => {
  for (const [key, facts] of Object.entries(BROKER_FACTS)) {
    if (key !== "other") assert.ok(facts.sources.length > 0 && facts.sources.every((s) => s.startsWith("https://")), key);
  }
  const out = checkFeasibility({ ...base, broker: "other" });
  assert.equal(check(out, "order_rate").status, "unknown");
  assert.equal(check(checkFeasibility({ ...base, broker: "other", orders_per_minute_limit: 10 }), "order_rate").status, "blocking");
  assert.throws(() => checkFeasibility({ ...base, broker: "robinhood" }), /broker must be one of alpaca, ibkr, other/);
});
