# Review of six unusual matching-history pairs

Reviewed by Codex on 2026-09-20. Decision: retain the separate accounting concepts
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
