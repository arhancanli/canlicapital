// Placebo study v2, round 2: White's Reality Check, Hansen's SPA and Romano and Wolf's StepM on the
// same grids and data as the placebo. All three come from one stationary bootstrap in
// js/snooping-core.js (checked against Python's arch 8.0 and a numpy bootstrap-t transcription in
// config/research/reality-check-reference.json). Each needs, for every rule of the grid, a series of
// returns in excess of a benchmark over the scored months, d[t][k]; higher is better.
//
//   momentum, benchmark "zero"   d = the rule's return. The test asks whether some rule has a
//                                positive mean. A static premium can make it so: for a
//                                cross-sectional rule, assets with higher means are more often in
//                                the long leg.
//   momentum, benchmark "hold"   (time-series rules only) d = the rule's return minus the return of
//                                holding every factor of the rule's universe long with weight 1/N:
//                                does timing beat holding?
//   volatility management        d = c m - beta f, where m is the managed return, c scales it to the
//                                factor's standard deviation over the scored months, and beta is the
//                                OLS slope of c m on f over the same months. Its mean is the OLS
//                                intercept (alpha), the quantity Moreira and Muir (2017) test; beta
//                                is treated as known, as it is in their t-test.
//
// The SPA p-value is Hansen's consistent one with a bootstrap-t (studentized) statistic; the Reality
// Check is White's (not studentized, every rule recentred); StepM rejects the global null when it
// declares at least one rule superior (studentized, consistent recentring).
import { snoopingTests } from "../../../../js/snooping-core.js";
import { expand, momentumRules } from "../v2/pipelines.mjs";

/** The managed series of every volatility-management rule, hedged as above: [{ rule, d }]. */
export function volManagedExcess(view, grid, factors, from) {
  const n = view.returns[0].length;
  const out = [];
  for (const rule of expand(grid)) {
    const c = factors[rule.factor];
    const r = view.returns[c], v = view.variance[c];
    const len = n - from;
    const m = new Float64Array(len), f = r.subarray(from);
    for (let t = from; t < n; t++) {
      let rv = 0;
      for (let h = 1; h <= rule.window; h++) rv += v[t - h];
      rv /= rule.window;
      m[t - from] = r[t] / rv ** (rule.power / 2);
    }
    const mean = (x) => x.reduce((a, y) => a + y, 0) / x.length;
    const sd = (x, mu) => Math.sqrt(x.reduce((a, y) => a + (y - mu) ** 2, 0) / (x.length - 1));
    const mf = mean(f), mm = mean(m);
    const scale = sd(f, mf) / sd(m, mm);
    let sxx = 0, sxy = 0;
    for (let i = 0; i < len; i++) { sxx += (f[i] - mf) ** 2; sxy += (f[i] - mf) * (scale * m[i] - scale * mm); }
    const beta = sxx > 0 ? sxy / sxx : 0;
    const d = new Float64Array(len);
    for (let i = 0; i < len; i++) d[i] = scale * m[i] - beta * f[i];
    out.push({ rule, d });
  }
  return out;
}

/** The excess-return series of every rule of a claim's grid on a view, scored from row `from`. */
export function excessSeries(claim, view, from, grid, benchmark) {
  if (claim.pipeline === "vol_managed") return volManagedExcess(view, grid, claim.columns, from);
  const kind = claim.pipeline === "ts_momentum" ? "ts" : "cs";
  const rules = momentumRules(kind, view, grid, claim.universes, from, { keepSeries: true });
  if (benchmark === "zero") return rules.map((x) => ({ rule: x.rule, d: x.series }));
  if (benchmark !== "hold" || kind !== "ts") throw new Error(`benchmark ${benchmark} is not registered for ${claim.pipeline}`);
  const n = view.returns[0].length;
  const holdOf = new Map();
  return rules.map((x) => {
    if (!holdOf.has(x.rule.universe)) {
      const u = claim.universes[x.rule.universe];
      const h = new Float64Array(n - from);
      for (let t = from; t < n; t++) { let s = 0; for (const j of u) s += view.returns[j][t]; h[t - from] = s / u.length; }
      holdOf.set(x.rule.universe, h);
    }
    const h = holdOf.get(x.rule.universe);
    return { rule: x.rule, d: Float64Array.from(x.series, (y, i) => y - h[i]) };
  });
}

/** Runs the three tests on a list of excess series; returns the p-values and the StepM verdict. */
export function snoop(series, { block, reps, seed, alpha = 0.05 }) {
  const k = series.length, n = series[0].d.length;
  const d = new Float64Array(n * k);
  for (let j = 0; j < k; j++) { const s = series[j].d; for (let t = 0; t < n; t++) d[t * k + j] = s[t]; }
  const res = snoopingTests(d, n, k, { block, reps, seed, alpha, studentize: true });
  return {
    rc_p: res.reality_check.p_value,
    spa_p: res.spa.p_consistent,
    spa_p_lower: res.spa.p_lower,
    spa_p_upper: res.spa.p_upper,
    stepm_reject: res.stepm.superior.length > 0,
    stepm_superior: res.stepm.superior.length,
    best_t: res.observed,
    best_rule: res.best >= 0 ? series[res.best].rule : null,
  };
}
