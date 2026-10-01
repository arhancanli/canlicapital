// Local-only post-trade arithmetic. No orders, broker connection, telemetry or hosted inputs.
import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { isAbsolute } from "node:path";

import { z } from "zod";

import { measureShortfall } from "./core/js/shortfall-core.js";

const nonNeg = z.number().finite().nonnegative().max(1e12);
const price = z.number().finite().positive().max(1e12);
const time = z.iso.datetime({ offset: true });
const fill = z.object({ qty: price, price, fee: z.number().finite().optional(), ts: time }).strict();
const order = z.object({
  id: z.string().min(1).max(128), side: z.enum(["buy", "sell"]), qty: nonNeg,
  decision_price: nonNeg.optional(), decision_ts: time,
  arrival_mid: price.optional(), arrival_feed: z.enum(["iex", "sip", "crypto", "unknown"]).optional(),
  open_price: price.optional(), horizon_price: price.optional(), fills: z.array(fill).max(5000),
}).strict();
const orders = z.array(order).min(1).max(10000);
export const shortfallInput = z.object({
  orders: orders.optional(), orders_file: z.string().min(1).max(4096).optional(), benchmark: z.enum(["decision", "arrival", "at_open"]).optional(),
  fill_source: z.enum(["broker_paper", "simulated", "funded", "self_reported"]),
  backtest_cost_bps: z.number().finite().optional(), seed: z.number().int().min(0).max(4294967295).optional(),
  bootstrap: z.object({ block_length: z.number().finite().min(1).optional(), resamples: z.number().int().min(99).max(1999).optional() }).strict().optional(),
  max_rows: z.number().int().min(0).max(200).optional(),
}).strict().refine((input) => (input.orders !== undefined) !== (input.orders_file !== undefined), "give exactly one of orders or orders_file");

const number = { type: "number" }, text = { type: "string" };
export const SHORTFALL_JSON = {
  type: "object", properties: {
    orders_file: text,
    orders: { type: "array", items: { type: "object", properties: {
      id: text, side: { enum: ["buy", "sell"] }, qty: number, decision_price: number, decision_ts: text,
      arrival_mid: number, arrival_feed: { enum: ["iex", "sip", "crypto", "unknown"] }, open_price: number, horizon_price: number,
      fills: { type: "array", items: { type: "object", properties: { qty: number, price: number, fee: number, ts: text }, required: ["qty", "price", "ts"] } },
    }, required: ["id", "side", "qty", "decision_ts", "fills"] } },
    benchmark: { enum: ["decision", "arrival", "at_open"] }, fill_source: { enum: ["broker_paper", "simulated", "funded", "self_reported"] },
    backtest_cost_bps: number, seed: number, bootstrap: { type: "object", properties: { block_length: number, resamples: number } }, max_rows: number,
  }, required: ["fill_source"], oneOf: [{ required: ["orders"] }, { required: ["orders_file"] }],
};

export const SHORTFALL_DESCRIPTION = "Computes post-trade shortfall: delay, execution, unfilled opportunity and stated USD fill fees, in bp of decision notional (positive is cost). Missing fees stay unknown. Give orders OR orders_file (absolute local path to their JSON array, at most 16 MiB). Prices are USD; fills need ISO timestamps. Optional seeded stationary-bootstrap CI needs chronological orders. max_rows defaults to 0 (aggregate only). Runs locally; sends nothing.";
export const SHORTFALL_OUTPUT = z.looseObject({ aggregate: z.unknown(), orders: z.number(), excluded: z.array(z.unknown()), not_measurable: z.array(z.string()), bootstrap_ci: z.unknown() });

export function loadShortfallOrders(path) {
  if (!isAbsolute(path)) throw new RangeError("orders_file must be an absolute local path");
  const limit = 16 * 1024 * 1024;
  const fd = openSync(path, "r");
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new RangeError("orders_file must be a regular JSON file at most 16 MiB");
    const buffer = Buffer.alloc(Math.min(stat.size + 1, limit + 1));
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
    }
    if (size > stat.size) throw new RangeError("orders_file grew during the read; retry with a stable file");
    const bytes = buffer.subarray(0, size);
    let parsed;
    try { parsed = JSON.parse(bytes.toString("utf8")); } catch { throw new RangeError("orders_file must contain a valid JSON array of orders"); }
    const valid = orders.safeParse(parsed);
    if (!valid.success) throw new RangeError(`orders_file has invalid order fields: ${valid.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
    return { orders: valid.data, provenance: { kind: "local_json", bytes: size, sha256: createHash("sha256").update(bytes).digest("hex") } };
  } finally { closeSync(fd); }
}

export function runShortfall(args) {
  const loaded = args.orders_file !== undefined ? loadShortfallOrders(args.orders_file) : null;
  const input = loaded ? { ...args, orders: loaded.orders } : args;
  if (input.bootstrap && input.orders.some((order, i) => i > 0 && Date.parse(order.decision_ts) < Date.parse(input.orders[i - 1].decision_ts))) throw new RangeError("orders must be chronological by decision_ts for the stationary bootstrap");
  const result = measureShortfall(input);
  const maxRows = input.max_rows ?? 0;
  const rows = result.rows.slice(0, maxRows).map((row) => {
    const bp = (value) => value === null ? null : value * 10000 / row.decision_notional_usd;
    return [row.id, bp(row.delay_usd), bp(row.execution_usd), bp(row.opportunity_usd), bp(row.fees_usd), bp(row.total_usd)];
  });
  const limits = ["Arithmetic on supplied fills; fill_source is the caller's declaration, not broker-authenticated evidence.", "The 30% price-move guard excludes possible splits/bad marks; it also excludes real large moves. Missing unfilled horizon prices exclude the whole order.", "The bootstrap is a percentile interval on chronological orders and chosen block length; it does not establish profitability or model regime shifts."];
  if (input.fill_source === "broker_paper") limits.push("Measured against the broker's paper engine, not market fills; paper engines do not establish impact, latency slippage, queue position or regulatory fees.");
  const { rows: allRows, excluded, ...summary } = result;
  return { ...summary, fill_source: input.fill_source,
    input_source: loaded?.provenance ?? { kind: "inline" },
    columns: ["id", "delay_bps", "execution_bps", "opportunity_bps", "fees_bps", "total_bps"], rows, rows_omitted: allRows.length - rows.length,
    excluded_counts: Object.fromEntries(["implausible_move", "no_price", "zero_quantity"].map((reason) => [reason, excluded.filter((row) => row.reason === reason).length])),
    excluded: excluded.slice(0, 20), excluded_omitted: Math.max(0, excluded.length - 20),
    feed_warning: input.orders.some((order) => order.arrival_feed === "iex") ? "IEX arrival quotes are not the NBBO" : null,
    limits };
}
