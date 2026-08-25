# Short-Leg Tail Controls (campaign): a killed candidate

**Short title:** Short-Leg Tail Controls (campaign): killed

**Verdict:** KILLED  **Stage:** screen prototype
**Identity:** `alphamax_shorttail`

Nine construction-side short-leg controls (per-name stop-outs at 30/50/100%, gross caps at 1.25x/1.5x/2.0x, short-leg vol targeting, with and without dollar-neutral restore). Killed by attribution rather than by Sharpe. In the July 2026 episode the baseline lost 4.98%, of which the LONG leg contributed 3.61 and the SHORT leg 1.34 — the short leg is 27% of the damage. The squeeze narrative is real (ALIT +88% split-adjusted, RPD +61%) but it is the minority of the loss; the larger driver was the momentum long complex selling off. A control that drove short-leg P&L to exactly zero still could not have fixed the episode. The actual controls recovered 0.02 to 0.77 points of the 4.98 (two of the nine made it worse) with within-episode drawdown unchanged: 5.49% baseline vs 5.33% to 5.57% across the nine. Four controls cleared the pre-registered gate on full-sample numbers and all four fail the beta filter — the best (short-leg vol target, net Sharpe 0.121 vs the baseline's -0.102 on the 2005-2026 panel) buys its gain with market beta, not alpha: beta t=16.4, alpha t=-0.14. Nothing adopted. 0 trial slots burned. Reproduce: scripts/probe_alphamax_shorttail.py.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | 0.1210 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
