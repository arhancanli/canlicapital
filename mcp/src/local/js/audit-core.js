// =============================================================================
// audit-core.js
// -----------------------------------------------------------------------------
// The parts of audit_backtest computed from the caller's own series rather than by a stored
// validator:
//
//   returnShape          lag-1 autocorrelation, volatility clustering, skew and tails of the
//                        returns, and Lo's (2002) autocorrelation-adjusted Sharpe ratio.
//   sharpeInterval       a stationary-bootstrap percentile interval for the annualized Sharpe.
//   searchFromVariants   what every variant's returns say about the search: how many were tried,
//                        how many independent ones that is (Nyholt 2004; Li and Ji 2005), how far
//                        their Sharpe ratios spread, and how correlated they are.
//   nullZooFamily        which Null Zoo family the shape resembles, by the rules fixed in
//                        config/research/null-zoo-v1-prereg.json before the calibration run.
//   neweyWestT,
//   blockBootstrapT      the single-series tests the calibration scores (the same arithmetic as
//                        scripts/research/null-zoo/v1/validators.mjs; a test keeps them equal).
//   oosDecay             what the in-sample best did out of sample across CSCV splits.
//   fixNext              at most five concrete next steps, each naming the check that raised it.
//
// Nothing here decides whether a strategy is good. Each number is a description of the series and
// search exactly as sent.
// =============================================================================

import { autocorrelationFactor } from "./haircut-core.js";
import { perPeriodMoments } from "./moments-core.js";
import { makeRandom } from "./selection-risk-core.js";
import { defaultBlock, stationaryIndices } from "./snooping-core.js";

const mean = (xs) => { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[i]; return s / xs.length; };

function lagOneCorrelation(xs) {
  const m = mean(xs);
  let c = 0, v = 0;
  for (let i = 0; i < xs.length; i++) { const d = xs[i] - m; v += d * d; if (i > 0) c += d * (xs[i - 1] - m); }
  return v > 0 ? c / v : 0;
}

/** The shape of one return series: what the Null Zoo families vary, plus Lo's adjusted Sharpe. */
export function returnShape(returns, periodsPerYear) {
  const m = perPeriodMoments(returns);
  const ppy = Number(periodsPerYear);
  const xs = returns.map(Number);
  const lag1 = lagOneCorrelation(xs);
  const lag1Squares = lagOneCorrelation(xs.map((x) => x * x));
  // Lo's factor needs rho strictly inside (-1, 1); a sample can sit on the edge only when it is tiny.
  const rho = Math.max(-0.95, Math.min(0.95, lag1));
  const sharpe = m.sharpe_per_period * Math.sqrt(ppy);
  const factor = autocorrelationFactor(rho, ppy);
  return {
    observations: m.observations,
    sharpe_annualized: sharpe,
    skew: m.skew,
    excess_kurtosis: m.non_excess_kurtosis - 3,
    lag1_autocorrelation: lag1,
    lag1_autocorrelation_of_squares: lag1Squares,
    lo_factor: factor,
    lo_adjusted_sharpe_annualized: sharpe * factor,
  };
}

/**
 * Percentile intervals for the annualized Sharpe from a stationary bootstrap (mean block n^(1/3)),
 * and the share of resamples whose Sharpe is at or below zero.
 */
export function sharpeInterval(returns, { periodsPerYear, reps = 2000, block, seed = 42, levels = [0.9, 0.95] } = {}) {
  const xs = Float64Array.from(returns, Number);
  const n = xs.length;
  const b = block ?? defaultBlock(n);
  const next = makeRandom(seed);
  const idx = new Int32Array(n);
  const root = Math.sqrt(Number(periodsPerYear));
  const draws = new Float64Array(reps);
  let atOrBelowZero = 0;
  for (let r = 0; r < reps; r++) {
    stationaryIndices(n, b, next, idx);
    let s = 0, q = 0;
    for (let i = 0; i < n; i++) { const v = xs[idx[i]]; s += v; q += v * v; }
    const m = s / n;
    const variance = (q - n * m * m) / (n - 1);
    // A resample with no spread has no Sharpe ratio; it counts on the side its mean falls.
    const sharpe = variance > 0 ? (m / Math.sqrt(variance)) * root : m > 0 ? Infinity : m < 0 ? -Infinity : 0;
    draws[r] = sharpe;
    if (sharpe <= 0) atOrBelowZero++;
  }
  draws.sort();
  const at = (q) => {
    const h = (reps - 1) * q;
    const lo = Math.floor(h);
    const hi = Math.min(lo + 1, reps - 1);
    return draws[lo] + (h - lo) * (draws[hi] - draws[lo]);
  };
  return {
    method: "stationary bootstrap, percentile",
    reps, block: b, seed,
    intervals: Object.fromEntries(levels.map((l) => [String(l), [at((1 - l) / 2), at(1 - (1 - l) / 2)]])),
    share_at_or_below_zero: atOrBelowZero / reps,
  };
}

// Eigenvalues of a symmetric matrix (cyclic Jacobi), for the effective number of trials.
function symmetricEigenvalues(a, k) {
  const m = Float64Array.from(a);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) off += m[i * k + j] ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < k; p++) {
      for (let q = p + 1; q < k; q++) {
        const apq = m[p * k + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (m[q * k + q] - m[p * k + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let r = 0; r < k; r++) {
          const arp = m[r * k + p], arq = m[r * k + q];
          m[r * k + p] = c * arp - s * arq;
          m[r * k + q] = s * arp + c * arq;
        }
        for (let r = 0; r < k; r++) {
          const apr = m[p * k + r], aqr = m[q * k + r];
          m[p * k + r] = c * apr - s * aqr;
          m[q * k + r] = s * apr + c * aqr;
        }
      }
    }
  }
  return Array.from({ length: k }, (_, i) => m[i * k + i]);
}

/**
 * What a search's variants say about it. `matrix[t][j]` is variant j's return in period t (the shape
 * validate_overfitting takes). Constant variants are counted but left out of the correlations.
 */
export function searchFromVariants(matrix, periodsPerYear) {
  const periods = matrix.length;
  const k = matrix[0].length;
  const root = Math.sqrt(Number(periodsPerYear));
  const means = new Float64Array(k);
  for (let t = 0; t < periods; t++) for (let j = 0; j < k; j++) means[j] += Number(matrix[t][j]);
  for (let j = 0; j < k; j++) means[j] /= periods;
  const sds = new Float64Array(k);
  for (let t = 0; t < periods; t++) for (let j = 0; j < k; j++) sds[j] += (Number(matrix[t][j]) - means[j]) ** 2;
  for (let j = 0; j < k; j++) sds[j] = Math.sqrt(sds[j] / (periods - 1));
  const live = [];
  for (let j = 0; j < k; j++) if (sds[j] > 0) live.push(j);
  const sharpes = live.map((j) => (means[j] / sds[j]) * root);
  const sharpeMean = sharpes.reduce((a, b) => a + b, 0) / sharpes.length;
  const sharpeSd = sharpes.length > 1 ? Math.sqrt(sharpes.reduce((a, b) => a + (b - sharpeMean) ** 2, 0) / (sharpes.length - 1)) : 0;
  const L = live.length;
  const corr = new Float64Array(L * L);
  const pair = [];
  for (let a = 0; a < L; a++) {
    corr[a * L + a] = 1;
    for (let b = a + 1; b < L; b++) {
      const ja = live[a], jb = live[b];
      let c = 0;
      for (let t = 0; t < periods; t++) c += (Number(matrix[t][ja]) - means[ja]) * (Number(matrix[t][jb]) - means[jb]);
      const r = c / ((periods - 1) * sds[ja] * sds[jb]);
      corr[a * L + b] = corr[b * L + a] = r;
      pair.push(r);
    }
  }
  const pairMean = pair.length ? pair.reduce((a, b) => a + b, 0) / pair.length : 0;
  const pairSd = pair.length > 1 ? Math.sqrt(pair.reduce((a, b) => a + (b - pairMean) ** 2, 0) / (pair.length - 1)) : 0;
  let nyholt = L, liJi = L;
  if (L > 1) {
    const lambdas = symmetricEigenvalues(corr, L);
    const lm = lambdas.reduce((a, b) => a + b, 0) / L;
    const lv = lambdas.reduce((a, b) => a + (b - lm) ** 2, 0) / (L - 1);
    nyholt = 1 + (L - 1) * (1 - lv / L);
    liJi = lambdas.reduce((a, l) => { const x = Math.abs(l); return a + (x >= 1 ? 1 : 0) + (x - Math.floor(x)); }, 0);
  }
  let best = 0;
  for (let i = 1; i < sharpes.length; i++) if (sharpes[i] > sharpes[best]) best = i;
  return {
    variants: k,
    periods,
    constant_variants: k - L,
    best_variant: live.length ? live[best] : null,
    best_sharpe_annualized: live.length ? sharpes[best] : null,
    cross_trial_sharpe_sd_annualized: sharpeSd,
    mean_pairwise_correlation: pairMean,
    sd_pairwise_correlation: pairSd,
    // Rounded up with a tolerance (a sum of eigenvalues equal to 12 can arrive as 12.000000000000014),
    // never more than the variants that vary, and at least 2, the smallest count the DSR accepts.
    effective_trials: { nyholt, li_ji: liJi, used: Math.max(2, Math.min(L, Math.ceil(liJi - 1e-9))), method: "Li and Ji (2005), rounded up, at most the variants sent, at least 2" },
  };
}

/**
 * The Null Zoo family whose measured size an audit quotes for this shape. The rules and their order
 * are the ones pre-registered in config/research/null-zoo-v1-prereg.json; a test keeps them equal.
 */
export function nullZooFamily(shape, search = null) {
  if (search && search.mean_pairwise_correlation >= 0.3) return search.sd_pairwise_correlation >= 0.15 ? "block_cluster" : "correlated_trials";
  if (Math.abs(shape.lag1_autocorrelation) >= 0.1) return "ar1";
  if (shape.skew <= -0.5) return "skew_negative";
  if (shape.skew >= 0.5) return "skew_positive";
  if (shape.excess_kurtosis >= 2 && shape.lag1_autocorrelation_of_squares >= 0.1) return "garch";
  if (shape.excess_kurtosis >= 2) return "student_t4";
  if (shape.lag1_autocorrelation_of_squares >= 0.1) return "regimes";
  return "iid_normal";
}

/** The t-statistic of a series' mean with a Newey-West (Bartlett, lag floor(4 (T/100)^(2/9))) variance. */
export function neweyWestT(xs) {
  const n = xs.length;
  const m = mean(xs);
  const lag = Math.floor(4 * Math.pow(n / 100, 2 / 9));
  let lrv = 0;
  for (let i = 0; i < n; i++) { const d = xs[i] - m; lrv += d * d; }
  for (let l = 1; l <= lag; l++) {
    let g = 0;
    for (let i = l; i < n; i++) g += (xs[i] - m) * (xs[i - l] - m);
    lrv += 2 * (1 - l / (lag + 1)) * g;
  }
  lrv /= n;
  return lrv > 0 ? m / Math.sqrt(lrv / n) : 0;
}

/** One-sided p-value of "the mean is above zero" from a stationary-bootstrap t (see the header). */
export function blockBootstrapT(xs, { reps, block = defaultBlock(xs.length), seed }) {
  const n = xs.length;
  let sum = 0, sq = 0;
  for (let i = 0; i < n; i++) { sum += xs[i]; sq += xs[i] * xs[i]; }
  const m0 = sum / n;
  const sd = Math.sqrt(Math.max((sq - n * m0 * m0) / (n - 1), 0));
  if (!(sd > 0)) return 1;
  const observed = m0 / (sd / Math.sqrt(n));
  const next = makeRandom(seed);
  const idx = new Int32Array(n);
  let hits = 0;
  for (let b = 0; b < reps; b++) {
    stationaryIndices(n, block, next, idx);
    let s = 0, q = 0;
    for (let i = 0; i < n; i++) { const v = xs[idx[i]]; s += v; q += v * v; }
    const m = s / n;
    const v = (q - n * m * m) / (n - 1);
    if (!(v > 0)) { hits++; continue; }
    if ((m - m0) / Math.sqrt(v / n) >= observed) hits++;
  }
  return (hits + 1) / (reps + 1);
}

const quantileSorted = (sorted, q) => {
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
};

/**
 * Out-of-sample decay from CSCV's in-sample-best pairs ([in-sample Sharpe, out-of-sample Sharpe],
 * per period, as js/pbo-core.js returns them): the distribution of the selected variant's
 * out-of-sample Sharpe, and the least-squares line of out-of-sample on in-sample. With
 * periodsPerYear 1 the Sharpe ratios stay per period, as validate_overfitting reports them.
 */
export function oosDecay(isOosPairs, periodsPerYear = 1) {
  const root = Math.sqrt(Number(periodsPerYear));
  const pairs = isOosPairs.map(([a, b]) => [a * root, b * root]);
  const oos = pairs.map((p) => p[1]).sort((a, b) => a - b);
  const n = pairs.length;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  const slope = sxx > 0 ? sxy / sxx : 0;
  return {
    splits: n,
    unit: Number(periodsPerYear) === 1 ? "per period" : "annualized",
    oos_sharpe: {
      median: quantileSorted(oos, 0.5), p10: quantileSorted(oos, 0.1), p90: quantileSorted(oos, 0.9),
      prob_below_zero: oos.filter((v) => v < 0).length / n,
    },
    degradation: { slope, intercept: my - slope * mx, r2: sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0 },
  };
}

/** A per-period oosDecay result in annualized Sharpe units; the slope, r2 and shares do not change. */
export function annualizeDecay(decay, periodsPerYear) {
  const root = Math.sqrt(Number(periodsPerYear));
  const o = decay.oos_sharpe;
  return {
    ...decay,
    unit: "annualized",
    oos_sharpe: { median: o.median * root, p10: o.p10 * root, p90: o.p90 * root, prob_below_zero: o.prob_below_zero },
    degradation: { ...decay.degradation, intercept: decay.degradation.intercept * root },
  };
}

// The ids are stable: an agent can act on them, and a changelog can name them.
export const FIX_IDS = Object.freeze([
  "count_every_variant", "declared_trials_below_counted", "not_distinguishable_from_luck", "interval_includes_zero",
  "autocorrelated_returns", "track_record_too_short", "overfit_selection", "expected_live_sharpe_below_zero",
  "stress_and_capacity_next",
]);

/**
 * At most five next steps, most decisive first. `context` carries what the audit found; each step
 * is {id, why, next}: the finding with its numbers, and the change or call to make next.
 */
export function fixNext(context) {
  const steps = [];
  const add = (id, why, next) => steps.push({ id, why, next });
  const { headline, shape, interval, search, declaredTrials, trackRecord, overfitting, decay } = context;
  const f2 = (x) => x.toFixed(2);
  if (headline && headline.p > headline.level) {
    add("not_distinguishable_from_luck", `p ${headline.p.toFixed(3)} > ${headline.level}.`, search ? "Pre-declare a smaller grid (backtest_strategy), then audit again." : "Try fewer variants or add out-of-sample data.");
  }
  if (search && declaredTrials !== undefined && declaredTrials < search.effective_trials.used) {
    add("declared_trials_below_counted", `Declared ${declaredTrials} trials; the variants count as ${search.effective_trials.used}.`, "Already applied: the counted number was used.");
  }
  if (!search) add("count_every_variant", "Only declared trials counted.", "Send every variant's returns (variants_file).");
  if (Math.abs(shape.lag1_autocorrelation) >= 0.1) {
    add("autocorrelated_returns", `Lag-1 autocorrelation ${f2(shape.lag1_autocorrelation)}; Lo-adjusted Sharpe ${f2(shape.lo_adjusted_sharpe_annualized)}.`,
      "Check for stale or smoothed prices (summarize_series); quote the adjusted Sharpe.");
  }
  if (interval && interval.intervals["0.95"][0] <= 0) {
    add("interval_includes_zero", `95% Sharpe interval ${f2(interval.intervals["0.95"][0])} to ${f2(interval.intervals["0.95"][1])}.`, "Needs a longer history (validate_backtest_length).");
  }
  if (overfitting && overfitting.pbo >= 0.5) add("overfit_selection", `Overfitting probability ${f2(overfitting.pbo)}.`, "Shrink the grid or fix the selection rule in advance.");
  if (decay && decay.oos_sharpe.median <= 0) add("expected_live_sharpe_below_zero", `Median out-of-sample Sharpe of the pick ${f2(decay.oos_sharpe.median)}.`, "Expect no live edge from this selection.");
  if (trackRecord && trackRecord.short) add("track_record_too_short", trackRecord.finding, "Keep it running before scaling (validate_track_record).");
  // Nothing to fix and luck rejected: the next hurdles are bad markets and a real broker.
  if (!steps.length && headline && headline.p <= headline.level) add("stress_and_capacity_next", `p ${headline.p.toFixed(3)} <= ${headline.level}.`, "Run stress_test and check_feasibility before trading it.");
  return steps.slice(0, 5);
}
