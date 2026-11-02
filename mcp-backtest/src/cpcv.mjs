// cpcv: combinatorial purged cross-validation (Lopez de Prado 2018, Advances in Financial Machine
// Learning, chapter 12) over any set of trial return series. History is cut into N blocks. Every
// choice of k blocks is a test set; on what remains the best trial is chosen, with days beside the
// test blocks purged and embargoed so nothing leaks across the edge, and that trial's test returns
// are kept. The kept pieces stitch into C(N-1, k-1) whole paths, so a search gets a spread of
// out-of-sample results rather than the one path history happened to take.
//
// A split is the unit of work: any machine with the same file can run a shard of them, and a shard
// carries the hash of the file and settings, so a merge refuses other data, gaps and duplicates.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

import { readPanel } from "./panel-io.mjs";

const filePath = z.string().min(1).max(1000);
export const cpcvInput = z.object({
  returns_file: filePath.optional().describe("CSV: a date column and one column of daily returns per trial (breadth_book's out_file, say). At least two trials."),
  groups: z.number().int().min(3).max(30).optional().describe("Blocks history is cut into. Default 10."),
  test_groups: z.number().int().min(1).max(29).optional().describe("Blocks in each test set. Default 2."),
  purge_days: z.number().int().min(0).max(500).optional().describe("Training days dropped before each test block: at least the horizon the trials' returns look ahead over. Default 5."),
  embargo_days: z.number().int().min(0).max(500).optional().describe("Training days dropped after each test block. Default 5."),
  periods_per_year: z.number().positive().optional().describe("Default 252."),
  shard: z.object({ index: z.number().int().min(0), of: z.number().int().min(2).max(1000) }).strict().optional().describe("Run only splits s with s mod of = index, to spread the work over machines."),
  out_file: filePath.optional().describe("Write the shard as JSON here."),
  merge_files: z.array(filePath).min(2).max(1000).optional().describe("Instead of running: shard files to merge into one result."),
}).strict();

export const CPCV_LIMITS_TEXT = Object.freeze([
  "The trial with the highest training Sharpe is the one chosen in each split; another way of choosing would give other paths.",
  "Paths share days and data, so their spread is not a confidence interval and they are not independent tests.",
  "This covers the search you supply. Variants tried and left out of the file are not counted, and survivorship in the data behind the trials passes straight through.",
]);
const MAX_SPLITS = 5000, MAX_CELLS = 100_000_000;

export function choose(n, k) {
  let c = 1;
  for (let i = 1; i <= k; i += 1) c = (c * (n - k + i)) / i;
  return Math.round(c);
}
export function splitsOf(n, k) {
  const out = [], pick = [];
  const walk = (from) => {
    if (pick.length === k) { out.push([...pick]); return; }
    for (let g = from; g < n; g += 1) { pick.push(g); walk(g + 1); pick.pop(); }
  };
  walk(0);
  return out;
}
// Blocks of whole days, as equal as they can be: [first, last] inclusive.
export function blocksOf(days, n) {
  return Array.from({ length: n }, (_, g) => [Math.floor((g * days) / n), Math.floor(((g + 1) * days) / n) - 1]);
}
// 1 for a day training may use: outside the test blocks and their purge and embargo margins.
export function trainMask(days, blocks, test, purge, embargo) {
  const mask = new Uint8Array(days).fill(1);
  for (const g of test) {
    const [a, b] = blocks[g];
    for (let t = Math.max(0, a - purge); t <= Math.min(days - 1, b + embargo); t += 1) mask[t] = 0;
  }
  return mask;
}
const sharpeOf = (values, scale) => {
  let n = 0, mean = 0, s = 0;
  for (const v of values) { if (!Number.isFinite(v)) continue; n += 1; const d = v - mean; mean += d / n; s += d * (v - mean); }
  return n > 1 && s > 0 ? (mean / Math.sqrt(s / (n - 1))) * scale : null;
};

// One split: the best trial on the training days, and its returns on each test block.
export function runSplit(panel, blocks, test, { purge, embargo, scale }) {
  const days = panel.dates.length, mask = trainMask(days, blocks, test, purge, embargo);
  let best = -1, bestSharpe = -Infinity;
  panel.trials.forEach((name, i) => {
    const r = panel.values[i];
    let n = 0, mean = 0, s = 0;
    for (let t = 0; t < days; t += 1) { if (!mask[t] || !Number.isFinite(r[t])) continue; n += 1; const d = r[t] - mean; mean += d / n; s += d * (r[t] - mean); }
    const sh = n > 1 && s > 0 ? (mean / Math.sqrt(s / (n - 1))) * scale : -Infinity;
    if (sh > bestSharpe) { bestSharpe = sh; best = i; }
  });
  if (best < 0 || !Number.isFinite(bestSharpe)) throw new RangeError(`no trial has enough training days when blocks ${test.join(",")} are the test set; use fewer groups, a shorter purge, or a longer file`);
  // A chosen trial with no value on a day held nothing that day: it earns zero, and the day is counted.
  let missing = 0;
  const pieces = test.map((g) => {
    const [a, b] = blocks[g], out = [];
    for (let t = a; t <= b; t += 1) { const v = panel.values[best][t]; if (Number.isFinite(v)) out.push(v); else { out.push(0); missing += 1; } }
    return [g, out];
  });
  return { chosen: best, train_sharpe: bestSharpe, missing, pieces };
}

// The kept pieces, whole: for path j, block g comes from the j-th split that tested g.
export function assemble(results, groups) {
  const seenByGroup = Array.from({ length: groups }, () => []);
  for (const r of results.slice().sort((x, y) => x.s - y.s)) for (const [g, piece] of r.pieces) seenByGroup[g].push(piece);
  const paths = seenByGroup[0].length;
  for (const list of seenByGroup) if (list.length !== paths) throw new RangeError("the splits do not cover every block the same number of times");
  return Array.from({ length: paths }, (_, j) => seenByGroup.flatMap((list) => list[j]));
}

function summarize(results, meta) {
  const scale = Math.sqrt(meta.periods_per_year), sorted = (a) => a.slice().sort((x, y) => x - y), median = (a) => { const s = sorted(a), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const pathReturns = assemble(results, meta.groups);
  const path_sharpes = pathReturns.map((p) => sharpeOf(p, scale)).filter((x) => x !== null);
  const train = results.map((r) => r.train_sharpe);
  const counts = new Map();
  for (const r of results) counts.set(r.chosen, (counts.get(r.chosen) ?? 0) + 1);
  const chosen = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([i, n]) => ({ trial: meta.trials[i], splits: n }));
  const lost = path_sharpes.filter((x) => x <= 0).length;
  const out = {
    first_date: meta.first_date, last_date: meta.last_date, trials: meta.trials.length,
    groups: meta.groups, test_groups: meta.test_groups, purge_days: meta.purge_days, embargo_days: meta.embargo_days,
    splits: results.length, paths: path_sharpes.length, path_sharpes,
    out_of_sample_sharpe: { median: median(path_sharpes), lowest: Math.min(...path_sharpes), highest: Math.max(...path_sharpes), share_of_paths_at_or_below_zero: lost / path_sharpes.length },
    in_sample_sharpe_median: median(train),
    most_chosen: chosen, distinct_trials_chosen: counts.size,
    missing_test_days: results.reduce((n, r) => n + r.missing, 0),
  };
  out.plain_reading = `The best trial chosen on training days showed a median Sharpe of ${out.in_sample_sharpe_median.toFixed(2)} there. On the days held out it showed ${out.out_of_sample_sharpe.median.toFixed(2)}, from ${out.out_of_sample_sharpe.lowest.toFixed(2)} to ${out.out_of_sample_sharpe.highest.toFixed(2)} across ${out.paths} paths, and ${lost} of the paths lost money. ${counts.size} of ${meta.trials.length} trials were chosen at least once.`;
  out.limits = CPCV_LIMITS_TEXT;
  return out;
}

export function loadTrials(file) {
  const p = readPanel(file, "returns_file");
  if (p.tickers.length < 2) throw new RangeError("returns_file needs at least two trials: with one there is nothing to choose between");
  if (p.dates.length * p.tickers.length > MAX_CELLS) throw new RangeError(`returns_file has more than ${MAX_CELLS} values; cut it down`);
  return { dates: p.dates, trials: p.tickers, values: p.tickers.map((t) => Float64Array.from(p.values[t], (v) => (v === null ? NaN : v))) };
}

export function cpcv(args) {
  const a = cpcvInput.parse(args);
  if (a.merge_files) {
    const shards = a.merge_files.map((f) => JSON.parse(readFileSync(f, "utf8")));
    const id = shards[0].cpcv_id;
    for (const [i, s] of shards.entries()) if (s.schema !== "canli.cpcv-shard.v1" || s.cpcv_id !== id) throw new RangeError(`${a.merge_files[i]} is not a shard of the same run (file or settings differ)`);
    const results = shards.flatMap((s) => s.results), seen = new Set();
    for (const r of results) { if (seen.has(r.s)) throw new RangeError(`split ${r.s} appears in two shards`); seen.add(r.s); }
    const wanted = shards[0].meta.total_splits, missing = Array.from({ length: wanted }, (_, s) => s).filter((s) => !seen.has(s));
    if (missing.length) throw new RangeError(`shards are missing splits ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}`);
    return { cpcv_id: id, merged_from: shards.length, ...summarize(results, shards[0].meta) };
  }
  if (!a.returns_file) throw new RangeError("cpcv needs returns_file (or merge_files).");
  const groups = a.groups ?? 10, k = a.test_groups ?? 2;
  if (k >= groups) throw new RangeError("test_groups must be fewer than groups: something has to be left to train on");
  const total = choose(groups, k);
  if (total > MAX_SPLITS) throw new RangeError(`${groups} groups taken ${k} at a time is ${total} splits; the most is ${MAX_SPLITS}`);
  const panel = loadTrials(a.returns_file);
  if (panel.dates.length < groups * 5) throw new RangeError(`${panel.dates.length} days is too short for ${groups} groups`);
  const meta = { groups, test_groups: k, purge_days: a.purge_days ?? 5, embargo_days: a.embargo_days ?? 5, periods_per_year: a.periods_per_year ?? 252, trials: panel.trials, first_date: panel.dates[0], last_date: panel.dates.at(-1), total_splits: total };
  const blocks = blocksOf(panel.dates.length, groups), splits = splitsOf(groups, k), scale = Math.sqrt(meta.periods_per_year);
  const results = [];
  splits.forEach((test, s) => {
    if (a.shard && s % a.shard.of !== a.shard.index) return;
    results.push({ s, ...runSplit(panel, blocks, test, { purge: meta.purge_days, embargo: meta.embargo_days, scale }) });
  });
  if (a.shard) {
    if (a.shard.index >= a.shard.of) throw new RangeError("shard index must be below shard of");
    const cpcv_id = createHash("sha256").update(readFileSync(a.returns_file)).update(JSON.stringify(meta)).digest("hex").slice(0, 24);
    const shard = { schema: "canli.cpcv-shard.v1", cpcv_id, shard: a.shard, meta, results };
    if (a.out_file) writeFileSync(a.out_file, JSON.stringify(shard));
    return { cpcv_id, shard: a.shard, ran: results.length, of: total, ...(a.out_file ? { shard_file: a.out_file } : { shard_data: shard }), next: "Run the other shards with the same file and settings, then call cpcv with merge_files." };
  }
  return summarize(results, meta);
}
