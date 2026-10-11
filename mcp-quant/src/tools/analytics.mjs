// Deeper analytics that slot into existing toolsets: regime switching, Johansen cointegration,
// parameter stability and structural breaks, realized-volatility measures and HAR forecasts,
// dependence beyond correlation and block-bootstrap confidence intervals (econometrics); extreme
// value tails (risk); model-free variance indices and risk-neutral densities (options); Merton
// structural credit risk (rates).
import { z } from "zod";

import { bfgs, brent, cholesky, inverse, solve, leastSquares, matMul, mean, moments, mulberry32, nelderMead, normCdf, normInv, quantile, std, symmetricEigen, tPValue, transpose, variance, fSf, sum } from "../math.mjs";
import { MAX_SERIES, ppyArg, returnsArg } from "../inputs.mjs";
import { regressionReport } from "./econometrics.mjs";

const series = (what, min = 10) => z.array(z.number()).min(min).max(MAX_SERIES).describe(what);
const matrixIn = (what) => z.array(z.array(z.number()).min(1).max(20)).min(20).max(MAX_SERIES).describe(what);
const positive = (what) => z.number().positive().describe(what);
const LN2PI = Math.log(2 * Math.PI);

function columns(M, label) {
  const k = M[0].length;
  M.forEach((r, i) => { if (r.length !== k) throw new Error(`${label} row ${i} has ${r.length} columns; row 0 has ${k}.`); });
  return Array.from({ length: k }, (_, j) => M.map((r) => r[j]));
}

// ---------------------------------------------------------------------------------------------
// Markov regime switching (Hamilton 1989): switching mean and variance, steady-state start.
// ---------------------------------------------------------------------------------------------
function steadyState(P) {
  const k = P.length;
  // Solve pi (P - I) = 0 with sum(pi) = 1.
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === k - 1 ? 1 : P[j][i] - (i === j ? 1 : 0))));
  const b = new Array(k).fill(0); b[k - 1] = 1;
  return inverse(A).map((r) => r.reduce((s, v, j) => s + v * b[j], 0));
}

function hamilton(y, mu, s2, P) {
  const n = y.length, k = mu.length, filt = [], pred = [];
  let prior = steadyState(P), llf = 0;
  for (let t = 0; t < n; t++) {
    if (t > 0) { const f = filt[t - 1]; prior = Array.from({ length: k }, (_, j) => f.reduce((s, v, i) => s + v * P[i][j], 0)); }
    pred.push(prior);
    const dens = mu.map((m, j) => Math.exp(-0.5 * (LN2PI + Math.log(s2[j]) + (y[t] - m) ** 2 / s2[j])));
    const joint = prior.map((p, j) => p * dens[j]), lik = sum(joint);
    if (!(lik > 0)) return { llf: -Infinity };
    llf += Math.log(lik);
    filt.push(joint.map((v) => v / lik));
  }
  return { llf, filt, pred };
}

// Log-likelihood only, without storing the filter: the optimizer's hot path.
function msLoglik(y, mu, s2, P) {
  const k = mu.length, c = s2.map((v) => -0.5 * (LN2PI + Math.log(v))), iv = s2.map((v) => 0.5 / v);
  let f = Float64Array.from(steadyState(P)), next = new Float64Array(k), llf = 0;
  for (let t = 0; t < y.length; t++) {
    let lik = 0;
    for (let j = 0; j < k; j++) {
      let pr = 0;
      if (t === 0) pr = f[j]; else for (let i = 0; i < k; i++) pr += f[i] * P[i][j];
      const d = y[t] - mu[j];
      next[j] = pr * Math.exp(c[j] - d * d * iv[j]);
      lik += next[j];
    }
    if (!(lik > 0)) return -Infinity;
    llf += Math.log(lik);
    for (let j = 0; j < k; j++) next[j] /= lik;
    [f, next] = [next, f];
  }
  return llf;
}

// Kim smoother: smoothed regime probabilities and the expected transitions they imply.
function kimSmoother(filt, pred, P) {
  const n = filt.length, k = P.length, sm = new Array(n);
  sm[n - 1] = filt[n - 1];
  for (let t = n - 2; t >= 0; t--) sm[t] = Array.from({ length: k }, (_, i) => filt[t][i] * P[i].reduce((s, pij, j) => s + pij * sm[t + 1][j] / pred[t + 1][j], 0));
  const xi = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let t = 1; t < n; t++) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) xi[i][j] += filt[t - 1][i] * P[i][j] * sm[t][j] / pred[t][j];
  return { sm, xi };
}

function unpackMS(th, k) {
  const mu = th.slice(0, k), s2 = th.slice(k, 2 * k).map(Math.exp), P = [];
  for (let i = 0; i < k; i++) {
    const raw = th.slice(2 * k + i * (k - 1), 2 * k + (i + 1) * (k - 1)), ex = [...raw.map(Math.exp), 1], tot = sum(ex);
    P.push(ex.map((v) => v / tot));
  }
  return { mu, s2, P };
}
const packMS = (mu, s2, P) => [...mu, ...s2.map(Math.log), ...P.flatMap((row) => row.slice(0, -1).map((v) => Math.log(Math.max(v, 1e-12) / Math.max(row[row.length - 1], 1e-12))))];

function fitMarkov(y, k) {
  const sorted = [...y].sort((a, b) => a - b), v = variance(y), starts = [];
  // Deterministic starts: regimes from quantile slices, and from a variance spread around the mean.
  starts.push({ mu: Array.from({ length: k }, (_, j) => quantile(sorted, (j + 0.5) / k)), s2: new Array(k).fill(v / k) });
  starts.push({ mu: new Array(k).fill(mean(y)), s2: Array.from({ length: k }, (_, j) => v * 0.3 * 4 ** j) });
  let best = null;
  for (const st of starts) {
    let mu = [...st.mu], s2 = [...st.s2], P = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 0.9 : 0.1 / (k - 1))));
    let prev = -Infinity;
    for (let it = 0; it < 80; it++) {
      const h = hamilton(y, mu, s2, P);
      if (!Number.isFinite(h.llf)) break;
      const { sm, xi } = kimSmoother(h.filt, h.pred, P);
      const w = Array.from({ length: k }, (_, j) => sm.reduce((s, p) => s + p[j], 0));
      mu = mu.map((_, j) => sm.reduce((s, p, t) => s + p[j] * y[t], 0) / w[j]);
      s2 = s2.map((_, j) => Math.max(sm.reduce((s, p, t) => s + p[j] * (y[t] - mu[j]) ** 2, 0) / w[j], 1e-12 * v));
      P = xi.map((row) => { const tot = sum(row); return row.map((x) => x / tot); });
      if (Math.abs(h.llf - prev) < 1e-9 * Math.abs(h.llf)) break;
      prev = h.llf;
    }
    // Finish on the exact likelihood (EM above ignores the steady-state start).
    const negll = (th) => { const u = unpackMS(th, k), l = msLoglik(y, u.mu, u.s2, u.P); return Number.isFinite(l) ? -l : 1e300; };
    const quasi = bfgs(negll, packMS(mu, s2, P));
    const opt = nelderMead(negll, quasi.x, { step: 0.001, tol: 1e-14, maxIter: 1500 });
    if (!best || opt.f < best.f) best = opt;
  }
  return unpackMS(best.x, k);
}

// ---------------------------------------------------------------------------------------------
// Johansen (statsmodels' coint_johansen procedure and Osterwald-Lenum critical values)
// ---------------------------------------------------------------------------------------------
const JOHANSEN = {"-1":{"max_eig":[[2.9762,4.1296,6.9406],[9.4748,11.2246,15.0923],[15.7175,17.7961,22.2519],[21.837,24.1592,29.0609],[27.916,30.4428,35.7359],[33.9271,36.6301,42.2333],[39.9085,42.7679,48.6606],[45.893,48.8795,55.0335],[51.8528,54.9629,61.3449],[57.7954,61.0404,67.6415],[63.7248,67.0756,73.8856],[69.6513,73.0946,80.0937]],"trace":[[2.9762,4.1296,6.9406],[10.4741,12.3212,16.364],[21.7781,24.2761,29.5147],[37.0339,40.1749,46.5716],[56.2839,60.0627,67.6367],[79.5329,83.9383,92.7136],[106.7351,111.7797,121.7375],[137.9954,143.6691,154.7391],[173.2292,179.5199,191.8122],[212.4721,219.4051,232.8291],[255.6732,263.2603,277.9962],[302.9054,311.1288,326.9716]]},"0":{"max_eig":[[2.7055,3.8415,6.6349],[12.2971,14.2639,18.52],[18.8928,21.1314,25.865],[25.1236,27.5858,32.7172],[31.2379,33.8777,39.3693],[37.2786,40.0763,45.8662],[43.2947,46.2299,52.3069],[49.2855,52.3622,58.6634],[55.2412,58.4332,64.996],[61.2041,64.504,71.2525],[67.1307,70.5392,77.4877],[73.0563,76.5734,83.7105]],"trace":[[2.7055,3.8415,6.6349],[13.4294,15.4943,19.9349],[27.0669,29.7961,35.4628],[44.4929,47.8545,54.6815],[65.8202,69.8189,77.8202],[91.109,95.7542,104.9637],[120.3673,125.6185,135.9825],[153.6341,159.529,171.0905],[190.8714,197.3772,210.0366],[232.103,239.2468,253.2526],[277.374,285.1402,300.2821],[326.5354,334.9795,351.215]]},"1":{"max_eig":[[2.7055,3.8415,6.6349],[15.0006,17.1481,21.7465],[21.8731,24.2522,29.2631],[28.2398,30.8151,36.193],[34.4202,37.1646,42.8612],[40.5244,43.4183,49.4095],[46.5583,49.5875,55.8171],[52.5858,55.7302,62.1741],[58.5316,61.8051,68.503],[64.5292,67.904,74.7434],[70.4630,73.9355,81.0678],[76.4081,79.9878,87.2395]],"trace":[[2.7055,3.8415,6.6349],[16.1619,18.3985,23.1485],[32.0645,35.0116,41.0815],[51.6492,55.2459,62.5202],[75.1027,79.3422,87.7748],[102.4674,107.3429,116.9829],[133.7852,139.278,150.0778],[169.0618,175.1584,187.1891],[208.3582,215.1268,228.2226],[251.6293,259.0267,273.3838],[298.8836,306.8988,322.4264],[350.1125,358.7190,375.3203]]}};

// OLS residuals of every column of Y on X (X empty: Y unchanged).
function residualize(Y, X) {
  if (!X.length || !X[0].length) return Y.map((r) => [...r]);
  const cols = columns(Y, "y").map((c) => leastSquares(X, c).resid);
  return Y.map((_, t) => cols.map((c) => c[t]));
}
// Polynomial detrending as statsmodels does it (Vandermonde on linspace(-1, 1)); order -1 is none.
function detrend(Y, order) {
  if (order < 0) return Y.map((r) => [...r]);
  const n = Y.length, X = Array.from({ length: n }, (_, t) => { const u = n === 1 ? -1 : -1 + 2 * t / (n - 1); return Array.from({ length: order + 1 }, (_, j) => u ** (order - j)); });
  return residualize(Y, X);
}

function johansen(Y, det, kd) {
  const nobs = Y.length, m = Y[0].length, f = det > -1 ? 0 : det;
  const E = detrend(Y, det), dx = E.slice(1).map((r, t) => r.map((v, j) => v - E[t][j]));
  const Z = dx.map((_, t) => (t < kd ? null : Array.from({ length: kd }, (_, l) => dx[t - l - 1]).flat())).slice(kd);
  const Zd = detrend(Z, f), dX = detrend(dx.slice(kd), f);
  const r0 = residualize(dX, Zd);
  const lx = E.slice(0, nobs - kd).slice(1);
  const rk = residualize(detrend(lx, f), Zd);
  const T = rk.length, cross = (A, B) => matMul(transpose(A), B).map((r) => r.map((v) => v / T));
  const Skk = cross(rk, rk), Sk0 = cross(rk, r0), S00 = cross(r0, r0);
  const L = cholesky(Skk), Li = inverse(L), M = matMul(matMul(Li, matMul(matMul(Sk0, inverse(S00)), transpose(Sk0))), transpose(Li));
  const eig = symmetricEigen(M.map((r, i) => r.map((v, j) => (v + M[j][i]) / 2)));
  const LiT = transpose(Li), vecs = eig.vectors.map((v) => LiT.map((row) => row.reduce((s, x, j) => s + x * v[j], 0)));
  const a = eig.values;
  if (a[0] >= 1 - 1e-10) throw new Error("The series are perfectly collinear (an eigenvalue of 1); drop a redundant series.");
  return { a, vecs, T, lr1: a.map((_, i) => -T * a.slice(i).reduce((s, x) => s + Math.log(1 - x), 0)), lr2: a.map((x) => -T * Math.log(1 - x)) };
}

// ---------------------------------------------------------------------------------------------
// Recursive residuals (Brown, Durbin and Evans 1975)
// ---------------------------------------------------------------------------------------------
function recursive(X, y) {
  const n = X.length, k = X[0].length, Xk = X.slice(0, k);
  if (n <= k + 2) throw new Error(`Need more than ${k + 2} observations.`);
  // Exact fit on the first k observations, then add one observation at a time (Sherman-Morrison).
  let Mx = inverse(matMul(transpose(Xk), Xk));
  let b = Mx.map((r) => r.reduce((s, v, j) => s + v * Xk.reduce((q, row, i) => q + row[j] * y[i], 0), 0));
  const w = [], path = [];
  for (let t = k; t < n; t++) {
    const x = X[t], Mxv = Mx.map((r) => r.reduce((s, v, j) => s + v * x[j], 0)), f = 1 + x.reduce((s, v, i) => s + v * Mxv[i], 0);
    const e = y[t] - x.reduce((s, v, i) => s + v * b[i], 0);
    w.push(e / Math.sqrt(f));
    b = b.map((bi, i) => bi + Mxv[i] * e / f);
    Mx = Mx.map((r, i) => r.map((v, j) => v - Mxv[i] * Mxv[j] / f));
    path.push([...b]);
  }
  return { w, path, k, n };
}

// Edgerton and Wells (1994) CUSUM-of-squares critical values (as statsmodels), at 5% two-sided.
const CUSUMSQ_5 = [1.3581015, -0.6701218, -0.8858694];

// ---------------------------------------------------------------------------------------------
// Bootstrap statistics
// ---------------------------------------------------------------------------------------------
function statistic(kind, r, ppy) {
  const n = r.length;
  if (kind === "mean") return mean(r) * ppy;
  if (kind === "volatility") return std(r) * Math.sqrt(ppy);
  if (kind === "sharpe") { const s = std(r); return s > 0 ? mean(r) / s * Math.sqrt(ppy) : 0; }
  if (kind === "sortino") { let d = 0; for (const v of r) if (v < 0) d += v * v; d = Math.sqrt(d / n); return d > 0 ? mean(r) / d * Math.sqrt(ppy) : 0; }
  let eq = 1, peak = 1, mdd = 0; for (const v of r) { eq *= 1 + v; if (eq > peak) peak = eq; mdd = Math.min(mdd, eq / peak - 1); }
  const cagr = eq > 0 ? eq ** (ppy / n) - 1 : -1;
  if (kind === "cagr") return cagr;
  if (kind === "max_drawdown") return mdd;
  if (kind === "calmar") return mdd < 0 ? cagr / -mdd : 0;
  throw new Error(`Unknown statistic ${kind}.`);
}

function stationaryDraw(n, block, rand) {
  const p = 1 / block, idx = new Int32Array(n);
  let cur = 0;
  for (let t = 0; t < n; t++) { const u = rand(); cur = t === 0 || u < p ? Math.floor(rand() * n) : (cur + 1) % n; idx[t] = cur; }
  return idx;
}

// ---------------------------------------------------------------------------------------------
// Ranks and dependence
// ---------------------------------------------------------------------------------------------
function ranks(x) {
  const o = x.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]), r = new Array(x.length);
  for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; const avg = (i + j) / 2 + 1; for (let q = i; q <= j; q++) r[o[q][1]] = avg; i = j + 1; }
  return r;
}
const pearson = (x, y) => { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
const corrP = (r, n) => (Math.abs(r) >= 1 ? 0 : tPValue(r * Math.sqrt((n - 2) / (1 - r * r)), n - 2));

function kendall(x, y) {
  const n = x.length;
  let con = 0, dis = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const s = Math.sign(x[i] - x[j]) * Math.sign(y[i] - y[j]); if (s > 0) con++; else if (s < 0) dis++; }
  const tieStats = (v) => { const c = new Map(); for (const a of v) c.set(a, (c.get(a) ?? 0) + 1); let t = 0, t0 = 0, t1 = 0; for (const m of c.values()) if (m > 1) { t += m * (m - 1) / 2; t0 += m * (m - 1) * (m - 2); t1 += m * (m - 1) * (2 * m + 5); } return [t, t0, t1]; };
  const [xt, x0, x1] = tieStats(x), [yt, y0, y1] = tieStats(y), tot = n * (n - 1) / 2;
  const cmd = con - dis, tau = cmd / Math.sqrt((tot - xt) * (tot - yt)), m = n * (n - 1);
  const v = (m * (2 * n + 5) - x1 - y1) / 18 + (2 * xt * yt) / m + x0 * y0 / (9 * m * (n - 2));
  return { tau: Math.max(-1, Math.min(1, tau)), p: 2 * (1 - normCdf(Math.abs(cmd / Math.sqrt(v)))) };
}

function distanceCorrelation(x, y) {
  const n = x.length;
  const rowMeans = (v) => { const r = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += Math.abs(v[i] - v[j]); r[i] = s / n; } return r; };
  const ax = rowMeans(x), ay = rowMeans(y), gx = sum(ax) / n, gy = sum(ay) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const A = Math.abs(x[i] - x[j]) - ax[i] - ax[j] + gx, B = Math.abs(y[i] - y[j]) - ay[i] - ay[j] + gy;
    sxy += A * B; sxx += A * A; syy += B * B;
  }
  return sxx > 0 && syy > 0 ? Math.sqrt(Math.max(0, sxy) / Math.sqrt(sxx * syy)) : 0;
}

// ---------------------------------------------------------------------------------------------
// Generalized Pareto tail
// ---------------------------------------------------------------------------------------------
function gpdNegLL([xi, logb], y) {
  const b = Math.exp(logb);
  let s = 0;
  for (const v of y) {
    const zz = 1 + xi * v / b;
    if (zz <= 0) return 1e300;
    s += Math.abs(xi) < 1e-12 ? v / b : (1 + 1 / xi) * Math.log(zz);
  }
  return y.length * logb + s;
}

// ---------------------------------------------------------------------------------------------
// CBOE VIX method for one expiry
// ---------------------------------------------------------------------------------------------
function expiryVariance(e) {
  const T = e.minutes_to_expiry / 525600, R = e.rate ?? 0, opts = [...e.options].sort((a, b) => a.strike - b.strike);
  const mid = (b, a) => (b + a) / 2;
  let fk = null, gap = Infinity;
  for (const o of opts) { const c = mid(o.call_bid, o.call_ask), p = mid(o.put_bid, o.put_ask), d = Math.abs(c - p); if (d < gap) { gap = d; fk = o; } }
  const F = fk.strike + Math.exp(R * T) * (mid(fk.call_bid, fk.call_ask) - mid(fk.put_bid, fk.put_ask));
  const below = opts.filter((o) => o.strike <= F);
  if (!below.length) throw new Error("No strike at or below the forward.");
  const K0 = below[below.length - 1].strike, i0 = opts.findIndex((o) => o.strike === K0), used = [];
  // Puts below K0, walking down, stopping at two consecutive zero bids.
  for (let i = i0 - 1, zeros = 0; i >= 0; i--) { if (opts[i].put_bid === 0) { if (++zeros === 2) break; continue; } zeros = 0; used.unshift([opts[i].strike, mid(opts[i].put_bid, opts[i].put_ask)]); }
  used.push([K0, (mid(opts[i0].call_bid, opts[i0].call_ask) + mid(opts[i0].put_bid, opts[i0].put_ask)) / 2]);
  for (let i = i0 + 1, zeros = 0; i < opts.length; i++) { if (opts[i].call_bid === 0) { if (++zeros === 2) break; continue; } zeros = 0; used.push([opts[i].strike, mid(opts[i].call_bid, opts[i].call_ask)]); }
  let s = 0;
  used.forEach(([K, q], i) => { const dK = i === 0 ? used[1][0] - K : i === used.length - 1 ? K - used[i - 1][0] : (used[i + 1][0] - used[i - 1][0]) / 2; s += dK / (K * K) * Math.exp(R * T) * q; });
  const s2 = (2 / T) * s - (1 / T) * (F / K0 - 1) ** 2;
  return { T, minutes: e.minutes_to_expiry, forward: F, k0: K0, strikes_used: used.length, variance: s2 };
}

// ---------------------------------------------------------------------------------------------
// Merton (1974) structural model
// ---------------------------------------------------------------------------------------------
function mertonEquity(V, sv, D, r, T) { const d1 = (Math.log(V / D) + (r + sv * sv / 2) * T) / (sv * Math.sqrt(T)), d2 = d1 - sv * Math.sqrt(T); return { E: V * normCdf(d1) - D * Math.exp(-r * T) * normCdf(d2), d1, d2 }; }

export const ECONOMETRICS = [
  {
    name: "markov_regime_switching",
    title: "Markov regime-switching model",
    description: "Fit a Hamilton Markov-switching model with a mean and volatility per regime (2 or 3 regimes) by maximum likelihood: regime means and volatilities, transition probabilities, expected durations, the current regime probabilities and how much time was spent in each.",
    keywords: "markov switching regime detection hidden markov model hmm bull bear volatility regimes hamilton filter",
    input: z.object({ returns: series("Periodic returns (or any series), oldest first.", 50), regimes: z.number().int().min(2).max(3).optional().describe("Number of regimes; default 2."), periods_per_year: ppyArg, include_probabilities: z.boolean().optional().describe("Also return the smoothed probability of each regime per period; default false.") }).strict(),
    run(a) {
      const y = a.returns, k = a.regimes ?? 2, ppy = a.periods_per_year ?? 252;
      const fit = fitMarkov(y, k), order = [...Array(k).keys()].sort((i, j) => fit.s2[i] - fit.s2[j]);
      const mu = order.map((i) => fit.mu[i]), s2 = order.map((i) => fit.s2[i]), P = order.map((i) => order.map((j) => fit.P[i][j]));
      const h = hamilton(y, mu, s2, P), { sm } = kimSmoother(h.filt, h.pred, P), ss = steadyState(P);
      const state = sm.map((p) => p.indexOf(Math.max(...p)));
      let switches = 0; for (let t = 1; t < state.length; t++) if (state[t] !== state[t - 1]) switches++;
      const nPar = 2 * k + k * (k - 1);
      return {
        columns: ["regime", "mean", "volatility", "annual_mean", "annual_volatility", "expected_duration", "steady_state_share", "share_of_periods", "current_probability"],
        rows: mu.map((m, j) => [j, m, Math.sqrt(s2[j]), m * ppy, Math.sqrt(s2[j] * ppy), 1 / (1 - P[j][j]), ss[j], state.filter((s) => s === j).length / y.length, h.filt[y.length - 1][j]]),
        transition_matrix: P, log_likelihood: h.llf, aic: -2 * h.llf + 2 * nPar, bic: -2 * h.llf + Math.log(y.length) * nPar, regime_switches: switches,
        smoothed_probabilities: a.include_probabilities ? sm : undefined,
        note: "Regimes are ordered from calmest to most volatile. transition_matrix[i][j] is the probability of moving from regime i to regime j in one period. Maximum likelihood can have local optima; the fit starts from two deterministic points and keeps the better.",
      };
    },
  },
  {
    name: "johansen_cointegration",
    title: "Johansen cointegration test",
    description: "Test how many cointegrating relationships tie several price series together (Johansen trace and maximum-eigenvalue tests with Osterwald-Lenum critical values), with the rank chosen at 5% and the normalized cointegrating vectors.",
    keywords: "johansen cointegration rank trace test maximum eigenvalue vecm basket stat arb multiple series",
    input: z.object({
      prices: matrixIn("Prices, one row per period and one column per series (2-12 columns)."),
      log_prices: z.boolean().optional().describe("Take logs first; default true."),
      det_order: z.number().int().min(-1).max(1).optional().describe("-1 no deterministic terms, 0 constant (default), 1 linear trend."),
      lags: z.number().int().min(0).max(24).optional().describe("Lagged differences in the VECM; default 1."),
    }).strict(),
    run(a) {
      const m = a.prices[0].length;
      if (m < 2 || m > 12) throw new Error("Use 2 to 12 series.");
      columns(a.prices, "prices");
      const Y = (a.log_prices ?? true) ? a.prices.map((r) => r.map((v) => { if (!(v > 0)) throw new Error("log_prices needs positive prices."); return Math.log(v); })) : a.prices;
      const det = a.det_order ?? 0, kd = a.lags ?? 1, J = johansen(Y, det, kd), cv = JOHANSEN[String(det)];
      let rank = m; for (let i = 0; i < m; i++) if (J.lr1[i] < cv.trace[m - i - 1][1]) { rank = i; break; }
      return {
        columns: ["rank_at_most", "eigenvalue", "trace_stat", "trace_cv_90", "trace_cv_95", "trace_cv_99", "max_eig_stat", "max_eig_cv_90", "max_eig_cv_95", "max_eig_cv_99"],
        rows: J.a.map((ev, i) => [i, ev, J.lr1[i], ...cv.trace[m - i - 1], J.lr2[i], ...cv.max_eig[m - i - 1]]),
        cointegration_rank_5pct: rank,
        cointegrating_vectors: J.vecs.slice(0, Math.max(rank, 1)).map((v) => v.map((x) => x / v[0])),
        nobs_used: J.T,
        note: "Vectors are normalized so the first series has weight 1; the first is the most stationary combination. Rank is the first r whose trace statistic falls below its 95% critical value.",
      };
    },
  },
  {
    name: "recursive_stability_test",
    title: "Parameter stability (CUSUM)",
    description: "Check whether a regression's coefficients stayed stable over time: recursive least squares coefficient paths, and the CUSUM and CUSUM-of-squares tests of Brown, Durbin and Evans with 5% bounds and the first period each one crosses.",
    keywords: "cusum cusum of squares parameter stability recursive least squares structural change breaks brown durbin evans beta drift",
    input: z.object({
      y: series("Dependent series, e.g. a strategy's returns.", 20),
      x: z.array(z.array(z.number()).min(1).max(10)).min(20).max(MAX_SERIES).optional().describe("Regressors, one row per period (e.g. market and factor returns). Omit to test a constant mean."),
      add_constant: z.boolean().optional().describe("Add an intercept; default true."),
    }).strict(),
    run(a) {
      const n = a.y.length, X = (a.x ?? a.y.map(() => [])).map((r) => ((a.add_constant ?? true) || !a.x ? [1, ...r] : r));
      if (X.length !== n) throw new Error(`x has ${X.length} rows and y ${n}.`);
      const { w, path, k } = recursive(X, a.y), m = w.length, sd = std(w);
      const cus = []; let c = 0; for (const v of w) { c += v; cus.push(c / sd); }
      const tot = w.reduce((s, v) => s + v * v, 0), sq = []; let q = 0; for (const v of w) { q += v * v; sq.push(q / tot); }
      const root = Math.sqrt(n - k), bound = (j) => 0.948 * root + 2 * 0.948 * (j + 1) / root;
      const nn = 0.5 * (n - k) - 1, crit = CUSUMSQ_5[0] / Math.sqrt(nn) + CUSUMSQ_5[1] / nn + CUSUMSQ_5[2] / nn ** 1.5;
      const cross1 = cus.findIndex((v, j) => Math.abs(v) > bound(j)), cross2 = sq.findIndex((v, j) => Math.abs(v - (j + 1) / m) > crit);
      const names = X[0].map((_, i) => ((a.add_constant ?? true) || !a.x ? (i === 0 ? "const" : `x${i}`) : `x${i + 1}`));
      return {
        columns: ["term", "final", "min", "max", "first_recursive"], rows: names.map((nm, i) => { const p = path.map((b) => b[i]); return [nm, p[p.length - 1], Math.min(...p), Math.max(...p), p[0]]; }),
        cusum: { max_abs_over_bound: Math.max(...cus.map((v, j) => Math.abs(v) / bound(j))), crosses: cross1 >= 0, first_cross_period: cross1 >= 0 ? cross1 + k : null, last: cus[m - 1] },
        cusum_of_squares: { max_deviation: Math.max(...sq.map((v, j) => Math.abs(v - (j + 1) / m))), critical_value: crit, crosses: cross2 >= 0, first_cross_period: cross2 >= 0 ? cross2 + k : null },
        recursive_residuals: m,
        verdict: cross1 >= 0 || cross2 >= 0 ? "Instability at 5%: the relationship shifted during the sample (CUSUM flags drifting coefficients, CUSUM of squares flags changing variance)." : "No instability detected at 5% by either test.",
      };
    },
  },
  {
    name: "chow_break_test",
    title: "Structural break (Chow) test",
    description: "Test for a structural break in a regression at a known period (Chow F-test), or scan every candidate break inside a trimmed range for the largest F statistic and where it falls.",
    keywords: "chow test structural break regime change breakpoint sup f quandt andrews before after regression",
    input: z.object({
      y: series("Dependent series.", 20),
      x: z.array(z.array(z.number()).min(1).max(10)).min(20).max(MAX_SERIES).optional().describe("Regressors per period; omit to test a break in the mean."),
      break_period: z.number().int().min(1).optional().describe("First period of the second regime (0-based). Omit to scan."),
      trim: z.number().min(0.05).max(0.45).optional().describe("Fraction trimmed from each end when scanning; default 0.15."),
    }).strict(),
    run(a) {
      const n = a.y.length, X = (a.x ?? a.y.map(() => [])).map((r) => [1, ...r]), k = X[0].length;
      if (X.length !== n) throw new Error(`x has ${X.length} rows and y ${n}.`);
      const ssr = (lo, hi) => leastSquares(X.slice(lo, hi), a.y.slice(lo, hi)).resid.reduce((s, e) => s + e * e, 0), full = ssr(0, n);
      const chow = (b) => { const s = ssr(0, b) + ssr(b, n), F = ((full - s) / k) / (s / (n - 2 * k)); return { F, p: fSf(F, k, n - 2 * k) }; };
      if (a.break_period !== undefined) {
        const b = a.break_period;
        if (b <= k || b >= n - k) throw new Error(`break_period must leave more than ${k} periods on each side.`);
        const r = chow(b);
        return { break_period: b, f_stat: r.F, p_value: r.p, df: [k, n - 2 * k], verdict: r.p < 0.05 ? "The coefficients differ before and after the break at 5%." : "No significant break at that period at 5%." };
      }
      const lo = Math.max(k + 1, Math.floor(n * (a.trim ?? 0.15))), hi = Math.min(n - k - 1, n - Math.floor(n * (a.trim ?? 0.15)));
      // Scan with prefix sums of X'X, X'y and y'y (O(n k^2) in total), then recompute the winner exactly.
      const cXX = [Array.from({ length: k }, () => new Array(k).fill(0))], cXy = [new Array(k).fill(0)], cyy = [0];
      for (let t = 0; t < n; t++) {
        const x = X[t], prevA = cXX[t], prevB = cXy[t];
        cXX.push(prevA.map((row, i) => row.map((v, j) => v + x[i] * x[j]))); cXy.push(prevB.map((v, i) => v + x[i] * a.y[t])); cyy.push(cyy[t] + a.y[t] * a.y[t]);
      }
      const segSSR = (l, h) => { const A = cXX[h].map((row, i) => row.map((v, j) => v - cXX[l][i][j])), bv = cXy[h].map((v, i) => v - cXy[l][i]); const coef = solve(A, bv); return cyy[h] - cyy[l] - coef.reduce((s2, c, i) => s2 + c * bv[i], 0); };
      let bestB = lo, bestF = -Infinity;
      for (let b = lo; b <= hi; b++) { const s2 = segSSR(0, b) + segSSR(b, n), F = ((full - s2) / k) / (s2 / (n - 2 * k)); if (F > bestF) { bestF = F; bestB = b; } }
      const best = { b: bestB, ...chow(bestB) };
      return { scanned: [lo, hi], sup_f_stat: best.F, most_likely_break_period: best.b, chow_p_value_at_that_period: best.p, note: "The p-value is the Chow p-value at the chosen period; after scanning many periods it overstates significance (use Andrews' sup-F critical values, about 8.85 for one coefficient at 15% trimming and 5%)." };
    },
  },
  {
    name: "har_rv_forecast",
    title: "HAR realized-volatility forecast",
    description: "Fit Corsi's heterogeneous autoregressive (HAR) model of realized variance on its daily, weekly and monthly averages, with Newey-West errors, and forecast variance and volatility over the next horizon.",
    keywords: "har model realized volatility forecast corsi heterogeneous autoregressive volatility forecasting rv",
    input: z.object({
      realized_variance: z.array(z.number().positive()).min(60).max(MAX_SERIES).describe("Daily realized variances, oldest first (e.g. from realized_volatility_measures)."),
      horizon: z.number().int().min(1).max(66).optional().describe("Forecast the average variance over the next this many days; default 1."),
      log: z.boolean().optional().describe("Model log variance; default false."),
      hac_lags: z.number().int().min(0).max(100).optional().describe("Newey-West lags; default horizon + 4."),
      periods_per_year: ppyArg,
    }).strict(),
    run(a) {
      const v = (a.log ? a.realized_variance.map(Math.log) : a.realized_variance), h = a.horizon ?? 1, n = v.length, ppy = a.periods_per_year ?? 252;
      const avg = (t, w) => { let s = 0; for (let i = t - w + 1; i <= t; i++) s += v[i]; return s / w; };
      const X = [], Y = [];
      for (let t = 21; t + h < n; t++) { X.push([1, v[t], avg(t, 5), avg(t, 22)]); let s = 0; for (let i = 1; i <= h; i++) s += v[t + i]; Y.push(s / h); }
      const rep = regressionReport(X, Y, ["const", "daily", "weekly", "monthly"], { covType: "hac", lags: a.hac_lags ?? h + 4 });
      const t = n - 1, coef = rep.rows.map((r) => r[1]), f = coef[0] + coef[1] * v[t] + coef[2] * avg(t, 5) + coef[3] * avg(t, 22);
      const varF = a.log ? Math.exp(f) : f;
      return { ...rep, horizon: h, forecast_variance: varF, forecast_annual_volatility: varF > 0 ? Math.sqrt(varF * ppy) : null, note: a.log ? "Log model: the forecast is exp of the fitted log variance (no bias correction)." : "Level model on variances." };
    },
  },
  {
    name: "realized_volatility_measures",
    title: "Realized volatility and jumps",
    description: "From intraday returns per day, compute realized variance, bipower variation, the jump component and the Barndorff-Nielsen-Shephard jump test (tripower quarticity), realized semivariances, realized skewness and kurtosis, and the daily series for HAR forecasts.",
    keywords: "realized volatility realized variance bipower variation jump test bns tripower semivariance intraday high frequency",
    input: z.object({
      intraday_returns: z.array(z.array(z.number()).min(4).max(100000)).min(1).max(20000).describe("One array of intraday returns per day (e.g. 5-minute log returns), oldest day first."),
      jump_level: z.number().gt(0).lt(0.5).optional().describe("Significance of the jump test; default 0.001."),
      periods_per_year: ppyArg,
      include_series: z.boolean().optional().describe("Return the daily realized variance and bipower series; default false."),
    }).strict(),
    run(a) {
      const ppy = a.periods_per_year ?? 252, alpha = a.jump_level ?? 0.001, crit = normInv(1 - alpha);
      const mu1 = Math.sqrt(2 / Math.PI), mu43 = 2 ** (2 / 3) * Math.exp(lgamma(7 / 6) - lgamma(0.5)), theta = Math.PI ** 2 / 4 + Math.PI - 5;
      const days = a.intraday_returns.map((r) => {
        const n = r.length, rv = r.reduce((s, x) => s + x * x, 0);
        let bv = 0; for (let i = 1; i < n; i++) bv += Math.abs(r[i]) * Math.abs(r[i - 1]); bv /= mu1 * mu1;
        let tq = 0; for (let i = 2; i < n; i++) tq += (Math.abs(r[i]) * Math.abs(r[i - 1]) * Math.abs(r[i - 2])) ** (4 / 3); tq *= n * (n / (n - 2)) / mu43 ** 3;
        const zstat = rv > 0 && bv > 0 ? ((rv - bv) / rv) / Math.sqrt(theta / n * Math.max(1, tq / (bv * bv))) : 0;
        let up = 0, s3 = 0, s4 = 0; for (const x of r) { if (x > 0) up += x * x; s3 += x ** 3; s4 += x ** 4; }
        return { rv, bv, jump: Math.max(rv - bv, 0), z: zstat, isJump: zstat > crit, up, down: rv - up, skew: rv > 0 ? Math.sqrt(n) * s3 / rv ** 1.5 : 0, kurt: rv > 0 ? n * s4 / (rv * rv) : 0 };
      });
      const totalRV = sum(days.map((d) => d.rv)), jumpVar = sum(days.filter((d) => d.isJump).map((d) => d.jump));
      const last = days[days.length - 1];
      return {
        days: days.length, mean_annual_volatility: Math.sqrt(mean(days.map((d) => d.rv)) * ppy),
        jump_days: days.filter((d) => d.isJump).length, jump_share_of_variance: totalRV > 0 ? jumpVar / totalRV : 0,
        downside_share_of_variance: totalRV > 0 ? sum(days.map((d) => d.down)) / totalRV : 0,
        latest: { realized_variance: last.rv, bipower_variation: last.bv, jump_component: last.jump, jump_z: last.z, jump: last.isJump, semivariance_up: last.up, semivariance_down: last.down, realized_skewness: last.skew, realized_kurtosis: last.kurt, annual_volatility: Math.sqrt(last.rv * ppy) },
        series: a.include_series ? { realized_variance: days.map((d) => d.rv), bipower_variation: days.map((d) => d.bv), jump_z: days.map((d) => d.z) } : undefined,
        method: "RV = sum r^2; BV = (pi/2) sum |r_i||r_i-1|; BNS ratio test with tripower quarticity, max(1, TQ/BV^2) adjustment.",
      };
    },
  },
  {
    name: "dependence_measures",
    title: "Dependence beyond correlation",
    description: "Measure how two series move together: Pearson, Spearman and Kendall correlations with p-values, distance correlation (catches nonlinear dependence), and empirical lower and upper tail dependence (do they crash together?).",
    keywords: "correlation spearman kendall tau distance correlation tail dependence copula nonlinear dependence crash together diversification",
    input: z.object({
      x: series("First series."), y: series("Second series, same periods."),
      tail_quantile: z.number().gt(0).lt(0.5).optional().describe("Tail for tail dependence, e.g. 0.05 = worst and best 5%; default 0.1."),
    }).strict(),
    run(a) {
      const n = a.x.length, q = a.tail_quantile ?? 0.1;
      if (a.y.length !== n) throw new Error(`x has ${n} values and y ${a.y.length}.`);
      if (n > 10000) throw new Error("Use at most 10,000 observations (Kendall and distance correlation are quadratic).");
      const rp = pearson(a.x, a.y), rx = ranks(a.x), ry = ranks(a.y), rs = pearson(rx, ry), kt = kendall(a.x, a.y);
      const u = rx.map((r) => r / (n + 1)), v = ry.map((r) => r / (n + 1));
      let lo = 0, loBoth = 0, hi = 0, hiBoth = 0;
      for (let i = 0; i < n; i++) { if (u[i] <= q) { lo++; if (v[i] <= q) loBoth++; } if (u[i] > 1 - q) { hi++; if (v[i] > 1 - q) hiBoth++; } }
      return {
        columns: ["measure", "value", "p_value"],
        rows: [["pearson", rp, corrP(rp, n)], ["spearman", rs, corrP(rs, n)], ["kendall_tau_b", kt.tau, kt.p], ["distance_correlation", distanceCorrelation(a.x, a.y), null]],
        lower_tail_dependence: lo ? loBoth / lo : null, upper_tail_dependence: hi ? hiBoth / hi : null, independence_benchmark: q,
        note: `Tail dependence is the share of x's worst (best) ${q * 100}% periods in which y was also in its worst (best) ${q * 100}%; under independence it is about ${q}. Kendall p-value is the asymptotic one with tie correction.`,
      };
    },
  },
  {
    name: "bootstrap_confidence_interval",
    title: "Block-bootstrap confidence interval",
    description: "Put a confidence interval on a performance statistic (Sharpe, Sortino, CAGR, volatility, max drawdown, Calmar, mean) with the stationary block bootstrap, which keeps autocorrelation and volatility clustering; also gives the bootstrap standard error and the share of resamples at or below zero.",
    keywords: "bootstrap confidence interval sharpe uncertainty stationary bootstrap block bootstrap standard error resampling",
    input: z.object({
      returns: returnsArg,
      statistic: z.enum(["sharpe", "sortino", "cagr", "volatility", "max_drawdown", "calmar", "mean"]).optional().describe("Default sharpe."),
      confidence: z.number().gt(0.5).lt(1).optional().describe("Default 0.95."),
      reps: z.number().int().min(100).max(20000).optional().describe("Resamples; default 2000."),
      block: z.number().int().min(1).max(1000).optional().describe("Mean block length; default round(n^(1/3))."),
      seed: z.number().int().min(0).max(4294967295).optional().describe("Default 7."),
      periods_per_year: ppyArg,
    }).strict(),
    run(a) {
      const r = a.returns, n = r.length, kind = a.statistic ?? "sharpe", ppy = a.periods_per_year ?? 252, reps = a.reps ?? 2000, cl = a.confidence ?? 0.95;
      if (n < 20) throw new Error("Need at least 20 returns.");
      if (reps * n > 2e8) throw new Error(`reps x returns = ${reps * n} exceeds the 200,000,000 budget; lower reps to ${Math.floor(2e8 / n)} or fewer.`);
      const block = a.block ?? Math.max(1, Math.round(n ** (1 / 3))), rand = mulberry32(a.seed ?? 7), point = statistic(kind, r, ppy);
      const draws = new Float64Array(reps), buf = new Array(n);
      for (let b = 0; b < reps; b++) { const idx = stationaryDraw(n, block, rand); for (let t = 0; t < n; t++) buf[t] = r[idx[t]]; draws[b] = statistic(kind, buf, ppy); }
      const sorted = Float64Array.from(draws).sort(), lo = quantile(sorted, (1 - cl) / 2), hi = quantile(sorted, 1 - (1 - cl) / 2);
      let le0 = 0; for (const d of draws) if (d <= 0) le0++;
      return { statistic: kind, estimate: point, bootstrap_mean: mean(Array.from(draws)), standard_error: std(Array.from(draws)), confidence: cl, percentile_interval: [lo, hi], basic_interval: [2 * point - hi, 2 * point - lo], share_at_or_below_zero: le0 / reps, block, reps, seed: a.seed ?? 7, bootstrap: "stationary (Politis-Romano), mulberry32(seed)" };
    },
  },
];

function lgamma(x) { return Math.log(Math.abs(gammaFn(x))); }
function gammaFn(x) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
  x -= 1; let s = c[0]; for (let i = 1; i < g + 2; i++) s += c[i] / (x + i);
  const t = x + g + 0.5;
  return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * s;
}

export const RISK = [
  {
    name: "extreme_value_tail",
    title: "Extreme value tail risk (EVT)",
    description: "Model the loss tail with extreme value theory: fit a generalized Pareto distribution to losses beyond a high threshold (peaks over threshold) and estimate value at risk and expected shortfall far into the tail, with the Hill tail index.",
    keywords: "extreme value theory evt generalized pareto peaks over threshold tail risk hill estimator fat tails var es 99.9",
    input: z.object({
      returns: returnsArg,
      threshold_quantile: z.number().min(0.8).max(0.99).optional().describe("Losses above this quantile are the tail; default 0.95."),
      confidence: z.array(z.number().gt(0.9).lt(1)).min(1).max(6).optional().describe("Tail levels for VaR and ES; default [0.99, 0.995, 0.999]."),
    }).strict(),
    run(a) {
      const L = a.returns.map((r) => -r), n = L.length, uq = a.threshold_quantile ?? 0.95, sorted = Float64Array.from(L).sort(), u = quantile(sorted, uq);
      const y = L.filter((v) => v > u).map((v) => v - u), Nu = y.length;
      if (Nu < 20) throw new Error(`Only ${Nu} losses exceed the threshold; need 20. Send more history or lower threshold_quantile.`);
      const opt = nelderMead((th) => gpdNegLL(th, y), [0.1, Math.log(mean(y))], { step: 0.1, tol: 1e-15, maxIter: 20000 });
      const opt2 = nelderMead((th) => gpdNegLL(th, y), opt.x, { step: 0.01, tol: 1e-15, maxIter: 20000 });
      const [xi, logb] = opt2.x, b = Math.exp(logb);
      const top = [...L].sort((p, q) => q - p).slice(0, Nu + 1), hill = top[Nu] > 0 ? mean(top.slice(0, Nu).map((v) => Math.log(v / top[Nu]))) : null;
      const rows = (a.confidence ?? [0.99, 0.995, 0.999]).map((p) => {
        const v = u + (b / xi) * (((n / Nu) * (1 - p)) ** -xi - 1), es = xi < 1 ? v / (1 - xi) + (b - xi * u) / (1 - xi) : null;
        return [p, v, es, quantile(sorted, p)];
      });
      return { threshold: u, exceedances: Nu, shape_xi: xi, scale_beta: b, hill_tail_index: hill ? 1 / hill : null, columns: ["confidence", "var_evt", "es_evt", "var_empirical"], rows, note: "Losses are positive fractions. xi > 0 means a fat (power-law) tail; ES is infinite when xi >= 1. Estimates far beyond the data rest on the GPD fit." };
    },
  },
];

const chainArg = z.object({
  minutes_to_expiry: z.number().positive().max(525600 * 3).describe("Minutes from now to expiry (CBOE convention)."),
  rate: z.number().gt(-0.1).lt(0.5).optional().describe("Risk-free rate to that expiry, continuous; default 0."),
  options: z.array(z.object({ strike: z.number().positive(), call_bid: z.number().min(0), call_ask: z.number().min(0), put_bid: z.number().min(0), put_ask: z.number().min(0) }).strict()).min(5).max(2000).describe("Every strike with call and put bid and ask."),
}).strict();

export const OPTIONS = [
  {
    name: "vix_style_index",
    title: "Model-free implied volatility (VIX method)",
    description: "Compute a VIX-style model-free implied volatility from option chains with the CBOE method: forward from put-call parity, out-of-the-money strips with the two-zero-bid cutoff, per-expiry variance, and interpolation to a constant maturity (30 days by default).",
    keywords: "vix model free implied volatility variance swap fair strike cboe method volatility index option chain 30 day",
    input: z.object({ near: chainArg.describe("Near-term expiry."), next: chainArg.optional().describe("Next-term expiry; omit for a single-expiry variance swap volatility."), days: z.number().positive().max(1000).optional().describe("Constant maturity in days; default 30.") }).strict(),
    run(a) {
      const e1 = expiryVariance(a.near);
      const vol1 = Math.sqrt(Math.max(e1.variance, 0)) * 100;
      const per = (e) => ({ minutes: e.minutes, forward: e.forward, k0: e.k0, strikes_used: e.strikes_used, variance: e.variance, volatility: Math.sqrt(Math.max(e.variance, 0)) * 100 });
      if (!a.next) return { index: vol1, near: per(e1), note: "Single expiry: the model-free implied volatility to that expiry (a variance swap's fair volatility), in percent." };
      const e2 = expiryVariance(a.next), N30 = (a.days ?? 30) * 1440, N365 = 525600;
      if (!(e2.minutes > e1.minutes)) throw new Error("next must expire after near.");
      const w1 = (e2.minutes - N30) / (e2.minutes - e1.minutes), w2 = (N30 - e1.minutes) / (e2.minutes - e1.minutes);
      const total = (e1.T * e1.variance * w1 + e2.T * e2.variance * w2) * N365 / N30;
      return { index: 100 * Math.sqrt(Math.max(total, 0)), near: per(e1), next: per(e2), weights: [w1, w2], note: "In volatility points (percent), as the VIX is quoted." };
    },
  },
  {
    name: "risk_neutral_density",
    title: "Risk-neutral density from option prices",
    description: "Recover the market's risk-neutral distribution from call prices across strikes (Breeden-Litzenberger): density and cumulative probability at each strike, its mean, volatility, skewness and kurtosis, probabilities beyond chosen levels, and strikes where the density is negative (butterfly arbitrage).",
    keywords: "risk neutral density breeden litzenberger implied distribution option implied probability butterfly arbitrage skew",
    input: z.object({
      strikes: z.array(z.number().positive()).min(5).max(2000).describe("Strikes, ascending."),
      call_prices: z.array(z.number().min(0)).min(5).max(2000).describe("Call prices at those strikes, same expiry."),
      years: positive("Time to expiry in years."),
      rate: z.number().gt(-0.1).lt(0.5).optional().describe("Continuous risk-free rate; default 0."),
      levels: z.array(z.number().positive()).max(20).optional().describe("Prices to report the probability of finishing below."),
    }).strict(),
    run(a) {
      const K = a.strikes, C = a.call_prices, n = K.length, g = Math.exp((a.rate ?? 0) * a.years);
      if (C.length !== n) throw new Error(`call_prices has ${C.length} values for ${n} strikes.`);
      for (let i = 1; i < n; i++) if (!(K[i] > K[i - 1])) throw new Error("strikes must be strictly ascending.");
      const rows = [];
      for (let i = 1; i < n - 1; i++) {
        const h1 = K[i] - K[i - 1], h2 = K[i + 1] - K[i];
        const d2 = 2 * (C[i - 1] / (h1 * (h1 + h2)) - C[i] / (h1 * h2) + C[i + 1] / (h2 * (h1 + h2)));
        const d1 = (-h2 / (h1 * (h1 + h2))) * C[i - 1] + ((h2 - h1) / (h1 * h2)) * C[i] + (h1 / (h2 * (h1 + h2))) * C[i + 1];
        rows.push([K[i], g * d2, 1 + g * d1]);
      }
      const ks = rows.map((r) => r[0]), q = rows.map((r) => r[1]);
      const trap = (f) => { let s = 0; for (let i = 1; i < ks.length; i++) s += (f(i) + f(i - 1)) / 2 * (ks[i] - ks[i - 1]); return s; };
      const mass = trap((i) => q[i]), m1 = trap((i) => ks[i] * q[i]) / mass, m2 = trap((i) => (ks[i] - m1) ** 2 * q[i]) / mass;
      const m3 = trap((i) => (ks[i] - m1) ** 3 * q[i]) / mass, m4 = trap((i) => (ks[i] - m1) ** 4 * q[i]) / mass;
      const cdfAt = (L) => { if (L <= ks[0]) return rows[0][2]; if (L >= ks[ks.length - 1]) return rows[rows.length - 1][2]; let j = 1; while (ks[j] < L) j++; const w = (L - ks[j - 1]) / (ks[j] - ks[j - 1]); return rows[j - 1][2] + w * (rows[j][2] - rows[j - 1][2]); };
      return {
        columns: ["strike", "density", "probability_below"], rows,
        mass_captured: mass, mean: m1, volatility_of_price: Math.sqrt(m2), skewness: m3 / m2 ** 1.5, excess_kurtosis: m4 / (m2 * m2) - 3,
        probability_below: (a.levels ?? []).map((L) => [L, cdfAt(L)]),
        negative_density_strikes: rows.filter((r) => r[1] < 0).map((r) => r[0]),
        note: "Second differences on the strike grid (non-uniform allowed). Moments use only the captured strikes, so wide, dense strike grids give better tails; mass_captured well below 1 means the tails are cut off.",
      };
    },
  },
];

export const RATES = [
  {
    name: "merton_credit_risk",
    title: "Merton structural credit risk",
    description: "Back out a firm's asset value and asset volatility from its equity value and equity volatility with Merton's model (equity as a call on assets), then the distance to default, default probability, the implied credit spread and the value of the debt.",
    keywords: "merton model structural credit risk distance to default kmv probability of default credit spread asset volatility equity as option",
    input: z.object({
      equity_value: positive("Market value of equity."),
      equity_volatility: z.number().positive().max(5).describe("Annual equity volatility, e.g. 0.4."),
      debt: positive("Face value of debt due at the horizon (KMV uses short-term debt plus half of long-term debt)."),
      years: z.number().positive().max(50).optional().describe("Horizon in years; default 1."),
      rate: z.number().gt(-0.1).lt(0.5).optional().describe("Continuous risk-free rate; default 0.03."),
      asset_drift: z.number().gt(-1).lt(1).optional().describe("Expected asset return for a real-world default probability; optional."),
    }).strict(),
    run(a) {
      const E = a.equity_value, sE = a.equity_volatility, D = a.debt, T = a.years ?? 1, r = a.rate ?? 0.03;
      const assetFor = (sv) => brent((V) => mertonEquity(V, sv, D, r, T).E - E, E, E + D * Math.exp(-r * T) * 1.000001 + E * 10);
      const gap = (sv) => { const V = assetFor(sv), m = mertonEquity(V, sv, D, r, T); return normCdf(m.d1) * sv * V - sE * E; };
      let lo = 1e-6, hi = sE; while (gap(hi) < 0 && hi < 50) hi *= 2;
      const sv = brent(gap, lo, hi), V = assetFor(sv), m = mertonEquity(V, sv, D, r, T), debtValue = V - E;
      const out = { asset_value: V, asset_volatility: sv, d1: m.d1, distance_to_default: m.d2, default_probability_risk_neutral: normCdf(-m.d2), debt_value: debtValue, credit_spread: -Math.log(debtValue / (D * Math.exp(-r * T))) / T, leverage: D / V };
      if (a.asset_drift !== undefined) { const dd = (Math.log(V / D) + (a.asset_drift - sv * sv / 2) * T) / (sv * Math.sqrt(T)); out.distance_to_default_real_world = dd; out.default_probability_real_world = normCdf(-dd); }
      return { ...out, note: "Default is assets below the debt's face value at the horizon. The model's spreads are known to be too low for short horizons; read them as a ranking, not a price." };
    },
  },
];
