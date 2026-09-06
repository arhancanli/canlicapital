// api/v1/validate/deflated-sharpe.js
import { calculateDsr } from "../../../js/dsr-core.js";
import { dsrFromReturns } from "../../../js/moments-core.js";
import { validatorHandler } from "../../_lib/handler.js";
import { LIMITS } from "../../_lib/limits.js";

const CONTRACT_KEYS = ["observed_sharpe_annualized", "observations", "periods_per_year", "skew", "non_excess_kurtosis", "effective_independent_trials", "cross_trial_sharpe_sd_annualized"];

export function compute(body) {
  const hasSeries = Array.isArray(body.returns);
  const hasContract = CONTRACT_KEYS.every((k) => body[k] !== undefined);
  if (hasSeries && body.observed_sharpe_annualized !== undefined) throw new RangeError("Send either a return series or the contract inputs, not both");
  if (hasSeries) {
    if (body.returns.length > LIMITS.max_observations) throw new RangeError(`A series may hold at most ${LIMITS.max_observations} observations`);
    const { derived_inputs, result } = dsrFromReturns(body);
    return { input_mode: "return_series", derived_inputs, result, plain_reading: reading(result) };
  }
  if (!hasContract) throw new RangeError(`Send a return series (returns, periods_per_year, effective_independent_trials, cross_trial_sharpe_sd_annualized) or all of: ${CONTRACT_KEYS.join(", ")}`);
  const inputs = Object.fromEntries(CONTRACT_KEYS.map((k) => [k, body[k]]));
  const result = calculateDsr(inputs);
  return { input_mode: "contract_inputs", derived_inputs: inputs, result, plain_reading: reading(result) };
}

function reading(r) {
  const pct = (x) => `${(x * 100).toFixed(1)} percent`;
  return `Counting only sample uncertainty, the probability this Sharpe is above zero is ${pct(r.psr_against_zero)}. Deflated for the best-by-luck Sharpe the declared search would produce (${r.expected_max_sharpe_annualized.toFixed(3)} annualised), it is ${pct(r.deflated_sharpe_ratio)}. Neither number is a forecast.`;
}

export default validatorHandler({
  endpoint: "validate/deflated-sharpe",
  sourcesPaths: ["js/dsr-core.js", "js/moments-core.js", "public/glassbox/deflated_sharpe_calculator_contract.json", "standards/validation-api/vectors.json"],
  compute,
});
