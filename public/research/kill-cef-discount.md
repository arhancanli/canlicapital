# Closed-End-Fund Deep-Discount + Activist Catalyst (probe): a killed candidate

**Short title:** Closed-End-Fund Deep-Discount + Activist Catalyst: killed

**Verdict:** KILLED  **Stage:** screen prototype
**Identity:** `cef_discount`

The five-decade anomaly is REAL in free data and we could see it: entry-cohort funds genuinely narrow their discount versus the universe (+1.17pts at 4w t=5.4, +1.26 at 13w t=7.2, +1.39 at 26w). It still fails on economics — the convergence is too slow for its toll. Hedged net Sharpe -0.088 (-0.82 price-only) against a 0.5 gate: ~12.8%/wk turnover at 41bp one-way (6bp + half the 0.7% median CEF spread) hands back the ~1.3pt/quarter the discount closes. Two further honest notes: today's entry watchlist is EMPTY (0 of 328 funds qualify — the 2024-26 activist wave already closed sector discounts to multi-year tights), and the discount screen and the activist catalyst are nearly disjoint books (4.9% overlap), so the documented live-capital story is the CATALYST trade, not the one we screened. A pre-registered, hash-locked FORWARD experiment is now accruing point-in-time data toward a single-look evaluation in 2027. Reproduce: scripts/probe_cef_discount.py.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | -0.0880 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
