// canli://quote/{symbols*}: the latest price of up to ten symbols as a resource. On a local server a client can
// subscribe to the address (resources/subscribe): the server checks it every CANLI_QUOTE_SECONDS (default 15)
// and sends notifications/resources/updated when a price or its time changes, so a host can show prices as
// they move without the model asking again. Where an exchange pushes prices (crypto from Coinbase or Kraken with no
// key, US stocks from Massive, Alpaca or Finnhub with your key; local/streams.mjs), a subscribed symbol is streamed instead and
// a notification goes out as it trades, at most once a second for each address. The streams are shared with the
// live_quotes tool (src/live.mjs); their code is in local/, loaded only when something asks for a live price. Hosted
// and browser servers answer reads only.
import { ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";

import { createLive } from "./live.mjs";

export const QUOTE_TEMPLATE = "canli://quote/{symbols*}";
const ADDRESS = /^canli:\/\/quote\/(.+)$/;

// "AAPL,msft BTC-USD" as AAPL, MSFT and BTC-USD: up to ten, each once.
export function quoteSymbols(raw) {
  const all = [raw].flat().flatMap((x) => decodeURIComponent(String(x)).split(/[,+\s]+/)).map((s) => s.trim().toUpperCase()).filter(Boolean);
  return [...new Set(all)].slice(0, 10);
}

export function quoteSeconds(env = process.env) {
  const s = Number(env.CANLI_QUOTE_SECONDS ?? 15);
  return Number.isFinite(s) ? Math.min(3600, Math.max(1, s)) : 15;
}

// price(symbol) is latest_price's answer; refuse() returns an error while the present is hidden (a holdout or a
// past date), or nothing.
export function registerQuotes(server, { price, refuse = () => null, live = false, seconds = 15, setTimer = setInterval, clearTimer = clearInterval, streamOptions = {}, hub = null }) {
  const own = !hub;
  if (live && !hub) hub = createLive(streamOptions);
  const read = async (symbols) => {
    const hidden = refuse();
    if (hidden) throw hidden;
    if (!symbols.length) throw new Error("Name a symbol in the address: canli://quote/AAPL or canli://quote/AAPL,MSFT,BTC-USD.");
    const quotes = await Promise.all(symbols.map(async (symbol) => {
      try {
        const r = await price(symbol);
        return streamed(symbol, { symbol: r.symbol ?? symbol, price: r.price ?? null, previous_close: r.previous_close ?? null, change_percent: r.change_percent ?? null, currency: r.currency ?? null, time: r.time ?? null });
      } catch (err) {
        const s = streamed(symbol, null);
        return s ?? { symbol, error: String(err?.message ?? err).slice(0, 200) };
      }
    }));
    const via = Object.fromEntries(quotes.filter((q) => q.streamed_from).map((q) => [q.symbol, hub.source(q.streamed_from)]));
    return {
      quotes,
      ...(live ? { updates: `Subscribe to this address (resources/subscribe) and you are notified when a price changes: as it trades for a symbol an exchange streams (crypto from Coinbase or Kraken with no key, US stocks with Massive, Alpaca or Finnhub keys), and checked every ${seconds} seconds for the rest.` } : {}),
      source: "latest_price: Yahoo Finance chart data with no key (Alpaca's last trade when its keys are set); it can run late, by 15 minutes or more on some markets, and time says how old each price is.",
      ...(Object.keys(via).length ? { streamed: via } : {}),
    };
  };
  // A price a stream pushed, when it is newer than the one read: the price and time are the stream's, the previous
  // close the reader's.
  const streamed = (symbol, q) => {
    const s = hub?.live(symbol) ? hub.latest(symbol) : null;
    if (!s || (q?.time && Date.parse(q.time) > Date.parse(s.time))) return q;
    const prev = q?.previous_close ?? null;
    return { symbol: q?.symbol ?? symbol, price: s.price, previous_close: prev, change_percent: prev ? Number(((s.price / prev - 1) * 100).toFixed(4)) : null, currency: q?.currency ?? null, time: s.time, streamed_from: s.source };
  };
  server.registerResource("quote", new ResourceTemplate(QUOTE_TEMPLATE, { list: undefined }), {
    title: "Latest prices",
    description: `The latest price, previous close and change of up to ten symbols in the address (canli://quote/AAPL,MSFT,BTC-USD).${live ? " Subscribe to it for a notification each time a price changes." : ""}`,
    mimeType: "application/json",
  }, async (uri, { symbols }) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await read(quoteSymbols(symbols))) }] }));
  if (!live) return null;

  server.server.registerCapabilities({ resources: { subscribe: true } });
  // Each subscribed address and what its prices were at the last check (null before the first).
  const subs = new Map();
  let timer = null, busy = false;
  // A streamed price notifies each subscribed address that holds the symbol, at most once a second each.
  const sent = new Map();
  const pending = new Set();
  const notify = (uri) => {
    if (!subs.has(uri) || pending.has(uri)) return;
    const wait = Math.max(0, 1000 - (Date.now() - (sent.get(uri) ?? 0)));
    pending.add(uri);
    const go = () => { pending.delete(uri); if (!subs.has(uri)) return; sent.set(uri, Date.now()); server.server.sendResourceUpdated({ uri }).catch(() => {}); };
    if (!wait) go(); else setTimeout(go, wait).unref?.();
  };
  const symbolsOf = (uri) => quoteSymbols(ADDRESS.exec(uri)[1]);
  hub.listen((symbol) => { for (const uri of subs.keys()) if (symbolsOf(uri).includes(symbol)) notify(uri); });
  const rewatch = () => hub.want("quote", new Set([...subs.keys()].flatMap(symbolsOf)));
  const fingerprint = (body) => JSON.stringify(body.quotes.map((q) => [q.symbol, q.price, q.time]));
  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      for (const [uri, last] of [...subs]) {
        // Every symbol streamed: the stream notifies, so the timer leaves it alone.
        if (symbolsOf(uri).every((x) => hub.live(x))) continue;
        let now;
        try { now = fingerprint(await read(quoteSymbols(ADDRESS.exec(uri)[1]))); } catch { continue; }
        if (!subs.has(uri)) continue;
        subs.set(uri, now);
        if (last !== null && now !== last) await server.server.sendResourceUpdated({ uri }).catch(() => {});
      }
    } finally {
      busy = false;
    }
  };
  const stop = () => { if (timer) clearTimer(timer); timer = null; hub.drop("quote"); };
  server.server.setRequestHandler("resources/subscribe", async (request) => {
    const { uri } = request.params;
    if (!ADDRESS.test(uri)) throw new Error(`Only canli://quote/... addresses change while the server runs; ${uri} cannot be subscribed to.`);
    const hidden = refuse();
    if (hidden) throw hidden;
    if (!subs.has(uri)) subs.set(uri, null);
    await rewatch();
    if (!timer) { timer = setTimer(check, seconds * 1000); timer?.unref?.(); }
    check();
    return {};
  });
  server.server.setRequestHandler("resources/unsubscribe", async (request) => {
    subs.delete(request.params.uri);
    if (!subs.size) stop();
    else await rewatch();
    return {};
  });
  // When the client goes, so do the timer and the streams, so nothing keeps the process alive.
  const before = server.server.onclose;
  server.server.onclose = () => { subs.clear(); stop(); if (own) hub.stop(); before?.(); };
  return { subscriptions: subs, check, stop, hub };
}

// live_quotes: the same streams for a model, which cannot subscribe to a resource. A call starts streaming its
// symbols (kept on for LIVE_MINUTES after the last call, so one-minute bars build up), waits a few seconds for a
// first price, and answers with each streamed price and its bars; a symbol no stream carries gets latest_price's.
const LIVE_MINUTES = 15;
const NO_STREAM = "No stream carries it: crypto pairs (BTC-USD, ETH-USD) stream with no key; US stocks stream with MASSIVE_API_KEY (or POLYGON_API_KEY), Alpaca keys (ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY) or FINNHUB_API_KEY. This is latest_price's answer.";
export const LIVE_QUOTES_TOOL = Object.freeze({
  name: "live_quotes", pack: "desk", toolset: "desk", title: "Live prices and one-minute bars",
  input: z.object({
    symbols: z.array(z.string().min(1).max(20)).min(1).max(10).describe("Up to ten: crypto pairs as BTC-USD, US stocks as AAPL."),
    minutes: z.number().int().min(0).max(120).optional().describe("How many of the latest one-minute bars to return; default 15, 0 for none."),
    wait_seconds: z.number().min(0).max(10).optional().describe("How long to wait for a first price from a stream just opened; default 3."),
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  description: `Prices as they trade, from the exchange's own stream, and one-minute bars built from them on this machine. Crypto pairs stream from Coinbase or Kraken with no key; US stocks from Massive, Alpaca or Finnhub with your key. Each symbol keeps streaming for ${LIVE_MINUTES} minutes after the last call, so calling again gives fresher prices and more bars. A symbol no stream carries gets latest_price's answer, which can run late. Local server only.`,
  keywords: "live stream streaming streamed as it trades tick ticks ticker websocket real-time feed intraday one minute bars candles ohlc crypto pair",
  args: "symbols: string[], minutes?: integer, wait_seconds?: number",
});

export async function runLiveQuotes({ hub, price, readOnly = false, now = () => Date.now(), pause = (ms) => new Promise((r) => setTimeout(r, ms)) }, args) {
  if (readOnly) throw new Error("Live prices stream to your own machine, and the hosted server keeps no connection open. Run it locally: npx -y canli-mcp");
  if (!hub) throw new Error("live_quotes runs inside a running server (npx -y canli-mcp), where its streams stay open between calls.");
  const a = LIVE_QUOTES_TOOL.input.parse(args ?? {});
  const symbols = quoteSymbols(a.symbols);
  const minutes = a.minutes ?? 15;
  // Each symbol under its own name, so a later call for other symbols does not end these.
  await Promise.all(symbols.map((s) => hub.want(`live_quotes:${s}`, [s], { forMs: LIVE_MINUTES * 60 * 1000 })));
  for (const until = now() + (a.wait_seconds ?? 3) * 1000; now() < until && symbols.some((s) => hub.carried(s) && !hub.live(s));) await pause(100);
  const quotes = await Promise.all(symbols.map(async (symbol) => {
    const s = hub.live(symbol) ? hub.latest(symbol) : null;
    if (s) {
      const bars = minutes ? hub.bars(symbol).slice(-minutes) : [];
      return { symbol, price: s.price, time: s.time, streaming: true, source: hub.source(s.source), ...(minutes ? { bars } : {}) };
    }
    const why = hub.carried(symbol) ? `Its stream is connecting; call again in a few seconds. Until then, latest_price's answer.` : NO_STREAM;
    try {
      const r = await price(symbol);
      return { symbol: r.symbol ?? symbol, price: r.price ?? null, time: r.time ?? null, streaming: false, note: why };
    } catch (err) {
      return { symbol, streaming: false, note: why, error: String(err?.message ?? err).slice(0, 200) };
    }
  }));
  return {
    quotes,
    ...(quotes.some((q) => q.streaming) ? { bars: "One-minute bars from the prices the stream pushed, by the minute of each price's own time (UTC), oldest first; prices is how many came that minute, a minute with none has no bar, and the last bar may still be forming. They are not an exchange's official bars." } : {}),
    streaming_for: `${LIVE_MINUTES} minutes after this call; call again for fresher prices and more bars.`,
  };
}
