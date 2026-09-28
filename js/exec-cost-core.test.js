// js/exec-cost-core.test.js
// The cost core against AlphaForge's own outputs (1,000 random cases per function, recorded by
// scripts/research/execution-parity/alphaforge_costs.py from the commit named in the fixture), and
// against its own definitions.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import {
  borrowCarryUsd,
  commissionUsd,
  feeQuote,
  fillPrice,
  halfSpreadFrac,
  impactFrac,
  MAX_ADV_PARTICIPATION,
  onewayCostFrac,
  participationRegime,
  walkBook,
} from "./exec-cost-core.js";

const FIX = JSON.parse(gunzipSync(readFileSync(new URL("../mcp-execution/test/fixtures/alphaforge-costs.json.gz", import.meta.url))).toString("utf8"));
const same = (got, want, what) => assert.ok(Math.abs(got - want) <= 1e-12 * Math.max(1, Math.abs(want)), `${what}: ${got} vs AlphaForge ${want}`);

test("the fixture names the AlphaForge commit it was recorded from, and the same 5% ceiling", () => {
  assert.match(FIX.alphaforge_commit, /^[0-9a-f]{40}$/);
  assert.equal(FIX.max_adv_participation, MAX_ADV_PARTICIPATION);
  for (const kind of ["impact", "fee_quote", "oneway", "fill_price", "walk"]) assert.equal(FIX.cases[kind].length, 1000, kind);
});

test("impact, fees, one-way cost and fill price match AlphaForge on 1,000 cases each", () => {
  for (const c of FIX.cases.impact) same(impactFrac(c.notional, c.adv, c.sigma_daily, c.coef), c.impact_frac, "impact");
  for (const c of FIX.cases.fee_quote) same(feeQuote(c.qty, c.price, c.bps), c.fee_quote, "fee_quote");
  for (const c of FIX.cases.oneway) same(onewayCostFrac({ feeBps: c.fee_bps, halfSpreadBps: c.half_spread_bps, notional: c.notional, adv: c.adv, sigmaDaily: c.sigma_daily, coef: c.coef }), c.oneway_cost_frac, "oneway");
  for (const c of FIX.cases.fill_price) same(fillPrice({ side: c.side, refPrice: c.ref_price, halfSpreadBps: c.half_spread_bps, latencyBps: c.latency_bps, notional: c.notional, adv: c.adv, sigmaDaily: c.sigma_daily, coef: c.coef }), c.fill_price, "fill_price");
});

test("the book walk matches PaperBroker's on 1,000 random books, partial fills included", () => {
  let partial = 0;
  for (const c of FIX.cases.walk) {
    const w = walkBook({ side: c.side, asks: c.asks, bids: c.bids }, c.qty);
    same(w.filled_qty, c.filled_qty, "filled_qty");
    same(w.avg_price, c.avg_price, "avg_price");
    assert.equal(w.book_exhausted, c.book_exhausted);
    assert.equal(w.levels_consumed, c.levels_consumed);
    if (c.book_exhausted) partial += 1;
  }
  assert.ok(partial > 50, `the fixtures exercise exhausted books (${partial})`);
});

test("impact scales with the square root of participation, and the regime boundaries are exact", () => {
  const adv = 1e8;
  assert.equal(impactFrac(4e5, adv, 0.02) / impactFrac(1e5, adv, 0.02), 2);
  assert.equal(participationRegime(0.01 * adv, adv), "ok");
  assert.equal(participationRegime(0.01 * adv + 1, adv), "warn");
  assert.equal(participationRegime(0.05 * adv, adv), "warn");
  assert.equal(participationRegime(0.05 * adv + 1, adv), "refused");
  assert.throws(() => impactFrac(0.05 * adv + 1, adv, 0.02), /not valid above 5%/);
  assert.doesNotThrow(() => impactFrac(0.05 * adv, adv, 0.02));
});

test("hand-computed cases from the documented formulas", () => {
  // 1% of ADV at 2% daily vol, coefficient 1: 0.02 * sqrt(0.01) = 0.002, 20 bp.
  assert.ok(Math.abs(impactFrac(1e6, 1e8, 0.02) - 0.002) < 1e-15);
  // 100 shares at $50 at 5 bp: $2.50.
  assert.ok(Math.abs(feeQuote(100, 50, 5) - 2.5) < 1e-12);
  // Bid 99.9, ask 100.1: half spread 0.1 on a mid of 100, 10 bp.
  assert.ok(Math.abs(halfSpreadFrac(99.9, 100.1) - 0.001) < 1e-15);
  // $1,000,000 short at 3% a year for 30 days, ACT/360: $2,500.
  assert.equal(borrowCarryUsd(1e6, 0.03, 30), 2500);
  // A buy of 150 through asks of 100 at 10.00 and 100 at 10.10: 10.0333...
  const w = walkBook({ side: "buy", asks: [[10, 100], [10.1, 100]] }, 150);
  assert.deepEqual([w.filled_qty, w.levels_consumed, w.book_exhausted], [150, 2, false]);
  assert.ok(Math.abs(w.avg_price - (1000 + 505) / 150) < 1e-12);
});

test("commission is only what the caller states; with no schedule it is not modelled, never assumed", () => {
  assert.equal(commissionUsd(undefined, { side: "buy", qty: 100, price: 50 }), null);
  assert.equal(commissionUsd({ commission_bps: 2 }, { side: "buy", qty: 100, price: 50 }), 1);
  assert.equal(commissionUsd({ per_share_usd: 0.005, min_usd: 1 }, { side: "buy", qty: 100, price: 50 }), 1, "the minimum binds");
  // A sell adds the stated regulatory fees: 0.0000278 of notional and 0.000166 a share.
  const sell = commissionUsd({ commission_bps: 0, sell_fee_rate: 0.0000278, sell_fee_per_share: 0.000166 }, { side: "sell", qty: 1000, price: 20 });
  assert.ok(Math.abs(sell - (20000 * 0.0000278 + 1000 * 0.000166)) < 1e-12);
  assert.equal(commissionUsd({ sell_fee_rate: 0.0000278 }, { side: "buy", qty: 1000, price: 20 }), 0, "buys pay no sell-side fee");
});

test("bad inputs are refused, not coerced", () => {
  assert.throws(() => impactFrac(0, 1e8, 0.02), /notional must be/);
  assert.throws(() => impactFrac(1e5, 1e8, Number.NaN), /sigma_daily must be/);
  assert.throws(() => walkBook({ side: "hold", asks: [] }, 1), /side must be/);
  assert.throws(() => halfSpreadFrac(100.1, 99.9), /ask is below bid/);
  assert.throws(() => feeQuote(1, 0, 1), /price must be/);
});
