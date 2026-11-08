// Placebo study v2, round 2: the simulated panels added in round 2.
//
//   garch_zero      round 1's garch_const with every mean set to zero: one market-wide GARCH(1,1)
//                   variance (a 0.10, b 0.85), monthly volatility 4%, pairwise correlation 0.3. No
//                   rule of any grid has a positive expected excess return over either registered
//                   benchmark, and volatility management has no alpha, so the null of the Reality
//                   Check, the SPA and StepM holds, as does the timing null of the placebo. Months are
//                   not exchangeable. This is the cell where all four methods test the same null.
//
//   real-shaped     panels shaped like a claim's real in-sample data: each series' mean and the
//                   covariance matrix are the sample mean and covariance of the claim's real series
//                   over its in-sample window (computed in the registered run, after registration);
//                   a common variance multiplier h (unconditional mean 1) scales the whole
//                   covariance. For the momentum claims h is GARCH(1,1) (a 0.10, b 0.85), driven by
//                   the standardized sum of the month's normal shocks. For volatility management h
//                   is exp(x - s^2 / 2), x a Gaussian AR(1) whose coefficient and innovation standard
//                   deviation are the OLS fit to the log of the real factors' average relative
//                   realized variance (s^2 its stationary variance): the timing pilot showed that the
//                   GARCH multiplier varies too little for volatility management to gain an
//                   appraisal ratio of 0.2 or more at any gamma. Realized variance is h times the
//                   series' variance times an independent chi-square(21)/21 draw.
//                   A timing effect is planted in one of two ways:
//                     momentum      each series' mean gets its own AR(1) component (rho 0.95) with a
//                                   stationary standard deviation of s times the series' volatility
//                     vol managed   each series' mean is mu * h + kappa * sd * z(1 / h), z(1 / h) the
//                                   standardized inverse variance multiplier: kappa = 0 is the null
//                                   (mean proportional to variance, so the best weight, mean over
//                                   variance, is constant, as in round 1's garch_meanvar); kappa > 0
//                                   raises the mean in calm months, which scaling by past variance
//                                   captures. The timing pilot first tried mu * h^gamma, whose uplift
//                                   was not monotone in gamma and stayed near 0.1.
//                   The strength (s or gamma) for each target uplift is found by bisection on one
//                   long simulated panel, as registered (calibrateEffect).
import { xoshiro } from "../../null-zoo/xoshiro.mjs";
import { SIM } from "../v2/sim.mjs";

function chiSquare(df, r) {
  let s = 0;
  for (let i = 0; i < df; i++) { const z = r.gauss(); s += z * z; }
  return s;
}

/** Round 1's garch_const panel with zero means (same structure and draws per month). */
export function simulateGarchZero(assets, months, r) {
  const s = SIM;
  const loading = Math.sqrt(s.corr), idio = Math.sqrt(1 - s.corr);
  // Drawn and discarded so the stream has the same shape as round 1's panels.
  for (let i = 0; i < assets; i++) r.gauss();
  const returns = Array.from({ length: assets }, () => new Float64Array(months));
  const variance = Array.from({ length: assets }, () => new Float64Array(months));
  const omega = 1 - s.garchA - s.garchB;
  let h = 1, shockPrev = 0;
  for (let b = 0; b < 200; b++) { const z = r.gauss(); h = omega + s.garchA * h * z * z + s.garchB * h; }
  for (let t = 0; t < months; t++) {
    if (t > 0) h = omega + s.garchA * shockPrev * shockPrev + s.garchB * h;
    const scale = Math.sqrt(h);
    const common = r.gauss();
    shockPrev = scale * common;
    for (let i = 0; i < assets; i++) {
      const sd = s.vol * scale;
      returns[i][t] = sd * (loading * common + idio * r.gauss());
      variance[i][t] = (sd * sd * chiSquare(s.days, r)) / s.days;
    }
  }
  return { returns, variance };
}

export const RS = Object.freeze({ garchA: 0.1, garchB: 0.85, trendRho: 0.95, days: 21, burn: 200 });

/**
 * Sample mean, covariance (divisor n - 1) and its Cholesky factor of the rows of a view; with
 * useVariance, the log-AR(1) fit of its realized variance (volatility management), else GARCH.
 */
export function shapeParams(view, { useVariance = false } = {}) {
  const k = view.returns.length, n = view.returns[0].length;
  const mu = Float64Array.from(view.returns, (c) => c.reduce((a, x) => a + x, 0) / n);
  const cov = new Float64Array(k * k);
  for (let i = 0; i < k; i++) for (let j = 0; j <= i; j++) {
    let s = 0;
    const a = view.returns[i], b = view.returns[j];
    for (let t = 0; t < n; t++) s += (a[t] - mu[i]) * (b[t] - mu[j]);
    cov[i * k + j] = cov[j * k + i] = s / (n - 1);
  }
  const L = new Float64Array(k * k);
  for (let i = 0; i < k; i++) for (let j = 0; j <= i; j++) {
    let s = cov[i * k + j];
    for (let m = 0; m < j; m++) s -= L[i * k + m] * L[j * k + m];
    if (i === j) {
      if (!(s > 0)) throw new Error("covariance matrix is not positive definite");
      L[i * k + i] = Math.sqrt(s);
    } else L[i * k + j] = s / L[j * k + j];
  }
  const sd = Float64Array.from({ length: k }, (_, i) => Math.sqrt(cov[i * k + i]));
  const out = { k, mu: Array.from(mu), sd: Array.from(sd), chol: Array.from(L), variance: { kind: "garch" } };
  if (useVariance) {
    // x_t = log of the average across series of realized variance over its own sample mean.
    const means = view.variance.map((v) => v.reduce((a, y) => a + y, 0) / n);
    const x = Float64Array.from({ length: n }, (_, t) => Math.log(view.variance.reduce((a, v, i) => a + v[t] / means[i], 0) / k));
    const a = x.subarray(0, n - 1), b = x.subarray(1);
    const ma = a.reduce((q, y) => q + y, 0) / a.length, mb = b.reduce((q, y) => q + y, 0) / b.length;
    let sab = 0, saa = 0;
    for (let t = 0; t < a.length; t++) { sab += (a[t] - ma) * (b[t] - mb); saa += (a[t] - ma) ** 2; }
    const phi = sab / saa;
    let sse = 0;
    for (let t = 0; t < a.length; t++) sse += (b[t] - mb - phi * (a[t] - ma)) ** 2;
    out.variance = { kind: "logar", phi, sigma: Math.sqrt(sse / (a.length - 2)) };
  }
  return out;
}

/** Mean and standard deviation of 1 / h under the log-AR model, in closed form. */
export function inverseMoments(model) {
  const s2 = model.sigma ** 2 / (1 - model.phi ** 2);
  return { mean: Math.exp(s2), sd: Math.sqrt(Math.exp(3 * s2) - Math.exp(2 * s2)) };
}

/** E[h^gamma] for a shape's variance model (GARCH: from one long path; log-AR: in closed form). */
const powerMeans = new Map();
export function variancePowerMean(model, gamma) {
  if (model.kind === "logar") {
    const s2 = model.sigma ** 2 / (1 - model.phi ** 2);
    return Math.exp((gamma * gamma * s2) / 2 - (gamma * s2) / 2);
  }
  if (!powerMeans.has(gamma)) powerMeans.set(gamma, garchPowerMean(gamma));
  return powerMeans.get(gamma);
}

/** E[h^gamma] under the registered GARCH, from one fixed path of `steps` months (seed fixed). */
export function garchPowerMean(gamma, steps = 1000000, seed = 20261111) {
  const r = xoshiro(seed);
  const omega = 1 - RS.garchA - RS.garchB;
  let h = 1, s = 0;
  for (let b = 0; b < RS.burn; b++) { const z = r.gauss(); h = omega + RS.garchA * h * z * z + RS.garchB * h; }
  for (let t = 0; t < steps; t++) { s += h ** gamma; const z = r.gauss(); h = omega + RS.garchA * h * z * z + RS.garchB * h; }
  return s / steps;
}

/**
 * One real-shaped panel. rz draws the shocks, the variance path and realized variance; rt draws the
 * trend components, so panels at different strengths share their shocks (common random numbers).
 * effect: { kind: "trend", s }, { kind: "meanvar", gamma } (mu * h^gamma / E[h^gamma]; not used in the
 * registered runs) or { kind: "voltiming", kappa } (log-AR variance only).
 */
export function simulateShaped(p, months, rz, rt, effect, withVariance) {
  const k = p.k, L = p.chol;
  const returns = Array.from({ length: k }, () => new Float64Array(months));
  const variance = Array.from({ length: k }, () => (withVariance ? new Float64Array(months) : null));
  const omega = 1 - RS.garchA - RS.garchB;
  const logar = p.variance.kind === "logar";
  const s2 = logar ? p.variance.sigma ** 2 / (1 - p.variance.phi ** 2) : 0;
  const norm = effect.kind === "meanvar" ? variancePowerMean(p.variance, effect.gamma) : 1;
  if (effect.kind === "voltiming" && !logar) throw new Error("voltiming needs the log-AR variance model");
  const inv = effect.kind === "voltiming" ? inverseMoments(p.variance) : null;
  const z = new Float64Array(k);
  let h = 1, x = 0;
  if (logar) { x = Math.sqrt(s2) * rz.gauss(); h = Math.exp(x - s2 / 2); }
  else for (let b = 0; b < RS.burn; b++) { const u = rz.gauss(); h = omega + RS.garchA * h * u * u + RS.garchB * h; }
  const trend = new Float64Array(k);
  const s = effect.kind === "trend" ? effect.s : 0;
  const innov = Math.sqrt(1 - RS.trendRho ** 2);
  for (let i = 0; i < k; i++) trend[i] = s * p.sd[i] * rt.gauss();
  for (let t = 0; t < months; t++) {
    let sum = 0;
    for (let i = 0; i < k; i++) { z[i] = rz.gauss(); sum += z[i]; }
    const root = Math.sqrt(h);
    const g = effect.kind === "meanvar" ? h ** effect.gamma / norm : effect.kind === "voltiming" ? h : 1;
    const tilt = effect.kind === "voltiming" ? (effect.kappa * (1 / h - inv.mean)) / inv.sd : 0;
    for (let i = 0; i < k; i++) {
      if (effect.kind === "trend" && t > 0) trend[i] = RS.trendRho * trend[i] + s * p.sd[i] * innov * rt.gauss();
      let e = 0;
      for (let j = 0; j <= i; j++) e += L[i * k + j] * z[j];
      returns[i][t] = p.mu[i] * g + tilt * p.sd[i] + trend[i] + root * e;
      if (withVariance) variance[i][t] = (h * p.sd[i] * p.sd[i] * chiSquare(RS.days, rz)) / RS.days;
    }
    if (logar) { x = p.variance.phi * x + p.variance.sigma * rz.gauss(); h = Math.exp(x - s2 / 2); }
    else { const u = sum / Math.sqrt(k); h = omega + RS.garchA * h * u * u + RS.garchB * h; }
  }
  return { returns, variance };
}

/**
 * The strength that plants a target uplift. `score(view)` is the published rule's annualized
 * statistic on a panel (Sharpe ratio for momentum, mean appraisal ratio across factors for
 * volatility management). The uplift at a strength is score(panel at that strength) minus
 * score(panel with the effect off: s = 0 or kappa = 0), both on one long panel of `months` rows
 * drawn from the same seeds. Bisection over [lo, hi] for `iterations` steps; returns null when the
 * target cannot be reached inside the bracket.
 */
export function calibrateEffect(p, kind, target, score, { months, seed, iterations, withVariance }) {
  const make = (x) => {
    const effect = kind === "trend" ? { kind, s: x } : { kind, kappa: x };
    return simulateShaped(p, months, xoshiro(seed), xoshiro((seed ^ 0x5bd1e995) >>> 0), effect, withVariance);
  };
  const off = score(make(0));
  const uplift = (x) => score(make(x)) - off;
  // The uplift rises with the strength: s on [0, 1.5] (momentum), kappa on [0, 1] (volatility).
  let lo = 0, hi = kind === "trend" ? 1.5 : 1;
  const rising = true;
  const far = uplift(rising ? hi : lo);
  if (far < target) return { strength: null, reached: far, off };
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const u = uplift(mid);
    if ((u < target) === rising) lo = mid; else hi = mid;
  }
  const strength = (lo + hi) / 2;
  return { strength, reached: uplift(strength), off };
}
