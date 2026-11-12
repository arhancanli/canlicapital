// Alpaca: stocks and crypto. https://docs.alpaca.markets/reference/postorder
// Paper and live are different hosts with different keys, and a key for one is refused on the other.
import { isCrypto, Refused } from "../util.mjs";

const HOSTS = { paper: "https://paper-api.alpaca.markets", live: "https://api.alpaca.markets" }, DATA = "https://data.alpaca.markets";
const KEYS = { paper: ["ALPACA_PAPER_KEY_ID", "ALPACA_PAPER_SECRET_KEY", /^PK/], live: ["ALPACA_LIVE_KEY_ID", "ALPACA_LIVE_SECRET_KEY", /^AK/] };

export const alpaca = {
  name: "alpaca",
  setup(mode, env) {
    const [idName, secretName, shape] = KEYS[mode];
    if (!env[idName] || !env[secretName]) throw new Refused(`Set ${idName} and ${secretName} in your environment.`);
    if (!shape.test(env[idName])) throw new Refused(`${idName} does not look like a ${mode} key, so it is refused.`);
    return { base: HOSTS[mode], headers: { "APCA-API-KEY-ID": env[idName], "APCA-API-SECRET-KEY": env[secretName], Accept: "application/json" } };
  },
  // A reason this order cannot go through this broker as written, or null.
  cannot(o) {
    if (isCrypto(o.symbol)) return o.time_in_force === "gtc" ? null : "Alpaca crypto orders need time_in_force gtc.";
    if (o.notional_usd !== undefined && o.time_in_force !== "day") return "Alpaca takes notional_usd only with time_in_force day.";
    if (o.quantity !== undefined && !Number.isInteger(o.quantity) && !(o.type === "market" && o.time_in_force === "day")) return "Alpaca takes fractional quantities only on market day orders.";
    return null;
  },
  async price(cfg, http, o) {
    if (isCrypto(o.symbol)) {
      const r = await http(`${DATA}/v1beta3/crypto/us/latest/trades?symbols=${encodeURIComponent(o.symbol)}`, { headers: cfg.headers });
      return r.ok ? r.json?.trades?.[o.symbol]?.p ?? null : null;
    }
    const r = await http(`${DATA}/v2/stocks/${encodeURIComponent(o.symbol)}/trades/latest`, { headers: cfg.headers });
    return r.ok ? r.json?.trade?.p ?? null : null;
  },
  async position(cfg, http, symbol) {
    const r = await http(`${cfg.base}/v2/positions/${encodeURIComponent(symbol.replace("/", ""))}`, { headers: cfg.headers });
    if (r.status === 404) return 0;
    return r.ok ? Number(r.json?.qty) : null;
  },
  async place(cfg, http, o, clientId) {
    const body = { symbol: o.symbol, side: o.side, type: o.type, time_in_force: o.time_in_force, client_order_id: clientId, ...(o.quantity !== undefined ? { qty: String(o.quantity) } : { notional: String(o.notional_usd) }), ...(o.limit_price !== undefined ? { limit_price: String(o.limit_price) } : {}) };
    const r = await http(`${cfg.base}/v2/orders`, { method: "POST", headers: { ...cfg.headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) return { id: r.json?.id ?? null, status: r.json?.status ?? "accepted" };
    // The same client id twice means this order is already there: the broker refuses a second one.
    if (r.status === 422 && /client_order_id/i.test(r.json?.message ?? "")) {
      const was = await http(`${cfg.base}/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientId)}`, { headers: cfg.headers });
      if (was.ok) return { id: was.json?.id ?? null, status: was.json?.status ?? "already placed", already: true };
    }
    throw new Error(`Alpaca said ${r.status}: ${r.json?.message ?? r.text}`);
  },
};
