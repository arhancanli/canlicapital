# Real-Futures Breadth for the Trend Sleeve (probe): a killed candidate

**Verdict:** KILLED  **Stage:** screen prototype  
**Identity:** `mf_realfutures_breadth`

We had been treating 'buy real futures data for genuine breadth' as the roadmap for the trend sleeve, on the theory that Sharpe scales with the square root of effective breadth and 17 ETFs cannot supply it. Half of that is right: measured effective breadth is 9.1 for 38 real futures versus 5.3 for the live 17-ETF basket (and only 3.5 for a 33-ETF expansion we already killed — more names, LESS breadth, which is why it failed). The other half is wrong. On an identical construction, identical costs and the identical 2010-2026 common window, the 38-market futures book returns net Sharpe -0.148 against the ETF sleeve's +0.498, independently reproducing an earlier -0.24 result we had discounted as a possible one-off. It is not a data fault: across all 38 back-adjusted series there is exactly one single-day move above 25%. Breadth MULTIPLIES the average per-market edge; where that edge is absent, more breadth buys more of nothing and 7.3x turnover instead of 4.3x. The capital-gated futures path is therefore NOT validated and we have stopped citing it. Reproduce: the probe is in the session record; data is data/lake_fut_real (38 markets).

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | -0.1480 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
