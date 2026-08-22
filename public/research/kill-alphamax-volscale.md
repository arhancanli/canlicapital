# Vol-Scaled / Crash-Protected Momentum overlay (campaign): a killed candidate

**Short title:** Vol-scaled crash-protected momentum: killed

**Verdict:** KILLED  **Stage:** screen prototype  
**Identity:** `alphamax_volscale`

Barroso-Santa-Clara constant-vol and Daniel-Moskowitz variance/dynamic scaling applied to the live AlphaMax sleeve. On the canonical window it HURTS (net Sharpe 0.87 vs the sleeve's own 0.91, maxDD worse by 1.3-3.1pts); incremental alpha over the book-level vol target the engine already runs is statistically zero in all 5 configs (t -1.64 to +0.81, overlay-scale correlation 0.54-0.66 to the engine's own rule). The insurance is already owned; buying it twice costs money. KILLED.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | 0.8700 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
