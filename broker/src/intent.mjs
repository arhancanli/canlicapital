// The order file, canli.order-intent.v1. Everything in it may have been written by a model that read
// text someone planted, so it is checked strictly and only ever shown as a draft.
import { canonical, clean, Refused, sha256 } from "./util.mjs";

const MAX_BYTES = 1024 * 1024, MAX_ORDERS = 50;
const SYMBOL = /^[A-Z0-9][A-Z0-9.\-/]{0,14}$/;
const FIELDS = new Set(["symbol", "side", "quantity", "notional_usd", "type", "limit_price", "time_in_force"]);
const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0 && x <= 1e9;

export function readIntent(text) {
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Refused("The order file is larger than 1 MB.");
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Refused("The order file is not JSON."); }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Refused("The order file is not an object.");
  if (raw.schema !== "canli.order-intent.v1") throw new Refused("The order file's schema is not canli.order-intent.v1.");
  if (!Array.isArray(raw.orders) || !raw.orders.length) throw new Refused("The order file has no orders.");
  if (raw.orders.length > MAX_ORDERS) throw new Refused(`The order file has more than ${MAX_ORDERS} orders.`);
  const orders = raw.orders.map((o, i) => {
    const at = `Order ${i + 1}`;
    if (o === null || typeof o !== "object" || Array.isArray(o)) throw new Refused(`${at} is not an object.`);
    for (const k of Object.keys(o)) if (!FIELDS.has(k)) throw new Refused(`${at} has a field this does not understand: ${clean(k, 40)}.`);
    if (typeof o.symbol !== "string" || !SYMBOL.test(o.symbol)) throw new Refused(`${at}: the symbol must be upper case, such as AAPL or BTC/USD.`);
    if (o.side !== "buy" && o.side !== "sell") throw new Refused(`${at}: the side must be buy or sell.`);
    if (o.type !== "market" && o.type !== "limit") throw new Refused(`${at}: the type must be market or limit.`);
    if ((o.quantity === undefined) === (o.notional_usd === undefined)) throw new Refused(`${at}: give quantity or notional_usd, one of them.`);
    if (o.quantity !== undefined && !positive(o.quantity)) throw new Refused(`${at}: the quantity must be a positive number.`);
    if (o.notional_usd !== undefined && !positive(o.notional_usd)) throw new Refused(`${at}: notional_usd must be a positive number.`);
    if (o.type === "limit" && !positive(o.limit_price)) throw new Refused(`${at}: a limit order needs a positive limit_price.`);
    if (o.type === "market" && o.limit_price !== undefined) throw new Refused(`${at}: a market order has no limit_price.`);
    if (o.notional_usd !== undefined && o.type !== "market") throw new Refused(`${at}: notional_usd works only with a market order.`);
    const tif = o.time_in_force ?? "day";
    if (tif !== "day" && tif !== "gtc") throw new Refused(`${at}: time_in_force must be day or gtc.`);
    return { ...o, time_in_force: tif };
  });
  const intent = { schema: raw.schema, reason: clean(raw.reason, 500), orders };
  return { intent, hash: sha256(canonical({ schema: intent.schema, orders })) };
}
