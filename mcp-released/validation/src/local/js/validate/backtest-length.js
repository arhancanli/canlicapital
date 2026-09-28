// js/validate/backtest-length.js
// The pure computation behind POST /api/v1/validate/backtest-length, shared by the API route and the
// MCP package's local mode (mcp/src/local mirrors it byte for byte), so the two cannot disagree.
import { expectedMaxStandardNormal, maximumIndependentTrials, minimumBacktestLength } from "../dsr-core.js";

// Minimum Backtest Length: Bailey, Borwein, López de Prado and Zhu, "Pseudo-Mathematics and
// Financial Charlatanism" (Notices of the AMS, 2014), Theorem 3.1, checked against the paper's own
// statements in js/minbtl-paper-vectors.test.js. With N independent trials and a target in-sample
// Sharpe, how many years a backtest needs before the best trial is not expected to reach the target
// by luck; with the backtest's years, how many independent trials those years allow.

export function compute(body) {
  const hasTrials = body.effective_independent_trials !== undefined;
  const hasYears = body.backtest_years !== undefined;
  if (!hasTrials && !hasYears) throw new RangeError("Send effective_independent_trials, backtest_years, or both");
  const inputs = { target_sharpe_annualized: body.target_sharpe_annualized === undefined ? 1 : Number(body.target_sharpe_annualized) };
  if (!(inputs.target_sharpe_annualized > 0 && inputs.target_sharpe_annualized <= 10)) throw new RangeError("target_sharpe_annualized must be greater than 0 and at most 10");
  if (hasTrials) {
    inputs.effective_independent_trials = Number(body.effective_independent_trials);
    if (!Number.isInteger(inputs.effective_independent_trials) || inputs.effective_independent_trials < 2 || inputs.effective_independent_trials > 1e9) {
      throw new RangeError("effective_independent_trials must be an integer from 2 to 1000000000");
    }
  }
  if (hasYears) {
    inputs.backtest_years = Number(body.backtest_years);
    if (!(inputs.backtest_years > 0 && inputs.backtest_years <= 1000)) throw new RangeError("backtest_years must be greater than 0 and at most 1000");
  }
  const result = {};
  if (hasTrials) {
    const minimum = minimumBacktestLength({ trials: inputs.effective_independent_trials, targetSharpe: inputs.target_sharpe_annualized });
    result.minimum_backtest_years = minimum.years;
    result.upper_bound_years = minimum.upper_bound_years;
  }
  if (hasYears) {
    result.maximum_independent_trials = maximumIndependentTrials({ years: inputs.backtest_years, targetSharpe: inputs.target_sharpe_annualized });
  }
  if (hasTrials && hasYears) {
    result.expected_max_sharpe_annualized = expectedMaxStandardNormal(inputs.effective_independent_trials) / Math.sqrt(inputs.backtest_years);
    result.long_enough = inputs.backtest_years >= result.minimum_backtest_years;
  }
  return { derived_inputs: inputs, result, plain_reading: reading(inputs, result) };
}

function reading(inputs, r) {
  const sharpe = (x) => String(Number(Number(x).toFixed(3)));
  const target = sharpe(inputs.target_sharpe_annualized);
  const parts = [];
  if (r.minimum_backtest_years !== undefined) {
    parts.push(`With ${inputs.effective_independent_trials} independent trials, the best one is expected to show an in-sample Sharpe of ${target} by luck alone unless the backtest covers at least ${r.minimum_backtest_years.toFixed(2)} years.`);
  }
  if (r.maximum_independent_trials !== undefined) {
    parts.push(r.maximum_independent_trials === 1
      ? `${sharpe(inputs.backtest_years)} years of backtest is too short for even two independent trials: their best is expected to reach a Sharpe of ${target} by luck.`
      : `${sharpe(inputs.backtest_years)} years of backtest allows at most ${r.maximum_independent_trials} independent trials before the best is expected to reach a Sharpe of ${target} by luck.`);
  }
  if (r.expected_max_sharpe_annualized !== undefined) {
    parts.push(`Over ${sharpe(inputs.backtest_years)} years, the best of ${inputs.effective_independent_trials} skill-less trials is expected to show a Sharpe of ${sharpe(r.expected_max_sharpe_annualized)}.`);
  }
  parts.push("Meeting this length is necessary, not sufficient: a backtest can still be overfit.");
  return parts.join(" ");
}
