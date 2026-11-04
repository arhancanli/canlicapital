// canli://quote/{symbols*}: the latest price of up to ten symbols as a resource. On a local server a client can
// subscribe to the address (resources/subscribe): the server checks it every CANLI_QUOTE_SECONDS (default 15)
// and sends notifications/resources/updated when a price or its time changes, so a host can show prices as
// they move without the model asking again. Hosted and browser servers answer reads only.
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
export function registerQuotes(server, { price, refuse = () => null, live = false, seconds = 15, setTimer = setInterval, clearTimer = clearInterval }) {
  const read = async (symbols) => {
    const hidden = refuse();
    if (hidden) throw hidden;
    if (!symbols.length) throw new Error("Name a symbol in the address: canli://quote/AAPL or canli://quote/AAPL,MSFT,BTC-USD.");
    const quotes = await Promise.all(symbols.map(async (symbol) => {
      try {
        const r = await price(symbol);
        return { symbol: r.symbol ?? symbol, price: r.price ?? null, previous_close: r.previous_close ?? null, change_percent: r.change_percent ?? null, currency: r.currency ?? null, time: r.time ?? null };
      } catch (err) {
        return { symbol, error: String(err?.message ?? err).slice(0, 200) };
      }
    }));
    return {
      quotes,
      ...(live ? { updates: `Subscribe to this address (resources/subscribe) and this server checks it every ${seconds} seconds and notifies you when a price changes.` } : {}),
      source: "latest_price: Yahoo Finance chart data with no key (Alpaca's last trade when its keys are set); it can run late, by 15 minutes or more on some markets, and time says how old each price is.",
    };
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
  const fingerprint = (body) => JSON.stringify(body.quotes.map((q) => [q.symbol, q.price, q.time]));
  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      for (const [uri, last] of [...subs]) {
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
  const stop = () => { if (timer) clearTimer(timer); timer = null; };
  server.server.setRequestHandler("resources/subscribe", async (request) => {
    const { uri } = request.params;
    if (!ADDRESS.test(uri)) throw new Error(`Only canli://quote/... addresses change while the server runs; ${uri} cannot be subscribed to.`);
    const hidden = refuse();
    if (hidden) throw hidden;
    if (!subs.has(uri)) subs.set(uri, null);
    if (!timer) { timer = setTimer(check, seconds * 1000); timer?.unref?.(); }
    check();
    return {};
  });
  server.server.setRequestHandler("resources/unsubscribe", async (request) => {
    subs.delete(request.params.uri);
    if (!subs.size) stop();
    return {};
  });
  return { subscriptions: subs, check, stop };
}
