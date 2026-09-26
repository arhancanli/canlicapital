// The size study behind luck-equivalent trials (js/luck-core.js): draws skill-less searches of N
// strategies over T periods from six return distributions, with fixed seeds, and reports how often
// the best strategy's luck probability falls at or below 5 and 50 percent. A calibrated statistic
// rejects at the nominal rate. Compared: the shipped Student t null; the deflated Sharpe ratio's
// convention of the non-normal standard error at the observed Sharpe; and a bootstrap of the best
// strategy's own demeaned returns.
//   node scripts/research/luck-trials-size-study.mjs [reps] [bootstrap draws]  > study.json
import { normalCdf } from "../../js/dsr-core.js";
import { bestOfTrialsProbability, singleTrialProbability } from "../../js/luck-core.js";

const REPS = Number(process.argv[2] ?? 1000);
const BOOT = Number(process.argv[3] ?? 2000);

function rng(seed) {
  let s = seed >>> 0;
  const u = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  return { u, gauss };
}

// Each distribution has mean zero, so every strategy is skill-less.
const DISTRIBUTIONS = {
  normal: ({ gauss }) => gauss,
  student_t4: ({ gauss }) => () => { const z = gauss(); let c = 0; for (let i = 0; i < 4; i++) c += gauss() ** 2; return z / Math.sqrt(c / 4); },
  skew_plus_1_3: ({ gauss }) => () => Math.exp(0.4 * gauss()) - Math.exp(0.08),
  skew_minus_1_3: ({ gauss }) => () => Math.exp(0.08) - Math.exp(0.4 * gauss()),
  skew_plus_3_7: ({ gauss }) => () => Math.exp(0.8 * gauss()) - Math.exp(0.32),
  skew_minus_3_7: ({ gauss }) => () => Math.exp(0.32) - Math.exp(0.8 * gauss()),
};

function moments(xs) {
  const t = xs.length;
  let m = 0;
  for (const x of xs) m += x;
  m /= t;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of xs) { const d = x - m; m2 += d * d; m3 += d ** 3; m4 += d ** 4; }
  m2 /= t; m3 /= t; m4 /= t;
  return { mean: m, sharpe: m / Math.sqrt((m2 * t) / (t - 1)), skew: m3 / m2 ** 1.5, kurtosis: m4 / m2 ** 2 };
}

function study(name, trials, t, seed) {
  const r = rng(seed);
  const draw = DISTRIBUTIONS[name](r);
  const out = { student_t_null: [], dsr_standard_error: [], bootstrap: [] };
  const buf = new Float64Array(t);
  for (let rep = 0; rep < REPS; rep++) {
    let best = null;
    for (let k = 0; k < trials; k++) {
      const xs = new Float64Array(t);
      for (let i = 0; i < t; i++) xs[i] = draw();
      const mo = moments(xs);
      if (!best || mo.sharpe > best.sharpe) best = { ...mo, xs };
    }
    out.student_t_null.push(bestOfTrialsProbability(singleTrialProbability({ sharpe: best.sharpe, observations: t, periodsPerYear: 1 }).probability, trials));
    const term = 1 - best.skew * best.sharpe + ((best.kurtosis - 1) / 4) * best.sharpe ** 2;
    out.dsr_standard_error.push(bestOfTrialsProbability(normalCdf(-(best.sharpe * Math.sqrt(t - 1)) / Math.sqrt(term)), trials));
    let hits = 0;
    for (let b = 0; b < BOOT; b++) {
      for (let i = 0; i < t; i++) buf[i] = best.xs[(r.u() * t) | 0] - best.mean;
      if (moments(buf).sharpe >= best.sharpe) hits++;
    }
    out.bootstrap.push(bestOfTrialsProbability((hits + 1) / (BOOT + 1), trials));
  }
  const rate = (ps, a) => ps.filter((p) => p <= a).length / ps.length;
  return Object.fromEntries(Object.entries(out).map(([k, ps]) => [k, { at_5_percent: rate(ps, 0.05), at_50_percent: rate(ps, 0.5) }]));
}

const DESIGNS = [{ trials: 20, t: 60 }, { trials: 20, t: 252 }];
const rows = [];
let seed = 1;
for (const design of DESIGNS) {
  for (const name of Object.keys(DISTRIBUTIONS)) {
    rows.push({ distribution: name, ...design, reps: REPS, bootstrap_draws: BOOT, seed, size: study(name, design.trials, design.t, seed) });
    seed += 1;
    process.stderr.write(".");
  }
}
process.stderr.write("\n");
console.log(JSON.stringify({ schema: "canli.luck-trials-size-study.v1", rows }, null, 1));
