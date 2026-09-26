# Review of six unusual matching-history pairs

Reviewed on 2026-09-20. Decision: retain the separate accounting concepts
and their comparison links. Do not alias, redirect or canonicalize them together
solely because their selected numerical vectors match. This resolves the equality
question for these six pairs, not every quality flag or production approval.

| Company / CIK | Pair | Evidence inspected | Disposition |
|---|---|---|---|
| 3M / 0000066740 | Customer-contract revenue / Revenues | Latest selected 10-K: total-company revenue table and net sales; six selected observations match. The captured history also has different filing vintages for 2021 and 2017 between the two tags. | Retain separate definitions and availability dates. |
| CONMED / 0000816956 | Customer-contract revenue / Revenues | Latest selected 10-K: disaggregated contract-sales note and net-sales row; six selected observations match. | Retain distinct accounting definitions and source presentation. |
| Caro / 0001678105 | Total / current liabilities | Latest selected 10-K: separate total and current rows; four selected observations match. | Retain total/current distinction; do not infer equality outside selected periods. |
| Eventiko / 0001816554 | Accounts payable / net property and equipment | Latest selected 10-K: four zero observations match separate rows. The 2024 10-K separately reports both at $11,000 for 2023 and zero for 2024; fixed assets are described as website development. | Retain liability/asset distinction. No selector-created duplication was found. |
| Birdie Win / 0001873213 | Total / current liabilities | Latest selected 10-K: separate total and current rows; four selected observations match. | Retain total/current distinction. |
| Birdie Win / 0001873213 | Operating / selling-general-administrative expenses | Latest selected 10-K: total operating expense and general-administrative rows; four selected observations match. | Retain distinct expense definitions; no claim that they always coincide. |

## Evidence and limits

`artifacts/seo/company-exceptional-pairs-filing-evidence.json` binds the delivery,
selected records, original SEC response hashes, filing URLs and captured bytes.
It records 28 matched selected observations from the latest selected accession for
each pair, plus four inline facts from Eventiko's 2024 filing. These overlap in
period coverage; do not add them as 32 distinct accounting periods.

Capture receipts and bodies are in ignored
`artifacts/seo/corpus-local/editorial-filings/`; six unique primary filings and
six indexes were captured. Inspection scripts are preserved there with hashes in
the receipt. Bodies must be included in the separate durable source-evidence
backup; the runtime storage plan does not include this new review material.

The comparison excludes dimensional and nil facts and applies inline scale and
sign for the decimal/zero formats encountered. It binds context start/end and unit
before comparing values. Full selected records were separately replayed from
captured companyfacts bytes. This is not a general-purpose XBRL validator, a full
historical filing audit, an audit opinion, or independent human replication.

The web reader could not open the initial Eventiko index. A Python request for
the 3M index returned403; a subsequent ordinary Node fetch with the existing
research user-agent returned200. The successful captures and initial failure are
recorded; no failure is represented as inspected filing evidence.

No source facts or accounting definitions changed. The automated quality report
still includes these numerical-equality flags; this document and its bound receipt
supply their editorial disposition separately. Remaining historical-coverage,
unit, constant-series and standalone-usefulness decisions stay open.

## Third cohort: six additional pairs

Reviewed on 2026-09-20. The same retain-separate-concepts decision applies
to the following pairs. All 24 selected observations in the inspected accessions
match the original filing's undimensioned facts, including entity identifier,
reporting date, unit, scale and sign. This is a latest-selected-accession review,
not an audit of every historical filing.

| Company / CIK | Pairs | Source observation |
|---|---|---|
| Gold Rock / 0000894501 | Total/current assets; total/current liabilities | The 2025 10-K has distinct total and current rows with equal amounts for 2025 and 2024. |
| Global Technologies / 0000932021 | Total/current liabilities | The 2025 10-K has separate total and current rows. Its restatement note also contains scenario-specific values; those dimensional contexts are excluded from the consolidated comparison. |
| Atlantica / 0001062506 | Total/current assets; total/current liabilities | The 2025 10-K reports separate zero asset rows and equal total/current liability rows for 2025 and 2024. Reported asset zeros are not missing-value substitutions. |
| Visium / 0001082733 | Total/current assets | The 2025 10-K has distinct total and current asset rows with equal values for 2025 and 2024. |

Evidence: `artifacts/seo/company-third-pairs-filing-evidence.json` binds the selected
records, delivery manifest, all eight captured index/primary bodies, and inspection
scripts. The retained raw sources and scripts are in ignored
`artifacts/seo/corpus-local/editorial-third-filings/`. They require inclusion in
updated durable evidence packaging; the earlier sealed archive excludes them.
The web reader could access Visium's index but not the other three; direct ordinary
Node captures returned 200 for all eight bodies. No fetch failure was treated as
filing evidence. Quality flags remain in the automated queue.
