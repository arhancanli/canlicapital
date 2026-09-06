# Cross-Sectional Same-Calendar-Month Seasonality (probe): a killed candidate

**Short title:** Cross-Sectional Same-Calendar-Month Seasonality: killed

**Verdict:** KILLED  **Stage:** screen prototype  
**Identity:** `xs_seasonality`

The one equity-side signal genuinely DECORRELATED from our momentum sleeve — and that is exactly why it is worth publishing. Same-calendar-month ranking across a 33-ETF macro basket, 10y trailing PIT history, monthly, net of 6bp + borrow: net Sharpe -0.334, and NEGATIVE GROSS too (-0.176), so there is no edge for costs to erode. Correlation to plain 12-1 momentum is just +0.07 (it passes the costume test that killed residual momentum and 52-week-high) — but a 12-1 control on the SAME universe prints +0.175, so the harness can find a real signal; this one simply is not there. Decorrelation without edge is worthless. Screen gate failed, no walk-forward trial spent. Reproduce: scripts/probe_seasonality.py.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | -0.3340 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
