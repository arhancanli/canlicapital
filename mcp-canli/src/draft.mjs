// draft_orders: orders written out in a standard form, for a person to read and act on. This is as far
// as the server goes. It sends nothing and holds no broker key, and the hash ties what a person
// approves to the exact orders. A model drafted them, possibly after reading text someone planted,
// so the draft is only a proposal. It is not advice.
import { createHash } from "node:crypto";
import { z } from "zod";

export const INTENT_SCHEMA = "canli.order-intent.v1";
const order = z.object({
  symbol: z.string().regex(/^[A-Z0-9][A-Z0-9.\-/]{0,14}$/, "an upper-case ticker or pair, such as AAPL or BTC/USD"),
  side: z.enum(["buy", "sell"]),
  quantity: z.number().positive().max(1e9).optional().describe("Shares or coins. Give this or notional_usd."),
  notional_usd: z.number().positive().max(1e9).optional().describe("Dollars to trade instead of a quantity; market orders only."),
  type: z.enum(["market", "limit"]),
  limit_price: z.number().positive().max(1e9).optional().describe("Required for a limit order."),
  time_in_force: z.enum(["day", "gtc"]).optional().describe("Default day."),
}).strict().superRefine((o, ctx) => {
  if ((o.quantity === undefined) === (o.notional_usd === undefined)) ctx.addIssue({ code: "custom", message: "give quantity or notional_usd, one of them" });
  if (o.type === "limit" && o.limit_price === undefined) ctx.addIssue({ code: "custom", message: "a limit order needs limit_price" });
  if (o.type === "market" && o.limit_price !== undefined) ctx.addIssue({ code: "custom", message: "a market order has no limit_price" });
  if (o.notional_usd !== undefined && o.type !== "market") ctx.addIssue({ code: "custom", message: "notional_usd works only with a market order" });
});
export const draftInput = z.object({
  reason: z.string().min(3).max(500).describe("Why, in a sentence."),
  orders: z.array(order).min(1).max(50),
}).strict();

const canonical = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`);

export function runDraft(args) {
  const a = draftInput.parse(args);
  const intent = { schema: INTENT_SCHEMA, reason: a.reason, orders: a.orders.map((o) => ({ ...o, time_in_force: o.time_in_force ?? "day" })) };
  return { intent, sha256: createHash("sha256").update(canonical(intent)).digest("hex"), sent: false, note: "Nothing was sent, and this server cannot send it. A person reads this and decides. Save intent as a JSON file to use it with your broker's tools. This is not advice." };
}

export const DRAFT_TOOL = Object.freeze({
  name: "draft_orders", pack: "desk", toolset: "desk", title: "Write orders out for a person to review", input: draftInput, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  description: "Write orders in a standard JSON form with a hash, for a person to read and act on. It sends nothing and this server holds no broker key. Checks the form only, not whether the orders are wise.",
  keywords: "order draft intent json payload trade ticket buy sell format broker export review approve",
  args: "reason: string, orders: {symbol,side,quantity?,notional_usd?,type,limit_price?,time_in_force?}[]",
});
