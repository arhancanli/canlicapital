// Placebo study v2, round 2. Every grid, block length, bootstrap setting, seed, effect size and count
// is read from the round-2 registration (config/research/placebo-v2r2-prereg.json) and, for the
// round-1 claims, from the round-1 registration (config/research/placebo-v2-prereg.json).
//
//   node run2.mjs calib <prereg1> <prereg2> [tests per cell] [workers] > calib.json
//   node run2.mjs power <prereg1> <prereg2> <french dir> <osap dir> [tests per cell] [workers] > power.json
//   node run2.mjs real  <prereg1> <prereg2> <french dir> <osap dir> [workers] > real.json
//
// calib: round 1's simulated designs, panel for panel (the same seeds, so the plain permutation's
//   ranks reproduce round 1's exactly), plus the garch_zero family. On each panel: the plain
//   permutation, the block permutation at each registered block length, the Reality Check, the SPA
//   and StepM, and the naive and Bonferroni tests.
// power: panels shaped like each claim's real in-sample data with planted timing effects of the
//   registered sizes; every method; in sample (full grid) and after the sample (published rule).
// real: the block permutation and the three bootstrap tests on every round-1 test, and every method
//   on the Open Source Asset Pricing factor-momentum claims.
//
// Work is split into jobs with fixed seeds, spread over worker threads and merged in job order, so
// the output does not depend on the number of workers.
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { placeboOrder } from "../../../../js/placebo-core.js";
import { xoshiro } from "../../null-zoo/xoshiro.mjs";
import { readFiles } from "../v2/data.mjs";
import { headline, ruleResults, warmup } from "../v2/pipelines.mjs";
import { simulatePanel } from "../v2/sim.mjs";
import { blockOrder, partialBlockOrder } from "./blocks.mjs";
import { excessSeries, snoop } from "./snoop.mjs";
import { calibrateEffect, shapeParams, simulateGarchZero, simulateShaped } from "./sim2.mjs";
import { aggregate, compileClaim, monthsBetween, publishedGrid, realTests, reorder, slice, TEST_IDS, withGrid } from "./tests.mjs";
import { readOsap } from "./osap.mjs";

const round = (x) => (x === null || x === undefined ? null : Number(x.toFixed(6)));

/** Benchmarks registered for a pipeline (the first is the primary one). */
export const benchmarksOf = (pre2, pipeline) => pre2.bootstrap.benchmarks[pipeline];

/** Round 1's permutation of rows from..n-1 (rows before kept). */
function partialPermute(n, from, next) {
  const tail = placeboOrder(n - from, { method: "permute", next });
  const idx = new Int32Array(n);
  for (let t = 0; t < from; t++) idx[t] = t;
  for (let t = from; t < n; t++) idx[t] = from + tail[t - from];
  return idx;
}

/** How many of K placebo statistics are at least as large as the real one. */
function asGoodCount(claim, view, from, grid, how, realStat, K, order) {
  let c = 0;
  for (let k = 0; k < K; k++) {
    const s = aggregate(ruleResults(withGrid(claim, grid), reorder(view, order()), from), how).stat;
    if (s >= realStat) c++;
  }
  return c;
}

/** Bootstrap p-values for every registered benchmark: { [benchmark]: snoop result }. */
function bootAll(pre2, claim, view, from, grid, block, reps, seed) {
  const out = {};
  benchmarksOf(pre2, claim.pipeline).forEach((bm, i) => {
    const series = excessSeries(claim, view, from, grid, bm);
    out[bm] = snoop(series, { block, reps, seed: (seed + 7 * i) >>> 0 });
  });
  return out;
}

const BLOCK_SALT = [0x5bd1e995, 0x1b873593, 0xcc9e2d51];

// ---- calib ----
export function calibCells(pre1, pre2) {
  const cells = [];
  const r1fam = pre1.simulation.families.map((f) => f.name);
  pre2.calibration.claims.forEach((name, ci) => {
    for (const fam of pre2.calibration.families) {
      const r1 = r1fam.indexOf(fam.name);
      // Round-1 families keep their round-1 cell index (so the panels are round 1's); garch_zero
      // cells take 16 + the claim's position.
      const seedIndex = r1 >= 0 ? ci * r1fam.length + r1 : 16 + ci;
      cells.push({ claim: name, family: fam.name, base: fam.base, strength: fam.strength ?? 0, seedIndex });
    }
  });
  return cells.map((c, index) => ({ ...c, index }));
}

export function calibChunk(pre1, pre2, cell, chunk, count) {
  const spec = pre1.claims[cell.claim];
  const claim = compileClaim(cell.claim, spec);
  const months = monthsBetween(spec.sample_start, spec.sample_end);
  const w = warmup(spec.pipeline, spec.grid);
  const seed = (pre1.simulation.base_seed + cell.seedIndex * 1000003 + chunk * 7919) >>> 0;
  const r = xoshiro(seed);
  const next = xoshiro((seed ^ 0x9e3779b9) >>> 0).u;
  const B = pre2.block.lengths;
  const blockNext = B.map((_, bi) => xoshiro((seed ^ BLOCK_SALT[bi]) >>> 0).u);
  const K = pre1.simulation.placebos;
  const bms = benchmarksOf(pre2, spec.pipeline);
  const rows = [];
  for (let rep = 0; rep < count; rep++) {
    const view = cell.base === "garch_zero" ? simulateGarchZero(spec.series.length, months, r) : simulatePanel(cell.base, spec.series.length, months, r, cell.strength);
    const real = headline(ruleResults(claim, view, w));
    const perm = asGoodCount(claim, view, w, spec.grid, "max", real.stat, K, () => placeboOrder(months, { method: "permute", next }));
    const blocks = B.map((b, bi) => asGoodCount(claim, view, w, spec.grid, "max", real.stat, K, () => blockOrder(months, b, blockNext[bi])));
    const boot = bootAll(pre2, claim, view, w, spec.grid, pre2.bootstrap.mean_block_sim, pre2.bootstrap.reps_sim, (seed + 1 + rep * 104729) >>> 0);
    rows.push({
      perm, blocks, naive: real.naive, bonferroni: real.bonferroni,
      boot: Object.fromEntries(bms.map((bm) => [bm, [boot[bm].rc_p, boot[bm].spa_p, boot[bm].stepm_reject ? 1 : 0]])),
    });
  }
  return rows;
}

// ---- power ----
export function powerCells(pre2) {
  const cells = [];
  pre2.power.claims.forEach((name, ci) => {
    pre2.power.effects.forEach((effect, ei) => {
      pre2.power.windows.forEach((window, wi) => cells.push({ claim: name, claimPos: ci, effect, effectPos: ei, window, windowPos: wi }));
    });
  });
  return cells.map((c, index) => ({ ...c, index }));
}

/** A claim's specification for the power study: round 1's, or round 2's OSAP claims. */
const specOf = (pre1, pre2, name) => pre1.claims[name] ?? pre2.claims[name];

/** The published rule's long-run score on a panel, for the effect calibration. */
function publishedScore(claim, spec) {
  const grid = publishedGrid(claim);
  const how = spec.pipeline === "vol_managed" && spec.grid.factor.length > 1 ? "mean" : "max";
  const from = warmup(spec.pipeline, spec.grid);
  return (view) => aggregate(ruleResults(withGrid(claim, grid), view, from), how).stat;
}

export function effectJob(pre1, pre2, shapes, name, effect) {
  const spec = specOf(pre1, pre2, name);
  const claim = compileClaim(name, spec);
  const kind = spec.pipeline === "vol_managed" ? "voltiming" : "trend";
  const c = pre2.power.calibration;
  const res = calibrateEffect(shapes[name], kind, effect, publishedScore(claim, spec), { months: c.months, seed: c.seed, iterations: c.iterations, withVariance: kind === "voltiming" });
  return { claim: name, effect, kind, strength: res.strength === null ? null : round(res.strength), reached: round(res.reached), off: round(res.off) };
}

export function powerChunk(pre1, pre2, shapes, strengths, cell, chunk, count) {
  const spec = specOf(pre1, pre2, cell.claim);
  const claim = compileClaim(cell.claim, spec);
  const kind = spec.pipeline === "vol_managed" ? "voltiming" : "trend";
  const isRows = monthsBetween(spec.sample_start, spec.sample_end);
  const oosRows = pre2.power.post_sample_months[cell.claim];
  const w = warmup(spec.pipeline, spec.grid);
  let x;
  if (cell.effect === 0) x = 0;
  else x = strengths[`${cell.claim}|${cell.effect}`];
  if (x === null || x === undefined) return { unreachable: true };
  const eff = kind === "trend" ? { kind, s: x } : { kind, kappa: x };
  const seed = (pre2.power.base_seed + cell.claimPos * 1000003 + cell.effectPos * 15485863 + cell.windowPos * 32452843 + chunk * 7919) >>> 0;
  const rz = xoshiro(seed), rt = xoshiro((seed ^ 0x5bd1e995) >>> 0);
  const next = xoshiro((seed ^ 0x9e3779b9) >>> 0).u;
  const B = pre2.block.lengths;
  const blockNext = B.map((_, bi) => xoshiro((seed ^ BLOCK_SALT[bi]) >>> 0).u);
  const K = pre2.power.placebos;
  const rows = [];
  for (let rep = 0; rep < count; rep++) {
    let view, from, grid, how, perm, blockOrd;
    if (cell.window === "in_sample") {
      view = simulateShaped(shapes[cell.claim], isRows, rz, rt, eff, kind === "voltiming");
      from = w; grid = spec.grid; how = "max";
      perm = () => placeboOrder(isRows, { method: "permute", next });
      blockOrd = (b, bi) => () => blockOrder(isRows, b, blockNext[bi]);
    } else {
      const n = isRows + oosRows;
      view = simulateShaped(shapes[cell.claim], n, rz, rt, eff, kind === "voltiming");
      from = isRows; grid = publishedGrid(claim);
      how = spec.pipeline === "vol_managed" && spec.grid.factor.length > 1 ? "mean" : "max";
      perm = () => partialPermute(n, isRows, next);
      blockOrd = (b, bi) => () => partialBlockOrder(n, isRows, b, blockNext[bi]);
    }
    const real = aggregate(ruleResults(withGrid(claim, grid), view, from), how);
    const permCount = asGoodCount(claim, view, from, grid, how, real.stat, K, perm);
    const blocks = B.map((b, bi) => asGoodCount(claim, view, from, grid, how, real.stat, K, blockOrd(b, bi)));
    const boot = bootAll(pre2, claim, view, from, grid, pre2.bootstrap.mean_block_sim, pre2.bootstrap.reps_sim, (seed + 1 + rep * 104729) >>> 0);
    rows.push({
      perm: permCount, blocks, naive: real.naive, bonferroni: real.bonferroni,
      boot: Object.fromEntries(Object.keys(boot).map((bm) => [bm, [boot[bm].rc_p, boot[bm].spa_p, boot[bm].stepm_reject ? 1 : 0]])),
    });
  }
  return { rows };
}

// ---- data ----
export function loadAll(pre1, pre2, frenchDir, osapDir) {
  const french = readFiles(frenchDir, pre1.data.files);
  const osap = readOsap(osapDir, pre2.data.osap);
  return { french, osap };
}

/** Round 2's OSAP claims as a registration round 1's test builder takes. */
function osapRegistration(pre2) {
  const series = {};
  for (const c of Object.values(pre2.claims)) for (const s of c.series) series[s] = { file: "osap", column: s.replace(/^osap:/, "") };
  return { claims: pre2.claims, series, data: { last_month: pre2.data.osap.last_month }, tests: { ids: TEST_IDS } };
}

export function allRealTests(pre1, pre2, data) {
  const t1 = realTests(pre1, data.french).map((t) => ({ ...t, round: 1 }));
  const offset = Object.keys(pre1.claims).length;
  const t2 = realTests(osapRegistration(pre2), { osap: data.osap }).map((t) => ({ ...t, round: 2, claimIndex: t.claimIndex + offset }));
  return [...t1, ...t2].map((t, index) => ({ ...t, index }));
}

/** The in-sample panel of each power-study claim, for its shape. */
export function shapesOf(pre1, pre2, data) {
  const out = {};
  const tests = allRealTests(pre1, pre2, data);
  for (const name of pre2.power.claims) {
    const t = tests.find((x) => x.claim === name && x.id === "in_sample_search");
    out[name] = shapeParams(t.view, { useVariance: specOf(pre1, pre2, name).pipeline === "vol_managed" });
  }
  return out;
}

export const METHODS = ["permute", "block", "bootstrap"];

export function realJobs(pre2, tests) {
  const jobs = [];
  for (const t of tests) {
    if (t.round === 2) jobs.push({ kind: "real", index: t.index, method: "permute", methodPos: 0 });
    pre2.block.lengths.forEach((b, bi) => jobs.push({ kind: "real", index: t.index, method: "block", block: b, methodPos: 1 + bi }));
    pre2.bootstrap.mean_blocks_real.forEach((mb, i) => jobs.push({ kind: "real", index: t.index, method: "bootstrap", meanBlock: mb, methodPos: 1 + pre2.block.lengths.length + i }));
  }
  return jobs;
}

export function realJob(pre1, pre2, tests, job) {
  const t = tests[job.index];
  const specs = t.round === 1 ? pre1.claims : pre2.claims;
  const claim = withGrid(compileClaim(t.claim, specs[t.claim]), t.grid);
  const seed = (pre2.real.base_seed + t.claimIndex * 1000003 + TEST_IDS.indexOf(t.id) * 7919 + job.methodPos * 104729) >>> 0;
  const head = { claim: t.claim, test: t.id, method: job.method, block: job.block ?? null, mean_block: job.meanBlock ?? null, months: t.months, scored_months: t.view.returns[0].length - t.from };
  const n = t.view.returns[0].length;
  if (job.method === "bootstrap") {
    const boot = bootAll(pre2, claim, t.view, t.from, t.grid, job.meanBlock, pre2.bootstrap.reps_real, seed);
    return { ...head, boot: Object.fromEntries(Object.entries(boot).map(([bm, r]) => [bm, { rc_p: round(r.rc_p), spa_p: round(r.spa_p), spa_p_lower: round(r.spa_p_lower), spa_p_upper: round(r.spa_p_upper), stepm_reject: r.stepm_reject, stepm_superior: r.stepm_superior, best_t: round(r.best_t), best_rule: r.best_rule }])) };
  }
  const real = aggregate(ruleResults(claim, t.view, t.from), t.aggregate);
  const next = xoshiro(seed).u;
  const order = job.method === "permute" ? () => partialPermute(n, t.permuteFrom, next) : () => partialBlockOrder(n, t.permuteFrom, job.block, next);
  const K = pre2.real.placebos;
  const stats = new Float64Array(K);
  for (let k = 0; k < K; k++) stats[k] = aggregate(ruleResults(claim, reorder(t.view, order()), t.from), t.aggregate).stat;
  const sorted = Array.from(stats).sort((a, b) => a - b);
  const q = (x) => sorted[Math.max(0, Math.ceil(x * sorted.length) - 1)];
  const asGood = stats.filter((s) => s >= real.stat).length;
  return {
    ...head, rules: real.rules, rule: real.rule ?? null, real: round(real.stat), naive_p: round(real.naive), bonferroni_p: round(real.bonferroni),
    placebos: K, as_good_as_real: asGood, p_value: round((1 + asGood) / (K + 1)),
    placebo: { median: round(q(0.5)), q95: round(q(0.95)), max: round(sorted[sorted.length - 1]) },
  };
}

// ---- workers ----
if (!isMainThread) {
  let ctx = null;
  parentPort.on("message", (msg) => {
    if (msg === null) return process.exit(0);
    if (msg.init) {
      const { pre1, pre2, frenchDir, osapDir, shapes, strengths } = msg.init;
      ctx = { pre1, pre2, shapes, strengths };
      if (frenchDir) { ctx.data = loadAll(pre1, pre2, frenchDir, osapDir); ctx.tests = allRealTests(pre1, pre2, ctx.data); }
      return;
    }
    let result;
    if (msg.kind === "calib") result = calibChunk(ctx.pre1, ctx.pre2, msg.cell, msg.chunk, msg.count);
    else if (msg.kind === "effect") result = effectJob(ctx.pre1, ctx.pre2, ctx.shapes, msg.claim, msg.effect);
    else if (msg.kind === "power") result = powerChunk(ctx.pre1, ctx.pre2, ctx.shapes, ctx.strengths, msg.cell, msg.chunk, msg.count);
    else result = realJob(ctx.pre1, ctx.pre2, ctx.tests, msg);
    parentPort.postMessage({ id: msg.id, result });
  });
}

/** Runs jobs on worker threads; results in job order. */
async function runJobs(jobs, init, workers, label) {
  const results = new Array(jobs.length);
  let nextJob = 0, done = 0;
  const started = Date.now();
  await new Promise((resolveAll, reject) => {
    if (!jobs.length) return resolveAll();
    for (let w = 0; w < Math.min(workers, jobs.length); w++) {
      const worker = new Worker(fileURLToPath(import.meta.url));
      worker.postMessage({ init });
      const feed = () => worker.postMessage(nextJob < jobs.length ? jobs[nextJob++] : null);
      worker.on("message", ({ id, result }) => {
        results[id] = result;
        done++;
        process.stderr.write(`placebo v2r2 ${label}: ${done}/${jobs.length} jobs, ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
        if (done === jobs.length) resolveAll();
        feed();
      });
      worker.on("error", reject);
      feed();
    }
  });
  return results;
}

export const summarizeRows = (rows, K) => {
  const ranks = (get) => { const c = new Array(K + 1).fill(0); for (const r of rows) c[get(r)]++; return c; };
  const out = { tests: rows.length, perm_rank_counts: ranks((r) => r.perm) };
  out.block_rank_counts = rows[0].blocks.map((_, bi) => ranks((r) => r.blocks[bi]));
  // A pooled post-sample statistic (the mean across factors) has no naive or Bonferroni test.
  out.naive_rejections = rows[0].naive === null ? null : rows.filter((r) => r.naive !== null && r.naive <= 0.05).length;
  out.bonferroni_rejections = rows[0].bonferroni === null ? null : rows.filter((r) => r.bonferroni !== null && r.bonferroni <= 0.05).length;
  out.boot = {};
  for (const bm of Object.keys(rows[0].boot)) {
    out.boot[bm] = {
      rc_rejections: rows.filter((r) => r.boot[bm][0] <= 0.05).length,
      spa_rejections: rows.filter((r) => r.boot[bm][1] <= 0.05).length,
      stepm_rejections: rows.filter((r) => r.boot[bm][2] === 1).length,
      rc_p: rows.map((r) => Number(r.boot[bm][0].toFixed(4))),
      spa_p: rows.map((r) => Number(r.boot[bm][1].toFixed(4))),
    };
  }
  return out;
};

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, p1, p2] = process.argv.slice(2);
  const pre1 = JSON.parse(readFileSync(p1, "utf8"));
  const pre2 = JSON.parse(readFileSync(p2, "utf8"));
  const cores = Math.max(1, availableParallelism() - 2);
  let out;
  if (mode === "calib") {
    const tests = Number(process.argv[5] ?? pre2.calibration.tests_per_cell);
    const workers = Number(process.argv[6] ?? cores);
    const chunk = pre2.calibration.chunk;
    const cells = calibCells(pre1, pre2);
    const jobs = [];
    for (const cell of cells) for (let c = 0; c * chunk < tests; c++) jobs.push({ kind: "calib", cell, chunk: c, count: Math.min(chunk, tests - c * chunk) });
    jobs.forEach((j, id) => { j.id = id; });
    const res = await runJobs(jobs, { pre1, pre2 }, workers, "calib");
    out = {
      schema: "canli.placebo-study.v2r2-calib", tests_per_cell: tests, base_seed: pre1.simulation.base_seed, placebos: pre1.simulation.placebos,
      block_lengths: pre2.block.lengths, bootstrap: { mean_block: pre2.bootstrap.mean_block_sim, reps: pre2.bootstrap.reps_sim },
      cells: cells.map((cell) => {
        const rows = jobs.filter((j) => j.cell.index === cell.index).flatMap((j) => res[j.id]);
        const { index, ...label } = cell;
        return { ...label, ...summarizeRows(rows, pre1.simulation.placebos) };
      }),
    };
  } else if (mode === "power" || mode === "real") {
    const [frenchDir, osapDir] = process.argv.slice(5, 7);
    const data = loadAll(pre1, pre2, frenchDir, osapDir);
    if (mode === "power") {
      const override = process.argv[7] === undefined ? null : Number(process.argv[7]);
      const testsOf = (claim) => override ?? pre2.power.tests_per_cell[claim];
      const workers = Number(process.argv[8] ?? cores);
      const shapes = shapesOf(pre1, pre2, data);
      const effJobs = [];
      for (const name of pre2.power.claims) for (const e of pre2.power.effects) if (e !== 0) effJobs.push({ kind: "effect", claim: name, effect: e });
      effJobs.forEach((j, id) => { j.id = id; });
      const eff = await runJobs(effJobs, { pre1, pre2, shapes }, workers, "power effects");
      const strengths = Object.fromEntries(eff.map((e) => [`${e.claim}|${e.effect}`, e.strength]));
      const cells = powerCells(pre2);
      const chunk = pre2.power.chunk;
      const jobs = [];
      for (const cell of cells) { const tests = testsOf(cell.claim); for (let c = 0; c * chunk < tests; c++) jobs.push({ kind: "power", cell, chunk: c, count: Math.min(chunk, tests - c * chunk) }); }
      jobs.forEach((j, id) => { j.id = id; });
      const res = await runJobs(jobs, { pre1, pre2, shapes, strengths }, workers, "power");
      out = {
        schema: "canli.placebo-study.v2r2-power", tests_per_cell: Object.fromEntries(pre2.power.claims.map((c) => [c, testsOf(c)])), base_seed: pre2.power.base_seed, placebos: pre2.power.placebos,
        block_lengths: pre2.block.lengths, bootstrap: { mean_block: pre2.bootstrap.mean_block_sim, reps: pre2.bootstrap.reps_sim },
        shapes: Object.fromEntries(Object.entries(shapes).map(([k, s]) => [k, { series: s.k, mean: s.mu.map(round), sd: s.sd.map(round) }])),
        effects: eff,
        cells: cells.map((cell) => {
          const parts = jobs.filter((j) => j.cell.index === cell.index).map((j) => res[j.id]);
          const { index, claimPos, effectPos, windowPos, ...label } = cell;
          if (parts.some((p) => p.unreachable)) return { ...label, unreachable: true };
          return { ...label, strength: cell.effect === 0 ? null : strengths[`${cell.claim}|${cell.effect}`], ...summarizeRows(parts.flatMap((p) => p.rows), pre2.power.placebos) };
        }),
      };
    } else {
      const workers = Number(process.argv[7] ?? cores);
      const tests = allRealTests(pre1, pre2, data);
      const jobs = realJobs(pre2, tests).map((j, id) => ({ ...j, id }));
      const res = await runJobs(jobs, { pre1, pre2, frenchDir, osapDir }, workers, "real");
      out = { schema: "canli.placebo-study.v2r2-real", base_seed: pre2.real.base_seed, placebos: pre2.real.placebos, block_lengths: pre2.block.lengths, bootstrap: { mean_blocks: pre2.bootstrap.mean_blocks_real, reps: pre2.bootstrap.reps_real }, results: res };
    }
  } else throw new Error("mode must be calib, power or real");
  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
  process.exit(0);
}
