// Portfolio construction and risk: risk decomposition, minimum variance, maximum Sharpe, mean-variance
// targets, risk parity, inverse volatility, hierarchical risk parity, the efficient frontier,
// Black-Litterman, Ledoit-Wolf shrinkage, correlation, rebalancing trades and multi-asset Kelly.
//
// Inputs are either a returns matrix (rows are periods, columns are assets; annualized with
// periods_per_year) or an annual covariance matrix with expected returns. Long-only problems are
// solved exactly by an active-set method, not by a generic optimizer.
import { z } from "zod";

import { covariance as cov2, dot, matVec, mean, normInv, solve, std, sum, symmetricEigen } from "../math.mjs";
import { ppyArg } from "../inputs.mjs";

const MAX_ASSETS = 200;
const matrixArg = (what) => z.array(z.array(z.number()).min(1).max(MAX_ASSETS)).min(1).max(100000).describe(what);
const sources = {
  returns: matrixArg("Asset returns, one row per period, one column per asset, e.g. [[0.01, 0.002], [-0.004, 0.01], ...].").optional(),
  covariance: matrixArg("Annual covariance matrix, instead of returns.").optional(),
  expected_returns: z.array(z.number()).max(MAX_ASSETS).optional().describe("Annual expected returns per asset; default the annualized sample mean of returns."),
  periods_per_year: ppyArg,
  assets: z.array(z.string().max(60)).max(MAX_ASSETS).optional().describe("Asset names, to label the weights."),
};
const weightsArg = z.array(z.number()).min(1).max(MAX_ASSETS).describe("Portfolio weights per asset, e.g. [0.6, 0.4].");
const boundsArg = {
  long_only: z.boolean().optional().describe("Forbid short positions; default true."),
  max_weight: z.number().gt(0).max(1).optional().describe("Cap on any one weight (long-only); default none."),
};

function isSquareSymmetric(C) {
  const n = C.length;
  for (let i = 0; i < n; i++) {
    if (C[i].length !== n) throw new Error(`covariance row ${i} has ${C[i].length} entries; it must be ${n} x ${n}.`);
    for (let j = 0; j < i; j++) if (Math.abs(C[i][j] - C[j][i]) > 1e-10 * (Math.abs(C[i][j]) + 1e-12)) throw new Error(`covariance is not symmetric at (${i}, ${j}).`);
  }
}

// Annual covariance and expected returns from either source.
export function estimates(a, { needMu = false } = {}) {
  const ppy = a.periods_per_year ?? 252;
  let C, mu, cols;
  if ((a.returns === undefined) === (a.covariance === undefined)) throw new Error("Send exactly one of returns or covariance.");
  if (a.returns) {
    const R = a.returns, n = R[0].length;
    R.forEach((row, i) => { if (row.length !== n) throw new Error(`returns row ${i} has ${row.length} assets; row 0 has ${n}.`); });
    if (R.length < n + 1) throw new Error(`Need more periods (${R.length}) than assets (${n}) to estimate a covariance.`);
    cols = Array.from({ length: n }, (_, j) => R.map((r) => r[j]));
    C = cols.map((x) => cols.map((y) => cov2(x, y) * ppy));
    mu = cols.map((x) => mean(x) * ppy);
  } else {
    C = a.covariance; isSquareSymmetric(C);
  }
  if (a.expected_returns) { if (a.expected_returns.length !== C.length) throw new Error(`expected_returns has ${a.expected_returns.length} entries for ${C.length} assets.`); mu = a.expected_returns; }
  if (needMu && !mu) throw new Error("Send expected_returns with a covariance matrix.");
  if (a.assets && a.assets.length !== C.length) throw new Error(`assets has ${a.assets.length} names for ${C.length} assets.`);
  return { C, mu, cols, n: C.length, names: a.assets ?? C.map((_, i) => `asset_${i + 1}`) };
}

const label = (names, w) => Object.fromEntries(names.map((n, i) => [n, w[i]]));
const portVar = (C, w) => dot(w, matVec(C, w));

// Minimizes 0.5 w'Cw - q'w subject to a'w = b and lo <= w <= hi, by a primal active-set method
// started from a feasible point. Exact up to the linear solves.
export function boxQP(C, q, a, b, lo, hi, start) {
  const n = C.length;
  let w = [...start];
  const fixed = new Array(n).fill(0); // -1 at lower, +1 at upper, 0 free
  for (let i = 0; i < n; i++) if (w[i] <= lo[i] + 1e-15) { fixed[i] = -1; w[i] = lo[i]; } else if (w[i] >= hi[i] - 1e-15) { fixed[i] = 1; w[i] = hi[i]; }
  for (let iter = 0; iter < 50 * n + 100; iter++) {
    const U = [...Array(n).keys()].filter((i) => fixed[i] === 0);
    if (U.length === 0) return w;
    // KKT on the free set: C_UU x + nu a_U = q_U - C_UF w_F, a_U'x = b - a_F'w_F.
    const m = U.length, K = Array.from({ length: m + 1 }, () => new Array(m + 1).fill(0)), rhs = new Array(m + 1).fill(0);
    let bf = b;
    for (let i = 0; i < n; i++) if (fixed[i] !== 0) bf -= a[i] * w[i];
    U.forEach((i, r) => {
      U.forEach((j, c) => { K[r][c] = C[i][j]; });
      K[r][m] = a[i]; K[m][r] = a[i];
      let s = q[i]; for (let j = 0; j < n; j++) if (fixed[j] !== 0) s -= C[i][j] * w[j];
      rhs[r] = s;
    });
    rhs[m] = bf;
    const x = solve(K, rhs), nu = x[m];
    // Step toward the free-set optimum until the first bound is hit.
    let step = 1, block = -1, side = 0;
    U.forEach((i, r) => {
      const d = x[r] - w[i];
      if (d < 0 && x[r] < lo[i]) { const s = (lo[i] - w[i]) / d; if (s < step) { step = s; block = i; side = -1; } }
      if (d > 0 && x[r] > hi[i]) { const s = (hi[i] - w[i]) / d; if (s < step) { step = s; block = i; side = 1; } }
    });
    U.forEach((i, r) => { w[i] += step * (x[r] - w[i]); });
    if (block >= 0) { fixed[block] = side; w[block] = side < 0 ? lo[block] : hi[block]; continue; }
    // At the free-set optimum: release the bound whose multiplier has the wrong sign, if any.
    const g = matVec(C, w);
    let worst = -1, worstV = 1e-13;
    for (let i = 0; i < n; i++) {
      if (fixed[i] === 0 || hi[i] - lo[i] < 1e-15) continue; // equal bounds pin the weight for good
      const lam = g[i] - q[i] + nu * a[i];
      const viol = fixed[i] < 0 ? -lam : lam;
      if (viol > worstV) { worstV = viol; worst = i; }
    }
    if (worst < 0) return w;
    fixed[worst] = 0;
  }
  throw new Error("The optimizer did not converge; check that the covariance is positive definite.");
}

function feasibleStart(n, maxW) {
  const hi = new Array(n).fill(maxW ?? Infinity);
  if (maxW !== undefined && maxW * n < 1 - 1e-12) throw new Error(`max_weight ${maxW} x ${n} assets < 1; no fully invested portfolio fits.`);
  return { start: new Array(n).fill(1 / n), hi };
}

export function minVariance(C, { longOnly = true, maxW } = {}) {
  const n = C.length, ones = new Array(n).fill(1);
  if (!longOnly) { const x = solve(C, ones), s = sum(x); return x.map((v) => v / s); }
  const { start, hi } = feasibleStart(n, maxW);
  return boxQP(C, new Array(n).fill(0), ones, 1, new Array(n).fill(0), hi, start);
}

function maxSharpe(C, mu, rf, { longOnly = true } = {}) {
  const ex = mu.map((m) => m - rf);
  if (!longOnly) {
    const x = solve(C, ex), s = sum(x);
    if (!(s > 0)) throw new Error("No tangency portfolio with positive excess return exists for these inputs (the sum of weights is not positive).");
    return x.map((v) => v / s);
  }
  if (!ex.some((e) => e > 0)) throw new Error("No asset has an expected return above the risk-free rate; the long-only maximum Sharpe portfolio does not exist.");
  // min y'Cy s.t. ex'y = 1, y >= 0; then w = y / sum(y).
  const n = C.length, k = ex.indexOf(Math.max(...ex)), start = new Array(n).fill(0);
  start[k] = 1 / ex[k];
  const y = boxQP(C, new Array(n).fill(0), ex, 1, new Array(n).fill(0), new Array(n).fill(Infinity), start);
  const s = sum(y);
  return y.map((v) => v / s);
}

function meanVarianceTarget(C, mu, target, { longOnly = true, maxW } = {}) {
  const n = C.length, ones = new Array(n).fill(1);
  if (!longOnly) {
    // Two-fund closed form.
    const ci1 = solve(C, ones), cim = solve(C, mu), A = sum(ci1), B = dot(ones, cim), Cc = dot(mu, cim), D = A * Cc - B * B;
    const l = (Cc - B * target) / D, g = (A * target - B) / D;
    return ci1.map((v, i) => l * v + g * cim[i]);
  }
  if (target > Math.max(...mu) + 1e-12 || target < Math.min(...mu) - 1e-12) throw new Error(`target_return ${target} is outside the assets' range [${Math.min(...mu)}, ${Math.max(...mu)}]; long-only cannot reach it.`);
  // Fold the return target in as a penalty-free second equality by solving on lambda with bisection.
  const lo = new Array(n).fill(0), hi = new Array(n).fill(maxW ?? Infinity);
  const solveL = (lam) => boxQP(C, mu.map((m) => lam * m), ones, 1, lo, hi, feasibleStart(n, maxW).start);
  let a = 0, b = 1;
  const ret = (lam) => dot(solveL(lam), mu);
  if (ret(0) >= target - 1e-12) throw new Error(`target_return ${target} is at or below the minimum-variance portfolio's return ${ret(0)}; use min_variance_portfolio, which is the efficient choice there.`);
  while (ret(b) < target - 1e-12 && b < 1e8) b *= 2;
  for (let i = 0; i < 200 && b - a > 1e-14 * b; i++) { const m = 0.5 * (a + b); if (ret(m) < target) a = m; else b = m; }
  return solveL(b);
}

// Equal risk contributions (optionally budgeted) by Newton on the log-barrier formulation
// (Spinu 2013): minimize 0.5 x'Cx - sum b_i log x_i, then normalize.
function riskParity(C, budgets) {
  const n = C.length, b = budgets ?? new Array(n).fill(1 / n);
  let x = C.map((row, i) => 1 / Math.sqrt(row[i]));
  for (let it = 0; it < 200; it++) {
    const Cx = matVec(C, x), g = Cx.map((v, i) => v - b[i] / x[i]);
    const H = C.map((row, i) => row.map((v, j) => v + (i === j ? b[i] / (x[i] * x[i]) : 0)));
    const d = solve(H, g);
    let t = 1;
    while (d.some((v, i) => x[i] - t * v <= 0)) t /= 2;
    x = x.map((v, i) => v - t * d[i]);
    if (Math.sqrt(dot(g, g)) < 1e-15) break;
  }
  const s = sum(x);
  return x.map((v) => v / s);
}

// Single-linkage clustering on distance sqrt((1 - rho) / 2), then the López de Prado quasi-diagonal
// order and recursive bisection with inverse-variance cluster weights.
function hrp(C) {
  const n = C.length, sd = C.map((r, i) => Math.sqrt(r[i]));
  const D = C.map((r, i) => r.map((v, j) => Math.sqrt(Math.max(0, (1 - v / (sd[i] * sd[j])) / 2))));
  // Pairwise distance between the distance vectors (as in the paper).
  const E = D.map((ri) => D.map((rj) => Math.sqrt(ri.reduce((s, v, k) => s + (v - rj[k]) ** 2, 0))));
  let clusters = Array.from({ length: n }, (_, i) => ({ id: i, members: [i] }));
  const link = [];
  let nextId = n;
  while (clusters.length > 1) {
    let best = [0, 1], bd = Infinity;
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      let d = Infinity;
      for (const p of clusters[i].members) for (const q of clusters[j].members) if (E[p][q] < d) d = E[p][q];
      if (d < bd - 1e-15) { bd = d; best = [i, j]; }
    }
    const [i, j] = best, A = clusters[i], B = clusters[j];
    const [lo, hi] = A.id < B.id ? [A, B] : [B, A];
    link.push([lo.id, hi.id]);
    clusters = clusters.filter((_, k) => k !== i && k !== j);
    clusters.push({ id: nextId++, members: [...lo.members, ...hi.members] });
  }
  // Quasi-diagonalization from the last merge down.
  let order = [link.at(-1)[0], link.at(-1)[1]];
  while (order.some((v) => v >= n)) order = order.flatMap((v) => (v >= n ? link[v - n] : [v]));
  const w = new Array(n).fill(1);
  const clusterVar = (items) => {
    const iv = items.map((i) => 1 / C[i][i]), s = sum(iv), ww = iv.map((v) => v / s);
    return ww.reduce((acc, wi, a) => acc + ww.reduce((s2, wj, b2) => s2 + wi * wj * C[items[a]][items[b2]], 0), 0);
  };
  let groups = [order];
  while (groups.length) {
    groups = groups.flatMap((g) => (g.length > 1 ? [g.slice(0, Math.floor(g.length / 2)), g.slice(Math.floor(g.length / 2))] : []));
    for (let k = 0; k < groups.length; k += 2) {
      const v0 = clusterVar(groups[k]), v1 = clusterVar(groups[k + 1]), alpha = 1 - v0 / (v0 + v1);
      for (const i of groups[k]) w[i] *= alpha;
      for (const i of groups[k + 1]) w[i] *= 1 - alpha;
    }
  }
  return { weights: w, order };
}

function riskReport(C, w, names, mu) {
  const v = portVar(C, w), vol = Math.sqrt(v), mrc = matVec(C, w).map((x) => x / vol), crc = w.map((wi, i) => wi * mrc[i]);
  const sds = C.map((r, i) => Math.sqrt(r[i]));
  return {
    weights: label(names, w), volatility: vol, expected_return: mu ? dot(w, mu) : undefined,
    risk_contribution_percent: label(names, crc.map((c) => c / vol)), marginal_risk: label(names, mrc),
    diversification_ratio: dot(w, sds) / vol, effective_number_of_assets: 1 / w.reduce((s, x) => s + x * x, 0),
  };
}

function ledoitWolf(cols) {
  // Shrinkage toward a scaled identity, Ledoit and Wolf (2004), on centred data with 1/n moments.
  const n = cols[0].length, p = cols.length;
  const X = cols.map((c) => { const m = mean(c); return c.map((v) => v - m); });
  const S = X.map((a) => X.map((b) => a.reduce((s, v, k) => s + v * b[k], 0) / n));
  const mu = S.reduce((s, r, i) => s + r[i], 0) / p;
  let d2 = 0; for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) d2 += (S[i][j] - (i === j ? mu : 0)) ** 2;
  d2 /= p;
  let b2 = 0;
  for (let k = 0; k < n; k++) { let s = 0; for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) s += (X[i][k] * X[j][k] - S[i][j]) ** 2; b2 += s; }
  b2 = Math.min(b2 / p / (n * n), d2);
  const shrink = d2 === 0 ? 0 : b2 / d2;
  return { shrinkage: shrink, matrix: S.map((r, i) => r.map((v, j) => (1 - shrink) * v + (i === j ? shrink * mu : 0))) };
}

const rank = (x) => {
  const idx = x.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]), r = new Array(x.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; }
  return r;
};

export const TOOLS = [
  {
    name: "portfolio_risk",
    title: "Portfolio risk decomposition",
    description: "Decompose a portfolio's volatility into each asset's risk contribution, with marginal risk, diversification ratio, effective number of assets, parametric VaR and ex-ante tracking error to a benchmark.",
    keywords: "portfolio risk contribution decomposition marginal risk volatility diversification ratio tracking error ex ante var",
    input: z.object({ ...sources, weights: weightsArg, benchmark_weights: weightsArg.optional().describe("Benchmark weights, for ex-ante tracking error."), confidence: z.number().gt(0.5).lt(1).optional().describe("VaR confidence; default 0.95.") }).strict(),
    run(a) {
      const { C, mu, names, n } = estimates(a);
      if (a.weights.length !== n) throw new Error(`weights has ${a.weights.length} entries for ${n} assets.`);
      const rep = riskReport(C, a.weights, names, mu), z95 = -normInv(1 - (a.confidence ?? 0.95));
      const te = a.benchmark_weights ? Math.sqrt(portVar(C, a.weights.map((w, i) => w - a.benchmark_weights[i]))) : undefined;
      return { ...rep, annual_var_parametric: z95 * rep.volatility - (rep.expected_return ?? 0), tracking_error: te };
    },
  },
  {
    name: "min_variance_portfolio",
    title: "Minimum variance portfolio",
    description: "Find the fully invested minimum-variance portfolio, long-only with an optional weight cap (exact active-set solution) or unconstrained (closed form).",
    keywords: "minimum variance portfolio global min variance gmv low volatility optimizer",
    input: z.object({ ...sources, ...boundsArg }).strict(),
    run(a) { const { C, mu, names } = estimates(a); return riskReport(C, minVariance(C, { longOnly: a.long_only ?? true, maxW: a.max_weight }), names, mu); },
  },
  {
    name: "max_sharpe_portfolio",
    title: "Maximum Sharpe (tangency) portfolio",
    description: "Find the portfolio with the highest Sharpe ratio, long-only (exact) or unconstrained (closed form tangency), with its expected return, volatility and Sharpe.",
    keywords: "maximum sharpe ratio tangency portfolio mean variance optimal markowitz",
    input: z.object({ ...sources, risk_free: z.number().gt(-1).lt(1).optional().describe("Annual risk-free rate; default 0."), long_only: boundsArg.long_only }).strict(),
    run(a) {
      const { C, mu, names } = estimates(a, { needMu: true }), rf = a.risk_free ?? 0;
      const w = maxSharpe(C, mu, rf, { longOnly: a.long_only ?? true }), rep = riskReport(C, w, names, mu);
      return { ...rep, sharpe: (rep.expected_return - rf) / rep.volatility };
    },
  },
  {
    name: "mean_variance_portfolio",
    title: "Mean-variance portfolio for a target",
    description: "Find the minimum-variance portfolio that reaches a target expected return, or the utility-maximizing portfolio for a risk aversion, long-only or unconstrained.",
    keywords: "mean variance optimization markowitz target return risk aversion efficient portfolio",
    input: z.object({ ...sources, target_return: z.number().gt(-1).lt(5).optional().describe("Annual target return; or send risk_aversion."), risk_aversion: z.number().positive().max(1000).optional().describe("Lambda in max mu'w - lambda/2 w'Cw."), ...boundsArg }).strict(),
    run(a) {
      const { C, mu, names, n } = estimates(a, { needMu: true }), lo = a.long_only ?? true;
      if ((a.target_return === undefined) === (a.risk_aversion === undefined)) throw new Error("Send exactly one of target_return or risk_aversion.");
      let w;
      if (a.target_return !== undefined) w = meanVarianceTarget(C, mu, a.target_return, { longOnly: lo, maxW: a.max_weight });
      else if (!lo) { const ones = new Array(n).fill(1), ci1 = solve(C, ones), cim = solve(C, mu), A = sum(ci1), B = sum(cim), nu = (B - a.risk_aversion) / A; w = cim.map((v, i) => (v - nu * ci1[i]) / a.risk_aversion); }
      else { const { start, hi } = feasibleStart(n, a.max_weight); w = boxQP(C.map((r) => r.map((v) => v * a.risk_aversion)), mu, new Array(n).fill(1), 1, new Array(n).fill(0), hi, start); }
      return riskReport(C, w, names, mu);
    },
  },
  {
    name: "risk_parity_portfolio",
    title: "Risk parity (equal risk contribution)",
    description: "Find long-only weights where every asset contributes equally (or by a given budget) to portfolio volatility, solved by Newton's method.",
    keywords: "risk parity equal risk contribution erc risk budgeting all weather",
    input: z.object({ ...sources, risk_budgets: z.array(z.number().positive()).max(MAX_ASSETS).optional().describe("Target risk shares summing to 1; default equal.") }).strict(),
    run(a) {
      const { C, mu, names, n } = estimates(a);
      let b = a.risk_budgets;
      if (b) { if (b.length !== n) throw new Error(`risk_budgets has ${b.length} entries for ${n} assets.`); const s = sum(b); b = b.map((v) => v / s); }
      return riskReport(C, riskParity(C, b), names, mu);
    },
  },
  {
    name: "inverse_volatility_weights",
    title: "Inverse volatility weights",
    description: "Weight assets in proportion to the inverse of their volatility (or variance), the simple risk-balancing heuristic.",
    keywords: "inverse volatility weighting naive risk parity inverse variance",
    input: z.object({ ...sources, use_variance: z.boolean().optional().describe("Weight by inverse variance instead; default false.") }).strict(),
    run(a) { const { C, mu, names } = estimates(a), iv = C.map((r, i) => (a.use_variance ? 1 / r[i] : 1 / Math.sqrt(r[i]))), s = sum(iv); return riskReport(C, iv.map((v) => v / s), names, mu); },
  },
  {
    name: "hierarchical_risk_parity",
    title: "Hierarchical risk parity",
    description: "Allocate with López de Prado's hierarchical risk parity: single-linkage clustering on correlation distance, quasi-diagonal ordering and recursive bisection.",
    keywords: "hrp hierarchical risk parity lopez de prado clustering allocation machine learning",
    input: z.object({ ...sources }).strict(),
    run(a) { const { C, mu, names } = estimates(a), h = hrp(C); return { ...riskReport(C, h.weights, names, mu), cluster_order: h.order.map((i) => names[i]) }; },
  },
  {
    name: "efficient_frontier",
    title: "Efficient frontier",
    description: "Trace the efficient frontier: minimum volatility at evenly spaced target returns from the minimum-variance portfolio to the highest-return asset, with weights.",
    keywords: "efficient frontier markowitz mean variance curve risk return tradeoff",
    input: z.object({ ...sources, points: z.number().int().min(2).max(100).optional().describe("Points on the frontier; default 20."), ...boundsArg }).strict(),
    run(a) {
      const { C, mu, names } = estimates(a, { needMu: true }), lo = a.long_only ?? true, k = a.points ?? 20;
      const gmv = minVariance(C, { longOnly: lo, maxW: a.max_weight }), r0 = dot(gmv, mu), r1 = lo ? Math.max(...mu) : r0 + 2 * (Math.max(...mu) - r0);
      const rows = [];
      for (let i = 0; i < k; i++) {
        const t = r0 + (r1 - r0) * i / (k - 1), w = i === 0 ? gmv : meanVarianceTarget(C, mu, t, { longOnly: lo, maxW: a.max_weight });
        rows.push([dot(w, mu), Math.sqrt(portVar(C, w)), ...w]);
      }
      return { columns: ["expected_return", "volatility", ...names], rows };
    },
  },
  {
    name: "black_litterman",
    title: "Black-Litterman posterior returns",
    description: "Blend market-implied equilibrium returns with your views (absolute or relative, with confidence) into Black-Litterman posterior returns and the unconstrained optimal weights.",
    keywords: "black litterman views equilibrium implied returns posterior bayesian allocation",
    input: z.object({
      covariance: matrixArg("Annual covariance matrix."),
      market_weights: weightsArg.describe("Market-cap weights, for the equilibrium prior."),
      risk_aversion: z.number().positive().max(100).optional().describe("Market risk aversion delta; default 2.5."),
      tau: z.number().positive().max(1).optional().describe("Prior uncertainty scale; default 0.05."),
      views: z.array(z.object({
        weights: weightsArg.describe("View portfolio, e.g. [1, -1, 0] for asset 1 beats asset 2."),
        expected_return: z.number().gt(-1).lt(5).describe("The view's annual expected return, e.g. 0.02."),
        variance: z.number().positive().optional().describe("Uncertainty of the view; default tau x p'Cp (He-Litterman)."),
      }).strict()).min(1).max(50).describe("Your views."),
      assets: sources.assets,
    }).strict(),
    run(a) {
      const C = a.covariance; isSquareSymmetric(C);
      const n = C.length, d = a.risk_aversion ?? 2.5, tau = a.tau ?? 0.05, names = a.assets ?? C.map((_, i) => `asset_${i + 1}`);
      const pi = matVec(C, a.market_weights).map((v) => d * v);
      const P = a.views.map((v) => { if (v.weights.length !== n) throw new Error("Each view needs one weight per asset."); return v.weights; }), Q = a.views.map((v) => v.expected_return);
      const tC = C.map((r) => r.map((v) => v * tau));
      const Om = P.map((p, i) => P.map((_, j) => (i === j ? (a.views[i].variance ?? dot(p, matVec(tC, p))) : 0)));
      // mu = pi + tC P' (P tC P' + Om)^-1 (Q - P pi)
      const PtC = P.map((p) => matVec(tC, p)); // rows: (tC P')' since tC symmetric
      const M = P.map((p, i) => P.map((_, j) => dot(p, PtC[j]) + Om[i][j]));
      const resid = Q.map((q, i) => q - dot(P[i], pi)), x = solve(M, resid);
      const post = pi.map((v, k) => v + PtC.reduce((s, row, i) => s + row[k] * x[i], 0));
      const w = solve(C, post).map((v) => v / d);
      return { equilibrium_returns: label(names, pi), posterior_returns: label(names, post), optimal_weights: label(names, w), note: "Weights are unconstrained (may short, may not sum to 1): w = C^-1 mu / delta." };
    },
  },
  {
    name: "covariance_shrinkage",
    title: "Ledoit-Wolf covariance shrinkage",
    description: "Estimate a well-conditioned covariance matrix by Ledoit-Wolf shrinkage toward a scaled identity, with the shrinkage intensity and condition numbers before and after.",
    keywords: "ledoit wolf shrinkage covariance estimation condition number robust estimator",
    input: z.object({ returns: sources.returns.unwrap(), periods_per_year: ppyArg }).strict(),
    run(a) {
      const R = a.returns, p = R[0].length, cols = Array.from({ length: p }, (_, j) => R.map((r) => r[j])), ppy = a.periods_per_year ?? 252;
      const lw = ledoitWolf(cols), cond = (M) => { const e = symmetricEigen(M).values; return e[0] / e.at(-1); };
      const sample = cols.map((x) => cols.map((y) => cov2(x, y, 0)));
      return { shrinkage: lw.shrinkage, covariance_annual: lw.matrix.map((r) => r.map((v) => v * ppy)), covariance_per_period: lw.matrix, condition_number_sample: cond(sample), condition_number_shrunk: cond(lw.matrix) };
    },
  },
  {
    name: "correlation_matrix",
    title: "Correlation matrix",
    description: "Compute Pearson or Spearman rank correlations between assets, with the average pairwise correlation and the largest eigenvalue's share (how much one factor drives everything).",
    keywords: "correlation matrix pearson spearman rank pairwise average correlation eigenvalue",
    input: z.object({ returns: sources.returns.unwrap(), method: z.enum(["pearson", "spearman"]).optional().describe("Default pearson."), assets: sources.assets }).strict(),
    run(a) {
      const R = a.returns, p = R[0].length;
      let cols = Array.from({ length: p }, (_, j) => R.map((r) => r[j]));
      if (a.method === "spearman") cols = cols.map(rank);
      const sd = cols.map((c) => std(c));
      const M = cols.map((x, i) => cols.map((y, j) => (i === j ? 1 : cov2(x, y) / (sd[i] * sd[j]))));
      let s = 0; for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) s += M[i][j];
      const ev = symmetricEigen(M).values;
      return { assets: a.assets ?? cols.map((_, i) => `asset_${i + 1}`), matrix: M, average_pairwise: p > 1 ? s / (p * (p - 1) / 2) : null, first_eigenvalue_share: ev[0] / p };
    },
  },
  {
    name: "rebalance_trades",
    title: "Rebalancing trades",
    description: "Turn current holdings and target weights into the share trades that rebalance the portfolio, with turnover, optional no-trade bands, and cash left over.",
    keywords: "rebalance trades target weights drift turnover orders shares threshold band",
    input: z.object({
      holdings: z.array(z.number()).min(1).max(MAX_ASSETS).describe("Current shares (or units) held per asset."),
      prices: z.array(z.number().positive()).min(1).max(MAX_ASSETS).describe("Current price per asset."),
      target_weights: weightsArg.describe("Target weights per asset, summing to at most 1 (the rest stays cash)."),
      cash: z.number().optional().describe("Cash on hand; default 0."),
      band: z.number().min(0).max(1).optional().describe("Skip assets whose weight is within this distance of target, e.g. 0.02; default 0."),
      whole_shares: z.boolean().optional().describe("Round trades to whole shares; default true."),
      assets: sources.assets,
    }).strict(),
    run(a) {
      const n = a.holdings.length;
      if (a.prices.length !== n || a.target_weights.length !== n) throw new Error("holdings, prices and target_weights need one entry per asset.");
      const vals = a.holdings.map((h, i) => h * a.prices[i]), nav = sum(vals) + (a.cash ?? 0);
      if (!(nav > 0)) throw new Error("Portfolio value must be positive.");
      const names = a.assets ?? a.holdings.map((_, i) => `asset_${i + 1}`), whole = a.whole_shares ?? true;
      const rows = []; let traded = 0, cashAfter = a.cash ?? 0;
      for (let i = 0; i < n; i++) {
        const w = vals[i] / nav, tgt = a.target_weights[i];
        let shares = Math.abs(w - tgt) <= (a.band ?? 0) ? 0 : (tgt * nav - vals[i]) / a.prices[i];
        if (whole) shares = Math.trunc(shares);
        traded += Math.abs(shares) * a.prices[i]; cashAfter -= shares * a.prices[i];
        rows.push([names[i], w, tgt, shares, shares * a.prices[i]]);
      }
      return { nav, columns: ["asset", "current_weight", "target_weight", "trade_shares", "trade_value"], rows, turnover: traded / nav / 2, cash_after: cashAfter };
    },
  },
  {
    name: "kelly_portfolio",
    title: "Multi-asset Kelly weights",
    description: "Compute growth-optimal (Kelly) weights across assets, inverse covariance times excess returns, with half-Kelly and the implied leverage and growth rate.",
    keywords: "kelly criterion multi asset growth optimal portfolio leverage half kelly",
    input: z.object({ ...sources, risk_free: z.number().gt(-1).lt(1).optional().describe("Annual risk-free rate; default 0."), fraction: z.number().positive().max(1).optional().describe("Fraction of full Kelly; default 1.") }).strict(),
    run(a) {
      const { C, mu, names } = estimates(a, { needMu: true }), rf = a.risk_free ?? 0, f = a.fraction ?? 1;
      const ex = mu.map((m) => m - rf), full = solve(C, ex), w = full.map((v) => v * f);
      return { weights: label(names, w), leverage: w.reduce((s, v) => s + Math.abs(v), 0), net_exposure: sum(w), expected_growth: rf + dot(w, ex) - 0.5 * portVar(C, w), note: "Continuous-time Kelly; estimation error makes full Kelly far too aggressive in practice." };
    },
  },
  {
    name: "max_diversification_portfolio",
    title: "Maximum diversification portfolio",
    description: "Find the long-only portfolio with the highest diversification ratio (weighted average volatility over portfolio volatility), Choueifaty and Coignard's most-diversified portfolio.",
    keywords: "maximum diversification most diversified portfolio choueifaty diversification ratio",
    input: z.object({ ...sources }).strict(),
    run(a) {
      const { C, mu, names } = estimates(a), sds = C.map((r, i) => Math.sqrt(r[i]));
      // Same problem as maximum Sharpe with volatilities in place of excess returns.
      return riskReport(C, maxSharpe(C, sds, 0, { longOnly: true }), names, mu);
    },
  },
  {
    name: "index_tracking_portfolio",
    title: "Index tracking portfolio",
    description: "Find long-only weights in a subset of assets that minimize ex-ante tracking error to a benchmark's weights, with an optional per-asset cap.",
    keywords: "index tracking replication tracking error minimization benchmark subset sampling optimizer",
    input: z.object({
      ...sources,
      benchmark_weights: weightsArg.describe("Benchmark weight of every asset."),
      allowed: z.array(z.boolean()).max(MAX_ASSETS).optional().describe("Which assets may be held; default all."),
      max_weight: boundsArg.max_weight,
    }).strict(),
    run(a) {
      const { C, mu, names, n } = estimates(a), b = a.benchmark_weights;
      if (b.length !== n) throw new Error(`benchmark_weights has ${b.length} entries for ${n} assets.`);
      const ok = a.allowed ?? new Array(n).fill(true), k = ok.filter(Boolean).length;
      if (!k) throw new Error("No asset is allowed.");
      const cap = a.max_weight ?? Infinity;
      if (cap * k < 1 - 1e-12) throw new Error("max_weight x allowed assets < 1.");
      const hi = ok.map((x) => (x ? cap : 0)), start = ok.map((x) => (x ? 1 / k : 0));
      const w = boxQP(C, matVec(C, b), new Array(n).fill(1), 1, new Array(n).fill(0), hi, start);
      return { ...riskReport(C, w, names, mu), tracking_error: Math.sqrt(portVar(C, w.map((x, i) => x - b[i]))), holdings: k };
    },
  },
];
