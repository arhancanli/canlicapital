// =============================================================================
// pretrade-core.js
// -----------------------------------------------------------------------------
// The pre-trade check behind canli-execution-mcp's check_orders, and the same function its
// place_order runs before anything is sent, so a check can never be more permissive than a
// submit. Pure: no I/O, no clock, no state; every input is stated by the caller.
//
// Ported from AlphaForge's PreTradeChecker (alphaforge/risk/pretrade.py), whose rules it keeps:
// reject, never resize; collect every reason, not the first; judge orders in batch order against a
// working book; reduce-only orders are exempt from the position, gross, net and ADV caps (a trader
// must always be able to de-risk) but never from the price collar or from actually reducing. What
// differs, on purpose:
//   - a check that needs an input the caller did not give is listed in checks_skipped with the
//     reason, never passed silently (AlphaForge rejects for missing ADV or sigma; here the cost
//     and ADV checks are skipped and said to be, so a cost estimate still works without them);
//   - a systemic breach (the book over its gross cap even with every opening order dropped)
//     rejects the opening orders and says so, but still lets reduce-only orders through, where
//     AlphaForge halts everything;
//   - new checks: order and daily notional caps, symbol and order-type allowlists, market state,
//     mark staleness, the kill switch, and an event-window warning.
// Costs come from exec-cost-core; a component the caller did not supply is listed in
// not_modelled, never filled in.
// =============================================================================

import { BPS, commissionUsd, halfSpreadFrac, IMPACT_BAND, impactFrac, participationRegime, walkBook } from "./exec-cost-core.js";

export const REASONS = Object.freeze([
  "price_collar", "position_cap", "gross_cap", "net_cap", "adv_participation", "order_notional_cap",
  "daily_notional_cap", "reduce_only_not_reducing", "symbol_not_allowed", "order_type_not_allowed",
  "market_closed", "halted", "market_status_unknown", "stale_mark", "kill_switch_engaged",
  "systemic_breach", "inputs_missing",
]);

export const LIMIT_KEYS = Object.freeze(["max_position_frac", "max_gross", "max_net", "max_adv_frac", "price_collar_frac", "max_order_notional", "max_daily_notional", "max_mark_age_seconds"]);

/**
 * Limits can only be tightened by a caller: each numeric cap is the smaller of the base (the local
 * limits file) and the request, and each allowlist is their intersection. With no base, the request
 * is the limit. A caller can never loosen what the file sets.
 */
export function effectiveLimits(base = {}, requested = {}) {
  const out = {};
  for (const key of LIMIT_KEYS) {
    const a = base[key];
    const b = requested[key];
    for (const [who, v] of [["limits file", a], ["request", b]]) {
      if (v !== undefined && !(Number.isFinite(v) && v >= 0)) throw new RangeError(`${key} from the ${who} must be a number of 0 or more`);
    }
    if (a !== undefined || b !== undefined) out[key] = a === undefined ? b : b === undefined ? a : Math.min(a, b);
  }
  for (const key of ["allowed_symbols", "allowed_types"]) {
    const a = base[key];
    const b = requested[key];
    if (a !== undefined || b !== undefined) out[key] = [...new Set(a === undefined ? b : b === undefined ? a : a.filter((x) => b.includes(x)))].sort();
  }
  if (base.require_market_state || requested.require_market_state) out.require_market_state = true;
  return out;
}

const finitePositive = (x) => Number.isFinite(x) && x > 0;

/**
 * Judge a batch of orders and estimate each one's cost.
 *   orders: [{symbol, side, qty, type, limit_price?, tif? (day, the default; gtc; ioc), reduce_only?}]
 *   market: {symbol: {price, bid?, ask?, adv_usd?, daily_vol?, as_of?, book?}}
 *   account?: {equity, positions: {symbol: signed qty}, notional_traded_today?}
 *   limits: effective limits (see effectiveLimits)
 *   fees?, holding_days?, borrow_annual_rate?, market_state?: {symbol: {state, source}},
 *   event_risk?: {symbol: {in_window, source, as_of}}, as_of? (ISO), kill?: {engaged, since?}
 */
export function checkOrders({ orders, market = {}, account, limits = {}, fees, holding_days: holdingDays, borrow_annual_rate: borrowRate, market_state: marketState, event_risk: eventRisk, as_of: asOf, kill }) {
  if (!Array.isArray(orders) || !orders.length) throw new RangeError("orders must be a non-empty array");
  const skipped = new Map();
  const skip = (check, reason) => { if (!skipped.has(check)) skipped.set(check, reason); };
  const notModelled = new Set();
  const warnings = [];
  const hasAccount = account && finitePositive(account.equity) && account.positions && typeof account.positions === "object";
  if (account && !hasAccount) throw new RangeError("account needs a positive finite equity and a positions object");
  if (!hasAccount) {
    for (const c of ["position_cap", "gross_cap", "net_cap", "reduce_only_not_reducing"]) skip(c, "no account given (equity and positions)");
  }
  const working = hasAccount ? { ...account.positions } : {};
  const reducedBook = hasAccount ? { ...account.positions } : {};
  const markOf = (symbol) => market[symbol]?.price;
  let dailyUsed = Number(account?.notional_traded_today ?? 0);
  if (limits.max_daily_notional !== undefined && account?.notional_traded_today === undefined) skip("daily_notional_cap:prior", "notional_traded_today not given; only this batch is counted");
  if (!marketState) {
    if (limits.require_market_state) warnings.push("the limits require a market state; none was given, so every order is refused as market_status_unknown");
    else skip("market_state", "no market state given");
  }
  const asOfMs = asOf ? Date.parse(asOf) : Number.NaN;
  if (limits.max_mark_age_seconds !== undefined && !Number.isFinite(asOfMs)) skip("stale_mark", "no as_of given to age the marks against");

  const rows = [];
  const walked = [];
  let systemic = false;
  for (const order of orders) {
    const { symbol, side, qty, type = "market", limit_price: limitPrice, tif = "day", reduce_only: reduceOnly = false } = order;
    const reasons = [];
    const m = market[symbol] ?? {};
    const price = m.price;
    if (typeof symbol !== "string" || !symbol || !["buy", "sell"].includes(side) || !finitePositive(qty) || !["market", "limit"].includes(type) || !["day", "gtc", "ioc"].includes(tif) || (type === "limit" && !finitePositive(limitPrice)) || !finitePositive(price)) {
      reasons.push("inputs_missing");
      rows.push({ symbol: symbol ?? null, side: side ?? null, qty: qty ?? null, accepted: false, reasons, cost: null });
      continue;
    }
    if (kill?.engaged) reasons.push("kill_switch_engaged");
    if (limits.allowed_symbols && !limits.allowed_symbols.includes(symbol)) reasons.push("symbol_not_allowed");
    if (limits.allowed_types && !limits.allowed_types.includes(type)) reasons.push("order_type_not_allowed");
    const state = marketState?.[symbol]?.state;
    if (marketState || limits.require_market_state) {
      // A closed market refuses market, DAY and IOC orders; only a GTC limit may rest until the open.
      if (state === "closed") { if (!(type === "limit" && tif === "gtc")) reasons.push("market_closed"); }
      else if (state === "halted") reasons.push("halted");
      else if (state !== "open") reasons.push("market_status_unknown");
    }
    if (limits.max_mark_age_seconds !== undefined && Number.isFinite(asOfMs)) {
      const markMs = m.as_of ? Date.parse(m.as_of) : Number.NaN;
      if (!Number.isFinite(markMs) || (asOfMs - markMs) / 1000 > limits.max_mark_age_seconds) reasons.push("stale_mark");
    }
    // The collar applies to every order, reduce-only included: a limit far from the mark is a
    // fat-finger or a stale decision, whichever way it points.
    if (limits.price_collar_frac !== undefined && type === "limit" && Math.abs(limitPrice - price) > limits.price_collar_frac * price) reasons.push("price_collar");
    const notional = qty * price;
    if (limits.max_order_notional !== undefined && notional > limits.max_order_notional) reasons.push("order_notional_cap");
    if (limits.max_daily_notional !== undefined && dailyUsed + notional > limits.max_daily_notional) reasons.push("daily_notional_cap");
    if (eventRisk?.[symbol]?.in_window) warnings.push(`${symbol}: in an event window (${eventRisk[symbol].source ?? "source not stated"}); warned, not refused`);

    const signed = (side === "buy" ? 1 : -1) * qty;
    const current = working[symbol] ?? 0;
    const resulting = current + signed;
    if (hasAccount) {
      if (reduceOnly) {
        if (current === 0 || signed * current > 0 || Math.abs(resulting) > Math.abs(current) || resulting * current < 0) reasons.push("reduce_only_not_reducing");
      } else {
        const equity = account.equity;
        if (limits.max_position_frac !== undefined && Math.abs(resulting) * price > limits.max_position_frac * equity) reasons.push("position_cap");
        let gross = 0;
        let net = 0;
        for (const [s, q] of Object.entries({ ...working, [symbol]: resulting })) {
          if (q === 0) continue;
          const mark = markOf(s);
          if (!finitePositive(mark)) { reasons.push("inputs_missing"); break; }
          gross += Math.abs(q * mark);
          net += q * mark;
        }
        if (limits.max_gross !== undefined && gross > limits.max_gross * equity) reasons.push("gross_cap");
        if (limits.max_net !== undefined && Math.abs(net) > limits.max_net * equity) reasons.push("net_cap");
      }
    }
    if (!reduceOnly && limits.max_adv_frac !== undefined) {
      if (finitePositive(m.adv_usd)) { if (notional > limits.max_adv_frac * m.adv_usd) reasons.push("adv_participation"); }
      else skip("adv_participation", "no adv_usd for one or more symbols");
    }

    // Costs, for every order the inputs allow, accepted or not.
    const cost = { notional_usd: notional, adv_pct: null, regime: null, commission_bps: null, half_spread_bps: null, impact_bps_low: null, impact_bps_base: null, impact_bps_high: null, carry_bps: null };
    const commission = commissionUsd(fees, { side, qty, price });
    if (commission === null) notModelled.add("commission: no fee schedule given");
    else cost.commission_bps = (commission / notional) / BPS;
    if (finitePositive(m.bid) && finitePositive(m.ask) && m.ask >= m.bid) cost.half_spread_bps = halfSpreadFrac(m.bid, m.ask) / BPS;
    else notModelled.add("spread: no bid and ask given");
    if (finitePositive(m.adv_usd)) {
      cost.adv_pct = (100 * notional) / m.adv_usd;
      cost.regime = participationRegime(notional, m.adv_usd);
      if (cost.regime !== "refused") {
        if (finitePositive(m.daily_vol)) {
          cost.impact_bps_low = impactFrac(notional, m.adv_usd, m.daily_vol, IMPACT_BAND.low) / BPS;
          cost.impact_bps_base = impactFrac(notional, m.adv_usd, m.daily_vol, IMPACT_BAND.base) / BPS;
          cost.impact_bps_high = impactFrac(notional, m.adv_usd, m.daily_vol, IMPACT_BAND.high) / BPS;
        } else notModelled.add("impact: no daily_vol given");
      } else notModelled.add("impact: above 5% of ADV the square-root law is not valid and no impact is estimated");
    } else notModelled.add("impact: no adv_usd given");
    if (holdingDays !== undefined && borrowRate !== undefined) {
      if (hasAccount) {
        if (resulting < 0 && side === "sell") cost.carry_bps = ((borrowRate * holdingDays) / 360) / BPS;
      } else notModelled.add("borrow carry: needs account positions to know whether a sale opens a short");
    }
    const parts = [cost.commission_bps, cost.half_spread_bps, cost.impact_bps_base, cost.carry_bps].filter((x) => x !== null);
    cost.total_bps_base = parts.length ? parts.reduce((a, b) => a + b, 0) : null;
    cost.total_usd_base = cost.total_bps_base === null ? null : (cost.total_bps_base * BPS) * notional;
    if (m.book) {
      const w = walkBook({ side, asks: m.book.asks, bids: m.book.bids }, qty);
      walked.push({ symbol, vwap: w.avg_price, filled_qty: w.filled_qty, levels_used: w.levels_consumed, book_exhausted: w.book_exhausted });
    }

    const accepted = reasons.length === 0;
    if (accepted) {
      working[symbol] = resulting;
      dailyUsed += notional;
      if (reduceOnly) reducedBook[symbol] = (reducedBook[symbol] ?? 0) + signed;
    }
    rows.push({ symbol, side, qty, reduce_only: reduceOnly, accepted, reasons: [...new Set(reasons)], cost });
  }

  // Systemic breach: with every opening order dropped, the book is still over the gross cap, so the
  // positions themselves are wrong. Opening orders are refused; reduce-only orders may still de-risk.
  if (hasAccount && limits.max_gross !== undefined) {
    let reducedGross = 0;
    for (const [s, q] of Object.entries(reducedBook)) {
      if (q === 0) continue;
      const mark = markOf(s);
      if (finitePositive(mark)) reducedGross += Math.abs(q * mark);
    }
    if (reducedGross > limits.max_gross * account.equity) {
      systemic = true;
      for (const r of rows) {
        if (!r.reduce_only && r.accepted) { r.accepted = false; r.reasons = ["systemic_breach"]; }
      }
    }
  }
  return {
    rows,
    walked_book: walked,
    checks_skipped: [...skipped].map(([check, reason]) => ({ check, reason })),
    systemic_breach: systemic,
    not_modelled: [...notModelled],
    warnings,
  };
}
