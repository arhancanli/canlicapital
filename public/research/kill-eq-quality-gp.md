# Equity Quality (Gross Profitability): a killed candidate

**Verdict:** KILLED  
**Test window:** 2022-07-05 to 2026-06-01  
**Identity:** `eq_quality_gp`

Quality via GP/A + ROE fails on the narrow top-200 / 5-year slice. Net Sharpe below the 0.30 gate; needs the wide Sharadar fundamentals universe (20yr / 3000 names). KILLED.

## Why it was worth testing

Quality investing is the claim that profitable, stable, low-accrual businesses earn more than their risk explains. It is among the best-documented anomalies in the literature and among the most heavily traded, which is exactly why it deserved a test on a survivorship-free universe with costs charged rather than assumed away. A premium that survives in a paper and dies in a fill is not a premium.

## The result

| Measure | Value |
|---|---|
| Net Sharpe | -0.8214 |
| Annualized return | -3.21% |
| Total return | -11.97% |
| Annualized volatility | 5.59% |
| Maximum drawdown | -14.05% |
| Annualized turnover | 3.77 |
| Trading days | 981 |
| Final equity (USD) | 88,030.04 |
| Fees paid (USD) | 98.32 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
