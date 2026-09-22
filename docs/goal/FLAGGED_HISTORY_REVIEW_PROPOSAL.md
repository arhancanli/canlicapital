# Flagged history review proposal (drafted September 22, 2026)

Status: decided. The owner chose option C on September 22, 2026; admissions v23
(156,714 indexable, 23,838 with notices) and v25 (556,677 indexable,
48,519 with notices) are rebuilt with the four named sets. No upload or production
change until each release activates. Counts come from the v24 selected-quality report
(`company-nine-cohort-selected-quality-v24-20260922.json`, delivery manifest
c1471479…) and a projection over the v25 discovery
(`artifacts/seo/company-v25-flagged-history-projection-20260922.json`).

## What is withheld today

The clean-set rule of September 21 withholds every history the selected-quality
audit flags. In v25 that is 57,533 histories (noindex, still served)
out of 296,819. By exact flag set:

| Flag set | Histories |
| --- | ---: |
| `historical_only` | 40,614 |
| `equal_numerical_vector` | 7,960 |
| `multiple_units` | 6,243 |
| `multiple_units+partially_historical_units` | 1,134 |
| `historical_only+multiple_units` | 765 |
| `equal_numerical_vector+historical_only` | 688 |
| `equal_numerical_vector+multiple_units` | 266 |
| `constant_per_unit+historical_only+zero_only` | 76 |
| `constant_per_unit+zero_only` | 70 |
| `constant_per_unit+equal_numerical_vector+zero_only` | 6 |
| `equal_numerical_vector+historical_only+multiple_units` | 6 |
| `equal_numerical_vector+multiple_units+partially_historical_units` | 4 |
| `constant_per_unit+historical_only` | 3 |

The audit's own definitions: historical = "Latest reporting end is earlier than capture date minus two calendar years; independently checked for each unit." equal_vector =
"Same company; all selected kind/unit/start/end/value tuples match after sorting. Filing date and accession are intentionally excluded." constant = "Every unit has one distinct numerical value across all selected observations."

## What the reader is shown

Each flag already has a notice on the rendered page. Quoted from staged v25 pages:

- `historical_only` (United States Natural Gas Fund, Operating expenses; the
  history ends 2022-12-31, captured 2026-09-20): "This selected history ends more than two years before capture. Do not treat its final value as a current balance or current annual result. More recent filings may use another accounting tag; inspect the filings before drawing conclusions about the company."
- `multiple_units` with `partially_historical_units` (New Horizon Aircraft,
  Current accounts payable; CAD to 2026-05-31, USD to 2023-12-31): "Coverage by original unit CAD : 2023-05-31 to 2026-05-31. USD : 2023-12-31 to 2023-12-31. This unit’s selected history ends more than two years before capture. These are separate reported series. A newer period in one unit does not update another unit’s history or establish a currency conversion."
- `equal_numerical_vector` (Highway Holdings, Basic earnings per share):
  "This selected numerical history matches Diluted earnings per share for the same reporting intervals and original units. The accounting definitions remain distinct. Equal values do not establish that the concepts are interchangeable or explain why they match; filing dates and accessions may differ. Compare the definitions and source filings before combining them."

## Proposed rule

A flagged history is admitted when its exact flag set is one the owner names,
because the page states that condition; every other flag set stays withheld. The
admission builder now takes `--admit-flags <set>` (sorted flag names joined by +)
and records the named sets and the count admitted through them in the admission
file, so the decision is visible in the pinned file, not only in this proposal.

Three candidate decisions, projected on v25 (base 508,158 indexable URLs):

| Option | Flag sets admitted | Indexable URLs | Added | Still withheld (flagged) |
| --- | --- | ---: | ---: | ---: |
| A | `historical_only` | 548,633 | 40,475 | 17,058 |
| B | `historical_only`, `multiple_units`, `multiple_units+partially_historical_units` | 555,928 | 47,770 | 9,763 |
| C | `historical_only`, `historical_only+multiple_units`, `multiple_units`, `multiple_units+partially_historical_units` | 556,677 | 48,519 | 9,014 |

Recommendation: option C. A history that ended more than two years before capture
is a complete, sourced record with its end date stated in the first paragraph of
its coverage section; a history reported in two currencies is two separate series
shown as separate rows with their own coverage. Neither is a defect in the data or
the page. Histories flagged equal_numerical_vector stay withheld: two pages of one
company carrying the same numbers are near-duplicates for a search engine even
though the accounting definitions differ, and admitting one of each pair needs a
per-pair choice. constant_per_unit and zero_only histories stay withheld as thin.

## What happens on a yes

1. Rebuild admission v25 with the named sets (`--admit-flags`), record the new
   SHA-256 in the activation and the counts in STATUS.md.
2. The same rule applies to the v23 admission if v23 activates first; otherwise
   only v25 carries it.
3. No page content changes. Withheld pages remain reachable and noindex.

## Not proposed

Editing notices to make more histories admissible, admitting equal-vector pairs
without a per-pair rule, or admitting constant or zero-only histories.
