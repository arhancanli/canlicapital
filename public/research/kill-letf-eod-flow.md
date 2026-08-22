# Leveraged-ETF End-of-Day Forced-Rebalance Flow (probe): a killed candidate

**Short title:** Leveraged-ETF end-of-day flow: killed

**Verdict:** KILLED  **Stage:** screen prototype  
**Identity:** `letf_eod_flow`

Leveraged ETFs MUST trade into the close (~$277B QQQ-family rebalance multiplier, ~$4B/day estimated flow) — a real, large, mechanical flow. But it is NOT tradeable on 2021-2026 data: no continuation into the close (+0.58 bps per 1-sigma flow, t=0.93), no overnight reversal, and all six strategy cells lose net of costs (best cell Sharpe -1.41). The ~0.6bp effect is ~6x below the 12bp round-trip cost floor — no cost assumption rescues it. The pre-2019 literature edge appears arbitraged away at the granularity free data sees. KILLED at screen.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | -1.4100 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
