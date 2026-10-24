// breadth_sweep: a grid of breadth-book settings run in parallel on every core of this machine, or
// split into shards that any machine with the same files can run and that merge back exactly.
//
// Every combination is a trial, and the result says so: the best in-sample Sharpe is set against the
// Sharpe the best of that many trials would reach by luck alone (the expected maximum of N draws,
// Bailey and Lopez de Prado), and, with split_date, the in-sample winner's Sharpe after the split is
// reported beside it, the honest check. A shard carries the hash of the inputs and of the grid, so a
// merge refuses shards run on other data or settings, and refuses gaps and duplicates.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { z } from "zod";

import { readPanel } from "./panel-io.mjs";

const filePath = z.string().min(1).max(1000);
export const sweepInput = z.object({
  prices_file: filePath.optional().describe("CSV of prices: date column, one column per ticker (price_panel writes one)."),
  groups_file: filePath.optional().describe("Optional ticker,group CSV."),
  dollar_volume_file: filePath.optional().describe("Optional dollar volume CSV with the same dates."),
  grid: z.object({
    smoothing: z.array(z.number().int().min(1).max(60)).min(1).max(8).optional(),
    target_vol: z.array(z.number().min(0.01).max(0.5)).min(1).max(8).optional(),
    cost_bps: z.array(z.number().min(0).max(200)).min(1).max(8).optional(),
    min_names: z.array(z.number().int().min(3).max(500)).min(1).max(8).optional(),
    signals: z.array(z.array(z.string().min(1).max(40)).min(1).max(40)).min(1).max(12).optional().describe("Signal sets to try, e.g. [[\"momentum_12_1\"], [\"momentum_12_1\", \"low_vol\"]]."),
  }).strict().optional().describe("Values to try for each setting; every combination runs (at most 400)."),
  split_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Choose on dates up to this one; report the chosen settings after it."),
  workers: z.number().int().min(1).max(64).optional().describe("Threads; default one less than this machine's cores."),
  shard: z.object({ index: z.number().int().min(0), of: z.number().int().min(2).max(1000) }).strict().optional().describe("Run only combinations k with k mod of = index, to spread a sweep over machines."),
  out_file: filePath.optional().describe("Write the results (or the shard) as JSON here."),
  merge_files: z.array(filePath).min(2).max(1000).optional().describe("Instead of running: shard files to merge into one result."),
}).strict();

const canonical = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const asFloat = (values, tickers) => Object.fromEntries(tickers.map((t) => [t, Float64Array.from(values[t], (v) => (v === null ? NaN : v))]));

function readGroups(path) {
  const out = {};
  for (const [i, line] of readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim()).entries()) {
    const [t, g] = line.split(",").map((x) => x.trim());
    if (i === 0 && /^ticker$/i.test(t)) continue;
    if (t && g) out[t] = g;
  }
  return out;
}

// The panel and groups as runBreadth takes them (used by each worker).
export function loadInputs(files) {
  const prices = readPanel(files.prices_file, "prices_file");
  const dv = files.dollar_volume_file ? readPanel(files.dollar_volume_file, "dollar_volume_file") : null;
  const tickers = prices.tickers.filter((t) => !dv || dv.tickers.includes(t));
  return { dates: prices.dates, tickers, prices: asFloat(prices.values, tickers), dollarVolume: dv ? asFloat(dv.values, tickers) : null, groups: files.groups_file ? readGroups(files.groups_file) : null };
}

// Every combination of the grid, numbered.
export function combinations(grid = {}) {
  const keys = ["signals", "smoothing", "target_vol", "cost_bps", "min_names"].filter((k) => grid[k]?.length);
  let out = [{}];
  for (const k of keys) out = out.flatMap((c) => grid[k].map((v) => ({ ...c, [k]: v })));
  return out.map((c, k) => ({ k, ...c }));
}

// The Sharpe the best of n independent trials reaches by luck, given the spread of their Sharpes
// (Bailey and Lopez de Prado 2014): sqrt(V) * ((1 - g) * Z(1 - 1/n) + g * Z(1 - 1/(n e))).
export function expectedMaxSharpe(sharpes) {
  const v = sharpes.filter(Number.isFinite), n = v.length;
  if (n < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const g = 0.5772156649;
  return sd * ((1 - g) * invNorm(1 - 1 / n) + g * invNorm(1 - 1 / (n * Math.E)));
}
// Acklam's inverse normal.
function invNorm(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = p < 0.5 ? p : 1 - p;
  if (q < 0.02425) { const r = Math.sqrt(-2 * Math.log(q)); const x = (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1); return p < 0.5 ? x : -x; }
  const r = (q - 0.5) ** 2, s = q - 0.5;
  const x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * s) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  return p < 0.5 ? x : -x;
}

function runParallel(files, combos, splitDate, workers) {
  const n = Math.max(1, Math.min(workers, combos.length)), parts = Array.from({ length: n }, () => []);
  combos.forEach((c, i) => parts[i % n].push(c));
  return Promise.all(parts.map((part) => new Promise((resolve, reject) => {
    const out = [], w = new Worker(new URL("./sweep-worker.mjs", import.meta.url), { workerData: { files, combos: part, splitDate }, execArgv: [] });
    w.on("message", (m) => { if (m.done) { resolve(out); w.terminate(); } else out.push(m); });
    w.on("error", reject);
    w.on("exit", (code) => { if (code !== 0 && code !== 1) reject(new Error(`a sweep worker stopped (exit ${code})`)); });
  }))).then((xs) => xs.flat());
}

const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

// The summary over a complete set of results.
export function summarize(results, combos, splitDate) {
  const byK = new Map(results.map((r) => [r.k, r]));
  const rows = combos.map((c) => { const r = byK.get(c.k) ?? {}; const pick = splitDate ? r.search : r.all; return [c.k, c.signals ? c.signals.join("+") : "all", c.smoothing ?? null, c.target_vol ?? null, c.cost_bps ?? null, c.min_names ?? null, r.sleeves ?? null, r.bets ?? null, pick?.sharpe ?? null, splitDate ? r.test?.sharpe ?? null : null, r.ok === false ? r.error : null]; });
  const ranked = [...rows].sort((x, y) => (y[8] ?? -99) - (x[8] ?? -99));
  const best = ranked[0], luck = expectedMaxSharpe(rows.map((r) => r[8]));
  const trials = rows.filter((r) => Number.isFinite(r[8])).length;
  return {
    trials, columns: ["k", "signals", "smoothing", "target_vol", "cost_bps", "min_names", "sleeves", "effective_bets", splitDate ? "sharpe_search" : "sharpe", "sharpe_after_split", "error"],
    rows: ranked,
    best: best ? { k: best[0], settings: combos[best[0]], sharpe: best[8], ...(splitDate ? { sharpe_after_split: best[9] } : {}) } : null,
    luck: { expected_best_sharpe_by_luck: r3(luck), best_minus_luck: best && luck != null && Number.isFinite(best[8]) ? r3(best[8] - luck) : null, note: `The best of ${trials} trials would reach about ${r3(luck)} by luck alone, from the spread of their Sharpes; only the excess above it is evidence. Correlated trials (they share data) make this benchmark conservative.` },
  };
}

export async function breadthSweep(session, args) {
  const a = sweepInput.parse(args);
  if (a.merge_files) {
    const shards = a.merge_files.map((f) => JSON.parse(readFileSync(f, "utf8")));
    const id = shards[0].sweep_id;
    for (const [i, s] of shards.entries()) if (s.schema !== "canli.breadth-sweep-shard.v1" || s.sweep_id !== id) throw new RangeError(`${a.merge_files[i]} is not a shard of the same sweep (inputs, grid or split differ).`);
    const results = shards.flatMap((s) => s.results), combos = shards[0].combos;
    const seen = new Map();
    for (const r of results) { if (seen.has(r.k)) throw new RangeError(`combination ${r.k} appears in two shards`); seen.set(r.k, r); }
    const missing = combos.filter((c) => !seen.has(c.k)).map((c) => c.k);
    if (missing.length) throw new RangeError(`shards are missing combinations ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}`);
    const out = { sweep_id: id, merged_from: shards.length, inputs: shards[0].inputs, ...summarize(results, combos, shards[0].split_date) };
    if (a.out_file) writeFileSync(a.out_file, JSON.stringify(out));
    return out;
  }
  if (!a.prices_file) throw new RangeError("breadth_sweep needs prices_file (or merge_files).");
  const files = { prices_file: a.prices_file, groups_file: a.groups_file ?? null, dollar_volume_file: a.dollar_volume_file ?? null };
  const inputs = Object.fromEntries(Object.entries(files).filter(([, p]) => p).map(([k, p]) => [k, sha(readFileSync(p))]));
  const combos = combinations(a.grid);
  if (combos.length > 400) throw new RangeError(`the grid makes ${combos.length} combinations; at most 400`);
  const sweepId = sha(canonical({ inputs, combos, split: a.split_date ?? null })).slice(0, 24);
  const mine = a.shard ? combos.filter((c) => c.k % a.shard.of === a.shard.index) : combos;
  const workers = a.workers ?? Math.max(1, availableParallelism() - 1);
  const t0 = Date.now();
  const results = await runParallel(files, mine, a.split_date ?? null, workers);
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  if (a.shard) {
    const shard = { schema: "canli.breadth-sweep-shard.v1", sweep_id: sweepId, shard: a.shard, inputs, split_date: a.split_date ?? null, combos, results };
    if (a.out_file) writeFileSync(a.out_file, JSON.stringify(shard));
    return { sweep_id: sweepId, shard: a.shard, ran: mine.length, of: combos.length, seconds, workers, ...(a.out_file ? { shard_file: a.out_file } : { results }), next: "Run the other shards (same files, grid and split_date) on any machine, then breadth_sweep with merge_files." };
  }
  const out = { sweep_id: sweepId, inputs, workers, seconds, ...summarize(results, combos, a.split_date ?? null) };
  if (a.out_file) writeFileSync(a.out_file, JSON.stringify(out));
  return { ...out, limits: ["Trials share the same data, so they are correlated: counting each as an independent trial makes the luck benchmark conservative (it overstates luck).", "Judge the chosen settings on sharpe_after_split only if nothing was chosen on those dates.", "Not investment advice."] };
}
