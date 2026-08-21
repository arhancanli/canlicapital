# Beta-Neutral Momentum Construction (campaign): a killed candidate

**Verdict:** KILLED  **Stage:** screen prototype  
**Identity:** `alphamax_betaneutral`

The premise was that a dollar-neutral momentum book carries hidden NEGATIVE market beta, so a junk rally hurts both legs at once. Measuring the premise first killed it. On the research panel (2005-2026) the book's mean rolling 63-day beta is -0.014 — essentially zero. On the LIVE book it is +0.319, and the LONG leg is the high-beta side (leg beta 1.932 long vs 1.238 short) — the opposite of the premise. The treatment is then regime-dependent with opposite signs: research net Sharpe 0.160 to 0.361 (bootstrap P(dSharpe<=0)=0.0225), LIVE 0.921 to 0.570 (P=0.938). It also barely touches the episode it was designed for — 0.2 points of a 9.5-point loss on research, 0.7 of 10.5 live — and it buys beta-neutrality by selling dollar-neutrality: net exposure runs to +/-34% of gross, which breaks the market-neutral mandate. Not adopted. 0 trial slots burned. Reproduce: scripts/probe_alphamax_betaneutral.py.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | 0.5700 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
