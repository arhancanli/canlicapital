// The pasted arm: three return series written into the prompt as JSON arrays.
import { compute as deflatedSharpe } from "../../../../src/local/js/validate/deflated-sharpe.js";
import { compute as trackRecord } from "../../../../src/local/js/validate/track-record.js";
export { score } from "../../tasks.mjs";
function series(n, seedStart, drift) {
  let s = seedStart; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  return Array.from({ length: n }, () => Number(((rnd() - 0.5 + drift) * 0.02).toFixed(5)));
}
function task(id, n, seed, drift, trials, sd, bench) {
  const returns = series(n, seed, drift);
  const d = deflatedSharpe({ returns, periods_per_year: 252, effective_independent_trials: trials, cross_trial_sharpe_sd_annualized: sd }).derived_inputs;
  const years = trackRecord({ observed_sharpe_annualized: d.observed_sharpe_annualized, periods_per_year: 252, skew: d.skew, non_excess_kurtosis: d.non_excess_kurtosis, benchmark_sharpe_annualized: bench }).result.minimum_years;
  return {
    id, tool: "audit_backtest", check: { kind: "number", relative: 0.02 }, expected: years,
    prompt: `Here are my strategy's daily returns (252 trading days a year), as fractions: ${JSON.stringify(returns)}. I tried ${trials} variants before picking it, and their Sharpe ratios had a standard deviation of ${sd} annualized. Audit this backtest, and tell me how many years of track record it needs before I can be 95% confident its Sharpe beats ${bench}.`,
  };
}
export const TASKS = [task("aud-1", 504, 3, 0.04, 20, 0.5, 0.5), task("aud-2", 756, 9, 0.05, 50, 0.6, 1), task("aud-3", 400, 21, 0.06, 10, 0.3, 0)];
export async function resolveCompanyTruth(t) { return t; }
