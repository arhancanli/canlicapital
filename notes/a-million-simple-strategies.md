# A million simple strategies to beat

> The Lab runs 588 textbook rules on each of 1,678 public return series: 986,664 strategies, each rebuilt
> exactly from its number. A backtest can be set against all of them in seconds, to see whether it is new and
> whether it beats what simple rules on public data already earned. They vary like about 15 independent ones.

**Short title:** A million simple strategies

**Published 2026-11-08. Every figure below is read from
[`lab-v1-2026-11-08.json`](/glassbox/lab-v1-2026-11-08.json), a summary of the Lab built on 8 November 2026.**

## What it is

The Lab downloads Kenneth French's daily portfolio and factor files once (104 files: US portfolios from 1926 and
international ones from 1990) and runs every rule in a fixed grid on each of their 1,678 series:

- **Rules:** 294 of them in seven families: time-series momentum, moving-average crossovers, breakouts,
  z-score and RSI reversion, volatility targeting, and momentum with volatility targeting, each with its usual
  parameters on a plain grid.
- **Trading:** each rule rebalanced daily or monthly, so 588 variants per series. Positions use only information to
  the close before and earn from the next close, after a cost of 5 basis points per unit of turnover.
- **Numbers, not files:** a strategy's id names its series and its variant, so any of them can be rebuilt exactly,
  and nothing about it is chosen after seeing results.

## How good simple rules get

Each strategy's Sharpe ratio over its whole history, after costs:

| Share of strategies | Sharpe at or below |
|---|---|
| 10% | -0.11 |
| Half | 0.37 |
| 90% | 0.79 |
| 99% | 1.34 |

85% have a positive Sharpe, mostly because most of the series are long-only stock portfolios that rose over the
century, and 3.7% are above 1. The best reaches 5.45: volatility targeting on the portfolio of the smallest stocks
that fell most the month before, whose paper returns are largely the bounce between bid and ask prices in tiny
stocks, which no one could trade. That is the bar luck and the data set together, and why a single good backtest
says little until it is set against everything simple that was tried.

## A million that are about fifteen

The count is honest only beside its effective size. A seeded sample of 1,500 strategies, over the 429 months they
share from 1991, varies like about 15 independent ones (the participation ratio of their correlations, 14.8): a few
common movements, the market's above all, dominate it. More rules on the same data add little independent
information, and `lab_status` reports this number with every build.

## Use it

In canli-mcp's next release, on your machine: `canli-mcp lab build` downloads French's files and builds the Lab
once. Then:

- `originality_check` sets your returns against every strategy covering the same months: the nearest by
  correlation, how many are near-copies, and where your Sharpe ranks.
- `lab_search` finds strategies by family, series and Sharpe, or nearly uncorrelated with your book.
- `lab_strategy` rebuilds one from its number; `backtest_forensics` uses the Lab for its near-copy check.

The strategies run on French's portfolio returns, which are not investable. They are a reference for what simple
rules on public data could have earned; resembling one is not proof of copying, and beating them is not a forecast.
