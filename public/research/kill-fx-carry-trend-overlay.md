# FX Carry + Trend Overlay (the real construction): a killed candidate

**Short title:** FX Carry + Trend Overlay: killed

**Verdict:** KILLED  **Stage:** screen prototype
**Identity:** `fx_carry_trend_overlay`

The professional FX book: trend hedges carry's crashes. It screened at 0.32 — but the robustness stress-test killed it. The Sharpe SPIKED only at the exact threshold we picked by hand (a knob artifact, ~0.15 on either side); it died at realistic cost (25x turnover, 0.05 at 5bp); ALL the performance came from one post-2021 regime; and dropping JPY collapsed it to -0.07 — the entire 'edge' was the single short-JPY trade. Not a diversified premium. KILLED on robustness, before we built a thing.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | 0.3200 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
