# Was the winning strategy skill or luck?

> I ran 399 textbook trading strategies on the same prices and asked whether the winner was skill.
> The answer depended almost entirely on which test I used, because the tests were answering
> different questions, and only one of them was the question I meant.

**Published 2026-10-11. Every figure below is read from
[`sleeve-tournament-2026-10-08.json`](/glassbox/sleeve-tournament-2026-10-08.json), a run that
reproduces the version of this study first posted on 2026-10-08, number for number.**

## The setup

The 399 strategies are textbook ideas, each with its usual parameters on a plain grid: moving-average
crossovers, time-series momentum with and without volatility targeting, channel breakouts and MACD,
z-score and RSI reversion, cross-sectional and dual momentum, risk parity, minimum variance and low
volatility, short-term reversal, trend-filtered allocation, 52-week-high momentum and pairs. None was
picked because it backtested well; every one is a fixed rule.

They ran on two generated markets of 5 assets and 1,000 days, so the truth is known:

- **Trend:** the first asset has planted trends. Its daily drift flips sign every 125 days, so
  trend-following has a real edge on it.
- **No edge:** the same kind of market with nothing planted. Nothing should beat holding the assets.

Every strategy is scored on the same 495-day window, after the longest warm-up of 504 days, with
trades costing 5 basis points.

## What each test said

| | Trend | No edge |
|---|---|---|
| Best strategy's Sharpe | 4.07 | 1.95 |
| Sharpe the best of 399 would reach by luck alone | 6.21 | 2.34 |
| Deflated Sharpe probability, counting all 399 tries | 0.001 | 0.29 |
| Effective number of independent strategies | 4.0 | 3.5 |
| Deflated Sharpe probability, counting those | 0.996 | 0.954 |
| White's Reality Check p-value (beats buy-and-hold?) | 0.011 | 0.434 |
| Hansen SPA p-value, re-studentized | 0.017 | 0.347 |
| Strategies Romano-Wolf StepM says beat buy-and-hold | 4 | 0 |
| Probability of backtest overfitting (CSCV) | 0.24 | 0.76 |

**Counting all 399 tries rejected the real edge.** On the trend market the best Sharpe, 4.07, is
below the 6.21 that the best of 399 independent skill-less strategies would reach, so the deflated
Sharpe ratio says luck (0.001). But these strategies are not independent: most are near-copies of
each other, and their returns behave like about four independent bets. Counted that way the same
result passes easily (0.996).

**Counting four tries passed the no-edge winner.** On the no-edge market the effective count gives
0.954, just over the usual 0.95 bar, with no edge to find. The deflated Sharpe ratio tests
whether the Sharpe ratio is above zero, and in a market that drifts upward a long-only strategy's
Sharpe really is above zero: it just holds the market. The question that mattered was whether it
beats holding the market, and the Reality Check, SPA and StepM answer that one: no (0.434 and
0.347, and no survivors).

**The overfitting probability moved the right way on both.** CSCV splits the history into halves
many ways, picks the in-sample winner and checks where it ranks out of sample. On the trend market
the winner landed below the median out of sample 24% of the time; on the no-edge market, 76%, worse
than picking at random.

## What picking the winners was worth

The selection process itself can be tested: every 63 days, rank the strategies by trailing one-year
Sharpe, hold the top five for the next 63 days, and repeat.

- **Trend:** the picks averaged a Sharpe of 4.69 in sample and 3.76 out of sample. They kept most of
  their edge.
- **No edge:** 2.81 in sample and 1.29 out of sample, below simply holding all 399 strategies
  equally (1.90) and below buy-and-hold (1.90).

The gap between the in-sample and out-of-sample Sharpe is roughly how much of the picks' Sharpe was
luck.

## What I do now

1. **Report the deflated Sharpe under both counts.** The raw count is the conservative bound and the
   effective count the optimistic one. A result that passes only the optimistic one is not proven.
2. **Ask the benchmark question separately.** For a long-only strategy in a rising market, "Sharpe
   above zero" is nearly free; the Reality Check, SPA and StepM against buy-and-hold ask whether it
   beats doing nothing clever.
3. **Test the picking, not just the pick.** A walk-forward over the selection rule shows how much
   edge survives once you cannot see the future.

The tournament, the walk-forward and the 399 strategy definitions are tools in
[canli-mcp](/mcp-servers), which runs them locally on the prices you send.
