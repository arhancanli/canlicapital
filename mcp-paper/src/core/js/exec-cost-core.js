// =============================================================================
// exec-cost-core.js
// -----------------------------------------------------------------------------
// What an order is likely to cost, before it is sent: commission, half the spread, square-root
// market impact and, for a short, borrow carry. Shared by canli-execution-mcp (check_orders,
// size_position, measure_shortfall) and, later, validation's cost ladder, so one number has one
// source. mcp-execution/src/core mirrors this file byte for byte.
//
// Ported from AlphaForge's TransactionCostModel, FeeSchedule and PaperBroker book walk
// (alphaforge/costs/model.py, costs/fees.py, execution/paper.py), and checked against their
// outputs on 1,000 random cases each (mcp-execution/test/fixtures/alphaforge-costs.json.gz). Two
// deliberate differences from the engine:
//   - nothing is assumed: a commission or spread the caller does not supply is reported as not
//     modelled, never filled in with a round number (AlphaForge's 1 bp equity and 2.5 bp spread
//     defaults are its own settings, not facts about a trader's broker);
//   - borrow carry uses the ACT/360 day count of US securities lending, where AlphaForge divides
//     by 365.
//
//   impact_frac = Y * sigma_daily * sqrt(notional / ADV)       (Toth et al. 2011; Almgren 2005)
//
// valid only for small participation: up to 1% of ADV the regime is ok, above 1% it is warn, and
// above 5% the law understates cost, so no impact number is given at all.
// =============================================================================

export const WARN_ADV_PARTICIPATION = 0.01;
export const MAX_ADV_PARTICIPATION = 0.05;
// The coefficient's empirical range, reported as a band of the model's parameter, not as a
// probability interval.
export const IMPACT_BAND = Object.freeze({ low: 0.5, base: 1.0, high: 1.5 });
export const BPS = 1e-4;

const positive = (name, x) => {
  if (!(Number.isFinite(x) && x > 0)) throw new RangeError(`${name} must be a finite number above 0`);
};
const nonNegative = (name, x) => {
  if (!(Number.isFinite(x) && x >= 0)) throw new RangeError(`${name} must be a finite number of 0 or more`);
};

/** Square-root-law impact as a fraction of price; refuses above 5% of ADV instead of extrapolating. */
export function impactFrac(notional, adv, sigmaDaily, coef = IMPACT_BAND.base) {
  positive("notional", notional);
  positive("adv", adv);
  positive("sigma_daily", sigmaDaily);
  nonNegative("impact coefficient", coef);
  if (notional > MAX_ADV_PARTICIPATION * adv) throw new RangeError(`notional is ${((100 * notional) / adv).toFixed(2)}% of ADV; the square-root law is not valid above ${100 * MAX_ADV_PARTICIPATION}% and no impact is estimated`);
  return coef * sigmaDaily * Math.sqrt(notional / adv);
}

/** ok up to 1% of ADV, warn above 1%, refused above 5%. */
export function participationRegime(notional, adv) {
  const share = notional / adv;
  if (share > MAX_ADV_PARTICIPATION) return "refused";
  return share > WARN_ADV_PARTICIPATION ? "warn" : "ok";
}

/** Commission on a fill in quote units: |qty| * price * bps * 1e-4 (FeeSchedule.fee_quote). */
export function feeQuote(qty, price, bps) {
  if (!Number.isFinite(qty)) throw new RangeError("qty must be finite");
  positive("price", price);
  nonNegative("fee bps", bps);
  return Math.abs(qty) * price * bps * BPS;
}

/** One-way cost as a fraction of notional: fee + half spread + impact (no latency; see fillPrice). */
export function onewayCostFrac({ feeBps, halfSpreadBps, notional, adv, sigmaDaily, coef = IMPACT_BAND.base }) {
  nonNegative("fee bps", feeBps);
  nonNegative("half-spread bps", halfSpreadBps);
  return feeBps * BPS + halfSpreadBps * BPS + impactFrac(notional, adv, sigmaDaily, coef);
}

/** Fill price after spread, impact and latency: ref * (1 + sign * (half spread + impact + latency)). */
export function fillPrice({ side, refPrice, halfSpreadBps, latencyBps, notional, adv, sigmaDaily, coef = IMPACT_BAND.base }) {
  positive("ref_price", refPrice);
  const sign = side === "buy" ? 1 : side === "sell" ? -1 : NaN;
  if (Number.isNaN(sign)) throw new RangeError("side must be buy or sell");
  const slip = halfSpreadBps * BPS + impactFrac(notional, adv, sigmaDaily, coef) + latencyBps * BPS;
  return refPrice * (1 + sign * slip);
}

/**
 * Walk a book for a taker order: a buy lifts the asks (cheapest first), a sell hits the bids
 * (highest first). The fill is the size-weighted price of the levels consumed; a book thinner than
 * the order gives a partial fill with book_exhausted, and no liquidity is invented.
 */
export function walkBook({ side, asks = [], bids = [] }, qty) {
  positive("qty", qty);
  const levels = side === "buy" ? asks : side === "sell" ? bids : null;
  if (!levels) throw new RangeError("side must be buy or sell");
  let remaining = qty;
  let notional = 0;
  let filled = 0;
  let consumed = 0;
  for (const [price, size] of levels) {
    if (remaining <= 0) break;
    const take = size < remaining ? size : remaining;
    notional += take * price;
    filled += take;
    remaining -= take;
    consumed += 1;
  }
  return { filled_qty: filled, avg_price: filled > 0 ? notional / filled : 0, requested_qty: qty, book_exhausted: remaining > 0, levels_consumed: consumed };
}

/** Half the quoted spread as a fraction of the mid. */
export function halfSpreadFrac(bid, ask) {
  positive("bid", bid);
  positive("ask", ask);
  if (ask < bid) throw new RangeError("ask is below bid");
  return (ask - bid) / 2 / ((ask + bid) / 2);
}

/**
 * Commission in quote units from a stated schedule: a rate in bps of notional, a per-share charge
 * with an optional minimum, and sell-side regulatory fees (a rate and a per-share charge), each
 * only if the caller states it. Returns null when no schedule is given, so it can be reported as
 * not modelled rather than assumed.
 */
export function commissionUsd(fees, { side, qty, price }) {
  if (!fees) return null;
  const notional = Math.abs(qty) * price;
  let usd = 0;
  if (fees.commission_bps !== undefined) usd += notional * fees.commission_bps * BPS;
  if (fees.per_share_usd !== undefined) usd += Math.abs(qty) * fees.per_share_usd;
  if (fees.min_usd !== undefined) usd = Math.max(usd, fees.min_usd);
  if (side === "sell") {
    if (fees.sell_fee_rate !== undefined) usd += notional * fees.sell_fee_rate;
    if (fees.sell_fee_per_share !== undefined) usd += Math.abs(qty) * fees.sell_fee_per_share;
  }
  return usd;
}

/** Borrow carry for a short in quote units, ACT/360: notional * annual rate * days / 360. */
export function borrowCarryUsd(notional, annualRate, days) {
  nonNegative("notional", notional);
  nonNegative("borrow annual rate", annualRate);
  nonNegative("holding days", days);
  return (notional * annualRate * days) / 360;
}
