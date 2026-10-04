import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FIX_IDS, annualizeDecay, blockBootstrapT, fixNext, neweyWestT, nullZooFamily, oosDecay, returnShape, searchFromVariants, sharpeInterval } from "./audit-core.js";
import { autocorrelationFactor } from "./haircut-core.js";
import { makeRandom } from "./selection-risk-core.js";
import { blockBootstrapT as harnessBootstrapT, neweyWestT as harnessNeweyWestT } from "../scripts/research/null-zoo/v1/validators.mjs";

const normals = (seed, n, mu = 0, sd = 1) => {
  const next = makeRandom(seed);
  return Array.from({ length: n }, () => mu + sd * Math.sqrt(-2 * Math.log(next() || 1e-12)) * Math.cos(2 * Math.PI * next()));
};
const ar1 = (seed, n, phi) => {
  const e = normals(seed, n);
  const out = [e[0]];
  for (let i = 1; i < n; i++) out.push(phi * out[i - 1] + Math.sqrt(1 - phi * phi) * e[i]);
  return out;
};

test("returnShape: autocorrelation, Lo's factor and the adjusted Sharpe", () => {
  const xs = ar1(3, 20000, 0.3).map((x) => 0.0005 + 0.01 * x);
  const s = returnShape(xs, 252);
  assert.ok(Math.abs(s.lag1_autocorrelation - 0.3) < 0.03, `lag1 ${s.lag1_autocorrelation}`);
  assert.equal(s.lo_factor, autocorrelationFactor(s.lag1_autocorrelation, 252));
  assert.ok(s.lo_adjusted_sharpe_annualized < s.sharpe_annualized, "positive autocorrelation lowers the adjusted Sharpe");
  assert.ok(Math.abs(s.excess_kurtosis) < 0.2 && Math.abs(s.skew) < 0.1);
});

test("sharpeInterval: deterministic, contains the sample Sharpe, narrower with more data", () => {
  const xs = normals(5, 2520, 0.0004, 0.01);
  const a = sharpeInterval(xs, { periodsPerYear: 252, reps: 1000, seed: 7 });
  const b = sharpeInterval(xs, { periodsPerYear: 252, reps: 1000, seed: 7 });
  assert.deepEqual(a, b);
  const sample = returnShape(xs, 252).sharpe_annualized;
  const [lo, hi] = a.intervals["0.95"];
  assert.ok(lo < sample && sample < hi, `${lo} < ${sample} < ${hi}`);
  const [lo90, hi90] = a.intervals["0.9"];
  assert.ok(lo <= lo90 && hi90 <= hi, "the 90% interval sits inside the 95% one");
  const short = sharpeInterval(xs.slice(0, 504), { periodsPerYear: 252, reps: 1000, seed: 7 }).intervals["0.95"];
  assert.ok(short[1] - short[0] > hi - lo, "five times less data gives a wider interval");
});

test("searchFromVariants: counts, Sharpe spread and effective trials", () => {
  const k = 12, T = 3000;
  const cols = Array.from({ length: k }, (_, j) => normals(100 + j, T, 0, 0.01));
  const independent = searchFromVariants(Array.from({ length: T }, (_, t) => cols.map((c) => c[t])), 252);
  assert.equal(independent.variants, k);
  assert.ok(independent.effective_trials.li_ji > 10 && independent.effective_trials.li_ji <= 12 + 1e-9, `li_ji ${independent.effective_trials.li_ji}`);
  assert.ok(independent.effective_trials.used <= k, `used ${independent.effective_trials.used} never exceeds the ${k} variants`);
  assert.ok(Math.abs(independent.mean_pairwise_correlation) < 0.03);
  const factor = normals(1, T, 0, 0.01);
  const clustered = searchFromVariants(Array.from({ length: T }, (_, t) => cols.map((c) => factor[t] + 0.1 * c[t])), 252);
  assert.ok(clustered.mean_pairwise_correlation > 0.95);
  // One dominant eigenvalue L1 with the rest near zero gives Li-Ji exactly 1 + frac(L1) + (k - L1) = 2.
  assert.ok(Math.abs(clustered.effective_trials.li_ji - 2) < 1e-9 && clustered.effective_trials.used === 2, `clustered li_ji ${clustered.effective_trials.li_ji}`);
  assert.ok(clustered.effective_trials.nyholt < 1.5);
  // The cross-trial spread is the sample standard deviation of the annualized Sharpe ratios.
  const sharpes = cols.map((c) => { const m = c.reduce((a, b) => a + b, 0) / T; const sd = Math.sqrt(c.reduce((a, b) => a + (b - m) ** 2, 0) / (T - 1)); return (m / sd) * Math.sqrt(252); });
  const sm = sharpes.reduce((a, b) => a + b, 0) / k;
  const sd = Math.sqrt(sharpes.reduce((a, b) => a + (b - sm) ** 2, 0) / (k - 1));
  assert.ok(Math.abs(independent.cross_trial_sharpe_sd_annualized - sd) < 1e-12);
});

test("searchFromVariants: two variants with correlation r have eigenvalues 1 - r and 1 + r", () => {
  const a = normals(9, 4000), e = normals(10, 4000);
  const b = a.map((x, i) => 0.6 * x + 0.8 * e[i]);
  const s = searchFromVariants(a.map((x, i) => [x, b[i]]), 252);
  const r = s.mean_pairwise_correlation;
  const lambdas = [1 - r, 1 + r];
  const lm = 1;
  const lv = ((lambdas[0] - lm) ** 2 + (lambdas[1] - lm) ** 2) / 1;
  assert.ok(Math.abs(s.effective_trials.nyholt - (1 + (1 - lv / 2))) < 1e-9);
  const liJi = lambdas.reduce((acc, l) => acc + (l >= 1 ? 1 : 0) + (l - Math.floor(l)), 0);
  assert.ok(Math.abs(s.effective_trials.li_ji - liJi) < 1e-9);
});

test("nullZooFamily follows the pre-registered rules in their order", () => {
  const prereg = JSON.parse(readFileSync(new URL("../config/research/null-zoo-v1-prereg.json", import.meta.url), "utf8"));
  assert.equal(prereg.shape_mapping.rules_in_order.length, 8);
  const base = { lag1_autocorrelation: 0, skew: 0, excess_kurtosis: 0, lag1_autocorrelation_of_squares: 0 };
  assert.equal(nullZooFamily(base, { mean_pairwise_correlation: 0.5, sd_pairwise_correlation: 0.05 }), "correlated_trials");
  assert.equal(nullZooFamily(base, { mean_pairwise_correlation: 0.5, sd_pairwise_correlation: 0.3 }), "block_cluster");
  assert.equal(nullZooFamily({ ...base, lag1_autocorrelation: -0.12, skew: -2 }), "ar1", "autocorrelation comes before skew");
  assert.equal(nullZooFamily({ ...base, skew: -0.7 }), "skew_negative");
  assert.equal(nullZooFamily({ ...base, skew: 0.7 }), "skew_positive");
  assert.equal(nullZooFamily({ ...base, excess_kurtosis: 3, lag1_autocorrelation_of_squares: 0.2 }), "garch");
  assert.equal(nullZooFamily({ ...base, excess_kurtosis: 3 }), "student_t4");
  assert.equal(nullZooFamily({ ...base, lag1_autocorrelation_of_squares: 0.2 }), "regimes");
  assert.equal(nullZooFamily(base), "iid_normal");
  assert.equal(nullZooFamily(base, { mean_pairwise_correlation: 0.1, sd_pairwise_correlation: 0.5 }), "iid_normal", "weakly correlated variants fall through");
});

test("the single-series tests compute exactly what the calibration harness measured", () => {
  for (const seed of [1, 2, 3]) {
    const xs = Float64Array.from(ar1(seed, 504, 0.2), (x) => x + 0.05);
    assert.equal(neweyWestT(xs), harnessNeweyWestT(xs));
    assert.equal(blockBootstrapT(xs, { reps: 499, seed: 11 + seed }), harnessBootstrapT(xs, { reps: 499, seed: 11 + seed }));
  }
});

test("oosDecay: the out-of-sample distribution and the degradation line", () => {
  const pairs = [[0.1, 0.02], [0.2, 0.01], [0.15, -0.01], [0.3, 0.0], [0.25, 0.03]];
  const d = oosDecay(pairs, 252);
  assert.equal(d.unit, "annualized");
  const root = Math.sqrt(252);
  assert.equal(d.splits, 5);
  assert.ok(Math.abs(d.oos_sharpe.median - 0.01 * root) < 1e-12);
  assert.equal(d.oos_sharpe.prob_below_zero, 0.2);
  const perPeriod = oosDecay(pairs);
  assert.equal(perPeriod.unit, "per period");
  const converted = annualizeDecay(perPeriod, 252);
  for (const key of ["median", "p10", "p90", "prob_below_zero"]) assert.ok(Math.abs(converted.oos_sharpe[key] - d.oos_sharpe[key]) < 1e-12, key);
  for (const key of ["slope", "intercept", "r2"]) assert.ok(Math.abs(converted.degradation[key] - d.degradation[key]) < 1e-12, key);
  const xs = pairs.map((p) => p[0] * root), ys = pairs.map((p) => p[1] * root);
  const mx = xs.reduce((a, b) => a + b) / 5, my = ys.reduce((a, b) => a + b) / 5;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  assert.ok(Math.abs(d.degradation.slope - slope) < 1e-12);
  assert.ok(Math.abs(d.degradation.intercept - (my - slope * mx)) < 1e-12);
});

test("fixNext: at most five steps, each with a known id, the most decisive first", () => {
  const shape = { lag1_autocorrelation: 0.3, sharpe_annualized: 1.5, lo_adjusted_sharpe_annualized: 1.1 };
  const steps = fixNext({
    headline: { test: "spa_consistent", p: 0.31, level: 0.05 },
    shape,
    interval: { intervals: { "0.95": [-0.2, 2.4] } },
    search: { effective_trials: { used: 40 } },
    declaredTrials: 5,
    overfitting: { pbo: 0.7 },
    decay: { splits: 70, oos_sharpe: { median: -0.1 } },
    trackRecord: { short: true, finding: "short" },
  });
  assert.equal(steps.length, 5);
  assert.equal(steps[0].id, "not_distinguishable_from_luck");
  for (const s of steps) assert.ok(FIX_IDS.includes(s.id) && s.why && s.next && Object.keys(s).length === 3, JSON.stringify(s));
  const clean = fixNext({ headline: { test: "x", p: 0.001, level: 0.05 }, shape: { lag1_autocorrelation: 0 }, interval: { intervals: { "0.95": [0.5, 2] } }, search: { effective_trials: { used: 3 } }, declaredTrials: 3 });
  assert.deepEqual(clean.map((s) => s.id), ["stress_and_capacity_next"], "nothing to fix: the next step is stress and capacity");
  const unclear = fixNext({ shape: { lag1_autocorrelation: 0 }, interval: { intervals: { "0.95": [0.5, 2] } }, search: { effective_trials: { used: 3 } }, declaredTrials: 3 });
  assert.equal(unclear.length, 0, "no headline and nothing found: no steps");
});

test("the audit core matches statsmodels and numpy on the fixed reference cases", async () => {
  const { SERIES, VARIANTS } = await import("../scripts/research/audit/cases.mjs");
  const ref = JSON.parse(readFileSync(new URL("../config/research/audit-core-reference.json", import.meta.url), "utf8"));
  for (const [name, xs] of Object.entries(SERIES)) {
    const t = neweyWestT(Float64Array.from(xs));
    assert.ok(Math.abs(t - ref.newey_west_t[name].t) < 1e-9 * Math.max(1, Math.abs(t)), `${name}: ${t} against statsmodels ${ref.newey_west_t[name].t}`);
  }
  for (const [name, m] of Object.entries(VARIANTS)) {
    const s = searchFromVariants(m, 252);
    const r = ref.search[name];
    assert.ok(Math.abs(s.cross_trial_sharpe_sd_annualized - r.cross_trial_sharpe_sd_annualized) < 1e-12, `${name} Sharpe spread`);
    assert.ok(Math.abs(s.effective_trials.nyholt - r.nyholt) < 1e-9, `${name} Nyholt ${s.effective_trials.nyholt} against ${r.nyholt}`);
    assert.ok(Math.abs(s.effective_trials.li_ji - r.li_ji) < 1e-9, `${name} Li-Ji ${s.effective_trials.li_ji} against ${r.li_ji}`);
    assert.ok(Math.abs(s.mean_pairwise_correlation - r.mean_pairwise_correlation) < 1e-12, `${name} mean correlation`);
    assert.ok(Math.abs(s.sd_pairwise_correlation - r.sd_pairwise_correlation) < 1e-12, `${name} correlation spread`);
  }
});
