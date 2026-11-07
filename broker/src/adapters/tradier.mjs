// Tradier: US stocks. https://docs.tradier.com/brokerage-api/trading/place-equity-order
// Its place-order call can return 200 for an order rejected further on, so each one is read back.
import { isCrypto, Refused } from "../util.mjs";

const HOSTS = { paper: "https://sandbox.tradier.com/v1", live: "https://api.tradier.com/v1" };
const KEYS = { paper: ["TRADIER_SANDBOX_TOKEN", "TRADIER_SANDBOX_ACCOUNT"], live: ["TRADIER_TOKEN", "TRADIER_ACCOUNT"] };
const list = (x) => (Array.isArray(x) ? x : x ? [x] : []);

export const tradier = {
  name: "tradier",
  setup(mode, env) {
    const [tokenName, accountName] = KEYS[mode];
    if (!env[tokenName] || !env[accountName]) throw new Refused(`Set ${tokenName} and ${accountName} in your environment.`);
    return { base: HOSTS[mode], account: encodeURIComponent(env[accountName]), headers: { Authorization: `Bearer ${env[tokenName]}`, Accept: "application/json" } };
  },
  cannot(o) {
    if (isCrypto(o.symbol)) return "Tradier does not trade crypto.";
    if (o.notional_usd !== undefined) return "Tradier takes whole share quantities, not notional_usd.";
    if (!Number.isInteger(o.quantity)) return "Tradier takes whole share quantities.";
    return null;
  },
  async price(cfg, http, o) {
    const r = await http(`${cfg.base}/markets/quotes?symbols=${encodeURIComponent(o.symbol)}`, { headers: cfg.headers });
    return r.ok ? list(r.json?.quotes?.quote)[0]?.last ?? null : null;
  },
  async position(cfg, http, symbol) {
    const r = await http(`${cfg.base}/accounts/${cfg.account}/positions`, { headers: cfg.headers });
    if (!r.ok) return null;
    return list(r.json?.positions?.position).find((p) => p.symbol === symbol)?.quantity ?? 0;
  },
  async place(cfg, http, o, clientId) {
    const form = new URLSearchParams({ class: "equity", symbol: o.symbol, side: o.side, quantity: String(o.quantity), type: o.type, duration: o.time_in_force, tag: clientId });
    if (o.limit_price !== undefined) form.set("price", String(o.limit_price));
    const r = await http(`${cfg.base}/accounts/${cfg.account}/orders`, { method: "POST", headers: { ...cfg.headers, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
    const id = r.json?.order?.id;
    if (!r.ok || id === undefined) throw new Error(`Tradier said ${r.status}: ${JSON.stringify(r.json?.errors ?? r.text)}`);
    const back = await http(`${cfg.base}/accounts/${cfg.account}/orders/${encodeURIComponent(id)}`, { headers: cfg.headers });
    const status = back.json?.order?.status ?? "unconfirmed";
    if (status === "rejected") throw new Error(`Tradier rejected order ${id}: ${back.json?.order?.reason_description ?? "no reason given"}`);
    return { id, status };
  },
};
