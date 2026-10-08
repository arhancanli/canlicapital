// The sleeve library: rule-based strategies fixed in advance, each a recipe with frozen parameters,
// a published rationale, and a SHA-256 of its spec so a result can be tied to the exact rule.
//
// Sleeves are definitions, not track records. Nothing here was selected because it backtested well:
// every family is a published idea and every grid is a plain sweep of its usual parameters. The
// sleeves toolset runs them on the caller's prices and says which survive multiple-testing
// correction on that data.
//
// Parameters are in periods and assume daily bars (21 ~ a month, 252 ~ a year).
import { createHash } from "node:crypto";

import { RECIPES } from "./tools/strategies.mjs";

export const SPEC_VERSION = 1;

const lo = (b) => (b ? "long" : "ls");
const pct = (x) => Math.round(x * 100);
const grid = (...axes) => axes.reduce((acc, ax) => acc.flatMap((c) => ax.map((v) => [...c, v])), [[]]);

// data: "single" trades one column, "universe" all columns, "pair" two columns.
const FAMILIES = [
  {
    family: "ma_crossover", title: "Moving-average crossover", recipe: "ma_crossover", data: "single",
    rationale: "Prices trend more than a random walk would allow at multi-month horizons, so a fast average above a slow one tends to mark an uptrend.",
    references: ["Brock, Lakonishok and LeBaron (1992), Simple Technical Trading Rules and the Stochastic Properties of Stock Returns, Journal of Finance"],
    risks: "Whipsaws in sideways markets; late entries and exits around turning points.",
    variants: grid([[5, 20], [10, 30], [10, 50], [20, 50], [20, 100], [50, 100], [50, 150], [50, 200], [100, 200], [20, 200]], [true, false]).map(([[f, s], l]) => ({ id: `ma-${f}-${s}-${lo(l)}`, params: { fast: f, slow: s, long_only: l } })),
    warmup: (p) => p.slow - 1,
  },
  {
    family: "time_series_momentum", title: "Time-series momentum", recipe: "time_series_momentum", data: "single",
    rationale: "An asset's own past return predicts its future return across asset classes at 1-12 month horizons.",
    references: ["Moskowitz, Ooi and Pedersen (2012), Time Series Momentum, Journal of Financial Economics"],
    risks: "Sharp reversals at trend turns (momentum crashes); long flat periods in range-bound markets.",
    variants: grid([21, 42, 63, 126, 189, 252], [null, 0.1, 0.15, 0.2], [true, false]).map(([L, vt, l]) => ({ id: `tsmom-${L}${vt ? `-vt${pct(vt)}` : ""}-${lo(l)}`, params: { lookback: L, ...(vt ? { vol_target: vt } : {}), long_only: l } })),
    warmup: (p) => Math.max(p.lookback, p.vol_target ? 63 : 0),
  },
  {
    family: "trend_ensemble", title: "Multi-horizon trend ensemble", recipe: "trend_ensemble", data: "single",
    rationale: "Averaging trend signals over several horizons diversifies the timing risk of any single lookback.",
    references: ["Hurst, Ooi and Pedersen (2017), A Century of Evidence on Trend-Following Investing, Journal of Portfolio Management"],
    risks: "Still a trend strategy: loses in choppy markets, only more smoothly.",
    variants: grid([["fast", [10, 21, 42, 63]], ["mid", [21, 63, 126, 252]], ["slow", [63, 126, 252, 504]]], [null, 0.1, 0.15], [true, false]).map(([[name, Ls], vt, l]) => ({ id: `trend-${name}${vt ? `-vt${pct(vt)}` : ""}-${lo(l)}`, params: { lookbacks: Ls, ...(vt ? { vol_target: vt } : {}), long_only: l } })),
    warmup: (p) => Math.max(Math.max(...p.lookbacks), p.vol_target ? 63 : 0),
  },
  {
    family: "breakout", title: "Channel breakout", recipe: "breakout", data: "single",
    rationale: "New highs signal persistent demand; the classic turtle rules enter on a channel break and exit on a shorter one.",
    references: ["Donchian channel rules as documented in Faith (2007), Way of the Turtle"],
    risks: "Many small false breakouts; returns depend on a few large trends.",
    variants: grid([[10, 5], [20, 10], [40, 20], [55, 20], [100, 50], [250, 50]], [true, false]).map(([[n, m], l]) => ({ id: `breakout-${n}-${m}-${lo(l)}`, params: { entry: n, exit: m, long_only: l } })),
    warmup: (p) => p.entry,
  },
  {
    family: "macd_trend", title: "MACD trend", recipe: "macd_trend", data: "single",
    rationale: "The gap between a fast and a slow exponential average, against its own average, tracks trend acceleration.",
    references: ["Appel (2005), Technical Analysis: Power Tools for Active Investors"],
    risks: "Frequent signal flips in quiet markets; sensitive to the span choices.",
    variants: grid([[12, 26, 9], [8, 17, 9], [5, 35, 5], [19, 39, 9]], [true, false]).map(([[f, s, g], l]) => ({ id: `macd-${f}-${s}-${g}-${lo(l)}`, params: { fast: f, slow: s, signal: g, long_only: l } })),
    warmup: (p) => p.slow + p.signal - 2,
  },
  {
    family: "zscore_reversion", title: "Z-score mean reversion", recipe: "zscore_reversion", data: "single",
    rationale: "Short-horizon price stretches away from a rolling mean tend to partly revert.",
    references: ["Poterba and Summers (1988), Mean Reversion in Stock Prices, Journal of Financial Economics", "Bollinger (2001), Bollinger on Bollinger Bands"],
    risks: "Catches falling knives in trending markets; losses cluster in crashes.",
    variants: grid([5, 10, 20, 40, 60], [1.5, 2, 2.5], [true, false]).map(([w, e, l]) => ({ id: `zrev-${w}-z${e * 10}-${lo(l)}`, params: { window: w, entry_z: e, exit_z: 0.5, long_only: l } })),
    warmup: (p) => p.window - 1,
  },
  {
    family: "rsi_reversion", title: "RSI oversold reversion", recipe: "rsi_reversion", data: "single",
    rationale: "Very short-term oversold readings in liquid assets have tended to bounce.",
    references: ["Wilder (1978), New Concepts in Technical Trading Systems", "Connors and Alvarez (2009), Short Term Trading Strategies That Work"],
    risks: "Long only and buys weakness, so it holds through crashes; edge depends on the market regime.",
    variants: grid([2, 3, 5, 14], [10, 20, 30], [50, 70]).map(([n, b, x]) => ({ id: `rsi-${n}-${b}-${x}`, params: { period: n, lower: b, exit_level: x } })),
    warmup: (p) => p.period,
  },
  {
    family: "volatility_target", title: "Volatility targeting", recipe: "volatility_target", data: "single",
    rationale: "Volatility is persistent and not rewarded one for one, so scaling exposure inversely to recent volatility can improve risk-adjusted returns and cut tail risk.",
    references: ["Moreira and Muir (2017), Volatility-Managed Portfolios, Journal of Finance", "Harvey, Hoyle, Korgaonkar, Rattray, Sargaison and Van Hemert (2018), The Impact of Volatility Targeting, Journal of Portfolio Management"],
    risks: "Leverage in calm markets just before volatility spikes; turnover with short lookbacks.",
    variants: grid([0.05, 0.1, 0.15, 0.2], [21, 63, 126], [1, 5, 21]).map(([tv, L, k]) => ({ id: `voltarget-${pct(tv)}-${L}-r${k}`, params: { target: tv, lookback: L, rebalance_every: k } })),
    warmup: (p) => p.lookback,
  },
  {
    family: "cross_sectional_momentum", title: "Cross-sectional momentum", recipe: "cross_sectional_momentum", data: "universe",
    rationale: "Assets that outperformed their peers over the past months tend to keep outperforming; skipping the latest month avoids short-term reversal.",
    references: ["Jegadeesh and Titman (1993), Returns to Buying Winners and Selling Losers, Journal of Finance", "Asness, Moskowitz and Pedersen (2013), Value and Momentum Everywhere, Journal of Finance"],
    risks: "Momentum crashes after market rebounds; concentrated holdings in small universes.",
    variants: grid([63, 126, 252], [0, 21], [0.25, 0.33, 0.5], [21, 63], [true, false]).map(([L, sk, f, k, l]) => ({ id: `xsmom-${L}-s${sk}-top${pct(f)}-r${k}-${lo(l)}`, params: { lookback: L, skip: sk, top_fraction: f, rebalance_every: k, long_only: l } })),
    warmup: (p) => p.lookback,
  },
  {
    family: "dual_momentum", title: "Dual momentum", recipe: "dual_momentum", data: "universe",
    rationale: "Hold the best recent performer only while its own trend is positive; combines relative and absolute momentum.",
    references: ["Antonacci (2014), Dual Momentum Investing"],
    risks: "All-in on one asset; whipsaw between asset and cash around zero momentum.",
    variants: grid([21, 63, 126, 189, 252], [5, 21]).map(([L, k]) => ({ id: `dualmom-${L}-r${k}`, params: { lookback: L, rebalance_every: k } })),
    warmup: (p) => p.lookback,
  },
  {
    family: "risk_parity", title: "Inverse-volatility risk parity", recipe: "risk_parity_rebalance", data: "universe",
    rationale: "Equalizing risk instead of capital avoids the book being dominated by its most volatile asset.",
    references: ["Maillard, Roncalli and Teiletche (2010), The Properties of Equally Weighted Risk Contribution Portfolios, Journal of Portfolio Management", "Asness, Frazzini and Pedersen (2012), Leverage Aversion and Risk Parity, Financial Analysts Journal"],
    risks: "Overweights low-volatility assets such as bonds, which can fall together with equities when rates rise.",
    variants: grid([21, 63, 126, 252], [5, 21, 63], [null, 0.1]).map(([L, k, vt]) => ({ id: `riskparity-${L}-r${k}${vt ? `-vt${pct(vt)}` : ""}`, params: { lookback: L, rebalance_every: k, ...(vt ? { target_volatility: vt } : {}) } })),
    warmup: (p) => p.lookback,
  },
  {
    family: "equal_weight", title: "Equal weight", recipe: "equal_weight_rebalance", data: "universe",
    rationale: "1/N is hard to beat out of sample because it estimates nothing; it is the baseline every optimized sleeve should clear.",
    references: ["DeMiguel, Garlappi and Uppal (2009), Optimal Versus Naive Diversification, Review of Financial Studies"],
    risks: "Takes every asset's risk as it comes; no defense in a broad selloff.",
    variants: [1, 5, 21, 63, 252].map((k) => ({ id: `equalweight-r${k}`, params: { rebalance_every: k } })),
    warmup: () => 0,
  },
  {
    family: "min_variance", title: "Minimum variance", recipe: "min_variance_rebalance", data: "universe",
    rationale: "Low-risk portfolios have historically delivered returns close to the market's with much less volatility.",
    references: ["Clarke, de Silva and Thorley (2006), Minimum-Variance Portfolios in the U.S. Equity Market, Journal of Portfolio Management"],
    risks: "Concentrates in a few low-volatility assets; covariance estimates are noisy with short lookbacks.",
    variants: grid([63, 126, 252], [21, 63]).map(([L, k]) => ({ id: `minvar-${L}-r${k}`, params: { lookback: L, rebalance_every: k } })),
    warmup: (p) => p.lookback,
  },
  {
    family: "low_volatility", title: "Low-volatility anomaly", recipe: "low_volatility", data: "universe",
    rationale: "Lower-risk assets have earned higher risk-adjusted returns than higher-risk ones, against the CAPM's prediction.",
    references: ["Ang, Hodrick, Xing and Zhang (2006), The Cross-Section of Volatility and Expected Returns, Journal of Finance", "Frazzini and Pedersen (2014), Betting Against Beta, Journal of Financial Economics"],
    risks: "Lags in strong rallies; sector and rate concentration.",
    variants: grid([21, 63, 252], [0.25, 0.5], [21, 63]).map(([L, f, k]) => ({ id: `lowvol-${L}-top${pct(f)}-r${k}`, params: { lookback: L, top_fraction: f, rebalance_every: k } })),
    warmup: (p) => p.lookback,
  },
  {
    family: "short_term_reversal", title: "Short-term reversal", recipe: "short_term_reversal", data: "universe",
    rationale: "Last week's and last month's losers tend to rebound relative to winners, partly as compensation for providing liquidity.",
    references: ["Jegadeesh (1990), Evidence of Predictable Behavior of Security Returns, Journal of Finance", "Lehmann (1990), Fads, Martingales, and Market Efficiency, Quarterly Journal of Economics"],
    risks: "High turnover makes it cost-sensitive; buys losers that keep losing on real news.",
    variants: grid([5, 10, 21], [0.2, 0.33], [5, 21], [true, false]).map(([L, f, k, l]) => ({ id: `reversal-${L}-top${pct(f)}-r${k}-${lo(l)}`, params: { lookback: L, top_fraction: f, rebalance_every: k, long_only: l } })),
    warmup: (p) => p.lookback,
  },
  {
    family: "trend_filter", title: "Trend-filtered allocation", recipe: "trend_filter_allocation", data: "universe",
    rationale: "Holding each asset only while it is above its long moving average has historically cut drawdowns with modest cost to returns.",
    references: ["Faber (2007), A Quantitative Approach to Tactical Asset Allocation, Journal of Wealth Management"],
    risks: "Sits in cash through V-shaped recoveries; whipsaw around the average.",
    variants: grid([50, 100, 150, 200, 250], ["equal", "inverse_vol"], [5, 21]).map(([L, w, k]) => ({ id: `trendfilter-${L}-${w === "equal" ? "ew" : "iv"}-r${k}`, params: { sma: L, weighting: w, rebalance_every: k } })),
    warmup: (p) => (p.weighting === "equal" ? p.sma - 1 : Math.max(p.sma - 1, 63)),
  },
  {
    family: "high_proximity", title: "52-week-high momentum", recipe: "high_proximity", data: "universe",
    rationale: "Investors anchor on the 52-week high, so assets near it underreact to good news and keep drifting up.",
    references: ["George and Hwang (2004), The 52-Week High and Momentum Investing, Journal of Finance"],
    risks: "Crowded with momentum; concentrated in recent winners.",
    variants: grid([126, 252], [0.25, 0.33, 0.5], [21, 63]).map(([L, f, k]) => ({ id: `nearhigh-${L}-top${pct(f)}-r${k}`, params: { window: L, top_fraction: f, rebalance_every: k } })),
    warmup: (p) => p.window - 1,
  },
  {
    family: "pairs", title: "Pairs trading", recipe: "pairs_trading", data: "pair",
    rationale: "Two related assets whose spread has been stable tend to see deviations in that spread close.",
    references: ["Gatev, Goetzmann and Rouwenhorst (2006), Pairs Trading: Performance of a Relative-Value Arbitrage Rule, Review of Financial Studies"],
    risks: "The relationship can break for good; losses grow while waiting for a reversion that never comes.",
    variants: grid([20, 60, 120], [1.5, 2, 2.5], [0, 0.5]).map(([w, e, x]) => ({ id: `pairs-${w}-z${e * 10}-x${x * 10}`, params: { window: w, entry_z: e, exit_z: x } })),
    warmup: (p) => p.window - 1,
  },
];

const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

// Rule text comes from the recipe itself, built on a small dummy series, so it can never drift
// from what the engine runs.
function ruleOf(f, params) {
  const T = 30, row = f.data === "single" ? 1 : f.data === "pair" ? 2 : 4;
  const P = Array.from({ length: T }, () => new Array(row).fill(1));
  const prices = f.data === "single" ? P.map((r) => r[0]) : P;
  return RECIPES[f.recipe].build({ prices, ...params }).rule;
}

// Rule text and the spec hash are computed on first use, so loading the server stays fast.
export const SLEEVES = Object.freeze(FAMILIES.flatMap((f) => f.variants.map((v) => {
  const spec = { spec_version: SPEC_VERSION, id: v.id, recipe: f.recipe, data: f.data, params: v.params };
  let rule, hash;
  return Object.freeze(Object.defineProperties({ ...spec, family: f.family, title: f.title, warmup: f.warmup(v.params) }, {
    rule: { enumerable: true, get: () => (rule ??= ruleOf(f, v.params)) },
    spec_sha256: { enumerable: true, get: () => (hash ??= sha(spec)) },
  }));
})));

export const SLEEVE_BY_ID = new Map(SLEEVES.map((s) => [s.id, s]));
export const FAMILY_INFO = Object.freeze(Object.fromEntries(FAMILIES.map((f) => [f.family, { title: f.title, recipe: f.recipe, data: f.data, rationale: f.rationale, references: f.references, risks: f.risks, sleeves: f.variants.length }])));

if (SLEEVE_BY_ID.size !== SLEEVES.length) throw new Error("Duplicate sleeve id");
