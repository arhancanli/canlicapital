// js/moments-core.js
// Per-period moments of a return series, in the exact conventions of
// alphaforge.validation.dsr._per_period_moments: Sharpe with the SAMPLE standard
// deviation (ddof=1); skewness and kurtosis as the BIASED population moment
// estimators (scipy bias=True), kurtosis NON-excess (fisher=False). These are the
// Bailey-Lopez de Prado conventions the PSR/DSR formulas assume. Pinned to
// standards/validation-api/vectors.json.
import { calculateDsr } from "./dsr-core.js";

export function perPeriodMoments(returns) {
  if (!Array.isArray(returns)) throw new RangeError("returns must be an array of numbers");
  const x = returns.map(Number).filter((v) => Number.isFinite(v));
  const n = x.length;
  if (n < 2) throw new RangeError("need at least 2 finite return observations");
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of x) { sum += v; if (v < min) min = v; if (v > max) max = v; }
  if (max - min === 0) throw new RangeError("return series has zero variance; Sharpe is undefined");
  const mean = sum / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const v of x) {
    const d = v - mean;
    const d2 = d * d;
    m2 += d2; m3 += d2 * d; m4 += d2 * d2;
  }
  const sampleStd = Math.sqrt(m2 / (n - 1));
  if (sampleStd === 0) throw new RangeError("return series has zero variance; Sharpe is undefined");
  m2 /= n; m3 /= n; m4 /= n;
  return {
    sharpe_per_period: mean / sampleStd,
    skew: m3 / Math.pow(m2, 1.5),
    non_excess_kurtosis: m4 / (m2 * m2),
    observations: n,
  };
}

export function dsrFromReturns({ returns, periods_per_year, effective_independent_trials, cross_trial_sharpe_sd_annualized }) {
  const ppy = Number(periods_per_year);
  if (!(ppy > 0)) throw new RangeError("periods_per_year must be greater than zero");
  const m = perPeriodMoments(returns);
  const derived_inputs = {
    observed_sharpe_annualized: m.sharpe_per_period * Math.sqrt(ppy),
    observations: m.observations,
    periods_per_year: ppy,
    skew: m.skew,
    non_excess_kurtosis: m.non_excess_kurtosis,
    effective_independent_trials: Number(effective_independent_trials),
    cross_trial_sharpe_sd_annualized: Number(cross_trial_sharpe_sd_annualized),
  };
  return { derived_inputs, result: calculateDsr(derived_inputs) };
}
