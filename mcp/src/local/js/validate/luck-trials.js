// js/validate/luck-trials.js
// The pure computation behind POST /api/v1/validate/luck-trials, shared by the API route and the
// MCP package's local mode (mcp/src/local mirrors it byte for byte), so the two cannot disagree.
import { luckEquivalentTrials, TRIAL_CAP } from "../luck-core.js";

// Luck-equivalent trials (js/luck-core.js): how many skill-less strategies a search would have had
// to try for its best to reach the observed Sharpe by luck. Calibrated by Monte Carlo in
// js/luck-core.test.js; too kind to negatively skewed strategies, which the reading says when the
// caller sends the skew.

const NEGATIVE_SKEW = -0.5;

export function compute(body) {
  const missing = ["observed_sharpe_annualized", "periods_per_year", "observations"].filter((k) => body[k] === undefined);
  if (missing.length) throw new RangeError(`Missing required fields: ${missing.join(", ")}`);
  const inputs = {
    observed_sharpe_annualized: Number(body.observed_sharpe_annualized),
    periods_per_year: Number(body.periods_per_year),
    observations: Number(body.observations),
    ...(body.effective_independent_trials !== undefined ? { effective_independent_trials: Number(body.effective_independent_trials) } : {}),
    ...(body.skew !== undefined ? { skew: Number(body.skew) } : {}),
    ...(body.autocorrelation !== undefined ? { autocorrelation: Number(body.autocorrelation) } : {}),
  };
  if (!(Math.abs(inputs.observed_sharpe_annualized) <= 20)) throw new RangeError("observed_sharpe_annualized must be a number from -20 to 20");
  if (!(inputs.periods_per_year > 0 && inputs.periods_per_year <= 100000)) throw new RangeError("periods_per_year must be greater than 0 and at most 100000");
  if (!Number.isInteger(inputs.observations) || inputs.observations < 3 || inputs.observations > 1000000) throw new RangeError("observations must be an integer from 3 to 1000000");
  const trials = inputs.effective_independent_trials;
  if (trials !== undefined && (!Number.isInteger(trials) || trials < 1 || trials > 1e9)) throw new RangeError("effective_independent_trials must be an integer from 1 to 1000000000");
  if (inputs.skew !== undefined && !Number.isFinite(inputs.skew)) throw new RangeError("skew must be a finite number");
  if (inputs.autocorrelation !== undefined && !(inputs.autocorrelation > -1 && inputs.autocorrelation < 1)) throw new RangeError("autocorrelation must be strictly between -1 and 1");
  const result = luckEquivalentTrials({ sharpe: inputs.observed_sharpe_annualized, observations: inputs.observations, periodsPerYear: inputs.periods_per_year, trials, autocorrelation: inputs.autocorrelation });
  return { derived_inputs: inputs, result, plain_reading: reading(inputs, result) };
}

const whole = (n) => Math.floor(n).toLocaleString("en-US");

function reading(inputs, r) {
  const sharpe = String(Number(inputs.observed_sharpe_annualized.toFixed(3)));
  const over = `over these ${inputs.observations} observations`;
  const parts = [];
  if (r.trials_for_five_percent >= TRIAL_CAP) {
    parts.push(`Luck alone would need more than ${TRIAL_CAP.toExponential(0).replace("e+", "e")} skill-less strategies to reach a Sharpe of ${sharpe} ${over}.`);
  } else if (r.trials_for_even_odds < 2) {
    parts.push(`A single skill-less strategy shows a Sharpe of ${sharpe} or more ${over} with probability ${r.single_trial_probability.toFixed(3)}: luck alone readily explains it.`);
  } else if (r.trials_for_five_percent < 1) {
    parts.push(`The best of ${whole(r.trials_for_even_odds)} skill-less strategies reaches a Sharpe of ${sharpe} ${over} about half the time, and even one reaches it more than 5 percent of the time.`);
  } else {
    parts.push(`The best of ${whole(r.trials_for_even_odds)} skill-less strategies reaches a Sharpe of ${sharpe} ${over} about half the time; with at most ${whole(r.trials_for_five_percent)} tried, luck reaches it less than 5 percent of the time.`);
  }
  if (r.best_of_trials_probability !== undefined) {
    parts.push(`With ${inputs.effective_independent_trials} independent trials, the chance that the best reaches it by luck is ${(r.best_of_trials_probability * 100).toPrecision(3)} percent.`);
  }
  if (inputs.skew !== undefined && inputs.skew < NEGATIVE_SKEW) {
    parts.push(`With a return skew of ${inputs.skew}, these counts are too generous: negatively skewed returns reach high Sharpe ratios by luck more often than this assumes.`);
  }
  if (inputs.autocorrelation === undefined) {
    parts.push("Without the returns' autocorrelation this assumes none; positively autocorrelated returns reach high Sharpe ratios by luck more often.");
  } else if (inputs.autocorrelation !== 0) {
    parts.push(`The Sharpe was first corrected for an autocorrelation of ${inputs.autocorrelation} (Lo, 2002), to ${String(Number((inputs.observed_sharpe_annualized * r.autocorrelation_factor).toFixed(3)))}.`);
  }
  parts.push("It counts independent trials; correlated trials count as fewer.");
  return parts.join(" ");
}
