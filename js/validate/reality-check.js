// js/validate/reality-check.js
// The pure computation behind POST /api/v1/validate/reality-check, shared by the API route and the
// MCP package's local mode (mcp/src/local mirrors it byte for byte), so the two cannot disagree.
//
// Data-snooping tests on every variant a search tried: Hansen's SPA, White's Reality Check and
// Romano and Wolf's StepM, all on one seeded stationary bootstrap (js/snooping-core.js).
import { LIMITS } from "../../api/_lib/limits.js";
import { defaultBlock, snoopingTests } from "../snooping-core.js";

// Bootstrap work (periods x variants x draws) that fits the service's wall-time limit with room to
// spare: about a second on one core.
export const MAX_BOOTSTRAP_CELLS = 200_000_000;
const DEFAULT_REPS = 2000;
const MIN_REPS = 500;
const MIN_OBSERVATIONS = 30;

const fmt = (x, digits = 3) => (Number.isFinite(x) ? x.toFixed(digits) : String(x));

export function compute(body) {
  const { matrix, benchmark } = body;
  if (!Array.isArray(matrix) || !matrix.length || !Array.isArray(matrix[0])) throw new RangeError("matrix must be an array of rows, each a row of variant returns for one period");
  const n = matrix.length;
  const k = matrix[0].length;
  if (n > LIMITS.max_observations) throw new RangeError(`A matrix may hold at most ${LIMITS.max_observations} rows`);
  if (k > LIMITS.max_variants) throw new RangeError(`A matrix may hold at most ${LIMITS.max_variants} variants`);
  if (n < MIN_OBSERVATIONS) throw new RangeError(`A matrix needs at least ${MIN_OBSERVATIONS} rows (periods) for a bootstrap`);
  if (k < 1) throw new RangeError("A matrix needs at least one variant");
  let bench = null;
  if (benchmark !== undefined && benchmark !== null) {
    if (!Array.isArray(benchmark) || benchmark.length !== n) throw new RangeError(`benchmark must be one return per row of matrix (${n})`);
    // JSON null or a string is refused, never read as a number: Number(null) is 0, a silent return.
    const bad = benchmark.findIndex((x) => typeof x !== "number" || !Number.isFinite(x));
    if (bad >= 0) throw new RangeError(`benchmark[${bad}] is not a finite number`);
    bench = benchmark;
  }
  const d = new Float64Array(n * k);
  for (let t = 0; t < n; t += 1) {
    const row = matrix[t];
    if (!Array.isArray(row) || row.length !== k) throw new RangeError(`matrix row ${t} has ${Array.isArray(row) ? row.length : "no"} values; every row needs ${k}, one per variant`);
    for (let j = 0; j < k; j += 1) {
      const x = row[j];
      if (typeof x !== "number" || !Number.isFinite(x)) throw new RangeError(`matrix[${t}][${j}] is not a finite number; a variant with a missing period cannot be compared period by period`);
      d[t * k + j] = x - (bench ? bench[t] : 0);
    }
  }
  const block = body.block_length === undefined ? defaultBlock(n) : Number(body.block_length);
  if (!Number.isInteger(block) || block < 1 || block > Math.floor(n / 2)) throw new RangeError(`block_length must be an integer from 1 to half the number of periods (${Math.floor(n / 2)})`);
  const budget = Math.floor(MAX_BOOTSTRAP_CELLS / (n * k));
  if (budget < MIN_REPS) throw new RangeError(`${n} periods x ${k} variants is too large for ${MIN_REPS} bootstrap draws within the service's limit (${MAX_BOOTSTRAP_CELLS} period-variant draws); send fewer periods (weekly instead of daily) or fewer variants`);
  const reps = body.reps === undefined ? Math.min(DEFAULT_REPS, budget) : Number(body.reps);
  if (!Number.isInteger(reps) || reps < MIN_REPS || reps > budget) throw new RangeError(`reps must be an integer from ${MIN_REPS} to ${budget} for a ${n} x ${k} matrix`);
  const seed = body.seed === undefined ? 42 : Number(body.seed);
  if (!Number.isInteger(seed)) throw new RangeError("seed must be an integer");
  const alpha = body.alpha === undefined ? 0.05 : Number(body.alpha);
  if (!(alpha > 0 && alpha <= 0.5)) throw new RangeError("alpha must be above 0 and at most 0.5");

  const r = snoopingTests(d, n, k, { block, reps, seed, alpha });
  const best = r.best;
  const tStat = r.observed;
  const p = r.spa.p_consistent;
  const excluded = r.usable.map((ok, j) => (ok ? -1 : j)).filter((j) => j >= 0);
  const superior = r.stepm.superior;
  const against = bench ? "the benchmark" : "zero";
  const verdict = p <= alpha
    ? `The best variant beats ${against} by more than the best of ${k} would by luck (p ${fmt(p)} at alpha ${alpha}).`
    : `The best variant does not beat ${against} by more than the best of ${k} could by luck (p ${fmt(p)} at alpha ${alpha}).`;
  return {
    observations: n,
    variants: k,
    benchmark: bench ? "series" : "zero",
    block_length: block,
    block_length_rule: body.block_length === undefined ? "round(n^(1/3)), the default" : "as given",
    reps,
    seed,
    best_variant: { index: best, mean_excess_return: r.means[best], t_stat: tStat },
    spa: {
      statistic: r.spa.statistic,
      p_value: p,
      p_value_lower: r.spa.p_lower,
      p_value_upper: r.spa.p_upper,
      monte_carlo_se: Math.sqrt((p * (1 - p)) / reps),
    },
    reality_check: { statistic: r.reality_check.statistic, p_value: r.reality_check.p_value },
    stepm: { alpha, superior_variants: superior, rounds: r.stepm.rounds.length },
    ...(excluded.length ? { constant_variants_excluded: excluded } : {}),
    verdict,
    plain_reading: `Variant ${best} had the best studentized excess return over ${against} (t ${fmt(tStat, 2)}) of the ${k} variants passed. The chance that the best of ${k} variants with no edge looks at least this good is ${fmt(p)} by Hansen's SPA (consistent p-value; bounds ${fmt(r.spa.p_lower)} to ${fmt(r.spa.p_upper)}), and ${fmt(r.reality_check.p_value)} by White's Reality Check, which does not studentize. StepM at ${alpha} finds ${superior.length ? `${superior.length} variant${superior.length === 1 ? "" : "s"} that beat${superior.length === 1 ? "s" : ""} ${against}: ${superior.join(", ")}` : `no variant that beats ${against}`}. Only the variants passed are counted: a search that tried more than it passed makes luck look smaller than it was.`,
  };
}
