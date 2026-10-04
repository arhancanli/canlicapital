// Fixed inputs for the audit core's independent reference (reference.py). Deterministic, so the
// reference file can be regenerated and compared byte for byte.
import { makeRandom } from "../../../js/selection-risk-core.js";

function normals(seed, n) {
  const next = makeRandom(seed);
  return Array.from({ length: n }, () => Math.sqrt(-2 * Math.log(next() || 1e-12)) * Math.cos(2 * Math.PI * next()));
}

function ar1(seed, n, phi, mu, sd) {
  const e = normals(seed, n);
  const out = [e[0]];
  for (let i = 1; i < n; i++) out.push(phi * out[i - 1] + Math.sqrt(1 - phi * phi) * e[i]);
  return out.map((x) => mu + sd * x);
}

export const SERIES = Object.freeze({
  iid_daily: ar1(11, 756, 0, 0.0004, 0.01),
  ar1_0_3: ar1(12, 1000, 0.3, 0.0003, 0.008),
  skewed: normals(13, 900).map((z) => 0.0005 - 0.01 * (Math.exp(0.5 * z) - Math.exp(0.125))),
  short_negative: ar1(14, 60, 0.1, -0.001, 0.02),
});

function matrix(periods, columns) {
  return Array.from({ length: periods }, (_, t) => columns.map((c) => c[t]));
}

export const VARIANTS = Object.freeze({
  independent_8: matrix(1000, Array.from({ length: 8 }, (_, j) => normals(100 + j, 1000).map((x) => 0.0002 * j + 0.01 * x))),
  block_clusters_12: (() => {
    const factors = [normals(200, 1500), normals(201, 1500), normals(202, 1500)];
    return matrix(1500, Array.from({ length: 12 }, (_, j) => normals(210 + j, 1500).map((x, t) => 0.01 * (0.9 * factors[j % 3][t] + 0.436 * x))));
  })(),
  near_identical_5: (() => {
    const f = normals(300, 800);
    return matrix(800, Array.from({ length: 5 }, (_, j) => normals(310 + j, 800).map((x, t) => 0.01 * (f[t] + 0.05 * x))));
  })(),
});
