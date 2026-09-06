# Equity Value (Book-to-Price): a killed candidate

**Short title:** Equity Value (Book-to-Price): killed

**Verdict:** KILLED  
**Test window:** 2022-07-05 to 2026-06-01  
**Identity:** `eq_value_btp`

Value premium inverted across the 2022-2026 window. Net Sharpe below the 0.30 gate; the narrow top-200 universe is too small for the small/mid-cap value signal. KILLED.

## Why it was worth testing

Value is the oldest documented cross-sectional effect in equities and the one most likely to be already in the price. The question was never whether cheap stocks have outperformed at some point in history; it is whether a mechanical, point-in-time implementation still clears its own trading costs on a universe that includes the companies that went to zero.

## The result

| Measure | Value |
|---|---|
| Net Sharpe | -0.3219 |
| Annualized return | -1.60% |
| Total return | -6.11% |
| Annualized volatility | 6.61% |
| Maximum drawdown | -12.23% |
| Annualized turnover | 3.48 |
| Trading days | 981 |
| Final equity (USD) | 93,892.50 |
| Fees paid (USD) | 89.46 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
