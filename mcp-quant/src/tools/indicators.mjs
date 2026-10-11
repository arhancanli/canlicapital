// Technical indicators on price bars, computed the way TA-Lib computes them (same seeds, same Wilder
// smoothing, same warm-up), so values agree with TA-Lib bar for bar. Every tool returns the latest
// values by default; tail: 0 returns the whole series (null during warm-up).
import { z } from "zod";

import { MAX_SERIES } from "../inputs.mjs";

const priceArray = (what) => z.array(z.number()).min(2).max(MAX_SERIES).describe(what);
const close = priceArray("Closing prices, oldest first.");
const ohlc = {
  high: priceArray("High prices, oldest first."),
  low: priceArray("Low prices, oldest first."),
  close,
};
const period = (d) => z.number().int().min(1).max(1000).optional().describe(`Lookback period; default ${d}.`);
const tail = z.number().int().min(0).max(MAX_SERIES).optional().describe("How many latest values to return; default 5, 0 for the whole series.");

const nulls = (n) => new Array(n).fill(null);

// Simple moving average with output from index start + n - 1 (nulls before).
function sma(x, n, start = 0) {
  const out = nulls(x.length);
  if (x.length - start < n) return out;
  let s = 0;
  for (let i = start; i < start + n; i++) s += x[i];
  out[start + n - 1] = s / n;
  for (let i = start + n; i < x.length; i++) { s += x[i] - x[i - n]; out[i] = s / n; }
  return out;
}

// EMA seeded with the simple average of the n values ending at `first` (TA-Lib's default seed).
function ema(x, n, first = null, k = 2 / (n + 1)) {
  const out = nulls(x.length);
  let start = 0;
  while (start < x.length && x[start] === null) start++;
  const f = first ?? start + n - 1;
  if (f >= x.length) return out;
  let s = 0;
  for (let i = f - n + 1; i <= f; i++) s += x[i];
  let e = s / n;
  out[f] = e;
  for (let i = f + 1; i < x.length; i++) { e = (x[i] - e) * k + e; out[i] = e; }
  return out;
}

function wma(x, n) {
  const out = nulls(x.length), den = n * (n + 1) / 2;
  let start = 0;
  while (start < x.length && x[start] === null) start++;
  for (let i = start + n - 1; i < x.length; i++) { let s = 0; for (let j = 0; j < n; j++) s += x[i - j] * (n - j); out[i] = s / den; }
  return out;
}

const rollMax = (x, n, i) => { let m = -Infinity; for (let j = i - n + 1; j <= i; j++) if (x[j] > m) m = x[j]; return m; };
const rollMin = (x, n, i) => { let m = Infinity; for (let j = i - n + 1; j <= i; j++) if (x[j] < m) m = x[j]; return m; };
const comb = (a, b, f) => a.map((v, i) => (v === null || b[i] === null ? null : f(v, b[i])));

function trueRange(h, l, c) {
  const tr = nulls(c.length);
  for (let i = 1; i < c.length; i++) tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  return tr;
}

// Wilder average of a series whose first value is at `from`: first output is the plain mean of n
// values, then (prev (n-1) + x) / n.
function wilder(x, n, from) {
  const out = nulls(x.length);
  if (x.length < from + n) return out;
  let s = 0;
  for (let i = from; i < from + n; i++) s += x[i];
  let a = s / n;
  out[from + n - 1] = a;
  for (let i = from + n; i < x.length; i++) { a = (a * (n - 1) + x[i]) / n; out[i] = a; }
  return out;
}

function rsiOf(c, n) {
  const out = nulls(c.length);
  if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  out[n] = g + l === 0 ? 0 : 100 * g / (g + l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + (d > 0 ? d : 0)) / n; l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
    out[i] = g + l === 0 ? 0 : 100 * g / (g + l);
  }
  return out;
}

function cmoOf(c, n) {
  return rsiOf(c, n).map((r) => (r === null ? null : 2 * r - 100));
}

function atrOf(h, l, c, n) { return wilder(trueRange(h, l, c), n, 1); }

// TA-Lib's directional movement system: Wilder sums seeded over n-1 bars.
function dmi(h, l, c, n) {
  const len = c.length, pdi = nulls(len), mdi = nulls(len), dx = nulls(len), adx = nulls(len);
  if (len < 2 * n) return { pdi, mdi, dx, adx };
  const step = (i) => {
    const up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
    return { p: up > 0 && up > dn ? up : 0, m: dn > 0 && dn > up ? dn : 0, tr: Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) };
  };
  let sp = 0, sm = 0, st = 0;
  for (let i = 1; i < n; i++) { const s = step(i); sp += s.p; sm += s.m; st += s.tr; }
  for (let i = n; i < len; i++) {
    const s = step(i);
    sp = sp - sp / n + s.p; sm = sm - sm / n + s.m; st = st - st / n + s.tr;
    if (st !== 0) {
      pdi[i] = 100 * sp / st; mdi[i] = 100 * sm / st;
      const t = pdi[i] + mdi[i];
      dx[i] = t !== 0 ? 100 * Math.abs(pdi[i] - mdi[i]) / t : 0;
    } else { pdi[i] = 0; mdi[i] = 0; dx[i] = 0; }
  }
  let a = 0;
  for (let i = n; i < 2 * n; i++) a += dx[i];
  a /= n;
  adx[2 * n - 1] = a;
  for (let i = 2 * n; i < len; i++) { a = (a * (n - 1) + dx[i]) / n; adx[i] = a; }
  return { pdi, mdi, dx, adx };
}

function sameLength(...arrs) {
  const n = arrs[0].length;
  arrs.forEach((a) => { if (a && a.length !== n) throw new Error(`All price arrays need the same length (${n}).`); });
}

function shape(series, t = 5) {
  const out = {};
  for (const [k, s] of Object.entries(series)) {
    const v = t === 0 ? s : s.slice(-t);
    out[k] = v;
  }
  const len = Object.values(series)[0].length;
  return { ...out, latest: Object.fromEntries(Object.entries(series).map(([k, s]) => [k, s.at(-1)])), bars: len, first_index: t === 0 ? 0 : Math.max(0, len - t) };
}

function tool(name, title, description, keywords, fields, compute) {
  return {
    name, title, description, keywords,
    input: z.object({ ...fields, tail }).strict(),
    run(a) {
      sameLength(a.close ?? a.high, a.high, a.low, a.open, a.volume);
      return shape(compute(a), a.tail ?? 5);
    },
  };
}

export const TOOLS = [
  tool("sma", "Simple moving average", "Compute the simple moving average of closing prices over a lookback.", "sma simple moving average ma trend", { close, period: period(20) }, (a) => ({ sma: sma(a.close, a.period ?? 20) })),
  tool("ema", "Exponential moving average", "Compute the exponential moving average (seeded with the simple average, as TA-Lib does).", "ema exponential moving average trend smoothing", { close, period: period(20) }, (a) => ({ ema: ema(a.close, a.period ?? 20) })),
  tool("wma", "Weighted moving average", "Compute the linearly weighted moving average (latest price weighted most).", "wma weighted moving average linear", { close, period: period(20) }, (a) => ({ wma: wma(a.close, a.period ?? 20) })),
  tool("dema", "Double exponential moving average", "Compute the double exponential moving average (2 EMA - EMA of EMA), which lags less than an EMA.", "dema double exponential moving average lag", { close, period: period(20) }, (a) => { const n = a.period ?? 20, e1 = ema(a.close, n), e2 = ema(e1, n); return { dema: comb(e1, e2, (x, y) => 2 * x - y) }; }),
  tool("tema", "Triple exponential moving average", "Compute the triple exponential moving average (3 EMA - 3 EMA2 + EMA3).", "tema triple exponential moving average", { close, period: period(20) }, (a) => { const n = a.period ?? 20, e1 = ema(a.close, n), e2 = ema(e1, n), e3 = ema(e2, n); return { tema: e3.map((v, i) => (v === null ? null : 3 * e1[i] - 3 * e2[i] + v)) }; }),
  tool("hull_moving_average", "Hull moving average", "Compute the Hull moving average, WMA(2 WMA(n/2) - WMA(n), sqrt n), a fast, smooth trend line.", "hull moving average hma fast smooth", { close, period: period(20) }, (a) => { const n = a.period ?? 20, half = wma(a.close, Math.floor(n / 2)), full = wma(a.close, n); return { hma: wma(comb(half, full, (x, y) => 2 * x - y), Math.floor(Math.sqrt(n))) }; }),
  tool("kama", "Kaufman adaptive moving average", "Compute Kaufman's adaptive moving average, which speeds up in trends and slows in noise (efficiency ratio, fast 2, slow 30).", "kama kaufman adaptive moving average efficiency ratio", { close, period: period(10) }, (a) => {
    const c = a.close, n = a.period ?? 10, out = nulls(c.length), fast = 2 / 3, slow = 2 / 31;
    if (c.length <= n) return { kama: out };
    let k = c[n - 1];
    for (let i = n; i < c.length; i++) {
      let vol = 0; for (let j = i - n + 1; j <= i; j++) vol += Math.abs(c[j] - c[j - 1]);
      const er = vol === 0 ? 0 : Math.abs(c[i] - c[i - n]) / vol, sc = (er * (fast - slow) + slow) ** 2;
      k += sc * (c[i] - k); out[i] = k;
    }
    return { kama: out };
  }),
  tool("rsi", "Relative strength index", "Compute Wilder's relative strength index (0-100): above 70 often read as overbought, below 30 as oversold.", "rsi relative strength index momentum overbought oversold wilder", { close, period: period(14) }, (a) => ({ rsi: rsiOf(a.close, a.period ?? 14) })),
  tool("macd", "MACD", "Compute MACD (fast EMA - slow EMA), its signal line and histogram, as TA-Lib does.", "macd moving average convergence divergence signal histogram momentum", { close, fast: period(12), slow: period(26), signal: period(9) }, (a) => {
    const f = a.fast ?? 12, s = a.slow ?? 26, g = a.signal ?? 9;
    if (!(f < s)) throw new Error("fast must be shorter than slow.");
    const ef = ema(a.close, f, s - 1), es = ema(a.close, s, s - 1), m = comb(ef, es, (x, y) => x - y), sig = ema(m, g);
    const first = s - 1 + g - 1, macd = m.map((v, i) => (i < first ? null : v));
    return { macd, signal: sig, histogram: comb(macd, sig, (x, y) => x - y) };
  }),
  tool("bollinger_bands", "Bollinger Bands", "Compute Bollinger Bands: a moving average with bands k population standard deviations above and below, plus %B and bandwidth.", "bollinger bands volatility bands standard deviation percent b bandwidth squeeze", { close, period: period(20), deviations: z.number().positive().max(10).optional().describe("Band width in standard deviations; default 2.") }, (a) => {
    const n = a.period ?? 20, k = a.deviations ?? 2, c = a.close, mid = sma(c, n), up = nulls(c.length), lo = nulls(c.length), pb = nulls(c.length), bw = nulls(c.length);
    for (let i = n - 1; i < c.length; i++) {
      let v = 0; for (let j = i - n + 1; j <= i; j++) v += (c[j] - mid[i]) ** 2;
      const sd = Math.sqrt(v / n); up[i] = mid[i] + k * sd; lo[i] = mid[i] - k * sd;
      pb[i] = up[i] === lo[i] ? null : (c[i] - lo[i]) / (up[i] - lo[i]); bw[i] = mid[i] === 0 ? null : (up[i] - lo[i]) / mid[i];
    }
    return { upper: up, middle: mid, lower: lo, percent_b: pb, bandwidth: bw };
  }),
  tool("stochastic", "Stochastic oscillator", "Compute the slow stochastic oscillator: %K (smoothed position of the close in the high-low range) and %D.", "stochastic oscillator percent k d momentum overbought oversold", { ...ohlc, k_period: period(14), k_smooth: period(3), d_period: period(3) }, (a) => {
    const n = a.k_period ?? 14, h = a.high, l = a.low, c = a.close, raw = nulls(c.length);
    for (let i = n - 1; i < c.length; i++) { const hh = rollMax(h, n, i), ll = rollMin(l, n, i); raw[i] = hh === ll ? 0 : 100 * (c[i] - ll) / (hh - ll); }
    const k = sma(raw, a.k_smooth ?? 3, n - 1), d = sma(k, a.d_period ?? 3, n - 1 + (a.k_smooth ?? 3) - 1);
    const first = n - 1 + (a.k_smooth ?? 3) - 1 + (a.d_period ?? 3) - 1;
    return { k: k.map((v, i) => (i < first ? null : v)), d };
  }),
  tool("williams_r", "Williams %R", "Compute Williams %R (-100 to 0): where the close sits in the recent high-low range.", "williams percent r momentum overbought oversold", { ...ohlc, period: period(14) }, (a) => {
    const n = a.period ?? 14, out = nulls(a.close.length);
    for (let i = n - 1; i < a.close.length; i++) { const hh = rollMax(a.high, n, i), ll = rollMin(a.low, n, i); out[i] = hh === ll ? 0 : -100 * (hh - a.close[i]) / (hh - ll); }
    return { williams_r: out };
  }),
  tool("cci", "Commodity channel index", "Compute the commodity channel index: typical price's distance from its average in units of mean absolute deviation.", "cci commodity channel index momentum cyclical", { ...ohlc, period: period(14) }, (a) => {
    const n = a.period ?? 14, tp = a.close.map((c, i) => (a.high[i] + a.low[i] + c) / 3), m = sma(tp, n), out = nulls(tp.length);
    for (let i = n - 1; i < tp.length; i++) { let md = 0; for (let j = i - n + 1; j <= i; j++) md += Math.abs(tp[j] - m[i]); md /= n; out[i] = md === 0 ? 0 : (tp[i] - m[i]) / (0.015 * md); }
    return { cci: out };
  }),
  tool("atr", "Average true range", "Compute Wilder's average true range and its percent of price (NATR), the standard volatility measure for stops and sizing.", "atr average true range volatility stop loss position sizing natr", { ...ohlc, period: period(14) }, (a) => { const atr = atrOf(a.high, a.low, a.close, a.period ?? 14); return { atr, natr: atr.map((v, i) => (v === null ? null : 100 * v / a.close[i])) }; }),
  tool("adx", "Average directional index", "Compute Wilder's ADX trend strength with +DI and -DI (TA-Lib's smoothing): ADX above 25 is usually read as trending.", "adx average directional index dmi plus minus di trend strength wilder", { ...ohlc, period: period(14) }, (a) => { const d = dmi(a.high, a.low, a.close, a.period ?? 14); return { adx: d.adx, plus_di: d.pdi, minus_di: d.mdi }; }),
  tool("obv", "On-balance volume", "Compute on-balance volume, the running sum of volume signed by the close's direction.", "obv on balance volume accumulation", { close, volume: priceArray("Volume per bar.") }, (a) => {
    const out = [a.volume[0]];
    for (let i = 1; i < a.close.length; i++) out.push(out[i - 1] + (a.close[i] > a.close[i - 1] ? a.volume[i] : a.close[i] < a.close[i - 1] ? -a.volume[i] : 0));
    return { obv: out };
  }),
  tool("money_flow_index", "Money flow index", "Compute the money flow index (volume-weighted RSI, 0-100) from typical price and volume.", "mfi money flow index volume rsi", { ...ohlc, volume: priceArray("Volume per bar."), period: period(14) }, (a) => {
    const n = a.period ?? 14, tp = a.close.map((c, i) => (a.high[i] + a.low[i] + c) / 3), out = nulls(tp.length);
    for (let i = n; i < tp.length; i++) {
      let pos = 0, neg = 0;
      for (let j = i - n + 1; j <= i; j++) { const f = tp[j] * a.volume[j]; if (tp[j] > tp[j - 1]) pos += f; else if (tp[j] < tp[j - 1]) neg += f; }
      out[i] = pos + neg === 0 ? 0 : 100 * pos / (pos + neg);
    }
    return { mfi: out };
  }),
  tool("rate_of_change", "Rate of change and momentum", "Compute rate of change (percent change over n bars) and momentum (price difference over n bars).", "roc rate of change momentum percent change", { close, period: period(10) }, (a) => {
    const n = a.period ?? 10, c = a.close;
    return { roc: c.map((v, i) => (i < n ? null : c[i - n] === 0 ? null : 100 * (v / c[i - n] - 1))), momentum: c.map((v, i) => (i < n ? null : v - c[i - n])) };
  }),
  tool("trix", "TRIX", "Compute TRIX, the one-bar percent change of a triple-smoothed EMA, a filtered momentum oscillator.", "trix triple exponential momentum oscillator", { close, period: period(30) }, (a) => {
    const n = a.period ?? 30, e3 = ema(ema(ema(a.close, n), n), n);
    return { trix: e3.map((v, i) => (v === null || i === 0 || e3[i - 1] === null ? null : 100 * (v / e3[i - 1] - 1))) };
  }),
  tool("aroon", "Aroon indicator", "Compute Aroon up and down (0-100: how recently the highest high and lowest low occurred) and the Aroon oscillator.", "aroon up down oscillator trend new highs lows", { high: ohlc.high, low: ohlc.low, period: period(14) }, (a) => {
    const n = a.period ?? 14, len = a.high.length, up = nulls(len), dn = nulls(len);
    for (let i = n; i < len; i++) {
      let hi = i - n, lo = i - n;
      for (let j = i - n; j <= i; j++) { if (a.high[j] >= a.high[hi]) hi = j; if (a.low[j] <= a.low[lo]) lo = j; }
      up[i] = 100 * (n - (i - hi)) / n; dn[i] = 100 * (n - (i - lo)) / n;
    }
    return { aroon_up: up, aroon_down: dn, oscillator: comb(up, dn, (x, y) => x - y) };
  }),
  tool("chande_momentum", "Chande momentum oscillator", "Compute the Chande momentum oscillator (-100 to 100) with Wilder smoothing, as TA-Lib does.", "cmo chande momentum oscillator", { close, period: period(14) }, (a) => ({ cmo: cmoOf(a.close, a.period ?? 14) })),
  tool("ultimate_oscillator", "Ultimate oscillator", "Compute Williams' ultimate oscillator, blending buying pressure over three horizons (7, 14, 28 by default).", "ultimate oscillator williams buying pressure", { ...ohlc, short: period(7), medium: period(14), long: period(28) }, (a) => {
    const [p1, p2, p3] = [a.short ?? 7, a.medium ?? 14, a.long ?? 28], c = a.close, len = c.length, out = nulls(len);
    const bp = nulls(len), tr = nulls(len);
    for (let i = 1; i < len; i++) { const tl = Math.min(a.low[i], c[i - 1]); bp[i] = c[i] - tl; tr[i] = Math.max(a.high[i], c[i - 1]) - tl; }
    const avg = (i, p) => { let b = 0, t = 0; for (let j = i - p + 1; j <= i; j++) { b += bp[j]; t += tr[j]; } return t === 0 ? 0 : b / t; };
    const longest = Math.max(p1, p2, p3);
    for (let i = longest; i < len; i++) out[i] = 100 * (4 * avg(i, p1) + 2 * avg(i, p2) + avg(i, p3)) / 7;
    return { ultimate_oscillator: out };
  }),
  tool("accumulation_distribution", "Accumulation/distribution and Chaikin oscillator", "Compute the Chaikin accumulation/distribution line and the Chaikin oscillator (fast EMA - slow EMA of the line).", "accumulation distribution ad line chaikin oscillator adosc volume", { ...ohlc, volume: priceArray("Volume per bar."), fast: period(3), slow: period(10) }, (a) => {
    const len = a.close.length, ad = new Array(len);
    let s = 0;
    for (let i = 0; i < len; i++) { const r = a.high[i] - a.low[i]; if (r > 0) s += ((a.close[i] - a.low[i]) - (a.high[i] - a.close[i])) / r * a.volume[i]; ad[i] = s; }
    const f = a.fast ?? 3, sl = a.slow ?? 10, kf = 2 / (f + 1), ks = 2 / (sl + 1), osc = nulls(len);
    let ef = ad[0], es = ad[0];
    for (let i = 1; i < len; i++) { ef = (ad[i] - ef) * kf + ef; es = (ad[i] - es) * ks + es; if (i >= Math.max(f, sl) - 1) osc[i] = ef - es; }
    return { ad_line: ad, chaikin_oscillator: osc };
  }),
  tool("donchian_channels", "Donchian channels", "Compute Donchian channels: the highest high and lowest low over a lookback and their midpoint (breakout systems).", "donchian channel breakout turtle highest high lowest low", { high: ohlc.high, low: ohlc.low, period: period(20) }, (a) => {
    const n = a.period ?? 20, len = a.high.length, up = nulls(len), lo = nulls(len), mid = nulls(len);
    for (let i = n - 1; i < len; i++) { up[i] = rollMax(a.high, n, i); lo[i] = rollMin(a.low, n, i); mid[i] = (up[i] + lo[i]) / 2; }
    return { upper: up, middle: mid, lower: lo };
  }),
  tool("keltner_channels", "Keltner channels", "Compute Keltner channels: an EMA of the close with bands a multiple of ATR above and below.", "keltner channels atr bands volatility envelope", { ...ohlc, period: period(20), atr_period: period(10), multiplier: z.number().positive().max(10).optional().describe("ATR multiple; default 2.") }, (a) => {
    const mid = ema(a.close, a.period ?? 20), atr = atrOf(a.high, a.low, a.close, a.atr_period ?? 10), m = a.multiplier ?? 2;
    return { upper: comb(mid, atr, (x, y) => x + m * y), middle: mid, lower: comb(mid, atr, (x, y) => x - m * y) };
  }),
  tool("vwap", "Volume-weighted average price", "Compute the cumulative volume-weighted average price from typical price, or a rolling VWAP over a window.", "vwap volume weighted average price execution benchmark intraday", { ...ohlc, volume: priceArray("Volume per bar."), window: z.number().int().min(1).max(100000).optional().describe("Rolling window in bars; default cumulative.") }, (a) => {
    const tp = a.close.map((c, i) => (a.high[i] + a.low[i] + c) / 3), len = tp.length, out = nulls(len), w = a.window;
    let pv = 0, v = 0;
    for (let i = 0; i < len; i++) {
      pv += tp[i] * a.volume[i]; v += a.volume[i];
      if (w && i >= w) { pv -= tp[i - w] * a.volume[i - w]; v -= a.volume[i - w]; }
      if (!w || i >= w - 1) out[i] = v === 0 ? null : pv / v;
    }
    return { vwap: out };
  }),
  tool("ichimoku_cloud", "Ichimoku cloud", "Compute the Ichimoku lines: conversion (tenkan), base (kijun), leading spans A and B (shown at the bar they are computed, not shifted forward) and lagging span.", "ichimoku cloud tenkan kijun senkou span chikou trend", { ...ohlc, conversion: period(9), base: period(26), span_b: period(52) }, (a) => {
    const len = a.close.length, mid = (n) => a.close.map((_, i) => (i < n - 1 ? null : (rollMax(a.high, n, i) + rollMin(a.low, n, i)) / 2));
    const t = mid(a.conversion ?? 9), k = mid(a.base ?? 26), b = mid(a.span_b ?? 52);
    return { conversion: t, base: k, span_a: comb(t, k, (x, y) => (x + y) / 2), span_b: b, lagging: a.close.map((_, i) => (i + (a.base ?? 26) - 1 < len ? a.close[i + (a.base ?? 26) - 1] : null)) };
  }),
  tool("rolling_zscore", "Rolling z-score", "Compute each price's z-score against its rolling mean and sample standard deviation, the basic mean-reversion signal.", "z score rolling standardized mean reversion signal bollinger", { close, period: period(20) }, (a) => {
    const n = a.period ?? 20, c = a.close, out = nulls(c.length);
    for (let i = n - 1; i < c.length; i++) { let m = 0; for (let j = i - n + 1; j <= i; j++) m += c[j]; m /= n; let v = 0; for (let j = i - n + 1; j <= i; j++) v += (c[j] - m) ** 2; const sd = Math.sqrt(v / (n - 1)); out[i] = sd === 0 ? 0 : (c[i] - m) / sd; }
    return { zscore: out };
  }),
  tool("stochastic_rsi", "Stochastic RSI", "Compute the stochastic RSI: where RSI sits in its own recent range (%K, unsmoothed by default as in TA-Lib) and its moving average %D.", "stochastic rsi stoch rsi momentum overbought oversold", { close, period: period(14), stoch_period: period(14), k_smooth: period(1), d_period: period(3) }, (a) => {
    const r = rsiOf(a.close, a.period ?? 14), n = a.stoch_period ?? 14, len = r.length, raw = nulls(len), start = (a.period ?? 14) + n - 1;
    for (let i = start; i < len; i++) { const w = r.slice(i - n + 1, i + 1), hi = Math.max(...w), lo = Math.min(...w); raw[i] = hi === lo ? 0 : 100 * (r[i] - lo) / (hi - lo); }
    const ks = a.k_smooth ?? 1, k = sma(raw, ks, start), d = sma(k, a.d_period ?? 3, start + ks - 1);
    return { k, d };
  }),
  tool("parabolic_sar", "Parabolic SAR", "Compute Wilder's parabolic stop-and-reverse trailing stop with its trend direction (acceleration 0.02 step, 0.2 max by default).", "parabolic sar stop and reverse trailing stop wilder trend", { high: ohlc.high, low: ohlc.low, step: z.number().positive().max(1).optional().describe("Acceleration step; default 0.02."), max_step: z.number().positive().max(1).optional().describe("Maximum acceleration; default 0.2.") }, (a) => {
    const h = a.high, l = a.low, len = h.length, af0 = a.step ?? 0.02, afMax = a.max_step ?? 0.2, sar = nulls(len), dir = nulls(len);
    if (len < 2) return { sar, direction: dir };
    // Initial direction from the first bar's directional movement, as TA-Lib does.
    const up = h[1] - h[0], dn = l[0] - l[1];
    let long = !(dn > 0 && dn > up), af = af0, ep = long ? h[1] : l[1], s = long ? l[0] : h[0];
    for (let i = 1; i < len; i++) {
      if (i > 1) s = s + af * (ep - s);
      if (long) {
        if (i > 1) s = Math.min(s, l[i - 1], i > 2 ? l[i - 2] : l[i - 1]);
        if (l[i] < s) { long = false; s = ep; ep = l[i]; af = af0; s = Math.max(s, h[i], h[i - 1]); }
        else if (h[i] > ep) { ep = h[i]; af = Math.min(af + af0, afMax); }
      } else {
        if (i > 1) s = Math.max(s, h[i - 1], i > 2 ? h[i - 2] : h[i - 1]);
        if (h[i] > s) { long = true; s = ep; ep = h[i]; af = af0; s = Math.min(s, l[i], l[i - 1]); }
        else if (l[i] < ep) { ep = l[i]; af = Math.min(af + af0, afMax); }
      }
      sar[i] = s; dir[i] = long ? 1 : -1;
    }
    return { sar, direction: dir };
  }),
];
