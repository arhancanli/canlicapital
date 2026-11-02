// Kraken spot: crypto. https://docs.kraken.com/api/docs/rest-api/add-order/
// Spot has no paper account, so a paper run sends each order with validate, which Kraken checks and
// does not trade. Signed as in https://docs.kraken.com/api/docs/guides/spot-rest-auth/
import { createHash, createHmac } from "node:crypto";

import { clean, isCrypto, Refused, sha256 } from "../util.mjs";

const HOST = "api.kraken.com";
// Kraken's own names for two coins. The rest use their usual tickers.
const NAMES = Object.freeze({ BTC: "XBT", DOGE: "XDG" });
const nameOf = (coin) => (Object.hasOwn(NAMES, coin) ? NAMES[coin] : coin);
const pairOf = (symbol) => symbol.split("/").map(nameOf).join("");
const decimal = (x) => x.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 12 });

// cl_ord_id takes a UUID, or text up to 18 characters, so the journal's id is hashed into a UUID's shape.
// The same order always makes the same id.
const uuidOf = (id) => { const h = sha256(id); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };

export function krakenSign(path, nonce, body, secret) {
  const digest = createHash("sha256").update(`${nonce}${body}`).digest();
  return createHmac("sha512", Buffer.from(secret, "base64")).update(path).update(digest).digest("base64");
}

// Kraken refuses a nonce that does not rise, and two requests can fall in one millisecond.
let lastNonce = 0;
const nextNonce = () => { lastNonce = Math.max(Date.now(), lastNonce + 1); return lastNonce; };

function post(cfg, http, name, fields = {}) {
  const path = `/0/private/${name}`, nonce = nextNonce();
  const body = new URLSearchParams({ nonce: String(nonce), ...fields }).toString();
  return http(`https://${HOST}${path}`, { method: "POST", headers: { "API-Key": cfg.key, "API-Sign": krakenSign(path, nonce, body, cfg.secret), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
}

export const kraken = {
  name: "kraken",
  noPaper: "Kraken",
  setup(mode, env) {
    if (!env.KRAKEN_API_KEY || !env.KRAKEN_API_SECRET) throw new Refused("Set KRAKEN_API_KEY and KRAKEN_API_SECRET in your environment.");
    return { mode, key: env.KRAKEN_API_KEY, secret: env.KRAKEN_API_SECRET };
  },
  cannot(o) {
    if (!isCrypto(o.symbol)) return "This adapter sends only crypto pairs to Kraken, such as BTC/USD.";
    if (o.type === "limit" && o.time_in_force !== "gtc") return "Kraken limit orders here need time_in_force gtc.";
    if (o.notional_usd !== undefined && o.side !== "buy") return "Kraken takes a dollar amount only on a market buy. Give a quantity.";
    return null;
  },
  async price(cfg, http, o) {
    const r = await http(`https://${HOST}/0/public/Ticker?pair=${encodeURIComponent(pairOf(o.symbol))}`, { headers: { Accept: "application/json" } });
    const p = Number(Object.values(r.json?.result ?? {})[0]?.c?.[0]);
    return r.ok && !r.json?.error?.length && p > 0 ? p : null;
  },
  async position(cfg, http, symbol) {
    const r = await post(cfg, http, "Balance");
    if (!r.ok || r.json?.error?.length || !r.json?.result) return null;
    const coin = nameOf(symbol.split("/")[0]);
    return Number(r.json.result[`X${coin}`] ?? r.json.result[coin] ?? 0);
  },
  async place(cfg, http, o, clientId) {
    const check = cfg.mode === "paper";
    const r = await post(cfg, http, "AddOrder", {
      ordertype: o.type, type: o.side, pair: pairOf(o.symbol),
      ...(o.quantity !== undefined ? { volume: decimal(o.quantity) } : { volume: decimal(o.notional_usd), oflags: "viqc" }),
      ...(o.type === "limit" ? { price: decimal(o.limit_price), timeinforce: "GTC" } : {}),
      cl_ord_id: uuidOf(clientId),
      ...(check ? { validate: "true" } : {}),
    });
    if (!r.ok || r.json?.error?.length) throw new Error(`Kraken said ${r.status}: ${clean(JSON.stringify(r.json?.error ?? r.text))}`);
    if (check) return { id: null, status: `checked by Kraken, nothing placed (${clean(r.json?.result?.descr?.order ?? "no description")})` };
    return { id: r.json?.result?.txid?.[0] ?? null, status: "accepted" };
  },
};
