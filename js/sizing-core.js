// =============================================================================
// sizing-core.js
// -----------------------------------------------------------------------------
// Turns a budget the trader states into a lot-rounded position and the orders that reach it, never
// above any cap, and names the limit that binds. Behind canli-execution-mcp's size_position. Pure:
// no I/O, no clock, no state; every input is stated by the caller.
//
// Ported from AlphaForge and checked against its outputs (mcp-execution/test/fixtures/
// alphaforge-sizing.json.gz):
//   - discretizeOne: one asset of weights_to_orders (portfolio/discretize.py): the lot grid, the
//     no-trade band, the 1.05 buffer on the minimum notional, reduce-only orders never skipped on
//     minimum sizes, and a flip split into a reduce-only close and an open;
//   - ladderStep: one update of DrawdownLadder (risk/monitors.py), from the state the trader's own
//     ladder is in: NORMAL halves at half_at, any live state flattens at flat_at, HALF releases
//     below 0.75 * half_at;
//   - volTargetScale: the vol_target overlay (portfolio/overlay.py) for one asset.
// What differs, on purpose:
//   - a flip whose opening leg floors to zero lots emits no zero-quantity order (AlphaForge builds
//     one and raises when the instrument has no minimum size);
//   - FLAT stays FLAT here: the live ladder rearms after a count of bars, and a stateless call
//     cannot count them, so the trader passes state "normal" once their own ladder has rearmed;
//   - when a reduce is needed to come back under a cap, it is rounded up to the lot, not down, so
//     the position after it is never above the cap (AlphaForge floors every order).
// =============================================================================

import { IMPACT_BAND, impactFrac, participationRegime } from "./exec-cost-core.js";

export const MIN_NOTIONAL_BUFFER = 1.05;
const LOT_EPS = 1e-9;
export const RELEASE_FRAC = 0.75;
export const LADDER_MULTIPLIER = Object.freeze({ normal: 1, half: 0.5, flat: 0 });
// Trading periods a year, to move between daily and annual volatility.
export const PERIODS_PER_YEAR = Object.freeze({ us_equity: 252, crypto_spot: 365 });

const finitePositive = (x) => Number.isFinite(x) && x > 0;

/** Floor an unsigned quantity to the lot grid, guarded so an exact multiple is not floored a step down. */
export function floorToLot(qtyAbs, lot) {
  return Math.floor(qtyAbs / lot + LOT_EPS) * lot;
}

/** Round an unsigned quantity up to the lot grid, with the same guard. */
export function ceilToLot(qtyAbs, lot) {
  return Math.ceil(qtyAbs / lot - LOT_EPS) * lot;
}

/**
 * One asset of AlphaForge's weights_to_orders: the orders that move qtyCurrent toward
 * targetWeight * equity, as [{side, qty, reduce_only}] (a flip is a close then an open).
 */
export function discretizeOne({ targetWeight, equity, qtyCurrent, close, lotSize, minQty = 0, minNotional = 0, noTradeBand = 0 }) {
  const deltaNotional = targetWeight * equity - qtyCurrent * close;
  if (Math.abs(deltaNotional) < noTradeBand * equity) return [];
  const targetQty = (targetWeight * equity) / close;
  const flips = qtyCurrent !== 0 && targetQty !== 0 && (targetQty > 0) !== (qtyCurrent > 0);
  const orders = [];
  if (flips) {
    const qtyClose = floorToLot(Math.abs(qtyCurrent), lotSize);
    if (qtyClose > 0) orders.push({ side: qtyCurrent > 0 ? "sell" : "buy", qty: qtyClose, reduce_only: true });
    const qtyOpen = floorToLot(Math.abs(targetQty), lotSize);
    if (qtyOpen > 0 && qtyOpen >= minQty && qtyOpen * close >= MIN_NOTIONAL_BUFFER * minNotional) orders.push({ side: targetQty > 0 ? "buy" : "sell", qty: qtyOpen, reduce_only: false });
    return orders;
  }
  const qty = floorToLot(Math.abs(deltaNotional) / close, lotSize);
  if (qty <= 0) return [];
  const reducing = qtyCurrent !== 0 && (deltaNotional > 0) !== (qtyCurrent > 0);
  if (!reducing && (qty < minQty || qty * close < MIN_NOTIONAL_BUFFER * minNotional)) return [];
  return [{ side: deltaNotional > 0 ? "buy" : "sell", qty, reduce_only: reducing }];
}

/** One update of the drawdown ladder, from the trader's current state and drawdown. */
export function ladderStep(state, dd, { half_at: half, flat_at: flat }) {
  if (!(Number.isFinite(half) && Number.isFinite(flat) && half > 0 && half < flat && flat < 1)) throw new RangeError("drawdown needs 0 < half_at < flat_at < 1");
  if (!(Number.isFinite(dd) && dd >= 0 && dd < 1)) throw new RangeError("current_dd must be a fraction from 0 up to 1");
  if (!Object.hasOwn(LADDER_MULTIPLIER, state)) throw new RangeError("drawdown state must be normal, half or flat");
  let next = state;
  if (state !== "flat") {
    if (dd >= flat) next = "flat";
    else if (state === "normal") { if (dd >= half) next = "half"; }
    else if (dd < RELEASE_FRAC * half) next = "normal";
  }
  return { state: next, multiplier: LADDER_MULTIPLIER[next] };
}

/** AlphaForge's vol_target overlay for one asset: the scaled weight and the scale. */
export function volTargetScale({ w, sigmaAnn, realizedVolAnn = 0, target, sMax, grossMax }) {
  const cov = sigmaAnn * sigmaAnn;
  const exAnte = Math.sqrt(Math.max(w * cov * w, 0));
  const sigmaHat = Math.max(exAnte, realizedVolAnn);
  const s = sigmaHat <= 0 ? sMax : Math.min(target / sigmaHat, sMax);
  let wFinal = s * w;
  const gross = Math.abs(wFinal);
  if (gross > grossMax) wFinal *= grossMax / gross;
  return { w_final: wFinal, s };
}

const CAP_ORDER = ["position_cap", "gross_cap", "net_cap", "adv_participation", "budget"];

/**
 * Size one position.
 *   side, asset_class, equity, price, vol: {daily?, annual?}
 *   budget: {method: vol_target, annual_vol} | {method: risk_per_trade, stop_distance_frac, risk_frac}
 *           | {method: fixed_fraction, fraction}
 *   caps: effective caps (max_position_frac required; max_gross, max_net, max_adv_frac, require_drawdown_state)
 *   book?: {gross_usd, net_usd, current_qty} (gross and net include this symbol's current position)
 *   adv_usd?, lot_size, min_qty?, min_notional?, drawdown?: {current_dd, half_at, flat_at, state?}
 */
export function sizePosition({ side, asset_class: assetClass, equity, price, vol = {}, budget, caps = {}, book, adv_usd: adv, lot_size: lot, min_qty: minQty = 0, min_notional: minNotional = 0, drawdown }) {
  if (!["buy", "sell"].includes(side)) throw new RangeError("side must be buy or sell");
  const periods = PERIODS_PER_YEAR[assetClass];
  if (!periods) throw new RangeError("asset_class must be us_equity or crypto_spot");
  for (const [name, x] of [["equity", equity], ["price", price], ["lot_size", lot]]) if (!finitePositive(x)) throw new RangeError(`${name} must be a finite number above 0`);
  if (!finitePositive(caps.max_position_frac)) throw new RangeError("max_position_frac is required, from the call or the limits file; there is no default");
  if ((caps.max_gross !== undefined || caps.max_net !== undefined) && !book) throw new RangeError("max_gross and max_net need book (gross_usd, net_usd, current_qty); without it they cannot be held");
  if (caps.max_adv_frac !== undefined && !finitePositive(adv)) throw new RangeError("max_adv_frac needs adv_usd");
  if (caps.require_drawdown_state && !drawdown) throw new RangeError("the limits require drawdown state; without it no size is given");
  if (!budget || typeof budget !== "object") throw new RangeError("budget is required");
  const sigmaAnn = vol.annual ?? (vol.daily !== undefined ? vol.daily * Math.sqrt(periods) : undefined);
  const sigmaDaily = vol.daily ?? (vol.annual !== undefined ? vol.annual / Math.sqrt(periods) : undefined);

  const ladder = drawdown ? ladderStep(drawdown.state ?? "normal", drawdown.current_dd, drawdown) : { state: null, multiplier: 1 };
  let budgetUsd;
  if (budget.method === "vol_target") {
    if (!finitePositive(budget.annual_vol)) throw new RangeError("vol_target needs annual_vol above 0");
    if (!finitePositive(sigmaAnn)) throw new RangeError("vol_target needs the asset's vol (daily or annual)");
    budgetUsd = equity * Math.abs(volTargetScale({ w: 1, sigmaAnn, target: budget.annual_vol, sMax: Infinity, grossMax: Infinity }).w_final);
  } else if (budget.method === "risk_per_trade") {
    if (!finitePositive(budget.stop_distance_frac) || !finitePositive(budget.risk_frac)) throw new RangeError("risk_per_trade needs stop_distance_frac and risk_frac above 0");
    budgetUsd = (equity * budget.risk_frac) / budget.stop_distance_frac;
  } else if (budget.method === "fixed_fraction") {
    if (!finitePositive(budget.fraction)) throw new RangeError("fixed_fraction needs fraction above 0");
    budgetUsd = equity * budget.fraction;
  } else throw new RangeError("budget.method must be vol_target, risk_per_trade or fixed_fraction");

  const s = side === "buy" ? 1 : -1;
  const current = book?.current_qty ?? 0;
  const curUsd = current * price;
  // The largest position notional on this side each constraint allows.
  const limitsUsd = { position_cap: caps.max_position_frac * equity };
  if (caps.max_gross !== undefined) limitsUsd.gross_cap = caps.max_gross * equity - (book.gross_usd - Math.abs(curUsd));
  if (caps.max_net !== undefined) limitsUsd.net_cap = caps.max_net * equity - s * (book.net_usd - curUsd);
  // ADV caps the order, not the position; a flip's closing leg is reduce-only and exempt, as in check_orders.
  if (caps.max_adv_frac !== undefined) limitsUsd.adv_participation = caps.max_adv_frac * adv + Math.max(0, s * curUsd);
  limitsUsd.budget = ladder.multiplier * budgetUsd;
  let binding = null;
  let allowed = Infinity;
  for (const name of CAP_ORDER) {
    if (limitsUsd[name] === undefined) continue;
    if (limitsUsd[name] < allowed) { allowed = limitsUsd[name]; binding = name; }
  }
  allowed = Math.max(0, allowed);
  if (ladder.multiplier === 0) binding = "drawdown_flat";

  let orders = discretizeOne({ targetWeight: (s * allowed) / equity, equity, qtyCurrent: current, close: price, lotSize: lot, minQty, minNotional });
  // A reduce floored to the lot can leave the position just above the cap it is meant to meet; round
  // such a reduce up instead (never past flat).
  const after = (list) => list.reduce((q, o) => q + (o.side === "buy" ? o.qty : -o.qty), current);
  if (orders.length === 1 && orders[0].reduce_only && Math.abs(after(orders) * price) > allowed * (1 + 1e-12)) {
    orders = [{ ...orders[0], qty: Math.min(Math.abs(current), ceilToLot((Math.abs(curUsd) - allowed) / price, lot)) }];
  }
  const positionQty = after(orders);
  const positionUsd = Math.abs(positionQty * price);
  const notes = [];
  if (!orders.length && Math.abs(allowed - Math.abs(curUsd)) > lot * price) notes.push("no order: the change is below one lot or below the minimum order size");
  if (positionQty !== 0 && Math.sign(positionQty) !== s && orders.length) notes.push("the close left a remainder smaller than one lot on the other side");

  const traded = orders.reduce((n, o) => n + o.qty * price, 0);
  let impact = null;
  const notModelled = ["commission and spread: use check_orders for the full cost of the orders"];
  if (traded > 0 && finitePositive(adv) && finitePositive(sigmaDaily)) {
    const regime = participationRegime(traded, adv);
    impact = regime === "refused"
      ? { regime, low_bps: null, base_bps: null, high_bps: null }
      : { regime, low_bps: impactFrac(traded, adv, sigmaDaily, IMPACT_BAND.low) * 1e4, base_bps: impactFrac(traded, adv, sigmaDaily, IMPACT_BAND.base) * 1e4, high_bps: impactFrac(traded, adv, sigmaDaily, IMPACT_BAND.high) * 1e4 };
  } else if (traded > 0) notModelled.push("impact: needs adv_usd and the asset's vol");

  return {
    position_qty: positionQty,
    position_usd: positionUsd,
    pct_equity: (100 * positionUsd) / equity,
    orders,
    binding_constraint: binding,
    constraints: CAP_ORDER.filter((n) => limitsUsd[n] !== undefined).map((name) => ({ name, max_usd: Math.max(0, limitsUsd[name]), headroom_usd: limitsUsd[name] - positionUsd })),
    budget_usd: budgetUsd,
    drawdown: drawdown ? { state: ladder.state, multiplier: ladder.multiplier } : null,
    one_day_move_1sd_usd: finitePositive(sigmaDaily) ? positionUsd * sigmaDaily : null,
    impact,
    not_modelled: notModelled,
    notes,
  };
}
