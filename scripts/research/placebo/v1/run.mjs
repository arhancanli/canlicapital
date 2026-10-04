// Placebo study v1: is the pipeline placebo calibrated, and which way of reordering periods should
// placebo_test use? For every simulated market and pipeline, one test draws a market, runs the
// pipeline on it, runs it again on 19 placebos made by each candidate method (js/placebo-core.js's
// own placeboOrder and placeboPanel), and records the real result's rank. On null markets a
// calibrated method puts the real result first (p = 0.05) one time in 20; on trend markets the share
// is the method's power. The bar and the rule that picks the method are pre-registered in
// config/research/placebo-v1-prereg.json, committed before this run.
//
// Work is split into chunks of tests with fixed seeds, spread over worker threads and merged in
// chunk order, so the output is byte-identical whatever the number of workers.
//   node scripts/research/placebo/v1/run.mjs [null tests per cell] [power tests per cell] [workers] [base seed] > config/research/placebo-v1.json
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { PLACEBO_METHODS, placeboOrder, placeboPanel } from "../../../../js/placebo-core.js";
import { xoshiro } from "../../null-zoo/xoshiro.mjs";
import { NULL_FAMILIES, crossSection, singleAsset, trendingAsset, trendingCrossSection } from "./markets.mjs";
import { PIPELINES, runPipeline } from "./pipelines.mjs";

export const DESIGN_V1 = Object.freeze({
  observations: 1260,
  placebos: 19,
  methods: PLACEBO_METHODS,
  chunk: 250,
  baseSeed: 20261006,
  // Planted strengths: the trend's stationary standard deviation as a share of daily volatility.
  strengths: Object.freeze({ single: Object.freeze([0.04, 0.08, 0.16]), cross_section: Object.freeze([0.02, 0.04, 0.08]) }),
});

/** Every cell: null markets for the size bar, then trend markets for power. */
export function cellList(design = DESIGN_V1) {
  const cells = [];
  for (const [pipeline, { assets }] of Object.entries(PIPELINES)) {
    const variants = assets === "single" ? ["flat", "drift"] : ["flat", "dispersed"];
    for (const family of NULL_FAMILIES) for (const variant of variants) cells.push({ kind: "null", pipeline, family, variant });
  }
  for (const [pipeline, { assets }] of Object.entries(PIPELINES)) {
    for (const strength of design.strengths[assets]) cells.push({ kind: "power", pipeline, family: "trend", strength });
  }
  return cells.map((cell, index) => ({ ...cell, index }));
}

function market(cell, observations, r) {
  const single = PIPELINES[cell.pipeline].assets === "single";
  if (cell.kind === "power") return single ? trendingAsset(cell.strength, observations, r) : trendingCrossSection(cell.strength, observations, r);
  return single ? singleAsset(cell.family, cell.variant, observations, r) : crossSection(cell.family, cell.variant, observations, r);
}

export const chunkSeed = (design, cell, chunk) => (design.baseSeed + cell.index * 1000003 + chunk * 7919) >>> 0;

/** Runs `count` tests of one cell from one chunk's seeds; returns integer counts and float sums. */
export function runChunk(cell, chunk, count, design = DESIGN_V1) {
  const seed = chunkSeed(design, cell, chunk);
  const r = xoshiro(seed);
  const next = xoshiro((seed ^ 0x9e3779b9) >>> 0).u;
  const ranks = Object.fromEntries(design.methods.map((m) => [m, new Array(design.placebos + 1).fill(0)]));
  const placeboSharpe = Object.fromEntries(design.methods.map((m) => [m, 0]));
  let naive = 0, bonferroni = 0, realSharpe = 0;
  for (let rep = 0; rep < count; rep++) {
    const columns = market(cell, design.observations, r);
    const real = runPipeline(cell.pipeline, columns);
    realSharpe += real.sharpe;
    if (real.naive <= 0.05) naive++;
    if (real.bonferroni <= 0.05) bonferroni++;
    for (const method of design.methods) {
      let asGood = 0;
      for (let k = 0; k < design.placebos; k++) {
        const order = placeboOrder(design.observations, { method, next });
        const result = runPipeline(cell.pipeline, placeboPanel(columns, { kind: "returns", order })).sharpe;
        placeboSharpe[method] += result;
        if (result >= real.sharpe) asGood++;
      }
      ranks[method][asGood]++;
    }
  }
  return { ranks, placeboSharpe, naive, bonferroni, realSharpe, count };
}

export function jobList(nullTests, powerTests, design = DESIGN_V1) {
  const jobs = [];
  for (const cell of cellList(design)) {
    const tests = cell.kind === "null" ? nullTests : powerTests;
    for (let chunk = 0; chunk * design.chunk < tests; chunk++) jobs.push({ id: jobs.length, cell, chunk, count: Math.min(design.chunk, tests - chunk * design.chunk), baseSeed: design.baseSeed });
  }
  return jobs;
}

/** Merges chunk results in job order. rank_counts[m][j]: tests where j placebos were at least as good. */
export function assemble(nullTests, powerTests, jobs, results, design = DESIGN_V1) {
  const round = (x) => Number(x.toFixed(6));
  const cells = cellList(design).map((cell) => {
    const mine = jobs.filter((j) => j.cell.index === cell.index).map((j) => results[j.id]);
    const total = (pick) => mine.reduce((a, res) => a + pick(res), 0);
    const tests = total((res) => res.count);
    const rankCounts = Object.fromEntries(design.methods.map((m) => [m, Array.from({ length: design.placebos + 1 }, (_, j) => total((res) => res.ranks[m][j]))]));
    const { index, ...label } = cell;
    return {
      ...label,
      tests,
      rank_counts: rankCounts,
      naive_rejections: total((res) => res.naive),
      bonferroni_rejections: total((res) => res.bonferroni),
      mean_real_sharpe: round(total((res) => res.realSharpe) / tests),
      mean_placebo_sharpe: Object.fromEntries(design.methods.map((m) => [m, round(total((res) => res.placeboSharpe[m]) / (tests * design.placebos))])),
    };
  });
  return { schema: "canli.placebo-study.v1", design: { ...design, null_tests: nullTests, power_tests: powerTests }, cells };
}

if (!isMainThread) {
  parentPort.on("message", (job) => {
    if (job === null) return process.exit(0);
    parentPort.postMessage({ id: job.id, result: runChunk(job.cell, job.chunk, job.count, { ...DESIGN_V1, baseSeed: job.baseSeed }) });
  });
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const nullTests = Number(process.argv[2] ?? 10000);
  const powerTests = Number(process.argv[3] ?? 2000);
  const workers = Number(process.argv[4] ?? Math.max(1, availableParallelism() - 2));
  const design = { ...DESIGN_V1, baseSeed: Number(process.argv[5] ?? DESIGN_V1.baseSeed) };
  const jobs = jobList(nullTests, powerTests, design);
  const results = new Array(jobs.length);
  let nextJob = 0, done = 0;
  const started = Date.now();
  await new Promise((resolveAll, reject) => {
    for (let w = 0; w < Math.min(workers, jobs.length); w++) {
      const worker = new Worker(fileURLToPath(import.meta.url));
      const feed = () => worker.postMessage(nextJob < jobs.length ? jobs[nextJob++] : null);
      worker.on("message", ({ id, result }) => {
        results[id] = result;
        done++;
        if (done % 50 === 0 || done === jobs.length) process.stderr.write(`placebo v1: ${done}/${jobs.length} chunks, ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
        if (done === jobs.length) resolveAll();
        feed();
      });
      worker.on("error", reject);
      feed();
    }
  });
  process.stdout.write(`${JSON.stringify(assemble(nullTests, powerTests, jobs, results, design))}\n`);
  process.exit(0);
}
