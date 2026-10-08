// Statistics and econometrics on return and price series: regressions with robust standard errors,
// unit-root and stationarity tests (ADF, KPSS, variance ratio), Engle-Granger cointegration,
// mean-reversion fits, GARCH(1,1), EWMA and range-based volatility, Probabilistic and Deflated Sharpe,
// PCA, Granger causality, ARCH effects and tests on means and Sharpe ratios.
//
// Statistics and p-values follow statsmodels and arch exactly where they define them (MacKinnon
// p-values and critical values, KPSS lag rule and table, HAC and HC1 covariances).
import { z } from "zod";

import { chi2Sf, fSf, leastSquares, mean, moments, nelderMead, normCdf, normInv, std, sum, symmetricEigen, tCdf, tPValue, variance } from "../math.mjs";
import { MAX_SERIES, ppyArg, seriesFields, seriesFrom } from "../inputs.mjs";

const series = (what) => z.array(z.number()).min(10).max(MAX_SERIES).describe(what);
const matrixArg = (what) => z.array(z.array(z.number()).min(1).max(50)).min(5).max(MAX_SERIES).describe(what);
const lagsArg = z.number().int().min(0).max(500).optional();

// ---------------------------------------------------------------------------------------------
// MacKinnon (1994) p-values and (2010) critical values, as statsmodels tabulates them
// ---------------------------------------------------------------------------------------------
const MK = {
  n: { star: [-1.04, -1.53, -2.68, -3.09], min: [-19.04, -19.62, -21.21, -23.25], max: [Infinity, 1.51, 0.86, 0.88],
    small: [[0.6344, 1.2378, 3.2496], [1.9129, 1.3857, 3.5322], [2.7648, 1.4502, 3.4186], [3.4336, 1.4835, 3.19]],
    large: [[0.4797, 9.3557, -0.6999, 3.3066], [1.5578, 8.558, -2.083, -3.3549], [2.2268, 6.8093, -3.2362, -5.4448], [2.7654, 6.4502, -3.0811, -4.4946]] },
  c: { star: [-1.61, -2.62, -3.13, -3.47], min: [-18.83, -18.86, -23.48, -28.07], max: [2.74, 0.92, 0.55, 0.61],
    small: [[2.1659, 1.4412, 3.8269], [2.92, 1.5012, 3.9796], [3.4699, 1.4856, 3.164], [3.9673, 1.4777, 2.6315]],
    large: [[1.7339, 9.3202, -1.2745, -1.0368], [2.1945, 6.4695, -2.9198, -4.2377], [2.5893, 4.5168, -3.6529, -5.0074], [3.0387, 4.5452, -3.3666, -4.1921]] },
  ct: { star: [-2.89, -3.19, -3.5, -3.65], min: [-16.18, -21.15, -25.37, -26.63], max: [0.7, 0.63, 0.71, 0.93],
    small: [[3.2512, 1.6047, 4.9588], [3.6646, 1.5419, 3.6448], [4.0983, 1.5173, 2.9898], [4.5844, 1.5338, 2.8796]],
    large: [[2.5261, 6.1654, -3.7956, -6.0285], [2.85, 5.272, -3.6622, -5.1695], [3.221, 5.255, -3.2685, -4.1501], [3.652, 5.9758, -2.7483, -3.2081]] },
};
const CRIT2010 = {
  n: [[[-2.56574, -2.2358, -3.627, 0], [-1.941, -0.2686, -3.365, 31.223], [-1.61682, 0.2656, -2.714, 25.364]]],
  c: [
    [[-3.43035, -6.5393, -16.786, -79.433], [-2.86154, -2.8903, -4.234, -40.04], [-2.56677, -1.5384, -2.809, 0]],
    [[-3.89644, -10.9519, -33.527, 0], [-3.33613, -6.1101, -6.823, 0], [-3.04445, -4.2412, -2.72, 0]],
    [[-4.29374, -14.4354, -33.195, 47.433], [-3.74066, -8.5632, -10.852, 27.982], [-3.45218, -6.2143, -3.718, 0]],
    [[-4.64332, -18.1031, -37.972, 0], [-4.096, -11.2349, -11.175, 0], [-3.8102, -8.3931, -4.137, 0]],
  ],
  ct: [
    [[-3.95877, -9.0531, -28.428, -134.155], [-3.41049, -4.3904, -9.036, -45.374], [-3.12705, -2.5856, -3.925, -22.38]],
    [[-4.32762, -15.4387, -35.679, 0], [-3.78057, -9.5106, -12.074, 0], [-3.49631, -7.0815, -7.538, 21.892]],
    [[-4.66305, -18.7688, -49.793, 104.244], [-4.1189, -11.8922, -19.031, 77.332], [-3.83511, -9.0723, -8.504, 35.403]],
    [[-4.9694, -22.4694, -52.599, 51.314], [-4.42871, -14.5876, -18.228, 39.647], [-4.14633, -11.25, -9.873, 54.109]],
  ],
};
const poly = (c, x) => c.reduce((s, v, i) => s + v * x ** i, 0);
export function mackinnonP(stat, reg, N = 1) {
  const t = MK[reg];
  if (stat > t.max[N - 1]) return 1;
  if (stat < t.min[N - 1]) return 0;
  const c = stat <= t.star[N - 1] ? t.small[N - 1].map((v, i) => v * [1, 1, 1e-2][i]) : t.large[N - 1].map((v, i) => v * [1, 1e-1, 1e-1, 1e-2][i]);
  return normCdf(poly(c, stat));
}
export function mackinnonCrit(reg, N, nobs) {
  const rows = CRIT2010[reg][N - 1];
  if (!rows) return undefined;
  const [p1, p5, p10] = rows.map((c) => poly(c, 1 / nobs));
  return { "1%": p1, "5%": p5, "10%": p10 };
}

// ---------------------------------------------------------------------------------------------
// Regression helpers
// ---------------------------------------------------------------------------------------------
function ols(X, y) {
  const n = X.length, k = X[0].length, { coef, resid, xtxInv } = leastSquares(X, y);
  const ssr = resid.reduce((s, e) => s + e * e, 0), s2 = ssr / (n - k);
  const llf = -n / 2 * (Math.log(2 * Math.PI) + Math.log(ssr / n) + 1);
  return { coef, resid, xtxInv, ssr, s2, n, k, llf, aic: -2 * llf + 2 * k, se: xtxInv.map((r, i) => Math.sqrt(s2 * r[i])) };
}

// Robust covariance as statsmodels computes it: HC1 (with the n/(n-k) factor) or Newey-West
// (Bartlett kernel, no small-sample factor).
function robustCov(X, fit, lags) {
  const { n, k, resid, xtxInv } = fit, S = Array.from({ length: k }, () => new Array(k).fill(0));
  const u = X.map((row, t) => row.map((v) => v * resid[t]));
  for (let t = 0; t < n; t++) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) S[i][j] += u[t][i] * u[t][j];
  for (let l = 1; l <= (lags ?? 0); l++) {
    const w = 1 - l / (lags + 1);
    for (let t = l; t < n; t++) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) S[i][j] += w * (u[t][i] * u[t - l][j] + u[t - l][i] * u[t][j]);
  }
  const A = xtxInv, tmp = A.map((r) => S[0].map((_, j) => r.reduce((s, v, m) => s + v * S[m][j], 0)));
  return tmp.map((r) => A[0].map((_, j) => r.reduce((s, v, m) => s + v * A[m][j], 0) * (lags ? 1 : n / (n - k))));
}

export function regressionReport(X, y, names, { covType = "classical", lags } = {}) {
  const fit = ols(X, y), my = mean(y), sst = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const hasConst = X.every((r) => r[0] === 1);
  const r2 = hasConst ? 1 - fit.ssr / sst : 1 - fit.ssr / y.reduce((s, v) => s + v * v, 0);
  const dfm = fit.k - (hasConst ? 1 : 0), dfr = fit.n - fit.k;
  let se, p;
  if (covType === "classical") { se = fit.se; p = fit.coef.map((b, i) => tPValue(b / se[i], dfr)); }
  else { const V = robustCov(X, fit, covType === "hac" ? lags : 0); se = V.map((r, i) => Math.sqrt(r[i])); p = fit.coef.map((b, i) => 2 * (1 - normCdf(Math.abs(b / se[i])))); }
  const f = dfm > 0 ? ((sst - fit.ssr) / dfm) / (fit.ssr / dfr) : undefined;
  return {
    columns: ["term", "coef", "std_error", "t", "p_value"],
    rows: names.map((nm, i) => [nm, fit.coef[i], se[i], fit.coef[i] / se[i], p[i]]),
    r_squared: r2, adj_r_squared: 1 - (1 - r2) * (fit.n - (hasConst ? 1 : 0)) / dfr, f_stat_classical: f, f_p_value: f === undefined ? undefined : fSf(f, dfm, dfr),
    nobs: fit.n, residual_std: Math.sqrt(fit.s2), aic: fit.aic, standard_errors: covType === "hac" ? `Newey-West HAC, ${lags} lags, Bartlett kernel; normal p-values` : covType === "hc1" ? "HC1 heteroskedasticity-robust; normal p-values" : "classical OLS; t p-values",
  };
}

function columnsOf(M, label) {
  const k = M[0].length;
  M.forEach((r, i) => { if (r.length !== k) throw new Error(`${label} row ${i} has ${r.length} columns; row 0 has ${k}.`); });
  return Array.from({ length: k }, (_, j) => M.map((r) => r[j]));
}

// ---------------------------------------------------------------------------------------------
// Unit roots
// ---------------------------------------------------------------------------------------------
const trendCols = (reg, t) => (reg === "n" ? [] : reg === "c" ? [1] : [1, t + 1]);

function adf(x, { regression = "c", maxlag, autolag = true }) {
  const nobs0 = x.length, ntrend = regression === "n" ? 0 : regression.length;
  if (Math.max(...x) === Math.min(...x)) throw new Error("The series is constant.");
  let ml = maxlag;
  if (ml === undefined) { ml = Math.min(Math.floor(nobs0 / 2) - ntrend - 1, Math.ceil(12 * (nobs0 / 100) ** 0.25)); if (ml < 0) throw new Error("Series too short for this regression."); }
  else if (ml > Math.floor(nobs0 / 2) - ntrend - 1) throw new Error(`maxlag must be below ${Math.floor(nobs0 / 2) - ntrend - 1} for ${nobs0} observations.`);
  const dx = x.slice(1).map((v, i) => v - x[i]);
  const design = (lag, use) => {
    // Rows t = lag .. len(dx)-1: [level x_t, dx_{t-1} .. dx_{t-lag}], keeping the last `use` rows.
    const rows = [], ys = [];
    for (let t = lag; t < dx.length; t++) { const r = [x[t]]; for (let j = 1; j <= use; j++) r.push(dx[t - j]); rows.push(r); ys.push(dx[t]); }
    return { rows, ys };
  };
  let lag = ml;
  if (autolag) {
    const { rows, ys } = design(ml, ml);
    let best = Infinity, bestLag = 0;
    for (let L = 0; L <= ml; L++) {
      // statsmodels compares lags on one sample, trend first with time index 1..n.
      const a = ols(rows.map((r, t) => [...trendCols(regression, t), ...r.slice(0, L + 1)]), ys).aic;
      if (a < best) { best = a; bestLag = L; }
    }
    lag = bestLag;
  }
  const { rows, ys } = design(lag, lag), n = rows.length;
  const X = rows.map((r, t) => [...r, ...trendCols(regression, t)]);
  const fit = ols(X, ys), stat = fit.coef[0] / fit.se[0];
  return { stat, lag, nobs: n, p: mackinnonP(stat, regression, 1), crit: mackinnonCrit(regression, 1, n), ar_coefficient: 1 + fit.coef[0] };
}

function kpss(x, { regression = "c", lags }) {
  const n = x.length;
  let resid;
  if (regression === "ct") resid = ols(x.map((_, t) => [1, t + 1]), x).resid;
  else { const m = mean(x); resid = x.map((v) => v - m); }
  let L = lags;
  if (L === undefined) {
    const covlags = Math.floor(n ** (2 / 9));
    let s0 = resid.reduce((s, e) => s + e * e, 0) / n, s1 = 0;
    for (let i = 1; i <= covlags; i++) { let p = 0; for (let t = i; t < n; t++) p += resid[t] * resid[t - i]; p /= n / 2; s0 += p; s1 += i * p; }
    const sh = s1 / s0;
    L = Math.min(Math.floor(1.1447 * (sh * sh) ** (1 / 3) * n ** (1 / 3)), n - 1);
  }
  let cs = 0, eta = 0;
  for (const e of resid) { cs += e; eta += cs * cs; }
  eta /= n * n;
  let sh = resid.reduce((s, e) => s + e * e, 0);
  for (let i = 1; i <= L; i++) { let p = 0; for (let t = i; t < n; t++) p += resid[t] * resid[t - i]; sh += 2 * p * (1 - i / (L + 1)); }
  sh /= n;
  const stat = eta / sh, crit = regression === "ct" ? [0.119, 0.146, 0.176, 0.216] : [0.347, 0.463, 0.574, 0.739], pv = [0.1, 0.05, 0.025, 0.01];
  let p;
  if (stat <= crit[0]) p = pv[0]; else if (stat >= crit[3]) p = pv[3];
  else { let i = 0; while (stat > crit[i + 1]) i++; p = pv[i] + (stat - crit[i]) / (crit[i + 1] - crit[i]) * (pv[i + 1] - pv[i]); }
  return { stat, p, lags: L, crit: { "10%": crit[0], "5%": crit[1], "2.5%": crit[2], "1%": crit[3] }, p_value_bounded: stat <= crit[0] || stat >= crit[3] };
}

function varianceRatio(logp, q, robust = true) {
  const n = logp.length, mu = (logp[n - 1] - logp[0]) / (n - 1), dy = logp.slice(1).map((v, i) => v - logp[i]), nq = dy.length;
  let s1 = dy.reduce((s, v) => s + (v - mu) ** 2, 0) / nq, sq = 0;
  for (let t = q; t < n; t++) sq += (logp[t] - logp[t - q] - q * mu) ** 2;
  sq /= nq * q;
  s1 *= nq / (nq - 1);
  sq *= (nq * q) / (q * (nq - q + 1) * (1 - q / nq));
  let v;
  if (!robust) v = (2 * (2 * q - 1) * (q - 1)) / (3 * q);
  else {
    const z2 = dy.map((d) => (d - mu) ** 2), scale = sum(z2) ** 2;
    v = 0;
    for (let k = 1; k < q; k++) { let s = 0; for (let t = k; t < nq; t++) s += z2[t] * z2[t - k]; v += 4 * (1 - k / q) ** 2 * nq * s / scale; }
  }
  const vr = sq / s1, stat = Math.sqrt(nq) * (vr - 1) / Math.sqrt(v);
  return { variance_ratio: vr, z_stat: stat, p_value: 2 - 2 * normCdf(Math.abs(stat)) };
}

// GARCH(1,1) with a constant mean and Gaussian likelihood. The initial variance is arch's backcast:
// an EWMA (0.94) of the first 75 squared deviations from the sample mean, fixed during the fit.
function backcastOf(r) {
  const m = mean(r), tau = Math.min(75, r.length);
  let wsum = 0, bc = 0;
  for (let i = 0; i < tau; i++) { const w = 0.94 ** i; wsum += w; bc += w * (r[i] - m) ** 2; }
  return bc / wsum;
}

function garchLoglik(r, [mu, omega, alpha, beta], bc = backcastOf(r)) {
  const n = r.length;
  let s2 = omega + (alpha + beta) * bc, ll = 0, prevE2 = 0;
  const path = new Array(n);
  for (let t = 0; t < n; t++) {
    if (t > 0) s2 = omega + alpha * prevE2 + beta * s2;
    const e = r[t] - mu;
    ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(s2) + e * e / s2);
    prevE2 = e * e; path[t] = s2;
  }
  return { ll, path };
}

function garchFit(r) {
  const sd = std(r), m0 = mean(r), x = r.map((v) => v / sd);
  const unpack = (p) => { const e1 = Math.exp(p[2]), e2 = Math.exp(p[3]), d = 1 + e1 + e2; return [p[0], Math.exp(p[1]), e1 / d, e2 / d]; };
  const bc = backcastOf(x);
  const obj = (p) => { const th = unpack(p); const v = -garchLoglik(x, th, bc).ll; return Number.isFinite(v) ? v : 1e100; };
  // Start near typical daily-return estimates: alpha 0.08, beta 0.9.
  const a0 = 0.08, b0 = 0.9, rest = 1 - a0 - b0;
  const start = [m0 / sd, Math.log(0.02), Math.log(a0 / rest), Math.log(b0 / rest)];
  const fit = nelderMead(obj, start, { step: 0.5, tol: 1e-15, maxIter: 40000 });
  const [mu, om, al, be] = unpack(fit.x);
  const theta = [mu * sd, om * sd * sd, al, be];
  const { ll, path } = garchLoglik(r, theta);
  return { mu: theta[0], omega: theta[1], alpha: al, beta: be, persistence: al + be, loglik: ll, path };
}

function trialSharpeStats(r) {
  const n = r.length, sr = mean(r) / std(r), m = moments(r);
  return { n, sr, skew: m.skew, kurt: m.excess_kurtosis + 3 };
}
const psr = ({ n, sr, skew, kurt }, srStar) => normCdf((sr - srStar) * Math.sqrt(n - 1) / Math.sqrt(1 - skew * sr + (kurt - 1) / 4 * sr * sr));
const EULER = 0.5772156649015329;

export const TOOLS = [
  {
    name: "linear_regression",
    title: "Linear regression with robust errors",
    description: "Fit ordinary least squares of y on several regressors with classical, heteroskedasticity-robust (HC1) or Newey-West HAC standard errors, R-squared, F-test and AIC.",
    keywords: "linear regression ols least squares newey west hac robust standard errors hc1 multivariate r squared",
    input: z.object({
      y: series("Dependent variable."),
      x: matrixArg("Regressors, one row per observation, one column per variable."),
      names: z.array(z.string().max(60)).max(50).optional().describe("Regressor names."),
      constant: z.boolean().optional().describe("Add an intercept; default true."),
      standard_errors: z.enum(["classical", "hc1", "hac"]).optional().describe("Default classical."),
      lags: lagsArg.describe("HAC lags; default floor(4 (n/100)^(2/9))."),
    }).strict(),
    run(a) {
      if (a.x.length !== a.y.length) throw new Error(`y has ${a.y.length} rows and x ${a.x.length}.`);
      const k = a.x[0].length, c = a.constant ?? true;
      const X = a.x.map((r) => (c ? [1, ...r] : [...r]));
      const names = [...(c ? ["const"] : []), ...(a.names ?? Array.from({ length: k }, (_, i) => `x${i + 1}`))];
      const lags = a.lags ?? Math.floor(4 * (a.y.length / 100) ** (2 / 9));
      return regressionReport(X, a.y, names, { covType: a.standard_errors ?? "classical", lags });
    },
  },
  {
    name: "factor_regression",
    title: "Factor model regression (alpha and betas)",
    description: "Regress a strategy's excess returns on factor returns (e.g. Fama-French market, size, value, momentum) with Newey-West errors: annualized alpha, its t-stat, factor betas and R-squared.",
    keywords: "factor model fama french carhart alpha betas exposures attribution newey west market smb hml momentum",
    input: z.object({
      returns: series("Strategy excess returns per period."),
      factors: matrixArg("Factor returns per period, one column per factor."),
      factor_names: z.array(z.string().max(60)).max(50).optional().describe("Names, e.g. [\"mkt_rf\", \"smb\", \"hml\"]."),
      periods_per_year: ppyArg,
      lags: lagsArg.describe("Newey-West lags; default floor(4 (n/100)^(2/9))."),
    }).strict(),
    run(a) {
      if (a.factors.length !== a.returns.length) throw new Error(`returns has ${a.returns.length} rows and factors ${a.factors.length}.`);
      const ppy = a.periods_per_year ?? 252, k = a.factors[0].length, lags = a.lags ?? Math.floor(4 * (a.returns.length / 100) ** (2 / 9));
      const names = ["alpha", ...(a.factor_names ?? Array.from({ length: k }, (_, i) => `factor_${i + 1}`))];
      const rep = regressionReport(a.factors.map((r) => [1, ...r]), a.returns, names, { covType: "hac", lags });
      return { alpha_annual: rep.rows[0][1] * ppy, alpha_t: rep.rows[0][3], alpha_p_value: rep.rows[0][4], ...rep };
    },
  },
  {
    name: "adf_test",
    title: "Augmented Dickey-Fuller unit root test",
    description: "Test a price, spread or rate series for a unit root (non-stationarity) with the Augmented Dickey-Fuller test: statistic, MacKinnon p-value, critical values and the AIC-chosen lag.",
    keywords: "stationary stationarity adf augmented dickey fuller unit root stationarity test mean reversion random walk",
    input: z.object({
      series: series("The series in levels (e.g. log prices or a spread)."),
      regression: z.enum(["c", "ct", "n"]).optional().describe("Deterministic terms: c constant (default), ct constant and trend, n none."),
      max_lag: lagsArg.describe("Largest lag tried; default 12 (n/100)^(1/4)."),
      autolag: z.boolean().optional().describe("Pick the lag by AIC; default true. False uses max_lag."),
    }).strict(),
    run(a) {
      const r = adf(a.series, { regression: a.regression ?? "c", maxlag: a.max_lag, autolag: a.autolag ?? true });
      return { adf_stat: r.stat, p_value: r.p, used_lag: r.lag, nobs: r.nobs, critical_values: r.crit, ar_coefficient: r.ar_coefficient, reading: r.p < 0.05 ? "Unit root rejected at 5%: consistent with stationarity." : "Unit root not rejected at 5%." };
    },
  },
  {
    name: "kpss_test",
    title: "KPSS stationarity test",
    description: "Test the null that a series is level- or trend-stationary with the KPSS test (Hobijn lag rule), complementing ADF; p-values are table-interpolated within 0.01-0.10.",
    keywords: "kpss stationarity test level trend stationary unit root complement",
    input: z.object({ series: series("The series in levels."), regression: z.enum(["c", "ct"]).optional().describe("c level (default) or ct trend stationarity."), lags: lagsArg.describe("Bandwidth; default automatic (Hobijn et al. 1998).") }).strict(),
    run(a) { const r = kpss(a.series, { regression: a.regression ?? "c", lags: a.lags }); return { kpss_stat: r.stat, p_value: r.p, lags: r.lags, critical_values: r.crit, p_value_at_table_bound: r.p_value_bounded }; },
  },
  {
    name: "variance_ratio_test",
    title: "Lo-MacKinlay variance ratio test",
    description: "Test the random-walk hypothesis on prices with the Lo-MacKinlay variance ratio at one or more horizons (overlapping, de-biased, heteroskedasticity-robust): above 1 means trending, below 1 mean-reverting.",
    keywords: "variance ratio test lo mackinlay random walk efficient market mean reversion momentum horizon",
    input: z.object({
      prices: z.array(z.number().positive()).min(20).max(MAX_SERIES).describe("Prices oldest first (logs are taken)."),
      horizons: z.array(z.number().int().min(2).max(1000)).min(1).max(20).optional().describe("Horizons q; default [2, 4, 8, 16]."),
      robust: z.boolean().optional().describe("Heteroskedasticity-robust z; default true."),
    }).strict(),
    run(a) {
      const lp = a.prices.map(Math.log), hs = a.horizons ?? [2, 4, 8, 16];
      return { columns: ["horizon", "variance_ratio", "z_stat", "p_value"], rows: hs.map((q) => { if (q >= lp.length / 2) throw new Error(`horizon ${q} is too long for ${lp.length} prices.`); const v = varianceRatio(lp, q, a.robust ?? true); return [q, v.variance_ratio, v.z_stat, v.p_value]; }) };
    },
  },
  {
    name: "cointegration_test",
    title: "Engle-Granger cointegration test",
    description: "Test whether two or more price series are cointegrated (Engle-Granger): hedge ratios, ADF on the residual spread with MacKinnon p-value and critical values, and the spread's half-life.",
    keywords: "cointegration engle granger pairs trading hedge ratio spread stationarity statistical arbitrage",
    input: z.object({
      y: series("The dependent series (e.g. log price of asset A)."),
      x: z.array(series("Another series.")).min(1).max(3).describe("One to three other series (e.g. [log price of asset B])."),
      trend: z.enum(["c", "ct"]).optional().describe("c constant (default) or ct constant and trend in the cointegrating regression."),
      max_lag: lagsArg.describe("Largest ADF lag; default 12 (n/100)^(1/4)."),
    }).strict(),
    run(a) {
      const n = a.y.length, tr = a.trend ?? "c";
      a.x.forEach((s, i) => { if (s.length !== n) throw new Error(`x[${i}] has ${s.length} points and y ${n}.`); });
      const X = a.y.map((_, t) => [...a.x.map((s) => s[t]), 1, ...(tr === "ct" ? [t + 1] : [])]);
      const fit = ols(X, a.y), N = a.x.length + 1;
      const r = adf(fit.resid, { regression: "n", maxlag: a.max_lag, autolag: true });
      const hl = ols(fit.resid.slice(0, -1).map((v) => [1, v]), fit.resid.slice(1).map((v, i) => v - fit.resid[i])).coef[1];
      return { hedge_ratios: fit.coef.slice(0, a.x.length), intercept: fit.coef[a.x.length], adf_stat: r.stat, p_value: mackinnonP(r.stat, tr, N), critical_values: mackinnonCrit(tr, N, n - 1), used_lag: r.lag, spread_half_life: hl < 0 ? -Math.log(2) / Math.log(1 + hl) : null, spread_std: std(fit.resid) };
    },
  },
  {
    name: "mean_reversion_fit",
    title: "Mean reversion (Ornstein-Uhlenbeck) fit",
    description: "Fit an AR(1) / Ornstein-Uhlenbeck model to a spread or price series: half-life, mean, speed of reversion, equilibrium volatility and the current z-score.",
    keywords: "mean reversion half life ornstein uhlenbeck ou process ar1 spread z score speed",
    input: z.object({ series: series("The series (spread, log price or rate)."), dt: z.number().positive().optional().describe("Time step in years per observation; default 1/252.") }).strict(),
    run({ series: x, dt = 1 / 252 }) {
      const fit = ols(x.slice(0, -1).map((v) => [1, v]), x.slice(1).map((v, i) => v - x[i]));
      const [a, b] = fit.coef, phi = 1 + b;
      if (!(phi > 0 && phi < 1)) return { ar_coefficient: phi, mean_reverting: false, note: "No mean reversion: the AR(1) coefficient is not between 0 and 1." };
      const theta = -Math.log(phi) / dt, mu = -a / b, sigma = Math.sqrt(fit.s2 * 2 * theta / (1 - phi * phi));
      const eqSd = sigma / Math.sqrt(2 * theta);
      return { mean_reverting: true, ar_coefficient: phi, half_life_periods: Math.log(2) / -Math.log(phi), half_life_years: Math.log(2) / theta, long_run_mean: mu, speed_theta: theta, sigma, equilibrium_std: eqSd, current_z_score: (x.at(-1) - mu) / eqSd, slope_t_stat: b / fit.se[1] };
    },
  },
  {
    name: "garch_volatility",
    title: "GARCH(1,1) volatility model",
    description: "Fit a GARCH(1,1) model with constant mean by maximum likelihood: omega, alpha, beta, persistence, long-run volatility, volatility half-life and the next-period volatility forecast.",
    keywords: "garch volatility model conditional variance forecast clustering arch persistence",
    input: z.object({ returns: series("Periodic returns (fractions)."), periods_per_year: ppyArg, horizon: z.number().int().min(1).max(1000).optional().describe("Forecast horizon in periods; default 1.") }).strict(),
    run({ returns: r, periods_per_year: ppy = 252, horizon = 1 }) {
      if (r.length < 100) throw new Error("GARCH needs at least 100 returns.");
      const g = garchFit(r), p = g.persistence, last = r.length - 1;
      let s2 = g.omega + g.alpha * (r[last] - g.mu) ** 2 + g.beta * g.path[last];
      const lr = p < 1 ? g.omega / (1 - p) : null;
      const fc = [];
      for (let h = 1; h <= horizon; h++) { fc.push(s2); s2 = g.omega + p * s2; }
      return { mu: g.mu, omega: g.omega, alpha: g.alpha, beta: g.beta, persistence: p, loglik: g.loglik, long_run_vol_annual: lr === null ? null : Math.sqrt(lr * ppy), half_life_periods: p < 1 ? Math.log(0.5) / Math.log(p) : null, next_vol_annual: Math.sqrt(fc[0] * ppy), horizon_vol_annual: Math.sqrt(sum(fc) / horizon * ppy), current_vol_annual: Math.sqrt(g.path[last] * ppy) };
    },
  },
  {
    name: "ewma_volatility",
    title: "EWMA (RiskMetrics) volatility",
    description: "Compute exponentially weighted volatility (RiskMetrics, lambda 0.94 by default): the current annualized estimate and optionally the full series.",
    keywords: "ewma exponentially weighted moving average volatility riskmetrics lambda decay",
    input: z.object({ ...seriesFields, lambda: z.number().gt(0).lt(1).optional().describe("Decay; default 0.94."), include_series: z.boolean().optional().describe("Return the whole volatility series; default false.") }).strict(),
    run(a) {
      const r = seriesFrom(a), l = a.lambda ?? 0.94, ppy = a.periods_per_year ?? 252;
      let s = r[0] * r[0]; const out = [Math.sqrt(s * ppy)];
      for (let t = 1; t < r.length; t++) { s = l * s + (1 - l) * r[t] * r[t]; out.push(Math.sqrt(s * ppy)); }
      return { current_vol_annual: out.at(-1), lambda: l, effective_window: 1 / (1 - l), series: a.include_series ? out : undefined, method: "s_0 = r_0^2; s_t = lambda s_(t-1) + (1 - lambda) r_t^2; annualized sqrt(s_t x periods_per_year)." };
    },
  },
  {
    name: "range_volatility",
    title: "Range-based volatility (OHLC)",
    description: "Estimate volatility from open, high, low and close prices with close-to-close, Parkinson, Garman-Klass, Rogers-Satchell and Yang-Zhang estimators, annualized.",
    keywords: "parkinson garman klass rogers satchell yang zhang realized volatility ohlc range estimator high low",
    input: z.object({
      open: z.array(z.number().positive()).min(3).max(MAX_SERIES).describe("Opens, oldest first."),
      high: z.array(z.number().positive()).min(3).max(MAX_SERIES).describe("Highs."),
      low: z.array(z.number().positive()).min(3).max(MAX_SERIES).describe("Lows."),
      close: z.array(z.number().positive()).min(3).max(MAX_SERIES).describe("Closes."),
      periods_per_year: ppyArg,
    }).strict(),
    run({ open: O, high: H, low: L, close: C, periods_per_year: ppy = 252 }) {
      const n = O.length;
      if (![H, L, C].every((x) => x.length === n)) throw new Error("open, high, low and close need the same length.");
      for (let t = 0; t < n; t++) if (H[t] < Math.max(O[t], C[t], L[t]) || L[t] > Math.min(O[t], C[t])) throw new Error(`Bar ${t} is inconsistent: high must be the bar's maximum and low its minimum.`);
      const ln = Math.log, cc = C.slice(1).map((c, i) => ln(c / C[i]));
      const park = mean(H.map((h, t) => ln(h / L[t]) ** 2)) / (4 * Math.LN2);
      const gk = mean(H.map((h, t) => 0.5 * ln(h / L[t]) ** 2 - (2 * Math.LN2 - 1) * ln(C[t] / O[t]) ** 2));
      const rsT = H.map((h, t) => ln(h / C[t]) * ln(h / O[t]) + ln(L[t] / C[t]) * ln(L[t] / O[t]));
      const o = O.slice(1).map((v, i) => ln(v / C[i])), c = C.slice(1).map((v, i) => ln(v / O[i + 1])), m = n - 1;
      const k = 0.34 / (1.34 + (m + 1) / (m - 1));
      const yz = variance(o) + k * variance(c) + (1 - k) * mean(rsT.slice(1));
      const ann = (v) => Math.sqrt(v * ppy);
      return { close_to_close: std(cc) * Math.sqrt(ppy), parkinson: ann(park), garman_klass: ann(gk), rogers_satchell: ann(mean(rsT)), yang_zhang: ann(yz) };
    },
  },
  {
    name: "probabilistic_sharpe_ratio",
    title: "Probabilistic Sharpe ratio",
    description: "Compute the probability that the true Sharpe ratio exceeds a benchmark given the track record's length, skewness and kurtosis (Bailey and López de Prado), and the minimum track record length needed.",
    keywords: "probabilistic sharpe ratio psr minimum track record length mintrl skewness kurtosis confidence",
    input: z.object({ ...seriesFields, benchmark_sharpe: z.number().min(-10).max(10).optional().describe("Annual Sharpe to beat; default 0."), confidence: z.number().gt(0.5).lt(1).optional().describe("For the minimum track record; default 0.95.") }).strict(),
    run(a) {
      const r = seriesFrom(a), ppy = a.periods_per_year ?? 252, st = trialSharpeStats(r), bench = (a.benchmark_sharpe ?? 0) / Math.sqrt(ppy);
      const zc = normInv(a.confidence ?? 0.95), varTerm = 1 - st.skew * st.sr + (st.kurt - 1) / 4 * st.sr * st.sr;
      const mtrl = st.sr > bench ? 1 + varTerm * (zc / (st.sr - bench)) ** 2 : null;
      return { psr: psr(st, bench), sharpe_annual: st.sr * Math.sqrt(ppy), periods: st.n, min_track_record_periods: mtrl, min_track_record_years: mtrl === null ? null : mtrl / ppy, skew: st.skew, kurtosis: st.kurt };
    },
  },
  {
    name: "deflated_sharpe_ratio",
    title: "Deflated Sharpe ratio",
    description: "Deflate a backtest's Sharpe ratio for the number of strategies tried (Bailey and López de Prado 2014): the expected maximum Sharpe under the null and the probability the result beats it.",
    keywords: "overfit overfitting variants trials tried multiple testing luck deflated sharpe ratio dsr multiple testing selection bias backtest overfitting trials data snooping",
    input: z.object({
      ...seriesFields,
      trials: z.number().int().min(1).max(1e9).describe("How many strategy variants were tried, including this one."),
      trial_sharpes: z.array(z.number()).min(2).max(100000).optional().describe("Annual Sharpe ratios of all trials, to estimate their variance."),
      trial_sharpe_variance: z.number().positive().optional().describe("Or the variance of the trials' annual Sharpe ratios directly."),
    }).strict(),
    run(a) {
      const r = seriesFrom(a), ppy = a.periods_per_year ?? 252, st = trialSharpeStats(r);
      let v = a.trial_sharpe_variance;
      if (v === undefined) { if (!a.trial_sharpes) throw new Error("Send trial_sharpes or trial_sharpe_variance."); v = variance(a.trial_sharpes); }
      const vPer = v / ppy, N = a.trials;
      const srStar = N === 1 ? 0 : Math.sqrt(vPer) * ((1 - EULER) * normInv(1 - 1 / N) + EULER * normInv(1 - 1 / (N * Math.E)));
      return { dsr: psr(st, srStar), sharpe_annual: st.sr * Math.sqrt(ppy), expected_max_sharpe_annual: srStar * Math.sqrt(ppy), trials: N, reading: psr(st, srStar) > 0.95 ? "Survives deflation at 95%." : "Does not survive deflation at 95%: the result is consistent with the best of many lucky trials." };
    },
  },
  {
    name: "pca_factors",
    title: "Principal components of returns",
    description: "Run principal component analysis on asset returns (correlation or covariance): explained variance per component, cumulative share and each component's loadings.",
    keywords: "pca principal component analysis factors eigenvalues explained variance loadings statistical factor model",
    input: z.object({ returns: matrixArg("Asset returns, one row per period, one column per asset."), use_covariance: z.boolean().optional().describe("Use covariance instead of correlation; default false."), components: z.number().int().min(1).max(50).optional().describe("Components to report; default all, at most 10.") }).strict(),
    run(a) {
      const cols = columnsOf(a.returns, "returns"), p = cols.length, sds = cols.map((c) => std(c));
      const cv = (x, y) => { const mx = mean(x), my = mean(y); let s = 0; for (let i = 0; i < x.length; i++) s += (x[i] - mx) * (y[i] - my); return s / (x.length - 1); };
      const M = cols.map((x, i) => cols.map((y, j) => cv(x, y) / (a.use_covariance ? 1 : sds[i] * sds[j])));
      const { values, vectors } = symmetricEigen(M), tot = sum(values), k = Math.min(a.components ?? 10, p);
      let cum = 0;
      return { columns: ["component", "eigenvalue", "explained", "cumulative"], rows: values.slice(0, k).map((v, i) => { cum += v / tot; return [i + 1, v, v / tot, cum]; }), loadings: vectors.slice(0, k) };
    },
  },
  {
    name: "rolling_beta",
    title: "Rolling beta",
    description: "Compute a rolling-window beta (and correlation) of returns against a benchmark: latest, average, minimum and maximum, optionally the full series.",
    keywords: "rolling beta correlation window time varying market exposure",
    input: z.object({ returns: series("Returns."), benchmark: series("Benchmark returns, same periods."), window: z.number().int().min(5).max(5000).describe("Window length in periods, e.g. 63."), include_series: z.boolean().optional().describe("Return every window's beta; default false.") }).strict(),
    run({ returns: r, benchmark: b, window: w, include_series }) {
      if (r.length !== b.length) throw new Error("returns and benchmark need the same length.");
      if (w > r.length) throw new Error("window is longer than the series.");
      const betas = [], cors = [];
      for (let e = w; e <= r.length; e++) {
        const x = b.slice(e - w, e), y = r.slice(e - w, e), mx = mean(x), my = mean(y);
        let sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < w; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
        betas.push(sxy / sxx); cors.push(sxy / Math.sqrt(sxx * syy));
      }
      return { latest_beta: betas.at(-1), mean_beta: mean(betas), min_beta: Math.min(...betas), max_beta: Math.max(...betas), latest_correlation: cors.at(-1), windows: betas.length, betas: include_series ? betas : undefined };
    },
  },
  {
    name: "granger_causality",
    title: "Granger causality test",
    description: "Test whether past values of x help predict y beyond y's own past (Granger causality), with the F-test at each lag up to a maximum.",
    keywords: "granger causality lead lag predictive f test time series var",
    input: z.object({ y: series("The series to predict."), x: series("The candidate leading series."), max_lag: z.number().int().min(1).max(50).describe("Largest lag to test, e.g. 5.") }).strict(),
    run({ y, x, max_lag }) {
      if (x.length !== y.length) throw new Error("x and y need the same length.");
      const rows = [];
      for (let p = 1; p <= max_lag; p++) {
        const Xr = [], Xu = [], yy = [];
        for (let t = max_lag; t < y.length; t++) {
          const ly = [], lx = [];
          for (let j = 1; j <= p; j++) { ly.push(y[t - j]); lx.push(x[t - j]); }
          Xr.push([...ly, 1]); Xu.push([...ly, ...lx, 1]); yy.push(y[t]);
        }
        const fr = ols(Xr, yy), fu = ols(Xu, yy), dfr = yy.length - 2 * p - 1;
        const F = ((fr.ssr - fu.ssr) / p) / (fu.ssr / dfr);
        rows.push([p, F, fSf(F, p, dfr)]);
      }
      return { columns: ["lag", "f_stat", "p_value"], rows, note: "Each lag uses the same sample (first max_lag observations dropped)." };
    },
  },
  {
    name: "arch_effects_test",
    title: "ARCH effects (Engle LM) test",
    description: "Test demeaned returns for volatility clustering with Engle's ARCH Lagrange multiplier test: LM statistic, chi-squared p-value, and the F version.",
    keywords: "arch effects engle lm test volatility clustering heteroskedasticity squared returns",
    input: z.object({ returns: series("Returns (they are demeaned)."), lags: z.number().int().min(1).max(100).optional().describe("Lags of squared returns; default 5.") }).strict(),
    run({ returns: r, lags = 5 }) {
      const m = mean(r), e2 = r.map((v) => (v - m) ** 2), X = [], y = [];
      for (let t = lags; t < e2.length; t++) { const row = [1]; for (let j = 1; j <= lags; j++) row.push(e2[t - j]); X.push(row); y.push(e2[t]); }
      const fit = ols(X, y), my = mean(y), sst = y.reduce((s, v) => s + (v - my) ** 2, 0), r2 = 1 - fit.ssr / sst, n = y.length;
      const F = (r2 / lags) / ((1 - r2) / (n - lags - 1));
      return { lm_stat: n * r2, p_value: chi2Sf(n * r2, lags), f_stat: F, f_p_value: fSf(F, lags, n - lags - 1), lags };
    },
  },
  {
    name: "mean_return_test",
    title: "Test that mean return is zero",
    description: "Test whether a strategy's mean return differs from zero (or a target) with a one-sample t-test and a Newey-West t-statistic robust to autocorrelation.",
    keywords: "t test mean return significance newey west alpha zero hypothesis test",
    input: z.object({ ...seriesFields, target: z.number().optional().describe("Per-period mean under the null; default 0."), lags: lagsArg.describe("Newey-West lags; default floor(4 (n/100)^(2/9)).") }).strict(),
    run(a) {
      const r = seriesFrom(a).map((v) => v - (a.target ?? 0)), n = r.length, m = mean(r), se = std(r) / Math.sqrt(n), t = m / se;
      const L = a.lags ?? Math.floor(4 * (n / 100) ** (2 / 9));
      const fit = ols(r.map(() => [1]), r), V = robustCov(r.map(() => [1]), fit, L), tNW = m / Math.sqrt(V[0][0]);
      return { mean: m + (a.target ?? 0), t_stat: t, p_value: tPValue(t, n - 1), t_stat_newey_west: tNW, p_value_newey_west: 2 * (1 - normCdf(Math.abs(tNW))), lags: L };
    },
  },
  {
    name: "compare_sharpe_ratios",
    title: "Compare two Sharpe ratios",
    description: "Test whether two strategies' Sharpe ratios differ (Jobson-Korkie with Memmel's correction) using their returns over the same periods.",
    keywords: "compare sharpe ratios jobson korkie memmel test difference two strategies",
    input: z.object({ returns_a: series("Strategy A returns."), returns_b: series("Strategy B returns, same periods."), periods_per_year: ppyArg }).strict(),
    run({ returns_a: a, returns_b: b, periods_per_year: ppy = 252 }) {
      if (a.length !== b.length) throw new Error("Both series need the same periods.");
      const T = a.length, s1 = mean(a) / std(a), s2 = mean(b) / std(b);
      const ma = mean(a), mb = mean(b);
      let sab = 0; for (let i = 0; i < T; i++) sab += (a[i] - ma) * (b[i] - mb);
      const rho = sab / (T - 1) / (std(a) * std(b));
      const theta = (2 - 2 * rho + 0.5 * (s1 * s1 + s2 * s2 - 2 * s1 * s2 * rho * rho)) / T;
      const zs = (s1 - s2) / Math.sqrt(theta);
      return { sharpe_a_annual: s1 * Math.sqrt(ppy), sharpe_b_annual: s2 * Math.sqrt(ppy), correlation: rho, z_stat: zs, p_value: 2 * (1 - normCdf(Math.abs(zs))) };
    },
  },
  {
    name: "welch_t_test",
    title: "Welch two-sample t-test",
    description: "Test whether two samples (e.g. returns in two regimes, before and after a change) have different means, without assuming equal variances (Welch).",
    keywords: "welch t test two sample difference in means unequal variance regime comparison",
    input: z.object({ sample_a: series("First sample."), sample_b: series("Second sample.") }).strict(),
    run({ sample_a: a, sample_b: b }) {
      const va = variance(a) / a.length, vb = variance(b) / b.length, t = (mean(a) - mean(b)) / Math.sqrt(va + vb);
      const df = (va + vb) ** 2 / (va * va / (a.length - 1) + vb * vb / (b.length - 1));
      return { t_stat: t, df, p_value: tPValue(t, df), mean_a: mean(a), mean_b: mean(b), one_sided_p_a_greater: 1 - tCdf(t, df) };
    },
  },
];
