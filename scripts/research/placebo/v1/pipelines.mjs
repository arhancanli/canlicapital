// Three research pipelines of the kind people run, simulated so the placebo study can run them
// millions of times. Each takes a panel of daily returns (columns), searches a grid of rules, and
// reports what a researcher would headline: the best annualized Sharpe in the grid. Every rule is
// scored on the same days, from WARMUP on, and every position is decided from returns before the
// day it earns (a test changes a later return and checks that no earlier position moves).
//
//   sma_grid     one asset, long or flat: in the market while a fast moving average of the price is
//                above a slow one, for 11 (fast, slow) pairs
//   tsmom_grid   one asset, long or short: the sign of the past return, for 6 lookbacks
//   xsmom_grid   twenty assets, long the 4 best and short the 4 worst by past return, rebalanced
//                every 21 days, for 4 lookbacks
import { normalCdf } from "../../../../js/dsr-core.js";

export const WARMUP = 252;
export const SMA_RULES = Object.freeze([[5, 50], [5, 100], [5, 200], [10, 50], [10, 100], [10, 200], [20, 50], [20, 100], [20, 200], [50, 100], [50, 200]]);
export const TSMOM_LOOKBACKS = Object.freeze([5, 10, 21, 63, 126, 252]);
export const XSMOM = Object.freeze({ lookbacks: Object.freeze([21, 63, 126, 252]), hold: 21, side: 4 });

/** Mean, standard deviation and annualized Sharpe of daily strategy returns. */
function score(s) {
  let sum = 0, sq = 0;
  for (let i = 0; i < s.length; i++) { sum += s[i]; sq += s[i] * s[i]; }
  const mean = sum / s.length;
  const sd = Math.sqrt(Math.max(0, sq / s.length - mean * mean));
  return { mean, sd, sharpe: sd > 0 ? (mean / sd) * Math.sqrt(252) : 0 };
}

const prefix = (r) => {
  const out = new Float64Array(r.length + 1);
  for (let t = 0; t < r.length; t++) out[t + 1] = out[t] + r[t];
  return out;
};

/** Daily returns of every sma_grid rule from WARMUP on. */
export function smaRuleReturns([r]) {
  const n = r.length;
  const close = new Float64Array(n);
  let level = 1;
  for (let t = 0; t < n; t++) { level *= 1 + r[t]; close[t] = level; }
  const cs = prefix(close);
  // The average of the w closes ending at day j.
  const sma = (j, w) => (cs[j + 1] - cs[j + 1 - w]) / w;
  return SMA_RULES.map(([fast, slow]) => {
    const s = new Float64Array(n - WARMUP);
    for (let t = WARMUP; t < n; t++) s[t - WARMUP] = sma(t - 1, fast) > sma(t - 1, slow) ? r[t] : 0;
    return s;
  });
}

/** Daily returns of every tsmom_grid rule from WARMUP on. */
export function tsmomRuleReturns([r]) {
  const n = r.length;
  const cr = prefix(r);
  return TSMOM_LOOKBACKS.map((lookback) => {
    const s = new Float64Array(n - WARMUP);
    for (let t = WARMUP; t < n; t++) s[t - WARMUP] = Math.sign(cr[t] - cr[t - lookback]) * r[t];
    return s;
  });
}

/** Daily returns of every xsmom_grid rule from WARMUP on. */
export function xsmomRuleReturns(columns) {
  const n = columns[0].length;
  const cr = columns.map(prefix);
  const assets = columns.map((_, i) => i);
  return XSMOM.lookbacks.map((lookback) => {
    const s = new Float64Array(n - WARMUP);
    for (let start = WARMUP; start < n; start += XSMOM.hold) {
      // Ranked on returns up to the day before the holding period starts; ties keep asset order.
      const ranked = [...assets].sort((i, j) => (cr[j][start] - cr[j][start - lookback]) - (cr[i][start] - cr[i][start - lookback]) || i - j);
      const long = ranked.slice(0, XSMOM.side), short = ranked.slice(-XSMOM.side);
      for (let t = start; t < Math.min(n, start + XSMOM.hold); t++) {
        let v = 0;
        for (const i of long) v += columns[i][t];
        for (const i of short) v -= columns[i][t];
        s[t - WARMUP] = v / XSMOM.side;
      }
    }
    return s;
  });
}

export const PIPELINES = Object.freeze({
  sma_grid: Object.freeze({ assets: "single", rules: smaRuleReturns }),
  tsmom_grid: Object.freeze({ assets: "single", rules: tsmomRuleReturns }),
  xsmom_grid: Object.freeze({ assets: "cross_section", rules: xsmomRuleReturns }),
});

/**
 * What the pipeline headlines (the best annualized Sharpe in its grid) and the two textbook
 * p-values for it: naive, a one-sided t-test on the best rule's daily mean as if it were the only
 * rule tried, and Bonferroni, that p-value times the number of rules.
 */
export function runPipeline(name, columns) {
  const rules = PIPELINES[name].rules(columns).map(score);
  let best = 0;
  for (let k = 1; k < rules.length; k++) if (rules[k].sharpe > rules[best].sharpe) best = k;
  const days = columns[0].length - WARMUP;
  const top = rules[best];
  const t = top.sd > 0 ? (top.mean / top.sd) * Math.sqrt(days) : 0;
  const naive = 1 - normalCdf(t);
  return { sharpe: top.sharpe, rule: best, naive, bonferroni: Math.min(1, naive * rules.length) };
}
