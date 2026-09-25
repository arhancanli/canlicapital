// api/v1/validate/track-record.js
// Minimum track record length for an observed Sharpe to clear a benchmark Sharpe at a confidence
// level, and, when the record's length is sent, the probabilistic Sharpe against that benchmark:
// Bailey and López de Prado, "The Sharpe Ratio Efficient Frontier" (2012), checked against the
// paper's worked examples in js/dsr-paper-vectors.test.js.
import { minimumTrackRecordLength, probabilisticSharpe } from "../../../js/dsr-core.js";
import { validatorHandler } from "../../_lib/handler.js";

const REQUIRED = ["observed_sharpe_annualized", "periods_per_year", "skew", "non_excess_kurtosis"];

export function compute(body) {
  const missing = REQUIRED.filter((k) => body[k] === undefined);
  if (missing.length) throw new RangeError(`Missing required fields: ${missing.join(", ")}`);
  const inputs = {
    observed_sharpe_annualized: Number(body.observed_sharpe_annualized),
    benchmark_sharpe_annualized: body.benchmark_sharpe_annualized === undefined ? 0 : Number(body.benchmark_sharpe_annualized),
    periods_per_year: Number(body.periods_per_year),
    skew: Number(body.skew),
    non_excess_kurtosis: Number(body.non_excess_kurtosis),
    confidence: body.confidence === undefined ? 0.95 : Number(body.confidence),
  };
  if (!(inputs.periods_per_year > 0 && inputs.periods_per_year <= 10000)) throw new RangeError("periods_per_year must be between 0 and 10000");
  if (!(inputs.non_excess_kurtosis >= 1 && inputs.non_excess_kurtosis <= 100)) throw new RangeError("non_excess_kurtosis must be between 1 and 100 (a Normal distribution is 3)");
  const minimum = minimumTrackRecordLength(inputs);
  const result = { minimum_observations: Math.ceil(minimum.observations), minimum_years: minimum.years, confidence: minimum.confidence };
  if (body.observations !== undefined) {
    const observations = Number(body.observations);
    if (!Number.isInteger(observations) || observations < 2 || observations > 1000000) throw new RangeError("observations must be an integer from 2 to 1000000");
    const psr = probabilisticSharpe({ ...inputs, observations });
    result.record = {
      observations,
      years: observations / inputs.periods_per_year,
      psr_against_benchmark: psr.probabilistic_sharpe_ratio,
      long_enough: observations >= result.minimum_observations,
    };
  }
  return { derived_inputs: inputs, result, plain_reading: reading(inputs, result) };
}

function reading(inputs, r) {
  const pct = (x) => `${(x * 100).toFixed(1)} percent`;
  const need = `To be ${pct(r.confidence)} confident that a Sharpe of ${inputs.observed_sharpe_annualized} is above ${inputs.benchmark_sharpe_annualized}, the track record needs at least ${r.minimum_observations} observations, about ${r.minimum_years.toFixed(2)} years.`;
  if (!r.record) return `${need} This counts sample uncertainty and the shape of the returns only; it is not a forecast.`;
  const verdict = r.record.long_enough ? "is long enough" : "is not long enough yet";
  return `${need} The record sent, ${r.record.observations} observations, ${verdict}: the probability its Sharpe is above the benchmark is ${pct(r.record.psr_against_benchmark)}. Neither number is a forecast.`;
}

export default validatorHandler({ endpoint: "validate/track-record", sourcesPaths: ["js/dsr-core.js"], compute });
