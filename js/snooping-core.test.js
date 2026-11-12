// js/snooping-core.test.js
// The data-snooping tests against independent implementations and against their own definitions.
// config/research/reality-check-reference.json holds p-values from Python's arch 8.0 (SPA,
// RealityCheck and StepM, not studentized) and from a numpy transcription of the bootstrap-t SPA
// and StepM (each resample studentized by its own standard deviation, ties counted), on the four
// fixed-seed cases in scripts/research/reality-check/cases.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CASES, caseData } from "../scripts/research/reality-check/cases.mjs";
import { makeRandom } from "./selection-risk-core.js";
import { bootstrapVariance, defaultBlock, snoopingTests, stationaryIndices } from "./snooping-core.js";

const REF = JSON.parse(readFileSync(new URL("../config/research/reality-check-reference.json", import.meta.url), "utf8"));
const REPS = 10000;

// Two independent Monte Carlo estimates of the same p differ by about sqrt(2 p (1 - p) / R).
const close = (got, want, what) => {
  const tolerance = 4.5 * Math.sqrt((2 * Math.max(want, 0.001) * (1 - want)) / REPS) + 1 / REPS;
  assert.ok(Math.abs(got - want) <= tolerance, `${what}: ${got} vs reference ${want} (tolerance ${tolerance.toFixed(4)})`);
};

for (const c of CASES) {
  test(`${c.name}: statistic exact, p-values within Monte Carlo error of arch and of the numpy bootstrap-t, StepM sets as both`, () => {
    const ref = REF.cases.find((r) => r.name === c.name);
    assert.equal(ref.block_length, defaultBlock(c.n));
    const d = caseData(c);
    const plain = snoopingTests(d, c.n, c.k, { reps: REPS, seed: 1, studentize: false });
    close(plain.spa.p_lower, ref.arch_spa_unstudentized.lower, "unstudentized lower");
    close(plain.spa.p_consistent, ref.arch_spa_unstudentized.consistent, "unstudentized consistent");
    close(plain.spa.p_upper, ref.arch_spa_unstudentized.upper, "unstudentized upper");
    close(plain.reality_check.p_value, ref.arch_reality_check, "Reality Check");
    assert.deepEqual(plain.stepm.superior, ref.arch_stepm_superior, "StepM superior set");
    if (c.name === "several_edges") assert.equal(plain.stepm.rounds.length, 2, "the step-down needs a second round here");
    const boot = snoopingTests(d, c.n, c.k, { reps: REPS, seed: 2 });
    const want = ref.bootstrap_t_spa_studentized;
    assert.ok(Math.abs(boot.spa.statistic / want.statistic - 1) < 1e-9, `${boot.spa.statistic} vs ${want.statistic}`);
    close(boot.spa.p_lower, want.lower, "studentized lower");
    close(boot.spa.p_consistent, want.consistent, "studentized consistent");
    close(boot.spa.p_upper, want.upper, "studentized upper");
    assert.deepEqual(boot.stepm.superior, ref.bootstrap_t_stepm_superior, "studentized StepM superior set");
  });
}

test("the three recentrings are ordered, and White's Reality Check is the unstudentized upper bound", () => {
  for (const c of CASES) {
    const d = caseData(c);
    for (const studentize of [true, false]) {
      const r = snoopingTests(d, c.n, c.k, { reps: 500, seed: 3, studentize });
      assert.ok(r.spa.p_lower <= r.spa.p_consistent && r.spa.p_consistent <= r.spa.p_upper, `${c.name} ${studentize}`);
      // With a positive best mean neither the floor at zero nor the tie rule binds, so the two agree.
      assert.ok(r.reality_check.statistic > 0, c.name);
      if (!studentize) assert.equal(r.reality_check.p_value, r.spa.p_upper, "same draws, same statistic");
    }
  }
});

test("a result reproduces from its seed, and another seed draws differently", () => {
  const c = CASES[2];
  const d = caseData(c);
  const a = snoopingTests(d, c.n, c.k, { reps: 300, seed: 9 });
  const b = snoopingTests(d, c.n, c.k, { reps: 300, seed: 9 });
  const other = snoopingTests(d, c.n, c.k, { reps: 300, seed: 10 });
  assert.deepEqual(a.spa, b.spa);
  assert.deepEqual(a.stepm, b.stepm);
  assert.notDeepEqual(a.spa, other.spa);
});

test("the variance is the Politis-Romano closed form, lag skipping included", () => {
  for (const [n, block] of [[300, 7], [3000, 5], [2000, 1]]) {
    const k = 2;
    const next = makeRandom(n + block);
    const d = new Float64Array(n * k);
    let prev = 0;
    for (let t = 0; t < n; t += 1) { prev = 0.5 * prev + next() - 0.5; d[t * k] = prev; d[t * k + 1] = next() - 0.5; }
    const means = new Float64Array(k);
    for (let t = 0; t < n; t += 1) for (let j = 0; j < k; j += 1) means[j] += d[t * k + j] / n;
    const got = bootstrapVariance(d, n, k, block, means);
    const q = 1 - 1 / block;
    for (let j = 0; j < k; j += 1) {
      let want = 0;
      for (let t = 0; t < n; t += 1) want += (d[t * k + j] - means[j]) ** 2 / n;
      for (let i = 1; i < n; i += 1) {
        const kappa = (1 - i / n) * q ** i + (i / n) * q ** (n - i);
        if (kappa === 0) continue;
        let c = 0;
        for (let t = 0; t + i < n; t += 1) c += (d[t * k + j] - means[j]) * (d[(t + i) * k + j] - means[j]);
        want += (2 * kappa * c) / n;
      }
      assert.ok(Math.abs(got[j] / want - 1) < 1e-11, `n ${n} block ${block}: ${got[j]} vs ${want}`);
    }
  }
});

test("stationary-bootstrap blocks average the stated length and cover every period evenly", () => {
  const n = 5000;
  const block = 8;
  const next = makeRandom(4);
  const counts = new Float64Array(n);
  let runs = 0;
  let steps = 0;
  for (let r = 0; r < 40; r += 1) {
    const idx = stationaryIndices(n, block, next);
    runs += 1;
    for (let t = 0; t < n; t += 1) {
      counts[idx[t]] += 1;
      if (t && idx[t] !== (idx[t - 1] + 1) % n) runs += 1;
      steps += 1;
    }
  }
  const meanBlock = steps / runs;
  assert.ok(Math.abs(meanBlock - block) < 0.4, `mean block ${meanBlock}`);
  const expected = 40;
  const chi = counts.reduce((s, x) => s + (x - expected) ** 2 / expected, 0) / n;
  assert.ok(chi < 1.2 * block, `coverage dispersion ${chi}`);
});

test("on pure noise a 5% SPA rejects about 5% of the time, not more", () => {
  const n = 250;
  const k = 10;
  let rejected = 0;
  const trials = 200;
  for (let s = 0; s < trials; s += 1) {
    const next = makeRandom(1000 + s);
    const d = new Float64Array(n * k);
    for (let i = 0; i < d.length; i += 1) d[i] = next() - 0.5;
    if (snoopingTests(d, n, k, { reps: 400, seed: s }).spa.p_consistent <= 0.05) rejected += 1;
  }
  assert.ok(rejected / trials <= 0.1, `${rejected} of ${trials} rejected at 5%`);
});

test("each resample is studentized by its own standard deviation: the p-values recomputed from the definition on the same draws", () => {
  // Negatively skewed returns (a centred, reflected exponential), where holding the sample's
  // standard deviation fixed across resamples gives a visibly different p-value.
  const n = 250;
  const k = 3;
  const block = 4;
  const reps = 2000;
  const seed = 21;
  const draw = makeRandom(55);
  const d = Float64Array.from({ length: n * k }, (_, i) => (i % k === 0 ? 0.0012 : 0.0004) + 0.01 * (1 + Math.log(1 - draw())));
  const r = snoopingTests(d, n, k, { block, reps, seed });

  const root = Math.sqrt(n);
  const column = (rows, j) => Array.from(rows, (t) => d[t * k + j]);
  const meanOf = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
  const sdOf = (xs) => { const m = meanOf(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
  const all = Array.from({ length: n }, (_, t) => t);
  const m = Array.from({ length: k }, (_, j) => meanOf(column(all, j)));
  const s = Array.from({ length: k }, (_, j) => sdOf(column(all, j)));
  const w2 = bootstrapVariance(d, n, k, block, Float64Array.from(m));
  const cut = (j) => -Math.sqrt((w2[j] / n) * 2 * Math.log(Math.log(n)));
  const centres = [m.map((x) => Math.max(x, 0)), m.map((x, j) => (x >= cut(j) ? x : 0)), m];
  const T = Math.max(0, ...m.map((x, j) => (root * x) / s[j]));
  assert.ok(T > 0 && Math.abs(r.spa.statistic / T - 1) < 1e-12, `${r.spa.statistic} vs ${T}`);

  const next = makeRandom(seed);
  const hits = [0, 0, 0];
  let fixedHits = 0;
  for (let b = 0; b < reps; b += 1) {
    const idx = stationaryIndices(n, block, next);
    const ms = Array.from({ length: k }, (_, j) => meanOf(column(idx, j)));
    const ss = Array.from({ length: k }, (_, j) => sdOf(column(idx, j)));
    centres.forEach((g, c) => { if (Math.max(0, ...ms.map((x, j) => (root * (x - g[j])) / ss[j])) >= T) hits[c] += 1; });
    if (Math.max(0, ...ms.map((x, j) => (root * (x - centres[1][j])) / s[j])) >= T) fixedHits += 1;
  }
  assert.deepEqual([r.spa.p_lower, r.spa.p_consistent, r.spa.p_upper], hits.map((h) => h / reps));
  assert.ok(Math.abs(fixedHits - hits[1]) / reps > 0.01, `a fixed studentizer gives ${fixedHits / reps}, the bootstrap-t ${hits[1] / reps}`);
});

test("when every variant is far below the benchmark, every p-value is 1 and StepM declares nothing superior", () => {
  // Mean -0.004 a period with volatility 0.01: each variant's t is about -9, far below Hansen's
  // consistent threshold, so T = 0 and every resampled statistic is floored to 0 as well. Counting
  // only the resamples strictly above T gave p near 0 here, a rejection with no variant ahead.
  const n = 500;
  const k = 12;
  const next = makeRandom(77);
  const d = Float64Array.from({ length: n * k }, () => -0.004 + 0.01 * Math.sqrt(12) * (next() - 0.5));
  for (const studentize of [true, false]) {
    const r = snoopingTests(d, n, k, { reps: 1000, seed: 5, studentize });
    assert.ok(r.observed < 0, `${studentize}: best statistic ${r.observed}`);
    assert.equal(r.spa.statistic, 0);
    assert.deepEqual([r.spa.p_lower, r.spa.p_consistent, r.spa.p_upper, r.reality_check.p_value], [1, 1, 1, 1], `${studentize}`);
    assert.deepEqual(r.stepm.superior, [], `${studentize}`);
    assert.equal(r.stepm.rounds.length, 0);
  }
  // At alpha 0.5, which the API allows, the step-down's critical value for one such variant is about
  // its own t, so without the floor at zero StepM declared it superior about half the time.
  for (let s = 0; s < 8; s += 1) {
    const draw = makeRandom(200 + s);
    const one = Float64Array.from({ length: n }, () => -0.004 + 0.01 * Math.sqrt(12) * (draw() - 0.5));
    assert.deepEqual(snoopingTests(one, n, 1, { reps: 500, seed: s, alpha: 0.5 }).stepm.superior, [], `seed ${s}`);
  }
});

test("a variant constant in a resample is studentized there by its sample standard deviation", () => {
  // Variant 1 differs from the benchmark in two periods only, so many resamples miss both and are
  // constant. Dividing by their zero standard deviation would make each such resample's statistic
  // infinite, an exceedance of any T. Variant 0 has a t of about 15, which no finite resample reaches.
  const n = 200;
  const k = 2;
  const next = makeRandom(31);
  const d = new Float64Array(n * k);
  for (let t = 0; t < n; t += 1) {
    d[t * k] = 0.003 + 0.01 * (next() - 0.5);
    d[t * k + 1] = t === 50 || t === 150 ? -0.02 : 0;
  }
  const r = snoopingTests(d, n, k, { reps: 1000, seed: 6 });
  assert.equal(r.best, 0);
  assert.ok(r.observed > 10, `t ${r.observed}`);
  assert.deepEqual([r.spa.p_lower, r.spa.p_consistent, r.spa.p_upper], [0, 0, 0]);
  assert.deepEqual(r.stepm.superior, [0]);
});

test("inputs outside the method's domain are refused", () => {
  const d = new Float64Array(20).fill(0);
  assert.throws(() => snoopingTests(d, 10, 2), /constant; there is nothing to test/);
  assert.throws(() => snoopingTests(new Float64Array(10), 1, 10), /at least 2 periods/);
  const ok = Float64Array.from({ length: 20 }, (_, i) => (i % 3) - 1);
  assert.throws(() => snoopingTests(ok, 10, 2, { block: 11 }), /block_length must be from 1 to/);
  assert.throws(() => snoopingTests(ok, 10, 2, { reps: 50 }), /reps must be an integer of at least 100/);
  assert.throws(() => snoopingTests(ok, 10, 2, { alpha: 1 }), /alpha must be between 0 and 1/);
});
