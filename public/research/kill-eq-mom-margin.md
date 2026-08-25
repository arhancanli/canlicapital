# Equity Momentum (with Margin Costs): a killed candidate

**Short title:** Equity Momentum (with Margin Costs): killed

**Verdict:** KILLED
**Test window:** 2023-07-06 to 2026-06-01
**Identity:** `eq_mom_margin`

Margin financing costs erode the momentum edge below the frozen k30_dn_63 baseline. Variant killed per pre-registration; the clean h=63 sleeve is the deployed one.

## Why it was worth testing

This tested one specific construction choice inside the momentum family. Construction variants are the cheapest possible trials and therefore the most dangerous: they are easy to generate in bulk, they are highly correlated with each other and with the sleeve already deployed, and every one of them raises the deflation hurdle for the whole book. The prior was that it would fail, and it was pre-registered anyway so the failure would be recorded rather than quietly abandoned.

## The result

| Measure | Value |
|---|---|
| Net Sharpe | -0.5920 |
| Annualized return | -4.46% |
| Total return | -12.42% |
| Annualized volatility | 10.33% |
| Maximum drawdown | -15.07% |
| Annualized turnover | 7.60 |
| Trading days | 729 |
| Final equity (USD) | 87,575.57 |
| Fees paid (USD) | 144.29 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
