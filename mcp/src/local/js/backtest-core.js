// =============================================================================
// backtest-core.js
// -----------------------------------------------------------------------------
// Rule-based backtests over a price series the caller supplies, run for EVERY parameter set in a
// declared grid, then validated with the number of variants the code itself ran.
//
// Why the grid matters: the deflated Sharpe ratio and the probability of backtest overfitting both
// need to know how many variants were tried, and everywhere else that number is whatever the person
// reporting the best variant says it was. Here the server runs the whole grid, so the count is not
// a declaration, and the overfitting test sees every variant's returns, not a summary of them.
//
// No look-ahead by construction: the position held over day t+1 is decided from prices up to and
// including day t's close (positionsFor), and the return earned is the close-to-close return of
// day t+1. Costs are a flat rate per unit of turnover, charged on the day the position changes.
// Nothing here runs caller code: a strategy is one of the families below with numeric parameters.
// =============================================================================

import { calculateDsr, minimumTrackRecordLength, probabilisticSharpe } from "./dsr-core.js";
import { finiteNumbers, perPeriodMoments } from "./moments-core.js";
import { pboCscv } from "./pbo-core.js";

export const BACKTEST_LIMITS = Object.freeze({
  max_prices: 20000,
  max_variants: 200,
  max_parameter_value: 5000,
  min_evaluated_returns: 30,
  top_variants_shown: 10,
});

const intParam = (name, value, min) => {
  const v = Number(value);
  if (!Number.isInteger(v) || v < min || v > BACKTEST_LIMITS.max_parameter_value) {
    throw new RangeError(`${name} must be a whole number from ${min} to ${BACKTEST_LIMITS.max_parameter_value}; got ${JSON.stringify(value)}`);
  }
  return v;
};
const positiveParam = (name, value) => {
  const v = Number(value);
  if (!(Number.isFinite(v) && v > 0 && v <= 100)) throw new RangeError(`${name} must be a number above 0 and at most 100; got ${JSON.stringify(value)}`);
  return v;
};

// Each family: its parameters, how much history its first signal needs, and how a position follows
// from prices. `allowShort` lets a family go short where it would otherwise stand aside.
export const FAMILIES = Object.freeze({
  buy_and_hold: {
    params: [],
    describe: "Always long.",
    check: () => ({}),
    warmup: () => 0,
  },
  sma_cross: {
    params: ["fast", "slow"],
    describe: "Long while the fast simple moving average is above the slow one; short (or flat) below.",
    check: (p) => {
      const fast = intParam("fast", p.fast, 1);
      const slow = intParam("slow", p.slow, 2);
      if (!(fast < slow)) throw new RangeError(`fast must be shorter than slow; got fast ${fast}, slow ${slow}`);
      return { fast, slow };
    },
    warmup: (p) => p.slow - 1,
  },
  momentum: {
    params: ["lookback", "skip"],
    describe: "Long when the return over `lookback` periods, ending `skip` periods ago, is positive; short (or flat) when negative.",
    check: (p) => ({ lookback: intParam("lookback", p.lookback, 1), skip: intParam("skip", p.skip ?? 0, 0) }),
    warmup: (p) => p.lookback + p.skip,
  },
  mean_reversion: {
    params: ["window", "entry_z"],
    describe: "Long when the price is more than entry_z standard deviations below its `window`-period average, short (or flat) when as far above; exits when it crosses back through the average.",
    check: (p) => ({ window: intParam("window", p.window, 2), entry_z: positiveParam("entry_z", p.entry_z) }),
    warmup: (p) => p.window - 1,
  },
  breakout: {
    params: ["lookback"],
    describe: "Long when the close breaks above the highest close of the previous `lookback` periods; short (or flat) when it breaks below the lowest; otherwise holds.",
    check: (p) => ({ lookback: intParam("lookback", p.lookback, 2) }),
    warmup: (p) => p.lookback,
  },
});

/** Prices as finite positive numbers, oldest first. */
export function checkPrices(prices) {
  const x = finiteNumbers(prices, "prices");
  if (x.length < 3) throw new RangeError("prices needs at least 3 observations");
  if (x.length > BACKTEST_LIMITS.max_prices) throw new RangeError(`prices may hold at most ${BACKTEST_LIMITS.max_prices} observations; got ${x.length}`);
  x.forEach((v, i) => { if (!(v > 0)) throw new RangeError(`prices[${i}] is ${v}; prices must be positive (send prices, not returns)`); });
  return x;
}

/** Every parameter set of a grid such as { fast: [10, 20], slow: [50, 100] }, invalid combinations removed. */
export function expandGrid(family, grid = {}) {
  const spec = FAMILIES[family];
  if (!spec) throw new RangeError(`Unknown strategy family ${JSON.stringify(family)}; choose from ${Object.keys(FAMILIES).join(", ")}`);
  const unknown = Object.keys(grid).filter((k) => !spec.params.includes(k));
  if (unknown.length) throw new RangeError(`${family} has no parameter ${unknown.join(", ")}; its parameters are ${spec.params.join(", ") || "none"}`);
  const axes = spec.params.map((name) => {
    const values = grid[name];
    if (values === undefined) {
      if (name === "skip") return [name, [0]];
      throw new RangeError(`${family} needs ${name}: give it as a list of values to try, for example ${JSON.stringify({ [name]: [10, 20] })}`);
    }
    const list = Array.isArray(values) ? values : [values];
    if (!list.length) throw new RangeError(`${name} must list at least one value`);
    return [name, [...new Set(list.map(Number))]];
  });
  let sets = [{}];
  for (const [name, values] of axes) sets = sets.flatMap((s) => values.map((v) => ({ ...s, [name]: v })));
  const valid = [];
  const rejected = [];
  for (const raw of sets) {
    try { valid.push(spec.check(raw)); } catch (error) { rejected.push(error.message); }
  }
  if (!valid.length) throw new RangeError(`No valid parameter set in the grid: ${rejected[0]}`);
  if (valid.length > BACKTEST_LIMITS.max_variants) throw new RangeError(`The grid makes ${valid.length} variants; at most ${BACKTEST_LIMITS.max_variants} are run in one call`);
  return { variants: valid, rejected: rejected.length };
}

function rollingMean(prices, window) {
  const out = new Float64Array(prices.length).fill(Number.NaN);
  let sum = 0;
  for (let t = 0; t < prices.length; t += 1) {
    sum += prices[t];
    if (t >= window) sum -= prices[t - window];
    if (t >= window - 1) out[t] = sum / window;
  }
  return out;
}

// Sample standard deviation over each trailing window (Welford over a sliding window would be more
// stable for very long windows; prices are positive and windows short, so two running sums suffice).
function rollingSd(prices, window) {
  const out = new Float64Array(prices.length).fill(Number.NaN);
  let sum = 0;
  let sq = 0;
  for (let t = 0; t < prices.length; t += 1) {
    sum += prices[t]; sq += prices[t] * prices[t];
    if (t >= window) { sum -= prices[t - window]; sq -= prices[t - window] * prices[t - window]; }
    if (t >= window - 1) {
      const variance = Math.max(0, (sq - (sum * sum) / window) / (window - 1));
      out[t] = Math.sqrt(variance);
    }
  }
  return out;
}

// Highest and lowest of the `window` closes BEFORE t (t excluded), in O(n) with monotonic deques.
function trailingExtremes(prices, window) {
  const n = prices.length;
  const hi = new Float64Array(n).fill(Number.NaN);
  const lo = new Float64Array(n).fill(Number.NaN);
  const maxQ = [];
  const minQ = [];
  for (let t = 0; t < n; t += 1) {
    if (t >= window) { hi[t] = prices[maxQ[0]]; lo[t] = prices[minQ[0]]; }
    while (maxQ.length && prices[maxQ.at(-1)] <= prices[t]) maxQ.pop();
    maxQ.push(t);
    while (minQ.length && prices[minQ.at(-1)] >= prices[t]) minQ.pop();
    minQ.push(t);
    const oldest = t - window + 1;
    if (maxQ[0] < oldest) maxQ.shift();
    if (minQ[0] < oldest) minQ.shift();
  }
  return { hi, lo };
}

/**
 * The position (-1, 0 or 1) held from close t to close t+1, for every t, decided from
 * prices[0..t] only. Before a family's warm-up the position is 0.
 */
export function positionsFor(family, params, prices, { allowShort = false } = {}) {
  const n = prices.length;
  const pos = new Int8Array(n);
  const down = allowShort ? -1 : 0;
  if (family === "buy_and_hold") { pos.fill(1); return pos; }
  if (family === "sma_cross") {
    const fast = rollingMean(prices, params.fast);
    const slow = rollingMean(prices, params.slow);
    for (let t = params.slow - 1; t < n; t += 1) pos[t] = fast[t] > slow[t] ? 1 : fast[t] < slow[t] ? down : 0;
    return pos;
  }
  if (family === "momentum") {
    const start = params.lookback + params.skip;
    for (let t = start; t < n; t += 1) {
      const m = prices[t - params.skip] / prices[t - params.skip - params.lookback] - 1;
      pos[t] = m > 0 ? 1 : m < 0 ? down : 0;
    }
    return pos;
  }
  if (family === "mean_reversion") {
    const mean = rollingMean(prices, params.window);
    const sd = rollingSd(prices, params.window);
    let state = 0;
    for (let t = params.window - 1; t < n; t += 1) {
      const z = sd[t] > 0 ? (prices[t] - mean[t]) / sd[t] : 0;
      if (state === 0) state = z < -params.entry_z ? 1 : z > params.entry_z ? down : 0;
      else if (state === 1 && z >= 0) state = 0;
      else if (state === -1 && z <= 0) state = 0;
      pos[t] = state;
    }
    return pos;
  }
  if (family === "breakout") {
    const { hi, lo } = trailingExtremes(prices, params.lookback);
    let state = 0;
    for (let t = params.lookback; t < n; t += 1) {
      if (prices[t] > hi[t]) state = 1;
      else if (prices[t] < lo[t]) state = down;
      pos[t] = state;
    }
    return pos;
  }
  throw new RangeError(`Unknown strategy family ${family}`);
}

/**
 * Strategy returns over the evaluation window [start, n-1): the return of day t+1 earned by the
 * position decided at close t, less cost on the turnover at close t. Also the turnover itself.
 */
export function simulate(prices, pos, { start = 0, costBps = 0 } = {}) {
  const n = prices.length;
  const cost = costBps / 10000;
  const returns = new Float64Array(n - 1 - start);
  let turnover = 0;
  let trades = 0;
  let exposed = 0;
  let prev = 0; // flat before the window opens, so the first position pays its entry cost
  for (let t = start; t < n - 1; t += 1) {
    const change = Math.abs(pos[t] - prev);
    if (change) { trades += 1; turnover += change; }
    if (pos[t] !== 0) exposed += 1;
    // "+ 0" turns a flat position's -0 into 0, so a series compares and serializes cleanly.
    returns[t - start] = pos[t] * (prices[t + 1] / prices[t] - 1) - cost * change + 0;
    prev = pos[t];
  }
  return { returns, turnover, trades, exposed };
}

/** Annualized performance and risk of a periodic return series. */
export function performance(returns, periodsPerYear, extra = {}) {
  const n = returns.length;
  let sum = 0;
  let downside = 0;
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  let worst = Infinity;
  let best = -Infinity;
  let up = 0;
  for (const r of returns) {
    sum += r;
    if (r < 0) downside += r * r;
    if (r > 0) up += 1;
    if (r < worst) worst = r;
    if (r > best) best = r;
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    const dd = equity / peak - 1;
    if (dd < maxDd) maxDd = dd;
  }
  const mean = sum / n;
  let ss = 0;
  for (const r of returns) ss += (r - mean) ** 2;
  const sd = n > 1 ? Math.sqrt(ss / (n - 1)) : 0;
  const years = n / periodsPerYear;
  const cagr = equity > 0 ? equity ** (1 / years) - 1 : -1;
  const downsideDev = Math.sqrt(downside / n);
  const round = (x, digits = 4) => (Number.isFinite(x) ? Number(x.toFixed(digits)) : null);
  return {
    total_return: round(equity - 1),
    cagr: round(cagr),
    annual_volatility: round(sd * Math.sqrt(periodsPerYear)),
    sharpe: sd > 0 ? round((mean / sd) * Math.sqrt(periodsPerYear), 3) : null,
    sortino: downsideDev > 0 ? round((mean / downsideDev) * Math.sqrt(periodsPerYear), 3) : null,
    max_drawdown: round(maxDd),
    calmar: maxDd < 0 ? round(cagr / -maxDd, 3) : null,
    worst_period: round(worst),
    best_period: round(best),
    share_of_periods_up: round(up / n, 3),
    ...(extra.turnover !== undefined ? { turnover_per_year: round(extra.turnover / years, 2), trades: extra.trades, time_in_market: round(extra.exposed / n, 3) } : {}),
  };
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// The largest even number of CSCV blocks, at most 16, that leaves each block at least 4 periods.
export function cscvSplits(rows) {
  let splits = Math.min(16, Math.floor(rows / 4));
  if (splits % 2) splits -= 1;
  return splits >= 2 ? splits : 0;
}

export function runBacktest({ prices, family, grid = {}, periods_per_year: ppy = 252, cost_bps: costBps = 5, allow_short: allowShort = false, dates }) {
  const p = checkPrices(prices);
  if (!(Number(ppy) > 0 && Number(ppy) <= 100000)) throw new RangeError("periods_per_year must be above 0");
  if (!(Number.isFinite(Number(costBps)) && costBps >= 0 && costBps <= 1000)) throw new RangeError("cost_bps must be from 0 to 1000 (basis points per unit of turnover)");
  const { variants, rejected } = expandGrid(family, family === "buy_and_hold" ? {} : grid);
  const spec = FAMILIES[family];
  const start = Math.max(...variants.map((v) => spec.warmup(v)));
  const evaluated = p.length - 1 - start;
  if (evaluated < BACKTEST_LIMITS.min_evaluated_returns) {
    throw new RangeError(`Only ${evaluated} returns are left after the longest warm-up (${start} periods); send more prices or shorter parameters (at least ${BACKTEST_LIMITS.min_evaluated_returns} are needed)`);
  }

  const runs = variants.map((params) => {
    const sim = simulate(p, positionsFor(family, params, p, { allowShort }), { start, costBps });
    return { params, sim, metrics: performance(sim.returns, ppy, sim) };
  });
  const buyHold = simulate(p, positionsFor("buy_and_hold", {}, p), { start, costBps: 0 });

  const ranked = runs
    .map((run, index) => ({ ...run, index }))
    .sort((a, b) => (b.metrics.sharpe ?? -Infinity) - (a.metrics.sharpe ?? -Infinity) || a.index - b.index);
  const best = ranked[0];
  const sharpes = runs.map((r) => r.metrics.sharpe).filter((s) => s !== null);

  const validation = { trials_counted: runs.length, selection: "the variant with the highest annualized Sharpe over the whole window" };
  let moments = null;
  try { moments = perPeriodMoments(Array.from(best.sim.returns)); } catch (error) { validation.note = error.message; }
  if (moments && best.metrics.sharpe !== null) {
    const shared = { observations: moments.observations, periods_per_year: ppy, skew: moments.skew, non_excess_kurtosis: moments.non_excess_kurtosis };
    const observed = moments.sharpe_per_period * Math.sqrt(ppy);
    try {
      validation.probabilistic_sharpe_vs_zero = Number(probabilisticSharpe({ ...shared, observed_sharpe_annualized: observed }).probabilistic_sharpe_ratio.toFixed(4));
    } catch (error) { validation.probabilistic_sharpe_vs_zero = null; validation.note = error.message; }
    if (runs.length >= 2) {
      const mean = sharpes.reduce((a, b) => a + b, 0) / sharpes.length;
      const sd = Math.sqrt(sharpes.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, sharpes.length - 1));
      try {
        const dsr = calculateDsr({ ...shared, observed_sharpe_annualized: observed, effective_independent_trials: runs.length, cross_trial_sharpe_sd_annualized: sd });
        validation.deflated_sharpe = {
          probability: Number(dsr.deflated_sharpe_ratio.toFixed(4)),
          expected_best_sharpe_by_luck: Number(dsr.expected_max_sharpe_annualized.toFixed(3)),
          cross_variant_sharpe_sd: Number(sd.toFixed(3)),
          counting: "every variant in the grid as an independent trial; correlated variants make this count, and so the deflation, conservative",
        };
      } catch (error) { validation.deflated_sharpe = { error: error.message }; }
    } else {
      validation.deflated_sharpe = { not_run: "One variant was run, so there was no search to deflate for; the probabilistic Sharpe above is the reading." };
    }
    try {
      const trl = minimumTrackRecordLength({ ...shared, observed_sharpe_annualized: observed, benchmark_sharpe_annualized: 0, confidence: 0.95 });
      validation.min_track_record = { periods: Math.ceil(trl.observations), years: Number(trl.years.toFixed(2)), confidence: 0.95, benchmark_sharpe: 0 };
    } catch (error) { validation.min_track_record = { not_run: error.message }; }
  }
  if (runs.length >= 2) {
    const splits = cscvSplits(evaluated);
    if (splits) {
      const matrix = Array.from({ length: evaluated }, (_, t) => runs.map((r) => r.sim.returns[t]));
      try {
        const pbo = pboCscv(matrix, { nSplits: splits, maxCombinations: 2000, seed: 42 });
        validation.overfitting = { probability: Number(pbo.pbo.toFixed(4)), splits, combinations: pbo.n_combinations, exhaustive: pbo.exhaustive };
      } catch (error) { validation.overfitting = { not_run: error.message }; }
    } else {
      validation.overfitting = { not_run: "Too few returns to split into blocks of at least 4 periods." };
    }
  }

  const window = {
    prices: p.length,
    evaluated_returns: evaluated,
    warmup_periods: start,
    ...(Array.isArray(dates) && dates.length === p.length ? { first_return_date: dates[start + 1], last_date: dates.at(-1) } : {}),
  };
  const shown = ranked.slice(0, BACKTEST_LIMITS.top_variants_shown);
  return {
    schema: "canli.backtest.v1",
    family,
    rule: spec.describe,
    settings: { periods_per_year: Number(ppy), cost_bps: Number(costBps), allow_short: Boolean(allowShort) },
    window,
    variants: {
      count: runs.length,
      ...(rejected ? { rejected_invalid_combinations: rejected } : {}),
      sharpe: sharpes.length ? { min: Math.min(...sharpes), median: Number(median(sharpes).toFixed(3)), max: Math.max(...sharpes) } : null,
      columns: [...spec.params, "sharpe", "cagr", "max_drawdown", "turnover_per_year"],
      top: shown.map((r) => [...spec.params.map((k) => r.params[k]), r.metrics.sharpe, r.metrics.cagr, r.metrics.max_drawdown, r.metrics.turnover_per_year]),
    },
    selected: { params: best.params, metrics: best.metrics },
    buy_and_hold: performance(buyHold.returns, ppy),
    validation,
    plain_reading: reading(family, runs.length, best, validation, performance(buyHold.returns, ppy)),
  };
}

function reading(family, count, best, v, buyHold) {
  const pct = (x) => `${(x * 100).toFixed(1)} percent`;
  const params = Object.entries(best.params).map(([k, val]) => `${k} ${val}`).join(", ");
  const parts = [`Best of ${count} ${family} variant${count === 1 ? "" : "s"}${params ? ` (${params})` : ""}: annualized Sharpe ${best.metrics.sharpe ?? "undefined"}, max drawdown ${pct(best.metrics.max_drawdown)}, after costs.`];
  if (v.deflated_sharpe?.probability !== undefined) {
    parts.push(`Counting all ${count} variants this call ran, the probability its Sharpe is above what the best of them would show by luck (${v.deflated_sharpe.expected_best_sharpe_by_luck}) is ${pct(v.deflated_sharpe.probability)}.`);
  } else if (v.probabilistic_sharpe_vs_zero !== undefined && v.probabilistic_sharpe_vs_zero !== null) {
    parts.push(`The probability its Sharpe is above zero, counting only sample uncertainty, is ${pct(v.probabilistic_sharpe_vs_zero)}.`);
  }
  if (v.overfitting?.probability !== undefined) parts.push(`Probability of backtest overfitting across the grid: ${pct(v.overfitting.probability)}.`);
  parts.push(`Buy and hold over the same window: Sharpe ${buyHold.sharpe ?? "undefined"}, max drawdown ${pct(buyHold.max_drawdown)}. None of this is a forecast.`);
  return parts.join(" ");
}

export const BACKTEST_LIMITS_TEXT = Object.freeze([
  "Backtested on the prices exactly as supplied. Survivorship, splits, dividends and data errors in them were not checked.",
  "Signals use closes up to each day and trade at that close; a real order fills later, at another price.",
  "Costs are a flat rate per unit of turnover. Spread, market impact, borrow and financing beyond that rate are not modeled.",
  "A backtest, deflated or not, is not a forecast and not advice.",
]);
