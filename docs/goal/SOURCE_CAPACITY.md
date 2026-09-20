# Source capacity and the indexing goal

The current ticker-discovery universe cannot meet the owner's minimum800,000
indexed-page goal under the34-concept company-history design. This is a structural
limit, not a forecast that even the upper bound will be useful or indexed.

Reproduce with `node scripts/audit-company-source-capacity.mjs`. The audit pins its
input hashes, verifies the discovery snapshot against the queue receipt, checks
all1,968selected-object hashes and concept names, and reconciles selected histories
with the v3release. Output: `artifacts/seo/company-source-capacity-20260920.json`.

| Measure | Count |
| --- | ---: |
| Distinct CIKs in pinned ticker discovery | 8,031 |
| Admitted companies | 1,968 |
| Admitted CIKs outside ticker discovery | 5 |
| Previously attempted, not admitted | 381 |
| Unqueued discovered CIKs | 5,687 |
| Supported accounting concepts | 34 |
| Current company-family candidate URLs | 54,416 |
| All8,036known entities, all concepts, ignoring prior exclusions | 281,421 |
| Current selections/exclusions retained; every remaining entity gets all concepts | 253,575 |

The constrained ceiling is1,968existing overviews +52,408existing histories +
5,687×35possible overview/history pages +154directory pages. It is546,425short of
800,000and746,425short of1million before counting other content families. The
other current static pages are too few to close this gap. Actual qualification
and indexing will be lower than a scenario that assumes every remaining entity
has every concept. Directory pagination stays50companies; no arbitrary keyword,
year, unit or ticker permutations are counted.

## Acquisition work required

1. Complete editorial review and hosted verification of the existing54,416URL
   candidate. More collection does not repair unreviewed content or establish
   a working production release.
2. Expand issuer discovery beyond the pinned ticker file using independently
   captured filing/issuer inventories. Reconcile CIKs, former names, unavailable
   records and prior nonadmissions before creating acquisition queues.
3. SEC's official API documentation identifies bulk companyfacts and submissions
   archives as the efficient source for broader API data. Inventory such a capture
   before estimating eligible issuer counts; do not assume that former issuers,
   IFRS-only entities or filing records qualify under the current US-GAAP policy.
4. Any new content family needs a distinct reader task, authoritative source,
   stable identity, semantic review, useful content and maintenance rules. Filing
   analysis or other market-reference families are candidates for evaluation,
   not approved pages or proven capacity. Keep the numerical goal unchanged.

Source: [SEC EDGAR API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces),
read2026-09-20. SEC describes companyfacts/submissions bulk archives and nightly
updates; it does not establish our eligible count or indexing potential.
A single HEAD request for companyfacts.zip returned403; no archive body was
fetched and no retry was made. Receipt: sec-bulk-source-metadata-20260920.json.
Access through an approved supported acquisition path remains unresolved.
