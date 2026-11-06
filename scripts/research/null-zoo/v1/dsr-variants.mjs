// Null Zoo v1, deflated Sharpe variants: size and power of the three implementations that López de Prado and Porcu
// unify in "The Deflated Sharpe Ratio: A Unified Framework for Search-Adjusted Performance Inference" (SSRN 7198158),
// on v1's nine return families and four skill levels (20 strategies over 504 days, 10,000 searches per cell).
//
//   dsr_l                 the 2014 location form, as v1 scores it (deflated_sharpe: the expected maximum from the
//                         cross-trial variance of the 20 Sharpe ratios, the best trial's own skew and kurtosis)
//   dsr_ls_phi_*          location and scale of the selected maximum: Phi((SR_c - mu_K) / sigma_K)
//   dsr_ls_gumbel_*       the same with the standardized Gumbel reference, exp(-exp(-(gamma + pi u / sqrt 6)))
//   dsr_eo_*              the complete search distribution for independent trials: Phi(SR_c / sqrt V)^K
//
// mu_K = sqrt(V) m_K and sigma_K = sqrt(V) f_K, with m_K and f_K the exact mean and standard deviation of the
// maximum of K standard normals. Each scale-based variant is run with both choices of V the papers allow:
//   _va   the sample variance of the 20 daily Sharpe ratios (the skilled one included, as in v1's DSR)
//   _vb   the sharp-null average of each trial's variance, (1/K) sum (1/T) (1 + rho_k) / (1 - rho_k)
// A discovery is DSR >= 1 - level, so each variant's p-value is 1 - DSR. luck_trials, the best-of-N Student t
// test, is kept beside them as the reference the author named: 1 - F0(SR_max)^20.
//   node scripts/research/null-zoo/v1/dsr-variants.mjs [searches per cell] > config/research/null-zoo-v1-dsr-variants.json
import { fileURLToPath } from "node:url";
import { normalCdf } from "../../../../js/dsr-core.js";
import { VALIDATORS, lagOne, summarize } from "../validators.mjs";
import { xoshiro } from "../xoshiro.mjs";
import { FAMILIES_V1, drawSearchV1 } from "./families.mjs";

export const DSR_DESIGN = Object.freeze({
  trials: 20, observations: 504, periodsPerYear: 252, levels: Object.freeze([0.01, 0.05, 0.1]),
  skills: Object.freeze([0, 1, 2, 3]), baseSeed: 20261106,
});
const EULER = 0.5772156649015329;

/** The exact mean and standard deviation of the maximum of K standard normals (Simpson's rule on [-12, 12]). */
export function maxNormalMoments(K, intervals = 96000) {
  const a = -12, h = 24 / intervals;
  let m1 = 0, m2 = 0;
  for (let i = 0; i <= intervals; i++) {
    const x = a + i * h;
    const w = i === 0 || i === intervals ? 1 : i % 2 ? 4 : 2;
    const density = K * normalCdf(x) ** (K - 1) * Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    m1 += w * x * density;
    m2 += w * x * x * density;
  }
  m1 *= h / 3;
  m2 *= h / 3;
  return Object.freeze({ mean: m1, sd: Math.sqrt(m2 - m1 * m1) });
}
export const MAX20 = maxNormalMoments(DSR_DESIGN.trials);

/** p-values (1 - DSR) of the scale-based variants for the selected daily Sharpe ratio srBest, given V and K. */
export function variantP(srBest, V, K, max = MAX20) {
  const root = Math.sqrt(V);
  const u = (srBest - root * max.mean) / (root * max.sd);
  const upper = normalCdf(-srBest / root);
  return {
    ls_phi: normalCdf(-u),
    ls_gumbel: -Math.expm1(-Math.exp(-(EULER + (Math.PI * u) / Math.sqrt(6)))),
    eo: -Math.expm1(K * Math.log1p(-upper)),
  };
}

export const DSR_TESTS = Object.freeze(["dsr_l", "dsr_ls_phi_va", "dsr_ls_gumbel_va", "dsr_eo_va", "dsr_ls_phi_vb", "dsr_ls_gumbel_vb", "dsr_eo_vb", "luck_trials"]);

/** Every test's p-value for one search. */
export function searchP(search, s) {
  const K = s.trials, T = s.observations;
  const srs = s.stats.map((x) => x.sharpe);
  const mean = srs.reduce((a, b) => a + b, 0) / K;
  const va = srs.reduce((a, b) => a + (b - mean) ** 2, 0) / (K - 1);
  const vb = search.reduce((a, xs, k) => { const r = lagOne(xs, s.stats[k].mean); return a + (1 + r) / (1 - r) / T; }, 0) / K;
  const a = variantP(srs[s.best], va, K), b = variantP(srs[s.best], vb, K);
  return {
    dsr_l: VALIDATORS.deflated_sharpe.p(search, s),
    dsr_ls_phi_va: a.ls_phi, dsr_ls_gumbel_va: a.ls_gumbel, dsr_eo_va: a.eo,
    dsr_ls_phi_vb: b.ls_phi, dsr_ls_gumbel_vb: b.ls_gumbel, dsr_eo_vb: b.eo,
    luck_trials: VALIDATORS.luck_trials.p(search, s),
  };
}

export const cellSeed = (design, f, k) => (design.baseSeed + (f * design.skills.length + k) * 1000003) >>> 0;

/** Rejection counts of every test at every level over `reps` searches of one family and skill, from one seed. */
export function runCell(family, skill, reps, seed, design = DSR_DESIGN) {
  const r = xoshiro(seed);
  const rejections = Object.fromEntries(DSR_TESTS.map((name) => [name, design.levels.map(() => 0)]));
  let bestIsSkilled = 0;
  for (let rep = 0; rep < reps; rep++) {
    const search = drawSearchV1(family, { ...design, skill }, r);
    const s = summarize(search, design.periodsPerYear);
    if (s.best === 0) bestIsSkilled++;
    const ps = searchP(search, s);
    for (const name of DSR_TESTS) {
      const p = ps[name];
      if (!(p >= 0 && p <= 1)) throw new RangeError(`${name} gave p = ${p} in ${family} skill ${skill}`);
      design.levels.forEach((level, i) => { if (p <= level) rejections[name][i]++; });
    }
  }
  return { rejections, bestIsSkilled };
}

export function study(reps, design = DSR_DESIGN) {
  const cells = [];
  FAMILIES_V1.forEach((family, f) => design.skills.forEach((skill, k) => {
    const seed = cellSeed(design, f, k);
    const { rejections, bestIsSkilled } = runCell(family, skill, reps, seed, design);
    cells.push({
      family, skill, searches: reps, seed, best_is_skilled_trial: bestIsSkilled,
      rate: Object.fromEntries(DSR_TESTS.map((name) => [name, Object.fromEntries(design.levels.map((a, i) => [String(a), rejections[name][i] / reps]))])),
    });
  }));
  return {
    schema: "canli.null-zoo.v1.dsr-variants",
    generator: "xoshiro128** seeded by splitmix32; one seed per family and skill",
    source: "López de Prado and Porcu, The Deflated Sharpe Ratio: A Unified Framework for Search-Adjusted Performance Inference, SSRN 7198158",
    design, reps_per_cell: reps,
    max_of_20_standard_normals: { mean: Number(MAX20.mean.toFixed(6)), sd: Number(MAX20.sd.toFixed(6)) },
    tests: DSR_TESTS,
    cells,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const reps = Number(process.argv[2] ?? 10000);
  const started = Date.now();
  const out = study(reps);
  for (const c of out.cells.filter((x) => x.family === "iid_normal")) {
    process.stderr.write(`iid skill ${c.skill}: ${DSR_TESTS.map((n) => `${n} ${c.rate[n]["0.05"]}`).join(", ")}\n`);
  }
  process.stderr.write(`done in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
}
