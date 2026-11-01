// Everything here talks to a stand-in for each broker that records what it was asked. No real order
// has been sent by these tests, and no real key is used.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, verify } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { coinbaseToken } from "../src/adapters/coinbase.mjs";
import { makeHttp } from "../src/http.mjs";
import { readIntent } from "../src/intent.mjs";
import { run, STOP_FILE } from "../src/send.mjs";
import { clean, Refused } from "../src/util.mjs";

const CLI = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));
const ok = (json, status = 200) => ({ status, ok: status >= 200 && status < 300, json, text: JSON.stringify(json) });

function setup(t, { orders = [{ symbol: "AAPL", side: "buy", quantity: 2, type: "market" }], limits = null, reason = "a test" } = {}) {
  const home = mkdtempSync(path.join(tmpdir(), "canli-broker-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const file = path.join(home, "orders.json");
  writeFileSync(file, JSON.stringify({ schema: "canli.order-intent.v1", reason, orders }));
  if (limits) writeFileSync(path.join(home, "broker-limits.json"), JSON.stringify(limits));
  return { home, file };
}
const LIMITS = { live_enabled: true, max_order_usd: 1000, max_day_usd: 2000, allowed_symbols: ["AAPL", "MSFT"] };
const PAPER = { ALPACA_PAPER_KEY_ID: "PKTEST", ALPACA_PAPER_SECRET_KEY: "s3cret" };
const LIVE = { ALPACA_LIVE_KEY_ID: "AKTEST", ALPACA_LIVE_SECRET_KEY: "s3cret" };

// A stand-in for Alpaca: last trade 100, holding nothing unless told, every order accepted unless told.
function alpacaStub({ held = 0, refuse = null, boom = null } = {}) {
  const calls = [];
  const http = async (url, opts = {}) => {
    calls.push({ url, method: opts.method ?? "GET", body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers });
    if (url.includes("/trades/latest")) return ok({ trade: { p: 100 } });
    if (url.includes("/v2/positions/")) return held ? ok({ qty: String(held) }) : ok({}, 404);
    if (url.endsWith("/v2/orders")) {
      const n = calls.filter((c) => c.url.endsWith("/v2/orders")).length;
      if (boom === n) throw new Error("connection lost");
      if (refuse === n) return ok({ message: "insufficient buying power" }, 403);
      return ok({ id: `o${n}`, status: "accepted" });
    }
    return ok({}, 404);
  };
  return { http, calls, orders: () => calls.filter((c) => c.url.endsWith("/v2/orders")) };
}
const go = (extra) => run({ command: "send", broker: "alpaca", env: PAPER, ask: async () => true, print: () => {}, ...extra });

test("the order file is read strictly, and what it says is cleaned before it is printed", () => {
  const base = { schema: "canli.order-intent.v1", orders: [{ symbol: "AAPL", side: "buy", quantity: 1, type: "market" }] };
  assert.equal(readIntent(JSON.stringify(base)).intent.orders[0].time_in_force, "day");
  const bad = (patch, why) => assert.throws(() => readIntent(JSON.stringify(patch)), why);
  bad({ ...base, schema: "x" }, /schema/);
  bad({ ...base, orders: [] }, /no orders/);
  const o = base.orders[0];
  bad({ ...base, orders: [{ ...o, symbol: "aapl; rm -rf" }] }, /upper case/);
  bad({ ...base, orders: [{ ...o, side: "short" }] }, /buy or sell/);
  bad({ ...base, orders: [{ ...o, quantity: -1 }] }, /positive/);
  bad({ ...base, orders: [{ ...o, notional_usd: 5 }] }, /one of them/);
  bad({ ...base, orders: [{ ...o, type: "stop" }] }, /market or limit/);
  bad({ ...base, orders: [{ ...o, type: "limit" }] }, /limit_price/);
  bad({ ...base, orders: [{ ...o, leverage: 10 }] }, /does not understand/);
  assert.throws(() => readIntent("not json"), /not JSON/);
  assert.throws(() => readIntent("[]"), /not an object/);
  assert.equal(clean("safe\u001b[2Jtext‮"), "safe [2Jtext");
  const { hash } = readIntent(JSON.stringify(base));
  assert.equal(readIntent(JSON.stringify({ ...base, reason: "another reason" })).hash, hash, "the hash is of the orders");
  assert.notEqual(readIntent(JSON.stringify({ ...base, orders: [{ ...o, quantity: 2 }] })).hash, hash);
});

test("paper is the default: the paper host, paper keys, and nothing near the live host", async (t) => {
  const { home, file } = setup(t), s = alpacaStub();
  const r = await go({ file, home, http: s.http });
  assert.equal(r.sent, 1);
  assert.ok(s.calls.every((c) => !c.url.startsWith("https://api.alpaca.markets")));
  assert.equal(s.orders()[0].url, "https://paper-api.alpaca.markets/v2/orders");
  assert.equal(s.orders()[0].headers["APCA-API-KEY-ID"], "PKTEST");
  assert.deepEqual({ ...s.orders()[0].body, client_order_id: undefined }, { symbol: "AAPL", side: "buy", type: "market", time_in_force: "day", qty: "2", client_order_id: undefined });
  assert.match(s.orders()[0].body.client_order_id, /^canli-[0-9a-f]{16}-0$/);
});

test("a key for one environment is refused on the other, and a missing key names what to set, never a value", async (t) => {
  const { home, file } = setup(t, { limits: LIMITS }), s = alpacaStub();
  await assert.rejects(go({ file, home, http: s.http, env: { ALPACA_PAPER_KEY_ID: "AKLIVE", ALPACA_PAPER_SECRET_KEY: "x" } }), /does not look like a paper key/);
  await assert.rejects(go({ file, home, http: s.http, live: true, env: { ALPACA_LIVE_KEY_ID: "PKPAPER", ALPACA_LIVE_SECRET_KEY: "x" } }), /does not look like a live key/);
  await assert.rejects(go({ file, home, http: s.http, env: {} }), /Set ALPACA_PAPER_KEY_ID and ALPACA_PAPER_SECRET_KEY/);
  assert.equal(s.calls.length, 0);
});

test("live needs your limits file, and each limit holds", async (t) => {
  const none = setup(t), s = alpacaStub();
  await assert.rejects(go({ ...none, http: s.http, live: true, env: LIVE }), /need your limits file/);
  const off = setup(t, { limits: { ...LIMITS, live_enabled: false } });
  await assert.rejects(go({ ...off, http: s.http, live: true, env: LIVE }), /live_enabled/);
  const notListed = setup(t, { limits: LIMITS, orders: [{ symbol: "TSLA", side: "buy", quantity: 1, type: "market" }] });
  await assert.rejects(go({ ...notListed, http: s.http, live: true, env: LIVE }), /TSLA is not in allowed_symbols/);
  const big = setup(t, { limits: LIMITS, orders: [{ symbol: "AAPL", side: "buy", quantity: 11, type: "market" }] });
  await assert.rejects(go({ ...big, http: s.http, live: true, env: LIVE }), /over max_order_usd/);
  assert.equal(s.orders().length, 0, "nothing was sent in any of those");
});

test("the day's cap counts what was already sent", async (t) => {
  const a = setup(t, { limits: { ...LIMITS, max_day_usd: 1500 }, orders: [{ symbol: "AAPL", side: "buy", quantity: 10, type: "market" }] }), s = alpacaStub();
  await go({ ...a, http: s.http, live: true, env: LIVE });
  const second = path.join(a.home, "more.json");
  writeFileSync(second, JSON.stringify({ schema: "canli.order-intent.v1", reason: "x", orders: [{ symbol: "MSFT", side: "buy", quantity: 6, type: "market" }] }));
  await assert.rejects(go({ file: second, home: a.home, http: s.http, live: true, env: LIVE }), /over max_day_usd/);
  assert.equal(s.orders().length, 1);
});

test("the day's cap covers every broker together, and counts an order whose outcome is unknown", async (t) => {
  const a = setup(t, { limits: { ...LIMITS, max_day_usd: 1500 }, orders: [{ symbol: "AAPL", side: "buy", quantity: 10, type: "market" }] });
  await go({ ...a, http: alpacaStub().http, live: true, env: LIVE });
  const more = path.join(a.home, "tradier.json");
  writeFileSync(more, JSON.stringify({ schema: "canli.order-intent.v1", reason: "x", orders: [{ symbol: "MSFT", side: "buy", quantity: 12, type: "market" }] }));
  const quotes = async (u) => (u.includes("/markets/quotes") ? ok({ quotes: { quote: { last: 50 } } }) : ok({}, 404));
  await assert.rejects(run({ command: "send", broker: "tradier", live: true, env: { TRADIER_TOKEN: "t", TRADIER_ACCOUNT: "a" }, file: more, home: a.home, http: quotes, ask: async () => true, print: () => {} }), /already sent today that is over max_day_usd/, "$1,000 at Alpaca and $600 at Tradier");
  const b = setup(t, { limits: { ...LIMITS, max_day_usd: 1500 }, orders: [{ symbol: "AAPL", side: "buy", quantity: 10, type: "market" }] });
  await assert.rejects(go({ ...b, http: alpacaStub({ boom: 1 }).http, live: true, env: LIVE }), /connection lost/);
  const after = path.join(b.home, "next.json");
  writeFileSync(after, JSON.stringify({ schema: "canli.order-intent.v1", reason: "x", orders: [{ symbol: "MSFT", side: "buy", quantity: 6, type: "market" }] }));
  await assert.rejects(go({ file: after, home: b.home, http: alpacaStub().http, live: true, env: LIVE }), /over max_day_usd/, "the unknown order may have gone through");
});

test("live means typing a phrase tied to this file: --yes cannot skip it, and a wrong answer sends nothing", async (t) => {
  const a = setup(t, { limits: LIMITS }), s = alpacaStub();
  await assert.rejects(go({ ...a, http: s.http, live: true, env: LIVE, yes: true }), /--yes works only for paper/);
  let asked = null;
  await assert.rejects(go({ ...a, http: s.http, live: true, env: LIVE, ask: async (q, want) => { asked = want; return false; } }), /Not confirmed/);
  assert.match(asked, /^SEND 1 LIVE [0-9A-F]{4}$/);
  assert.equal(s.orders().length, 0);
  await go({ ...a, http: s.http, live: true, env: LIVE });
  assert.equal(s.orders()[0].url, "https://api.alpaca.markets/v2/orders");
});

test("short selling is refused, and when live a holding that cannot be read is refused too", async (t) => {
  const sell = { orders: [{ symbol: "AAPL", side: "sell", quantity: 5, type: "market" }] };
  const a = setup(t, sell);
  await assert.rejects(go({ ...a, http: alpacaStub({ held: 3 }).http }), /Short selling is refused/);
  const fine = alpacaStub({ held: 5 });
  assert.equal((await go({ ...setup(t, sell), http: fine.http })).sent, 1);
  const blind = async (url, o) => (url.includes("/positions/") ? ok({}, 500) : fine.http(url, o));
  await assert.rejects(go({ ...setup(t, { ...sell, limits: LIMITS }), http: blind, live: true, env: LIVE }), /could not be read/);
});

test("the stop file stops everything, before a run and in the middle of one", async (t) => {
  const a = setup(t), s = alpacaStub();
  writeFileSync(path.join(a.home, STOP_FILE), "stop");
  await assert.rejects(go({ ...a, http: s.http }), /nothing is sent/);
  assert.equal(s.calls.length, 0);
  const b = setup(t, { orders: [{ symbol: "AAPL", side: "buy", quantity: 1, type: "market" }, { symbol: "MSFT", side: "buy", quantity: 1, type: "market" }] }), m = alpacaStub();
  const http = async (url, o) => { const r = await m.http(url, o); if (url.endsWith("/v2/orders")) writeFileSync(path.join(b.home, STOP_FILE), "stop"); return r; };
  await assert.rejects(go({ ...b, http }), /appeared, so this stopped after 1 order/);
  assert.equal(m.orders().length, 1);
});

test("a run stops at the first failure, says what went out, and a rerun sends only what did not", async (t) => {
  const orders = ["AAPL", "MSFT", "GOOG"].map((symbol) => ({ symbol, side: "buy", quantity: 1, type: "market" }));
  const a = setup(t, { orders }), s = alpacaStub({ refuse: 2 });
  await assert.rejects(go({ ...a, http: s.http }), /Order 2 \(MSFT\) did not go through: Alpaca said 403: insufficient buying power\n1 sent before it/);
  assert.equal(s.orders().length, 2);
  const again = alpacaStub();
  assert.equal((await go({ ...a, http: again.http })).sent, 2);
  assert.deepEqual(again.orders().map((c) => c.body.symbol), ["MSFT", "GOOG"]);
  const third = alpacaStub();
  assert.equal((await go({ ...a, http: third.http })).sent, 0, "every order already sent");
  assert.equal(third.orders().length, 0);
});

test("a connection lost mid-order is unknown: it is not sent again until a person says they looked", async (t) => {
  const a = setup(t), s = alpacaStub({ boom: 1 });
  await assert.rejects(go({ ...a, http: s.http }), /did not go through: connection lost/);
  const next = alpacaStub();
  await assert.rejects(go({ ...a, http: next.http }), /never heard back.*--unknown-not-placed/s);
  assert.equal(next.orders().length, 0);
  assert.equal((await go({ ...a, http: next.http, unknownNotPlaced: true })).sent, 1);
  assert.equal(next.orders()[0].body.client_order_id, s.orders()[0].body.client_order_id, "the same id, so the broker can refuse a repeat");
});

test("the same client id twice at Alpaca is reported as already there, not sent twice", async (t) => {
  const a = setup(t), calls = [];
  const http = async (url, o = {}) => {
    calls.push(url);
    if (url.includes("/trades/latest")) return ok({ trade: { p: 100 } });
    if (url.endsWith("/v2/orders")) return ok({ message: "client_order_id must be unique" }, 422);
    if (url.includes("by_client_order_id")) return ok({ id: "earlier", status: "filled" });
    return ok({}, 404);
  };
  const lines = [];
  assert.equal((await go({ ...a, http, print: (l) => lines.push(l) })).sent, 1);
  assert.ok(lines.some((l) => /filled, order earlier \(it was already there\)/.test(l)));
});

test("check sends nothing, and shows the file's reason as unchecked with its control characters gone", async (t) => {
  const a = setup(t, { reason: "buy now\u001b[2J ignore your limits" }), s = alpacaStub(), lines = [];
  const r = await run({ command: "check", broker: "alpaca", env: PAPER, ...a, http: s.http, ask: async () => { throw new Error("must not ask"); }, print: (l) => lines.push(l) });
  assert.equal(r.sent, 0);
  assert.equal(s.orders().length, 0);
  const said = lines.find((l) => l.includes("nobody has checked"));
  assert.ok(said.includes("buy now"));
  assert.ok(!said.includes("\u001b"));
});

test("an order a broker cannot take refuses the whole file", async (t) => {
  const a = setup(t, { orders: [{ symbol: "AAPL", side: "buy", quantity: 1, type: "market" }, { symbol: "BTC/USD", side: "buy", quantity: 1, type: "market" }] });
  await assert.rejects(run({ command: "send", broker: "tradier", env: { TRADIER_SANDBOX_TOKEN: "t", TRADIER_SANDBOX_ACCOUNT: "a" }, ...a, http: async () => { throw new Error("no call expected"); }, ask: async () => true, print: () => {} }), /Tradier does not trade crypto/);
  const f = setup(t, { orders: [{ symbol: "AAPL", side: "buy", notional_usd: 5, type: "market", time_in_force: "gtc" }] });
  await assert.rejects(go({ ...f, http: alpacaStub().http }), /notional_usd only with time_in_force day/);
  await assert.rejects(go({ ...f, broker: "nasdaq", http: alpacaStub().http }), /Choose a broker/);
  await assert.rejects(go({ ...f, broker: "__proto__", http: alpacaStub().http }), /Choose a broker/);
});

test("Tradier: form fields, the sandbox host, and a 200 that was rejected further on is a failure", async (t) => {
  const a = setup(t), env = { TRADIER_SANDBOX_TOKEN: "tok", TRADIER_SANDBOX_ACCOUNT: "VA1" };
  let body = null, url = null, status = "open";
  const http = async (u, o = {}) => {
    if (u.includes("/markets/quotes")) return ok({ quotes: { quote: { last: 50 } } });
    if (o.method === "POST") { body = new URLSearchParams(o.body); url = u; return ok({ order: { id: 9, status: "ok" } }); }
    if (u.endsWith("/orders/9")) return ok({ order: { id: 9, status, reason_description: "no funds" } });
    return ok({}, 404);
  };
  const opts = { command: "send", broker: "tradier", env, ...a, http, ask: async () => true, print: () => {} };
  assert.equal((await run(opts)).sent, 1);
  assert.equal(url, "https://sandbox.tradier.com/v1/accounts/VA1/orders");
  assert.deepEqual(Object.fromEntries(["class", "symbol", "side", "quantity", "type", "duration"].map((k) => [k, body.get(k)])), { class: "equity", symbol: "AAPL", side: "buy", quantity: "2", type: "market", duration: "day" });
  status = "rejected";
  const b = setup(t);
  await assert.rejects(run({ ...opts, ...b }), /Tradier rejected order 9: no funds/);
});

test("IBKR: a paper run refuses a live login and back, and its warnings wait for a person", async (t) => {
  const a = setup(t);
  const gateway = (accounts, { warn = true } = {}) => {
    const log = [];
    const http = async (u, o = {}) => {
      log.push([u, o.method ?? "GET", o.body ?? null]);
      if (u.endsWith("/iserver/accounts")) return ok({ accounts });
      if (u.includes("/secdef/search")) return ok([{ symbol: "AAPL", conid: 265598, description: "NASDAQ", sections: [{ secType: "STK" }] }, { symbol: "AAPL", conid: 1, description: "MEXI", sections: [{ secType: "STK" }] }]);
      if (u.includes("/marketdata/snapshot")) return ok([{ 31: "C100.5" }]);
      if (u.endsWith("/orders")) return ok(warn ? [{ id: "r1", message: ["This order is large."] }] : [{ order_id: "77", order_status: "Submitted" }]);
      if (u.includes("/iserver/reply/r1")) return ok([{ order_id: "77", order_status: "Submitted" }]);
      return ok({}, 404);
    };
    return { http, log };
  };
  const opts = { command: "send", broker: "ibkr", env: {}, ...a, print: () => {} };
  await assert.rejects(run({ ...opts, http: gateway(["U123"]).http, ask: async () => true }), /logged in to a live account/);
  writeFileSync(path.join(a.home, "broker-limits.json"), JSON.stringify(LIMITS));
  await assert.rejects(run({ ...opts, live: true, http: gateway(["DU123"]).http, ask: async () => true }), /logged in to a paper account/);
  await assert.rejects(run({ ...opts, http: gateway(["DU1", "DU2"]).http, ask: async () => true }), /set IBKR_ACCOUNT/);
  const refused = gateway(["DU123"]), seen = [];
  await assert.rejects(run({ ...opts, http: refused.http, ask: async (q, want) => { seen.push(q); return !q.includes("IBKR asks"); } }), /did not accept IBKR's warning/);
  assert.ok(seen.some((q) => q.includes("This order is large.")));
  assert.equal(refused.log.filter(([u]) => u.includes("/reply/")).length, 0, "a warning is never accepted on the person's behalf");
  const b = setup(t), yes = gateway(["DU123"]);
  assert.equal((await run({ ...opts, ...b, http: yes.http, ask: async () => true })).sent, 1);
  const sent = JSON.parse(yes.log.find(([u, m]) => u.endsWith("/orders") && m === "POST")[2]).orders[0];
  assert.deepEqual({ conid: sent.conid, orderType: sent.orderType, side: sent.side, quantity: sent.quantity, tif: sent.tif }, { conid: 265598, orderType: "MKT", side: "BUY", quantity: 2, tif: "DAY" });
  assert.ok(yes.log.every(([u]) => u.startsWith("https://localhost:5000/v1/api/")));
});

test("Coinbase: a token anyone can verify, and a paper run only previews", async (t) => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const token = coinbaseToken("organizations/o/apiKeys/k", privateKey, "POST", "/api/v3/brokerage/orders", 1000, "aa");
  const [head, body, sig] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(body, "base64url")), { sub: "organizations/o/apiKeys/k", iss: "cdp", nbf: 1000, exp: 1120, uri: "POST api.coinbase.com/api/v3/brokerage/orders" });
  assert.deepEqual(JSON.parse(Buffer.from(head, "base64url")), { alg: "ES256", kid: "organizations/o/apiKeys/k", nonce: "aa", typ: "JWT" });
  assert.ok(verify("sha256", Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")));
  const a = setup(t, { orders: [{ symbol: "BTC/USD", side: "buy", notional_usd: 50, type: "market", time_in_force: "gtc" }] }), calls = [];
  const http = async (u, o = {}) => {
    calls.push([u, o.method ?? "GET", o.body ? JSON.parse(o.body) : null]);
    if (u.endsWith("/orders/preview")) return ok({ order_total: "50.3", errs: [] });
    if (u.endsWith("/orders")) return ok({ success: true, success_response: { order_id: "cb1" } });
    return ok({}, 404);
  };
  const env = { COINBASE_KEY_NAME: "organizations/o/apiKeys/k", COINBASE_KEY_SECRET: pem.replace(/\n/g, "\\n") };
  const lines = [];
  await run({ command: "send", broker: "coinbase", env, ...a, http, ask: async () => true, print: (l) => lines.push(l) });
  assert.ok(lines.some((l) => /previewed only, nothing placed/.test(l)));
  assert.equal(calls.filter(([u]) => u.endsWith("/orders")).length, 0, "paper places nothing");
  assert.deepEqual(calls.find(([u]) => u.endsWith("/orders/preview"))[2].order_configuration, { market_market_ioc: { quote_size: "50" } });
  const b = setup(t, { limits: { ...LIMITS, allowed_symbols: "any" }, orders: [{ symbol: "BTC/USD", side: "buy", notional_usd: 50, type: "market", time_in_force: "gtc" }] });
  await run({ command: "send", broker: "coinbase", live: true, env, ...b, http, ask: async () => true, print: () => {} });
  const live = calls.find(([u]) => u.endsWith("/orders"));
  assert.equal(live[0], "https://api.coinbase.com/api/v3/brokerage/orders");
  assert.match(live[2].client_order_id, /^canli-/);
});

test("the local gateway is never simply trusted: no certificate file, no request", async () => {
  const http = makeHttp({});
  await assert.rejects(http("https://localhost:5000/v1/api/iserver/accounts"), /Set CANLI_IBKR_CA/);
  await assert.rejects(makeHttp({ CANLI_IBKR_CA: "/no/such/file" })("https://localhost:5000/v1/api/iserver/accounts"), /could not be read/);
  assert.doesNotMatch(readFileSync(fileURLToPath(new URL("../src/http.mjs", import.meta.url)), "utf8"), /rejectUnauthorized/);
});

test("the journal holds no secrets, and its file is private", async (t) => {
  const a = setup(t), s = alpacaStub();
  await go({ ...a, http: s.http });
  const text = readFileSync(path.join(a.home, "broker-journal.jsonl"), "utf8");
  assert.ok(!text.includes("s3cret") && !text.includes("PKTEST"));
  assert.match(text, /"event":"sent"/);
});

test("the source reaches only the brokers' own hosts, and is not an MCP tool", () => {
  const dir = fileURLToPath(new URL("../src/", import.meta.url)), files = [...readdirSync(dir).filter((f) => f.endsWith(".mjs")), ...readdirSync(path.join(dir, "adapters")).map((f) => `adapters/${f}`)];
  const allowed = new Set(["paper-api.alpaca.markets", "api.alpaca.markets", "data.alpaca.markets", "sandbox.tradier.com", "api.tradier.com", "docs.alpaca.markets", "docs.tradier.com", "docs.cdp.coinbase.com", "localhost"]);
  for (const f of files) {
    const text = readFileSync(path.join(dir, f), "utf8");
    for (const m of text.matchAll(/https:\/\/([a-z0-9.-]+)/g)) assert.ok(allowed.has(m[1]), `${f} reaches ${m[1]}`);
    assert.doesNotMatch(text, /@modelcontextprotocol|registerTool|child_process|\beval\s*\(/, f);
  }
  assert.match(readFileSync(path.join(dir, "adapters/coinbase.mjs"), "utf8"), /const HOST = "api\.coinbase\.com"/);
  assert.deepEqual(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).dependencies, undefined, "no dependencies at all");
});

test("from the command line: with no terminal, a person cannot be asked, so nothing is sent", (t) => {
  const a = setup(t), env = { ...process.env, ...PAPER, CANLI_HOME: a.home };
  const help = spawnSync(process.execPath, [CLI], { encoding: "utf8", env });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /canli-broker check/);
  assert.equal(spawnSync(process.execPath, [CLI, "nonsense"], { encoding: "utf8", env }).status, 2);
  const noKey = spawnSync(process.execPath, [CLI, "check", a.file, "--broker", "alpaca"], { encoding: "utf8", env: { PATH: process.env.PATH, CANLI_HOME: a.home } });
  assert.equal(noKey.status, 1);
  assert.match(noKey.stderr, /Set ALPACA_PAPER_KEY_ID/);
  const stop = spawnSync(process.execPath, [CLI, "stop"], { encoding: "utf8", env });
  assert.equal(stop.status, 0);
  assert.ok(existsSync(path.join(a.home, STOP_FILE)));
  const stopped = spawnSync(process.execPath, [CLI, "send", a.file, "--broker", "alpaca"], { encoding: "utf8", env });
  assert.equal(stopped.status, 1);
  assert.match(stopped.stderr, /nothing is sent/);
  assert.ok(Refused);
});
