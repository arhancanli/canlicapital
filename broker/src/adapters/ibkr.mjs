// Interactive Brokers, through the Client Portal gateway running on this machine, where you log in
// yourself: no key passes through here. Whether an account is paper is in its id (paper ids start
// with D). The gateway's warnings are shown to the person, never accepted on their behalf.
// Written from IBKR's published examples and not yet run against a real gateway.
import { isCrypto, Refused } from "../util.mjs";

const SIDE = { buy: "BUY", sell: "SELL" }, TYPE = { market: "MKT", limit: "LMT" }, TIF = { day: "DAY", gtc: "GTC" };
const MAX_PROMPTS = 5;

async function conidOf(cfg, http, symbol) {
  if (cfg.conids.has(symbol)) return cfg.conids.get(symbol);
  const r = await http(`${cfg.base}/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}`, {});
  const hits = (Array.isArray(r.json) ? r.json : []).filter((x) => x.symbol === symbol && (x.sections ?? []).some((s) => s.secType === "STK"));
  const us = hits.filter((x) => /NASDAQ|NYSE|ARCA|AMEX|BATS/.test(x.description ?? ""));
  const pick = us.length === 1 ? us[0] : hits.length === 1 ? hits[0] : null;
  if (!pick) throw new Refused(hits.length ? `${symbol} matches several instruments at IBKR, so none is chosen for you.` : `IBKR found no stock ${symbol}.`);
  cfg.conids.set(symbol, pick.conid);
  return pick.conid;
}

export const ibkr = {
  name: "ibkr",
  async setup(mode, env, http) {
    const port = Number(env.CANLI_IBKR_PORT ?? 5000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Refused("CANLI_IBKR_PORT must be a port number.");
    const base = `https://localhost:${port}/v1/api`;
    const r = await http(`${base}/iserver/accounts`, {});
    if (!r.ok) throw new Refused("The IBKR gateway did not answer on this machine. Start it and log in first.");
    const accounts = r.json?.accounts ?? [], wanted = env.IBKR_ACCOUNT;
    const account = wanted ? accounts.find((a) => a === wanted) : accounts.length === 1 ? accounts[0] : null;
    if (!account) throw new Refused(wanted ? "IBKR_ACCOUNT is not one of the gateway's accounts." : "Several accounts: set IBKR_ACCOUNT to choose one.");
    const paper = /^D/.test(account);
    if ((mode === "paper") !== paper) throw new Refused(mode === "paper" ? "The gateway is logged in to a live account, and this run is paper." : "The gateway is logged in to a paper account, and this run is live.");
    return { base, account: encodeURIComponent(account), conids: new Map(), headers: {} };
  },
  cannot(o) {
    if (isCrypto(o.symbol)) return "This adapter sends only stocks to IBKR.";
    if (o.notional_usd !== undefined) return "This adapter sends share quantities to IBKR, not notional_usd.";
    return null;
  },
  async price(cfg, http, o) {
    const conid = await conidOf(cfg, http, o.symbol);
    for (let i = 0; i < 2; i += 1) {
      const r = await http(`${cfg.base}/iserver/marketdata/snapshot?conids=${conid}&fields=31`, {});
      const last = Number(String((Array.isArray(r.json) ? r.json[0]?.["31"] : null) ?? "").replace(/^[A-Z]/, ""));
      if (last > 0) return last;
    }
    return null;
  },
  async position(cfg, http, symbol) {
    const conid = await conidOf(cfg, http, symbol);
    const r = await http(`${cfg.base}/portfolio/${cfg.account}/position/${conid}`, {});
    if (!r.ok) return null;
    return (Array.isArray(r.json) ? r.json : []).reduce((n, p) => n + Number(p.position ?? 0), 0);
  },
  async place(cfg, http, o, clientId, { ask }) {
    const conid = await conidOf(cfg, http, o.symbol);
    const order = { conid, orderType: TYPE[o.type], side: SIDE[o.side], quantity: o.quantity, tif: TIF[o.time_in_force], cOID: clientId, ...(o.limit_price !== undefined ? { price: o.limit_price } : {}) };
    let r = await http(`${cfg.base}/iserver/account/${cfg.account}/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orders: [order] }) });
    for (let i = 0; i <= MAX_PROMPTS; i += 1) {
      const first = Array.isArray(r.json) ? r.json[0] : null;
      if (!r.ok || !first) throw new Error(`IBKR said ${r.status}: ${r.text}`);
      if (first.order_id !== undefined) return { id: first.order_id, status: first.order_status ?? "submitted" };
      if (!first.id || !first.message) throw new Error(`IBKR said: ${r.text}`);
      if (i === MAX_PROMPTS) break;
      if (!await ask(`IBKR asks about this order:\n  ${[first.message].flat().join("\n  ")}\nType yes to go ahead: `, "yes")) throw new Refused("You did not accept IBKR's warning, so this order was not placed.");
      r = await http(`${cfg.base}/iserver/reply/${encodeURIComponent(first.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true }) });
    }
    throw new Error("IBKR kept asking questions, so this stopped.");
  },
};
