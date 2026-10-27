// Interactive views inside the viewer (MCP Apps): candlestick charts with indicators, option
// chains, backtest dashboards with sliders, sweep heatmaps, treemaps and the paper order ticket.
// studioFor() leaves a placeholder for each view a result holds, and mountStudio() brings them to
// life once the page holds them. Indicators follow the quant pack's (TA-Lib's) definitions, so the
// chart and the tools agree. Everything is drawn from the result already in hand: zooming, panning,
// sorting and toggling cost no tool call and no tokens. Only what the person presses (an expiration,
// a released slider, Approve) calls a tool again, through the host, and its answer goes to the view.
import { esc, fmt, short } from "./render.js";
import { ATLAS_MOUNTS, atlasFor } from "./atlas.js";

const PLACED = [];
let STUDIO = { input: {}, call: null, compact: false };
export function studioReset(input) { PLACED.length = 0; STUDIO = { input: input && typeof input === "object" ? input : {}, call: null, compact: false }; }
// While on, a price series is left to a comparison above it rather than drawn on its own.
export function studioCompact(on) { STUDIO.compact = Boolean(on); }
// Which call of the input a result answers: its tool's name and its place in a batch (null alone).
export function studioCall(name, index) { STUDIO.call = { name, index }; }
export const place = (kind, data) => { PLACED.push({ kind, data, call: STUDIO.call, input: STUDIO.input }); return `<div class="w" data-w="${PLACED.length - 1}" data-kind="${kind}"></div>`; };
export const placed = () => PLACED.map((p) => p.kind);

export const finite = (v) => typeof v === "number" && Number.isFinite(v);
export const colsOf = (t) => (t && typeof t === "object" && Array.isArray(t.columns) && Array.isArray(t.rows) ? t.columns.map(String) : null);
export const pct = (v, d = 1) => (finite(v) ? `${(v * 100).toFixed(d)}%` : "–");
export const signed = (v, d = 1) => (finite(v) ? `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%` : "–");
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const nullsOf = (n) => new Array(n).fill(null);

// ---------------------------------------------------------------------------------------------
// Indicators, as the quant pack computes them
// ---------------------------------------------------------------------------------------------
export function smaSeries(x, n) {
  const out = nullsOf(x.length);
  if (x.length < n) return out;
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i];
  out[n - 1] = s / n;
  for (let i = n; i < x.length; i++) { s += x[i] - x[i - n]; out[i] = s / n; }
  return out;
}
// EMA seeded with the simple average of the n values ending at `first` (TA-Lib's seed).
export function emaSeries(x, n, first = null) {
  const out = nullsOf(x.length), k = 2 / (n + 1);
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
export function rsiSeries(c, n = 14) {
  const out = nullsOf(c.length);
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
export function macdSeries(c, fast = 12, slow = 26, signal = 9) {
  const ef = emaSeries(c, fast, slow - 1), es = emaSeries(c, slow, slow - 1);
  const m = ef.map((v, i) => (v === null || es[i] === null ? null : v - es[i])), sig = emaSeries(m, signal);
  const first = slow - 1 + signal - 1, macd = m.map((v, i) => (i < first ? null : v));
  return { macd, signal: sig, histogram: macd.map((v, i) => (v === null || sig[i] === null ? null : v - sig[i])) };
}
// Bollinger bands: the n-period average and k population standard deviations either side.
export function bollingerSeries(c, n = 20, k = 2) {
  const mid = smaSeries(c, n), up = nullsOf(c.length), lo = nullsOf(c.length);
  for (let i = n - 1; i < c.length; i++) {
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (c[j] - mid[i]) ** 2;
    const sd = Math.sqrt(v / n); up[i] = mid[i] + k * sd; lo[i] = mid[i] - k * sd;
  }
  return { mid, up, lo };
}

// ---------------------------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------------------------
// A squarified treemap (Bruls, Huizing and van Wijk): items {value} laid out in the rectangle, each
// area in proportion to its value, rows chosen to keep the cells near square.
export function squarify(items, x, y, w, h) {
  const total = items.reduce((s, it) => s + it.value, 0);
  if (!(total > 0)) return [];
  const scale = (w * h) / total, queue = items.map((it) => ({ ...it, area: it.value * scale })).sort((a, b) => b.area - a.area), out = [];
  let rx = x, ry = y, rw = w, rh = h;
  const worst = (row, side) => { const s = row.reduce((a, r) => a + r.area, 0), mx = Math.max(...row.map((r) => r.area)), mn = Math.min(...row.map((r) => r.area)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
  while (queue.length) {
    const side = Math.min(rw, rh), row = [queue.shift()];
    while (queue.length && worst([...row, queue[0]], side) <= worst(row, side)) row.push(queue.shift());
    const s = row.reduce((a, r) => a + r.area, 0);
    if (rw >= rh) {
      const cw = s / rh; let cy = ry;
      for (const r of row) { const ch = r.area / cw; out.push({ ...r, x: rx, y: cy, w: cw, h: ch }); cy += ch; }
      rx += cw; rw -= cw;
    } else {
      const ch = s / rw; let cx = rx;
      for (const r of row) { const cw = r.area / ch; out.push({ ...r, x: cx, y: ry, w: cw, h: ch }); cx += cw; }
      ry += ch; rh -= ch;
    }
  }
  return out;
}

// An option chain's rows (one per contract) as strikes, each with its call and put.
export function pivotChain(columns, rows) {
  const ix = Object.fromEntries(columns.map((c, i) => [c, i])), by = new Map();
  for (const r of rows) {
    const k = r[ix.strike];
    if (!finite(k)) continue;
    if (!by.has(k)) by.set(k, { strike: k, call: null, put: null });
    by.get(k)[/^p/i.test(String(r[ix.type])) ? "put" : "call"] = Object.fromEntries(columns.map((c, i) => [c, r[i]]));
  }
  return [...by.values()].sort((a, b) => a.strike - b.strike);
}

// Holdings or weights in a table: a label, a positive size, and when there is one a change (or a
// profit over cost) and a group. Returns null when the table is not that.
const LABEL = /^(symbol|ticker|name|asset|holding|issuer|title|company|fund)$/i;
const SIZE = /^(market_value|value|value_usd|weight|target_weight|portfolio_weight|percent|pct|percent_of_portfolio|share_of_portfolio|weight_pct)$/i;
const CHANGE = /^(change|change_pct|return|day_change|total_return|unrealized_plpc)$/i;
const GROUP = /^(sector|industry|asset_class|group|category)$/i;
export function treemapData(t) {
  const c = colsOf(t);
  if (!c || t.rows.length < 2 || t.rows.length > 400) return null;
  const li = c.findIndex((x) => LABEL.test(x)), si = c.findIndex((x) => SIZE.test(x));
  if (li < 0 || si < 0) return null;
  const pl = c.indexOf("unrealized_pl"), ci = c.findIndex((x) => CHANGE.test(x)), gi = c.findIndex((x) => GROUP.test(x));
  const items = t.rows.filter((r) => finite(r[si]) && r[si] !== 0).map((r) => {
    const size = r[si], change = ci >= 0 && finite(r[ci]) ? r[ci] : pl >= 0 && finite(r[pl]) && Math.abs(size - r[pl]) > 0 ? r[pl] / Math.abs(size - r[pl]) : null;
    return { label: String(r[li] ?? ""), value: Math.abs(size), short: size < 0, size, change, group: gi >= 0 ? r[gi] : null };
  });
  if (items.filter((x) => x.value > 0).length < 2) return null;
  return { items, size: c[si], change: ci >= 0 ? c[ci] : pl >= 0 ? "return on cost" : null };
}
// Weights as parallel lists (the portfolio optimizers): assets (or names) and weights.
function weightLists(r) {
  const w = r.weights, names = r.assets ?? r.names ?? r.tickers;
  if (Array.isArray(w) && w.length >= 2 && w.length <= 400 && w.every(finite)) return { items: w.map((v, i) => ({ label: String(Array.isArray(names) ? names[i] ?? `asset ${i + 1}` : `asset ${i + 1}`), value: Math.abs(v), short: v < 0, size: v, change: null })), size: "weight", change: null };
  if (w && typeof w === "object" && !Array.isArray(w)) { const e = Object.entries(w).filter(([, v]) => finite(v)); if (e.length >= 2 && e.length <= 400) return { items: e.map(([k, v]) => ({ label: k, value: Math.abs(v), short: v < 0, size: v, change: null })), size: "weight", change: null }; }
  return null;
}

// ---------------------------------------------------------------------------------------------
// What a result holds that a view draws
// ---------------------------------------------------------------------------------------------
export function studioFor(result) {
  const used = new Set(), out = [];
  if (!result || typeof result !== "object" || Array.isArray(result)) return { html: "", used };
  const use = (...k) => k.forEach((x) => used.add(x));
  const c = colsOf(result), n = Array.isArray(result.dates) ? result.dates.length : 0;
  if (n >= 2 && ["open", "high", "low", "close"].every((k) => Array.isArray(result[k]) && result[k].length === n)) { if (!STUDIO.compact) out.push(place("candles", result)); use("dates", "open", "high", "low", "close", "volume"); }
  if (c && result.underlying && ["strike", "type", "bid", "ask"].every((k) => c.includes(k))) { out.push(place("chain", result)); use("columns", "rows", "expirations", "underlying", "summary", "expiration", "days_to_expiration"); }
  const cc = colsOf(result.curve);
  if (cc && cc.includes("strategy") && cc.includes("buy_and_hold")) { out.push(place("backtest", result)); use("curve", "trades", "parameters", "rule", "total_return", "cagr", "volatility", "sharpe", "max_drawdown", "calmar", "buy_and_hold", "returns_tail", "periods"); }
  if (c && c[0] === "params" && typeof result.recipe === "string" && result.rows.length > 1) { out.push(place("sweep", result)); if (sweepGrid(result.rows)) use("deflation"); }
  if (result.paper === true && "token" in result && c && c.includes("accepted")) { out.push(place("ticket", result)); use("columns", "rows", "token", "expires_at", "accepted", "next"); }
  out.push(...atlasFor(result, use, used));
  if (!used.has("rows")) {
    const tm = [[null, result], ...Object.entries(result).filter(([k]) => !used.has(k))].map(([k, t]) => [k, treemapData(t)]).find(([, d]) => d) ?? [null, weightLists(result)];
    if (tm[1]) out.push(place("treemap", { ...tm[1], title: tm[0] }));
  }
  return { html: out.join(""), used };
}

// ---------------------------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------------------------
export const btn = (label, attrs = "") => `<button type="button" ${attrs}>${label}</button>`;
export const toggle = (key, label, on) => btn(esc(label), `data-t="${key}" aria-pressed="${on}"`);
// A line through values, broken at nulls.
export function pathOf(values, X, Y, from = 0, to = values.length - 1) {
  let d = "", pen = false;
  for (let i = from; i <= to; i++) { const v = values[i]; if (!finite(v)) { pen = false; continue; } d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; }
  return d;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dateLabel(s, long) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return String(s);
  return long ? `${MONTHS[+m[2] - 1]} ${m[1]}` : `${MONTHS[+m[2] - 1]} ${+m[3]}`;
}
export function xTicks(labels, from, to, X, y, width) {
  const count = to - from + 1, k = Math.max(2, Math.floor(width / 110)), step = Math.max(1, Math.round(count / k));
  const long = /^\d{4}/.test(String(labels[from])) && Date.parse(labels[to]) - Date.parse(labels[from]) > 400 * 86400000;
  let s = "", prev = null;
  // Each label once, the first anchored at its start so it is not cut at the left edge.
  for (let i = from; i <= to; i += step) {
    const text = dateLabel(labels[i], long);
    if (text === prev) continue;
    prev = text;
    s += `<text x="${X(i).toFixed(1)}" y="${y}" class="axis" text-anchor="${i === from ? "start" : "middle"}">${esc(text)}</text>`;
  }
  return s;
}
export function yGrid(lo, hi, Y, x1, x2, fmtY = short, n = 4) {
  let s = "";
  for (let g = 0; g <= n; g++) { const v = lo + ((hi - lo) * g) / n, y = Y(v).toFixed(1); s += `<line x1="${x1}" x2="${x2}" y1="${y}" y2="${y}" class="grid"/><text x="${x2 + 4}" y="${(+y + 4).toFixed(1)}" class="axis">${esc(fmtY(v))}</text>`; }
  return s;
}
// Tool results from the host: the structured result, or the error's text as an Error.
export function resultOf(res) {
  if (!res) throw new Error("No answer from the host.");
  const text = res.content && res.content[0] && res.content[0].type === "text" ? res.content[0].text : "";
  if (res.isError) throw new Error(text || "The tool returned an error.");
  if (res.structuredContent !== undefined) return res.structuredContent;
  try { return JSON.parse(text); } catch { return text; }
}
// The input to call again: the call this view came from with its arguments patched (and the batch
// cut after it, so its answer is the last), or another tool on its own. It asks as a view does
// (view: true), so a long answer, such as SPY since 2010 beside a backtest, comes back whole.
export function againInput(p, patch, name) {
  const inp = p.input || {};
  if (Array.isArray(inp.calls) && p.call && p.call.index !== null && p.call.index !== undefined) {
    const calls = inp.calls.slice(0, p.call.index + 1).map((c, i) => (i === p.call.index ? { name: name ?? c.name, arguments: { ...(c.arguments || {}), ...patch } } : c));
    return { calls, return: "last", digits: 6, view: true };
  }
  return { name: name ?? inp.name ?? (p.call && p.call.name), arguments: { ...(inp.arguments || {}), ...patch }, digits: 6, view: true };
}
export async function callAgain(host, p, patch, name) {
  const r = resultOf(await host.call("run_tool", againInput(p, patch, name)));
  if (r && Array.isArray(r.results)) { const last = r.results.at(-1); if (last.error) throw new Error(last.error); return last.result; }
  return r;
}
export function tipAt(tip, box, html, px, py) {
  tip.innerHTML = html; tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight, W = box.clientWidth;
  tip.style.left = `${clamp(px + 14 + w > W ? px - w - 14 : px + 14, 0, Math.max(0, W - w))}px`;
  tip.style.top = `${Math.max(0, py - h - 8)}px`;
}
export const notice = (el, text, kind = "note") => { el.innerHTML = `<p class="${kind}">${esc(text)}</p>`; };

// ---------------------------------------------------------------------------------------------
// Candlesticks: zoom, pan, overlays and indicator panes
// ---------------------------------------------------------------------------------------------
export function mountCandles(el, r) {
  const d = r.dates, o = r.open, h = r.high, l = r.low, c = r.close, v = Array.isArray(r.volume) && r.volume.some(finite) ? r.volume : null, n = d.length;
  const ind = { sma20: smaSeries(c, 20), sma50: smaSeries(c, 50), sma200: smaSeries(c, 200), bb: bollingerSeries(c, 20, 2), rsi: rsiSeries(c, 14), macd: macdSeries(c, 12, 26, 9) };
  const on = { sma20: n >= 40, sma50: n >= 120, sma200: false, bb: false, volume: Boolean(v), rsi: false, macd: false };
  let mode = n > 1500 ? "line" : "candles", from = n > 300 ? n - 252 : 0, to = n - 1, hover = null, drag = null, layout = null;
  const OVER = [["sma20", "SMA 20", "s0"], ["sma50", "SMA 50", "s1"], ["sma200", "SMA 200", "s2"]];
  el.innerHTML = `<div class="ctl" role="toolbar" aria-label="Chart controls"><span class="grp">${[["1M", 21], ["3M", 63], ["6M", 126], ["YTD", "ytd"], ["1Y", 252], ["5Y", 1260], ["All", "all"]].map(([k, val]) => btn(k, `data-r="${val}"`)).join("")}</span><span class="grp">${toggle("candles", "Candles", mode === "candles")}${toggle("line", "Line", mode === "line")}</span><span class="grp">${OVER.map(([k, lab]) => toggle(k, lab, on[k])).join("")}${toggle("bb", "Bollinger", on.bb)}${v ? toggle("volume", "Volume", on.volume) : ""}${toggle("rsi", "RSI", on.rsi)}${toggle("macd", "MACD", on.macd)}</span><span class="grp">${btn("−", 'data-z="out" aria-label="Zoom out"')}${btn("+", 'data-z="in" aria-label="Zoom in"')}</span>${btn("Table", 'data-t="table" aria-pressed="false"')}</div>
<div class="plot" tabindex="0" aria-label="Price chart. Drag to pan, plus and minus to zoom, double-click to reset."></div><div class="xh" hidden></div><div class="tip" hidden></div>
<div class="legend"></div><p class="note">Drag to pan · ctrl or ⌘ + scroll, or + and −, to zoom · double-click to reset${r.adjusted ? " · prices adjusted for splits and dividends" : ""}.</p><div class="tbl" hidden></div>`;
  const plot = el.querySelector(".plot"), tip = el.querySelector(".tip"), xh = el.querySelector(".xh"), legend = el.querySelector(".legend"), tbl = el.querySelector(".tbl");
  const draw = () => {
    const W = clamp(plot.clientWidth || el.clientWidth || 720, 300, 1400), L = 6, R = 62, T = 8, mainH = 250, volH = on.volume ? 48 : 0, paneH = 78, gap = 10;
    const panes = [on.rsi && "rsi", on.macd && "macd"].filter(Boolean), H = T + mainH + volH + panes.length * (paneH + gap) + 22;
    const count = to - from + 1, bw = (W - L - R) / count, X = (i) => L + (i - from + 0.5) * bw;
    let lo = Infinity, hi = -Infinity;
    const grow = (x) => { if (finite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } };
    for (let i = from; i <= to; i++) {
      if (mode === "line") grow(c[i]); else { grow(l[i]); grow(h[i]); }
      for (const [k] of OVER) if (on[k]) grow(ind[k][i]);
      if (on.bb) { grow(ind.bb.up[i]); grow(ind.bb.lo[i]); }
    }
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
    const Y = (y) => T + (1 - (y - lo) / (hi - lo)) * mainH;
    let s = yGrid(lo, hi, Y, L, W - R);
    if (on.bb) {
      const up = [], dn = [];
      for (let i = from; i <= to; i++) if (finite(ind.bb.up[i])) { up.push(`${X(i).toFixed(1)},${Y(ind.bb.up[i]).toFixed(1)}`); dn.unshift(`${X(i).toFixed(1)},${Y(ind.bb.lo[i]).toFixed(1)}`); }
      if (up.length > 1) s += `<polygon points="${up.join(" ")} ${dn.join(" ")}" class="band"/><path d="${pathOf(ind.bb.up, X, Y, from, to)}" class="line s3 thin"/><path d="${pathOf(ind.bb.lo, X, Y, from, to)}" class="line s3 thin"/>`;
    }
    if (on.volume) {
      let vmax = 0; for (let i = from; i <= to; i++) if (finite(v[i])) vmax = Math.max(vmax, v[i]);
      const base = T + mainH + volH;
      if (vmax > 0) for (let i = from; i <= to; i++) if (finite(v[i]) && v[i] > 0) { const hh = (v[i] / vmax) * (volH - 6); s += `<rect x="${(X(i) - Math.max(0.5, bw * 0.4)).toFixed(1)}" y="${(base - hh).toFixed(1)}" width="${Math.max(1, bw * 0.8).toFixed(1)}" height="${hh.toFixed(1)}" class="${c[i] >= o[i] ? "v-up" : "v-dn"}"/>`; }
    }
    if (mode === "line") s += `<path d="${pathOf(c, X, Y, from, to)}" class="line s0"/>`;
    else for (let i = from; i <= to; i++) {
      if (![o[i], h[i], l[i], c[i]].every(finite)) continue;
      const up = c[i] >= o[i], x = X(i).toFixed(1), cls = up ? "up" : "dn";
      s += `<line x1="${x}" x2="${x}" y1="${Y(h[i]).toFixed(1)}" y2="${Y(l[i]).toFixed(1)}" class="wk-${cls}"/>`;
      if (bw >= 3) { const top = Y(Math.max(o[i], c[i])), bh = Math.max(1, Math.abs(Y(o[i]) - Y(c[i]))); s += `<rect x="${(X(i) - bw * 0.36).toFixed(1)}" y="${top.toFixed(1)}" width="${(bw * 0.72).toFixed(1)}" height="${bh.toFixed(1)}" class="cd-${cls}"/>`; }
    }
    for (const [k, , cls] of OVER) if (on[k]) s += `<path d="${pathOf(ind[k], X, Y, from, to)}" class="line ${cls} thin"/>`;
    let y0 = T + mainH + volH;
    for (const pane of panes) {
      y0 += gap;
      const top = y0;
      if (pane === "rsi") {
        const PY = (x) => top + (1 - x / 100) * paneH;
        s += `<rect x="${L}" y="${top}" width="${W - L - R}" height="${paneH}" class="pane"/><line x1="${L}" x2="${W - R}" y1="${PY(70)}" y2="${PY(70)}" class="guide"/><line x1="${L}" x2="${W - R}" y1="${PY(30)}" y2="${PY(30)}" class="guide"/><text x="${W - R + 4}" y="${PY(70) + 4}" class="axis">70</text><text x="${W - R + 4}" y="${PY(30) + 4}" class="axis">30</text><text x="${L + 4}" y="${top + 12}" class="axis">RSI 14</text><path d="${pathOf(ind.rsi, X, PY, from, to)}" class="line s3 thin"/>`;
      } else {
        const m = ind.macd;
        let a = Infinity, b = -Infinity;
        for (let i = from; i <= to; i++) for (const x of [m.macd[i], m.signal[i], m.histogram[i]]) if (finite(x)) { a = Math.min(a, x); b = Math.max(b, x); }
        if (!(a < b)) { a = -1; b = 1; }
        const PY = (x) => top + (1 - (x - a) / (b - a)) * paneH, zero = PY(0);
        s += `<rect x="${L}" y="${top}" width="${W - L - R}" height="${paneH}" class="pane"/><line x1="${L}" x2="${W - R}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}" class="guide"/><text x="${L + 4}" y="${top + 12}" class="axis">MACD 12 26 9</text>`;
        for (let i = from; i <= to; i++) if (finite(m.histogram[i])) { const yy = PY(m.histogram[i]); s += `<rect x="${(X(i) - Math.max(0.5, bw * 0.35)).toFixed(1)}" y="${Math.min(yy, zero).toFixed(1)}" width="${Math.max(1, bw * 0.7).toFixed(1)}" height="${Math.max(0.5, Math.abs(yy - zero)).toFixed(1)}" class="${m.histogram[i] >= 0 ? "v-up" : "v-dn"}"/>`; }
        s += `<path d="${pathOf(m.macd, X, PY, from, to)}" class="line s0 thin"/><path d="${pathOf(m.signal, X, PY, from, to)}" class="line s1 thin"/>`;
      }
      y0 += paneH;
    }
    s += xTicks(d, from, to, X, H - 6, W - L - R);
    plot.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(`${r.symbol ?? "Price"} from ${d[from]} to ${d[to]}: close ${fmt(c[to])}`)}">${s}</svg>`;
    layout = { W, L, R, bw, X, H };
    const items = [...OVER.filter(([k]) => on[k]).map(([, lab, cls]) => `<span><i class="${cls}"></i>${esc(lab)}</span>`), ...(on.bb ? ['<span><i class="s3"></i>Bollinger 20, 2σ</span>'] : [])];
    const first = c[from], change = finite(first) && first ? c[to] / first - 1 : null;
    legend.innerHTML = `<span>${r.name ? `${esc(r.name)} · ` : ""}<b>${esc(dateLabel(d[from], true))} – ${esc(dateLabel(d[to], true))}</b> ${esc(signed(change))}</span>${mode === "candles" ? "<span>hollow: closed up · filled: closed down</span>" : ""}${items.join("")}`;
    el.querySelectorAll("[data-t]").forEach((b) => { const k = b.dataset.t; if (k === "candles" || k === "line") b.setAttribute("aria-pressed", String(mode === k)); else if (k in on) b.setAttribute("aria-pressed", String(on[k])); });
    if (!tbl.hidden) drawTable();
    if (hover !== null) showTip(hover);
  };
  const drawTable = () => {
    const rows = [];
    for (let i = to; i >= from && rows.length < 300; i--) rows.push(`<tr><td>${esc(d[i])}</td>${[o[i], h[i], l[i], c[i]].map((x) => `<td class="num">${fmt(x)}</td>`).join("")}${v ? `<td class="num">${fmt(v[i])}</td>` : ""}</tr>`);
    tbl.innerHTML = `<div class="scroll"><table><thead><tr><th>date</th><th class="num">open</th><th class="num">high</th><th class="num">low</th><th class="num">close</th>${v ? '<th class="num">volume</th>' : ""}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  };
  const showTip = (i) => {
    if (!layout) return;
    const scale = plot.getBoundingClientRect().width / layout.W || 1, px = layout.X(i) * scale;
    xh.hidden = false; xh.style.left = `${px}px`; xh.style.top = `${plot.offsetTop}px`; xh.style.height = `${plot.offsetHeight}px`;
    const prev = i > 0 ? c[i - 1] : null, lines = [`<b>${esc(d[i])}</b>`, `O ${fmt(o[i])} · H ${fmt(h[i])} · L ${fmt(l[i])} · C ${fmt(c[i])}${finite(prev) && prev ? ` (${signed(c[i] / prev - 1, 2)})` : ""}`];
    if (v && finite(v[i])) lines.push(`Volume ${fmt(v[i])}`);
    for (const [k, lab] of OVER) if (on[k] && finite(ind[k][i])) lines.push(`${lab} ${fmt(ind[k][i])}`);
    if (on.bb && finite(ind.bb.up[i])) lines.push(`Bollinger ${fmt(ind.bb.lo[i])} – ${fmt(ind.bb.up[i])}`);
    if (on.rsi && finite(ind.rsi[i])) lines.push(`RSI ${ind.rsi[i].toFixed(1)}`);
    if (on.macd && finite(ind.macd.macd[i])) lines.push(`MACD ${fmt(ind.macd.macd[i])} · signal ${fmt(ind.macd.signal[i])}`);
    tipAt(tip, el, lines.join("<br>"), px, plot.offsetTop + 30);
  };
  const indexAt = (e) => { const rect = plot.getBoundingClientRect(), x = (e.clientX - rect.left) * (layout.W / rect.width); return clamp(from + Math.floor((x - layout.L) / layout.bw), from, to); };
  const zoom = (f, center = Math.round((from + to) / 2)) => {
    const count = to - from + 1, next = clamp(Math.round(count * f), Math.min(10, n), n);
    from = clamp(Math.round(center - ((center - from) * next) / count), 0, n - next); to = from + next - 1; draw();
  };
  const pan = (k) => { const count = to - from + 1; from = clamp(from + k, 0, n - count); to = from + count - 1; draw(); };
  el.querySelector(".ctl").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.r) {
      const k = b.dataset.r;
      let count = k === "all" ? n : k === "ytd" ? n - Math.max(0, d.findIndex((x) => String(x).slice(0, 4) === String(d[n - 1]).slice(0, 4))) : +k;
      count = clamp(count, Math.min(10, n), n); to = n - 1; from = n - count; draw();
    } else if (b.dataset.z) zoom(b.dataset.z === "in" ? 1 / 1.4 : 1.4, to);
    else if (b.dataset.t === "candles" || b.dataset.t === "line") { mode = b.dataset.t; draw(); }
    else if (b.dataset.t === "table") { tbl.hidden = !tbl.hidden; b.setAttribute("aria-pressed", String(!tbl.hidden)); draw(); }
    else if (b.dataset.t) { on[b.dataset.t] = !on[b.dataset.t]; draw(); }
  });
  plot.addEventListener("pointermove", (e) => {
    if (!layout) return;
    if (drag) { const rect = plot.getBoundingClientRect(), k = Math.round(((drag.x - e.clientX) * (layout.W / rect.width)) / layout.bw); const count = to - from + 1; from = clamp(drag.from + k, 0, n - count); to = from + count - 1; draw(); return; }
    hover = indexAt(e); showTip(hover);
  });
  plot.addEventListener("pointerdown", (e) => { if (!layout) return; drag = { x: e.clientX, from }; plot.setPointerCapture?.(e.pointerId); plot.focus({ preventScroll: true }); });
  plot.addEventListener("pointerup", () => { drag = null; });
  plot.addEventListener("pointerleave", () => { if (!drag) { hover = null; tip.hidden = true; xh.hidden = true; } });
  plot.addEventListener("dblclick", () => { from = n > 300 ? n - 252 : 0; to = n - 1; draw(); });
  plot.addEventListener("wheel", (e) => { if (!(e.ctrlKey || e.metaKey) || !layout) return; e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, indexAt(e)); }, { passive: false });
  plot.addEventListener("keydown", (e) => {
    const step = Math.max(1, Math.round((to - from + 1) / 10));
    const act = { ArrowLeft: () => pan(-step), ArrowRight: () => pan(step), "+": () => zoom(1 / 1.4, to), "=": () => zoom(1 / 1.4, to), "-": () => zoom(1.4, to), Home: () => pan(-n), End: () => pan(n) }[e.key];
    if (act) { e.preventDefault(); act(); }
  });
  if (typeof ResizeObserver === "function") { let w = 0; new ResizeObserver(() => { const now = plot.clientWidth; if (Math.abs(now - w) > 4) { w = now; draw(); } }).observe(plot); }
  draw();
}

// ---------------------------------------------------------------------------------------------
// Option chain: calls | strike | puts, any expiration, a contract's payoff
// ---------------------------------------------------------------------------------------------
const CHAIN_SETS = { quotes: ["bid", "ask", "last", "iv", "open_interest"], greeks: ["iv", "delta", "gamma", "theta", "vega"], activity: ["volume", "open_interest", "iv"] };
const CHAIN_NAMES = { bid: "bid", ask: "ask", last: "last", iv: "IV", open_interest: "OI", delta: "Δ", gamma: "Γ", theta: "Θ", vega: "vega", volume: "vol", mid: "mid" };
function mountChain(el, data, p, host) {
  let r = data, set = "quotes", span = 12, sel = null, sort = null, busy = false;
  const draw = () => {
    const u = r.underlying || {}, spot = u.price, sm = r.summary || {}, strikes = pivotChain(r.columns, r.rows);
    const atm = strikes.reduce((b, s, i) => (finite(spot) && Math.abs(s.strike - spot) < Math.abs(strikes[b].strike - spot) ? i : b), 0);
    let shown = span === 0 ? strikes : strikes.slice(Math.max(0, atm - span), atm + span + 1);
    if (sort) shown = [...shown].sort((a, b) => { const x = a[sort.side]?.[sort.key], y = b[sort.side]?.[sort.key]; return (finite(x) ? x : -Infinity) < (finite(y) ? y : -Infinity) ? sort.dir : -sort.dir; });
    const cols = CHAIN_SETS[set].filter((k) => r.columns.includes(k)), oiMax = Math.max(1, ...strikes.flatMap((s) => [s.call?.open_interest, s.put?.open_interest]).filter(finite));
    const cell = (o, k, side, itm) => {
      const x = o?.[k];
      const txt = !finite(x) ? "–" : k === "iv" ? pct(x) : k === "delta" || k === "gamma" || k === "theta" || k === "vega" ? x.toFixed(k === "gamma" ? 4 : 3) : fmt(x);
      const bar = k === "open_interest" && finite(x) ? ` style="background:linear-gradient(to ${side === "call" ? "left" : "right"},color-mix(in srgb,var(--s0) 24%,transparent) ${(100 * x / oiMax).toFixed(1)}%,transparent 0)"` : "";
      return `<td class="num${itm ? " itm" : ""}"${bar}>${txt}</td>`;
    };
    const head = (side) => (side === "call" ? [...cols].reverse() : cols).map((k) => `<th class="num sort" data-side="${side}" data-key="${k}" scope="col">${esc(CHAIN_NAMES[k] ?? k)}${sort && sort.side === side && sort.key === k ? (sort.dir > 0 ? " ↑" : " ↓") : ""}</th>`).join("");
    let body = "", spotDone = !finite(spot) || sort !== null;
    for (const s of shown) {
      if (!spotDone && s.strike > spot) { body += `<tr class="spot"><td colspan="${cols.length * 2 + 1}"><span class="sub">▲ ${esc(u.symbol ?? "")} ${fmt(spot)}</span></td></tr>`; spotDone = true; }
      const callItm = finite(spot) && s.strike < spot, putItm = finite(spot) && s.strike > spot;
      body += `<tr data-k="${s.strike}"${sel && sel.strike === s.strike ? ' class="sel"' : ""}>${[...cols].reverse().map((k) => cell(s.call, k, "call", callItm)).join("")}<td class="k">${fmt(s.strike)}</td>${cols.map((k) => cell(s.put, k, "put", putItm)).join("")}</tr>`;
    }
    const exp = colsOf(r.expirations), opts = exp ? r.expirations.rows.map((row) => { const ex = row[exp.indexOf("expiration")] ?? row[0], oi = row[exp.indexOf("open_interest")]; return `<option value="${esc(ex)}"${ex === r.expiration ? " selected" : ""}>${esc(ex)}${finite(oi) ? ` · OI ${short(oi)}` : ""}</option>`; }).join("") : "";
    const em = sm.expected_move || {};
    el.innerHTML = `<p class="lead">${esc(u.symbol ?? "")} options <span class="sub">${esc(r.expiration ?? "")}${finite(r.days_to_expiration) ? ` · ${r.days_to_expiration} days` : ""}${u.as_of ? ` · Cboe delayed, ${esc(u.as_of)}` : ""}</span></p>
<div class="chips">${finite(spot) ? `<span class="chip">Price <b>${fmt(spot)}</b>${finite(u.change_pct) ? ` ${esc(signed(u.change_pct, 2))}` : ""}</span>` : ""}${finite(sm.atm_iv) ? `<span class="chip">ATM IV <b>${pct(sm.atm_iv)}</b></span>` : ""}${finite(u.iv30) ? `<span class="chip">IV30 <b>${pct(u.iv30)}</b></span>` : ""}${finite(em.dollars) ? `<span class="chip">Expected move <b>±${fmt(em.dollars)}</b> (${pct(em.fraction_of_price)})</span>` : ""}${finite(sm.max_pain) ? `<span class="chip">Max pain <b>${fmt(sm.max_pain)}</b></span>` : ""}${finite(sm.put_call_open_interest_ratio) ? `<span class="chip">Put/call OI <b>${sm.put_call_open_interest_ratio.toFixed(2)}</b></span>` : ""}${finite(sm.put_call_volume_ratio) ? `<span class="chip">Put/call volume <b>${sm.put_call_volume_ratio.toFixed(2)}</b></span>` : ""}</div>
<div class="ctl" role="toolbar" aria-label="Chain controls">${opts ? `<label class="sub">Expiration <select data-c="exp"${busy || !host.canCall ? " disabled" : ""}>${opts}</select></label>` : ""}<span class="grp">${Object.keys(CHAIN_SETS).map((k) => toggle(`set-${k}`, k[0].toUpperCase() + k.slice(1), set === k)).join("")}</span><label class="sub">Strikes <select data-c="win">${[[6, "±6"], [12, "±12"], [25, "±25"], [0, "all"]].map(([k, lab]) => `<option value="${k}"${k === span ? " selected" : ""}>${lab}</option>`).join("")}</select></label>${busy ? '<span class="sub">Loading…</span>' : ""}</div>
<div class="scroll"><table class="chain"><thead><tr><th class="side" colspan="${cols.length}">Calls</th><th class="k sort" data-key="strike">Strike</th><th class="side" colspan="${cols.length}">Puts</th></tr><tr>${head("call")}<th class="k" scope="col"></th>${head("put")}</tr></thead><tbody>${body}</tbody></table></div>
<p class="note">Shaded: in the money. OI bars grow from the strike. Click a row to pick a contract; click a heading to sort.</p><div class="pick"></div>`;
    if (sel) drawPick();
  };
  const drawPick = () => {
    const box = el.querySelector(".pick"), s = pivotChain(r.columns, r.rows).find((x) => x.strike === sel.strike), o = s && s[sel.side];
    if (!o) { box.innerHTML = ""; return; }
    const premium = finite(o.mid) ? o.mid : finite(o.bid) && finite(o.ask) ? (o.bid + o.ask) / 2 : o.last, u = r.underlying || {}, spot = u.price ?? sel.strike;
    const name = `${u.symbol ?? ""} ${r.expiration ?? ""} ${fmt(sel.strike)} ${sel.side}`;
    let svg = "";
    if (finite(premium)) {
      const W = 520, H = 150, L = 8, R = 60, T = 8, B = 20, lo = Math.min(spot, sel.strike) * 0.8, hi = Math.max(spot, sel.strike) * 1.2, N = 80;
      const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N), pay = xs.map((x) => 100 * ((sel.side === "call" ? Math.max(x - sel.strike, 0) : Math.max(sel.strike - x, 0)) - premium));
      const a = Math.min(...pay), b = Math.max(...pay), X = (i) => L + (i / N) * (W - L - R), Y = (y) => T + (1 - (y - a) / (b - a || 1)) * (H - T - B), be = sel.side === "call" ? sel.strike + premium : sel.strike - premium;
      svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Payoff at expiry of one ${name} bought at ${fmt(premium)}`)}">${yGrid(a, b, Y, L, W - R, (y) => short(y), 3)}<line x1="${L}" x2="${W - R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="guide"/><path d="${pathOf(pay, X, Y)}" class="line s0"/><text x="${L}" y="${H - 4}" class="axis">${fmt(lo)}</text><text x="${W - R}" y="${H - 4}" class="axis" text-anchor="end">${fmt(hi)}</text></svg>`;
      svg = `<p class="sub">Payoff at expiry of one contract (100 shares) bought at ${fmt(premium)}: break-even ${fmt(be)}, most lost ${fmt(premium * 100)}.</p>${svg}`;
    }
    box.innerHTML = `<div class="ticket"><p class="lead">${esc(name)}</p><div class="chips">${["bid", "ask", "last", "iv", "delta", "gamma", "theta", "vega", "open_interest", "volume"].filter((k) => finite(o[k])).map((k) => `<span class="chip">${esc(CHAIN_NAMES[k] ?? k)} <b>${k === "iv" ? pct(o[k]) : fmt(o[k])}</b></span>`).join("")}</div>${svg}<div class="acts">${host.canMessage ? btn("Ask Claude about this contract", 'data-c="ask"') : ""}</div></div>`;
  };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button"), th = e.target.closest("th.sort"), tr = e.target.closest("tr[data-k]");
    if (b && b.dataset.t && b.dataset.t.startsWith("set-")) { set = b.dataset.t.slice(4); draw(); return; }
    if (b && b.dataset.c === "ask") {
      const s = pivotChain(r.columns, r.rows).find((x) => x.strike === sel.strike), o = s && s[sel.side], u = r.underlying || {};
      host.message(`Tell me about the ${u.symbol ?? ""} ${r.expiration ?? ""} ${sel.strike} ${sel.side} from the option chain: bid ${o?.bid ?? "–"}, ask ${o?.ask ?? "–"}, IV ${finite(o?.iv) ? pct(o.iv) : "–"}, delta ${o?.delta ?? "–"}, open interest ${o?.open_interest ?? "–"}; the stock is at ${u.price ?? "–"}. What does the price imply, and what are the risks?`).catch(() => {});
      return;
    }
    if (th) { const key = th.dataset.key; if (key === "strike") sort = null; else sort = sort && sort.key === key && sort.side === th.dataset.side ? { ...sort, dir: -sort.dir } : { key, side: th.dataset.side, dir: -1 }; draw(); return; }
    if (tr) { const td = e.target.closest("td"), idx = [...tr.children].indexOf(td), cols = CHAIN_SETS[set].filter((k) => r.columns.includes(k)).length; sel = { strike: +tr.dataset.k, side: idx > cols ? "put" : "call" }; draw(); }
  });
  el.addEventListener("change", async (e) => {
    const s = e.target.closest("select");
    if (!s) return;
    if (s.dataset.c === "win") { span = +s.value; draw(); return; }
    if (s.dataset.c === "exp") {
      busy = true; draw();
      try { r = await callAgain(host, p, { expiration: s.value }); sel = null; } catch (err) { busy = false; draw(); el.querySelector(".pick").innerHTML = `<p class="error">${esc(err.message)}</p>`; return; }
      busy = false; draw();
    }
  });
  draw();
}

// ---------------------------------------------------------------------------------------------
// Lines with a crosshair (equity, drawdown, payoff): one scale, a legend for two or more
// ---------------------------------------------------------------------------------------------
export function mountLines(box, spec) {
  const { labels, series, height = 220, fmtY = short, area = false, markers = [], zero = false } = spec;
  box.style.position = "relative";
  box.innerHTML = '<div class="plot"></div><div class="xh" hidden></div><div class="tip" hidden></div>';
  const plot = box.querySelector(".plot"), tip = box.querySelector(".tip"), xh = box.querySelector(".xh");
  let lay = null;
  const draw = () => {
    const W = clamp(plot.clientWidth || 700, 300, 1400), L = 6, R = 62, T = 8, B = 22, n = labels.length, X = (i) => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R));
    const all = series.flatMap((s) => s.values.filter(finite));
    let lo = Math.min(...all), hi = Math.max(...all);
    if (area) hi = Math.max(hi, 0);
    if (lo === hi) { lo -= 1; hi += 1; }
    const Y = (y) => T + (1 - (y - lo) / (hi - lo)) * (height - T - B);
    let s = yGrid(lo, hi, Y, L, W - R, fmtY);
    if (zero && lo < 0 && hi > 0) s += `<line x1="${L}" x2="${W - R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="guide"/>`;
    series.forEach((sr, k) => {
      const dd = pathOf(sr.values, X, Y);
      s += area ? `<path d="${dd}L${X(n - 1).toFixed(1)},${Y(0).toFixed(1)}L${X(0).toFixed(1)},${Y(0).toFixed(1)}Z" class="dd"/>` : `<path d="${dd}" class="line ${sr.cls ?? `s${k}`}"/>`;
    });
    for (const m of markers) if (finite(m.i) && finite(series[0].values[m.i])) { const x = X(m.i), y = Y(series[0].values[m.i]); s += m.side === "buy" ? `<path d="M${x.toFixed(1)},${(y + 4).toFixed(1)}l4,7h-8z" class="mk-buy"/>` : `<path d="M${x.toFixed(1)},${(y - 4).toFixed(1)}l4,-7h-8z" class="mk-sell"/>`; }
    s += xTicks(labels, 0, n - 1, X, height - 6, W - L - R);
    plot.innerHTML = `<svg viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${esc(spec.title ?? "chart")}">${s}</svg>`;
    lay = { W, L, R, n, X };
  };
  plot.addEventListener("pointermove", (e) => {
    if (!lay) return;
    const rect = plot.getBoundingClientRect(), x = (e.clientX - rect.left) * (lay.W / rect.width), i = clamp(Math.round(((x - lay.L) / (lay.W - lay.L - lay.R)) * (lay.n - 1)), 0, lay.n - 1), px = lay.X(i) * (rect.width / lay.W);
    xh.hidden = false; xh.style.left = `${px}px`; xh.style.top = "0px"; xh.style.height = `${plot.offsetHeight}px`;
    tipAt(tip, box, [`<b>${esc(labels[i])}</b>`, ...series.map((sr) => `${esc(sr.name)} ${esc(fmtY(sr.values[i]))}`)].join("<br>"), px, 40);
  });
  plot.addEventListener("pointerleave", () => { tip.hidden = true; xh.hidden = true; });
  if (typeof ResizeObserver === "function") { let w = 0; new ResizeObserver(() => { const now = plot.clientWidth; if (Math.abs(now - w) > 4) { w = now; draw(); } }).observe(plot); }
  draw();
}

// ---------------------------------------------------------------------------------------------
// Backtest dashboard: figures, equity against buy-and-hold, drawdown, trades, sliders
// ---------------------------------------------------------------------------------------------
// A slider's range for a parameter: whole periods from 1 (2 for a slow average) to three times the
// value; thresholds and fractions in small steps.
export function sliderRange(key, v, periods = Infinity) {
  if (Number.isInteger(v) && !/(^|_)(z|vol|volatility|target|leverage|fraction|deviations?)($|_)/.test(key)) { const lo = /slow|exit|signal/.test(key) ? 2 : 1; return { min: lo, max: Math.max(lo + 1, Math.min(Math.max(v * 3, 20), Math.floor(periods / 2) || v * 3)), step: 1 }; }
  if (v > 0 && v <= 1) return { min: 0.01, max: 1, step: 0.01 };
  return { min: Math.round((v / 4) * 100) / 100, max: Math.round(v * 3 * 100) / 100 || 1, step: Math.abs(v) >= 10 ? 1 : 0.05 };
}
function mountBacktest(el, data, p, host, before = 0) {
  let r = data, busy = false, error = null, spx = null, page = 0, sideFilter = "all", sortT = null;
  const tool = p.call?.name ?? "", recipe = tool.replace(/^backtest_/, ""), tried = [];
  const params = Object.entries(r.parameters || {}).filter(([, v]) => finite(v));
  const now = Object.fromEntries(params);
  const remember = (res) => { if (finite(res.sharpe)) tried.push({ params: { ...now }, sharpe: res.sharpe, cagr: res.cagr, max_drawdown: res.max_drawdown }); };
  remember(r);
  const tile = (k, val, bh) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${val}</div>${bh ? `<div class="b">buy and hold ${bh}</div>` : ""}</div>`;
  const draw = () => {
    const cv = r.curve, ci = Object.fromEntries(cv.columns.map((c, i) => [c, i])), labels = cv.rows.map((x) => String(x[0])), bh = r.buy_and_hold || {}, dated = cv.columns[0] === "date";
    const series = [{ name: "strategy", values: cv.rows.map((x) => x[ci.strategy]), cls: "s0" }, { name: "buy and hold", values: cv.rows.map((x) => x[ci.buy_and_hold]), cls: "s1" }];
    if (spx) series.push({ name: "S&P 500 (SPY)", values: spx, cls: "s2" });
    const tc = colsOf(r.trades), trades = tc ? r.trades.rows : [], ti = tc ? Object.fromEntries(tc.map((c, i) => [c, i])) : {};
    const at = new Map(labels.map((x, i) => [x, i])), markers = tc && !tc.includes("asset") && trades.length <= 300 ? trades.map((t) => ({ i: at.get(String(t[0])) ?? nearest(labels, t[0]), side: t[ti.side] })) : [];
    const sliders = params.length && host.canCall ? `<div class="sliders">${params.map(([k]) => { const g = sliderRange(k, data.parameters[k], data.periods ?? r.periods); return `<label>${esc(k.replace(/_/g, " "))} <output data-o="${esc(k)}">${fmt(now[k])}</output><input type="range" data-p="${esc(k)}" min="${g.min}" max="${g.max}" step="${g.step}" value="${now[k]}"${busy ? " disabled" : ""}></label>`; }).join("")}</div>` : "";
    const best = tried.reduce((b, t) => (!b || t.sharpe > b.sharpe ? t : b), null);
    el.innerHTML = `<p class="lead">${esc(r.rule ?? tool)}</p>
<div class="tiles">${tile("Total return", signed(r.total_return))}${tile("CAGR", signed(r.cagr), signed(bh.cagr))}${tile("Sharpe", finite(r.sharpe) ? r.sharpe.toFixed(2) : "–", finite(bh.sharpe) ? bh.sharpe.toFixed(2) : "")}${tile("Max drawdown", pct(r.max_drawdown), pct(bh.max_drawdown))}${finite(r.volatility) ? tile("Volatility", pct(r.volatility)) : ""}${finite(r.annual_turnover) ? tile("Turnover a year", `${r.annual_turnover.toFixed(1)}×`) : ""}</div>
${sliders}${params.length && host.canCall ? `<div class="ctl">${busy ? '<span class="sub">Running…</span>' : `<span class="sub">${tried.length + before} ${tried.length + before === 1 ? "setting" : "settings"} tried${before ? ` (${fmt(before)} in the sweep)` : ""}${best && tried.length > 1 ? `; best Sharpe ${best.sharpe.toFixed(2)} at ${esc(Object.entries(best.params).map(([k, v]) => `${k} ${v}`).join(", "))}` : ""}</span>`}${tried.length > 1 && recipe && !busy ? btn("Check the best for luck", 'data-b="luck"') : ""}${host.canMessage ? btn("Tell Claude these settings", 'data-b="tell"') : ""}</div>` : ""}${error ? `<p class="error">${esc(error)}</p>` : ""}<div class="luck"></div>
<h3>Growth of 1</h3><div class="eq"></div><div class="legend">${series.map((s) => `<span><i class="${s.cls}"></i>${esc(s.name)}</span>`).join("")}${dated && host.canCall && !spx ? btn("Compare with the S&P 500", 'data-b="spx"') : ""}</div>
<h3>Drawdown</h3><div class="ddc"></div>
${tc ? `<h3>Trades <span class="sub">${fmt(r.trades.total)}${r.trades.total > trades.length ? `, the last ${fmt(trades.length)} shown` : ""}</span></h3><div class="ctl"><span class="grp">${["all", "buy", "sell"].map((k) => toggle(`side-${k}`, k, sideFilter === k)).join("")}</span></div><div class="trades"></div>` : ""}
${cv.every ? `<p class="note">The curve shows every ${cv.every}th close.</p>` : ""}`;
    mountLines(el.querySelector(".eq"), { labels, series, title: "Growth of 1", fmtY: (y) => (finite(y) ? y.toFixed(2) : "–"), markers });
    mountLines(el.querySelector(".ddc"), { labels, series: [{ name: "drawdown", values: cv.rows.map((x) => x[ci.drawdown]) }], height: 120, area: true, title: "Drawdown", fmtY: (y) => pct(y) });
    if (tc) drawTrades(tc, trades, ti);
  };
  const drawTrades = (tc, trades, ti) => {
    let rows = trades.filter((t) => sideFilter === "all" || t[ti.side] === sideFilter);
    if (sortT) rows = [...rows].sort((a, b) => (a[sortT.i] < b[sortT.i] ? -sortT.dir : a[sortT.i] > b[sortT.i] ? sortT.dir : 0));
    else rows = [...rows].reverse();
    const per = 25, pages = Math.max(1, Math.ceil(rows.length / per)); page = clamp(page, 0, pages - 1);
    const fmtCell = (c, x) => (c === "side" ? `<span class="side-${esc(x)}">${esc(x)}</span>` : /weight/.test(c) ? pct(x, 0) : fmt(x));
    el.querySelector(".trades").innerHTML = `<div class="scroll"><table><thead><tr>${tc.map((c, i) => `<th class="sort${i ? " num" : ""}" data-ti="${i}" scope="col">${esc(c.replace(/_/g, " "))}${sortT && sortT.i === i ? (sortT.dir > 0 ? " ↑" : " ↓") : ""}</th>`).join("")}</tr></thead><tbody>${rows.slice(page * per, page * per + per).map((t) => `<tr>${t.map((x, i) => `<td${i ? ' class="num"' : ""}>${fmtCell(tc[i], x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${pages > 1 ? `<div class="ctl">${btn("‹", 'data-pg="-1" aria-label="Earlier page"')}<span class="sub">page ${page + 1} of ${pages}</span>${btn("›", 'data-pg="1" aria-label="Later page"')}</div>` : ""}`;
  };
  const rerun = async () => {
    busy = true; error = null; draw();
    try { const res = await callAgain(host, p, { ...now, curve: true }); r = res; remember(res); spx = null; host.context(`The person is looking at ${tool} with ${Object.entries(now).map(([k, v]) => `${k} ${v}`).join(", ")}: Sharpe ${finite(res.sharpe) ? res.sharpe.toFixed(2) : "n/a"}, CAGR ${signed(res.cagr)}, max drawdown ${pct(res.max_drawdown)}. ${tried.length} settings tried in the dashboard so far.`); }
    catch (err) { error = err.message; }
    busy = false; draw();
  };
  el.addEventListener("input", (e) => { const s = e.target.closest("input[data-p]"); if (s) { const o = el.querySelector(`output[data-o="${s.dataset.p}"]`); if (o) o.textContent = fmt(+s.value); } });
  el.addEventListener("change", (e) => { const s = e.target.closest("input[data-p]"); if (s) { now[s.dataset.p] = +s.value; rerun(); } });
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button"), th = e.target.closest("th[data-ti]");
    if (th) { const i = +th.dataset.ti; sortT = sortT && sortT.i === i ? (sortT.dir > 0 ? { i, dir: -1 } : null) : { i, dir: 1 }; page = 0; const tc = colsOf(r.trades); drawTrades(tc, r.trades.rows, Object.fromEntries(tc.map((c, k) => [c, k]))); return; }
    if (!b) return;
    if (b.dataset.pg) { page += +b.dataset.pg; const tc = colsOf(r.trades); drawTrades(tc, r.trades.rows, Object.fromEntries(tc.map((c, k) => [c, k]))); return; }
    if (b.dataset.t && b.dataset.t.startsWith("side-")) { sideFilter = b.dataset.t.slice(5); page = 0; draw(); return; }
    if (b.dataset.b === "tell") { host.message(`In the backtest dashboard I tried ${tried.length} settings of ${tool}. Now: ${Object.entries(now).map(([k, v]) => `${k} ${v}`).join(", ")}, Sharpe ${finite(r.sharpe) ? r.sharpe.toFixed(2) : "n/a"}, CAGR ${signed(r.cagr)}, max drawdown ${pct(r.max_drawdown)} (buy and hold: CAGR ${signed(r.buy_and_hold?.cagr)}). Every setting tried: ${tried.map((t) => `${Object.values(t.params).join("/")} → ${t.sharpe.toFixed(2)}`).join("; ")}. Is this result real, allowing for the settings I tried?`).catch(() => {}); return; }
    if (b.dataset.b === "spx") {
      b.disabled = true; b.textContent = "Loading…";
      try {
        const labels = r.curve.rows.map((x) => String(x[0])), px = await callAgain(host, { input: {}, call: null }, { symbol: "SPY", start: labels[0], end: labels.at(-1) }, "price_history");
        const by = new Map(px.dates.map((x, i) => [String(x).slice(0, 10), px.close[i]]));
        let last = null; const al = labels.map((x) => { const v = by.get(x.slice(0, 10)); if (finite(v)) last = v; return last; }), base = al.find(finite);
        spx = al.map((x) => (finite(x) && base ? x / base : null));
      } catch (err) { error = `S&P 500: ${err.message}`; }
      draw(); return;
    }
    if (b.dataset.b === "luck") {
      const box = el.querySelector(".luck"), keys = params.map(([k]) => k), grid = Object.fromEntries(keys.map((k) => [k, [...new Set(tried.map((t) => t.params[k]))]]));
      let size = keys.reduce((s, k) => s * grid[k].length, 1);
      while (size > 400) { const k = keys.reduce((a, x) => (grid[x].length > grid[a].length ? x : a)); grid[k] = grid[k].slice(-Math.max(1, grid[k].length - 1)); size = keys.reduce((s, x) => s * grid[x].length, 1); }
      box.innerHTML = '<p class="sub">Running every combination of the values tried (at least as strict as the settings alone)…</p>';
      try {
        const inp = againInput(p, {}, null), base = inp.calls ? inp.calls.at(-1).arguments : inp.arguments, args = Object.fromEntries(Object.entries(base).filter(([k]) => !keys.includes(k) && k !== "curve" && k !== "dates"));
        const res = await sweepCall(host, p, recipe, args, grid);
        const df = res.deflation;
        box.innerHTML = df ? `<div class="ticket"><p class="lead">${esc(df.verdict)}</p><div class="chips"><span class="chip">Trials <b>${fmt(df.trials)}</b></span><span class="chip">Best Sharpe by luck alone <b>${df.expected_max_sharpe_under_null.toFixed(2)}</b></span><span class="chip">Deflated Sharpe probability <b>${pct(df.deflated_sharpe_probability)}</b></span></div><p class="note">Deflated Sharpe ratio (Bailey and López de Prado, 2014): the chance the best Sharpe among these trials beats what luck gives the best of that many.</p></div>` : '<p class="note">One setting only; nothing to deflate.</p>';
      } catch (err) { box.innerHTML = `<p class="error">${esc(err.message)}</p>`; }
    }
  });
  draw();
}
function nearest(labels, x) { const s = String(x); let b = 0; for (let i = 0; i < labels.length; i++) if (labels[i] <= s) b = i; return b; }
// strategy_sweep in place of the backtest call (its earlier calls, the prices, kept).
async function sweepCall(host, p, recipe, args, grid) {
  const inp = p.input || {};
  if (Array.isArray(inp.calls) && p.call && p.call.index !== null && p.call.index !== undefined) {
    const calls = inp.calls.slice(0, p.call.index + 1).map((c, i) => (i === p.call.index ? { name: "strategy_sweep", arguments: { recipe, arguments: args, grid } } : c));
    const r = resultOf(await host.call("run_tool", { calls, return: "last", digits: 6 })), last = r.results.at(-1);
    if (last.error) throw new Error(last.error);
    return last.result;
  }
  return resultOf(await host.call("run_tool", { name: "strategy_sweep", arguments: { recipe, arguments: args, grid }, digits: 6 }));
}

// ---------------------------------------------------------------------------------------------
// Sweep heatmap: Sharpe over two parameters; a cell opens that setting's dashboard
// ---------------------------------------------------------------------------------------------
export function sweepGrid(rows) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r[0] || {})))].filter((k) => rows.every((r) => finite(r[0]?.[k])));
  if (keys.length !== 2) return null;
  const [a, b] = keys, xs = [...new Set(rows.map((r) => r[0][a]))].sort((x, y) => x - y), ys = [...new Set(rows.map((r) => r[0][b]))].sort((x, y) => x - y);
  const cell = new Map(rows.map((r) => [`${r[0][a]}|${r[0][b]}`, r[1]]));
  return { a, b, xs, ys, at: (x, y) => cell.get(`${x}|${y}`) };
}
function mountSweep(el, r, p, host) {
  const g = sweepGrid(r.rows);
  if (!g) { el.innerHTML = ""; return; }
  const vals = r.rows.map((x) => x[1]).filter(finite), lo = Math.min(...vals), hi = Math.max(...vals), best = r.rows.find((x) => x[1] === hi);
  const shade = (v) => (finite(v) ? `background:color-mix(in srgb,var(--s0) ${(12 + 70 * ((v - lo) / (hi - lo || 1))).toFixed(0)}%,var(--bg));color:${(v - lo) / (hi - lo || 1) > 0.6 ? "#fff" : "var(--fg)"}` : "");
  const df = r.deflation;
  el.innerHTML = `<p class="lead">Sharpe by ${esc(g.a)} and ${esc(g.b)} <span class="sub">${fmt(r.combinations)} combinations</span></p>${df ? `<p class="${df.deflated_sharpe_probability > 0.95 ? "" : "warn-text"}">${esc(df.verdict)} <span class="sub">Deflated Sharpe probability ${pct(df.deflated_sharpe_probability)}; luck alone gives the best of ${fmt(df.trials)} about ${df.expected_max_sharpe_under_null.toFixed(2)}.</span></p>` : ""}
<div class="scroll"><table class="hm"><thead><tr><th>${esc(g.b)} ↓ ${esc(g.a)} →</th>${g.xs.map((x) => `<th class="c">${fmt(x)}</th>`).join("")}</tr></thead><tbody>${g.ys.map((y) => `<tr><th>${fmt(y)}</th>${g.xs.map((x) => { const v = g.at(x, y), isBest = best && best[0][g.a] === x && best[0][g.b] === y; return `<td class="cell${isBest ? " best" : ""}" style="${shade(v)}" data-x="${x}" data-y="${y}" title="${esc(`${g.a} ${x}, ${g.b} ${y}: Sharpe ${finite(v) ? v.toFixed(2) : "n/a"}`)}">${finite(v) ? v.toFixed(2) : "–"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>
<p class="note">Darker is a higher Sharpe; the outlined cell is the best.${host.canCall ? " Click a cell to open its backtest dashboard." : ""}</p><div class="one"></div>`;
  el.addEventListener("click", async (e) => {
    const td = e.target.closest("td[data-x]");
    if (!td || !host.canCall) return;
    const box = el.querySelector(".one"), inp = p.input || {}, sweep = inp.calls ? inp.calls[p.call.index] : inp, args = (sweep.arguments || {}).arguments || {};
    box.innerHTML = '<p class="sub">Running…</p>';
    try {
      const patch = { ...args, [g.a]: +td.dataset.x, [g.b]: +td.dataset.y, curve: true }, name = `backtest_${r.recipe}`;
      const res = await callAgain(host, { ...p, input: inp.calls ? { calls: inp.calls.map((c, i) => (i === p.call.index ? { name, arguments: patch } : c)) } : { name, arguments: patch } }, {}, name);
      const id = PLACED.push({ kind: "backtest", data: res, call: { name, index: p.call.index }, input: inp.calls ? { calls: inp.calls.map((c, i) => (i === p.call.index ? { name, arguments: patch } : c)) } : { name, arguments: patch } }) - 1;
      box.innerHTML = `<div class="w" data-w="${id}"></div>`;
      mountBacktest(box.firstChild, res, PLACED[id], host, r.combinations ?? 0);
    } catch (err) { box.innerHTML = `<p class="error">${esc(err.message)}</p>`; }
  });
}

// ---------------------------------------------------------------------------------------------
// Treemap: holdings or weights as blocks, coloured by their change when there is one
// ---------------------------------------------------------------------------------------------
function mountTreemap(el, t) {
  const draw = () => {
    const W = clamp(el.clientWidth || 700, 300, 1200), H = Math.round(clamp(W * 0.45, 200, 380)), total = t.items.reduce((s, x) => s + x.value, 0);
    const maxAbs = Math.max(1e-9, ...t.items.map((x) => Math.abs(x.change ?? 0)));
    const cells = squarify(t.items.filter((x) => x.value > 0), 0, 0, W, H);
    const fill = (x) => {
      if (t.change && finite(x.change)) { const k = (30 + 60 * Math.min(1, Math.abs(x.change) / maxAbs)).toFixed(0); return [`color-mix(in srgb,var(${x.change >= 0 ? "--ok" : "--bad"}) ${k}%,var(--soft))`, +k > 55]; }
      const k = (28 + 62 * Math.sqrt(x.value / Math.max(...t.items.map((y) => y.value)))).toFixed(0); return [`color-mix(in srgb,var(--s0) ${k}%,var(--soft))`, +k > 55];
    };
    const g = cells.map((c, i) => {
      const [f, dark] = fill(c), share = c.value / total, room = c.w > 46 && c.h > 30;
      return `<g data-i="${i}"><rect x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="${Math.max(0, c.w).toFixed(1)}" height="${Math.max(0, c.h).toFixed(1)}" rx="3" style="fill:${f}"/>${room ? `<text x="${(c.x + 6).toFixed(1)}" y="${(c.y + 16).toFixed(1)}" class="${dark ? "on-dark" : "on-light"}">${esc(c.label.slice(0, Math.floor(c.w / 7)))}</text><text x="${(c.x + 6).toFixed(1)}" y="${(c.y + 30).toFixed(1)}" class="${dark ? "on-dark" : "on-light"} small">${esc(pct(share))}${t.change && finite(c.change) ? ` · ${esc(signed(c.change))}` : ""}${c.short ? " · short" : ""}</text>` : ""}</g>`;
    }).join("");
    el.innerHTML = `${t.title ? `<h3>${esc(String(t.title).replace(/_/g, " "))}</h3>` : ""}<div class="plot tm"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(`Treemap of ${t.items.length} items by ${t.size}`)}">${g}</svg></div><div class="tip" hidden></div><p class="note">Block size: ${esc(String(t.size).replace(/_/g, " "))}${t.change ? `; colour: ${esc(String(t.change).replace(/_/g, " "))} (green up, red down, darker is bigger)` : ""}. The table below has every figure.</p>`;
    const tip = el.querySelector(".tip"), plot = el.querySelector(".plot");
    plot.addEventListener("pointermove", (e) => {
      const gEl = e.target.closest("g[data-i]");
      if (!gEl) { tip.hidden = true; return; }
      const c = cells[+gEl.dataset.i], rect = el.getBoundingClientRect();
      tipAt(tip, el, `<b>${esc(c.label)}</b><br>${esc(String(t.size).replace(/_/g, " "))} ${fmt(c.size)} (${pct(c.value / total)})${finite(c.change) ? `<br>${esc(String(t.change).replace(/_/g, " "))} ${signed(c.change, 2)}` : ""}${c.group ? `<br>${esc(c.group)}` : ""}`, e.clientX - rect.left, e.clientY - rect.top);
    });
    plot.addEventListener("pointerleave", () => { tip.hidden = true; });
  };
  if (typeof ResizeObserver === "function") { let w = 0; new ResizeObserver(() => { const now = el.clientWidth; if (Math.abs(now - w) > 4) { w = now; draw(); } }).observe(el); }
  draw();
}

// ---------------------------------------------------------------------------------------------
// Paper order ticket: the checked orders, what they cost, and Approve while the token lives
// ---------------------------------------------------------------------------------------------
function mountTicket(el, data, p, host) {
  let r = data, state = "open", receipt = null, error = null, timer = null;
  const ready = Date.now() + 700;
  const draw = () => {
    const c = r.columns, ix = Object.fromEntries(c.map((x, i) => [x, i])), rows = r.rows || [];
    const left = r.expires_at ? Math.max(0, Math.round((Date.parse(r.expires_at) - Date.now()) / 1000)) : 0;
    if (state === "open" && r.token && left === 0) state = "expired";
    const net = rows.reduce((s, x) => s + (finite(x[ix.notional]) ? (x[ix.side] === "sell" ? -1 : 1) * x[ix.notional] : 0), 0), anyNotional = rows.some((x) => finite(x[ix.notional]));
    const warn = Array.isArray(r.warnings) && r.warnings.length ? `<ul class="note">${r.warnings.map((w) => `<li>${esc(typeof w === "string" ? w : JSON.stringify(w))}</li>`).join("")}</ul>` : "";
    const body = rows.map((x) => `<tr><td><span class="side-${esc(x[ix.side])}">${esc(x[ix.side])}</span></td><td class="num">${x[ix.qty] === null ? "hidden" : fmt(x[ix.qty])}</td><td><b>${esc(x[ix.symbol])}</b></td><td class="num">${finite(x[ix.price]) ? fmt(x[ix.price]) : "–"}</td><td class="num">${finite(x[ix.notional]) ? fmt(x[ix.notional]) : "–"}</td><td class="num">${finite(x[ix.est_cost_bps]) ? `${x[ix.est_cost_bps].toFixed(1)} bp` : "–"}</td><td>${x[ix.accepted] ? '<span class="badge ok">✓ passed</span>' : `<span class="badge bad">✕ refused</span> <span class="sub">${esc((x[ix.reasons] || []).join(", "))}</span>`}</td></tr>`).join("");
    const acts = state === "open" && r.token
      ? `${host.canCall ? btn(`Approve trade${rows.length > 1 ? `s (${rows.length})` : ""}`, 'class="primary" data-a="approve"') : '<span class="sub">This host does not let views call tools; ask Claude to send it.</span>'}${btn("Discard", 'data-a="discard"')}<span class="sub">Token expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}</span>`
      : state === "sending" ? '<span class="sub">Sending to your paper account…</span>'
      : state === "expired" ? `<span class="sub">The five-minute token expired; nothing was sent.</span>${host.canCall ? btn("Check again", 'data-a="again"') : ""}`
      : state === "discarded" ? '<span class="sub">Discarded. Nothing was sent.</span>'
      : state === "sent" ? '<span class="badge ok">✓ Sent to your Alpaca paper account</span>'
      : !r.accepted ? `<span class="sub">${esc(r.next ?? "Not every order passed; nothing can be sent.")}</span>` : "";
    el.innerHTML = `<div class="ticket"><p class="lead">Paper order ticket <span class="badge info">paper</span> <span class="badge ${r.market_open ? "ok" : "warn"}">${r.market_open ? "market open" : "market closed"}</span> <span class="badge ${r.accepted ? "ok" : "bad"}">${r.accepted ? "all checks passed" : "refused"}</span></p>
<div class="scroll"><table><thead><tr><th>side</th><th class="num">qty</th><th>symbol</th><th class="num">price</th><th class="num">notional</th><th class="num">est. cost</th><th>pre-trade checks</th></tr></thead><tbody>${body}</tbody></table></div>
${anyNotional ? `<p class="sub">Net ${net >= 0 ? "bought" : "sold"}: <b>${fmt(Math.abs(net))}</b> at the quotes' mid.</p>` : ""}${warn}${error ? `<p class="error">${esc(error)}</p>` : ""}<div class="acts">${acts}</div>${receipt ? receiptHtml(receipt) : ""}</div>`;
  };
  const receiptHtml = (x) => { const c = colsOf(x); return c ? `<h3>Receipt</h3><div class="scroll"><table><thead><tr>${c.map((k) => `<th>${esc(k.replace(/_/g, " "))}</th>`).join("")}</tr></thead><tbody>${x.rows.map((row) => `<tr>${row.map((v) => `<td>${esc(v ?? "–")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${x.order_log ? `<p class="note">Logged in the hash-chained order log${x.order_log.head ? ` (head ${esc(String(x.order_log.head).slice(0, 12))}…)` : ""}.${x.attestation ? " Signed attestation attached." : ""}</p>` : ""}` : ""; };
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-a]");
    if (!b) return;
    if (b.dataset.a === "approve") {
      if (Date.now() < ready || state !== "open") return;
      state = "sending"; error = null; draw();
      try {
        receipt = resultOf(await host.call("run_tool", { name: "send_paper_orders", arguments: { token: r.token } }));
        state = "sent";
        const c = colsOf(receipt);
        host.context(`The person approved the paper order ticket and sent ${r.rows.length} order(s) to their Alpaca paper account: ${c ? receipt.rows.map((x) => x.join(" ")).join("; ") : "see the receipt"}.`);
      } catch (err) { state = "open"; error = err.message; }
      draw();
    } else if (b.dataset.a === "discard") { state = "discarded"; host.context("The person discarded the paper order ticket; nothing was sent."); draw(); }
    else if (b.dataset.a === "again") {
      state = "sending"; draw();
      try { r = await callAgain(host, p, {}); state = "open"; } catch (err) { state = "expired"; error = err.message; }
      draw();
    }
  });
  timer = setInterval(() => { if (!el.isConnected) { clearInterval(timer); return; } if (state === "open" && r.token) draw(); }, 1000);
  draw();
}

const MOUNTS = { candles: mountCandles, chain: mountChain, backtest: mountBacktest, sweep: mountSweep, treemap: mountTreemap, ticket: mountTicket };
// Brings every placeholder in root to life. host: { call(name, args), message(text), context(text),
// canCall, canMessage }.
export function mountStudio(root, host) {
  for (const el of root.querySelectorAll(".w[data-w]")) {
    const p = PLACED[+el.dataset.w];
    if (!p || el.dataset.mounted) continue;
    el.dataset.mounted = "1";
    try { (MOUNTS[p.kind] ?? ATLAS_MOUNTS[p.kind])(el, p.data, p, host); } catch (err) { notice(el, `This view could not be drawn: ${err && err.message}`, "error"); }
  }
  wireTables(root);
}

// Any table marked sortable sorts by a heading's column when it is clicked (numbers by their value,
// text as text), and a filter box above a long table hides the rows without its words. Listeners
// go on the root once; the tables change with each result.
function wireTables(root) {
  if (root.dataset.tables) return;
  root.dataset.tables = "1";
  root.addEventListener("click", (e) => {
    const th = e.target.closest("table.sortable th");
    if (!th) return;
    const table = th.closest("table"), body = table.tBodies[0], i = [...th.parentNode.children].indexOf(th);
    if (!body) return;
    const dir = th.getAttribute("aria-sort") === "descending" ? 1 : -1;
    for (const h of th.parentNode.children) h.removeAttribute("aria-sort");
    th.setAttribute("aria-sort", dir > 0 ? "ascending" : "descending");
    const key = (tr) => { const td = tr.children[i]; if (!td) return null; const v = td.dataset.v; return v !== undefined ? Number(v) : td.textContent.trim().toLowerCase(); };
    const rows = [...body.rows].sort((a, b) => {
      const x = key(a), y = key(b);
      if (x === y) return 0;
      if (x === null || x === "" || x === "–") return 1;
      if (y === null || y === "" || y === "–") return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
    body.append(...rows);
  });
  root.addEventListener("input", (e) => {
    const box = e.target.closest("input.filter");
    if (!box) return;
    const q = box.value.trim().toLowerCase(), table = box.parentNode.querySelector("table");
    if (table) for (const tr of table.tBodies[0]?.rows ?? []) tr.hidden = Boolean(q) && !tr.textContent.toLowerCase().includes(q);
  });
}
