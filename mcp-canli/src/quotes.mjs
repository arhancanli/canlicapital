// canli://quote/{symbols*}: the latest price of up to ten symbols as a resource. On a local server a client can
// subscribe to the address (resources/subscribe): the server checks it every CANLI_QUOTE_SECONDS (default 15)
// and sends notifications/resources/updated when a price or its time changes, so a host can show prices as
// they move without the model asking again. Where an exchange pushes prices (crypto from Coinbase or Kraken with no
// key, US stocks from Alpaca or Finnhub with your key; local/streams.mjs), a subscribed symbol is streamed instead and
// a notification goes out as it trades, at most once a second for each address. The stream code is in local/, and
// loaded only when a client subscribes. Hosted and browser servers answer reads only.
import { ResourceTemplate } from "@modelcontextprotocol/server";

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
export function registerQuotes(server, { price, refuse = () => null, live = false, seconds = 15, setTimer = setInterval, clearTimer = clearInterval, streamOptions = {} }) {
  let streams = null, sources = {};
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
    const via = Object.fromEntries(quotes.filter((q) => q.streamed_from).map((q) => [q.symbol, sources[q.streamed_from] ?? q.streamed_from]));
    return {
      quotes,
      ...(live ? { updates: `Subscribe to this address (resources/subscribe) and you are notified when a price changes: as it trades for a symbol an exchange streams (crypto from Coinbase or Kraken with no key, US stocks with Alpaca or Finnhub keys), and checked every ${seconds} seconds for the rest.` } : {}),
      source: "latest_price: Yahoo Finance chart data with no key (Alpaca's last trade when its keys are set); it can run late, by 15 minutes or more on some markets, and time says how old each price is.",
      ...(Object.keys(via).length ? { streamed: via } : {}),
    };
  };
  // A price a stream pushed, when it is newer than the one read: the price and time are the stream's, the previous
  // close the reader's.
  const streamed = (symbol, q) => {
    const s = streams?.live(symbol) ? streams.latest(symbol) : null;
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
  const onPrice = (symbol) => { for (const uri of subs.keys()) if (symbolsOf(uri).includes(symbol)) notify(uri); };
  let loading = null;
  const start = () => (loading ??= (streamOptions.load ?? (() => import("../local/streams.mjs")))().then((m) => {
    sources = m.SOURCES ?? {};
    if (subs.size) streams = m.createStreams({ ...streamOptions, onPrice });
  }).catch(() => {}).finally(() => { loading = null; }));
  const rewatch = async () => {
    if (!streams && subs.size) await start();
    streams?.watch([...new Set([...subs.keys()].flatMap(symbolsOf))]);
  };
  const fingerprint = (body) => JSON.stringify(body.quotes.map((q) => [q.symbol, q.price, q.time]));
  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      for (const [uri, last] of [...subs]) {
        // Every symbol streamed: the stream notifies, so the timer leaves it alone.
        if (streams && symbolsOf(uri).every((x) => streams.live(x))) continue;
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
  const stop = () => { if (timer) clearTimer(timer); timer = null; streams?.stop(); streams = null; };
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
  server.server.onclose = () => { subs.clear(); stop(); before?.(); };
  return { subscriptions: subs, check, stop, streams: () => streams };
}
