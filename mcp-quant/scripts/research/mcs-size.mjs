// The model confidence set's empirical size with persistent loss differentials: M equally good
// models whose losses are 1 + e, e an AR(1) with coefficient phi (unit variance), independent across models, so every
// loss differential is an AR(1) with the same phi and all M belong in the set. A run "drops a model it should keep"
// when the set at 90% confidence holds fewer than M. This package's model_confidence_set (R statistic) is run as
// it is, with its default mean block round(T^(1/3)) and with blocks two and four times as long.
//   node scripts/research/mcs-size.mjs [out.json] [sims] [reps]   (8 Nov 2026: 1000 runs, 1000 resamples, about 12 minutes)
import { writeFileSync } from "node:fs";

import { TOOLS } from "../../src/tools/econometrics.mjs";

const [out = "mcs-size.json", simsArg = "1000", repsArg = "1000"] = process.argv.slice(2);
const mcs = TOOLS.find((t) => t.name === "model_confidence_set");
const SIMS = Number(simsArg), REPS = Number(repsArg), M = 5;
// A small seeded generator and normals, so every cell can be run again exactly.
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const normal = (rand) => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
function losses(T, phi, rand) {
  const s = Math.sqrt(1 - phi * phi), e = Array.from({ length: M }, () => normal(rand)), rows = [];
  for (let t = 0; t < T + 200; t++) {
    for (let i = 0; i < M; i++) e[i] = phi * e[i] + s * normal(rand);
    if (t >= 200) rows.push(e.map((x) => 1 + x));
  }
  return rows;
}
const results = [];
const t0 = Date.now();
for (const phi of [0, 0.5, 0.9]) for (const T of [250, 500, 1000, 2500]) {
  const base = Math.max(1, Math.round(T ** (1 / 3)));
  for (const mult of [1, 2, 4]) {
    const block = base * mult;
    let dropped = 0;
    for (let k = 0; k < SIMS; k++) {
      const rand = mulberry(1_000_003 * (phi * 10 + 1) + 7919 * T + k);
      const r = mcs.run({ losses: losses(T, phi, rand), reps: REPS, block, seed: k + 1 });
      if (r.in_set.length < M) dropped++;
    }
    const rate = dropped / SIMS;
    results.push({ phi, T, block, block_rule: mult === 1 ? "round(T^(1/3))" : `${mult} x round(T^(1/3))`, sims: SIMS, reps: REPS, dropped, rate, se: Math.sqrt(rate * (1 - rate) / SIMS) });
    console.log(`${new Date().toISOString()} phi=${phi} T=${T} block=${block}: ${dropped}/${SIMS} = ${(100 * rate).toFixed(1)}% (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    writeFileSync(out, JSON.stringify({ design: { models: M, confidence: 0.9, statistic: "R", loss: "1 + AR(1), unit variance, independent across models", burn_in: 200 }, results }, null, 1));
  }
}
console.log("DONE");
