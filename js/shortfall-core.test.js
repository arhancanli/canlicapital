import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";

import { bootstrapInterval, measureShortfall, seededRandom, stationaryIndices } from "./shortfall-core.js";

const order = (extra = {}) => ({ id: "o1", side: "buy", qty: 100, decision_price: 100, arrival_mid: 101, horizon_price: 104, fills: [{ qty: 60, price: 102, fee: 6 }], ...extra });
const run = (orders, extra = {}) => measureShortfall({ orders, ...extra });
const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test("hand-computed partial fill: 60 delay + 60 execution + 160 opportunity + 6 fees = 286 USD", () => {
  const result = run([order()]);
  assert.deepEqual(result.aggregate, { decision_notional_usd: 10000, delay_bps: 60, execution_bps: 60, opportunity_bps: 160, fees_bps: 6, price_cost_bps: 280, total_bps: 286, fill_rate_by_count: 1, fill_rate_by_notional: 0.6 });
  assert.equal(result.rows[0].total_usd, 286);
  assert.equal(run([order()], { backtest_cost_bps: 20 }).excess_over_assumption_bps, 266);
});

test("buy/sell mirror negates price costs, preserves fees, and uses all fills", () => {
  const buy = order({ fills: [{ qty: 20, price: 101, fee: 2 }, { qty: 40, price: 102.5, fee: 4 }] });
  const a = run([buy]).aggregate, b = run([{ ...buy, side: "sell" }]).aggregate;
  for (const key of ["delay_bps", "execution_bps", "opportunity_bps", "price_cost_bps"]) near(a[key], -b[key]);
  assert.equal(a.fees_bps, b.fees_bps);
  near(a.total_bps + b.total_bps, 12);
});

test("unfilled orders need a horizon; fully filled orders do not invent opportunity cost", () => {
  assert.equal(run([order({ fills: [] })]).aggregate.total_bps, 400);
  const full = run([order({ fills: [{ qty: 100, price: 102, fee: 0 }], horizon_price: undefined })]);
  assert.equal(full.aggregate.opportunity_bps, 0);
  const missing = run([order({ horizon_price: undefined })]);
  assert.deepEqual(missing.excluded, [{ id: "o1", reason: "no_price" }]);
  assert.equal(missing.aggregate.total_bps, null);
  assert.equal(missing.aggregate.fill_rate_by_notional, null);
});

test("a missing fee never becomes zero; absent arrival keeps the split unknown and price cost measurable", () => {
  const missing = run([order({ arrival_mid: undefined, fills: [{ qty: 60, price: 102 }] })]);
  assert.equal(missing.aggregate.delay_bps, null);
  assert.equal(missing.aggregate.execution_bps, null);
  assert.equal(missing.aggregate.fees_bps, null);
  assert.equal(missing.aggregate.total_bps, null);
  assert.equal(missing.aggregate.price_cost_bps, 280);
  assert.equal(missing.not_measurable.length, 2);
  assert.equal(run([order({ fills: [{ qty: 60, price: 102, fee: -2 }] })]).aggregate.fees_bps, -2, "a stated rebate is a negative fee");
});

test("arrival and at-open comparisons keep the decision-notional denominator explicit", () => {
  const result = run([order({ open_price: 100.5 })], { benchmark: "arrival" });
  assert.equal(result.aggregate.delay_bps, 0);
  assert.equal(result.aggregate.execution_bps, 60);
  assert.equal(result.aggregate.opportunity_bps, 120);
  assert.equal(result.aggregate.total_bps, 186);
  assert.equal(run([order({ open_price: 100.5 })], { benchmark: "at_open" }).aggregate.total_bps, 236);
  assert.equal(run([order({ arrival_mid: undefined })], { benchmark: "arrival" }).orders, 0);
});

test("zero quantity, missing decision price and possible splits are counted, never hidden", () => {
  const result = run([
    order({ id: "zero", qty: 0, fills: [] }), order({ id: "missing", decision_price: undefined }),
    order({ id: "split", horizon_price: 50 }), order({ id: "large", horizon_price: 130.01 }),
    order({ id: "boundary", horizon_price: 130 }),
  ]);
  assert.deepEqual(result.excluded.map((row) => row.reason), ["zero_quantity", "no_price", "implausible_move", "implausible_move"]);
  assert.equal(result.orders, 1);
  assert.equal(result.orders_read, 5);
});

test("duplicate IDs, overfills, invalid numbers and time travel refuse with the field named", () => {
  assert.throws(() => run([order(), order()]), /orders\.1\.id/);
  assert.throws(() => run([order({ fills: [{ qty: 101, price: 102, fee: 1 }] })]), /quantity exceeds/);
  assert.throws(() => run([order({ fills: [{ qty: 60, price: NaN, fee: 1 }] })]), /fills\.0/);
  assert.throws(() => run([order({ decision_ts: "2026-10-01T12:00:00Z", fills: [{ qty: 60, price: 102, ts: "2026-10-01T11:59:59Z" }] })]), /must not precede/);
  assert.throws(() => run([order({ qty: 1e308, fills: [] })]), /derived monetary values must be finite/);
  assert.throws(() => run([order({ fills: [{ qty: 60, price: 102, fee: 1e308 }] })]), /derived monetary values must be finite/);
  assert.throws(() => run([order({ qty: Number.MIN_VALUE, decision_price: Number.MIN_VALUE, arrival_mid: undefined, horizon_price: Number.MIN_VALUE, fills: [] })]), /notional must be representable/);
});

test("1,000 randomized partial/full/unfilled orders satisfy the independent cash-flow identity", () => {
  const random = seededRandom(20261001);
  const orders = Array.from({ length: 1000 }, (_, i) => {
    const price = 10 + 200 * random(), qty = 1 + 100 * random(), filled = qty * random();
    return { id: String(i), side: i % 2 ? "buy" : "sell", qty, decision_price: price, arrival_mid: price * (0.97 + 0.06 * random()), horizon_price: price * (0.97 + 0.06 * random()), fills: [{ qty: filled, price: price * (0.97 + 0.06 * random()), fee: random() }] };
  });
  // Cash-flow definition: actual cash paid/received plus the unfilled hypothetical trade, less
  // the cost of completing every order at decision. This does not reuse the core's decomposition.
  let dollars = 0, capital = 0;
  for (const o of orders) {
    const fill = o.fills[0];
    const cash = fill.qty * fill.price + (o.qty - fill.qty) * o.horizon_price;
    dollars += (o.side === "buy" ? 1 : -1) * (cash - o.qty * o.decision_price) + fill.fee;
    capital += o.qty * o.decision_price;
  }
  const result = run(orders).aggregate;
  near(result.total_bps, dollars / capital * 10000, 1e-10);
  near(result.delay_bps + result.execution_bps + result.opportunity_bps + result.fees_bps, result.total_bps);
});

test("three recorded arch 8.0.0 stationary-bootstrap cases agree exactly on indices and ratio-percentile intervals", () => {
  const fixture = JSON.parse(gunzipSync(readFileSync(new URL("../mcp-execution/test/fixtures/shortfall-arch.json.gz", import.meta.url))));
  assert.equal(fixture.oracle, "arch 8.0.0 StationaryBootstrap");
  for (const c of fixture.cases) {
    for (const draw of c.draws) assert.deepEqual(stationaryIndices(draw.starts, draw.uniforms, 1 / c.block_length), draw.indices);
    const stream = c.draws.flatMap((draw) => [...draw.starts.map((i) => (i + 0.5) / c.costs.length), ...draw.uniforms]);
    let i = 0;
    const interval = bootstrapInterval(c.costs, c.notionals, { seed: c.seed, block_length: c.block_length, resamples: c.draws.length }, () => stream[i++]);
    near(interval.low_bps, c.low_bps, 1e-10);
    near(interval.high_bps, c.high_bps, 1e-10);
    assert.equal(i, stream.length);
  }
});

test("seeded bootstrap is repeatable, refuses unbounded work, and uses one fee basis across all orders", () => {
  const a = order(), b = order({ id: "o2", fills: [{ qty: 100, price: 103 }] });
  const result = run([a, b], { bootstrap: {}, seed: 7 });
  assert.deepEqual(result, run([a, b], { bootstrap: {}, seed: 7 }));
  assert.equal(result.bootstrap_ci.basis, "price_cost_excluding_fees");
  assert.deepEqual(result.bootstrap_ci, { ...bootstrapInterval([280, 300], [10000, 10000], { seed: 7 }), basis: "price_cost_excluding_fees" });
  assert.throws(() => bootstrapInterval([1, 2], [1, 2], { block_length: 3 }), /block_length/);
  assert.throws(() => bootstrapInterval(Array(10000).fill(1), Array(10000).fill(1), { resamples: 1999 }), /5,000,000/);
  assert.equal(run([a], { bootstrap: {} }).bootstrap_ci, null);
});
