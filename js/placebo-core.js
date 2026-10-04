// =============================================================================
// placebo-core.js
// -----------------------------------------------------------------------------
// The pipeline placebo. A research pipeline searches data for a strategy and reports a result,
// usually the best Sharpe it found. How good a result does the same pipeline find in data where
// nothing can be predicted? A placebo dataset holds the real returns with their periods reordered,
// the same reordering for every column: each column keeps its returns (mean, volatility, fat
// tails) and each period keeps its cross-section, but no period's position says anything about
// the next. The caller runs its own pipeline on the real data and on every placebo; the rank of the
// real result among the placebo results is the p-value. The pipeline's code never leaves the
// caller, and every choice the pipeline makes is counted, because it makes them again on every
// placebo.
//
//   placeboOrder     one reordering of n periods: a permutation, a permutation of blocks, or a
//                    stationary bootstrap (Politis and Romano 1994)
//   placeboPanel     a panel of prices or returns, reordered: prices are rebuilt from the
//                    reordered returns, starting from the real first prices
//   placeboPanels    K placebos from one seed, one at a time
//   placeboPValue    the real result's rank among the placebo results, as a p-value
//
// When the periods are exchangeable (independent and identically distributed rows), the real data
// and each permutation of it are equally likely, so the real result's rank is uniform and the
// permutation p-value is exact. Volatility clustering breaks exchangeability; how far that moves
// the p-value was measured before a method was chosen (scripts/research/placebo/v1/).
// =============================================================================

import { makeRandom } from "./selection-risk-core.js";
import { defaultBlock, stationaryIndices } from "./snooping-core.js";

export const PLACEBO_METHODS = Object.freeze(["permute", "block_permute", "stationary_bootstrap"]);

export const PLACEBO_LIMITS = Object.freeze({
  min_rows: 30,
  max_rows: 100000,
  max_columns: 500,
  max_cells: 5000000,
  min_placebos: 19,
  max_placebos: 199,
  default_placebos: 19,
});

export const PLACEBO_LIMITS_TEXT = Object.freeze([
  "Beating the placebos shows the pipeline finds more in the real order of the returns than in random orders of the same returns; it does not show the edge survives costs, capacity or the future.",
  "Only the search this pipeline runs is counted: pipelines tried and dropped before it are not.",
]);

/** A uniform integer in [0, k) from a uniform generator in [0, 1). */
const below = (next, k) => Math.min(k - 1, Math.floor(next() * k));

/** Fisher-Yates over an Int32Array in place. */
function shuffle(values, next) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = below(next, i + 1);
    const v = values[i];
    values[i] = values[j];
    values[j] = v;
  }
  return values;
}

/**
 * One reordering of n periods, as the index of the real period each placebo period takes.
 * permute: every order equally likely. block_permute: the periods cut into consecutive blocks of
 * `block` (the last may be shorter) and the blocks shuffled, so structure inside a block survives.
 * stationary_bootstrap: blocks of random length with mean `block`, drawn with replacement.
 */
export function placeboOrder(n, { method = "permute", block, next }) {
  if (!PLACEBO_METHODS.includes(method)) throw new RangeError(`method must be one of ${PLACEBO_METHODS.join(", ")}`);
  if (method === "permute") return shuffle(Int32Array.from({ length: n }, (_, i) => i), next);
  const b = block ?? defaultBlock(n);
  if (!Number.isInteger(b) || b < 1 || b > n) throw new RangeError(`block must be a whole number from 1 to ${n}`);
  if (method === "stationary_bootstrap") return stationaryIndices(n, b, next);
  const starts = shuffle(Int32Array.from({ length: Math.ceil(n / b) }, (_, k) => k * b), next);
  const out = new Int32Array(n);
  let at = 0;
  for (const start of starts) for (let t = start; t < Math.min(n, start + b); t++) out[at++] = t;
  return out;
}

/**
 * Checks a panel (columns of equal length) and returns the number of periods the placebo reorders:
 * the rows of a returns panel, or the returns between rows of a prices panel.
 */
export function checkPanel(columns, kind = "prices") {
  if (kind !== "prices" && kind !== "returns") throw new RangeError('kind must be "prices" or "returns"');
  if (!Array.isArray(columns) || !columns.length || columns.length > PLACEBO_LIMITS.max_columns) {
    throw new RangeError(`send 1 to ${PLACEBO_LIMITS.max_columns} columns`);
  }
  const rows = columns[0]?.length;
  if (!Number.isInteger(rows) || rows < PLACEBO_LIMITS.min_rows || rows > PLACEBO_LIMITS.max_rows) {
    throw new RangeError(`each column needs ${PLACEBO_LIMITS.min_rows} to ${PLACEBO_LIMITS.max_rows} rows`);
  }
  if (rows * columns.length > PLACEBO_LIMITS.max_cells) throw new RangeError(`at most ${PLACEBO_LIMITS.max_cells} numbers in all`);
  columns.forEach((column, c) => {
    if (!Array.isArray(column) && !ArrayBuffer.isView(column)) throw new RangeError(`column ${c + 1} is not a list of numbers`);
    if (column.length !== rows) throw new RangeError(`column ${c + 1} has ${column.length} rows; column 1 has ${rows}`);
    for (let t = 0; t < rows; t++) {
      const v = column[t];
      if (typeof v !== "number" || !Number.isFinite(v)) throw new RangeError(`column ${c + 1}, row ${t + 1} is not a finite number: the placebo needs a complete panel`);
      if (kind === "prices" && v <= 0) throw new RangeError(`column ${c + 1}, row ${t + 1} is not a positive price`);
    }
  });
  return kind === "prices" ? rows - 1 : rows;
}

/**
 * A panel reordered by `order`. Returns: placebo row t is real row order[t]. Prices: the placebo
 * keeps the real first prices, and its return into row t + 1 is the real return into row
 * order[t] + 1, so a permutation ends every column at its real last price.
 */
export function placeboPanel(columns, { kind = "prices", order }) {
  if (kind === "returns") return columns.map((column) => Array.from(order, (i) => column[i]));
  return columns.map((column) => {
    const out = new Array(column.length);
    out[0] = column[0];
    for (let t = 1; t < column.length; t++) {
      const i = order[t - 1] + 1;
      out[t] = out[t - 1] * (column[i] / column[i - 1]);
    }
    return out;
  });
}

/** `placebos` placebo panels from one seed, in order, one at a time. */
export function* placeboPanels(columns, { kind = "prices", method = "permute", block, placebos = PLACEBO_LIMITS.default_placebos, seed = 1 } = {}) {
  const n = checkPanel(columns, kind);
  if (!Number.isInteger(placebos) || placebos < PLACEBO_LIMITS.min_placebos || placebos > PLACEBO_LIMITS.max_placebos) {
    throw new RangeError(`placebos must be a whole number from ${PLACEBO_LIMITS.min_placebos} to ${PLACEBO_LIMITS.max_placebos}`);
  }
  const next = makeRandom(Number(seed) >>> 0 || 1);
  for (let k = 0; k < placebos; k++) yield placeboPanel(columns, { kind, order: placeboOrder(n, { method, block, next }) });
}

/** The value at nearest rank q (0 < q <= 1) of an ascending list. */
const nearestRank = (sorted, q) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];

/**
 * The real result's rank among the placebo results. A placebo result as good as the real one counts
 * against it, so ties make the p-value larger, never smaller. With K placebos the smallest p-value
 * is 1 / (K + 1).
 */
export function placeboPValue(real, results, { higherIsBetter = true } = {}) {
  if (typeof real !== "number" || !Number.isFinite(real)) throw new RangeError("real must be a finite number: the pipeline's result on the real data");
  if (!Array.isArray(results) || results.length < PLACEBO_LIMITS.min_placebos || results.length > PLACEBO_LIMITS.max_placebos) {
    throw new RangeError(`send ${PLACEBO_LIMITS.min_placebos} to ${PLACEBO_LIMITS.max_placebos} placebo results, one per placebo`);
  }
  results.forEach((x, k) => {
    if (typeof x !== "number" || !Number.isFinite(x)) throw new RangeError(`placebo_results[${k}] is not a finite number: rerun that placebo, or record what the pipeline reports when it finds nothing`);
  });
  const atLeast = results.filter((x) => (higherIsBetter ? x >= real : x <= real)).length;
  const sorted = [...results].sort((a, b) => a - b);
  const best = higherIsBetter ? sorted[sorted.length - 1] : sorted[0];
  return {
    p_value: (1 + atLeast) / (results.length + 1),
    smallest_possible_p: 1 / (results.length + 1),
    placebos: results.length,
    as_good_as_real: atLeast,
    real,
    placebo: { min: sorted[0], median: nearestRank(sorted, 0.5), q90: nearestRank(sorted, 0.9), max: sorted[sorted.length - 1], best },
  };
}
