# Economic-Trend Sleeve, macro-fundamental trend (campaign): a killed candidate

**Short title:** Economic-trend macro sleeve: killed

**Verdict:** KILLED  **Stage:** deployed gauntlet  
**Identity:** `econtrend`

Trend on first-release macro vintages (payrolls, CPI, IP, credit spreads, yields, dollar) driving the 17-ETF basket by a pre-committed economic sign matrix. It has a REAL crisis-alpha personality — +60.7% through the 2008 GFC (SPY -46%), +17.5% in the 2022 bear (SPY -18%), essentially uncorrelated with the live AlphaTrend book (+0.009) and mildly SPY-negative (-0.20). But it fails the adopt bar 2 of 3: net Sharpe 0.211 (bar 0.40), DSR 0.00 at N=103, and it gets caught in fast gap-down crashes (COVID -25.9%, breaching the -22.5% floor). Genuine decorrelation, not enough edge. A hostile 3-auditor leakage panel cleared the vintage plumbing before the one-shot ran. KILLED at the gauntlet. Also tested as a combined-book DIVERSIFIER (not just standalone), since near-zero correlation can lift a book even below the solo bar: it fails there too. At equal total vol its naive Sharpe ticks up ~0.02-0.04 but within noise, it DEEPENS the GFC and 2022 drawdowns, and decisively — strip its DSR-0.00 mean and the optimal weight goes to exactly 0.00 (the whole 'benefit' was return-stacking a mean statistically indistinguishable from zero, not real diversification). Not added, in any construction. Reproduce: scripts/probe_econtrend_book.py.

## Why it was worth testing

This one reached deployment before it was killed, which makes it the most expensive kind of kill and the most important to publish in full. A candidate that passed on the evidence available at the time and failed on better evidence later is not a process failure to be hidden; refusing to withdraw it would be.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | 0.2110 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
