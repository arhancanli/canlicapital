# Cross-Asset Carry (campaign): a killed candidate

**Short title:** Cross-Asset Carry (campaign): killed

**Verdict:** KILLED  **Stage:** screen prototype
**Identity:** `xasset_carry`

5 constructions. The COMBINED cross-asset book is net-NEGATIVE (3 of 4 legs lose); the one positive leg (oil backwardation, +0.37) is a single-instrument bet that leave-one-out zeroes; rates-carry fails the Covid crisis gate. Real futures data cannot flip it. KILLED.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | 0.3700 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
