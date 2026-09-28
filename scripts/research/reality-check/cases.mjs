// The three fixed-seed cases the data-snooping tests are checked on, generated the same way in
// the test and in the reference build, so the stored reference values need no stored data.
import { makeRandom } from "../../../js/selection-risk-core.js";

function normals(seed) {
  const next = makeRandom(seed);
  let spare = null;
  return () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0;
    while (u === 0) u = next();
    const v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

// Daily excess returns with volatility 1%: `edge` adds a mean to variant 0 (0.001 a day is an
// annualized Sharpe of about 1.6), `edges` one mean per leading variant; `ar` gives every variant
// AR(1) errors.
function build({ seed, n, k, edge = 0, edges = [edge], ar = 0 }) {
  const z = normals(seed);
  const d = new Float64Array(n * k);
  const prev = new Float64Array(k);
  for (let t = 0; t < n; t += 1) {
    for (let j = 0; j < k; j += 1) {
      const e = ar * prev[j] + Math.sqrt(1 - ar * ar) * z();
      prev[j] = e;
      d[t * k + j] = 0.01 * e + (edges[j] ?? 0);
    }
  }
  return d;
}

export const CASES = Object.freeze([
  { name: "noise", seed: 11, n: 1000, k: 50 },
  { name: "one_real_edge", seed: 12, n: 1000, k: 20, edge: 0.0012 },
  { name: "autocorrelated_borderline", seed: 13, n: 750, k: 30, edge: 0.0007, ar: 0.2 },
  // Five variants with edges of different sizes among 19 without: StepM needs a second round (the
  // unstudentized step-down rejects four, then the fifth once the four are removed). Variant 2's
  // mean is within 0.11 basis points of both rounds' critical values, so another generator's draws
  // could place it either side; with these fixed draws both implementations reject it in round two.
  { name: "several_edges", seed: 48, n: 1000, k: 24, edges: [0.004, 0.0011, 0.001, 0.0009, 0.0008] },
]);

export const caseData = (c) => build(c);
