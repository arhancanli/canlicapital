// Placebo study v2: the factor-timing pipelines. Each takes a monthly panel (one Float64Array of
// returns per series, and for volatility management one Float64Array of realized variance per
// series), searches its whole grid, and reports every rule's headline statistic over the months it
// is scored on: rows from `from` to the end. Every position for month t uses rows before t only (a
// test changes a later row and checks that no earlier strategy return moves).
//
//   ts_momentum   each factor long or short on the sign of its own past return (time-series factor
//                 momentum), equal weights, positions held `hold` months in overlapping cohorts
//   cs_momentum   the assets ranked by past return, long the top `side` and short the bottom `side`
//                 (cross-sectional factor momentum; industry momentum), overlapping cohorts
//   vol_managed   one factor scaled by the inverse of its past realized variance (power 2) or
//                 volatility (power 1) over `window` months; scored by its appraisal ratio against
//                 the unmanaged factor (the alpha over the residual volatility of the OLS regression
//                 of the managed return on the factor return)
//
// The headline is the best statistic in the grid: the annualized Sharpe ratio for momentum, the
// annualized appraisal ratio for volatility management.
import { normalCdf } from "../../../../js/dsr-core.js";

const ANNUAL = Math.sqrt(12);

/** All combinations of a grid object's arrays, in key order then value order. */
export function expand(grid) {
  let out = [{}];
  for (const [key, values] of Object.entries(grid)) out = out.flatMap((rule) => values.map((v) => ({ ...rule, [key]: v })));
  return out;
}

/** Months a grid needs before its first scored month. */
export function warmup(pipeline, grid) {
  if (pipeline === "vol_managed") return Math.max(...grid.window);
  return Math.max(...grid.hold) - 1 + Math.max(...grid.skip) + Math.max(...grid.lookback);
}

function sharpeOf(s) {
  let sum = 0, sq = 0;
  for (let i = 0; i < s.length; i++) { sum += s[i]; sq += s[i] * s[i]; }
  const mean = sum / s.length;
  const sd = Math.sqrt(Math.max(0, sq / s.length - mean * mean));
  const monthly = sd > 0 ? mean / sd : 0;
  return { stat: monthly * ANNUAL, t: monthly * Math.sqrt(s.length), mean };
}

const prefix = (r) => {
  const out = new Float64Array(r.length + 1);
  for (let t = 0; t < r.length; t++) out[t + 1] = out[t] + r[t];
  return out;
};

/** How many assets each leg holds in a cross-sectional rule: "half" or "third" of the universe. */
export const legSize = (side, n) => Math.max(1, Math.floor(side === "third" ? n / 3 : n / 2));

/**
 * Formation weights for one (universe, lookback, skip): w[t * k + j] is asset j's weight in the
 * portfolio formed for month t from returns through month t - skip - 1. Rows before `start` are zero.
 */
function formation(kind, cols, cum, universe, lookback, skip, side, start, n) {
  const k = universe.length;
  const w = new Float64Array(n * k);
  const signal = new Float64Array(k);
  const sorted = new Float64Array(k);
  const q = legSize(side, k);
  for (let t = start; t < n; t++) {
    for (let j = 0; j < k; j++) { const c = cum[universe[j]]; signal[j] = c[t - skip] - c[t - skip - lookback]; }
    if (kind === "ts") {
      for (let j = 0; j < k; j++) w[t * k + j] = Math.sign(signal[j]) / k;
    } else {
      // Ranked by past return, highest first, ties in universe order: the long leg is the first q,
      // the short leg the last q. A native sort of the values gives the two cut-offs; assets beyond a
      // cut-off are in, and assets equal to it fill the leg in rank order.
      sorted.set(signal);
      sorted.sort();
      const hi = sorted[k - q], lo = sorted[q - 1];
      let longs = 0, shorts = 0;
      for (let j = 0; j < k; j++) if (signal[j] > hi) { w[t * k + j] = 1 / q; longs++; }
      for (let j = 0; j < k && longs < q; j++) if (signal[j] === hi) { w[t * k + j] = 1 / q; longs++; }
      for (let j = 0; j < k; j++) if (signal[j] < lo) { w[t * k + j] = -1 / q; shorts++; }
      for (let j = k - 1; j >= 0 && shorts < q; j--) if (signal[j] === lo) { w[t * k + j] = -1 / q; shorts++; }
    }
  }
  return w;
}

/**
 * Every rule of a momentum grid, scored on months from..n-1. grid: { universe: [name], lookback,
 * skip, hold, side? }; universes maps a universe name to column indices.
 * Returns [{ rule, stat, t, series? }] in expand(grid) order.
 */
export function momentumRules(kind, view, grid, universes, from, { keepSeries = false } = {}) {
  const cols = view.returns;
  const n = cols[0].length;
  const cum = cols.map(prefix);
  const hmax = Math.max(...grid.hold);
  if (from < warmup("momentum", grid)) throw new RangeError(`first scored row ${from} is inside the warm-up`);
  const cache = new Map();
  const results = [];
  for (const rule of expand(grid)) {
    const universe = universes[rule.universe];
    const side = rule.side ?? "half";
    const key = `${rule.universe}|${rule.lookback}|${rule.skip}|${side}`;
    if (!cache.has(key)) {
      // Running sums of formation weights over time, so a holding period of h months is one difference.
      const w = formation(kind, cols, cum, universe, rule.lookback, rule.skip, side, from - hmax + 1, n);
      const k = universe.length;
      const cw = new Float64Array((n + 1) * k);
      for (let t = 0; t < n; t++) for (let j = 0; j < k; j++) cw[(t + 1) * k + j] = cw[t * k + j] + w[t * k + j];
      cache.set(key, cw);
    }
    const cw = cache.get(key);
    const k = universe.length;
    const s = new Float64Array(n - from);
    for (let t = from; t < n; t++) {
      let v = 0;
      // The average weight of the cohorts formed for months t - hold + 1 .. t.
      for (let j = 0; j < k; j++) v += ((cw[(t + 1) * k + j] - cw[(t + 1 - rule.hold) * k + j]) / rule.hold) * cols[universe[j]][t];
      s[t - from] = v;
    }
    results.push({ rule, ...sharpeOf(s), ...(keepSeries ? { series: s } : {}) });
  }
  return results;
}

/** OLS of y on x with an intercept: alpha, its standard error, residual standard deviation. */
function regress(y, x) {
  const n = y.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
  const beta = sxx > 0 ? sxy / sxx : 0;
  const alpha = my - beta * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i] - alpha - beta * x[i]) ** 2;
  const s2 = sse / Math.max(1, n - 2);
  const se = Math.sqrt(s2 * (1 / n + (mx * mx) / (sxx || Infinity)));
  return { alpha, beta, se, resid: Math.sqrt(s2) };
}

/**
 * Every rule of a volatility-management grid, scored on months from..n-1. grid: { factor: [name],
 * window, power }; factors maps a factor name to its column index. Each column needs its variance.
 */
export function volManagedRules(view, grid, factors, from) {
  if (from < warmup("vol_managed", grid)) throw new RangeError(`first scored row ${from} is inside the warm-up`);
  const n = view.returns[0].length;
  const results = [];
  for (const rule of expand(grid)) {
    const c = factors[rule.factor];
    const r = view.returns[c], v = view.variance[c];
    const managed = new Float64Array(n - from), plain = r.subarray(from);
    for (let t = from; t < n; t++) {
      let rv = 0;
      for (let h = 1; h <= rule.window; h++) rv += v[t - h];
      rv /= rule.window;
      managed[t - from] = r[t] / rv ** (rule.power / 2);
    }
    const fit = regress(managed, plain);
    results.push({ rule, stat: fit.resid > 0 ? (fit.alpha / fit.resid) * ANNUAL : 0, t: fit.se > 0 ? fit.alpha / fit.se : 0, beta: fit.beta });
  }
  return results;
}

/** Every rule of a claim's grid on a panel view, scored from row `from`. */
export function ruleResults(claim, view, from, options) {
  if (claim.pipeline === "vol_managed") return volManagedRules(view, claim.grid, claim.columns, from);
  return momentumRules(claim.pipeline === "ts_momentum" ? "ts" : "cs", view, claim.grid, claim.universes, from, options);
}

/**
 * What the pipeline headlines (the best statistic in its grid), which rule gave it, and the two
 * textbook p-values: naive, a one-sided normal test on the best rule's t as if it were the only rule
 * tried, and Bonferroni, that p-value times the number of rules.
 */
export function headline(results) {
  let best = 0;
  for (let k = 1; k < results.length; k++) if (results[k].stat > results[best].stat) best = k;
  const naive = 1 - normalCdf(results[best].t);
  return { stat: results[best].stat, best, rule: results[best].rule, naive, bonferroni: Math.min(1, naive * results.length), rules: results.length };
}
