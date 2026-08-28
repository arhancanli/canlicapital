# Commodity / Cross-Asset Futures Carry (probe): a killed candidate

**Short title:** Commodity / Cross-Asset Futures Carry: killed

**Verdict:** KILLED  **Stage:** screen prototype  
**Identity:** `futcarry_xs`

Cross-sectional carry on 38 real futures (long backwardation / short contango, front-vs-next slope), 2010-2016 — the only window the term-structure marks support. GROSS Sharpe is already -0.17, so there is no edge for costs to erode; net -0.24, DSR 0.00, all six construction variants negative. The feed itself dies mid-2016 (one root keeps a next-contract mark), so it could not run live even if it worked. KILLED twice over.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | -0.2400 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
