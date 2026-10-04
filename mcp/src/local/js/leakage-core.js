// =============================================================================
// leakage-core.js
// -----------------------------------------------------------------------------
// A lookahead check that needs no code. A causal signal's value at row t depends only on rows 0
// to t, so computing it on the first n rows gives exactly the values the full run gives for rows
// 0 to n - 1. The server picks the cut points; the caller reruns its own code on each prefix and
// sends every column back; a row whose value changed when the rows after the cut were removed
// used those rows.
//
//   planPrefixes    the cut points (prefix lengths) for a series, seeded so a plan reproduces
//   compareColumn   for each prefix: rows compared, rows that changed, the first and last changed
//                   row, the largest change, and how far before the cut the changes start
//   diagnose        what the pattern of changes says: future rows (a fixed horizon before every
//                   cut), the full sample (most of every prefix changed: a full-sample
//                   normalization, rank or fit), or sparse rows (typical of filling gaps backwards)
//
// A pass shows only that these prefixes found no lookahead: the caller supplies the columns, and
// survivorship, vendor revisions or a leak that only shows in rows never cut leave no trace here.
// =============================================================================

import { makeRandom } from "./selection-risk-core.js";

export const LEAKAGE_LIMITS = Object.freeze({
  min_observations: 30,
  max_observations: 100000,
  min_prefixes: 2,
  max_prefixes: 20,
  default_prefixes: 5,
  max_columns: 20,
  default_tolerance: 1e-9,
});

export const LEAKAGE_LIMITS_TEXT = Object.freeze([
  "A pass covers only these cuts: the columns are the caller's, and survivorship, vendor revisions or a leak no cut reaches leave no trace.",
  "Cut points fall between 40% and 95% of the series, so a leak confined to its first rows is not tested.",
]);

/**
 * Prefix lengths for a series of `observations` rows: `prefixes` distinct cuts between 40% and 95%
 * of the series, one in each equal slot of that range at a seeded position, sorted.
 */
export function planPrefixes(observations, { prefixes = LEAKAGE_LIMITS.default_prefixes, seed = 1 } = {}) {
  const n = Number(observations);
  const k = Number(prefixes);
  if (!Number.isInteger(n) || n < LEAKAGE_LIMITS.min_observations || n > LEAKAGE_LIMITS.max_observations) {
    throw new RangeError(`observations must be an integer from ${LEAKAGE_LIMITS.min_observations} to ${LEAKAGE_LIMITS.max_observations}`);
  }
  if (!Number.isInteger(k) || k < LEAKAGE_LIMITS.min_prefixes || k > LEAKAGE_LIMITS.max_prefixes) {
    throw new RangeError(`prefixes must be an integer from ${LEAKAGE_LIMITS.min_prefixes} to ${LEAKAGE_LIMITS.max_prefixes}`);
  }
  const lo = Math.ceil(0.4 * n);
  const hi = Math.floor(0.95 * n);
  if (hi - lo + 1 < k) throw new RangeError(`a series of ${n} rows has room for at most ${hi - lo + 1} cuts`);
  const next = makeRandom(Number(seed) >>> 0 || 1);
  const width = (hi - lo + 1) / k;
  const cuts = new Set();
  for (let i = 0; i < k; i++) {
    const start = lo + Math.floor(i * width);
    const end = Math.max(start, lo + Math.floor((i + 1) * width) - 1);
    let cut = start + Math.floor(next() * (end - start + 1));
    while (cuts.has(cut)) cut += 1;
    cuts.add(cut);
  }
  return [...cuts].sort((a, b) => a - b);
}

const missing = (v) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));

function readValue(v, where) {
  if (missing(v)) return null;
  const x = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  if (!Number.isFinite(x)) throw new RangeError(`${where} is ${JSON.stringify(v)}, not a number or null`);
  return x;
}

/**
 * Compares one column's full run with its prefix runs. `prefixes[i]` must hold exactly `cuts[i]`
 * values: the caller's code run on rows 0 to cuts[i] - 1. Missing values (null) match only missing
 * values; numbers match within `tolerance` relative to max(1, |a|, |b|).
 */
export function compareColumn(full, prefixes, cuts, { tolerance = LEAKAGE_LIMITS.default_tolerance, name = "column" } = {}) {
  if (!Array.isArray(full)) throw new RangeError(`${name}.full must be an array`);
  if (!Array.isArray(prefixes) || prefixes.length !== cuts.length) throw new RangeError(`${name}.prefixes must hold ${cuts.length} runs, one per cut`);
  const f = full.map((v, i) => readValue(v, `${name}.full[${i}]`));
  return cuts.map((cut, p) => {
    const run = prefixes[p];
    if (!Array.isArray(run) || run.length !== cut) {
      throw new RangeError(`${name}.prefixes[${p}] has ${Array.isArray(run) ? run.length : "no"} values; its cut is ${cut}: send your code's output on exactly the first ${cut} rows`);
    }
    if (cut > f.length) throw new RangeError(`${name}: cut ${cut} is beyond the ${f.length} rows of the full run`);
    let changed = 0, first = -1, last = -1, maxDiff = 0;
    for (let t = 0; t < cut; t++) {
      const a = f[t];
      const b = readValue(run[t], `${name}.prefixes[${p}][${t}]`);
      let same;
      if (a === null || b === null) same = a === b;
      else {
        const d = Math.abs(a - b);
        same = d <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
        if (!same && d > maxDiff) maxDiff = d;
      }
      if (!same) {
        changed += 1;
        if (first < 0) first = t;
        last = t;
      }
    }
    return {
      cut,
      compared: cut,
      changed,
      share_changed: changed / cut,
      first_changed: first < 0 ? null : first,
      last_changed: last < 0 ? null : last,
      rows_before_cut: first < 0 ? null : cut - first,
      max_abs_difference: changed ? maxDiff : 0,
    };
  });
}

/**
 * What a column's changes say. future_rows: in every prefix the changed rows sit in a block that
 * ends at the cut and is no wider than a tenth of the shortest prefix, so the value at row t uses
 * rows up to t + horizon. full_sample: most rows of some prefix changed. sparse: anything else.
 */
export function diagnose(results) {
  const touched = results.filter((r) => r.changed > 0);
  if (!touched.length) {
    return { verdict: "no_lookahead_found", pattern: "none", sentence: `No value changed in ${results.length} prefixes: these cuts found no lookahead.` };
  }
  const shortest = Math.min(...results.map((r) => r.cut));
  const horizon = Math.max(...touched.map((r) => r.rows_before_cut));
  const endsAtCut = touched.every((r) => r.last_changed === r.cut - 1 && r.changed === r.rows_before_cut);
  if (endsAtCut && horizon <= Math.max(1, Math.floor(shortest / 10))) {
    return {
      verdict: "lookahead_found",
      pattern: "future_rows",
      horizon_rows: horizon,
      sentence: `Up to ${horizon} row${horizon === 1 ? "" : "s"} before each cut changed when the later rows were removed: the value at row t uses at least the next ${horizon} row${horizon === 1 ? "" : "s"}, as shift(-${horizon}), a centered window or a forward return would.`,
    };
  }
  const widest = Math.max(...touched.map((r) => r.share_changed));
  if (widest > 0.5) {
    return {
      verdict: "lookahead_found",
      pattern: "full_sample",
      share_changed: widest,
      sentence: `Up to ${(widest * 100).toFixed(0)}% of a prefix's rows changed when later rows were removed: values depend on the whole sample, as a full-sample normalization, rank, scaling or model fit would.`,
    };
  }
  const first = Math.min(...touched.map((r) => r.first_changed));
  return {
    verdict: "lookahead_found",
    pattern: "sparse",
    first_changed: first,
    sentence: `Scattered rows changed when later rows were removed (the earliest at row ${first}): typical of filling gaps backwards (bfill) or a lookup that reaches forward.`,
  };
}

/** The whole check: every column compared at every cut, and one verdict for the set. */
export function checkLeakage({ cuts, columns, tolerance = LEAKAGE_LIMITS.default_tolerance, timestamps }) {
  if (!Array.isArray(cuts) || cuts.length < LEAKAGE_LIMITS.min_prefixes || cuts.length > LEAKAGE_LIMITS.max_prefixes) {
    throw new RangeError(`cuts must list ${LEAKAGE_LIMITS.min_prefixes} to ${LEAKAGE_LIMITS.max_prefixes} prefix lengths, as check_leakage's plan returned them`);
  }
  const names = Object.keys(columns ?? {});
  if (!names.length || names.length > LEAKAGE_LIMITS.max_columns) throw new RangeError(`send 1 to ${LEAKAGE_LIMITS.max_columns} columns`);
  const out = {};
  for (const name of names) {
    const results = compareColumn(columns[name].full, columns[name].prefixes, cuts, { tolerance, name });
    const d = diagnose(results);
    const label = (i) => (timestamps && i !== null && i !== undefined && timestamps[i] !== undefined ? timestamps[i] : undefined);
    out[name] = { ...d, ...(d.pattern === "sparse" && label(d.first_changed) ? { first_changed_at: label(d.first_changed) } : {}), prefixes: results };
  }
  const flagged = names.filter((n) => out[n].verdict === "lookahead_found");
  return {
    verdict: flagged.length ? "lookahead_found" : "no_lookahead_found",
    flagged_columns: flagged,
    cuts,
    tolerance,
    columns: out,
  };
}
