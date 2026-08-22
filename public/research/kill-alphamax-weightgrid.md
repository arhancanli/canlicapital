# Weighting x Breadth Construction Grid (campaign): a killed candidate

**Short title:** Weighting x Breadth Construction Grid: killed

**Verdict:** KILLED  **Stage:** screen prototype  
**Identity:** `alphamax_weightgrid`

Four weightings (inverse-vol, equal, signal-proportional, vol-capped) crossed with four breadths (K=30/50/100/200), 2005-2026, live cell inverse-vol K=100. Net Sharpes span -0.293 to +0.066 against the live cell's -0.062 on the same harness (this is the deep-history panel, where the deployed 2023+ sleeve's 0.91 does not apply). Four of the 15 challenger cells individually cleared the 90% paired bootstrap — but the bootstrap's own dSharpe intervals imply those cells are 0.97 to 1.00 correlated with the live cell, so four passes is about the chance expectation for a family of near-copies, not evidence. The family-wise White Reality Check over the whole grid returns p=0.315: the best cell (signal-proportional K=50, dSharpe +0.128) is indistinguishable from luck. That family-wise gate was pre-registered precisely so the best cell could not be harvested. Zero cells adoptable; keep inverse-vol K=100. 0 trial slots burned. Reproduce: scripts/probe_alphamax_weighting.py.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | 0.0660 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
