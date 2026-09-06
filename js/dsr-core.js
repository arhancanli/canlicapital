// Pure deflated-Sharpe arithmetic. No DOM: shared by /tools/deflated-sharpe and the
// validation API so the two can never disagree. Bound to
// public/glassbox/deflated_sharpe_calculator_contract.json by checkGoldenVectors.
const EULER_MASCHERONI = 0.5772156649;

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial =
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
    t;
  return sign * (1 - polynomial * Math.exp(-x * x));
}

export function normalCdf(value) {
  if (value === Infinity) return 1;
  if (value === -Infinity) return 0;
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

export function normalPpf(probability) {
  if (!(probability > 0 && probability < 1)) {
    throw new RangeError("Normal quantile probability must be between zero and one");
  }

  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.38357751867269e2,
    -3.066479806614716e1,
    2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996,
    3.754408661907416,
  ];
  const low = 0.02425;
  const high = 1 - low;

  if (probability < low) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (probability <= high) {
    const q = probability - 0.5;
    const r = q * q;
    return (
      (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - probability));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

function requireFinite(name, value) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`);
}

export function calculateDsr(input) {
  const values = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, Number(value)]),
  );
  for (const [key, value] of Object.entries(values)) requireFinite(key, value);
  if (!Number.isInteger(values.observations) || values.observations < 2) {
    throw new RangeError("Return observations must be an integer of at least 2");
  }
  if (!(values.periods_per_year > 0)) {
    throw new RangeError("Periods per year must be greater than zero");
  }
  if (
    !Number.isInteger(values.effective_independent_trials) ||
    values.effective_independent_trials < 2
  ) {
    throw new RangeError("Effective independent trials must be an integer of at least 2");
  }
  if (values.cross_trial_sharpe_sd_annualized < 0) {
    throw new RangeError("Cross-trial Sharpe dispersion cannot be negative");
  }

  const annualizationScale = Math.sqrt(values.periods_per_year);
  const observedSharpePerPeriod = values.observed_sharpe_annualized / annualizationScale;
  const trialSdPerPeriod = values.cross_trial_sharpe_sd_annualized / annualizationScale;
  const trialVariancePerPeriod = trialSdPerPeriod ** 2;
  const nTrials = values.effective_independent_trials;
  const quantile =
    (1 - EULER_MASCHERONI) * normalPpf(1 - 1 / nTrials) +
    EULER_MASCHERONI * normalPpf(1 - 1 / (nTrials * Math.E));
  const expectedMaxSharpePerPeriod = trialSdPerPeriod * quantile;
  const nonNormalityVarianceTerm =
    1 -
    values.skew * observedSharpePerPeriod +
    ((values.non_excess_kurtosis - 1) / 4) * observedSharpePerPeriod ** 2;
  if (!(nonNormalityVarianceTerm > 0)) {
    throw new RangeError(
      "These skew, kurtosis and Sharpe inputs produce a non-positive estimator variance term",
    );
  }
  const denominator = Math.sqrt(nonNormalityVarianceTerm);
  const sampleScale = Math.sqrt(values.observations - 1);
  const psrZ = observedSharpePerPeriod * sampleScale / denominator;
  const dsrZ =
    (observedSharpePerPeriod - expectedMaxSharpePerPeriod) * sampleScale / denominator;

  return {
    observed_sharpe_per_period: observedSharpePerPeriod,
    cross_trial_sharpe_variance_per_period: trialVariancePerPeriod,
    expected_max_sharpe_per_period: expectedMaxSharpePerPeriod,
    expected_max_sharpe_annualized: expectedMaxSharpePerPeriod * annualizationScale,
    psr_against_zero: normalCdf(psrZ),
    deflated_sharpe_ratio: normalCdf(dsrZ),
    non_normality_variance_term: nonNormalityVarianceTerm,
    search_haircut_annualized:
      values.observed_sharpe_annualized - expectedMaxSharpePerPeriod * annualizationScale,
    psr_z_score: psrZ,
    dsr_z_score: dsrZ,
  };
}

export function checkGoldenVectors(vectors, tolerance = 8e-7) {
  const failures = [];
  for (const vector of vectors) {
    const observed = calculateDsr(vector.inputs);
    for (const [key, expected] of Object.entries(vector.outputs)) {
      const error = Math.abs(observed[key] - expected);
      if (error > tolerance) failures.push({ vector: vector.id, key, expected, observed: observed[key], error });
    }
  }
  return failures;
}

