// =============================================================================
// stress-core.js
// -----------------------------------------------------------------------------
// How a strategy's return series holds up when history does not repeat politely.
//
// Two kinds of stress, both reproducible from the inputs and a seed:
//
//   Resampled histories   a stationary block bootstrap (Politis and Romano 1994) reshuffles the
//                         series in blocks, so streaks and volatility clusters survive, and asks
//                         how often the drawdown limit is breached or the Sharpe turns negative.
//   Named scenarios       deliberate damage with a stated rule each: a crash at the worst moment,
//                         volatility doubled, the worst stretch lived twice, and an outage that
//                         leaves positions open after the worst period.
//
// Generative models (GANs and the like) are not used: trained on one series they either memorize
// it or invent dynamics nobody can check. Every path here comes from the series itself or from a
// rule a reader can apply by hand.
// =============================================================================

import { finiteNumbers } from "./moments-core.js";
import { makeRandom } from "./selection-risk-core.js";
import { defaultBlock, stationaryIndices } from "./snooping-core.js";

export const STRESS_LIMITS = Object.freeze({ max_observations: 20000, min_observations: 60, max_paths: 5000, max_path_cells: 20_000_000 });

const round = (x, digits = 4) => (Number.isFinite(x) ? Number(x.toFixed(digits)) : null);

/** Sharpe (zero benchmark), CAGR, max drawdown and total return of one path. */
export function pathStats(returns, periodsPerYear) {
  const n = returns.length;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += returns[i];
  const mean = sum / n;
  let ss = 0;
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (let i = 0; i < n; i += 1) {
    ss += (returns[i] - mean) ** 2;
    equity *= 1 + returns[i];
    if (equity > peak) peak = equity;
    const dd = equity / peak - 1;
    if (dd < maxDd) maxDd = dd;
  }
  const sd = Math.sqrt(ss / (n - 1));
  return {
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(periodsPerYear) : 0,
    cagr: equity > 0 ? equity ** (periodsPerYear / n) - 1 : -1,
    max_drawdown: maxDd,
    total_return: equity - 1,
  };
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))];

function scenario(name, rule, returns, periodsPerYear, limit) {
  const s = pathStats(returns, periodsPerYear);
  return {
    name,
    rule,
    sharpe: round(s.sharpe, 3),
    cagr: round(s.cagr),
    max_drawdown: round(s.max_drawdown),
    breaches_limit: s.max_drawdown < -limit,
  };
}

export function stressTest({
  returns,
  periods_per_year: ppyInput = 252,
  paths: pathsInput = 1000,
  block,
  seed = 42,
  drawdown_limit: limitInput = 0.2,
  crash: crashInput,
  volatility_multiplier: volMultInput = 2,
  outage_periods: outageInput = 5,
}) {
  const r = finiteNumbers(returns, "returns");
  const n = r.length;
  if (n < STRESS_LIMITS.min_observations) throw new RangeError(`Send at least ${STRESS_LIMITS.min_observations} returns`);
  if (n > STRESS_LIMITS.max_observations) throw new RangeError(`At most ${STRESS_LIMITS.max_observations} returns`);
  r.forEach((v, i) => { if (!(v > -1)) throw new RangeError(`returns[${i}] is ${v}; a return of -100% or worse ends the series`); });
  const ppy = Number(ppyInput);
  if (!(ppy > 0)) throw new RangeError("periods_per_year must be above 0");
  const paths = Number(pathsInput);
  if (!Number.isInteger(paths) || paths < 100 || paths > STRESS_LIMITS.max_paths) throw new RangeError(`paths must be a whole number from 100 to ${STRESS_LIMITS.max_paths}`);
  if (paths * n > STRESS_LIMITS.max_path_cells) throw new RangeError(`paths x observations may be at most ${STRESS_LIMITS.max_path_cells}; lower paths to ${Math.floor(STRESS_LIMITS.max_path_cells / n)}`);
  const blockLength = block === undefined ? defaultBlock(n) : Number(block);
  if (!(Number.isFinite(blockLength) && blockLength >= 1 && blockLength <= n)) throw new RangeError("block must be at least 1 and at most the number of returns");
  const limit = Number(limitInput);
  if (!(limit > 0 && limit < 1)) throw new RangeError("drawdown_limit must be a fraction between 0 and 1, for example 0.2 for a 20% drawdown");
  const volMult = Number(volMultInput);
  if (!(volMult >= 1 && volMult <= 10)) throw new RangeError("volatility_multiplier must be from 1 to 10");
  const outage = Number(outageInput);
  if (!Number.isInteger(outage) || outage < 1 || outage > Math.floor(n / 4)) throw new RangeError(`outage_periods must be a whole number from 1 to ${Math.floor(n / 4)}`);
  const worstPeriod = Math.min(...r);
  // The crash: given, or three times the worst period the series ever had, and never smaller than a
  // 20 percent single-period loss. A strategy that never saw a bad day still meets one here.
  const crash = crashInput === undefined ? Math.min(-0.2, 3 * worstPeriod) : Number(crashInput);
  if (!(crash < 0 && crash > -1)) throw new RangeError("crash must be a loss between 0 and -1, for example -0.25");

  const baseline = pathStats(r, ppy);

  // Resampled histories.
  const next = makeRandom(Number(seed) >>> 0);
  const idx = new Int32Array(n);
  const path = new Float64Array(n);
  const sharpes = new Float64Array(paths);
  const drawdownsAll = new Float64Array(paths);
  const cagrs = new Float64Array(paths);
  let breach = 0; let negative = 0; let loss = 0; let fragile = 0;
  for (let p = 0; p < paths; p += 1) {
    stationaryIndices(n, blockLength, next, idx);
    for (let t = 0; t < n; t += 1) path[t] = r[idx[t]];
    const s = pathStats(path, ppy);
    sharpes[p] = s.sharpe; drawdownsAll[p] = s.max_drawdown; cagrs[p] = s.cagr;
    const breached = s.max_drawdown < -limit;
    if (breached) breach += 1;
    if (s.sharpe < 0) negative += 1;
    if (s.total_return < 0) loss += 1;
    if (breached || s.sharpe < 0) fragile += 1;
  }
  const sortedSharpe = [...sharpes].sort((a, b) => a - b);
  const sortedDd = [...drawdownsAll].sort((a, b) => a - b);
  const sortedCagr = [...cagrs].sort((a, b) => a - b);
  const band = (sorted, digits = 4) => ({ p5: round(quantile(sorted, 0.05), digits), median: round(quantile(sorted, 0.5), digits), p95: round(quantile(sorted, 0.95), digits) });

  // Named scenarios.
  let equity = 1; let peak = 1; let peakAt = 0;
  for (let t = 0; t < n; t += 1) { equity *= 1 + r[t]; if (equity >= peak) { peak = equity; peakAt = t; } }
  const crashed = [...r.slice(0, peakAt + 1), crash, ...r.slice(peakAt + 1)];
  const mean = r.reduce((a, b) => a + b, 0) / n;
  const volatile = r.map((v) => Math.max(-0.99, mean + volMult * (v - mean)));
  const windowLen = Math.max(5, Math.round(ppy / 4));
  let worstStart = 0; let worstRun = Infinity;
  for (let s = 0; s + windowLen <= n; s += 1) {
    let g = 1;
    for (let t = s; t < s + windowLen; t += 1) g *= 1 + r[t];
    if (g < worstRun) { worstRun = g; worstStart = s; }
  }
  const worstStretch = r.slice(worstStart, worstStart + windowLen);
  const twice = [...r.slice(0, worstStart + windowLen), ...worstStretch, ...r.slice(worstStart + windowLen)];
  const losing = r.filter((v) => v < 0);
  const averageLoss = losing.length ? losing.reduce((a, b) => a + b, 0) / losing.length : 0;
  const worstAt = r.indexOf(worstPeriod);
  const stuck = r.map((v, t) => (t > worstAt && t <= worstAt + outage ? averageLoss : v));
  const scenarios = [
    scenario("crash_at_the_peak", `one extra period losing ${(crash * 100).toFixed(1)}% inserted right after the equity high`, crashed, ppy, limit),
    scenario("volatility_multiplied", `every period's distance from the mean multiplied by ${volMult}`, volatile, ppy, limit),
    scenario("worst_stretch_twice", `the worst ${windowLen}-period stretch lived again straight after itself`, twice, ppy, limit),
    scenario("stuck_after_the_worst_period", `the ${outage} periods after the worst one each lose the average losing period (${(averageLoss * 100).toFixed(2)}%), as if positions could not be closed`, stuck, ppy, limit),
  ];

  const fragility = fragile / paths;
  return {
    schema: "canli.stress.v1",
    observations: n,
    settings: { periods_per_year: ppy, paths, block: blockLength, seed: Number(seed), drawdown_limit: limit },
    baseline: { sharpe: round(baseline.sharpe, 3), cagr: round(baseline.cagr), max_drawdown: round(baseline.max_drawdown), breaches_limit: baseline.max_drawdown < -limit },
    resampled: {
      method: "stationary block bootstrap (Politis and Romano 1994)",
      sharpe: band(sortedSharpe, 3),
      max_drawdown: band(sortedDd),
      cagr: band(sortedCagr),
      probability_drawdown_beyond_limit: round(breach / paths, 3),
      probability_negative_sharpe: round(negative / paths, 3),
      probability_of_a_loss: round(loss / paths, 3),
    },
    scenarios,
    fragility: {
      value: round(fragility, 3),
      definition: `the share of resampled histories whose maximum drawdown is worse than ${(limit * 100).toFixed(0)}% or whose Sharpe is below zero`,
      scenarios_breaching_limit: scenarios.filter((s) => s.breaches_limit).length,
    },
    plain_reading: reading(baseline, breach / paths, negative / paths, fragility, scenarios, limit, sortedDd),
  };
}

function reading(base, breach, negative, fragility, scenarios, limit, sortedDd) {
  const pct = (x) => `${(x * 100).toFixed(1)} percent`;
  const broken = scenarios.filter((s) => s.breaches_limit).map((s) => s.name.replaceAll("_", " "));
  return [
    `As recorded: max drawdown ${pct(-base.max_drawdown)}, Sharpe ${base.sharpe.toFixed(2)}.`,
    `In resampled histories the drawdown passes the ${pct(limit)} limit ${pct(breach)} of the time and the Sharpe is negative ${pct(negative)} of the time (fragility ${fragility.toFixed(3)}); the 5th-percentile drawdown is ${pct(-quantile(sortedDd, 0.05))}.`,
    broken.length ? `Scenarios that break the limit: ${broken.join(", ")}.` : "No named scenario breaks the drawdown limit.",
    "Stress results describe this series under stated rules; they are not probabilities of future events.",
  ].join(" ");
}

export const STRESS_LIMITS_TEXT = Object.freeze([
  "Every path is built from the returns exactly as supplied or by the rule stated beside it; a crisis unlike anything in the series is only as represented as the crash scenario's size.",
  "Resampling keeps short streaks and volatility clusters but breaks longer cycles and regime order.",
  "Frequencies over resampled histories are not forecasts of the future.",
]);
