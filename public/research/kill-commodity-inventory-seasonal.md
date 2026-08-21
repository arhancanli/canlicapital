# EIA Petroleum Inventory Scarcity: a killed candidate

**Verdict:** KILLED  **Stage:** research gauntlet  
**Identity:** `commodity_inventory_seasonal`

One pre-registered configuration on 782 accepted official EIA WPSR first-release Table 4 vintages, 2016-2026 OOS: commercial crude excluding SPR mapped to USO and total gasoline mapped to UGA, five-year same-week seasonal expectation, trailing 52-release surprise scale, next-session-open entry, DBC beta hedge and explicit one-way costs. One of 783 discovered releases was quarantined for a published arithmetic contradiction. The sleeve was exceptionally orthogonal (average correlation +0.0002, maximum pair +0.0321) and controlled DBC beta (-0.014), but there was no return edge: net Sharpe -0.589, Newey-West t -1.84, DSR effectively zero, max drawdown -41.1%, and Sharpe at 2x costs -0.998. USO and UGA standalone Sharpes were both negative. The fixed 10% book check improved by 0.058 only on the short common window, but failed after mean-centering and failed one of four leave-one-year-out checks. UGA constrained fifth-percentile proxy capacity to about $14.9k at 1% ADV. The sign is not inverted and no threshold is retuned. Full curve, scores, weights and result are preserved in artifacts/probe/eia_petroleum_inventory/. KILLED.

## Why it was worth testing

This ran the full pre-registered research gauntlet: a locked configuration, point-in-time data, costs charged, and pass/fail criteria fixed in writing before the result existed. Nothing about the specification was changed after the number arrived. That discipline is what makes the null trustworthy, and it is also what makes it final -- there is no version of this candidate that was 'nearly' admitted.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | -0.5890 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
