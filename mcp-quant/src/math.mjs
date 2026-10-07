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
