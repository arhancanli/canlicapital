// Luck-equivalent trials: the closed forms invert each other exactly, and the statistic is
// calibrated. The Monte Carlo draws skill-less searches with a fixed seed, so the rejection rates
// below are the same on every run; they pin both the calibration and the documented limitation.
import assert from "node:assert/strict";
import test from "node:test";

import { expectedMaxStandardNormal, normalCdf } from "./dsr-core.js";
import {
  TRIAL_CAP,
  bestOfTrialsProbability,
  expectedMaximumTrials,
  luckEquivalentTrials,
  singleTrialProbability,
  trialsAtProbability,
} from "./luck-core.js";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg ?? ""} ${a} vs ${b}`);

test("N_q inverts the best-of-N probability exactly", () => {
  for (const p of [0.4, 0.1, 1e-3, 1e-7, 1e-12]) {
    for (const q of [0.05, 0.5, 0.95]) {
      const n = trialsAtProbability(p, q);
      if (n > 1) close(-Math.expm1(n * Math.log1p(-p)), q, 1e-12, `p=${p} q=${q}`);
    }
  }
  assert.ok(trialsAtProbability(0.6, 0.5) < 1, "one trial already reaches it with more than even odds");
  assert.equal(trialsAtProbability(1, 0.5), 0);
  assert.equal(trialsAtProbability(0, 0.5), TRIAL_CAP);
  assert.equal(bestOfTrialsProbability(0.01, 1), 0.01);
  close(bestOfTrialsProbability(0.01, 100), 1 - 0.99 ** 100, 1e-14);
});

test("the single-trial probability is the Student t tail, approaching the normal tail for long records", () => {
  const { t_statistic, probability } = singleTrialProbability({ sharpe: 1, observations: 252, periodsPerYear: 252 });
  close(t_statistic, 1, 1e-15);
  assert.ok(probability > normalCdf(-1), "t tail is heavier than the normal tail");
  const long = singleTrialProbability({ sharpe: 0.5, observations: 252 * 400, periodsPerYear: 252 });
  close(long.probability, normalCdf(-long.t_statistic), 1e-4);
  assert.equal(singleTrialProbability({ sharpe: 0, observations: 100, periodsPerYear: 12 }).probability, 0.5);
  assert.throws(() => singleTrialProbability({ sharpe: 1, observations: 2, periodsPerYear: 12 }), /observations/);
});

test("the expected-maximum count is the largest N whose expected best stays at or below the t-statistic", () => {
  for (const t of [1.5, 2.5, 3.5, 5]) {
    const n = expectedMaximumTrials(t);
    assert.ok(expectedMaxStandardNormal(n) <= t && expectedMaxStandardNormal(n + 1) > t, `t=${t} n=${n}`);
  }
  assert.equal(expectedMaximumTrials(0.3), 1);
});

test("worked example: a 3-year daily backtest with Sharpe 1.5", () => {
  const r = luckEquivalentTrials({ sharpe: 1.5, observations: 756, periodsPerYear: 252, trials: 200 });
  close(r.t_statistic, 1.5 * Math.sqrt(3), 1e-12);
  assert.ok(r.trials_for_five_percent < r.trials_for_even_odds);
  close(bestOfTrialsProbability(r.single_trial_probability, 1), r.single_trial_probability, 1e-15);
  assert.ok(r.best_of_trials_probability > 0 && r.best_of_trials_probability < 1);
});

// xorshift32 and Box-Muller: deterministic, dependency-free.
function rng(seed) {
  let s = seed >>> 0;
  const u = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  return { u, gauss };
}

function sampleSharpe(draw, t) {
  let m = 0;
  const xs = new Float64Array(t);
  for (let i = 0; i < t; i++) { xs[i] = draw(); m += xs[i]; }
  m /= t;
  let v = 0;
  for (let i = 0; i < t; i++) v += (xs[i] - m) ** 2;
  return m / Math.sqrt(v / (t - 1));
}

// Draws `reps` skill-less searches of `trials` strategies over `t` periods and returns how often the
// best one's luck probability falls at or below each level: a calibrated statistic matches the level.
function rejectionRates(draw, { trials, t, reps }) {
  const p = [];
  for (let r = 0; r < reps; r++) {
    let best = -Infinity;
    for (let k = 0; k < trials; k++) best = Math.max(best, sampleSharpe(draw, t));
    const { best_of_trials_probability } = luckEquivalentTrials({ sharpe: best, observations: t, periodsPerYear: 1, trials });
    p.push(best_of_trials_probability);
  }
  return Object.fromEntries([0.05, 0.5].map((a) => [a, p.filter((x) => x <= a).length / reps]));
}

test("calibrated under normal returns, including short records (the Student t null is exact)", () => {
  const { gauss } = rng(20260926);
  const rates = rejectionRates(gauss, { trials: 10, t: 36, reps: 3000 });
  close(rates[0.05], 0.05, 0.012, "size at 5%");
  close(rates[0.5], 0.5, 0.03, "size at 50%");
});

test("calibrated under symmetric fat tails (Student t with 4 degrees of freedom)", () => {
  const { gauss } = rng(4);
  const t4 = () => { const z = gauss(); let c = 0; for (let i = 0; i < 4; i++) c += gauss() ** 2; return z / Math.sqrt(c / 4); };
  const rates = rejectionRates(t4, { trials: 10, t: 120, reps: 2000 });
  close(rates[0.05], 0.05, 0.015, "size at 5%");
});

test("documented limitation: negatively skewed returns make the count too small (too kind to the strategy)", () => {
  const { gauss } = rng(13);
  const mu = Math.exp(0.08);
  const negSkew = () => mu - Math.exp(0.4 * gauss()); // skew about -1.3
  const rates = rejectionRates(negSkew, { trials: 10, t: 252, reps: 1500 });
  assert.ok(rates[0.05] > 0.07, `expected over-rejection, measured ${rates[0.05]}; if fixed, update the stated limits`);
});

test("the size figures quoted in the source are the committed study's own", async () => {
  const { readFileSync } = await import("node:fs");
  const study = JSON.parse(readFileSync(new URL("../config/research/luck-trials-size-study.json", import.meta.url), "utf8"));
  const source = readFileSync(new URL("./luck-core.js", import.meta.url), "utf8").replace(/\n\/\/ /g, " ");
  const at = (d) => (study.rows.find((r) => r.distribution === d && r.t === 252).size.student_t_null.at_5_percent * 100).toFixed(1);
  assert.ok(source.includes(`rejected ${at("skew_minus_1_3")}% of skill-less searches at skew -1.3 and ${at("skew_minus_3_7")}% at skew -3.7`));
});
