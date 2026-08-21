# AlphaMax Short-Leg Margin Floor (disclosure, not a strategy): a killed candidate

**Verdict:** KILLED  **Stage:** screen prototype  
**Identity:** `alphamax_short_margin_floor`

A disclosure against our own published number rather than a tested idea. The equity sleeve's backtest has never modelled the broker's $5.00-per-share short maintenance requirement, which is charged per share regardless of account size — so shorting an $8 stock ties up roughly 62% of its market value in margin at ANY capital level. Applying an honest $17 short-leg price floor costs -0.112 net Sharpe (2015-2026, point-in-time prices from our own lake, so no snapshot bias). Part of the published edge lives in cheap shorts that are permanently margin-inefficient. We are publishing the haircut rather than the flattering number. Separately: a borrow-availability filter appeared to cost a further -0.225, but that estimate is CONFOUNDED — it applies a current broker snapshot to eleven years of history, which silently excludes every delisted name, and delisted names are exactly where short alpha concentrates. Measuring it honestly needs point-in-time borrow data we do not have, so we report it as UNKNOWN rather than publish a number we cannot defend. The current live short book is 92 of 94 names borrowable.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | -0.1120 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
