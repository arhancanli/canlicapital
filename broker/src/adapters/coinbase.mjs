// Coinbase Advanced Trade: crypto. https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/
// There is no paper account here, so a paper run asks Coinbase to preview each order and places none.
// Each request carries its own short-lived signed token, as Coinbase's key authentication asks.
import { createPrivateKey, randomBytes, sign } from "node:crypto";

import { isCrypto, Refused } from "../util.mjs";

const HOST = "api.coinbase.com";
const b64 = (x) => Buffer.from(x).toString("base64url");
const decimal = (x) => x.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 12 });

export function coinbaseToken(keyName, secret, method, path, nowSeconds, nonce = randomBytes(16).toString("hex")) {
  const head = b64(JSON.stringify({ alg: "ES256", kid: keyName, nonce, typ: "JWT" }));
  const body = b64(JSON.stringify({ sub: keyName, iss: "cdp", nbf: nowSeconds, exp: nowSeconds + 120, uri: `${method} ${HOST}${path}` }));
  const signature = sign("sha256", Buffer.from(`${head}.${body}`), { key: secret, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64(signature)}`;
}

export const coinbase = {
  name: "coinbase",
  setup(mode, env) {
    if (!env.COINBASE_KEY_NAME || !env.COINBASE_KEY_SECRET) throw new Refused("Set COINBASE_KEY_NAME and COINBASE_KEY_SECRET in your environment.");
    let secret;
    try { secret = createPrivateKey(env.COINBASE_KEY_SECRET.replace(/\\n/g, "\n")); } catch { throw new Refused("COINBASE_KEY_SECRET could not be read as a private key (ECDSA, in PEM form)."); }
    return { mode, keyName: env.COINBASE_KEY_NAME, secret };
  },
  cannot(o) {
    if (!isCrypto(o.symbol)) return "This adapter sends only crypto pairs to Coinbase, such as BTC/USD.";
    if (o.type === "limit" && o.time_in_force !== "gtc") return "Coinbase limit orders here need time_in_force gtc.";
    return null;
  },
  async price(cfg, http, o) {
    const path = `/api/v3/brokerage/products/${o.symbol.replace("/", "-")}`;
    const r = await http(`https://${HOST}${path}`, { headers: auth(cfg, "GET", path) });
    const p = Number(r.json?.price);
    return r.ok && p > 0 ? p : null;
  },
  async position(cfg, http, symbol) {
    const path = "/api/v3/brokerage/accounts";
    const r = await http(`https://${HOST}${path}?limit=250`, { headers: auth(cfg, "GET", path) });
    if (!r.ok) return null;
    const coin = symbol.split("/")[0];
    return Number((r.json?.accounts ?? []).find((a) => a.currency === coin)?.available_balance?.value ?? 0);
  },
  async place(cfg, http, o, clientId) {
    const product = o.symbol.replace("/", "-");
    const configuration = o.type === "market"
      ? { market_market_ioc: o.quantity !== undefined ? { base_size: decimal(o.quantity) } : { quote_size: decimal(o.notional_usd) } }
      : { limit_limit_gtc: { base_size: decimal(o.quantity), limit_price: decimal(o.limit_price), post_only: false } };
    const preview = cfg.mode === "paper", path = preview ? "/api/v3/brokerage/orders/preview" : "/api/v3/brokerage/orders";
    const body = { product_id: product, side: o.side.toUpperCase(), order_configuration: configuration, ...(preview ? {} : { client_order_id: clientId }) };
    const r = await http(`https://${HOST}${path}`, { method: "POST", headers: { ...auth(cfg, "POST", path), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (preview) {
      if (!r.ok || r.json?.errs?.length) throw new Error(`Coinbase said ${r.status}: ${JSON.stringify(r.json?.errs ?? r.text)}`);
      return { id: null, status: `previewed only, nothing placed (total ${r.json?.order_total ?? "unknown"})` };
    }
    if (!r.ok || !r.json?.success) throw new Error(`Coinbase said ${r.status}: ${r.json?.error_response?.message ?? r.text}`);
    return { id: r.json.success_response?.order_id ?? null, status: "accepted" };
  },
};
function auth(cfg, method, path) {
  return { Authorization: `Bearer ${coinbaseToken(cfg.keyName, cfg.secret, method, path, Math.floor(Date.now() / 1000))}`, Accept: "application/json" };
}
