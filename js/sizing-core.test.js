// js/sizing-core.test.js
// Sizing against AlphaForge's own lot rounding, drawdown ladder and vol-target overlay (recorded by
// scripts/research/execution-parity/alphaforge_sizing.py), and against a check of the caps that does
// not share the core's arithmetic.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { ceilToLot, discretizeOne, floorToLot, ladderStep, sizePosition, volTargetScale } from "./sizing-core.js";

const FIX = JSON.parse(gunzipSync(readFileSync(new URL("../mcp-execution/test/fixtures/alphaforge-sizing.json.gz", import.meta.url))).toString("utf8"));
const same = (got, want, what) => assert.ok(Math.abs(got - want) <= 1e-12 * Math.max(1, Math.abs(want)), `${what}: ${got} vs AlphaForge ${want}`);

test("lot rounding, flips and minimum sizes match AlphaForge's weights_to_orders on 3,000 cases", () => {
  let orders = 0;
  let reduceOnly = 0;
  let flips = 0;
  for (const c of FIX.discretize) {
    // AlphaForge marks equity as cash + qty * close from a ledger; the recorder set cash = equity - qty * close.
    const equity = c.qty_current !== 0 ? (c.equity - c.qty_current * c.close) + c.qty_current * c.close : c.equity;
    const got = discretizeOne({ targetWeight: c.target_weight, equity, qtyCurrent: c.qty_current, close: c.close, lotSize: c.lot_size, minQty: c.min_qty, minNotional: c.min_notional, noTradeBand: c.no_trade_band });
    if (c.error === "zero_qty_order") {
      // AlphaForge raises building a zero-lot opening leg; here that leg is simply not emitted.
      assert.ok(got.every((o) => o.qty > 0));
      assert.ok(got.length <= 1 && got.every((o) => o.reduce_only), "only the close of the flip remains");
      continue;
    }
    assert.equal(got.length, c.orders.length, JSON.stringify(c));
    got.forEach((o, i) => {
      assert.equal(o.side, c.orders[i].side);
      assert.equal(o.reduce_only, c.orders[i].reduce_only);
      same(o.qty, c.orders[i].qty, "qty");
    });
    orders += got.length;
    reduceOnly += got.filter((o) => o.reduce_only).length;
    if (got.length === 2) flips += 1;
  }
  assert.ok(orders > 1500 && reduceOnly > 500 && flips > 50, `the fixtures exercise orders (${orders}), reduce-only (${reduceOnly}) and flips (${flips})`);
  // The README states these counts: 2,996 of 3,000 match; 4 are AlphaForge's zero-lot raise.
  assert.deepEqual([FIX.discretize.length, FIX.discretize.filter((c) => c.error === "zero_qty_order").length], [3000, 4]);
});

test("one ladder step from the trader's state matches AlphaForge's DrawdownLadder on 60,000 updates", () => {
  let checked = 0;
  let rearms = 0;
  let transitions = 0;
  for (const path of FIX.ladder) {
    for (const [before, dd, after, multiplier] of path.steps) {
      if (before === "flat" && after === "normal") {
        // A time-based rearm: the live class counted bars in the halt. A stateless step cannot, so
        // it stays flat until the trader reports the rearm.
        assert.equal(ladderStep("flat", Math.max(0, dd), path).state, "flat");
        rearms += 1;
        continue;
      }
      const got = ladderStep(before, Math.max(0, dd), path);
      assert.equal(got.state, after, `${before} at dd ${dd} (half ${path.half_at}, flat ${path.flat_at})`);
      assert.equal(got.multiplier, multiplier);
      checked += 1;
      if (before !== after) transitions += 1;
    }
  }
  assert.equal(checked + rearms, 60000);
  assert.equal(rearms, 111, "the README states 59,889 of 60,000 match and 111 are timed rearms");
  assert.ok(transitions > 1500 && rearms > 5, `the paths exercise transitions (${transitions}) and rearms (${rearms})`);
});

test("the vol-target overlay matches AlphaForge's on 1,000 cases", () => {
  for (const c of FIX.vol_target) {
    const got = volTargetScale({ w: c.w, sigmaAnn: c.sigma_ann, realizedVolAnn: c.realized_vol_ann, target: c.target, sMax: c.s_max, grossMax: c.gross_max });
    same(got.w_final, c.w_final, "w_final");
    same(got.s, c.s, "s");
  }
});

test("ladder hysteresis: halving at half_at, holding in the release band, flat is absorbing", () => {
  const cfg = { half_at: 0.1, flat_at: 0.2 };
  assert.deepEqual(ladderStep("normal", 0.09, cfg), { state: "normal", multiplier: 1 });
  assert.deepEqual(ladderStep("normal", 0.1, cfg), { state: "half", multiplier: 0.5 });
  assert.deepEqual(ladderStep("half", 0.08, cfg), { state: "half", multiplier: 0.5 }, "0.08 is above the release at 0.075");
  assert.deepEqual(ladderStep("half", 0.07, cfg), { state: "normal", multiplier: 1 });
  assert.deepEqual(ladderStep("half", 0.2, cfg), { state: "flat", multiplier: 0 });
  assert.deepEqual(ladderStep("flat", 0, cfg), { state: "flat", multiplier: 0 });
  assert.throws(() => ladderStep("normal", 0.1, { half_at: 0.2, flat_at: 0.1 }), /0 < half_at < flat_at < 1/);
  assert.throws(() => ladderStep("normal", -0.1, cfg), /current_dd/);
  assert.throws(() => ladderStep("halted", 0.1, cfg), /state must be/);
});

test("lot helpers: an exact multiple stays put; rounding goes the stated way", () => {
  assert.equal(floorToLot(0.30000000000000004, 0.1), 0.30000000000000004);
  assert.equal(floorToLot(123.9, 1), 123);
  assert.equal(ceilToLot(123.1, 1), 124);
  assert.equal(ceilToLot(123, 1), 123);
});

const BASE = { side: "buy", asset_class: "us_equity", equity: 1e6, price: 100, vol: { daily: 0.02 }, lot_size: 1 };

test("the three budgets, from their definitions", () => {
  const caps = { max_position_frac: 1 };
  // Target 10% a year on a 40%-a-year asset: 25% of equity.
  assert.equal(sizePosition({ ...BASE, vol: { annual: 0.4 }, caps, budget: { method: "vol_target", annual_vol: 0.1 } }).budget_usd, 250000);
  // Risk 1% of equity with a 5% stop: 20% of equity.
  assert.equal(sizePosition({ ...BASE, caps, budget: { method: "risk_per_trade", risk_frac: 0.01, stop_distance_frac: 0.05 } }).budget_usd, 200000);
  const fixed = sizePosition({ ...BASE, caps, budget: { method: "fixed_fraction", fraction: 0.12345 } });
  assert.equal(fixed.budget_usd, 123450);
  assert.deepEqual(fixed.orders, [{ side: "buy", qty: 1234, reduce_only: false }], "floored to the lot");
  assert.equal(fixed.binding_constraint, "budget");
  assert.ok(Math.abs(fixed.one_day_move_1sd_usd - 123400 * 0.02) < 1e-6);
  // Daily vol converts to annual with 252 trading days for US equities, 365 for crypto.
  const eq = sizePosition({ ...BASE, caps, budget: { method: "vol_target", annual_vol: 0.1 } }).budget_usd;
  assert.ok(Math.abs(eq - 1e6 * 0.1 / (0.02 * Math.sqrt(252))) < 1e-6);
  const crypto = sizePosition({ ...BASE, asset_class: "crypto_spot", caps, budget: { method: "vol_target", annual_vol: 0.1 } }).budget_usd;
  assert.ok(Math.abs(crypto - 1e6 * 0.1 / (0.02 * Math.sqrt(365))) < 1e-6);
});

test("tightening each cap in turn makes it the named binding constraint", () => {
  const book = { gross_usd: 300000, net_usd: 100000, current_qty: 0 };
  const loose = { max_position_frac: 0.5, max_gross: 2, max_net: 1.5, max_adv_frac: 0.5 };
  const args = { ...BASE, book, adv_usd: 1e7, budget: { method: "fixed_fraction", fraction: 0.4 } };
  assert.equal(sizePosition({ ...args, caps: loose }).binding_constraint, "budget");
  const tight = { max_position_frac: 0.05, max_gross: 0.35, max_net: 0.15, max_adv_frac: 0.001 };
  const expectUsd = { max_position_frac: 50000, max_gross: 50000, max_net: 50000, max_adv_frac: 10000 };
  const names = { max_position_frac: "position_cap", max_gross: "gross_cap", max_net: "net_cap", max_adv_frac: "adv_participation" };
  for (const key of Object.keys(tight)) {
    const out = sizePosition({ ...args, caps: { ...loose, [key]: tight[key] } });
    assert.equal(out.binding_constraint, names[key], key);
    assert.ok(Math.abs(out.position_usd - expectUsd[key]) < 1e-6, `${key}: ${out.position_usd}`);
  }
});

test("the drawdown ladder scales the budget, and flat closes the position", () => {
  const args = { ...BASE, caps: { max_position_frac: 1 }, budget: { method: "fixed_fraction", fraction: 0.2 } };
  const half = sizePosition({ ...args, drawdown: { current_dd: 0.12, half_at: 0.1, flat_at: 0.2 } });
  assert.deepEqual([half.position_usd, half.drawdown], [100000, { state: "half", multiplier: 0.5 }]);
  const flat = sizePosition({ ...args, book: { gross_usd: 50000, net_usd: 50000, current_qty: 500 }, drawdown: { current_dd: 0.05, half_at: 0.1, flat_at: 0.2, state: "flat" } });
  assert.equal(flat.binding_constraint, "drawdown_flat");
  assert.deepEqual(flat.orders, [{ side: "sell", qty: 500, reduce_only: true }]);
  assert.equal(flat.position_qty, 0);
});

test("fail closed: no default caps, a cap without its input, a required drawdown state that is missing", () => {
  const budget = { method: "fixed_fraction", fraction: 0.1 };
  assert.throws(() => sizePosition({ ...BASE, budget, caps: {} }), /max_position_frac is required/);
  assert.throws(() => sizePosition({ ...BASE, budget, caps: { max_position_frac: 0.1, max_gross: 1 } }), /need book/);
  assert.throws(() => sizePosition({ ...BASE, budget, caps: { max_position_frac: 0.1, max_adv_frac: 0.01 } }), /needs adv_usd/);
  assert.throws(() => sizePosition({ ...BASE, budget, caps: { max_position_frac: 0.1, require_drawdown_state: true } }), /require drawdown state/);
  assert.throws(() => sizePosition({ ...BASE, budget, caps: { max_position_frac: 0.1 }, drawdown: { current_dd: 0.1, half_at: 0.3, flat_at: 0.2 } }), /half_at < flat_at/);
  assert.throws(() => sizePosition({ ...BASE, budget: { method: "kelly" }, caps: { max_position_frac: 0.1 } }), /budget.method/);
});

test("ADV caps the opening order, not the position; a flip's reduce-only close is exempt", () => {
  // 1% of a 1,000,000 ADV is 10,000 of order. Holding 100 at 100 (10,000), an add of 10,000 is
  // allowed: the position can reach 20,000.
  const caps = { max_position_frac: 1, max_adv_frac: 0.01 };
  const args = { ...BASE, adv_usd: 1e6, caps, budget: { method: "fixed_fraction", fraction: 0.5 } };
  const add = sizePosition({ ...args, book: { gross_usd: 10000, net_usd: 10000, current_qty: 100 } });
  assert.deepEqual([add.position_qty, add.binding_constraint, add.orders], [200, "adv_participation", [{ side: "buy", qty: 100, reduce_only: false }]]);
  // Short 100 and buying: the close of 100 does not count, and the open leg can be 10,000.
  const flip = sizePosition({ ...args, book: { gross_usd: 10000, net_usd: -10000, current_qty: -100 } });
  assert.deepEqual([flip.position_qty, flip.orders], [100, [{ side: "buy", qty: 100, reduce_only: true }, { side: "buy", qty: 100, reduce_only: false }]]);
});

test("a reduce to meet a cap rounds up to the lot, so the position ends at or under it", () => {
  // 1,000 held at 100 is 100,000; the cap is 95,000. Lots of 7: flooring the 50-share reduce to 49
  // would leave 95,100, above the cap; rounding up to 56 leaves 94,400.
  const out = sizePosition({ ...BASE, lot_size: 7, book: { gross_usd: 100000, net_usd: 100000, current_qty: 1000 }, caps: { max_position_frac: 0.095 }, budget: { method: "fixed_fraction", fraction: 0.5 } });
  assert.deepEqual(out.orders, [{ side: "sell", qty: 56, reduce_only: true }]);
  assert.equal(out.position_usd, 94400);
});

// A seeded generator so the property test is the same on every run.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test("10,000 random cases: a position this sizes never adds exposure past a cap", () => {
  const r = rng(20260930);
  let increased = 0;
  let bound = 0;
  for (let n = 0; n < 10000; n += 1) {
    const equity = 10 ** (4 + r() * 3);
    const price = 10 ** (r() * 4 - 1);
    const lot = [1, 0.1, 0.001, 10][Math.floor(r() * 4)];
    const side = r() < 0.5 ? "buy" : "sell";
    const s = side === "buy" ? 1 : -1;
    const current = r() < 0.4 ? 0 : Math.round(((r() * 2 - 1) * 0.4 * equity) / price / lot) * lot;
    const otherGross = r() * 1.2 * equity;
    const otherNet = (r() * 2 - 1) * otherGross;
    const book = { gross_usd: otherGross + Math.abs(current * price), net_usd: otherNet + current * price, current_qty: current };
    const caps = { max_position_frac: 0.02 + r() * 0.4 };
    if (r() < 0.7) caps.max_gross = 0.5 + r() * 1.5;
    if (r() < 0.7) caps.max_net = 0.2 + r();
    const adv = 10 ** (5 + r() * 4);
    if (r() < 0.5) caps.max_adv_frac = r() * 0.02;
    const budget = [{ method: "fixed_fraction", fraction: r() * 0.6 + 0.001 }, { method: "risk_per_trade", risk_frac: 0.001 + r() * 0.02, stop_distance_frac: 0.01 + r() * 0.2 }, { method: "vol_target", annual_vol: 0.02 + r() * 0.3 }][Math.floor(r() * 3)];
    const drawdown = r() < 0.3 ? { current_dd: r() * 0.3, half_at: 0.1, flat_at: 0.25, state: ["normal", "half", "flat"][Math.floor(r() * 3)] } : undefined;
    const out = sizePosition({ side, asset_class: "us_equity", equity, price, vol: { daily: 0.005 + r() * 0.05 }, lot_size: lot, min_notional: r() < 0.3 ? 10 : 0, book, adv_usd: adv, caps, budget, drawdown });
    const after = out.position_qty;
    const tol = 1e-9 * equity;
    if (out.binding_constraint !== "budget") bound += 1;
    const opened = out.orders.filter((o) => !o.reduce_only).reduce((q, o) => q + o.qty * price, 0);
    const grew = Math.abs(after) > Math.abs(current) + 1e-12 || after * current < 0;
    if (!grew) {
      // A reduce never increases exposure on either side.
      assert.ok(Math.abs(after) <= Math.abs(current) + 1e-12, `case ${n}`);
      continue;
    }
    increased += 1;
    assert.equal(Math.sign(after), s, `case ${n}: exposure grows only on the side asked`);
    const grossAfter = otherGross + Math.abs(after * price);
    const netAfter = otherNet + after * price;
    assert.ok(Math.abs(after * price) <= caps.max_position_frac * equity + tol, `case ${n}: position cap`);
    if (caps.max_gross !== undefined) assert.ok(grossAfter <= caps.max_gross * equity + tol, `case ${n}: gross cap`);
    if (caps.max_net !== undefined) assert.ok(s * netAfter <= caps.max_net * equity + tol, `case ${n}: net cap`);
    // The opening order (an add, or a flip's open leg) is what ADV caps; a close is exempt.
    if (caps.max_adv_frac !== undefined) assert.ok(opened <= caps.max_adv_frac * adv + tol, `case ${n}: ADV`);
    const m = drawdown ? ladderStep(drawdown.state, drawdown.current_dd, drawdown).multiplier : 1;
    assert.ok(Math.abs(after * price) <= m * out.budget_usd + tol, `case ${n}: budget after the ladder`);
  }
  assert.ok(increased > 2000 && bound > 2000, `the cases exercise growth (${increased}) and binding caps (${bound})`);
});
