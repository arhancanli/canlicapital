// One set of price streams per server, shared by everything that wants live prices: canli://quote subscriptions and
// the live_quotes tool. Each asks for its symbols under its own name (and the tool for a while only); the streams
// carry the union and stop when nobody wants anything. The network code is in local/streams.mjs, loaded on first use.
export function createLive({ load = () => import("../local/streams.mjs"), now = () => Date.now(), setTimer = setTimeout, ...streamOptions } = {}) {
  const wants = new Map(); // owner -> { symbols: Set, until: ms or null }
  const listeners = new Set();
  let streams = null, sources = {}, loading = null, expiry = null, stopped = false;

  const start = () => (loading ??= load().then((m) => {
    sources = m.SOURCES ?? {};
    if (!streams && !stopped && wants.size) streams = m.createStreams({ ...streamOptions, now, onPrice: (symbol, q) => { for (const fn of listeners) { try { fn(symbol, q); } catch { /* a listener's own fault */ } } } });
  }).catch(() => {}).finally(() => { loading = null; }));

  // Drop what has run out, watch the rest, and look again when the next one runs out.
  const rewatch = async () => {
    const t = now();
    for (const [owner, w] of [...wants]) if (w.until !== null && w.until <= t) wants.delete(owner);
    if (wants.size && !streams) await start();
    if (!wants.size) { streams?.stop(); streams = null; return; }
    streams?.watch([...new Set([...wants.values()].flatMap((w) => [...w.symbols]))]);
    if (expiry) clearTimeout(expiry);
    const next = Math.min(...[...wants.values()].map((w) => w.until ?? Infinity));
    expiry = Number.isFinite(next) ? setTimer(() => { expiry = null; rewatch(); }, Math.max(0, next - now()) + 5) : null;
    expiry?.unref?.();
  };

  return {
    // owner's symbols replace what it asked for before; forMs keeps them only that long (null: until dropped).
    async want(owner, symbols, { forMs = null } = {}) {
      if (stopped) return;
      const set = new Set([...symbols].map((s) => String(s).toUpperCase()));
      if (!set.size) wants.delete(owner);
      else wants.set(owner, { symbols: set, until: forMs === null ? null : now() + forMs });
      await rewatch();
    },
    async drop(owner) { wants.delete(owner); await rewatch(); },
    listen(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    live: (symbol) => Boolean(streams?.live(symbol)),
    carried: (symbol) => Boolean(streams?.carried(symbol)),
    latest: (symbol) => streams?.latest(symbol) ?? null,
    bars: (symbol) => streams?.bars?.(symbol) ?? [],
    source: (name) => sources[name] ?? name,
    running: () => Boolean(streams),
    stop() { stopped = true; wants.clear(); if (expiry) clearTimeout(expiry); expiry = null; streams?.stop(); streams = null; },
  };
}
