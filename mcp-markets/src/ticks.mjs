// trade_ticks: every trade on Kraken's public market for a crypto pair from a moment you name, tick by tick:
// the time to the microsecond, price, size, which side took liquidity and the order type, with the window's
// VWAP, volume, buying against selling, the largest trades and one-minute bars built from the ticks. Kraken
// keeps each market's trades back to its first, so any past moment can be read. No key.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";

const API = "https://api.kraken.com/0/public";
const NAMES = Object.freeze({
  bitcoin: "BTC/USD", btc: "BTC/USD", xbt: "BTC/USD", ether: "ETH/USD", ethereum: "ETH/USD", eth: "ETH/USD",
  solana: "SOL/USD", sol: "SOL/USD", xrp: "XRP/USD", ripple: "XRP/USD", cardano: "ADA/USD", ada: "ADA/USD",
  dogecoin: "DOGE/USD", doge: "DOGE/USD", litecoin: "LTC/USD", ltc: "LTC/USD",
});
const TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const PAGE = 1000, SHOWN = 1000;

export const ticksInput = z.object({
  pair: z.string().min(2).max(20).describe("A crypto pair on Kraken (BTC/USD, ETH/EUR, SOL/USD) or a coin's name (bitcoin reads BTC/USD)."),
  start: z.string().regex(TIME, "an ISO time or a date").optional().describe("The moment to read from: an ISO time (2024-01-01T14:30:00Z) or a date (its UTC midnight). A time without a zone is UTC."),
  since: z.string().regex(/^\d{10,20}$/, "digits").optional().describe("Instead of start: next_since from an earlier answer, to read on exactly where it stopped (or to poll for newer trades)."),
  end: z.string().regex(TIME, "an ISO time or a date").optional().describe("Stop at this moment."),
  requests: z.number().int().min(1).max(10).optional().describe("Requests of up to 1,000 trades each. Default 2."),
  ticks: z.boolean().optional().describe("Return the trades themselves (the first 1,000; the summary and bars cover all read). Default true."),
}).strict();

// A time as nanoseconds since 1970 (Kraken's cursor), from an ISO time or a date read as UTC.
export function toNanos(s) {
  const t = /T/.test(s) ? (/(Z|[+-]\d{2}:\d{2})$/.test(s) ? s : `${s}Z`) : `${s}T00:00:00Z`;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) throw new Error(`${s} is not a time.`);
  const frac = /\.(\d+)/.exec(t)?.[1] ?? "";
  return (BigInt(Math.floor(ms)) * 1000000n + BigInt(frac.padEnd(9, "0").slice(3, 9) || "0")).toString();
}

// Seconds with a fraction (Kraken's trade time) as an ISO time to the microsecond.
export function microIso(seconds) {
  const us = Math.round(seconds * 1e6);
  return new Date(Math.floor(us / 1000)).toISOString().replace("Z", `${String(us % 1000).padStart(3, "0")}Z`);
}

async function call(session, url) {
  for (let attempt = 0; ; attempt += 1) {
    const r = await getJson(session, url);
    const err = (r?.error ?? []).join("; ");
    if (!err) return r.result;
    // Kraken's public calls allow about one a second; one wait and a second try.
    if (/Too many requests/i.test(err) && attempt === 0) { await new Promise((ok) => setTimeout(ok, 1500)); continue; }
    if (/Unknown asset pair/i.test(err)) throw new NotFound(`Kraken has no market for that pair (${err}).`);
    throw new Error(`Kraken: ${err}`);
  }
}

// The pair as Kraken names it, from "BTC/USD", "btcusd", "XBT-USD" or a coin's name.
async function resolvePair(session, raw) {
  const s = raw.trim();
  const named = NAMES[s.toLowerCase()];
  const ask = named ?? s.toUpperCase().replace(/[:-]/, "/");
  const result = await call(session, `${API}/AssetPairs?pair=${encodeURIComponent(ask)}`);
  const [key, p] = Object.entries(result)[0] ?? [];
  if (!p) throw new NotFound(`Kraken has no market for ${raw}.`);
  return { altname: p.altname, name: (p.wsname ?? key).replace(/^XBT\//, "BTC/"), ...(named ? { matched_from: raw } : {}) };
}

const round = (x, d = 8) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

export async function tradeTicks(session, args) {
  const a = ticksInput.parse(args);
  if (!a.start === !a.since) throw new Error("Give start (a time to read from) or since (next_since from an earlier answer), one of the two.");
  const pair = await resolvePair(session, a.pair);
  const endSec = a.end ? Number(BigInt(toNanos(a.end)) / 1000n) / 1e6 : null;
  // Reading stops only at the end of a request or at `end`, so Kraken's own cursor (nanoseconds) says
  // exactly where to go on: fills of one order share a timestamp, which a time cannot split.
  let since = a.since ?? toNanos(a.start), reachedEnd = false, caughtUp = false;
  const trades = [];
  for (let page = 0; page < (a.requests ?? 2) && !reachedEnd && !caughtUp; page += 1) {
    const result = await call(session, `${API}/Trades?pair=${encodeURIComponent(pair.altname)}&since=${since}&count=${PAGE}`);
    const rows = result[Object.keys(result).find((k) => k !== "last")] ?? [];
    for (const t of rows) {
      const time = Number(t[2]);
      if (endSec != null && time > endSec) { reachedEnd = true; break; }
      trades.push({ time, price: Number(t[0]), size: Number(t[1]), side: t[3] === "b" ? "buy" : "sell", type: t[4] === "m" ? "market" : "limit", id: t[6] ?? null });
    }
    // Fewer than a full request means the market has no later trade yet.
    if (rows.length < PAGE) caughtUp = true;
    if (result.last) since = String(result.last);
  }
  if (!trades.length) throw new NotFound(`Kraken shows no ${pair.name} trades ${a.start ? `from ${a.start}` : "after that cursor"}${a.end ? ` to ${a.end}` : ""}.`);

  let volume = 0, notional = 0, buy = 0, market = 0, high = -Infinity, low = Infinity;
  const bars = new Map();
  for (const t of trades) {
    volume += t.size; notional += t.price * t.size;
    if (t.side === "buy") buy += t.size;
    if (t.type === "market") market += t.size;
    high = Math.max(high, t.price); low = Math.min(low, t.price);
    const minute = microIso(t.time).slice(0, 16);
    const b = bars.get(minute) ?? { open: t.price, high: t.price, low: t.price, close: t.price, volume: 0, notional: 0, trades: 0 };
    b.high = Math.max(b.high, t.price); b.low = Math.min(b.low, t.price); b.close = t.price;
    b.volume += t.size; b.notional += t.price * t.size; b.trades += 1;
    bars.set(minute, b);
  }
  const first = trades[0], last = trades.at(-1);
  const seconds = last.time - first.time;
  const largest = [...trades].sort((x, y) => y.size * y.price - x.size * x.price).slice(0, 5);
  return {
    pair: pair.name, exchange: "Kraken", ...(pair.matched_from ? { matched_from: pair.matched_from } : {}),
    from: microIso(first.time), to: microIso(last.time), trades: trades.length,
    summary: {
      vwap: round(notional / volume, 6), volume: round(volume), notional: round(notional, 2),
      buy_volume: round(buy), sell_volume: round(volume - buy), buy_share: round(buy / volume, 4),
      market_order_share: round(market / volume, 4),
      first: first.price, last: last.price, high, low, return: round(last.price / first.price - 1, 6),
      seconds: round(seconds, 3), trades_per_minute: seconds > 0 ? round((trades.length - 1) / (seconds / 60), 2) : null,
      largest: { columns: ["time", "price", "size", "side"], rows: largest.map((t) => [microIso(t.time), t.price, t.size, t.side]) },
    },
    bars: { columns: ["minute", "open", "high", "low", "close", "volume", "trades", "vwap"], rows: [...bars].map(([m, b]) => [m, b.open, b.high, b.low, b.close, round(b.volume), b.trades, round(b.notional / b.volume, 6)]) },
    ...(a.ticks !== false ? { ticks: { columns: ["time", "price", "size", "side", "type", "id"], rows: trades.slice(0, SHOWN).map((t) => [microIso(t.time), t.price, t.size, t.side, t.type, t.id]), ...(trades.length > SHOWN ? { shown: SHOWN } : {}) } } : {}),
    ...(reachedEnd ? { reached_end: true } : { next_since: since, ...(caughtUp ? { caught_up: true } : {}) }),
    source: `${API}/Trades (Kraken's public trade history)`,
    limits: [
      "Kraken's own trades only, one venue among many; prices are in the pair's quote currency.",
      "side is the taker's: buy means a buyer took a resting offer. Bars are UTC minutes built from these trades alone.",
      "Not investment advice.",
    ],
  };
}
