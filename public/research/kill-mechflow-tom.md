# Turn-of-Month / Rebalancing Flow (probe): a killed candidate

**Verdict:** KILLED  **Stage:** screen prototype  
**Identity:** `mechflow_tom`

The calendar flow is real — SPY earns 5.65bp/day in the last-1-plus-first-3 window vs 3.96bp outside, and the footprint replicates on QQQ — but monetized standalone it sits in cash 76% of days: net Sharpe 0.27, below buy-and-hold SPY (0.58) and the screen bar, DSR 0.035 across 43 configs. The 60/40 month-end rebalance-fade variant decayed negative after 2018. A real effect that is an execution tilt, not a sleeve. KILLED as standalone. RE-EXAMINED 2026-08-03 because that first reason was BAD ARITHMETIC: a candidate need not beat the book to improve it, only clear own_SR > rho x S_b. Re-tested as a diversifier on ONE pre-registered config (no sweep, so no search penalty). The reframe was right about correlation — rho to the live book is +0.010, dropping the bar to +0.006 — and it still fails: own Sharpe -0.56 over the book's own window, and over 25 years / 6,309 sessions the full-history Sharpe of +0.278 carries a Newey-West t of only +1.42, with no decade reaching t=2 (best +1.32). A near-zero bar lowers what you must BEAT, never what you must PROVE. Adding it hurt the book at every weight (-0.03 to -0.15), and 87-96% of that harm came from the mean, not from variance. KILLED on the correct bar — this one is final.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | 0.2700 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
