# Your backtest beat a t-test. Would it beat a placebo?

> In 300,000 simulated tests on markets with nothing to predict, a t-test on the best rule of a
> grid said "edge" between 10.9% and 78.9% of the time at a nominal 5%. A placebo test, which
> reruns the whole pipeline on the same returns in a random order, stayed between 4.6% and 5.5%.

**Short title:** Would your backtest beat a placebo?

**Published 2026-10-11. The rule, the run and the evaluation were pre-registered and are in
[the repository](https://github.com/arhancanli/canlicapital/tree/main/scripts/research/placebo/v1);
every rate below is read from
[`placebo-v1-evaluation.json`](/glassbox/research/placebo-v1-evaluation.json).**

## Two things that look like skill

You test 11 moving-average crossovers on five years of daily prices. The best one has a Sharpe of
1.2, and a t-test on its returns says p = 0.01. Is it real? Two things can produce that result
without any skill.

**The search.** The best of 11 rules is the best of 11 draws, and even with no edge the maximum is
high. On flat simulated markets, an 11-rule SMA grid's best Sharpe averaged 0.30 with nothing to
find. That is what Bonferroni and the deflated Sharpe ratio correct for, if you know how many
rules you really tried.

**What the market does on its own.** A long-only rule earns the drift of a rising market without
predicting anything. A cross-sectional ranking that buys past winners earns the gap between assets
with different long-run average returns, again without predicting anything. A t-test on a
strategy's returns asks "did it make money?", not "did it predict?", so drift and dispersion pass
for skill, and dividing the significance level by the number of rules does nothing about that.

## The placebo

Keep your data's returns, but put the days in a random order, the same order for every asset. Each
asset keeps its own returns, fat tails and average; each day keeps its cross-section; but nothing
about one day tells you anything about the next. That is a placebo: a market with the same raw
material and nothing to predict.

Then run the whole pipeline on the real data and on 19 placebos: the same search, the same filters,
the same parameter choices. If the real result beats all 19, the chance of that by luck is 1 in 20,
a p-value of 0.05. Every choice the pipeline makes is counted, because it makes it again on every
placebo, and drift and dispersion are in the placebos too, so they stop looking like skill.

When the days are interchangeable this p-value is exact, because the real ordering is just one of
the orderings. Volatility clustering breaks that, so the study measured it.

## The study

The rules were written down before anything ran: three ways of reordering (a full permutation, a
permutation of blocks of days, and a stationary bootstrap), a bar of at most 6% false positives at a
nominal 5% in every simulated market, and the rule that picks the winner.

- **Markets with nothing to predict:** five return shapes (normal, fat-tailed, negatively skewed,
  GARCH volatility clustering, volatility regimes), each flat or drifting, or, for the
  cross-section, with equal or dispersed average returns.
- **Pipelines:** an SMA crossover grid, a time-series momentum grid and a cross-sectional momentum
  grid, each reporting its best Sharpe.
- **30 combinations with 10,000 tests each,** with 19 placebos per test, and planted trends with
  2,000 tests each to measure power.

The full permutation met the bar in all 30: 4.6% to 5.5%, including the GARCH and regime markets.
The block permutation also met it, at 5.8% at worst, with less power. The stationary bootstrap was
far too cautious, never above 1.5%, so it would miss real edges.

The usual fix for testing many rules, Bonferroni, held in flat markets but said "edge" 8.0% to
10.3% of the time when the market drifted upward, and 58.5% to 59.7% of the time when assets
differed only in their average returns.

How often does the placebo catch a real edge? With a planted trend that a perfect forecaster would
trade at a Sharpe of about 2, the SMA grid beat all 19 placebos 45.1% of the time and the
time-series grid 47.3%; at a Sharpe of about 1, both were near 14.8%. The cross-sectional grid
caught its strongest planted trend 89.0% of the time. With only 19 placebos, Bonferroni catches some
trends more often in flat markets, where it is valid; more placebos give a finer p-value.

## What it does not tell you

Beating the placebos shows that the real order of your returns holds more than random orders of
the same returns. It says nothing about costs, capacity or whether the edge lasts. And it counts
only the search this pipeline runs: if you tried and dropped other pipelines before this one, those
trials are not in the number.

The placebo is the `placebo_test` tool in [canli-mcp](/mcp-servers): `plan` writes your price file
and the placebo files, you run your pipeline on each, and `compare` returns the p-value. It runs on
your machine, so your code never leaves it.
