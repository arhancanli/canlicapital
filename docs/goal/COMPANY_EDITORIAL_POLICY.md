# Company-history editorial policy

Status: implemented disclosures with release review still open, 2026-09-20.
Applies to the selected accounting-history corpus; it does not approve production
publication or count any page as indexed. Quality takes precedence over page count.

## Decisions by condition

| Condition | Required treatment | Remaining release evidence |
|---|---|---|
| Reporting coverage ends more than two years before capture | Keep the reporting dates visible and explicitly identify historical coverage. Never infer issuer inactivity or a current balance. | Check important current-intent pages against newer filings or other tags; historical intent must be clear. |
| Multiple original units | Keep separate series and latest observations for every unit; disclose each unit's coverage. No conversion or joining across units. | Review units that appear inconsistent with the accounting concept. |
| Constant or reported-zero history | State the value, unit and count of distinct reporting ends on the history page. Explain that reported zeros are not missing-data substitutions. | Establish whether a standalone page is useful; a disclosure alone does not justify an indexable page. |
| Same numerical history under different tags | Link the matching histories and explain that accounting meaning and filing vintages can differ. Preserve separate definitions and source links. | Review unexpected pairs and search intent; no automatic alias, redirect or canonical consolidation based on numbers alone. |
| No automatic flags | Keep provenance, reporting dates, definitions and developer downloads. | Still requires source, usefulness, accessibility and release checks. Absence of flags is not approval. |

Matching histories means equality of all selected kind, unit, interval start,
interval end and numerical value tuples within one company, independent of order.
Filing dates and accessions are excluded from this comparison and remain in the
source tables. Different durations or currencies cannot produce a match. Constant
notes require at least two distinct reporting ends within the same unit.

The renderer and the selected-quality audit share the same numeric-history key.
The audit reproduces selected records from original captured SEC bytes before
measuring them. Browser checks cover real equal-history and reported-zero pages,
including the comparison link, as well as existing layout and provenance samples.

## Current queue

The combined corpus retains 3,924 flagged histories; flags overlap. Its 169
matching-vector groups include 107 basic/diluted EPS pairs, 56 basic/diluted share
count pairs and six other pairs. Those two common relationships explain why
numeric equality is not sufficient evidence of duplicate meaning; they do not
explain each company's reported equality without inspecting its filings.

The other pairs are total/current liabilities (two companies), alternative revenue
tags (two), accounts payable/net property and equipment (one), and operating
expenses/selling-general-administrative expense (one). Keep these in the review
queue. Neither a plausible relationship nor an unusual match proves an error.

No histories were dropped, source values edited or flags cleared in this change.
The unchanged quality queue is in company-combined-selected-quality-extended.json.
Useful archival histories may remain appropriate; thin standalone pages may need
consolidation after semantic review. Any such change must update catalog, links,
discovery and sitemap membership coherently and preserve downloadable evidence.

## Release boundary

Before production activation, require a reproducible selected-source corpus,
resolved editorial dispositions for the release scope, coherent catalog/download
roots, tested hosted storage, working error responses, accessible rendering,
discovery and canonical agreement, and the outstanding release decision. Record
staged, live, submitted and search-confirmed indexed counts separately.
