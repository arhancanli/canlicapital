// js/snooping-core.test.js
// The data-snooping tests against independent implementations and against their own definitions.
// config/research/reality-check-reference.json holds p-values from Python's arch 8.0 (SPA,
// RealityCheck and StepM, not studentized) and from a numpy transcription of Hansen's (2005)
// studentized SPA, on the four fixed-seed cases in scripts/research/reality-check/cases.mjs.
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
  test(`${c.name}: statistic exact, p-values within Monte Carlo error of arch and of Hansen's formulas, StepM as arch`, () => {
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
    const hansen = snoopingTests(d, c.n, c.k, { reps: REPS, seed: 2 });
    assert.ok(Math.abs(hansen.spa.statistic / ref.hansen_spa_studentized.statistic - 1) < 1e-9, `${hansen.spa.statistic} vs ${ref.hansen_spa_studentized.statistic}`);
    close(hansen.spa.p_lower, ref.hansen_spa_studentized.lower, "studentized lower");
    close(hansen.spa.p_consistent, ref.hansen_spa_studentized.consistent, "studentized consistent");
    close(hansen.spa.p_upper, ref.hansen_spa_studentized.upper, "studentized upper");
  });
}

test("the three recentrings are ordered, and White's Reality Check is the unstudentized upper bound", () => {
  for (const c of CASES) {
    const d = caseData(c);
    for (const studentize of [true, false]) {
      const r = snoopingTests(d, c.n, c.k, { reps: 500, seed: 3, studentize });
      assert.ok(r.spa.p_lower <= r.spa.p_consistent && r.spa.p_consistent <= r.spa.p_upper, `${c.name} ${studentize}`);
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

test("inputs outside the method's domain are refused", () => {
  const d = new Float64Array(20).fill(0);
  assert.throws(() => snoopingTests(d, 10, 2), /constant; there is nothing to test/);
  assert.throws(() => snoopingTests(new Float64Array(10), 1, 10), /at least 2 periods/);
  const ok = Float64Array.from({ length: 20 }, (_, i) => (i % 3) - 1);
  assert.throws(() => snoopingTests(ok, 10, 2, { block: 11 }), /block_length must be from 1 to/);
  assert.throws(() => snoopingTests(ok, 10, 2, { reps: 50 }), /reps must be an integer of at least 100/);
  assert.throws(() => snoopingTests(ok, 10, 2, { alpha: 1 }), /alpha must be between 0 and 1/);
});
