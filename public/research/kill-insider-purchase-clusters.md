# Clustered Insider Open-Market Purchases: a killed candidate

**Short title:** Clustered Insider Open-Market Purchases: killed

**Verdict:** KILLED  **Stage:** research gauntlet
**Identity:** `insider_purchase_clusters`

One pre-registered configuration on official SEC Form 4 purchases, 2016-2026: at least two officers/directors and $100k purchased inside 30 calendar days, filing date plus two sessions, next-open entry, full 63-session hold, trailing-ADV eligibility, SPY beta hedge and explicit one-way costs. The current replay scheduled 3,541 non-overlapping events and was genuinely orthogonal (average correlation -0.066, maximum pair +0.057), controlled beta (+0.046), and cleared the $5M capacity gate ($5.31M fifth-percentile AUM at 1% ADV). But there was no return edge: net Sharpe -0.232, Newey-West t -0.75, DSR 1.83e-07, max drawdown -24.8%, and Sharpe at 2x costs -0.285. A fixed 10% sleeve changed combined-book Sharpe by -0.093 and failed 4 of 4 leave-one-year-out checks. A pre-publication audit corrected weighted log-return aggregation to the canonical simple-return contract; preliminary Sharpe was -0.993 and the corrected verdict remained KILL. The immutable first corrected measurement has 2,669 observations and population-std Sharpe -0.243; the current lake adds 5 sessions, so it is explicitly an OOS extension, not an exact reproduction, and the identity packet remains incomplete. The sign is not inverted and no threshold is retuned. Full curve, event ledger, weights, input lineage and result are preserved in artifacts/probe/insider_purchase_clusters/. KILLED.

## Why it was worth testing

This ran the full pre-registered research gauntlet: a locked configuration, point-in-time data, costs charged, and pass/fail criteria fixed in writing before the result existed. Nothing about the specification was changed after the number arrived. That discipline is what makes the null trustworthy, and it is also what makes it final -- there is no version of this candidate that was 'nearly' admitted.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | -0.2320 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
