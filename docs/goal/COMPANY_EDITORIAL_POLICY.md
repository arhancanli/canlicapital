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

## Current release queue

The current extended-v3 delivery contains1,968companies and52,408histories, with
6,705overlapping quality flags. This is the candidate described in STATUS.md;
the older two-cohort and separate third-cohort figures below are checkpoints,
not additional counts to sum or the current release inventory.

The fourth acquisition queue is still running. A frozen278-outcome snapshot has
177core-policy review candidates,70reproduced content exclusions and31HTTP404s.
Its214flagged histories and1,569potential core pages are partial diagnostics only;
they are neither extended-v3 staging nor editorial approval. The31HTTP404results
are retained acquisition outcomes, not independently captured not-found bodies.
See company-fourth-partial-review-20260920.json; remaining acquisition and review
must complete before constructing a coherent new release candidate.

## Earlier two-cohort checkpoint

The earlier two-cohort corpus retained 3,924 flagged histories; flags overlap. Its 169
matching-vector groups include 107 basic/diluted EPS pairs, 56 basic/diluted share
count pairs and six other pairs. Those two common relationships explain why
numeric equality is not sufficient evidence of duplicate meaning; they do not
explain each company's reported equality without inspecting its filings.

The other pairs are total/current liabilities (two companies), alternative revenue
tags (two), accounts payable/net property and equipment (one), and operating
expenses/selling-general-administrative expense (one). These six pairs were inspected against original filings on2026-09-20; see
COMPANY_PAIR_REVIEW.md and its bound receipt. Retain distinct concepts with comparison
context. This resolves equality-driven deduplication only; other review remains open.

No histories were dropped, source values edited or flags cleared in this change.
That checkpoint's quality queue is in company-combined-selected-quality-extended.json.
Useful archival histories may remain appropriate; thin standalone pages may need
consolidation after semantic review. Any such change must update catalog, links,
discovery and sitemap membership coherently and preserve downloadable evidence.

## Release boundary

Before production activation, require a reproducible selected-source corpus,
resolved editorial dispositions for the release scope, coherent catalog/download
roots, tested hosted storage, working error responses, accessible rendering,
discovery and canonical agreement, and the outstanding release decision. Record
staged, live, submitted and search-confirmed indexed counts separately.

## Third cohort review

The separate third cohort has 2,789 flagged histories across 766 companies. Its 98
matching groups comprise 62 EPS pairs, 30 share-count pairs, three total/current
asset pairs and three total/current liability pairs. The six total/current pairs
have now been inspected against their latest selected original filings; all 24
selected observations match distinct source rows. See COMPANY_PAIR_REVIEW.md and
company-third-pairs-filing-evidence.json. Retain separate concepts and comparison
links; the remaining historical, unit, constant-series and usefulness gates apply.

## Scope overrides numerical agreement

Constant-history review found three generic Revenues histories whose inspected
filing rows are intersegment sales/revenue after eliminations. Exact numerical
reproduction and undimensioned contexts did not make them company-wide revenue.
The extended-v2 candidate excludes these source-bound histories and explains the
omissions on company overviews. See COMPANY_REVENUE_SCOPE_REVIEW.md. Earlier
extended-v1 candidates remain reproducible evidence but are not publishable as-is.
Other constant and historical cases still require semantic/usefulness review.

## Extended-v3 consolidated dispositions

Latest-selected-accession comparison now covers all33 constant-history cases.
Twenty-one separate XBRL bundles match46 selected observations; the other12cases
have complete inline comparisons. Scope review supports eight source-bound
exclusions in extended-v3; it does not approve every historical observation or
remaining standalone page. Five histories describe intersegment revenue, two
qualified earnings/revenue disclosures cannot support generic revenue totals,
and one cash-equivalents-only disclosure cannot support combined cash balances.
See COMPANY_REVENUE_SCOPE_REVIEW.md. All other selected concepts and original SEC
bytes remain unchanged. The corrected quality queue still has6,705flags.

## Issuer context is necessary but insufficient

The later identity review matched137selected core values across13filings, yet
surrounding narrative revealed three Princeton revenue values belong to an
unconsolidated portfolio company. The filing uses Princeton's undimensioned
entity contexts. Before any future admission of that currently excluded issuer,
the affected concept must be omitted under a source-bound semantic disposition.
See COMPANY_IDENTITY_REVIEW.md. Do not use a matching CIK, number, unit or table row
in isolation as proof of company-wide measure scope. This applies to all review
queues, including those with no automatic flags.


Fourth-cohort v4 adds one source-bound exclusion: Liberty Star1172178
PaymentsToAcquirePropertyPlantAndEquipment. Its2021USD500fact is presented only
in the accounting-policy narrative, where the primary filing describes the
capitalization threshold, not annual purchases. Original instance, presentation,
label and calculation linkbases are captured and hash-verified. See
company-fourth-liberty-disposition-20260920.json and review-liberty-equipment-scope.py.
The prior held discrepancy and v3 remain reproducible; v3 is not publishable for
this cohort. Corrected v4 has683companies17,718histories and3,150overlapping flags.
The remaining26constant histories are zero-valued; numerical equality does not
establish their accounting scope or usefulness. Those reviews remain open.


Fourth-cohort v5 adds three source-bound exclusions: GHST1121795 combined cash
(the selected zero describes cash equivalents only, despite nonzero cash),
Nelnet1258602 Revenues (intersegment servicing eliminations), and Cooper-Standard
1320461 Revenues (intersegment sales eliminations). Original primary tables and
Nelnet/GHST label/presentation files establish the narrower meanings. See
company-fourth-zero-dispositions-20260920.json and review-fourth-zero-scope.py.
Exact-source replay removes only these three histories and preserves all others.
V4 remains reproducible but is not publishable for this cohort. V5 delivery
contains683companies17,715histories; new delivery measurements remain due.


Fourth-cohort v6 additionally excludes NOVAGOLD1173420 Revenues. The hidden inline
zero fact c441 is directly referenced by visible CSS -sec-ix-hidden:c441 on the
word "no" in the statement about no realized revenues from its principal asset,
Donlin Gold. That narrower claim cannot establish a company-wide total. This is
an exclusion for unsupported scope, not a claim that actual total revenue is
nonzero. Source-bound replay removes only this concept and preserves all others;
v5remains reproducible but is not publishable for this cohort. See
company-fourth-novagold-disposition-20260920.json and review-novagold-revenue-scope.py.

## Historical review queue for the corrected fourth cohort

The v6priority queue contains50concepts across26companies and31latest filings.
`prepare-company-history-review.py` expands those exact selected records into
185distinct filings and430observations.154filings are additional to the latest
queue;320observations use earlier accessions. Both latest and earlier entries
remain pending numerical, scope and usefulness review in this new queue. Prior
latest-filing findings remain separate evidence, not automatic all-history approval.

The queue binds the delivery manifest, priority report, selected object hashes,
source identities and generating code. Latest observations must reproduce before
expansion. Deterministic replay, an independent observation count and rejection
of altered manifest/source/observation bindings and duplicate concepts passed.
See `artifacts/seo/company-fourth-history-review-targets-v6.json`. This queue
covers priority concepts only; remaining concepts and flags still need review.

## Fifth cohort: numerical matches and an unresolved publication hold

Fifth-v6priority review includes55concepts from29companies across31filings. All
111selected latest-accession values reproduce:50inline and61from19original XBRL
instances. This does not establish accounting scope, all-history correctness or
usefulness. The quality queue has3,302flagged histories,33constant and32zero.

Livento1593549 Revenues is held. Its2025filing tags2,000,000 for2023and2021 in a
paragraph explicitly describing revenue from real-estate sales; a separate table
has a different2023revenue row. `review-livento-revenue-scope.py` binds the targets,
capture, numerical comparison, original body, fact IDs and visible context. The
2022accession is not reviewed by this disposition. Original numbers are unchanged.
Apply a source-bound exclusion before publication and preserve v6for reproduction;
it is not publishable as-is. No alternative revenue number is substituted.

## Fifth cohort v7 correction

V7inherits all earlier exclusions and omits Livento1593549 Revenues only for the
reviewed source5fc0541d3c667e8542c70da83b7f948b0510c21c26e4337ace0bb00d828406b9.
A changed source requires renewed review. The original hold and v6are preserved.
The company page explains the exclusion and links the original filing; the
mis-scoped history route returns404. Full672company transition comparison verifies
one removed concept, unchanged remaining selected values and unchanged original
source descriptors. No substitute value or altered source fact.

Corrected candidate17,230histories/17,916URLs passes complete local delivery and
72browser checks; this does not approve the remaining3,301flagged histories.

## Fifth cohort v8: three additional unsupported zero totals

Eaton1551182 Revenues is labeled major-customer revenue; the original primary
filing states no customer exceeded10%of sales and reports nonzero net sales.
Annovis1477845 tags the word “no” inside “not generated substantial revenues”;
that materiality qualification does not establish a zero total. Minerva1598646
tags no revenue from product sales, which does not establish total revenue from
contracts with customers. The latter two do not imply actual total revenue is
nonzero. Source-bound dispositions and original XBRL numerical matches are in
company-fifth-zero-dispositions-20260920.json, reproduced by review-fifth-zero-scope.py.

Immutable v8inherits v7and excludes only these three exact source/tag bindings.
Changed sources require renewed review. Full672company transition proves every
other selected value and original source descriptor unchanged. Corrected candidate
has17,227histories; broader quality review remains open.

## Nika unresolved revenue scope — extended-v9

CIK0001145604, us-gaap Revenues, exact source
72455d4e19d0f82286a99d0fa349659ab1ab793431c0cac82c5fb18286c89242:
the latest selected filing tags “no” in a no-income narrative. Its other revenue
statement is qualified by covering operating costs. The source does not
unambiguously establish the intended total-revenue interpretation. V9withholds
this history and explains the omission while retaining the raw data. No replacement
value or nonzero-revenue assertion is made.

Review script/report: review-nika-revenue-scope.py and
company-nika-revenue-scope-20260920.json. Exact source changes require renewed
review. Earlier policies remain reproducible; the fourth cohort v9transition
changes only this concept across all683companies. Remaining histories still
require their outstanding editorial/usefulness checks.
