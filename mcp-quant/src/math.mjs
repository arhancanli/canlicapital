// Numerical core shared by every tool: moments, quantiles, distributions and their inverses, and
// ordinary least squares. Written for double precision and checked against scipy and statsmodels in
// test/reference.test.mjs; nothing here allocates more than one copy of its input.

export const SQRT2 = Math.SQRT2;
const SQRT2PI = Math.sqrt(2 * Math.PI);

export function sum(x) {
  // Neumaier compensated sum: long return series lose digits to naive summation.
  let s = 0, c = 0;
  for (const v of x) {
    const t = s + v;
    c += Math.abs(s) >= Math.abs(v) ? (s - t) + v : (v - t) + s;
    s = t;
  }
  return s + c;
}

export const mean = (x) => sum(x) / x.length;

export function minOf(x) { let m = Infinity; for (const v of x) if (v < m) m = v; return m; }
export function maxOf(x) { let m = -Infinity; for (const v of x) if (v > m) m = v; return m; }

// Sample variance (n - 1) by two passes, for accuracy when the mean is large relative to the spread.
export function variance(x, ddof = 1) {
  const m = mean(x);
  let s = 0;
  for (const v of x) s += (v - m) * (v - m);
  return s / (x.length - ddof);
}

export const std = (x, ddof = 1) => Math.sqrt(variance(x, ddof));

// Bias-uncorrected skewness and excess kurtosis (scipy.stats.skew / kurtosis defaults).
export function moments(x) {
  const n = x.length, m = mean(x);
  let m2 = 0, m3 = 0, m4 = 0;
  for (const v of x) {
    const d = v - m, d2 = d * d;
    m2 += d2; m3 += d2 * d; m4 += d2 * d2;
  }
  m2 /= n; m3 /= n; m4 /= n;
  return { mean: m, skew: m2 > 0 ? m3 / m2 ** 1.5 : 0, excess_kurtosis: m2 > 0 ? m4 / (m2 * m2) - 3 : 0 };
}

// Quantile with linear interpolation between order statistics (numpy's default, "linear", type 7).
export function quantile(sorted, q) {
  const h = (sorted.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export const sortedCopy = (x) => Float64Array.from(x).sort();

export function covariance(x, y, ddof = 1) {
  const mx = mean(x), my = mean(y);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] - mx) * (y[i] - my);
  return s / (x.length - ddof);
}

export const correlation = (x, y) => covariance(x, y) / (std(x) * std(y));

// ---------------------------------------------------------------------------------------------
// Normal distribution
// ---------------------------------------------------------------------------------------------

export const normPdf = (x) => Math.exp(-0.5 * x * x) / SQRT2PI;

// Complementary error function, W. J. Cody's rational approximations (relative error < 1e-16).
export function erfc(x) {
  const ax = Math.abs(x);
  let r;
  if (ax < 0.5) {
    const t = x * x;
    const top = (((0.185777706184603153 * t + 3.16112374387056560) * t + 113.864154151050156) * t + 377.485237685302021) * t + 3209.37758913846947;
    const bot = (((t + 23.6012909523441209) * t + 244.024637934444173) * t + 1282.61652607737228) * t + 2844.23683343917062;
    return 1 - x * top / bot;
  }
  if (ax < 4) {
    const top = (((((((2.15311535474403846e-8 * ax + 0.564188496988670089) * ax + 8.88314979438837594) * ax + 66.1191906371416295) * ax + 298.635138197400131) * ax + 881.952221241769090) * ax + 1712.04761263407058) * ax + 2051.07837782607147) * ax + 1230.33935479799725;
    const bot = (((((((ax + 15.7449261107098347) * ax + 117.693950891312499) * ax + 537.181101862009858) * ax + 1621.38957456669019) * ax + 3290.79923573345963) * ax + 4362.61909014324716) * ax + 3439.36767414372164) * ax + 1230.33935480374942;
    r = Math.exp(-ax * ax) * top / bot;
  } else {
    const z = 1 / (ax * ax);
    const top = ((((0.0163153871373020978 * z + 0.305326634961232344) * z + 0.360344899949804439) * z + 0.125781726111229246) * z + 0.0160837851487422766) * z + 6.58749161529837803e-4;
    const bot = ((((z + 2.56852019228982242) * z + 1.87295284992346725) * z + 0.527905102951428412) * z + 0.0605183413124413191) * z + 2.33520497626869185e-3;
    r = (Math.exp(-ax * ax) / ax) * (1 / Math.sqrt(Math.PI) - z * top / bot);
  }
  return x < 0 ? 2 - r : r;
}

export const normCdf = (x) => 0.5 * erfc(-x / SQRT2);

// Inverse normal CDF: Acklam's rational approximation, then one Halley step (full double precision).
export function normInv(p) {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    throw new RangeError("a probability must be between 0 and 1");
  }
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let x;
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - 0.02425) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = 0.5 * erfc(-x / SQRT2) - p;
  const u = e * SQRT2PI * Math.exp(0.5 * x * x);
  return x - u / (1 + 0.5 * x * u);
}

// ---------------------------------------------------------------------------------------------
// Gamma and beta functions, Student t and chi-square
// ---------------------------------------------------------------------------------------------

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export function logGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Regularized lower incomplete gamma P(a, x): series below a + 1, continued fraction above.
export function gammaP(a, x) {
  if (x <= 0) return 0;
  const lg = logGamma(a);
  if (x < a + 1) {
    let ap = a, s = 1 / a, del = s;
    for (let n = 0; n < 1000; n++) {
      ap += 1; del *= x / ap; s += del;
      if (Math.abs(del) < Math.abs(s) * 1e-16) break;
    }
    return s * Math.exp(-x + a * Math.log(x) - lg);
  }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lg) * h;
}

function betaCf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-300) d = 1e-300;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 1000; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

// Regularized incomplete beta I_x(a, b).
export function betaI(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betaCf(a, b, x) / a : 1 - bt * betaCf(b, a, 1 - x) / b;
}

export function tCdf(t, df) {
  const x = df / (df + t * t);
  const tail = 0.5 * betaI(df / 2, 0.5, x);
  return t > 0 ? 1 - tail : tail;
}

// Two-sided p-value of a t statistic.
export const tPValue = (t, df) => betaI(df / 2, 0.5, df / (df + t * t));

export const chi2Sf = (x, k) => 1 - gammaP(k / 2, x / 2);

// ---------------------------------------------------------------------------------------------
// Ordinary least squares, y = a + b x, with classical standard errors
// ---------------------------------------------------------------------------------------------

export function olsSimple(x, y) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
  const beta = sxy / sxx, alpha = my - beta * mx;
  let sse = 0, sst = 0;
  for (let i = 0; i < n; i++) { const e = y[i] - alpha - beta * x[i]; sse += e * e; sst += (y[i] - my) ** 2; }
  const s2 = sse / (n - 2);
  const seBeta = Math.sqrt(s2 / sxx), seAlpha = Math.sqrt(s2 * (1 / n + mx * mx / sxx));
  return { alpha, beta, se_alpha: seAlpha, se_beta: seBeta, t_alpha: alpha / seAlpha, t_beta: beta / seBeta, r2: sst > 0 ? 1 - sse / sst : 0, residual_std: Math.sqrt(s2), df: n - 2 };
}

// Rounds to 10 significant figures so results are compact and stable across platforms.
export function sig(x, digits = 10) {
  if (typeof x !== "number" || !Number.isFinite(x)) return x === undefined ? null : Number.isNaN(x) ? null : x;
  if (x === 0) return 0;
  return Number(x.toPrecision(digits));
}

// Rounds every number in a plain result tree.
export function compact(v) {
  if (typeof v === "number") return sig(v);
  if (Array.isArray(v)) return v.map(compact);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = compact(x);
    return out;
  }
  return v;
}

// ---------------------------------------------------------------------------------------------
// Linear algebra on plain arrays (rows of numbers)
// ---------------------------------------------------------------------------------------------

export const zeros = (n, m) => Array.from({ length: n }, () => new Array(m).fill(0));
export const transpose = (A) => A[0].map((_, j) => A.map((row) => row[j]));
export function matMul(A, B) {
  const n = A.length, k = B.length, m = B[0].length, C = zeros(n, m);
  for (let i = 0; i < n; i++) for (let p = 0; p < k; p++) { const a = A[i][p]; if (a !== 0) for (let j = 0; j < m; j++) C[i][j] += a * B[p][j]; }
  return C;
}
export const matVec = (A, x) => A.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

// Solves A x = b (A square) by Gaussian elimination with partial pivoting; throws when singular.
export function solve(A, b) {
  const n = A.length, M = A.map((row, i) => [...row, ...(Array.isArray(b[0]) ? b[i] : [b[i]])]), w = M[0].length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14 * Math.max(1, Math.abs(M[c][c]))) throw new Error("The matrix is singular (collinear inputs or a degenerate covariance).");
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f !== 0) for (let j = c; j < w; j++) M[r][j] -= f * M[c][j];
    }
  }
  const X = M.map((row, i) => row.slice(n).map((v) => v / M[i][i]));
  return Array.isArray(b[0]) ? X : X.map((r) => r[0]);
}

export function identity(n) { const I = zeros(n, n); for (let i = 0; i < n; i++) I[i][i] = 1; return I; }
export const inverse = (A) => solve(A, identity(A.length));

// Cholesky factor L (A = L L'); throws when A is not positive definite.
export function cholesky(A) {
  const n = A.length, L = zeros(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (!(s > 0)) throw new Error("The covariance matrix is not positive definite."); L[i][i] = Math.sqrt(s); }
    else L[i][j] = s / L[j][j];
  }
  return L;
}

// Eigen-decomposition of a symmetric matrix by cyclic Jacobi rotations; values descending, vectors
// as columns with the largest-magnitude component positive.
export function symmetricEigen(A) {
  const n = A.length, M = A.map((r) => [...r]), V = identity(n);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += M[i][j] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(M[p][q]) < 1e-300) continue;
      const theta = (M[q][q] - M[p][p]) / (2 * M[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const mkp = M[k][p], mkq = M[k][q];
        M[k][p] = c * mkp - s * mkq; M[k][q] = s * mkp + c * mkq;
      }
      for (let k = 0; k < n; k++) {
        const mpk = M[p][k], mqk = M[q][k];
        M[p][k] = c * mpk - s * mqk; M[q][k] = s * mpk + c * mqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const order = [...Array(n).keys()].sort((a, b) => M[b][b] - M[a][a]);
  const values = order.map((i) => M[i][i]);
  const vectors = order.map((i) => {
    const v = V.map((row) => row[i]);
    let big = 0; for (let k = 1; k < n; k++) if (Math.abs(v[k]) > Math.abs(v[big])) big = k;
    return v[big] < 0 ? v.map((x) => -x) : v;
  });
  return { values, vectors };
}

// Least squares y = X b by Householder QR. Returns coefficients, residuals and (X'X)^-1.
export function leastSquares(X, y) {
  const n = X.length, p = X[0].length;
  if (n <= p) throw new Error(`Need more observations (${n}) than coefficients (${p}).`);
  const A = X.map((r) => [...r]), b = [...y];
  for (let k = 0; k < p; k++) {
    let norm = 0; for (let i = k; i < n; i++) norm += A[i][k] ** 2;
    norm = Math.sqrt(norm);
    if (norm < 1e-300) throw new Error("A regressor is all zeros or collinear with the others.");
    const alpha = A[k][k] > 0 ? -norm : norm;
    const v = new Array(n).fill(0); v[k] = A[k][k] - alpha; for (let i = k + 1; i < n; i++) v[i] = A[i][k];
    let vv = 0; for (let i = k; i < n; i++) vv += v[i] * v[i];
    if (vv === 0) continue;
    for (let j = k; j < p; j++) { let s = 0; for (let i = k; i < n; i++) s += v[i] * A[i][j]; s = 2 * s / vv; for (let i = k; i < n; i++) A[i][j] -= s * v[i]; }
    let s = 0; for (let i = k; i < n; i++) s += v[i] * b[i]; s = 2 * s / vv; for (let i = k; i < n; i++) b[i] -= s * v[i];
  }
  for (let k = 0; k < p; k++) if (Math.abs(A[k][k]) < 1e-12 * Math.abs(A[0][0])) throw new Error("Regressors are collinear; drop one.");
  const coef = new Array(p).fill(0);
  for (let i = p - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < p; j++) s -= A[i][j] * coef[j]; coef[i] = s / A[i][i]; }
  const Rinv = zeros(p, p);
  for (let i = p - 1; i >= 0; i--) { Rinv[i][i] = 1 / A[i][i]; for (let j = i + 1; j < p; j++) { let s = 0; for (let k = i + 1; k <= j; k++) s += A[i][k] * Rinv[k][j]; Rinv[i][j] = -s / A[i][i]; } }
  const xtxInv = matMul(Rinv, transpose(Rinv));
  const resid = y.map((v, i) => v - dot(X[i], coef));
  return { coef, resid, xtxInv };
}

// Brent's root finder on [a, b] with f(a), f(b) of opposite sign.
export function brent(f, a, b, tol = 1e-14, maxIter = 300) {
  let fa = f(a), fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) throw new Error("No sign change in the search interval; no solution there.");
  let c = a, fc = fa, d = b - a, e = d;
  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol, m = 0.5 * (c - b);
    if (Math.abs(m) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      let p, q, r;
      const s = fb / fa;
      if (a === c) { p = 2 * m * s; q = 1 - s; }
      else { q = fa / fc; r = fb / fc; p = s * (2 * m * q * (q - r) - (b - a) * (r - 1)); q = (q - 1) * (r - 1) * (s - 1); }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; }
      else { d = m; e = d; }
    } else { d = m; e = d; }
    a = b; fa = fb;
    b += Math.abs(d) > tol1 ? d : (m > 0 ? tol1 : -tol1);
    fb = f(b);
  }
  return b;
}

// Expands [lo, hi] outward until f changes sign, then runs brent.
export function bracketRoot(f, lo, hi, { min = -Infinity, max = Infinity } = {}) {
  let flo = f(lo), fhi = f(hi);
  for (let i = 0; i < 80 && flo * fhi > 0; i++) {
    const w = hi - lo;
    lo = Math.max(min, lo - w); hi = Math.min(max, hi + w);
    flo = f(lo); fhi = f(hi);
  }
  return brent(f, lo, hi);
}

// F distribution upper tail.
export const fSf = (f, d1, d2) => (f <= 0 ? 1 : betaI(d2 / 2, d1 / 2, d2 / (d2 + d1 * f)));

// Nelder-Mead simplex minimizer (adaptive parameters, Gao and Han 2012), restarted until the best
// value stops improving.
export function nelderMead(f, x0, { step = 0.1, tol = 1e-14, maxIter = 20000 } = {}) {
  const n = x0.length, a = 1, g = 1 + 2 / n, c = 0.75 - 1 / (2 * n), s = 1 - 1 / n;
  let best = { x: [...x0], f: f(x0) };
  for (let restart = 0; restart < 6; restart++) {
    let pts = [best.x, ...Array.from({ length: n }, (_, i) => best.x.map((v, j) => (i === j ? v + (Math.abs(v) > 1e-8 ? step * Math.abs(v) : step) : v)))];
    let vals = pts.map(f);
    for (let it = 0; it < maxIter; it++) {
      const idx = vals.map((v, i) => i).sort((p, q) => vals[p] - vals[q]);
      pts = idx.map((i) => pts[i]); vals = idx.map((i) => vals[i]);
      if (Math.abs(vals[n] - vals[0]) <= tol * (Math.abs(vals[0]) + 1e-300) && it > 10) break;
      const cen = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cen[j] += pts[i][j] / n;
      const at = (t) => cen.map((v, j) => v + t * (pts[n][j] - v));
      const xr = at(-a), fr = f(xr);
      if (fr < vals[0]) { const xe = at(-a * g), fe = f(xe); if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; } continue; }
      if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; continue; }
      const outside = fr < vals[n], xc = at(outside ? -a * c : c), fc = f(xc);
      if (fc < (outside ? fr : vals[n])) { pts[n] = xc; vals[n] = fc; continue; }
      for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((v, j) => pts[0][j] + s * (v - pts[0][j])); vals[i] = f(pts[i]); }
    }
    const improved = vals[0] < best.f - 1e-15 * Math.abs(best.f);
    best = vals[0] <= best.f ? { x: pts[0], f: vals[0] } : best;
    if (!improved && restart > 0) break;
    step /= 10;
  }
  return best;
}

// Seeded uniform [0, 1) generator (mulberry32): small, fast, and easy to reproduce in any language,
// so bootstrap results can be recomputed exactly from the seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// In-place iterative radix-2 FFT on separate real and imaginary arrays (length a power of two).
export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI / len) * (inverse ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// Lagged cross-product sums s[i] = sum_j x[j] x[j+i] for every lag i, by FFT in O(n log n).
export function lagProducts(x) {
  const n = x.length;
  let m = 1;
  while (m < 2 * n) m <<= 1;
  const re = new Float64Array(m), im = new Float64Array(m);
  re.set(x);
  fft(re, im);
  for (let i = 0; i < m; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
  fft(re, im, true);
  return re.subarray(0, n);
}

// BFGS with central-difference gradients and a backtracking (Armijo) line search; for smooth
// objectives where Nelder-Mead is slow in many dimensions.
export function bfgs(f, x0, { maxIter = 200, gtol = 1e-9 } = {}) {
  const n = x0.length;
  const grad = (x) => x.map((v, i) => { const h = 1e-6 * Math.max(1, Math.abs(v)), up = [...x], dn = [...x]; up[i] += h; dn[i] -= h; return (f(up) - f(dn)) / (2 * h); });
  let x = [...x0], fx = f(x), g = grad(x), H = identity(n);
  for (let it = 0; it < maxIter; it++) {
    if (Math.sqrt(dot(g, g)) < gtol * (1 + Math.abs(fx))) break;
    let d = matVec(H, g).map((v) => -v);
    if (dot(d, g) >= 0) { H = identity(n); d = g.map((v) => -v); }
    let step = 1, xn, fn;
    for (let ls = 0; ls < 60; ls++) { xn = x.map((v, i) => v + step * d[i]); fn = f(xn); if (fn <= fx + 1e-4 * step * dot(g, d)) break; step /= 2; }
    if (!(fn < fx)) break;
    const gn = grad(xn), s = xn.map((v, i) => v - x[i]), yv = gn.map((v, i) => v - g[i]), sy = dot(s, yv);
    if (sy > 1e-18) {
      const Hy = matVec(H, yv), yHy = dot(yv, Hy);
      H = H.map((row, i) => row.map((v, j) => v + ((sy + yHy) * s[i] * s[j]) / (sy * sy) - (Hy[i] * s[j] + s[i] * Hy[j]) / sy));
    }
    x = xn; fx = fn; g = gn;
  }
  return { x, f: fx };
}
