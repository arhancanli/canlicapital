# Corporate Equity Supply (Net Issuance): a killed candidate

**Short title:** Corporate Equity Supply (Net Issuance): killed

**Verdict:** KILLED  **Stage:** deployed gauntlet
**Identity:** `eq_net_issuance`

The broad corporate-equity-supply identity was run through the deployed-path walk-forward on a point-in-time Sharadar research lake: long firms shrinking split-adjusted basic shares and short firms expanding them, rebalanced every 63 sessions. The latest sealed sweep was decisively negative: net Sharpe -0.311, DSR 0.000102 after six trials, and max drawdown -37.1%. A separate source-correct full-window rerun scored +0.148 with -17.5% max drawdown, still below the 0.40 gate; the sign and magnitude instability across data paths is itself a failure, not a result to select around. Three distinct historical configurations remain charged to the same corporate-equity-supply family. A proposed completed-flow measurement may continue data-feasibility work only as a same-family refinement and cannot count as independent sleeve breadth. No sign flip, window selection, or trial reset is authorized. Evidence: artifacts/sweep/gauntlet_eq_net_issuance/walkforward.json, artifacts/analysis/null_fundamentals_rerun/result.json, and artifacts/feasibility/repurchase_issuance_flow/identity_overlap_audit.json. KILLED.

## Why it was worth testing

This one reached deployment before it was killed, which makes it the most expensive kind of kill and the most important to publish in full. A candidate that passed on the evidence available at the time and failed on better evidence later is not a process failure to be hidden; refusing to withdraw it would be.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | -0.3110 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
