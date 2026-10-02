// check_orders: the pre-trade check, shared by the local server and the hosted build. It wraps
// pretrade-core (the same function a later place_order runs before anything is sent, so a check
// can never be more permissive than a submit) with the tool's input schema, the limits digest,
// the fee sources and a compact columnar result. It never places an order and never resizes one.
import { createHash } from "node:crypto";

import { REASONS, checkOrders, effectiveLimits } from "./core/js/pretrade-core.js";
import { BPS } from "./core/js/exec-cost-core.js";
import { canonicalJson } from "./core/scripts/canonical-json.mjs";
import { z } from "zod";

export const IMPACT_BAND_TEXT = "impact coefficient 0.5 / 1.0 / 1.5 (Toth et al. 2011; Almgren et al. 2005): a range of the model's parameter, not a probability interval";
export const FEE_STALE_DAYS = 90;
export const MAX_ORDERS = 200;

// The boundary every result carries.
export const CHECK_LIMITS = Object.freeze([
  "Estimates from the inputs stated and a published model; not a quote from any venue.",
  "Orders are rejected with every reason and never resized. Not investment advice.",
]);

const pos = z.number().positive().finite();
const nonNeg = z.number().nonnegative().finite();
const isoTime = z.string().max(40).refine((s) => Number.isFinite(Date.parse(s)), "must be an ISO 8601 date or date-time");
const level = z.tuple([pos, pos]);

const order = z.object({
  symbol: z.string().min(1).max(32),
  side: z.enum(["buy", "sell"]),
  qty: pos,
  type: z.enum(["market", "limit"]).optional(),
  limit_price: pos.optional(),
  tif: z.enum(["day", "gtc", "ioc"]).optional(),
  reduce_only: z.boolean().optional(),
}).strict();

const quote = z.object({
  price: pos,
  bid: pos.optional(),
  ask: pos.optional(),
  adv_usd: pos.optional(),
  daily_vol: pos.optional(),
  overnight_vol: pos.optional(),
  as_of: isoTime.optional(),
  book: z.object({ bids: z.array(level).max(500).optional(), asks: z.array(level).max(500).optional() }).strict().optional(),
}).strict();

export const limitsSchema = z.object({
  max_position_frac: nonNeg.optional(),
  max_gross: nonNeg.optional(),
  max_net: nonNeg.optional(),
  max_adv_frac: nonNeg.optional(),
  price_collar_frac: nonNeg.optional(),
  max_order_notional: nonNeg.optional(),
  max_daily_notional: nonNeg.optional(),
  max_mark_age_seconds: nonNeg.optional(),
  allowed_symbols: z.array(z.string().min(1).max(32)).max(5000).optional(),
  allowed_types: z.array(z.enum(["market", "limit"])).optional(),
  require_market_state: z.boolean().optional(),
}).strict();
// The trader's limits file also holds policy no call sets: size_position refuses without drawdown
// state when require_drawdown_state is true.
export const limitsFileSchema = limitsSchema.extend({ require_drawdown_state: z.boolean().optional() }).strict();

const baseInput = {
  orders: z.array(order).min(1).max(MAX_ORDERS),
  asset_class: z.enum(["us_equity", "crypto_spot"]),
  market: z.record(z.string().min(1).max(32), quote),
  fees: z.object({
    commission_bps: nonNeg.optional(),
    per_share_usd: nonNeg.optional(),
    min_usd: nonNeg.optional(),
    sell_fee_rate: nonNeg.optional(),
    sell_fee_per_share: nonNeg.optional(),
    source_url: z.string().url().max(500).optional(),
    as_of: isoTime,
  }).strict().refine(fees => ["commission_bps", "per_share_usd", "min_usd", "sell_fee_rate", "sell_fee_per_share"].some(key => fees[key] !== undefined), "fees needs at least one monetary schedule field; omit fees when commission is unknown").optional(),
  execution: z.enum(["immediate", "at_open"]).optional(),
  holding_days: nonNeg.optional(),
  borrow_annual_rate: nonNeg.optional(),
  limits: limitsSchema.optional(),
  market_state: z.record(z.string().min(1).max(32), z.enum(["open", "closed", "halted", "unknown"])).optional(),
  as_of: isoTime.optional(),
};

const account = z.object({
  equity: pos,
  positions: z.record(z.string().min(1).max(32), z.number().finite()),
  notional_traded_today: nonNeg.optional(),
}).strict();

// The strict schemas validate every call; clients are shown the lean ones below.
export const checkOrdersInput = z.object({ ...baseInput, account: account.optional() }).strict();
// Hosted takes no book: a call with account is refused with this sentence.
export const hostedCheckOrdersInput = z.object({ ...baseInput, account: z.never({ error: "the hosted server takes no account or positions; run canli-execution-mcp locally to check orders against your book" }).optional() }).strict();

// What clients are shown: the same fields, types and enums, without the bounds and closed-object
// markers the strict schemas enforce anyway (they cost a model tokens on every turn and tell it
// nothing it needs). A test holds both to the same field names at every level.
const num = { type: "number" };
const str = { type: "string" };
const bool = { type: "boolean" };
const oneOf = (...values) => ({ type: "string", enum: values });
const limitsJson = {
  type: "object",
  description: "tighten only: caps are fractions of equity or USD",
  properties: {
    ...Object.fromEntries(["max_position_frac", "max_gross", "max_net", "max_adv_frac", "price_collar_frac", "max_order_notional", "max_daily_notional", "max_mark_age_seconds"].map((k) => [k, num])),
    allowed_symbols: { type: "array", items: str },
    allowed_types: { type: "array", items: oneOf("market", "limit") },
    require_market_state: bool,
  },
};
const baseJson = {
  orders: { type: "array", items: { type: "object", properties: { symbol: str, side: oneOf("buy", "sell"), qty: num, type: oneOf("market", "limit"), limit_price: num, tif: oneOf("day", "gtc", "ioc"), reduce_only: bool }, required: ["symbol", "side", "qty"] } },
  asset_class: oneOf("us_equity", "crypto_spot"),
  market: {
    type: "object",
    description: "per symbol; vols are sd of returns as fractions (0.02 = 2%)",
    additionalProperties: { type: "object", properties: { price: num, bid: num, ask: num, adv_usd: num, daily_vol: num, overnight_vol: num, as_of: str, book: { type: "object", description: "bids, asks: [[price, qty]], best first", properties: { bids: { type: "array" }, asks: { type: "array" } } } }, required: ["price"] },
  },
  fees: { type: "object", description: "your broker's schedule; as_of is the date read", properties: { commission_bps: num, per_share_usd: num, min_usd: num, sell_fee_rate: num, sell_fee_per_share: num, source_url: str, as_of: str }, required: ["as_of"] },
  execution: oneOf("immediate", "at_open"),
  holding_days: num,
  borrow_annual_rate: num,
  limits: limitsJson,
  market_state: { type: "object", additionalProperties: oneOf("open", "closed", "halted", "unknown") },
  as_of: str,
};
const required = ["orders", "asset_class", "market"];
export const CHECK_ORDERS_JSON = Object.freeze({ type: "object", properties: { ...baseJson, account: { type: "object", properties: { equity: num, positions: { type: "object", additionalProperties: num }, notional_traded_today: num }, required: ["equity", "positions"] } }, required });
export const HOSTED_CHECK_ORDERS_JSON = Object.freeze({ type: "object", properties: baseJson, required });

/**
 * A Standard Schema the MCP SDK accepts: validated by the strict zod schema (the SDK names each
 * refused field), advertised in tools/list as the lean JSON Schema.
 */
export function advertised(strict, json) {
  const std = strict["~standard"];
  return { "~standard": { version: 1, vendor: std.vendor, validate: (value) => std.validate(value), jsonSchema: { input: () => json, output: () => json } } };
}

export const CHECK_ORDERS_DESCRIPTION = "Estimates each order's cost (commission, half spread, square-root impact over a stated band, short borrow) and checks it against your limits, market state and kill switch before anything is sent. Rejects with every reason; never resizes. Missing inputs are listed as not modelled, never assumed.";
export const HOSTED_CHECK_ORDERS_DESCRIPTION = "Estimates each order's cost (commission, half spread, square-root impact over a stated band) and checks it against the limits and market state given, before anything is sent. Rejects with every reason; never resizes. Missing inputs are listed as not modelled, never assumed. Position caps need your book: run the package locally.";

export const COLUMNS = Object.freeze(["symbol", "side", "qty", "accepted", "reasons", "notional_usd", "adv_pct", "regime", "commission_bps", "half_spread_bps", "impact_bps_low", "impact_bps_base", "impact_bps_high", "carry_bps", "total_bps_base", "total_usd_base"]);

export const CHECK_ORDERS_OUTPUT = z.looseObject({
  columns: z.array(z.string()).optional(),
  rows: z.array(z.unknown()).optional(),
  systemic_breach: z.boolean().optional(),
  limits_digest: z.string().optional(),
  checks_applied: z.array(z.string()).optional(),
  checks_skipped: z.array(z.unknown()).optional(),
  not_modelled: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  limits: z.array(z.string()).optional(),
}).describe("rows are the orders in the order of columns: accepted, every reason, and the cost in basis points of notional at the base impact coefficient (low and high beside it); checks_applied and checks_skipped say what was and was not checked.");

// Which check each limit turns on, by the name results report.
const LIMIT_CHECKS = Object.freeze({
  price_collar_frac: "price_collar", max_position_frac: "position_cap", max_gross: "gross_cap", max_net: "net_cap",
  max_adv_frac: "adv_participation", max_order_notional: "order_notional_cap", max_daily_notional: "daily_notional_cap",
  max_mark_age_seconds: "stale_mark", allowed_symbols: "symbol_allowlist", allowed_types: "order_type_allowlist",
});

/** sha256 of the effective limits in the house canonical JSON, so a journal can bind a check to its limits. */
export function limitsDigest(limits) {
  return `sha256:${createHash("sha256").update(canonicalJson(limits)).digest("hex")}`;
}

const round = (x, places) => (x === null || x === undefined ? null : Number(x.toFixed(places)));

export function parseInput(schema, args, tool) {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) throw new Error(`${tool}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

/**
 * Run the check. baseLimits are the local limits file's (a request can only tighten them); kill is
 * the local kill switch ({engaged, source}) or null where there is none (hosted). now gives the
 * default as_of.
 */
export function runCheckOrders(input, { baseLimits = {}, kill = null, now = () => new Date() } = {}) {
  const asOf = input.as_of ?? now().toISOString();
  if (input.asset_class === "crypto_spot" && (input.fees?.sell_fee_rate !== undefined || input.fees?.sell_fee_per_share !== undefined)) {
    throw new Error("check_orders: sell_fee_rate and sell_fee_per_share are US equity regulatory fees; they do not apply to crypto_spot");
  }
  const limits = effectiveLimits(baseLimits, input.limits ?? {});
  const out = checkOrders({
    orders: input.orders,
    market: input.market,
    account: input.account,
    limits,
    fees: input.fees,
    holding_days: input.holding_days,
    borrow_annual_rate: input.borrow_annual_rate,
    market_state: input.market_state && Object.fromEntries(Object.entries(input.market_state).map(([sym, state]) => [sym, { state }])),
    as_of: asOf,
    kill: kill ?? undefined,
  });

  const skippedChecks = new Set(out.checks_skipped.map((s) => s.check));
  const applied = ["inputs"];
  if (kill) applied.push("kill_switch");
  if (input.market_state || limits.require_market_state) applied.push("market_state");
  for (const [key, check] of Object.entries(LIMIT_CHECKS)) if (limits[key] !== undefined && !skippedChecks.has(check)) applied.push(check);
  if (input.account) applied.push("reduce_only_integrity");
  if (input.account && limits.max_gross !== undefined) applied.push("systemic_breach");

  const warnings = [...out.warnings];
  const notModelled = [...out.not_modelled];
  const feeSources = [];
  if (input.fees) {
    const ageDays = (Date.parse(asOf) - Date.parse(input.fees.as_of)) / 86400000;
    const stale = ageDays > FEE_STALE_DAYS;
    feeSources.push({ source_url: input.fees.source_url ?? null, as_of: input.fees.as_of, stale });
    if (stale) warnings.push(`the fee schedule was read ${Math.floor(ageDays)} days before as_of; check it is still current`);
    if (!input.fees.source_url) warnings.push("the fee schedule gives no source_url");
  }
  let timingRisk;
  if ((input.execution ?? "immediate") === "at_open") {
    timingRisk = [];
    for (const r of out.rows) {
      const vol = input.market[r.symbol]?.overnight_vol;
      if (r.cost && vol !== undefined) timingRisk.push({ symbol: r.symbol, sd_bps: round(vol / BPS, 3), sd_usd: round(vol * r.cost.notional_usd, 2) });
      else if (r.cost) notModelled.push(`timing risk at the open: no overnight_vol for ${r.symbol}`);
    }
  }

  const rows = out.rows.map((r) => {
    const c = r.cost;
    return [r.symbol, r.side, r.qty, r.accepted, r.reasons,
      round(c?.notional_usd, 2), round(c?.adv_pct, 4), c?.regime ?? null,
      round(c?.commission_bps, 3), round(c?.half_spread_bps, 3), round(c?.impact_bps_low, 3), round(c?.impact_bps_base, 3), round(c?.impact_bps_high, 3),
      round(c?.carry_bps, 3), round(c?.total_bps_base, 3), round(c?.total_usd_base, 2)];
  });
  return {
    asset_class: input.asset_class,
    execution: input.execution ?? "immediate",
    as_of: asOf,
    accepted: out.rows.filter((r) => r.accepted).length,
    rejected: out.rows.filter((r) => !r.accepted).length,
    columns: COLUMNS,
    rows,
    ...(out.walked_book.length ? { walked_book: out.walked_book.map((w) => ({ ...w, vwap: round(w.vwap, 6) })) } : {}),
    ...(timingRisk ? { timing_risk: timingRisk } : {}),
    systemic_breach: out.systemic_breach,
    effective_limits: limits,
    limits_digest: limitsDigest(limits),
    ...(kill ? { kill_switch: kill.engaged ? "engaged" : "clear" } : {}),
    checks_applied: applied,
    checks_skipped: out.checks_skipped,
    impact_band: IMPACT_BAND_TEXT,
    fee_sources: feeSources,
    not_modelled: [...new Set(notModelled)],
    warnings,
    limits: CHECK_LIMITS,
  };
}

export { REASONS };
