# Short Interest / Days-to-Cover Deciles (probe): a killed candidate

**Short title:** Short interest and days-to-cover: killed

**Verdict:** KILLED  **Stage:** screen prototype  
**Identity:** `equity_short_interest_dtc`

The first genuinely NEW INPUT in months rather than another transformation of price and volume: bi-monthly FINRA short interest for the whole US tape, 2017-12-29..2026-07-15 (3,804,024 rows, 23,314 tickers), unlocked by the Polygon Starter upgrade and ingested in full. ONE pre-registered config, no sweep: long the bottom days-to-cover decile, short the top, dollar-neutral, PIT top-2000 by ADV, price >= $5, positions formed on settlement + 10 BUSINESS DAYS (FINRA disseminates ~8; the extra margin makes lookahead un-arguable) and held to the next availability date. *** CORRECTION 2026-08-05 — THE FIRST PUBLISHED NUMBERS FOR THIS ENTRY WERE WRONG. *** The probe computed returns as log(close).diff() on data/lake, which stores RAW AS-TRADED closes: not split- or dividend-adjusted. Every forward split therefore booked a catastrophic fake loss — AAPL 2020-08-31 as -135%, NVDA 2024-06-10 as -229%, TSLA 2022-08-25 as -110%. The bias was DIRECTIONAL, not noise: splits happen in high-priced mega-caps, mega-caps have enormous ADV, and days_to_cover = SI/ADV is therefore tiny for them, so every fake collapse sorted into the LONG (bottom-DTC) leg. The production feature engine refuses raw prices outright; this standalone probe bypassed that guard. Fixed in scripts/lib/px_adjust.py, which adjusts the RETURN series only and deliberately leaves price floors and ADV ranks on raw as-traded values (back-adjusting levels would introduce a look-ahead the raw panel does not have). Both affected probes were repaired in the same pass. WHAT CHANGED: gross Sharpe before any cost was published as -0.220 (full) and +0.002 (easy-to-borrow); corrected it is -0.062 (NW t -0.19) and +0.204 (NW t +0.66). The published claim that there was 'no edge for frictions to eat' was therefore FALSE — there is a small gross edge, it is simply not statistically established and it is entirely consumed by costs. The KILL STANDS but on different reasoning. Corrected net of 6bp one-way at 20x annual turnover, on the easy-to-borrow universe that is actually shortable: -0.026 / -0.228 / -0.792 at 50 / 300 / 1000 bp per year of borrow. The top days-to-cover decile IS the hard-to-borrow bucket, so the 50bp row describes a trade nobody can put on; at a realistic 300bp it is -0.228. Against the pre-registered rule it fails gate (b) Newey-West t >= 2 and gate (d) survives 300bp on easy-to-borrow, and passes (a) and (c). Correlation to the live book is -0.017, so the diversification arithmetic was favourable and it still did not matter — the same lesson as mechflow_tom: a near-zero bar lowers what a candidate must BEAT, never what it must PROVE. The sign is NOT flipped and re-tested, and the gates were NOT relaxed to admit it once the corrected numbers looked better; that is precisely the search a pre-registration exists to forbid. KILLED. Reproduce: scripts/ingest_short_interest.py then scripts/probe_short_interest.py.

## Why it was worth testing

This died at the screen stage, before a full walk-forward was ever run. Screening exists so that ideas which cannot clear a coarse, cost-aware bar do not consume the far more expensive machinery behind it. A screen kill is a cheap kill, and it is published for the same reason as an expensive one: the trial was still spent, and it still raises the evidence bar for everything already in the book.

## The result

| Measure | Value |
|---|---|
| Screen net Sharpe | 0.2040 |

## What this does and does not say

It says this configuration, on this data, net of the costs we charge, did not clear the bar it pre-registered. It does not say the underlying economic effect does not exist, that no implementation of it works, or that someone with different data or different execution would reach the same conclusion. A null is evidence about a test, not a proof about a market.

It also does not say the trial was free. Every hypothesis tested raises the deflated-Sharpe hurdle for every sleeve already in the book, including the ones that survived. That is why the kill count is published beside the survivor count rather than behind it.
