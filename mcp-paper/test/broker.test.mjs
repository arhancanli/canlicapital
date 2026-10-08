// The broker against a fake Alpaca paper API: paper keys only, no token without passing checks,
// tokens bound to their orders, single use, expiring, the kill switch read at send time, idempotent
// client order ids, and a verifiable hash-chained log.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createBroker, orderLog, paperCredentials } from "../src/broker.mjs";

const KEYS = { ALPACA_PAPER_KEY_ID: "PKTEST1234567890", ALPACA_PAPER_SECRET_KEY: "secret" };

function fakeAlpaca({ open = true, quotes = { AAPL: [199.9, 200.1], MSFT: [399.8, 400.2], SPY: [499.95, 500.05] }, failAfterPlacing = new Set(), flakyReads = 0 } = {}) {
  const calls = [], placed = new Map();
  let flaky = flakyReads;
  const positions = [{ symbol: "MSFT", qty: "10", market_value: "4000", avg_entry_price: "380", unrealized_pl: "200" }];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const u = new URL(url), reply = (status, body) => ({ ok: status < 300, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
    if ((init.method ?? "GET") === "GET" && flaky > 0) { flaky--; return reply(503, { message: "busy" }); }
    assert.ok(["paper-api.alpaca.markets", "data.alpaca.markets"].includes(u.host), `unexpected host ${u.host}`);
    if (u.pathname === "/v2/account") return reply(200, { status: "ACTIVE", currency: "USD", equity: "100000", cash: "96000", buying_power: "192000", trading_blocked: false, account_blocked: false });
    if (u.pathname === "/v2/positions") return reply(200, positions);
    if (u.pathname === "/v2/orders" && (init.method ?? "GET") === "GET") return reply(200, []);
    if (u.pathname === "/v2/clock") return reply(200, { is_open: open, next_open: "2026-10-09T13:30:00Z", next_close: "2026-10-08T20:00:00Z" });
    if (u.pathname === "/v2/stocks/quotes/latest") {
      const out = {};
      for (const s of u.searchParams.get("symbols").split(",")) if (quotes[s]) out[s] = { bp: quotes[s][0], ap: quotes[s][1], t: "2026-10-08T15:00:00Z" };
      return reply(200, { quotes: out });
    }
    if (u.pathname === "/v2/orders" && init.method === "POST") {
      const b = JSON.parse(init.body);
      if (placed.has(b.client_order_id)) return reply(422, { message: "client_order_id must be unique" });
      placed.set(b.client_order_id, b);
      if (failAfterPlacing.has(b.symbol)) throw new TypeError("fetch failed: socket hang up");
      return reply(200, { id: `ord-${placed.size}`, status: "accepted" });
    }
    if (u.pathname === "/v2/orders:by_client_order_id") { const id = u.searchParams.get("client_order_id"); return placed.has(id) ? reply(200, { id: `ord-${[...placed.keys()].indexOf(id) + 1}`, status: "accepted" }) : reply(404, { message: "order not found" }); }
    if (u.pathname.startsWith("/v2/orders/") && init.method === "DELETE") return reply(204);
    return reply(404, { message: "not found" });
  };
  return { fetchImpl, calls, placed };
}

function setup(opts = {}) {
  const home = mkdtempSync(join(tmpdir(), "canli-paper-"));
  const fake = fakeAlpaca(opts);
  let t = Date.parse("2026-10-08T15:00:00Z");
  const clock = { advance: (s) => { t += s * 1000; } };
  const broker = createBroker({ env: KEYS, home, fetchImpl: fake.fetchImpl, now: () => new Date(t), ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}) });
  return { home, fake, broker, clock, done: () => rmSync(home, { recursive: true, force: true }) };
}

test("only paper keys are accepted", () => {
  assert.throws(() => paperCredentials({}), /Set ALPACA_PAPER_KEY_ID/);
  assert.throws(() => paperCredentials({ ALPACA_PAPER_KEY_ID: "AKLIVE1234567890", ALPACA_PAPER_SECRET_KEY: "x" }), /not a paper key/);
  assert.deepEqual(paperCredentials(KEYS), { id: KEYS.ALPACA_PAPER_KEY_ID, secret: "secret" });
});

test("preview checks against the paper account and returns a token only when every order passes", async (t) => {
  const s = setup(); t.after(s.done);
  writeFileSync(join(s.home, "limits.json"), JSON.stringify({ max_order_notional: 30000 }));
  const ok = await s.broker.preview({ orders: [{ symbol: "AAPL", side: "buy", qty: 10 }] });
  assert.equal(ok.accepted, true, JSON.stringify(ok.rows));
  assert.match(ok.token, /^[\w-]+\.[\w-]+$/);
  const big = await s.broker.preview({ orders: [{ symbol: "AAPL", side: "buy", qty: 1000 }] });
  assert.equal(big.accepted, false);
  assert.equal(big.token, null);
  assert.ok(big.rows[0][4].includes("order_notional_cap"));
  const tighter = await s.broker.preview({ orders: [{ symbol: "AAPL", side: "buy", qty: 10 }], limits: { max_order_notional: 1000 } });
  assert.equal(tighter.accepted, false);
  for (const c of s.fake.calls) assert.equal(c.headers["APCA-API-KEY-ID"], KEYS.ALPACA_PAPER_KEY_ID);
});

test("a closed market refuses a market order, and a limit order needs a price", async (t) => {
  const s = setup({ open: false }); t.after(s.done);
  const r = await s.broker.preview({ orders: [{ symbol: "AAPL", side: "buy", qty: 1 }] });
  assert.equal(r.accepted, false);
  assert.ok(r.rows[0][4].includes("market_closed"));
  await assert.rejects(s.broker.preview({ orders: [{ symbol: "AAPL", side: "buy", qty: 1, type: "limit" }] }), /needs limit_price/);
});

test("send places exactly the previewed orders once, on the paper host, with idempotent ids", async (t) => {
  const s = setup(); t.after(s.done);
  const p = await s.broker.preview({ orders: [{ symbol: "AAPL", side: "buy", qty: 5 }, { symbol: "MSFT", side: "sell", qty: 2, type: "limit", limit_price: 401, tif: "gtc" }] });
  const sent = await s.broker.send({ token: p.token });
  assert.deepEqual(sent.rows.map((r) => [r[0], r[4]]), [["AAPL", "accepted"], ["MSFT", "accepted"]]);
  const posts = s.fake.calls.filter((c) => c.method === "POST");
  assert.equal(posts.length, 2);
  for (const c of posts) assert.match(c.url, /^https:\/\/paper-api\.alpaca\.markets\/v2\/orders$/);
  assert.deepEqual(posts[1].body, { symbol: "MSFT", qty: "2", side: "sell", type: "limit", time_in_force: "gtc", limit_price: "401", client_order_id: posts[1].body.client_order_id });
  await assert.rejects(s.broker.send({ token: p.token }), /already used/);
  assert.equal(s.fake.calls.filter((c) => c.method === "POST").length, 2);
});

test("forged, altered and expired tokens send nothing", async (t) => {
  const s = setup(); t.after(s.done);
  const p = await s.broker.preview({ orders: [{ symbol: "AAPL", side: "buy", qty: 5 }] });
  const [payload, mac] = p.token.split(".");
  const altered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url")), orders: [{ symbol: "AAPL", side: "buy", qty: 5000, type: "market", tif: "day" }] })).toString("base64url");
  await assert.rejects(s.broker.send({ token: `${altered}.${mac}` }), /not issued/);
  await assert.rejects(s.broker.send({ token: "garbage" }), /not issued/);
  const other = setup(); t.after(other.done);
  await assert.rejects(other.broker.send({ token: p.token }), /not issued/);
  s.clock.advance(301);
  await assert.rejects(s.broker.send({ token: p.token }), /expired/);
  assert.equal(s.fake.calls.filter((c) => c.method === "POST").length, 0);
});

test("the kill switch engaged after the preview stops the send", async (t) => {
  const s = setup(); t.after(s.done);
  const p = await s.broker.preview({ orders: [{ symbol: "AAPL", side: "buy", qty: 5 }] });
  writeFileSync(join(s.home, "KILL"), "");
  await assert.rejects(s.broker.send({ token: p.token }), /kill switch/);
  assert.equal(s.fake.calls.filter((c) => c.method === "POST").length, 0);
  const again = await s.broker.preview({ orders: [{ symbol: "AAPL", side: "buy", qty: 5 }] });
  assert.equal(again.accepted, false);
  assert.ok(again.rows[0][4].includes("kill_switch_engaged"));
});

test("rebalance turns weights into sells-first whole-share orders and a token", async (t) => {
  const s = setup(); t.after(s.done);
  const r = await s.broker.rebalance({ target_weights: { SPY: 0.5, AAPL: 0.1 }, liquidate_others: true });
  const bySym = Object.fromEntries(r.orders.map((o) => [o.symbol, o]));
  assert.equal(bySym.SPY.qty, Math.trunc(0.5 * 100000 * 0.98 / 500));
  assert.equal(bySym.AAPL.qty, Math.trunc(0.1 * 100000 * 0.98 / 200));
  assert.deepEqual(bySym.MSFT, { symbol: "MSFT", side: "sell", qty: 10, type: "market", tif: "day" });
  assert.equal(r.orders[0].side, "sell");
  assert.ok(r.token);
  await assert.rejects(s.broker.rebalance({ target_weights: { SPY: 0.8, AAPL: 0.5 } }), /allow_leverage/);
  await assert.rejects(s.broker.rebalance({ target_weights: { SPY: -0.2 } }), /allow_short/);
});

test("the order log is hash-chained and detects edits", async (t) => {
  const s = setup(); t.after(s.done);
  const p = await s.broker.preview({ orders: [{ symbol: "AAPL", side: "buy", qty: 1 }] });
  await s.broker.send({ token: p.token });
  await s.broker.send({ cancel_order_ids: ["ord-1"] });
  const log = orderLog(s.home);
  assert.deepEqual({ entries: log.head().entries, verified: log.head().verified }, { entries: 2, verified: true });
  const path = join(s.home, "paper-orders.jsonl"), lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  writeFileSync(path, `${lines[0].replace('"AAPL"', '"MSFT"')}\n${lines[1]}\n`);
  assert.equal(orderLog(s.home).head().verified, false);
});

test("reads retry through transient 503s; an order whose response is lost is resolved by its client order id", async (t) => {
  const s = setup({ flakyReads: 2, failAfterPlacing: new Set(["AAPL"]) }); t.after(s.done);
  const p = await s.broker.preview({ orders: [{ symbol: "AAPL", side: "buy", qty: 5 }, { symbol: "SPY", side: "buy", qty: 1 }] });
  assert.equal(p.accepted, true, JSON.stringify(p.rows));
  const sent = await s.broker.send({ token: p.token });
  assert.deepEqual(sent.rows.map((r) => [r[0], r[4]]), [["AAPL", "accepted"], ["SPY", "accepted"]]);
  assert.equal(s.fake.calls.filter((c) => c.method === "POST").length, 2);
});

test("a broker that never answers times out instead of hanging", async (t) => {
  const home = mkdtempSync(join(tmpdir(), "canli-paper-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  const broker = createBroker({ env: KEYS, home, fetchImpl: hang, timeoutMs: 50 });
  const t0 = Date.now();
  await assert.rejects(broker.account(), /no response in 0.05 s/);
  assert.ok(Date.now() - t0 < 5000);
});
