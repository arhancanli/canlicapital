// =============================================================================
// execution-core.js  ->  /tools/execution
//
// The same strategy, on the same series, priced six different ways.
//
// The lesson is the gap between the first row and the last. An idealised fill is
// not a small optimism: it is a different strategy, and the difference is usually
// larger than the edge anyone is arguing about. Every assumption below is one a
// real backtest makes by omission rather than by decision.
//
// The series generator is shared with the Selection Risk Lab, so both labs run on
// the same provably edge-free process for the same reason: real bars cannot be
// redistributed, and on a driftless walk nothing found can be argued to be real.
// =============================================================================

import { generateSeries, summarize } from "./selection-risk-core.js";

export { generateSeries };

/** Simple moving average of closes ending at `end`, inclusive. */
function sma(closes, end, window) {
  if (end + 1 < window) return Number.NaN;
  let total = 0;
  for (let k = end - window + 1; k <= end; k += 1) total += closes[k];
  return total / window;
}

/**
 * The execution assumptions, worst-to-best in optimism.
 *
 * `fillAtDecisionClose` is the one that matters. It is not a cost assumption at
 * all: it prices a decision at a price the decision itself used, which no order
 * can achieve. It is included because it is the single most common defect in
 * amateur backtests and because seeing its equity curve beside an honest one is
 * more persuasive than any warning.
 */
export const VARIANTS = [
  {
    key: "idealised",
    label: "Fill at the decision price",
    honest: false,
    note:
      "Trades at the close it used to decide. No order can do this. On a series with no edge it " +
      "does not reliably flatter, because the signal predicts nothing about the next move: its " +
      "direction depends on the seed. That is the uncomfortable part. Whether this defect helps " +
      "you is a function of how predictive your signal really is, which is the thing you were " +
      "using the backtest to find out.",
    config: { fillAtDecisionClose: true, spreadBps: 0, delayBars: 0, impactBps: 0, outageRate: 0 },
  },
  {
    key: "next_open",
    label: "Fill at the next open",
    honest: true,
    note: "The engine's actual rule: decide at the close of bar t, hold from the open of t+1 to the open of t+2.",
    config: { fillAtDecisionClose: false, spreadBps: 0, delayBars: 0, impactBps: 0, outageRate: 0 },
  },
  {
    key: "spread",
    label: "Plus spread and fees",
    honest: true,
    note: "A half-spread and a fee on each unit of turnover.",
    config: { fillAtDecisionClose: false, spreadBps: 5, delayBars: 0, impactBps: 0, outageRate: 0 },
  },
  {
    key: "delay",
    label: "Plus decision-to-fill delay",
    honest: true,
    note: "The order reaches the venue a bar late. Nothing about the signal changed; only when it landed.",
    config: { fillAtDecisionClose: false, spreadBps: 5, delayBars: 1, impactBps: 0, outageRate: 0 },
  },
  {
    key: "impact",
    label: "Plus market impact",
    honest: true,
    note: "A cost that grows with the size traded, charged on turnover.",
    config: { fillAtDecisionClose: false, spreadBps: 5, delayBars: 1, impactBps: 8, outageRate: 0 },
  },
  {
    key: "outage",
    label: "Plus venue outages",
    honest: true,
    note: "A fraction of intended rebalances never reach the venue, so the previous position persists.",
    config: { fillAtDecisionClose: false, spreadBps: 5, delayBars: 1, impactBps: 8, outageRate: 0.05 },
  },
];

/**
 * Run one execution variant over a series with a fixed crossover strategy.
 *
 * The STRATEGY never changes between variants. Only the assumptions about how its
 * orders reach the market do, which is what makes the comparison meaningful.
 */
export function runVariant({ series, fast, slow, config, outageSeed = 1, reserveBars = null }) {
  if (fast >= slow) throw new Error("fast window must be shorter than slow");
  const closes = series.map((b) => b.close);
  if (series.length > 1 && series[1].open === series[0].close) {
    throw new Error(
      "this series has no overnight gap, so filling at the next open and filling at the " +
        "decision close are the same price and the comparison this lab exists for is vacuous. " +
        "Generate it with a non-zero gapVolatility.",
    );
  }
  const { fillAtDecisionClose, spreadBps, delayBars, impactBps, outageRate } = config;
  const cost = (spreadBps + impactBps) / 10000;

  // A deterministic outage draw, so a scenario is reproducible from its seed.
  let outageState = outageSeed >>> 0;
  const outageDraw = () => {
    outageState = (outageState * 1664525 + 1013904223) >>> 0;
    return outageState / 4294967296;
  };

  const returns = [];
  let previousPosition = 0;
  let heldPosition = 0;

  // Every variant must price the SAME decision bars, or the comparison is not
  // like for like: a delayed variant needs one extra bar of runway, so left to
  // itself it prices one fewer decision than an undelayed one and the two Sharpes
  // are computed over different samples. The caller passes the largest delay in
  // the comparison as `reserveBars` and every variant stops at that same bar.
  //
  // The first version of this function did not do that, while carrying a comment
  // claiming it did. A test that counted the returns caught it.
  const reserve = reserveBars === null ? delayBars : reserveBars;
  if (reserve < delayBars) throw new Error("reserveBars must be at least this variant's delay");
  const lastDecision = series.length - 3 - reserve;
  for (let t = slow - 1; t <= lastDecision; t += 1) {
    const intended = sma(closes, t, fast) > sma(closes, t, slow) ? 1 : 0;

    // An outage means the order never lands, so the PREVIOUS position persists.
    // That is the honest model: an outage is not a flat position, it is a stale one.
    //
    // Drawn only when a trade is actually NEEDED. Drawing on every bar makes the
    // rate mean "probability of an outage on any bar", of which the overwhelming
    // majority are no-ops, so a five percent setting changed nothing measurable and
    // the control looked broken. The rate that matters to a reader is the
    // probability that a rebalance they wanted fails to reach the venue.
    const needsTrade = intended !== heldPosition;
    const reached = needsTrade && outageRate > 0 ? outageDraw() >= outageRate : true;
    const position = reached ? intended : heldPosition;
    heldPosition = position;

    let gross;
    if (fillAtDecisionClose) {
      // The defect: entry at the very close the signal was computed from.
      gross = position * (closes[t + 1] / closes[t] - 1);
    } else {
      const entry = series[t + 1 + delayBars].open;
      const exit = series[t + 2 + delayBars].open;
      gross = position * (exit / entry - 1);
    }

    const turnover = Math.abs(position - previousPosition);
    returns.push(gross - turnover * cost);
    previousPosition = position;
  }

  let equity = 1;
  const curve = [equity];
  for (const r of returns) {
    equity *= 1 + r;
    curve.push(equity);
  }
  return { returns, curve, ...summarize(returns, curve) };
}

/**
 * The measurement the page is really built on.
 *
 * One series is an anecdote. Running every variant over many independent series
 * and reporting the DISTRIBUTION of each one's effect is what separates the two
 * kinds of assumption, which look identical on a single chart:
 *
 *   a COST      strictly reduces the result, every time. Spread and fees have a
 *               tiny variance and a t-statistic in the tens or hundreds.
 *   a RE-TIMING changes WHICH prices you get. Delay and outage hurt on average
 *               but their sign on any one series is close to a coin flip, so
 *               modelling them as a fixed haircut is wrong in a way that can go
 *               either direction.
 *
 * The distinction matters because a backtest that subtracts a number for "slippage"
 * has quietly assumed every execution assumption is the first kind.
 */
export function sweepSeeds({ seeds, bars, gapVolatility, fast, slow, settings }) {
  // ISOLATED, not cumulative. The VARIANTS ladder stacks assumptions, which is the
  // right shape for the equity chart because it shows what a real backtest
  // accumulates. It is the WRONG shape for classification: the impact row inherits
  // the delay row's variance and gets called a re-timing when it is a pure cost.
  // Each assumption is therefore measured alone against the honest baseline.
  const BASE = { fillAtDecisionClose: false, spreadBps: 0, delayBars: 0, impactBps: 0, outageRate: 0 };
  const isolated = [
    { key: "idealised", label: "Fill at the decision price", config: { ...BASE, fillAtDecisionClose: true } },
    { key: "spread", label: "Spread and fees alone", config: { ...BASE, spreadBps: settings.spreadBps } },
    { key: "delay", label: "Decision-to-fill delay alone", config: { ...BASE, delayBars: settings.delayBars } },
    { key: "impact", label: "Market impact alone", config: { ...BASE, impactBps: settings.impactBps } },
    { key: "outage", label: "Venue outages alone", config: { ...BASE, outageRate: settings.outageRate } },
  ].filter((v) => {
    // An assumption turned off has nothing to classify, and reporting a row of
    // zeros as "indistinguishable" would be a measurement of the control panel.
    const c = v.config;
    return c.fillAtDecisionClose || c.spreadBps > 0 || c.delayBars > 0 || c.impactBps > 0 || c.outageRate > 0;
  });

  const reserveBars = Math.max(0, ...isolated.map((v) => v.config.delayBars));
  const perVariant = new Map(isolated.map((v) => [v.key, []]));
  for (let seed = 1; seed <= seeds; seed += 1) {
    const series = generateSeries({ seed, bars, gapVolatility });
    const baseline = runVariant({
      series, fast, slow, outageSeed: seed, config: BASE, reserveBars,
    }).sharpeAnnualised;
    for (const v of isolated) {
      const result = runVariant({ series, fast, slow, config: v.config, outageSeed: seed, reserveBars });
      perVariant.get(v.key).push(result.sharpeAnnualised - baseline);
    }
  }
  return isolated.map((v) => {
    const deltas = perVariant.get(v.key);
    const n = deltas.length;
    const mean = deltas.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
    const standardError = sd / Math.sqrt(n);
    return {
      key: v.key,
      label: v.label,
      mean,
      sd,
      // A cost has a large negative t and a worse-share at or near 100 percent.
      // A re-timing has a modest t and a worse-share near two thirds.
      t: standardError > 0 ? mean / standardError : 0,
      worseShare: deltas.filter((d) => d < 0).length / n,
      samples: n,
    };
  });
}

/**
 * Classify each assumption from its own measured distribution, rather than from a
 * label somebody attached to it.
 */
export function classify(row) {
  // Read off the measured distribution, never off the assumption's name.
  //   a t under 2 in absolute value is not distinguishable from no effect at all;
  //   a cost is negative essentially every time, so its worse-share is at the ceiling;
  //   anything else moves the result reliably on average while its per-series sign
  //   stays a coin flip often enough that a fixed haircut misstates it.
  if (Math.abs(row.t) < 2) return "INDISTINGUISHABLE";
  if (row.worseShare >= 0.98) return "COST";
  return "RE_TIMING";
}

/** Every variant over one series, with the honest baseline identified. */
export function compareVariants({ series, fast, slow, outageSeed }) {
  const reserveBars = Math.max(0, ...VARIANTS.map((v) => v.config.delayBars));
  const rows = VARIANTS.map((v) => ({
    ...v,
    result: runVariant({ series, fast, slow, config: v.config, outageSeed, reserveBars }),
  }));
  const idealised = rows.find((r) => r.key === "idealised").result;
  const baseline = rows.find((r) => r.key === "next_open").result;
  const realistic = rows.at(-1).result;

  // The gap is measured from the HONEST baseline, not from the idealised row.
  //
  // Measuring from the idealised fill would have been the flattering choice and it
  // is not sound: on a series with no edge, filling at the price you decided from
  // has no systematic advantage, because the signal predicts nothing about the
  // next move. Its sign depends on the seed. What IS systematic is the cost
  // ladder, and that is what the page should be built on.
  return {
    rows,
    executionGap: {
      baselineSharpe: baseline.sharpeAnnualised,
      realisticSharpe: realistic.sharpeAnnualised,
      sharpeLost: baseline.sharpeAnnualised - realistic.sharpeAnnualised,
      fractionLost:
        baseline.sharpeAnnualised === 0
          ? null
          : (baseline.sharpeAnnualised - realistic.sharpeAnnualised) / Math.abs(baseline.sharpeAnnualised),
      baselineTotal: baseline.totalReturn,
      realisticTotal: realistic.totalReturn,
      // Reported separately, and deliberately not called a haircut.
      idealisedSharpe: idealised.sharpeAnnualised,
      idealisedMinusBaseline: idealised.sharpeAnnualised - baseline.sharpeAnnualised,
    },
  };
}
