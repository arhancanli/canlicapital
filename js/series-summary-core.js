// =============================================================================
// series-summary-core.js
// -----------------------------------------------------------------------------
// A long price or return series, read once and stated in about a hundred words an agent can reason
// over: growth, risk, drawdowns, trend, volatility regimes, tails, jumps and data problems.
//
// Pasting five years of daily bars into a model costs tens of thousands of tokens and the model
// still has to do this arithmetic itself, badly. Every figure below is computed here, by fixed
// rules stated next to it, so two calls on the same series return the same words.
//
// Conventions: simple returns; annualized volatility = sample sd x sqrt(periods per year); Sharpe
// with a zero benchmark; skew and kurtosis as biased population moments (the same estimators
// moments-core.js uses); jumps by the median absolute deviation, so the jumps themselves do not
// inflate the yardstick that finds them.
// =============================================================================

import { finiteNumbers } from "./moments-core.js";

export const SUMMARY_LIMITS = Object.freeze({ max_observations: 20000, min_observations: 30, vol_window: 21, jump_mad: 6, min_regime_periods: 10 });

const round = (x, digits = 4) => (Number.isFinite(x) ? Number(x.toFixed(digits)) : null);
const pct = (x, digits = 1) => `${x > 0 ? "+" : x < 0 ? "-" : ""}${Math.abs(x * 100).toFixed(digits)}%`;
const fmtInt = new Intl.NumberFormat("en-GB");

function quantileSorted(sorted, q) {
  if (!sorted.length) return Number.NaN;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

function median(values) {
  return quantileSorted([...values].sort((a, b) => a - b), 0.5);
}

function lagCorrelation(x, lag = 1) {
  const n = x.length - lag;
  if (n < 3) return null;
  let ma = 0; let mb = 0;
  for (let i = 0; i < n; i += 1) { ma += x[i]; mb += x[i + lag]; }
  ma /= n; mb /= n;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < n; i += 1) {
    const a = x[i] - ma; const b = x[i + lag] - mb;
    num += a * b; da += a * a; db += b * b;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : null;
}

/** Returns and an equity curve from prices or from returns, with labels for each period. */
export function readSeries({ prices, returns, dates }) {
  if ((prices === undefined) === (returns === undefined)) throw new RangeError("Send prices or returns, not both and not neither");
  let r;
  let level;
  if (prices !== undefined) {
    const p = finiteNumbers(prices, "prices");
    p.forEach((v, i) => { if (!(v > 0)) throw new RangeError(`prices[${i}] is ${v}; prices must be positive`); });
    if (p.length - 1 < SUMMARY_LIMITS.min_observations) throw new RangeError(`Send at least ${SUMMARY_LIMITS.min_observations + 1} prices`);
    if (p.length > SUMMARY_LIMITS.max_observations + 1) throw new RangeError(`At most ${SUMMARY_LIMITS.max_observations + 1} prices`);
    r = p.slice(1).map((v, i) => v / p[i] - 1);
    level = p;
  } else {
    r = finiteNumbers(returns, "returns");
    if (r.length < SUMMARY_LIMITS.min_observations) throw new RangeError(`Send at least ${SUMMARY_LIMITS.min_observations} returns`);
    if (r.length > SUMMARY_LIMITS.max_observations) throw new RangeError(`At most ${SUMMARY_LIMITS.max_observations} returns`);
    r.forEach((v, i) => { if (!(v > -1)) throw new RangeError(`returns[${i}] is ${v}; a return of -100% or worse ends the series`); });
    level = [1];
    for (const v of r) level.push(level.at(-1) * (1 + v));
  }
  const expected = level.length;
  const labels = Array.isArray(dates) && dates.length === expected ? dates.map(String)
    : Array.isArray(dates) && dates.length === r.length && returns !== undefined ? [null, ...dates.map(String)]
    : null;
  return { returns: r, level, labels };
}

// The worst peak-to-trough fall, when it started and bottomed, whether and when it recovered; the
// current distance from the high; and the longest stretch spent below a previous high.
export function drawdowns(level) {
  let peak = level[0]; let peakAt = 0;
  let worst = 0; let worstPeak = 0; let worstTrough = 0;
  let underSince = null; let longest = 0;
  for (let t = 1; t < level.length; t += 1) {
    if (level[t] >= peak) {
      if (underSince !== null) longest = Math.max(longest, t - underSince);
      underSince = null; peak = level[t]; peakAt = t;
    } else {
      if (underSince === null) underSince = peakAt;
      const dd = level[t] / peak - 1;
      if (dd < worst) { worst = dd; worstPeak = peakAt; worstTrough = t; }
    }
  }
  if (underSince !== null) longest = Math.max(longest, level.length - 1 - underSince);
  let recoveredAt = null;
  for (let t = worstTrough + 1; t < level.length && worst < 0; t += 1) {
    if (level[t] >= level[worstPeak]) { recoveredAt = t; break; }
  }
  return {
    max: worst, peakAt: worstPeak, troughAt: worstTrough, recoveredAt,
    current: level.at(-1) / Math.max(...level) - 1,
    longestUnderwater: longest,
  };
}

// Rolling volatility, labelled low / mid / high by the terciles of its own history, with runs
// shorter than min_regime_periods folded into the run before them so a one-day blip is not a regime.
export function volatilityRegimes(returns, periodsPerYear, window = SUMMARY_LIMITS.vol_window) {
  const n = returns.length;
  if (n < window * 2) return null;
  const vol = new Array(n).fill(Number.NaN);
  let s = 0; let sq = 0;
  for (let t = 0; t < n; t += 1) {
    s += returns[t]; sq += returns[t] * returns[t];
    if (t >= window) { s -= returns[t - window]; sq -= returns[t - window] * returns[t - window]; }
    if (t >= window - 1) vol[t] = Math.sqrt(Math.max(0, (sq - (s * s) / window) / (window - 1)) * periodsPerYear);
  }
  const known = vol.filter(Number.isFinite);
  const sorted = [...known].sort((a, b) => a - b);
  const lowCut = quantileSorted(sorted, 1 / 3);
  const highCut = quantileSorted(sorted, 2 / 3);
  const label = (v) => (v <= lowCut ? "low" : v >= highCut ? "high" : "mid");
  const runs = [];
  for (let t = window - 1; t < n; t += 1) {
    const l = label(vol[t]);
    if (runs.length && runs.at(-1).level === l) { runs.at(-1).to = t; runs.at(-1).sum += vol[t]; runs.at(-1).count += 1; }
    else runs.push({ level: l, from: t, to: t, sum: vol[t], count: 1 });
  }
  const merged = [];
  for (const run of runs) {
    const prev = merged.at(-1);
    if (prev && (run.count < SUMMARY_LIMITS.min_regime_periods || prev.level === run.level)) {
      prev.to = run.to; prev.sum += run.sum; prev.count += run.count;
    } else merged.push({ ...run });
  }
  const current = vol[n - 1];
  const percentile = sorted.filter((v) => v <= current).length / sorted.length;
  return { window, current, percentile, cuts: [lowCut, highCut], runs: merged };
}

export function jumps(returns, threshold = SUMMARY_LIMITS.jump_mad) {
  const med = median(returns);
  const mad = median(returns.map((r) => Math.abs(r - med))) * 1.4826;
  if (!(mad > 0)) return { mad: 0, found: [] };
  const found = returns
    .map((r, i) => ({ i, r, z: (r - med) / mad }))
    .filter((j) => Math.abs(j.z) > threshold)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return { mad, found };
}

export function summarizeSeries({ prices, returns, dates, periods_per_year: ppyInput = 252, benchmark_returns: benchmark, name }) {
  const ppy = Number(ppyInput);
  if (!(ppy > 0)) throw new RangeError("periods_per_year must be above 0");
  const { returns: r, level, labels } = readSeries({ prices, returns, dates });
  const n = r.length;
  // Period t's return ends at level index t + 1.
  const at = (levelIndex) => (labels ? labels[levelIndex] : `#${levelIndex}`);
  const mean = r.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  let m2 = 0; let m3 = 0; let m4 = 0;
  for (const v of r) { const d = v - mean; m2 += d * d; m3 += d ** 3; m4 += d ** 4; }
  m2 /= n; m3 /= n; m4 /= n;
  const total = level.at(-1) / level[0] - 1;
  const years = n / ppy;
  const cagr = (1 + total) ** (1 / years) - 1;
  const dd = drawdowns(level);
  const regimes = volatilityRegimes(r, ppy);
  const jumpRead = jumps(r);
  const order = r.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const trailing = (k) => (n >= k ? level.at(-1) / level.at(-1 - k) - 1 : null);
  const smaWindow = Math.round(ppy * 200 / 252);
  const sma = level.length >= smaWindow ? level.slice(-smaWindow).reduce((a, b) => a + b, 0) / smaWindow : null;
  let staleRun = 0; let run = 0;
  for (const v of r) { run = v === 0 ? run + 1 : 0; staleRun = Math.max(staleRun, run); }
  const zeroShare = r.filter((v) => v === 0).length / n;

  let bench = null;
  if (benchmark !== undefined) {
    const b = finiteNumbers(benchmark, "benchmark_returns");
    if (b.length !== n) throw new RangeError(`benchmark_returns has ${b.length} values for ${n} returns`);
    const mb = b.reduce((x, y) => x + y, 0) / n;
    let cov = 0; let vb = 0; let va = 0;
    for (let i = 0; i < n; i += 1) { cov += (r[i] - mean) * (b[i] - mb); vb += (b[i] - mb) ** 2; va += (r[i] - mean) ** 2; }
    bench = { correlation: vb > 0 && va > 0 ? cov / Math.sqrt(va * vb) : null, beta: vb > 0 ? cov / vb : null };
  }

  const out = {
    schema: "canli.series-summary.v1",
    observations: n,
    periods_per_year: ppy,
    span: { first: labels ? (labels[0] ?? labels[1]) : at(0), last: at(n), years: round(years, 2) },
    growth: { total_return: round(total), cagr: round(cagr) },
    risk: {
      annual_volatility: round(sd * Math.sqrt(ppy)),
      sharpe: sd > 0 ? round((mean / sd) * Math.sqrt(ppy), 3) : null,
      drift_t_stat: sd > 0 ? round(mean / (sd / Math.sqrt(n)), 2) : null,
    },
    drawdown: {
      max: round(dd.max),
      peak: at(dd.peakAt),
      trough: at(dd.troughAt),
      recovered: dd.recoveredAt !== null ? at(dd.recoveredAt) : null,
      periods_to_recover: dd.recoveredAt !== null ? dd.recoveredAt - dd.troughAt : null,
      current: round(dd.current),
      longest_underwater_periods: dd.longestUnderwater,
    },
    trend: {
      last_quarter: round(trailing(Math.round(ppy / 4))),
      last_year: round(trailing(Math.round(ppy))),
      above_200_period_average: sma !== null ? level.at(-1) > sma : null,
    },
    volatility: regimes ? {
      window: regimes.window,
      current: round(regimes.current),
      percentile: round(regimes.percentile, 2),
      regime: regimes.runs.at(-1).level,
      regime_since: at(regimes.runs.at(-1).from + 1),
      tercile_cuts: regimes.cuts.map((c) => round(c)),
      // A change is a run that starts inside the last year, other than the first run of the series.
      changes_last_year: regimes.runs.slice(1).filter((x) => x.from + 1 > n - ppy).length,
      recent: regimes.runs.slice(-4).map((x) => ({ level: x.level, from: at(x.from + 1), to: at(x.to + 1), average: round(x.sum / x.count) })),
    } : null,
    tails: {
      skew: round(m3 / m2 ** 1.5, 3),
      excess_kurtosis: round(m4 / (m2 * m2) - 3, 3),
      worst: order.slice(0, 3).map(([v, i]) => ({ period: at(i + 1), return: round(v) })),
      best: order.slice(-3).reverse().map(([v, i]) => ({ period: at(i + 1), return: round(v) })),
    },
    jumps: {
      rule: `|return - median| above ${SUMMARY_LIMITS.jump_mad} x 1.4826 x median absolute deviation`,
      count: jumpRead.found.length,
      largest: jumpRead.found.slice(0, 5).map((j) => ({ period: at(j.i + 1), return: round(j.r), robust_z: round(j.z, 1) })),
    },
    dependence: { autocorrelation_lag1: round(lagCorrelation(r), 3), abs_return_autocorrelation_lag1: round(lagCorrelation(r.map(Math.abs)), 3) },
    data_quality: { zero_return_share: round(zeroShare, 3), longest_run_of_zero_returns: staleRun },
    ...(bench ? { benchmark: { correlation: round(bench.correlation, 3), beta: round(bench.beta, 3) } } : {}),
  };
  out.text = summaryText(out, name);
  return out;
}

export function summaryText(s, name) {
  const unit = s.periods_per_year === 252 ? "daily" : s.periods_per_year === 365 ? "daily (365)" : s.periods_per_year === 52 ? "weekly" : s.periods_per_year === 12 ? "monthly" : `${s.periods_per_year}/yr`;
  const parts = [];
  parts.push(`${name ? `${name}: ` : ""}${fmtInt.format(s.observations)} ${unit} returns, ${s.span.first} to ${s.span.last} (${s.span.years} yr).`);
  parts.push(`CAGR ${pct(s.growth.cagr)}, vol ${pct(s.risk.annual_volatility).replace("+", "")}, Sharpe ${s.risk.sharpe ?? "n/a"} (drift t ${s.risk.drift_t_stat ?? "n/a"}).`);
  const d = s.drawdown;
  parts.push(`Max drawdown ${pct(d.max)} (${d.peak} to ${d.trough}, ${d.recovered ? `recovered ${d.recovered}, ${d.periods_to_recover} periods later` : "not recovered"}); now ${pct(d.current)} from the high.`);
  const t = s.trend;
  const trendBits = [t.last_quarter !== null ? `last quarter ${pct(t.last_quarter)}` : null, t.last_year !== null ? `last year ${pct(t.last_year)}` : null, t.above_200_period_average === null ? null : `${t.above_200_period_average ? "above" : "below"} its 200-period average`].filter(Boolean);
  if (trendBits.length) parts.push(`${trendBits.join(", ")}.`.replace(/^./, (c) => c.toUpperCase()));
  if (s.volatility) parts.push(`Vol now ${pct(s.volatility.current).replace("+", "")} (${Math.round(s.volatility.percentile * 100)}th percentile, ${s.volatility.regime} regime since ${s.volatility.regime_since}).`);
  parts.push(`Skew ${s.tails.skew}, excess kurtosis ${s.tails.excess_kurtosis}; worst ${pct(s.tails.worst[0].return)} (${s.tails.worst[0].period}), best ${pct(s.tails.best[0].return)} (${s.tails.best[0].period}).`);
  if (s.jumps.count) parts.push(`${s.jumps.count} jump${s.jumps.count === 1 ? "" : "s"} beyond ${SUMMARY_LIMITS.jump_mad} robust sd.`);
  const ac = s.dependence;
  if (ac.autocorrelation_lag1 !== null) parts.push(`Lag-1 autocorrelation ${ac.autocorrelation_lag1}${ac.abs_return_autocorrelation_lag1 !== null && ac.abs_return_autocorrelation_lag1 > 0.1 ? `; volatility clusters (|r| ${ac.abs_return_autocorrelation_lag1})` : ""}.`);
  if (s.data_quality.longest_run_of_zero_returns >= 5) parts.push(`Data check: ${s.data_quality.longest_run_of_zero_returns} unchanged periods in a row (stale prices?).`);
  if (s.benchmark) parts.push(`Against the benchmark: correlation ${s.benchmark.correlation}, beta ${s.benchmark.beta}.`);
  return parts.join(" ");
}

export const SUMMARY_LIMITS_TEXT = Object.freeze([
  "A description of the series exactly as supplied, by fixed rules stated in each field; it does not check the data source, splits, dividends or survivorship.",
  "Regimes are terciles of this series' own rolling volatility, not a market-wide classification.",
  "Nothing here is a forecast or advice.",
]);
