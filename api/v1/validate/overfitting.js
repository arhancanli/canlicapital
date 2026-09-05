// api/v1/validate/overfitting.js
import { pboCscv } from "../../../js/pbo-core.js";
import { validatorHandler } from "../../_lib/handler.js";
import { LIMITS } from "../../_lib/limits.js";

const mean = (xs) => xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0) / xs.length;

export function compute(body) {
  const { matrix, n_splits = 16, max_combinations = LIMITS.max_cscv_combinations, seed = 42 } = body;
  if (!Array.isArray(matrix) || !Array.isArray(matrix[0])) throw new RangeError("matrix must be an array of rows, each a row of variant returns for one period");
  if (matrix.length > LIMITS.max_observations) throw new RangeError(`A matrix may hold at most ${LIMITS.max_observations} rows`);
  if (matrix[0].length > LIMITS.max_variants) throw new RangeError(`A matrix may hold at most ${LIMITS.max_variants} variants`);
  if (!Number.isInteger(max_combinations) || max_combinations > LIMITS.max_cscv_combinations) throw new RangeError(`max_combinations may not exceed ${LIMITS.max_cscv_combinations}`);
  const out = pboCscv(matrix, { nSplits: Number(n_splits), maxCombinations: max_combinations, seed: Number(seed) });
  const sorted = [...out.lambdas].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const degraded = out.is_oos_pairs.filter(([i, o]) => o < i).length / out.is_oos_pairs.length;
  return {
    pbo: out.pbo,
    n_combinations: out.n_combinations,
    exhaustive: out.exhaustive,
    sampler: out.exhaustive ? "all combinations enumerated in lexicographic order" : `${out.n_combinations} combinations drawn without replacement by mulberry32(seed=${Number(seed)}); the Python reference draws with numpy, so estimates agree within sampling noise, not bit for bit`,
    block_length: out.block_length,
    lambda_quantiles: { p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) },
    is_oos_summary: { mean_is_sharpe_of_selected: mean(out.is_oos_pairs.map((p) => p[0])), mean_oos_sharpe_of_selected: mean(out.is_oos_pairs.map((p) => p[1])), share_oos_below_is: degraded },
    plain_reading: `In ${(out.pbo * 100).toFixed(1)} percent of the ${out.n_combinations} in-sample and out-of-sample splits, the variant that looked best in sample ranked in the worse half out of sample. That share is the probability of backtest overfitting for this set of variants as submitted.`,
  };
}

export default validatorHandler({
  endpoint: "validate/overfitting",
  sourcesPaths: ["js/pbo-core.js", "standards/validation-api/vectors.json"],
  compute,
});
