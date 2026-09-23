# Next page families after v27

Status: proposal for an owner decision. Nothing here captures, builds, admits or
indexes a page. Numbers come from `company-v27-withheld-flag-sets-20260923.json`
and `company-v27-period-family-quantification-20260923.json` (both derived from the
v27 delivery and quality summary; release 389ae2ca…).

## Where the candidate set stands

v26 is live with 813,892 indexable company URLs; v27 is staged with 916,208
(12,738 overviews, 498,608 histories, 256 directories, 12,715 filing indexes,
391,891 filing pages). The release covers 12,753 of the 20,390 entities in the SEC
company-facts archive of September 19; 16,163 entities meet the discovery rules
(annual or quarterly forms, at least four of the 72 concepts, filed on or after
2009-01-01) and every one of them has been queued, captured and reviewed; 3,410 of
those were excluded at review (coverage failures), not found at the SEC or are
pending. The other 4,227 entities fail the rules and are not a family: below four
concepts a page cannot carry a stated series.

The goal is 800,000 indexed pages with 1,000,000 as the target. Google-indexed
counts are measured in Search Console after each activation and are not the
numbers above.

## Family A — equal-vector representatives (small, closes the flag review)

14,629 flagged histories are outside the admitted flag sets after the option C
decision (the admission counts 14,564 of them as withheld for flags; 65 belong to
the 15 pending-review companies). 14,208 of them sit in 7,039 equal-vector groups:
two or more concepts of the same company whose selected observations are identical
(EarningsPerShareBasic = EarningsPerShareDiluted (2,552);
WeightedAverageNumberOfDilutedSharesOutstanding =
WeightedAverageNumberOfSharesOutstandingBasic (1,780); NetIncomeLoss = ProfitLoss
(550); FiniteLivedIntangibleAssetsNet = IntangibleAssetsNetExcludingGoodwill
(436); Liabilities = LiabilitiesCurrent (275);
IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest
= NetIncomeLoss (179)). These are true facts about the company (no dilution, no
non-controlling interest, no long-term liabilities), not capture errors. The other
421 withheld pages are constant or zero-only series and stay withheld.

Rule: in each group the representative is the member concept with the most
histories across the release (ties by tag order); the representative is admitted
with a stated-condition notice naming the concepts that report the same values;
every other member is served with a canonical link to the representative, no
noindex, and stays out of the sitemap (a canonical and a noindex on the same page
contradict each other). Groups whose representative is itself constant or
zero-only (17) and groups in withheld companies (32) stay withheld.

Adds 6,990 indexable URLs; 7,115 pages gain a canonical target.
Code: a `canonical_to` state in the admission builder, activation and renderer; the
notice text; tests for the three states; verify script; no new capture.

## Family B — annual reporting-period pages (the route past 1,000,000)

A period page is one company and one fiscal-year end date: every selected concept
observed for that period end (instants at the date, durations ending there), the
value each filing reported for it with its accession, and links to the history
page of each concept and to the filing pages. It answers the query a filing page
does not (“what did the company report for the year ended 2024-05-31” across
filings, including restated values) and a history page does not (one period across
concepts). The delivered data holds 148,024 annual period ends; 121,452 carry at
least four concepts, 118,784 at least eight, 103,185 at least twenty. The floor of
eight concepts is proposed: pages are either full or nearly empty, and eight rows
is the least a page needs to stand on its own.

Year profile at the four-concept floor: 2019 6,974, 2020 7,033, 2021 7,250, 2022
7,269, 2023 6,906, 2024 6,230, 2025 5,566, 2026 622. Quarterly periods: 0 — the
selected data carries annual observations only, so a quarterly family would need a
new selection policy and capture, and is not proposed.

Adds 118,784 indexable URLs under `/companies/{cik}/periods/{end}`; with family A
the candidate set reaches 1,041,982 (916,208 + 118,784 + 6,990). No SEC capture:
the family is built from the delivered bytes, as the filing family was.

Code, in the order of the filing family: renderer + catalog (`period` documents
built per company, gzip, `catalog/` namespace), routes, admission (period pages
follow their company; withheld companies withhold their periods), activation pin,
verify script, HTTP audit, storage plan, hosted checks; then v28 = v27 + A + B.

## What is not proposed

- Cross-company comparison pages: combinatorial and thin; doorway risk.
- Concept hub pages (72): built later as navigation, not as an indexing family.
- Quarterly periods: needs a new capture policy (see above).

## Recommendation

Build B first (it is the larger lever and reuses the filing-family pattern), fold
A into the same release as a small rule change, and activate as v28 after v27 is
live and its Search Console reading is recorded. Order of work: B renderer and
catalog → routes and tests → A rule → admission v28 → verify → HTTP audit →
storage upload of the period objects → hosted checks → activation.

Decision requested: go / no-go on A, on B, and on the eight-concept floor.
