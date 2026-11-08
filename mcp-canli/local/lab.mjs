// The Lab on this machine: about a million mechanical strategies, every one counted, run on Kenneth French's daily
// portfolio and factor returns (US from 1926, and Developed, Europe, Japan, Asia Pacific and North America markets
// from 1990), downloaded from his data library by `canli-mcp lab build` and never redistributed. The Lab is a
// reference set: what simple rules on public data could have earned, so a new result can be set against all of them
// (src/lab.mjs's tools). Its portfolios are not investable and its costs are a flat assumption.
//
// A strategy is a number. The number names a series and a variant (a rule family, its settings, how often it
// rebalances), so any strategy can be run again exactly from its number and the same files. Each strategy's monthly
// returns (basis points, int16) and summary statistics are kept; daily returns are recomputed when asked for.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

import { openLab } from "../src/lab.mjs";

export const LAB_SCHEMA = "canli.lab.v1";
export const LIBRARY = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/";
export const COST_BPS = 5;
const UA = "canli-lab-builder/1.0 (canli-mcp; research; one read per file)";
const MIN_DAYS = 756;
const MISSING = -32768;

// ---------------------------------------------------------------------------------------------------------------
// Data: French's zipped CSVs, first table of each (value-weighted returns, or the factors), percent per day.
// ---------------------------------------------------------------------------------------------------------------
export function unzipFirst(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip file");
  const cd = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error("zip central directory not found");
  const method = buf.readUInt16LE(cd + 10), size = buf.readUInt32LE(cd + 20), local = buf.readUInt32LE(cd + 42);
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + size);
  if (method === 0) return data.toString("latin1");
  if (method === 8) return inflateRawSync(data).toString("latin1");
  throw new Error(`zip method ${method} is not supported`);
}

// The first table: a header row starting with a comma, then rows of yyyymmdd and percents, to the first other line.
export function firstTable(text) {
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex((l) => /^\s*,/.test(l) && l.split(",").length > 1);
  if (h < 0) throw new Error("no table");
  const columns = lines[h].split(",").slice(1).map((c) => c.trim());
  const dates = [], rows = [];
  for (let i = h + 1; i < lines.length; i += 1) {
    const cells = lines[i].split(",");
    if (!/^\s*\d{8}\s*$/.test(cells[0])) break;
    dates.push(Number(cells[0]));
    rows.push(cells.slice(1).map((c) => { const v = Number(c); return !Number.isFinite(v) || v <= -99.99 ? NaN : v / 100; }));
  }
  return { columns, dates, rows };
}

// Every daily file listed on the library's page, downloaded once into dir, with its time and hash.
export async function downloadLibrary(dir, { fetchImpl = fetch, log = () => {}, pause = 1000 } = {}) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const page = await (await fetchImpl(`${LIBRARY}data_library.html`, { headers: { "user-agent": UA } })).text();
  const files = [...new Set([...page.matchAll(/ftp\/([A-Za-z0-9_\-]+[Dd]aily[A-Za-z0-9_\-]*_CSV\.zip)/g)].map((m) => m[1]))].sort();
  const got = [];
  for (const f of files) {
    const path = join(dir, f);
    if (!existsSync(path)) {
      const res = await fetchImpl(`${LIBRARY}ftp/${f}`, { headers: { "user-agent": UA } });
      if (!res.ok) { log(`skipped ${f}: HTTP ${res.status}`); continue; }
      writeFileSync(`${path}.part`, Buffer.from(await res.arrayBuffer()));
      renameSync(`${path}.part`, path);
      log(`downloaded ${f}`);
      await new Promise((r) => setTimeout(r, pause));
    }
    got.push(f);
  }
  return got;
}

// Each series: the last unbroken run of days with a return, at least three years of them.
export function loadSeries(dir) {
  const series = [], data = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith("_CSV.zip")).sort()) {
    const buf = readFileSync(join(dir, f));
    data.push({ file: f, sha256: createHash("sha256").update(buf).digest("hex") });
    const t = firstTable(unzipFirst(buf)), group = f.replace(/_CSV\.zip$/, "");
    t.columns.forEach((name, j) => {
      if (name === "RF") return;
      let start = 0;
      for (let i = 0; i < t.rows.length; i += 1) if (!Number.isFinite(t.rows[i][j])) start = i + 1;
      const n = t.rows.length - start;
      if (n < MIN_DAYS) return;
      const r = new Float64Array(n), d = new Int32Array(n);
      for (let i = 0; i < n; i += 1) { r[i] = t.rows[start + i][j]; d[i] = t.dates[start + i]; }
      series.push({ id: `${group}:${name}`, group, name, dates: d, r });
    });
  }
  return { series, data };
}

// ---------------------------------------------------------------------------------------------------------------
// Variants: every rule family with its settings, each daily or monthly. The order is fixed: a variant is its index.
// ---------------------------------------------------------------------------------------------------------------
const L = [5, 10, 21, 42, 63, 84, 126, 168, 189, 252, 378, 504];
function rules() {
  const out = [];
  for (const mode of ["long_flat", "long_short"]) {
    for (const lb of L) for (const skip of [0, 21]) out.push({ family: "tsmom", lookback: lb, skip, mode });
    for (const fast of [5, 10, 20, 30, 50, 75, 100]) for (const slow of [20, 50, 100, 150, 200, 250, 300]) if (fast * 2 <= slow) out.push({ family: "ma_cross", fast, slow, mode });
    for (const n of [10, 20, 40, 55, 80, 100, 150, 200, 250]) for (const exit of [0.25, 0.5, 1]) out.push({ family: "breakout", lookback: n, exit, mode });
    for (const w of [5, 10, 20, 40, 60, 120]) for (const entry of [1, 1.5, 2]) out.push({ family: "zscore_reversion", window: w, entry, mode });
    for (const p of [2, 5, 14]) for (const lower of [10, 20, 30]) out.push({ family: "rsi_reversion", period: p, lower, mode });
  }
  for (const lb of [10, 21, 42, 63, 126]) for (const target of [0.05, 0.1, 0.15, 0.2]) for (const cap of [1, 2]) out.push({ family: "vol_target", vol_lookback: lb, target, cap, mode: "long" });
  for (const lb of L) for (const vlb of [21, 63]) out.push({ family: "tsmom_vol_target", lookback: lb, vol_lookback: vlb, target: 0.1, cap: 2, mode: "long_short" });
  return out;
}
export const RULES = Object.freeze(rules());
export const REBALANCE = Object.freeze(["daily", "monthly"]);
export const VARIANTS = RULES.length * REBALANCE.length;
export const variantOf = (k) => ({ ...RULES[Math.floor(k / REBALANCE.length)], rebalance: REBALANCE[k % REBALANCE.length], lag_days: 1, cost_bps: COST_BPS });

// ---------------------------------------------------------------------------------------------------------------
// The engine: positions from information up to each close, entered at the next close (lag 1), costs on turnover.
// ---------------------------------------------------------------------------------------------------------------
export function prepare(s) {
  const n = s.r.length, lp = new Float64Array(n + 1), P = new Float64Array(n + 1);
  P[0] = 1;
  for (let i = 0; i < n; i += 1) { lp[i + 1] = lp[i] + Math.log1p(Math.max(s.r[i], -0.99)); P[i + 1] = Math.exp(lp[i + 1]); }
  const cumP = new Float64Array(n + 2), cumLp = new Float64Array(n + 2), cumLp2 = new Float64Array(n + 2), cumR2 = new Float64Array(n + 1), cumR = new Float64Array(n + 1);
  for (let i = 0; i <= n; i += 1) { cumP[i + 1] = cumP[i] + P[i]; cumLp[i + 1] = cumLp[i] + lp[i]; cumLp2[i + 1] = cumLp2[i] + lp[i] * lp[i]; }
  for (let i = 0; i < n; i += 1) { cumR[i + 1] = cumR[i] + s.r[i]; cumR2[i + 1] = cumR2[i] + s.r[i] * s.r[i]; }
  const month = new Int32Array(n);
  for (let i = 0; i < n; i += 1) month[i] = Math.floor(s.dates[i] / 100);
  return { n, lp, P, cumP, cumLp, cumLp2, cumR, cumR2, month, cache: new Map() };
}

// Index i is "after day i-1's close" (lp[i]); day t's return is r[t], from lp[t] to lp[t+1].
const meanP = (c, i, w) => (c.cumP[i + 1] - c.cumP[i + 1 - w]) / w;
function sdR(c, t, w) { // daily returns t-w+1..t
  const s = c.cumR[t + 1] - c.cumR[t + 1 - w], s2 = c.cumR2[t + 1] - c.cumR2[t + 1 - w], m = s / w;
  return Math.sqrt(Math.max(0, s2 / w - m * m));
}
function rolling(c, w, kind) { // max or min of P over the w closes before index i (P[i-w..i-1]); NaN for i < w
  const key = `${kind}${w}`;
  if (c.cache.has(key)) return c.cache.get(key);
  const before = new Float64Array(c.n + 1).fill(NaN), dq = new Int32Array(c.n + 1);
  const better = kind === "max" ? (a, b) => a >= b : (a, b) => a <= b;
  let h = 0, tl = 0;
  for (let j = 0; j < c.n; j += 1) {
    while (tl > h && better(c.P[j], c.P[dq[tl - 1]])) tl -= 1;
    dq[tl++] = j;
    while (dq[h] <= j - w) h += 1;
    if (j + 1 >= w) before[j + 1] = c.P[dq[h]];
  }
  c.cache.set(key, before);
  return before;
}
function rsiOf(c, s, p) {
  const key = `rsi${p}`;
  if (c.cache.has(key)) return c.cache.get(key);
  const out = new Float64Array(c.n + 1).fill(NaN);
  let up = 0, down = 0;
  for (let t = 0; t < c.n; t += 1) {
    const g = Math.max(s.r[t], 0), l = Math.max(-s.r[t], 0);
    if (t < p) { up += g / p; down += l / p; } else { up = (up * (p - 1) + g) / p; down = (down * (p - 1) + l) / p; }
    if (t >= p - 1) out[t + 1] = down === 0 ? 100 : 100 - 100 / (1 + up / down);
  }
  c.cache.set(key, out);
  return out;
}

// The target position after close i-1 (index i, i >= 1), from information up to then; NaN while warming up.
function target(v, c, s, i, prev) {
  const ls = v.mode === "long_short";
  switch (v.family) {
    case "tsmom": { const a = i - v.skip, b = a - v.lookback; if (b < 0) return NaN; const sig = c.lp[a] > c.lp[b] ? 1 : c.lp[a] < c.lp[b] ? -1 : 0; return ls ? sig : Math.max(sig, 0); }
    case "ma_cross": { if (i < v.slow) return NaN; const up = meanP(c, i, v.fast) > meanP(c, i, v.slow); return up ? 1 : ls ? -1 : 0; }
    case "breakout": {
      const hi = rolling(c, v.lookback, "max")[i], lo = rolling(c, v.lookback, "min")[i];
      const m = Math.max(2, Math.round(v.lookback * v.exit)), exitLo = rolling(c, m, "min")[i], exitHi = rolling(c, m, "max")[i];
      if (!Number.isFinite(hi) || !Number.isFinite(exitLo)) return NaN;
      const p = c.P[i], was = Number.isFinite(prev) ? prev : 0;
      if (p > hi) return 1;
      if (ls && p < lo) return -1;
      if (was > 0 && p < exitLo) return 0;
      if (was < 0 && p > exitHi) return 0;
      return was;
    }
    case "zscore_reversion": {
      const w = v.window; if (i < w) return NaN;
      const s1 = c.cumLp[i + 1] - c.cumLp[i + 1 - w], s2 = c.cumLp2[i + 1] - c.cumLp2[i + 1 - w], m = s1 / w, sd = Math.sqrt(Math.max(0, s2 / w - m * m));
      if (!(sd > 0)) return Number.isFinite(prev) ? prev : 0;
      const z = (c.lp[i] - m) / sd, was = Number.isFinite(prev) ? prev : 0;
      if (z < -v.entry) return 1;
      if (ls && z > v.entry) return -1;
      if ((was > 0 && z >= 0) || (was < 0 && z <= 0)) return 0;
      return was;
    }
    case "rsi_reversion": {
      const x = rsiOf(c, s, v.period)[i]; if (!Number.isFinite(x)) return NaN;
      const was = Number.isFinite(prev) ? prev : 0;
      if (x < v.lower) return 1;
      if (ls && x > 100 - v.lower) return -1;
      if ((was > 0 && x > 50) || (was < 0 && x < 50)) return 0;
      return was;
    }
    case "vol_target": { if (i < v.vol_lookback) return NaN; const vol = sdR(c, i - 1, v.vol_lookback) * Math.sqrt(252); return vol > 0 ? Math.min(v.cap, v.target / vol) : 0; }
    case "tsmom_vol_target": {
      const b = i - v.lookback; if (b < 0 || i < v.vol_lookback) return NaN;
      const sig = c.lp[i] > c.lp[b] ? 1 : c.lp[i] < c.lp[b] ? -1 : 0, vol = sdR(c, i - 1, v.vol_lookback) * Math.sqrt(252);
      return vol > 0 ? sig * Math.min(v.cap, v.target / vol) : 0;
    }
    default: throw new Error(`unknown family ${v.family}`);
  }
}

// Daily returns of one strategy. Index t is after day t-1's close: the target set there is traded at day t's close
// (one day's lag) and earns day t+1's return, less costs on the change in position.
export function runDaily(v, c, s) {
  const ret = new Float64Array(c.n), live = new Uint8Array(c.n);
  let pos = 0, prevTarget = NaN, held = NaN, turnover = 0;
  for (let t = 1; t + 1 < c.n; t += 1) {
    const tg = target(v, c, s, t, prevTarget);
    prevTarget = tg;
    const newMonth = t < 2 || c.month[t - 1] !== c.month[t - 2];
    if (Number.isFinite(tg) && (v.rebalance === "daily" || !Number.isFinite(held) || newMonth)) held = tg;
    if (!Number.isFinite(held)) continue;
    const change = Math.abs(held - pos);
    turnover += change;
    pos = held;
    ret[t + 1] = pos * s.r[t + 1] - change * (COST_BPS / 10000);
    live[t + 1] = 1;
  }
  return { ret, live, turnover };
}

// Monthly returns (compounded) and statistics of one strategy.
export function runMonthly(v, c, s) {
  const { ret, live, turnover } = runDaily(v, c, s);
  const months = [], values = [];
  let cur = -1, acc = 1, sum = 0, sum2 = 0, days = 0, eq = 1, peak = 1, dd = 0;
  for (let t = 0; t < c.n; t += 1) {
    if (!live[t]) continue;
    if (c.month[t] !== cur) { if (cur >= 0) { months.push(cur); values.push(acc - 1); } cur = c.month[t]; acc = 1; }
    acc *= 1 + ret[t]; sum += ret[t]; sum2 += ret[t] * ret[t]; days += 1;
    eq *= 1 + ret[t]; peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1);
  }
  if (cur >= 0) { months.push(cur); values.push(acc - 1); }
  const mean = days ? sum / days : 0, sd = days > 1 ? Math.sqrt(Math.max(0, sum2 / days - mean * mean)) : 0;
  return { months, values, stats: { sharpe: sd > 0 ? (mean / sd) * Math.sqrt(252) : 0, ann_return: mean * 252, ann_vol: sd * Math.sqrt(252), max_drawdown: dd, turnover_per_year: days ? (turnover / days) * 252 : 0, days } };
}

// ---------------------------------------------------------------------------------------------------------------
// Files: one shard per run of `lab build --shard i/n`, merged into monthly.i16, offsets, stats.f32 and manifest.json.
// ---------------------------------------------------------------------------------------------------------------
export const STATS = Object.freeze(["sharpe", "ann_return", "ann_vol", "max_drawdown", "turnover_per_year", "days"]);
const monthIndex = (yyyymm) => Math.floor(yyyymm / 100) * 12 + (yyyymm % 100) - 1;
export const monthOfIndex = (k) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;

export function buildShard({ series, out, shard = { index: 0, of: 1 }, log = () => {} }) {
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const mine = series.map((s, i) => i).filter((i) => i % shard.of === shard.index);
  const chunks = [], heads = [], stats = [];
  for (const si of mine) {
    const s = series[si], c = prepare(s);
    for (let k = 0; k < VARIANTS; k += 1) {
      const m = runMonthly(variantOf(k), c, s);
      const first = m.months.length ? monthIndex(m.months[0]) : 0, vals = new Int16Array(m.months.length);
      m.values.forEach((x, j) => { vals[j] = Number.isFinite(x) ? Math.max(-32767, Math.min(32767, Math.round(x * 10000))) : MISSING; });
      chunks.push(Buffer.from(vals.buffer));
      heads.push([si * VARIANTS + k, first, vals.length]);
      stats.push(STATS.map((key) => m.stats[key]));
    }
    log(`series ${si + 1} of ${series.length}: ${s.id}`);
  }
  const file = join(out, `shard-${shard.index}-of-${shard.of}.json`);
  writeFileSync(`${file}.bin`, Buffer.concat(chunks));
  writeFileSync(file, JSON.stringify({ shard, heads, stats }));
  return file;
}

// The merged Lab: strategy id = series index * VARIANTS + variant; offsets in months (Uint32 pairs: start, count).
export function mergeShards({ out, series, data, of, now = () => new Date().toISOString() }) {
  const total = series.length * VARIANTS;
  const offsets = new Uint32Array(total * 3), stats = new Float32Array(total * STATS.length).fill(NaN);
  const parts = [];
  let at = 0;
  for (let i = 0; i < of; i += 1) {
    const meta = JSON.parse(readFileSync(join(out, `shard-${i}-of-${of}.json`), "utf8")), bin = readFileSync(join(out, `shard-${i}-of-${of}.json.bin`));
    let pos = 0;
    meta.heads.forEach(([id, first, count], j) => {
      offsets[id * 3] = at + pos / 2; offsets[id * 3 + 1] = first; offsets[id * 3 + 2] = count;
      meta.stats[j].forEach((x, q) => { stats[id * STATS.length + q] = x; });
      pos += count * 2;
    });
    // Shard blocks are laid out in shard order; offsets point into the joined file.
    parts.push(bin);
    at += bin.length / 2;
  }
  writeFileSync(join(out, "monthly.i16"), Buffer.concat(parts));
  writeFileSync(join(out, "offsets.u32"), Buffer.from(offsets.buffer));
  writeFileSync(join(out, "stats.f32"), Buffer.from(stats.buffer));
  const manifest = {
    schema: LAB_SCHEMA, built_at: now(), strategies: total, series: series.map((s) => ({ id: s.id, first_day: s.dates[0], last_day: s.dates[s.dates.length - 1] })),
    variants: VARIANTS, rules: RULES, rebalance: REBALANCE, lag_days: 1, cost_bps: COST_BPS, stats: STATS, missing: MISSING, month_index: "year * 12 + month - 1",
    data: { library: LIBRARY, files: data }, note: "Strategy id = series index * variants + variant; variant = rule index * 2 + rebalance index.",
  };
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest));
  return manifest;
}

// The shard files once merged.
export function removeShards(out, of) {
  for (let i = 0; i < of; i += 1) for (const f of [`shard-${i}-of-${of}.json`, `shard-${i}-of-${of}.json.bin`]) rmSync(join(out, f), { force: true });
}

// How many independent strategies the Lab amounts to: the participation ratio n^2 / sum of squared correlations, on a
// seeded sample of strategies that cover at least ten years from 1991, over the months they all share. A count of near-copies
// is what a raw total hides; this names it.
export function effectiveNumber(out, { sample = 1500, seed = 7 } = {}) {
  const lab = openLab(out), N = lab.manifest.strategies, from = 1991 * 12;
  let x = seed >>> 0;
  const rand = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  const picked = [], tried = new Set();
  let end = Infinity;
  while (picked.length < sample && tried.size < Math.min(N, sample * 50)) {
    const id = Math.floor(rand() * N);
    if (tried.has(id)) continue;
    tried.add(id);
    const m = lab.monthly(id);
    if (m.first > from || m.first + m.values.length < from + 120) continue;
    picked.push(m);
    end = Math.min(end, m.first + m.values.length);
  }
  if (picked.length < 50) return { sample: picked.length, participation_ratio: null, reading: "Too few strategies cover ten years from 1991 to estimate it." };
  const T = end - from, Z = picked.map((m) => {
    const v = Array.from({ length: T }, (_, k) => m.values[from + k - m.first] ?? 0), mu = v.reduce((s, y) => s + y, 0) / T;
    const sd = Math.sqrt(v.reduce((s, y) => s + (y - mu) ** 2, 0) / T) || 1;
    return Float64Array.from(v, (y) => (y - mu) / sd);
  });
  let sum2 = 0;
  for (let i = 0; i < Z.length; i += 1) for (let j = 0; j < Z.length; j += 1) { let c = 0; const a = Z[i], b = Z[j]; for (let k = 0; k < T; k += 1) c += a[k] * b[k]; c /= T; sum2 += c * c; }
  const n = Z.length, ratio = (n * n) / sum2;
  return { sample: n, months: T, from: "1991-01", participation_ratio: Number(ratio.toFixed(1)), share: Number((ratio / n).toFixed(4)), scaled_to_lab: Math.round((ratio / n) * N), reading: `On a sample of ${n} strategies over ${T} months, they behave like about ${ratio.toFixed(0)} independent ones (${((100 * ratio) / n).toFixed(1)}%). The share is an estimate for the whole Lab, not a count.` };
}

// Merge, remove the shard files, and record the effective number in the manifest.
export function finishBuild({ out, series, data, of }) {
  const manifest = mergeShards({ out, series, data, of });
  removeShards(out, of);
  manifest.effective = effectiveNumber(out);
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest));
  return manifest;
}
