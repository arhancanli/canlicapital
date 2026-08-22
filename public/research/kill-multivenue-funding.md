# Crypto Multi-Venue Funding Aggregation (probe): a killed candidate

**Short title:** Crypto multi-venue funding: killed

**Verdict:** KILLED  **Stage:** screen prototype  
**Identity:** `multivenue_funding`

Would aggregating funding across exchanges beat our Binance-only carry signal? No — null by its own pre-registered rule (promote required +0.10 Sharpe at 90% bootstrap confidence). The reason is structural: Binance and Bybit annualized funding are 0.94 correlated across 12,425 instrument-weeks, so there is almost no independent information to aggregate. The adjacent 'harvest on the best-paying venue' idea dies on arithmetic too — a median cross-venue gap of ~2.4%/yr against a four-legged ~30bp round trip implies a 22-day breakeven hold, marginal before you even price second-tier venue custody risk. The live sleeve stays Binance-only on its blessed config. Byproduct kept: a multi-exchange funding lake (Bybit deep history via mirror; OKX public history is depth-capped at ~90 days, a data finding worth recording). Reproduce: scripts/probe_multivenue_funding.py.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | not separately measured |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
