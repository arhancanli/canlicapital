// Alpaca paper trading behind a pre-trade check and a confirmation token.
//
// Paper only, by construction: the trading host is Alpaca's paper endpoint, written here and nowhere
// else, with no override; keys come from ALPACA_PAPER_KEY_ID and ALPACA_PAPER_SECRET_KEY and must be
// paper keys (Alpaca paper key ids start with "PK"; anything else is refused).
//
// Every order goes through two steps. preview reads the paper account, positions, clock and latest
// quotes, runs the repository's pre-trade checks (src/core/js/pretrade-core.js) with the trader's own
// limits file and kill switch, and, only when every order passes, returns a token bound to those
// exact orders for five minutes. send places only orders an unused, unexpired token covers, after
// reading the kill switch again; each order carries a client_order_id derived from the token, so a
// retried send cannot fill twice. Cancelling reduces risk and needs no token.
//
// The trader's directory (CANLI_HOME, default ~/.canli) holds limits.json (caps the checks enforce;
// a call can only tighten them), KILL (while it exists nothing is sent), and paper-orders.jsonl, a
// hash-chained record of every send and cancel this server made.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { checkOrders, effectiveLimits, LIMIT_KEYS } from "./core/js/pretrade-core.js";

const PAPER_TRADING = "https://paper-api.alpaca.markets";
const MARKET_DATA = "https://data.alpaca.markets";
export const TOKEN_SECONDS = 300;
const MAX_LIMITS_BYTES = 1 << 20;

export function paperCredentials(env) {
  const id = env.ALPACA_PAPER_KEY_ID, secret = env.ALPACA_PAPER_SECRET_KEY;
  if (!id || !secret) throw new Error("Set ALPACA_PAPER_KEY_ID and ALPACA_PAPER_SECRET_KEY to your Alpaca paper keys (paper dashboard, API keys).");
  if (!/^PK[A-Z0-9]{8,}$/.test(id)) throw new Error("ALPACA_PAPER_KEY_ID is not a paper key id (paper ids start with PK). Other keys are refused: this server trades paper only.");
  return { id, secret };
}

const canonical = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`);
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export function readLimits(home) {
  const path = join(home, "limits.json");
  if (!existsSync(path)) return { path: null, limits: {} };
  const text = readFileSync(path, "utf8");
  if (text.length > MAX_LIMITS_BYTES) throw new Error(`${path} is larger than 1 MiB; checks refuse rather than run without it.`);
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { throw new Error(`${path} is not valid JSON (${e.message}); checks refuse rather than run without it.`); }
  const allowed = new Set([...LIMIT_KEYS, "allowed_symbols", "allowed_types", "require_market_state"]);
  for (const k of Object.keys(parsed)) if (!allowed.has(k)) throw new Error(`${path}: unknown limit ${k}; checks refuse rather than guess.`);
  return { path, limits: parsed };
}

export const killState = (home) => ({ engaged: existsSync(join(home, "KILL")), source: join(home, "KILL") });

// Append-only, hash-chained record of what this server sent.
export function orderLog(home) {
  const path = join(home, "paper-orders.jsonl");
  const read = () => (existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  return {
    path,
    head() {
      const rows = read();
      let prev = null;
      for (const [i, r] of rows.entries()) {
        const { hash, ...body } = r;
        if (r.prev !== prev || sha256(canonical(body)) !== hash) return { path, entries: rows.length, verified: false, broken_at: i };
        prev = hash;
      }
      return { path, entries: rows.length, verified: true, head: prev };
    },
    append(entry) {
      const rows = read(), prev = rows.length ? rows.at(-1).hash : null;
      const body = { seq: rows.length, prev, ...entry };
      appendFileSync(path, `${JSON.stringify({ ...body, hash: sha256(canonical(body)) })}\n`, { mode: 0o600 });
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createBroker({ env = process.env, home, fetchImpl = globalThis.fetch, now = () => new Date(), timeoutMs = 10000 } = {}) {
  const secret = randomBytes(32), used = new Set(), log = orderLog(home);
  // Every request times out after 10 s. Reads retry twice on network errors, 429 and 5xx (with
  // backoff); writes never retry here, because send() resolves uncertain orders by client order id.
  async function call(base, path, { method = "GET", body, retries = method === "GET" ? 2 : 0 } = {}) {
    const c = paperCredentials(env);
    for (let attempt = 0; ; attempt++) {
      let res, text;
      try {
        res = await fetchImpl(`${base}${path}`, { method, headers: { "APCA-API-KEY-ID": c.id, "APCA-API-SECRET-KEY": c.secret, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
        text = await res.text();
      } catch (e) {
        if (attempt < retries) { await sleep(250 * 4 ** attempt); continue; }
        const err = new Error(`Alpaca paper ${method} ${path.split("?")[0]} failed: ${e.name === "TimeoutError" ? `no response in ${timeoutMs / 1000} s` : e.message}`);
        err.uncertain = true;
        throw err;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < retries) { await sleep(250 * 4 ** attempt); continue; }
      if (!res.ok) { const err = new Error(`Alpaca paper ${method} ${path.split("?")[0]} returned ${res.status}: ${text.slice(0, 300)}`); err.status = res.status; err.uncertain = res.status >= 500; throw err; }
      return text ? JSON.parse(text) : null;
    }
  }
  const sign = (payload) => createHmac("sha256", secret).update(payload).digest("base64url");

  async function snapshot() {
    const [account, positions, orders, clock] = await Promise.all([call(PAPER_TRADING, "/v2/account"), call(PAPER_TRADING, "/v2/positions"), call(PAPER_TRADING, "/v2/orders?status=open&limit=100"), call(PAPER_TRADING, "/v2/clock")]);
    if (account.trading_blocked || account.account_blocked) throw new Error("The paper account is blocked from trading.");
    return { account, positions, orders, clock };
  }

  async function quotes(symbols) {
    const q = await call(MARKET_DATA, `/v2/stocks/quotes/latest?symbols=${symbols.map(encodeURIComponent).join(",")}&feed=iex`);
    const out = {};
    for (const sym of symbols) {
      const qt = q?.quotes?.[sym];
      if (!qt || !(qt.ap > 0) || !(qt.bp > 0)) throw new Error(`No usable quote for ${sym} on the IEX feed; check the symbol.`);
      out[sym] = { price: (qt.ap + qt.bp) / 2, bid: qt.bp, ask: qt.ap, as_of: qt.t };
    }
    return out;
  }

  function check(orders, s, market, request) {
    const file = readLimits(home), limits = effectiveLimits(file.limits, request.limits ?? {});
    const state = Object.fromEntries(Object.keys(market).map((sym) => [sym, { state: s.clock.is_open ? "open" : "closed", source: "alpaca paper clock" }]));
    const positions = Object.fromEntries(s.positions.map((p) => [p.symbol, Number(p.qty)]));
    const out = checkOrders({ orders, market, account: { equity: Number(s.account.equity), positions }, limits, fees: request.fees, market_state: state, as_of: now().toISOString(), kill: killState(home) });
    const accepted = out.rows.every((r) => r.accepted);
    let token = null, expires_at = null;
    if (accepted) {
      const exp = Math.floor(now().getTime() / 1000) + TOKEN_SECONDS;
      const payload = Buffer.from(JSON.stringify({ orders, exp })).toString("base64url");
      token = `${payload}.${sign(payload)}`;
      expires_at = new Date(exp * 1000).toISOString();
    }
    return {
      paper: true, accepted, market_open: s.clock.is_open, limits_file: file.path,
      columns: ["symbol", "side", "qty", "accepted", "reasons", "est_cost_bps"],
      rows: out.rows.map((r) => [r.symbol, r.side, r.qty, r.accepted, r.reasons, r.cost?.total_bps_base ?? null]),
      warnings: out.warnings, not_modelled: out.not_modelled, checks_skipped: out.checks_skipped, systemic_breach: out.systemic_breach,
      token, expires_at,
      next: accepted ? "send_paper_orders with this token within five minutes sends exactly these orders to the paper account." : "Not every order passed; nothing can be sent. Fix the reasons and preview again.",
    };
  }

  const normalize = (o) => ({ symbol: o.symbol, side: o.side, qty: o.qty, type: o.type ?? "market", ...(o.limit_price !== undefined ? { limit_price: o.limit_price } : {}), tif: o.tif ?? "day" });

  return {
    async account() {
      const s = await snapshot(), a = s.account;
      return {
        paper: true, status: a.status, currency: a.currency, equity: Number(a.equity), cash: Number(a.cash), buying_power: Number(a.buying_power),
        market_open: s.clock.is_open, next_open: s.clock.next_open, next_close: s.clock.next_close, kill_switch: killState(home).engaged ? "engaged" : "clear",
        positions: { columns: ["symbol", "qty", "market_value", "avg_entry_price", "unrealized_pl"], rows: s.positions.map((p) => [p.symbol, Number(p.qty), Number(p.market_value), Number(p.avg_entry_price), Number(p.unrealized_pl)]) },
        open_orders: { columns: ["id", "symbol", "side", "qty", "type", "limit_price", "status"], rows: s.orders.map((o) => [o.id, o.symbol, o.side, Number(o.qty), o.type, o.limit_price == null ? null : Number(o.limit_price), o.status]) },
        order_log: log.head(),
      };
    },

    async preview(request) {
      for (const o of request.orders) if ((o.type ?? "market") === "limit" && o.limit_price === undefined) throw new Error(`${o.symbol}: a limit order needs limit_price.`);
      const s = await snapshot(), orders = request.orders.map(normalize);
      // Gross and net caps need a mark for every position held, not only the symbols traded.
      return check(orders, s, await quotes([...new Set([...orders.map((o) => o.symbol), ...s.positions.map((p) => p.symbol)])]), request);
    },

    async rebalance(request) {
      const s = await snapshot(), equity = Number(s.account.equity), buffer = request.cash_buffer ?? 0.02, minUsd = request.min_trade_usd ?? 50;
      const held = Object.fromEntries(s.positions.map((p) => [p.symbol, Number(p.qty)]));
      const targets = { ...request.target_weights };
      for (const sym of Object.keys(held)) if (!(sym in targets) && request.liquidate_others) targets[sym] = 0;
      const symbols = Object.keys(targets);
      if (!symbols.length) throw new Error("No target weights.");
      const gross = Object.values(targets).reduce((a, w) => a + Math.abs(w), 0);
      if (gross > 1 + 1e-9 && !request.allow_leverage) throw new Error(`Target weights sum to ${gross.toFixed(4)} gross; above 1 needs allow_leverage.`);
      for (const [sym, w] of Object.entries(targets)) if (w < 0 && !request.allow_short) throw new Error(`${sym}: negative weight needs allow_short.`);
      const market = await quotes([...new Set([...symbols, ...Object.keys(held)])]), orders = [], plan = [];
      for (const sym of symbols) {
        const want = Math.trunc(targets[sym] * equity * (1 - buffer) / market[sym].price), have = held[sym] ?? 0, d = want - have;
        plan.push([sym, targets[sym], have, want, d]);
        if (d !== 0 && Math.abs(d) * market[sym].price >= minUsd) orders.push({ symbol: sym, side: d > 0 ? "buy" : "sell", qty: Math.abs(d), type: "market", tif: "day" });
      }
      orders.sort((a, b) => (a.side === b.side ? 0 : a.side === "sell" ? -1 : 1)); // sells first free cash
      const result = orders.length ? check(orders, s, market, request) : { paper: true, accepted: true, token: null, rows: [], note: "Already at target within min_trade_usd; nothing to send." };
      return { equity, plan: { columns: ["symbol", "target_weight", "held", "target_shares", "change"], rows: plan }, orders, ...result };
    },

    async send(request) {
      if ((request.token === undefined) === (request.cancel_order_ids === undefined)) throw new Error("Send either token (to place previewed orders) or cancel_order_ids.");
      if (request.cancel_order_ids) {
        const rows = [];
        for (const id of request.cancel_order_ids) { try { await call(PAPER_TRADING, `/v2/orders/${encodeURIComponent(id)}`, { method: "DELETE" }); rows.push([id, "cancel_requested"]); } catch (e) { rows.push([id, e.message]); } }
        log.append({ at: now().toISOString(), kind: "cancel", rows });
        return { paper: true, columns: ["order_id", "result"], rows, order_log: log.head() };
      }
      const [payload, mac] = String(request.token).split(".");
      const expected = Buffer.from(sign(payload ?? "")), got = Buffer.from(mac ?? "");
      if (!payload || got.length !== expected.length || !timingSafeEqual(got, expected)) throw new Error("This token was not issued by this server session; preview again.");
      const { orders, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (now().getTime() / 1000 > exp) throw new Error("The token has expired (five minutes); preview again so the checks see current prices.");
      if (used.has(mac)) throw new Error("This token was already used; preview again to send more orders.");
      const kill = killState(home);
      if (kill.engaged) throw new Error(`The kill switch is engaged (${kill.source}); nothing was sent.`);
      used.add(mac);
      const tag = sha256(mac).slice(0, 16), rows = [];
      for (const [i, o] of orders.entries()) {
        const body = { symbol: o.symbol, qty: String(o.qty), side: o.side, type: o.type, time_in_force: o.tif, client_order_id: `canli-${tag}-${i}`, ...(o.limit_price !== undefined ? { limit_price: String(o.limit_price) } : {}) };
        try { const r = await call(PAPER_TRADING, "/v2/orders", { method: "POST", body }); rows.push([o.symbol, o.side, o.qty, r.id, r.status, body.client_order_id]); }
        catch (e) {
          // A timeout, a 5xx or a duplicate-id refusal leaves the order's fate unknown: ask Alpaca by
          // the client order id instead of guessing, so nothing is reported placed or missing wrongly.
          if (e.uncertain || e.status === 422) {
            try { const r = await call(PAPER_TRADING, `/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(body.client_order_id)}`); rows.push([o.symbol, o.side, o.qty, r.id, r.status, body.client_order_id]); continue; }
            catch (e2) { if (e2.status !== 404) { rows.push([o.symbol, o.side, o.qty, null, `unknown: ${e.message}; look up ${body.client_order_id} before resending`, body.client_order_id]); continue; } }
          }
          rows.push([o.symbol, o.side, o.qty, null, `not placed: ${e.message}`, body.client_order_id]);
        }
      }
      log.append({ at: now().toISOString(), kind: "send", token_hash: sha256(mac), rows });
      return { paper: true, columns: ["symbol", "side", "qty", "order_id", "status", "client_order_id"], rows, order_log: log.head(), note: "Each order carries a client_order_id; Alpaca refuses a repeated id, so a retry cannot fill twice." };
    },
  };
}
