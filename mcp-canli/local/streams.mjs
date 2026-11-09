// Prices an exchange pushes the moment they trade, for canli://quote subscriptions on a local server. Crypto
// pairs come from Coinbase's public ticker with no key, and from Kraken's when Coinbase cannot be reached or does
// not list the pair. US stocks come from Alpaca's trade stream with your Alpaca keys, or Finnhub's with
// FINNHUB_API_KEY. A symbol no stream carries is left to the timer (CANLI_QUOTE_SECONDS). CANLI_STREAMS=0 turns
// streams off. What is sent: the symbols subscribed to, and to Alpaca or Finnhub your key; nothing else.
//
// Node 22 has a WebSocket of its own; Node 20 uses the ws package, so both work.
export const CRYPTO = /^[A-Z0-9]{2,10}-(USD|USDC|USDT|EUR|GBP)$/;
const STOCK = /^[A-Z][A-Z.]{0,9}$/;
const STALL_MS = 90 * 1000;
const GIVE_UP = 3;

export const SOURCES = {
  coinbase: "Coinbase's public ticker, live, no key",
  kraken: "Kraken's public ticker, live, no key",
  alpaca: "Alpaca's trade stream with your keys, live; trades on its one feed (IEX unless ALPACA_DATA_FEED says sip)",
  finnhub: "Finnhub's trade stream with your key, live",
};

// Each feed: where it is, how to ask for symbols, and how to read a price from what it sends.
const FEEDS = {
  coinbase: {
    url: () => "wss://ws-feed.exchange.coinbase.com",
    carries: (s) => CRYPTO.test(s),
    subscribe: (ws, symbols) => ws.send(JSON.stringify({ type: "subscribe", product_ids: symbols, channels: ["ticker"] })),
    unsubscribe: (ws, symbols) => ws.send(JSON.stringify({ type: "unsubscribe", product_ids: symbols, channels: ["ticker"] })),
    read(m) {
      if (m.type === "ticker" && Number.isFinite(Number(m.price))) return [{ symbol: m.product_id, price: Number(m.price), time: m.time }];
      // A pair Coinbase does not list fails the whole request; name it so it can go elsewhere.
      const bad = m.type === "error" ? /([A-Z0-9]{2,10}-[A-Z]{3,4}) is not a valid product/i.exec(`${m.reason ?? ""} ${m.message ?? ""}`) : null;
      return bad ? { refused: bad[1].toUpperCase() } : [];
    },
  },
  kraken: {
    url: () => "wss://ws.kraken.com/v2",
    carries: (s) => CRYPTO.test(s),
    subscribe: (ws, symbols) => ws.send(JSON.stringify({ method: "subscribe", params: { channel: "ticker", symbol: symbols.map((s) => s.replace("-", "/")) } })),
    unsubscribe: (ws, symbols) => ws.send(JSON.stringify({ method: "unsubscribe", params: { channel: "ticker", symbol: symbols.map((s) => s.replace("-", "/")) } })),
    read(m) {
      if (m.channel === "ticker" && Array.isArray(m.data)) {
        return m.data.filter((d) => Number.isFinite(Number(d.last))).map((d) => ({ symbol: String(d.symbol).replace("/", "-"), price: Number(d.last), time: d.timestamp }));
      }
      const bad = m.method === "subscribe" && m.success === false ? /([A-Z0-9]{2,10})\/([A-Z]{3,4})/.exec(`${m.symbol ?? ""} ${m.error ?? ""}`) : null;
      return bad ? { refused: `${bad[1]}-${bad[2]}`.toUpperCase() } : [];
    },
  },
  alpaca: {
    url: (env) => `wss://stream.data.alpaca.markets/v2/${env.ALPACA_DATA_FEED === "sip" ? "sip" : "iex"}`,
    carries: (s) => STOCK.test(s),
    key: (env) => {
      const key = env.ALPACA_API_KEY_ID ?? env.APCA_API_KEY_ID ?? env.ALPACA_PAPER_KEY_ID;
      const secret = env.ALPACA_API_SECRET_KEY ?? env.APCA_API_SECRET_KEY ?? env.ALPACA_PAPER_SECRET_KEY;
      return key && secret ? { key, secret } : null;
    },
    // Alpaca says connected, then wants the keys, then says authenticated; symbols wait for that.
    hello: (ws, env) => { const k = FEEDS.alpaca.key(env); ws.send(JSON.stringify({ action: "auth", key: k.key, secret: k.secret })); },
    ready: (m) => [m].flat().some((x) => x?.T === "success" && x.msg === "authenticated"),
    subscribe: (ws, symbols) => ws.send(JSON.stringify({ action: "subscribe", trades: symbols })),
    unsubscribe: (ws, symbols) => ws.send(JSON.stringify({ action: "unsubscribe", trades: symbols })),
    read: (m) => [m].flat().filter((x) => x?.T === "t" && Number.isFinite(Number(x.p))).map((x) => ({ symbol: x.S, price: Number(x.p), time: x.t })),
  },
  finnhub: {
    url: (env) => `wss://ws.finnhub.io?token=${encodeURIComponent(env.FINNHUB_API_KEY)}`,
    carries: (s) => STOCK.test(s),
    key: (env) => (env.FINNHUB_API_KEY ? { key: env.FINNHUB_API_KEY } : null),
    subscribe: (ws, symbols) => { for (const symbol of symbols) ws.send(JSON.stringify({ type: "subscribe", symbol })); },
    unsubscribe: (ws, symbols) => { for (const symbol of symbols) ws.send(JSON.stringify({ type: "unsubscribe", symbol })); },
    // Trades come in batches; the last of each symbol is its price.
    read: (m) => (m.type === "trade" && Array.isArray(m.data) ? m.data.filter((d) => Number.isFinite(Number(d.p))).map((d) => ({ symbol: d.s, price: Number(d.p), time: d.t })) : []),
  },
};

const isoTime = (t, now) => {
  const ms = typeof t === "number" ? t : Date.parse(t ?? "");
  return new Date(Number.isFinite(ms) ? ms : now()).toISOString();
};

async function defaultSocket() {
  if (typeof globalThis.WebSocket === "function") return globalThis.WebSocket;
  return (await import("ws")).default;
}

// Which feed carries a symbol, in order of choice: Coinbase then Kraken for crypto, Alpaca then Finnhub for
// stocks when their keys are set. Feeds that failed or refused the symbol are skipped.
export function feedsFor(symbol, env = process.env) {
  if (env.CANLI_STREAMS === "0") return [];
  return Object.entries(FEEDS).filter(([, f]) => f.carries(symbol) && (!f.key || f.key(env))).map(([name]) => name);
}

// onPrice(symbol, { price, time, source }) for every price pushed. watch(symbols) sets what is wanted; a symbol
// left out is unsubscribed. live(symbol) says whether a stream is carrying it now.
export function createStreams({ onPrice = () => {}, env = process.env, WS = null, now = () => Date.now(), say = () => {}, setTimer = setTimeout, every = setInterval, stopEvery = clearInterval } = {}) {
  const wanted = new Set();
  const latest = new Map(); // symbol -> { price, time, source, at }
  const refused = new Map(); // feed -> Set of symbols it does not carry
  const failures = new Map(); // feed -> connections in a row that ended before a price
  const conns = new Map(); // feed -> { ws, symbols: Set, ready, wait, last, watch }
  let stopped = false;

  const usable = (feed) => (failures.get(feed) ?? 0) < GIVE_UP;
  const choose = (symbol) => feedsFor(symbol, env).find((f) => usable(f) && !refused.get(f)?.has(symbol)) ?? null;

  async function open(feed) {
    const Socket = WS ?? (await defaultSocket());
    const spec = FEEDS[feed];
    const c = conns.get(feed);
    if (!c || stopped) return;
    let ws;
    try { ws = new Socket(spec.url(env)); } catch (e) { say(`${feed}: ${String(e?.message ?? e).slice(0, 200)}`); return closed(feed, false); }
    c.ws = ws; c.ready = false; c.priced = false; c.last = now();
    const on = (name, fn) => (typeof ws.on === "function" ? ws.on(name, fn) : ws.addEventListener(name, fn));
    on("open", () => {
      if (spec.hello) return spec.hello(ws, env);
      c.ready = true;
      if (c.symbols.size) spec.subscribe(ws, [...c.symbols]);
    });
    on("message", (event) => {
      c.last = now();
      let m;
      try { m = JSON.parse(String(event?.data ?? event)); } catch { return; }
      if (!c.ready && spec.ready?.(m)) { c.ready = true; if (c.symbols.size) spec.subscribe(ws, [...c.symbols]); }
      const got = spec.read(m);
      if (got.refused) { refuse(feed, got.refused); return; }
      for (const p of got) {
        const symbol = String(p.symbol).toUpperCase();
        if (!c.symbols.has(symbol)) continue;
        c.priced = true;
        failures.set(feed, 0);
        const q = { price: p.price, time: isoTime(p.time, now), source: feed };
        latest.set(symbol, { ...q, at: now() });
        try { onPrice(symbol, q); } catch (e) { say(String(e?.message ?? e)); }
      }
    });
    on("error", (e) => say(`${feed}: ${String(e?.message ?? e?.error?.message ?? "connection error").slice(0, 200)}`));
    on("close", () => { if (conns.get(feed)?.ws === ws) closed(feed, c.priced); });
    stopEvery(c.watch);
    // A stream that goes quiet is opened again.
    c.watch = every(() => { if (now() - c.last > STALL_MS) { try { ws.terminate ? ws.terminate() : ws.close(); } catch { /* reopened below */ } } }, 15000);
    c.watch?.unref?.();
  }

  // A connection ended: open it again after a wait that doubles, or, after three that never gave a price, hand
  // its symbols to the next feed.
  function closed(feed, priced) {
    const c = conns.get(feed);
    if (!c || stopped) return;
    stopEvery(c.watch);
    c.ws = null;
    if (!priced) failures.set(feed, (failures.get(feed) ?? 0) + 1);
    if (!usable(feed)) {
      say(`${feed}: no price after ${GIVE_UP} tries; its symbols go to the next stream or the timer`);
      conns.delete(feed);
      for (const s of c.symbols) latest.delete(s);
      return place();
    }
    const t = setTimer(() => open(feed), c.wait);
    t?.unref?.();
    c.wait = Math.min(c.wait * 2, 60000);
  }

  function refuse(feed, symbol) {
    if (!refused.has(feed)) refused.set(feed, new Set());
    refused.get(feed).add(symbol);
    say(`${feed} does not carry ${symbol}`);
    const c = conns.get(feed);
    if (c?.symbols.delete(symbol) && c.ws && c.ready && c.symbols.size) FEEDS[feed].subscribe(c.ws, [...c.symbols]);
    place();
  }

  // Put each wanted symbol on its feed and take the unwanted off.
  function place() {
    if (stopped) return;
    const plan = new Map();
    for (const s of wanted) { const f = choose(s); if (f) { if (!plan.has(f)) plan.set(f, new Set()); plan.get(f).add(s); } }
    for (const [feed, c] of [...conns]) {
      const keep = plan.get(feed) ?? new Set();
      const gone = [...c.symbols].filter((s) => !keep.has(s));
      for (const s of gone) { c.symbols.delete(s); latest.delete(s); }
      if (!keep.size) {
        conns.delete(feed);
        stopEvery(c.watch);
        try { c.ws?.close(); } catch { /* closing anyway */ }
        continue;
      }
      if (gone.length && c.ws && c.ready) FEEDS[feed].unsubscribe(c.ws, gone);
    }
    for (const [feed, symbols] of plan) {
      const c = conns.get(feed);
      if (!c) { conns.set(feed, { ws: null, symbols: new Set(symbols), ready: false, wait: 1000, last: now(), watch: null }); open(feed); continue; }
      const added = [...symbols].filter((s) => !c.symbols.has(s));
      for (const s of added) c.symbols.add(s);
      if (added.length && c.ws && c.ready) FEEDS[feed].subscribe(c.ws, added);
    }
  }

  return {
    watch(symbols) { wanted.clear(); for (const s of symbols) wanted.add(String(s).toUpperCase()); place(); },
    // Carried by a stream that is open now and has priced it, so the timer can leave it alone.
    live: (symbol) => latest.has(String(symbol).toUpperCase()) && [...conns.values()].some((c) => c.ws && c.ready && c.symbols.has(String(symbol).toUpperCase())),
    // Given to a stream, open or still connecting, so a reader on a timer need not read it too.
    carried: (symbol) => [...conns.values()].some((c) => c.symbols.has(String(symbol).toUpperCase())),
    latest: (symbol) => latest.get(String(symbol).toUpperCase()) ?? null,
    feeds: () => Object.fromEntries([...conns].map(([f, c]) => [f, [...c.symbols]])),
    stop() {
      stopped = true;
      for (const c of conns.values()) { stopEvery(c.watch); try { c.ws?.close(); } catch { /* stopping */ } }
      conns.clear();
    },
  };
}
