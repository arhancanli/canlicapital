// Placebo study v2: the pipeline placebo applied to published factor-timing claims. Every grid, window,
// seed and count is read from the pre-registration (config/research/placebo-v2-prereg.json), which was
// committed and pushed before this script was run on the real data.
//
//   node scripts/research/placebo/v2/run.mjs sim  <prereg> [tests per cell] [base seed] [workers] > out.json
//   node scripts/research/placebo/v2/run.mjs real <prereg> <csv dir> [workers] > out.json
//
// sim: the calibration. For each primary claim's pipeline and each simulated family, draw a panel
// shaped like the claim's in-sample data, run the whole grid on it and on 19 placebos, record the rank.
// real: for each claim and test, run the grid on the real panel and on K placebos (periods reordered
// by js/placebo-core.js's placeboOrder, the same order for every series) and report the p-value
// (1 + placebos at least as good) / (K + 1).
//
// Work is split into jobs with fixed seeds, spread over worker threads and merged in job order, so
// the output is identical whatever the number of workers.
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { placeboOrder } from "../../../../js/placebo-core.js";
import { xoshiro } from "../../null-zoo/xoshiro.mjs";
import { panel, readFiles, lastCommonMonth } from "./data.mjs";
import { expand, headline, ruleResults, warmup } from "./pipelines.mjs";
import { simulatePanel } from "./sim.mjs";

const monthIndex = (yyyymm) => Math.floor(yyyymm / 100) * 12 + ((yyyymm % 100) - 1);
const monthsBetween = (a, b) => monthIndex(b) - monthIndex(a) + 1;

/** A claim from the pre-registration, with names turned into column indices. */
export function compileClaim(name, spec) {
  const index = new Map(spec.series.map((s, i) => [s, i]));
  const at = (s) => { if (!index.has(s)) throw new Error(`${name}: unknown series ${s}`); return index.get(s); };
  const claim = { name, ...spec };
  if (spec.pipeline === "vol_managed") claim.columns = Object.fromEntries(spec.series.map((s) => [s, at(s)]));
  else claim.universes = Object.fromEntries(Object.entries(spec.universes).map(([u, list]) => [u, list.map(at)]));
  return claim;
}

/** A grid with one value per key: one rule. */
const single = (rule) => Object.fromEntries(Object.entries(rule).map(([k, v]) => [k, [v]]));

/** The published rule as a grid: for volatility management, the rule on every factor in the claim. */
function publishedGrid(claim) {
  if (claim.pipeline === "vol_managed") return { factor: claim.grid.factor, window: [claim.published.window], power: [claim.published.power] };
  return single(claim.published);
}

/** The statistic a test reports from its rule results. */
function aggregate(results, how) {
  if (how === "mean") return { stat: results.reduce((a, r) => a + r.stat, 0) / results.length, naive: null, bonferroni: null, rules: results.length };
  return headline(results);
}

/** A view of rows [a, b) of a panel. */
const slice = (p, a, b) => ({ returns: p.returns.map((c) => c.subarray(a, b)), variance: p.variance.map((c) => (c ? c.subarray(a, b) : null)) });

/** A view reordered by idx (row t of the result is row idx[t]). */
const reorder = (v, idx) => ({ returns: v.returns.map((c) => Float64Array.from(idx, (i) => c[i])), variance: v.variance.map((c) => (c ? Float64Array.from(idx, (i) => c[i]) : null)) });

/** Rows 0..from-1 kept, rows from..n-1 permuted among themselves. */
function partialOrder(n, from, next) {
  const tail = placeboOrder(n - from, { method: "permute", next });
  const idx = new Int32Array(n);
  for (let t = 0; t < from; t++) idx[t] = t;
  for (let t = from; t < n; t++) idx[t] = from + tail[t - from];
  return idx;
}

/** Runs one real-data test: the real statistic and K placebo statistics. */
export function runTest(claim, test, view, placebos, seed) {
  const real = aggregate(ruleResults(claim, view, test.from, { grid: test.grid }), test.aggregate);
  const next = xoshiro(seed >>> 0).u;
  const n = view.returns[0].length;
  const stats = new Float64Array(placebos);
  for (let k = 0; k < placebos; k++) {
    const idx = partialOrder(n, test.permuteFrom, next);
    stats[k] = aggregate(ruleResults(claim, reorder(view, idx), test.from, { grid: test.grid }), test.aggregate).stat;
  }
  return { real, stats };
}

// ruleResults reads the claim's own grid; a test may narrow it.
const withGrid = (claim, grid) => ({ ...claim, grid });

/** Every real-data test of every claim, with its window, scored rows and grid. */
export function realTests(prereg, blocks) {
  const tests = [];
  const names = Object.keys(prereg.claims);
  names.forEach((name, ci) => {
    const spec = prereg.claims[name];
    const claim = compileClaim(name, spec);
    const sources = spec.series.map((s) => ({ name: s, ...prereg.series[s] }));
    const last = Math.min(lastCommonMonth(blocks, sources), prereg.data.last_month);
    const p = panel(blocks, sources, spec.sample_start, last);
    const isRows = monthsBetween(spec.sample_start, spec.sample_end);
    const w = warmup(spec.pipeline, spec.grid);
    const all = p.months.length;
    const is = slice(p, 0, isRows), full = slice(p, 0, all);
    const make = (id, view, from, permuteFrom, grid, how) => ({ claim: name, claimIndex: ci, id, view, from, permuteFrom, grid, aggregate: how, months: [p.months[from], p.months[view.returns[0].length - 1]] });
    const t1 = make("in_sample_search", is, w, 0, spec.grid, "max");
    // The rule the real in-sample search picks (for the out-of-sample test of the selected rule).
    const picked = headline(ruleResults(withGrid(claim, spec.grid), is, w)).rule;
    const pubHow = spec.pipeline === "vol_managed" && spec.grid.factor.length > 1 ? "mean" : "max";
    for (const t of [
      t1,
      make("oos_published", full, isRows, isRows, publishedGrid(claim), pubHow),
      make("oos_selected", full, isRows, isRows, single(picked), "max"),
      make("oos_search", full, isRows, isRows, spec.grid, "max"),
      make("full_search", full, w, 0, spec.grid, "max"),
    ]) {
      if (!(spec.tests ?? prereg.tests.ids).includes(t.id)) continue;
      tests.push({ ...t, index: tests.length, picked: t.id === "oos_selected" ? picked : undefined });
    }
  });
  return tests;
}

export const testSeed = (base, t) => (base + t.claimIndex * 1000003 + ["in_sample_search", "oos_published", "oos_selected", "oos_search", "full_search"].indexOf(t.id) * 7919) >>> 0;

function realJob(prereg, t) {
  const claim = withGrid(compileClaim(t.claim, prereg.claims[t.claim]), t.grid);
  const { real, stats } = runTest(claim, t, t.view, prereg.real.placebos, testSeed(prereg.real.base_seed, t));
  const sorted = Array.from(stats).sort((a, b) => a - b);
  const q = (x) => sorted[Math.max(0, Math.ceil(x * sorted.length) - 1)];
  const asGood = stats.filter((s) => s >= real.stat).length;
  const round = (x) => (x === null || x === undefined ? null : Number(x.toFixed(6)));
  return {
    claim: t.claim, test: t.id, months: t.months, scored_months: t.view.returns[0].length - t.from,
    rules: real.rules, rule: real.rule ?? null, real: round(real.stat), naive_p: round(real.naive), bonferroni_p: round(real.bonferroni),
    placebos: stats.length, as_good_as_real: asGood, p_value: round((1 + asGood) / (stats.length + 1)),
    placebo: { median: round(q(0.5)), q95: round(q(0.95)), max: round(sorted[sorted.length - 1]) },
  };
}

// ---- simulation ----
export function simCells(prereg) {
  const cells = [];
  for (const name of prereg.simulation.claims) {
    const spec = prereg.claims[name];
    for (const family of prereg.simulation.families) cells.push({ claim: name, family: family.name, base: family.base, strength: family.strength ?? 0 });
  }
  return cells.map((c, index) => ({ ...c, index }));
}

function simChunk(prereg, cell, chunk, count, baseSeed) {
  const spec = prereg.claims[cell.claim];
  const claim = compileClaim(cell.claim, spec);
  const months = monthsBetween(spec.sample_start, spec.sample_end);
  const w = warmup(spec.pipeline, spec.grid);
  const seed = (baseSeed + cell.index * 1000003 + chunk * 7919) >>> 0;
  const r = xoshiro(seed);
  const next = xoshiro((seed ^ 0x9e3779b9) >>> 0).u;
  const K = prereg.simulation.placebos;
  const ranks = new Array(K + 1).fill(0);
  let naive = 0, bonferroni = 0;
  for (let rep = 0; rep < count; rep++) {
    const view = simulatePanel(cell.base, spec.series.length, months, r, cell.strength);
    const real = headline(ruleResults(claim, view, w));
    if (real.naive <= 0.05) naive++;
    if (real.bonferroni <= 0.05) bonferroni++;
    let asGood = 0;
    for (let k = 0; k < K; k++) {
      const s = headline(ruleResults(claim, reorder(view, placeboOrder(months, { method: "permute", next })), w)).stat;
      if (s >= real.stat) asGood++;
    }
    ranks[asGood]++;
  }
  return { ranks, naive, bonferroni, count };
}

function simJobs(prereg, tests, baseSeed) {
  const jobs = [];
  const chunk = prereg.simulation.chunk;
  for (const cell of simCells(prereg)) for (let c = 0; c * chunk < tests; c++) jobs.push({ kind: "sim", cell, chunk: c, count: Math.min(chunk, tests - c * chunk), baseSeed });
  return jobs;
}

// ---- workers ----
if (!isMainThread) {
  let prereg = null, tests = null;
  parentPort.on("message", (msg) => {
    if (msg === null) return process.exit(0);
    if (msg.init) {
      prereg = msg.init.prereg;
      if (msg.init.csvDir) tests = realTests(prereg, readFiles(msg.init.csvDir, prereg.data.files));
      return;
    }
    const result = msg.kind === "sim" ? simChunk(prereg, msg.cell, msg.chunk, msg.count, msg.baseSeed) : realJob(prereg, tests[msg.index]);
    parentPort.postMessage({ id: msg.id, result });
  });
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, preregPath] = process.argv.slice(2);
  const prereg = JSON.parse(readFileSync(preregPath, "utf8"));
  let jobs, init, header;
  if (mode === "sim") {
    const tests = Number(process.argv[4] ?? prereg.simulation.tests_per_cell);
    const baseSeed = Number(process.argv[5] ?? prereg.simulation.base_seed);
    jobs = simJobs(prereg, tests, baseSeed).map((j, id) => ({ ...j, id }));
    init = { prereg };
    header = { schema: "canli.placebo-study.v2-sim", tests_per_cell: tests, base_seed: baseSeed, placebos: prereg.simulation.placebos };
  } else if (mode === "real") {
    const csvDir = process.argv[4];
    const tests = realTests(prereg, readFiles(csvDir, prereg.data.files));
    jobs = tests.map((t, id) => ({ kind: "real", index: t.index, id }));
    init = { prereg, csvDir };
    header = { schema: "canli.placebo-study.v2-real", base_seed: prereg.real.base_seed, placebos: prereg.real.placebos };
  } else throw new Error("mode must be sim or real");
  const workers = Number(process.argv[mode === "sim" ? 6 : 5] ?? Math.max(1, availableParallelism() - 2));
  const results = new Array(jobs.length);
  let nextJob = 0, done = 0;
  const started = Date.now();
  await new Promise((resolveAll, reject) => {
    for (let w = 0; w < Math.min(workers, jobs.length); w++) {
      const worker = new Worker(fileURLToPath(import.meta.url));
      worker.postMessage({ init });
      const feed = () => worker.postMessage(nextJob < jobs.length ? jobs[nextJob++] : null);
      worker.on("message", ({ id, result }) => {
        results[id] = result;
        done++;
        process.stderr.write(`placebo v2 ${mode}: ${done}/${jobs.length} jobs, ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
        if (done === jobs.length) resolveAll();
        feed();
      });
      worker.on("error", reject);
      feed();
    }
  });
  let out;
  if (mode === "sim") {
    out = { ...header, cells: simCells(prereg).map((cell) => {
      const mine = jobs.filter((j) => j.cell.index === cell.index).map((j) => results[j.id]);
      const sum = (f) => mine.reduce((a, r) => a + f(r), 0);
      const { index, ...label } = cell;
      return { ...label, tests: sum((r) => r.count), rank_counts: Array.from({ length: prereg.simulation.placebos + 1 }, (_, j) => sum((r) => r.ranks[j])), naive_rejections: sum((r) => r.naive), bonferroni_rejections: sum((r) => r.bonferroni) };
    }) };
  } else out = { ...header, tests: results };
  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
  process.exit(0);
}
