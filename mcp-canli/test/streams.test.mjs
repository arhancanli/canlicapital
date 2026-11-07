// local/streams.mjs: which exchange carries a symbol, and prices pushed over a WebSocket, with a stand-in socket
// so nothing leaves the machine. test/stream-preload.mjs and quotes-stream below run it inside the server.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { createStreams, feedsFor } from "../local/streams.mjs";
import { createLive } from "../src/live.mjs";
import { runLiveQuotes } from "../src/quotes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tick = () => new Promise((r) => setImmediate(r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class FakeSocket {
  static all = [];
  constructor(url) { this.url = url; this.sent = []; this.handlers = {}; this.closed = false; FakeSocket.all.push(this); }
  on(name, fn) { (this.handlers[name] ??= []).push(fn); }
  emit(name, x) { for (const fn of this.handlers[name] ?? []) fn(x); }
  send(x) { this.sent.push(JSON.parse(x)); }
  close() { if (this.closed) return; this.closed = true; this.emit("close"); }
  say(m) { this.emit("message", Buffer.from(JSON.stringify(m))); }
}
const fresh = () => { FakeSocket.all = []; };
const make = (env = {}) => {
  const prices = [];
  const s = createStreams({ env, WS: FakeSocket, onPrice: (symbol, q) => prices.push([symbol, q.price, q.source]), setTimer: (fn) => { setImmediate(fn); return null; }, every: () => null, stopEvery: () => {} });
  return { s, prices };
};

test("which stream carries a symbol: crypto with no key, stocks only with keys, none when streams are off", () => {
  assert.deepEqual(feedsFor("BTC-USD", {}), ["coinbase", "kraken"]);
  assert.deepEqual(feedsFor("AAPL", {}), []);
  assert.deepEqual(feedsFor("AAPL", { ALPACA_API_KEY_ID: "k", ALPACA_API_SECRET_KEY: "s" }), ["alpaca"]);
  assert.deepEqual(feedsFor("AAPL", { FINNHUB_API_KEY: "f", APCA_API_KEY_ID: "k", APCA_API_SECRET_KEY: "s" }), ["alpaca", "finnhub"]);
  assert.deepEqual(feedsFor("BRK.B", { FINNHUB_API_KEY: "f" }), ["finnhub"]);
  assert.deepEqual(feedsFor("^GSPC", { FINNHUB_API_KEY: "f" }), [], "an index is left to the timer");
  assert.deepEqual(feedsFor("EURUSD=X", {}), []);
  assert.deepEqual(feedsFor("BTC-USD", { CANLI_STREAMS: "0" }), []);
});

test("Coinbase: one socket for every pair, prices as they come, and pairs taken off when no longer wanted", async () => {
  fresh();
  const { s, prices } = make();
  s.watch(["btc-usd", "ETH-USD", "AAPL"]);
  await tick();
  assert.equal(FakeSocket.all.length, 1, "AAPL has no stream without keys");
  const ws = FakeSocket.all[0];
  assert.equal(ws.url, "wss://ws-feed.exchange.coinbase.com");
  ws.emit("open");
  assert.deepEqual(ws.sent[0], { type: "subscribe", product_ids: ["BTC-USD", "ETH-USD"], channels: ["ticker"] });
  assert.equal(s.live("BTC-USD"), false, "not live before a price");
  ws.say({ type: "ticker", product_id: "BTC-USD", price: "70123.45", time: "2026-11-07T10:00:00.123Z" });
  ws.say({ type: "ticker", product_id: "SOL-USD", price: "150" });
  assert.deepEqual(prices, [["BTC-USD", 70123.45, "coinbase"]], "only what is wanted");
  assert.equal(s.live("BTC-USD"), true);
  assert.deepEqual(s.latest("BTC-USD"), { price: 70123.45, time: "2026-11-07T10:00:00.123Z", source: "coinbase", at: s.latest("BTC-USD").at });
  s.watch(["ETH-USD"]);
  assert.deepEqual(ws.sent.at(-1), { type: "unsubscribe", product_ids: ["BTC-USD"], channels: ["ticker"] });
  assert.equal(s.live("BTC-USD"), false);
  s.watch([]);
  assert.equal(ws.closed, true, "nothing wanted, socket closed");
  await tick();
  assert.equal(FakeSocket.all.length, 1, "and not opened again");
});

test("a pair Coinbase does not list goes to Kraken, as BASE/QUOTE", async () => {
  fresh();
  const { s, prices } = make();
  s.watch(["BTC-USD", "XYZ-USD"]);
  await tick();
  const cb = FakeSocket.all[0];
  cb.emit("open");
  cb.say({ type: "error", message: "Failed to subscribe", reason: "XYZ-USD is not a valid product" });
  assert.deepEqual(cb.sent.at(-1), { type: "subscribe", product_ids: ["BTC-USD"], channels: ["ticker"] });
  await tick();
  const kr = FakeSocket.all[1];
  assert.equal(kr.url, "wss://ws.kraken.com/v2");
  kr.emit("open");
  assert.deepEqual(kr.sent[0], { method: "subscribe", params: { channel: "ticker", symbol: ["XYZ/USD"] } });
  kr.say({ channel: "ticker", type: "update", data: [{ symbol: "XYZ/USD", last: 1.25 }] });
  assert.deepEqual(prices, [["XYZ-USD", 1.25, "kraken"]]);
  s.stop();
  assert.ok(cb.closed && kr.closed);
});

test("Coinbase unreachable: after three tries with no price its pairs go to Kraken; a closed socket that had priced reopens", async () => {
  fresh();
  const { s, prices } = make();
  s.watch(["ETH-USD"]);
  await tick();
  FakeSocket.all[0].emit("open");
  FakeSocket.all[0].say({ type: "ticker", product_id: "ETH-USD", price: "3000" });
  FakeSocket.all[0].close();
  await tick(); await tick();
  assert.equal(FakeSocket.all[1].url, "wss://ws-feed.exchange.coinbase.com", "reopened");
  for (let i = 1; i <= 3; i++) { FakeSocket.all[i]?.close(); await tick(); await tick(); }
  const last = FakeSocket.all.at(-1);
  assert.equal(last.url, "wss://ws.kraken.com/v2");
  assert.equal(s.live("ETH-USD"), false);
  last.emit("open");
  last.say({ channel: "ticker", type: "snapshot", data: [{ symbol: "ETH/USD", last: 3001.5, timestamp: "2026-11-07T10:00:01Z" }] });
  assert.deepEqual(prices.at(-1), ["ETH-USD", 3001.5, "kraken"]);
  assert.equal(s.live("ETH-USD"), true);
  s.stop();
});

test("Alpaca: keys first, symbols once authenticated, trades as prices", async () => {
  fresh();
  const { s, prices } = make({ ALPACA_API_KEY_ID: "id", ALPACA_API_SECRET_KEY: "secret" });
  s.watch(["AAPL", "MSFT"]);
  await tick();
  const ws = FakeSocket.all[0];
  assert.equal(ws.url, "wss://stream.data.alpaca.markets/v2/iex");
  ws.emit("open");
  assert.deepEqual(ws.sent, [{ action: "auth", key: "id", secret: "secret" }], "no symbols before authenticated");
  s.watch(["AAPL", "MSFT", "NVDA"]);
  assert.equal(ws.sent.length, 1, "still waiting");
  ws.say([{ T: "success", msg: "connected" }]);
  ws.say([{ T: "success", msg: "authenticated" }]);
  assert.deepEqual(ws.sent[1], { action: "subscribe", trades: ["AAPL", "MSFT", "NVDA"] });
  ws.say([{ T: "t", S: "AAPL", p: 230.5, t: "2026-11-07T15:00:00Z" }, { T: "q", S: "AAPL", bp: 1 }, { T: "t", S: "NVDA", p: 190.25, t: "2026-11-07T15:00:00Z" }]);
  assert.deepEqual(prices, [["AAPL", 230.5, "alpaca"], ["NVDA", 190.25, "alpaca"]]);
  s.stop();
});

test("Finnhub: the key in the address, one subscribe per symbol, the trades of a batch", async () => {
  fresh();
  const { s, prices } = make({ FINNHUB_API_KEY: "a b" });
  s.watch(["AAPL", "BTC-USD"]);
  await tick();
  const fh = FakeSocket.all.find((w) => new URL(w.url).host === "ws.finnhub.io");
  assert.equal(fh.url, "wss://ws.finnhub.io?token=a%20b");
  fh.emit("open");
  assert.deepEqual(fh.sent, [{ type: "subscribe", symbol: "AAPL" }]);
  fh.say({ type: "trade", data: [{ s: "AAPL", p: 230.1, t: 1794063600000 }, { s: "AAPL", p: 230.2, t: 1794063600500 }] });
  assert.deepEqual(prices, [["AAPL", 230.1, "finnhub"], ["AAPL", 230.2, "finnhub"]]);
  assert.equal(s.latest("AAPL").time, new Date(1794063600500).toISOString());
  fh.say({ type: "ping" });
  s.stop();
});

test("Massive: first for stocks with its key, the key once connected, symbols once authenticated, trades as prices", async () => {
  fresh();
  const env = { POLYGON_API_KEY: "pk", ALPACA_API_KEY_ID: "id", ALPACA_API_SECRET_KEY: "secret" };
  assert.deepEqual(feedsFor("AAPL", env), ["massive", "alpaca"]);
  const { s, prices } = make(env);
  s.watch(["AAPL", "MSFT"]);
  await tick();
  const ws = FakeSocket.all[0];
  assert.equal(ws.url, "wss://socket.massive.com/stocks");
  ws.emit("open");
  assert.deepEqual(ws.sent, [], "nothing until Massive says connected");
  ws.say([{ ev: "status", status: "connected", message: "Connected Successfully" }]);
  assert.deepEqual(ws.sent, [{ action: "auth", params: "pk" }]);
  ws.say([{ ev: "status", status: "auth_success", message: "authenticated" }]);
  assert.deepEqual(ws.sent[1], { action: "subscribe", params: "T.AAPL,T.MSFT" });
  ws.say([{ ev: "T", sym: "AAPL", p: 230.5, s: 100, t: 1794063600000 }, { ev: "Q", sym: "AAPL", bp: 1 }]);
  assert.deepEqual(prices, [["AAPL", 230.5, "massive"]]);
  s.watch(["AAPL"]);
  assert.deepEqual(ws.sent.at(-1), { action: "unsubscribe", params: "T.MSFT" });
  s.stop();
  fresh();
  const delayed = make({ MASSIVE_API_KEY: "k", MASSIVE_DATA_FEED: "delayed" }).s;
  delayed.watch(["AAPL"]);
  await tick();
  assert.equal(FakeSocket.all[0].url, "wss://delayed.massive.com/stocks");
  delayed.stop();
});

test("a key refused (Massive's auth_failed, Alpaca's 402) ends that feed at once and its symbols go to the next", async () => {
  fresh();
  const { s, prices } = make({ MASSIVE_API_KEY: "bad", ALPACA_API_KEY_ID: "id", ALPACA_API_SECRET_KEY: "wrong", FINNHUB_API_KEY: "f" });
  s.watch(["AAPL"]);
  await tick();
  const massive = FakeSocket.all[0];
  massive.emit("open");
  massive.say([{ ev: "status", status: "connected" }]);
  massive.say([{ ev: "status", status: "auth_failed", message: "authentication failed" }]);
  assert.ok(massive.closed);
  await tick();
  const alpaca = FakeSocket.all.find((w) => w.url.includes("alpaca"));
  assert.ok(alpaca, "Alpaca takes AAPL after one refusal, not three");
  alpaca.emit("open");
  alpaca.say([{ T: "error", code: 402, msg: "auth failed" }]);
  await tick();
  const fh = FakeSocket.all.find((w) => new URL(w.url).host === "ws.finnhub.io");
  assert.ok(fh, "then Finnhub");
  fh.emit("open");
  fh.say({ type: "trade", data: [{ s: "AAPL", p: 231, t: 1794063600000 }] });
  assert.deepEqual(prices, [["AAPL", 231, "finnhub"]]);
  assert.deepEqual(s.feeds(), { finnhub: ["AAPL"] });
  s.stop();
});

test("one-minute bars: by each price's own minute, a late price in its minute, the last two hours kept", async () => {
  fresh();
  const { s } = make();
  s.watch(["BTC-USD"]);
  await tick();
  const ws = FakeSocket.all[0];
  ws.emit("open");
  const tickAt = (iso, price) => ws.say({ type: "ticker", product_id: "BTC-USD", price: String(price), time: iso });
  tickAt("2026-11-07T15:00:05Z", 100); tickAt("2026-11-07T15:00:40Z", 103); tickAt("2026-11-07T15:00:59.9Z", 99);
  tickAt("2026-11-07T15:01:10Z", 101);
  tickAt("2026-11-07T15:00:30Z", 104); // late, into 15:00
  tickAt("2026-11-07T15:03:00Z", 102); // no price at 15:02: no bar
  assert.deepEqual(s.bars("btc-usd"), [
    { minute: "2026-11-07T15:00:00Z", open: 100, high: 104, low: 99, close: 104, prices: 4 },
    { minute: "2026-11-07T15:01:00Z", open: 101, high: 101, low: 101, close: 101, prices: 1 },
    { minute: "2026-11-07T15:03:00Z", open: 102, high: 102, low: 102, close: 102, prices: 1 },
  ]);
  const start = Date.parse("2026-11-07T16:00:00Z");
  for (let i = 0; i < 130; i += 1) tickAt(new Date(start + i * 60000).toISOString(), 200 + i);
  const kept = s.bars("BTC-USD");
  assert.equal(kept.length, 120);
  assert.equal(kept[0].open, 210, "the oldest ten went");
  tickAt("2026-11-07T15:00:10Z", 1);
  assert.equal(s.bars("BTC-USD").length, 120, "a price older than every bar kept is left out");
  assert.equal(s.bars("BTC-USD")[0].open, 210);
  s.stop();
});

test("the hub: one set of streams for every owner, the union watched, a timed want running out, nothing left after", async () => {
  fresh();
  let clock = 1_000_000;
  const timers = [];
  const hub = createLive({ env: {}, WS: FakeSocket, load: () => import("../local/streams.mjs"), now: () => clock, setTimer: (fn, ms) => { timers.push([fn, ms]); return { unref() {} }; }, every: () => null, stopEvery: () => {} });
  const heard = [];
  hub.listen((symbol, q) => heard.push([symbol, q.price]));
  await hub.want("quote", ["BTC-USD"]);
  await hub.want("tool:ETH-USD", ["ETH-USD"], { forMs: 60000 });
  await tick();
  assert.equal(FakeSocket.all.length, 1, "one Coinbase socket for both");
  const ws = FakeSocket.all[0];
  ws.emit("open");
  assert.deepEqual(ws.sent.flatMap((m) => m.product_ids), ["BTC-USD", "ETH-USD"]);
  ws.say({ type: "ticker", product_id: "ETH-USD", price: "3000", time: "2026-11-07T15:00:00Z" });
  assert.deepEqual(heard, [["ETH-USD", 3000]]);
  assert.ok(hub.live("ETH-USD") && hub.bars("ETH-USD").length === 1);
  clock += 61000;
  await timers.at(-1)[0]();
  assert.deepEqual(ws.sent.at(-1), { type: "unsubscribe", product_ids: ["ETH-USD"], channels: ["ticker"] }, "the tool's minute ran out");
  await hub.drop("quote");
  assert.ok(ws.closed && !hub.running(), "nobody wants anything: closed");
  hub.stop();
});

test("live_quotes refuses on the hosted server and outside a running server, before any stream opens", async () => {
  await assert.rejects(runLiveQuotes({ hub: createLive(), readOnly: true, price: async () => ({}) }, { symbols: ["BTC-USD"] }), /hosted server keeps no connection/);
  await assert.rejects(runLiveQuotes({ hub: null, price: async () => ({}) }, { symbols: ["BTC-USD"] }), /inside a running server/);
});

test("live_quotes: a streamed pair with its bars, a stock with no stream from latest_price, both in one call", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "live-"));
  const c = new Client({ name: "live-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", path.join(HERE, "quote-preload.mjs"), "--import", path.join(HERE, "stream-preload.mjs"), path.join(HERE, "../src/server.mjs")], env: { PATH: process.env.PATH ?? "", HOME: home, CANLI_HOME: home, CANLI_CACHE_DIR: "" } }));
  try {
    const r = await c.callTool({ name: "run_tool", arguments: { name: "live_quotes", arguments: { symbols: ["BTC-USD", "AAPL"], wait_seconds: 5 } } });
    const body = JSON.parse(r.content[0].text);
    assert.ok(!r.isError, r.content[0].text);
    const [btc, aapl] = body.quotes;
    assert.equal(btc.streaming, true, JSON.stringify(btc));
    assert.match(btc.source, /Coinbase/);
    assert.ok(btc.price > 70000 && btc.bars.length >= 1 && btc.bars.at(-1).prices >= 1, JSON.stringify(btc));
    assert.equal(aapl.streaming, false);
    assert.match(aapl.note, /No stream carries it/);
    assert.ok(aapl.price > 100, JSON.stringify(aapl));
    assert.match(body.streaming_for, /15 minutes/);
    await wait(400);
    const again = JSON.parse((await c.callTool({ name: "run_tool", arguments: { name: "live_quotes", arguments: { symbols: ["BTC-USD"], minutes: 0, wait_seconds: 0 } } })).content[0].text);
    assert.equal(again.quotes[0].streaming, true, "still streaming from the first call");
    assert.ok(again.quotes[0].price > btc.price, "a fresher price");
    assert.equal(again.quotes[0].bars, undefined, "minutes 0: no bars");
  } finally {
    await c.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("canli://quote: a streamed pair notifies as it trades and reads at the streamed price", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "stream-"));
  const c = new Client({ name: "stream-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", path.join(HERE, "quote-preload.mjs"), "--import", path.join(HERE, "stream-preload.mjs"), path.join(HERE, "../src/server.mjs")], env: { PATH: process.env.PATH ?? "", HOME: home, CANLI_HOME: home, CANLI_CACHE_DIR: "", CANLI_QUOTE_SECONDS: "3600" } }));
  try {
    const read = async (uri) => JSON.parse((await c.readResource({ uri })).contents[0].text);
    const updates = [];
    c.setNotificationHandler("notifications/resources/updated", (n) => { updates.push(n.params.uri); });
    await c.subscribeResource({ uri: "canli://quote/BTC-USD" });
    for (const until = Date.now() + 10000; updates.length < 2 && Date.now() < until;) await wait(100);
    assert.ok(updates.length >= 2, "notified by the stream, with the timer at an hour");
    const body = await read("canli://quote/BTC-USD");
    const q = body.quotes[0];
    assert.equal(q.streamed_from, "coinbase", JSON.stringify(body));
    assert.ok(q.price >= 70000 && q.previous_close === 100, JSON.stringify(q));
    assert.match(body.streamed["BTC-USD"], /Coinbase/);
    await c.unsubscribeResource({ uri: "canli://quote/BTC-USD" });
    await wait(1200);
    const after = updates.length;
    await wait(1500);
    assert.equal(updates.length, after, "nothing after unsubscribing");
    assert.equal((await read("canli://quote/BTC-USD")).quotes[0].streamed_from, undefined, "unsubscribed, read as before");
  } finally {
    await c.close();
    rmSync(home, { recursive: true, force: true });
  }
});
