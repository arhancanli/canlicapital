// technical_indicators: the common indicators for a symbol in one call, from its daily prices. Standard definitions, as
// TA-Lib computes them: moving averages, RSI and ATR with Wilder's smoothing, MACD 12/26/9, Bollinger 20 with two
// standard deviations. What they show is not advice, and they predict little: nothing here says buy or sell.
import { z } from "zod";

import { priceHistory } from "./tools.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const DAY_MS = 86400000;
const LOOKBACK_DAYS = 560;

export const technicalsInput = z.object({
  symbol: z.string().min(1).max(20).describe("A ticker: AAPL, SPY, BTC-USD, 7203.T."),
  as_of: DATE.optional().describe("Compute as of this date; default the latest close."),
}).strict();

const sum = (a) => a.reduce((s, x) => s + x, 0);
const round = (x, n = 4) => (x === null || !Number.isFinite(x) ? null : Number(x.toFixed(n)));

export function sma(v, n) {
  return v.length < n ? null : sum(v.slice(-n)) / n;
}

// Seeded with the simple average of the first n values.
export function emaSeries(v, n) {
  if (v.length < n) return [];
  const k = 2 / (n + 1);
  const out = [sum(v.slice(0, n)) / n];
  for (let i = n; i < v.length; i++) out.push(v[i] * k + out.at(-1) * (1 - k));
  return out;
}

export function rsi(close, n = 14) {
  if (close.length <= n) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) { const d = close[i] - close[i - 1]; if (d > 0) gain += d; else loss -= d; }
  gain /= n; loss /= n;
  for (let i = n + 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

export function macd(close, fast = 12, slow = 26, signal = 9) {
  const f = emaSeries(close, fast), s = emaSeries(close, slow);
  if (!s.length) return null;
  const line = s.map((x, i) => f[i + slow - fast] - x);
  const sig = emaSeries(line, signal);
  if (!sig.length) return null;
  return { line: line.at(-1), signal: sig.at(-1), histogram: line.at(-1) - sig.at(-1) };
}

export function bollinger(close, n = 20, width = 2) {
  if (close.length < n) return null;
  const w = close.slice(-n), mid = sum(w) / n;
  const sd = Math.sqrt(sum(w.map((x) => (x - mid) ** 2)) / n);
  return { upper: mid + width * sd, middle: mid, lower: mid - width * sd };
}

export function atr(high, low, close, n = 14) {
  if (close.length <= n) return null;
  const tr = close.slice(1).map((_, i) => Math.max(high[i + 1] - low[i + 1], Math.abs(high[i + 1] - close[i]), Math.abs(low[i + 1] - close[i])));
  let a = sum(tr.slice(0, n)) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}

export async function technicalIndicators(session, args) {
  const a = technicalsInput.parse(args);
  const end = a.as_of ?? new Date(session.now()).toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${end}T00:00:00Z`) - LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10);
  const p = await priceHistory(session, { symbol: a.symbol, start, end });
  const close = p.close ?? [], high = p.high ?? [], low = p.low ?? [];
  if (close.length < 2) throw new Error(`${a.symbol} has no daily prices up to ${end}.`);
  const last = close.at(-1);
  const m = macd(close), b = bollinger(close), s50 = sma(close, 50), s200 = sma(close, 200);
  const ema = (n) => emaSeries(close, n).at(-1) ?? null;
  return {
    symbol: p.symbol ?? a.symbol,
    as_of: p.dates?.at(-1) ?? null,
    close: round(last),
    adjusted: p.adjusted ?? null,
    currency: p.currency ?? null,
    bars_used: close.length,
    moving_averages: { sma_20: round(sma(close, 20)), sma_50: round(s50), sma_200: round(s200), ema_12: round(ema(12)), ema_26: round(ema(26)), ema_50: round(ema(50)), ema_200: round(ema(200)) },
    rsi_14: round(rsi(close), 2),
    macd_12_26_9: m ? { line: round(m.line), signal: round(m.signal), histogram: round(m.histogram) } : null,
    bollinger_20_2: b ? { upper: round(b.upper), middle: round(b.middle), lower: round(b.lower) } : null,
    atr_14: round(atr(high, low, close)),
    position: {
      close_vs_sma_50_pct: s50 ? round(100 * (last / s50 - 1), 2) : null,
      close_vs_sma_200_pct: s200 ? round(100 * (last / s200 - 1), 2) : null,
      sma_50_above_200: s50 && s200 ? s50 > s200 : null,
    },
    source: p.source ?? null,
    limits: [
      "Computed here from the daily prices above, with standard definitions (as TA-Lib computes them); a charting site that starts its averages on another date can differ slightly.",
      "These describe past prices. They are not a forecast, and tests of simple indicator rules after costs mostly find little. Not investment advice.",
    ],
  };
}
