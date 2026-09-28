// size_position: the position a stated budget allows on one side, lot-rounded and never above a
// cap, and the orders from the current position that reach it. Local only: it takes the trader's
// book, and the caps from the call can only tighten the trader's limits file.
import { effectiveLimits } from "./core/js/pretrade-core.js";
import { sizePosition } from "./core/js/sizing-core.js";
import { limitsDigest } from "./check-orders.mjs";
import { z } from "zod";

export const SIZE_LIMITS = Object.freeze([
  "A size computed from the budget, caps and prices stated; the trade is the trader's decision. Not investment advice.",
  "one_day_move_1sd_usd is the position times daily volatility, a normal approximation; real moves have fatter tails.",
]);

const pos = z.number().positive().finite();
const nonNeg = z.number().nonnegative().finite();

export const sizePositionInput = z.object({
  side: z.enum(["buy", "sell"]),
  asset_class: z.enum(["us_equity", "crypto_spot"]),
  equity: pos,
  price: pos,
  vol: z.object({ daily: pos.optional(), annual: pos.optional() }).strict().refine((v) => v.daily !== undefined || v.annual !== undefined, "give daily or annual"),
  budget: z.object({
    method: z.enum(["vol_target", "risk_per_trade", "fixed_fraction"]),
    annual_vol: pos.optional(),
    risk_frac: pos.max(1).optional(),
    stop_distance_frac: pos.max(1).optional(),
    fraction: pos.optional(),
  }).strict(),
  caps: z.object({ max_position_frac: nonNeg.optional(), max_gross: nonNeg.optional(), max_net: nonNeg.optional(), max_adv_frac: nonNeg.optional() }).strict().optional(),
  book: z.object({ gross_usd: nonNeg, net_usd: z.number().finite(), current_qty: z.number().finite() }).strict().optional(),
  adv_usd: pos.optional(),
  lot_size: pos,
  min_notional: nonNeg.optional(),
  drawdown: z.object({ current_dd: nonNeg.max(0.999999), half_at: pos, flat_at: pos, state: z.enum(["normal", "half", "flat"]).optional() }).strict().optional(),
}).strict();

const num = { type: "number" };
const oneOf = (...values) => ({ type: "string", enum: values });
export const SIZE_POSITION_JSON = Object.freeze({
  type: "object",
  properties: {
    side: oneOf("buy", "sell"),
    asset_class: oneOf("us_equity", "crypto_spot"),
    equity: num,
    price: num,
    vol: { type: "object", description: "sd of returns, fractions", properties: { daily: num, annual: num } },
    budget: { type: "object", description: "vol_target needs annual_vol; risk_per_trade risk_frac and stop_distance_frac; fixed_fraction fraction", properties: { method: oneOf("vol_target", "risk_per_trade", "fixed_fraction"), annual_vol: num, risk_frac: num, stop_distance_frac: num, fraction: num }, required: ["method"] },
    caps: { type: "object", properties: { max_position_frac: num, max_gross: num, max_net: num, max_adv_frac: num } },
    book: { type: "object", properties: { gross_usd: num, net_usd: num, current_qty: num }, required: ["gross_usd", "net_usd", "current_qty"] },
    adv_usd: num,
    lot_size: num,
    min_notional: num,
    drawdown: { type: "object", properties: { current_dd: num, half_at: num, flat_at: num, state: oneOf("normal", "half", "flat") }, required: ["current_dd", "half_at", "flat_at"] },
  },
  required: ["side", "asset_class", "equity", "price", "vol", "budget", "lot_size"],
});

export const SIZE_POSITION_DESCRIPTION = "Computes the position your budget allows on one side, lot-rounded and never above your caps (fractions of equity; your limits file is the ceiling), with the orders from your current position (book gross and net include it) and the cap that binds. A drawdown state halves or zeroes the budget.";

export const SIZE_POSITION_OUTPUT = z.looseObject({
  position_qty: z.number().optional(),
  orders: z.array(z.unknown()).optional(),
  binding_constraint: z.string().nullable().optional(),
  constraints: z.array(z.unknown()).optional(),
  limits: z.array(z.string()).optional(),
}).describe("position_qty is the signed position after the orders; binding_constraint names the limit that set it; constraints give each limit's maximum notional and the headroom left.");

const round = (x, places) => (x === null || x === undefined ? null : Number(x.toFixed(places)));

/** Size with the trader's limits file as the ceiling on every cap. */
export function runSizePosition(input, { baseLimits = {} } = {}) {
  const caps = effectiveLimits(baseLimits, input.caps ?? {});
  const out = sizePosition({ ...input, caps });
  const sizingCaps = Object.fromEntries(["max_position_frac", "max_gross", "max_net", "max_adv_frac", "require_drawdown_state"].filter((k) => caps[k] !== undefined).map((k) => [k, caps[k]]));
  return {
    side: input.side,
    position_qty: out.position_qty,
    position_usd: round(out.position_usd, 2),
    pct_equity: round(out.pct_equity, 4),
    orders: out.orders,
    binding_constraint: out.binding_constraint,
    constraints: out.constraints.map((c) => ({ name: c.name, max_usd: round(c.max_usd, 2), headroom_usd: round(c.headroom_usd, 2) })),
    budget_usd: round(out.budget_usd, 2),
    ...(out.drawdown ? { drawdown: out.drawdown } : {}),
    one_day_move_1sd_usd: round(out.one_day_move_1sd_usd, 2),
    ...(out.impact ? { impact: { regime: out.impact.regime, low_bps: round(out.impact.low_bps, 3), base_bps: round(out.impact.base_bps, 3), high_bps: round(out.impact.high_bps, 3) } } : {}),
    effective_caps: sizingCaps,
    limits_digest: limitsDigest(caps),
    not_modelled: out.not_modelled,
    notes: out.notes,
    limits: SIZE_LIMITS,
  };
}
