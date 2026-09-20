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

## Retained issuer discovery review

The engine retained another ticker snapshot with 7,992 unique CIKs. Its union
with the current snapshot contains 8,096 CIKs: 65 are outside the current list.
Four are already in the v3 delivery. Of the remaining 61, five have retained
acquisition attempts and are held back from a new queue. This leaves **56 new,
unattempted identity candidates**, not 56 eligible companies or approved pages.

The nine outside-current-list identities in the retained acquisition ledger have
seven cached bodies and two absent bodies. All seven available bodies match their
recorded raw hashes and lengths. Four also have integer CIKs matching the current
schema; those four are already staged. The other three encode CIK as a string,
which the current production selector rejects. Their bytes are retained for schema
and provenance review; no silent conversion or admission was performed. No
per-response capture timestamp was verified for these cached bodies.

Reproduce with the engine Python environment (requires pyarrow):

```sh
/Users/arhancanli/alphac-security-20260919/.venv/bin/python \
  scripts/audit-retained-issuer-discovery.py /Users/arhancanli/alphaforge
```

`artifacts/seo/retained-issuer-discovery-20260920.json` records the 56 CIKs,
all holdbacks, cache outcomes and 37 input/body bindings. Copies are preserved
under ignored `corpus-local/retained-issuer-discovery`; all hashes and lengths
verify and a second run reproduces the report exactly. This material is not in the
previous sealed v3 archive. No network request, return-data read, trial identity
spend, source-runtime edit or new page generation occurred. This small discovery
increment does not materially close the source-capacity gap.
# Capture resume contract — September 20

The fourth queue is disjoint from the three prior website queues, current delivery
and600retained acquisition identities. A resumed collector must preserve every
prior HTTP or transport failure rather than treating a missing success receipt as
permission to retry. New reports bind the full ordered queue. Changed queues,
missing prior receipts, altered records and access-stop resumes fail before any
replacement fetch. Completed reports and acquisition timestamps remain unchanged.
Partial replay never saves a shorter prefix over previously recorded outcomes.

Legacy complete reports can be checked offline when every queue position matches.
Legacy partial reports lack the new queue binding and require explicit inspection;
the running fourth capture predates the guard and was not restarted or rewritten.
The fix changes future invocation behavior, not the code already loaded by that
process. Network failures remain evidence of failed acquisition, not eligibility.


## Unused-concept coverage inventory (September 20)

An offline scan of the exact source snapshots behind the separate three-cohort-v3
and fourth-cohort-v6 deliveries covers 2,651 unique companies. It reuses the annual
form, period, chronology and conflict checks from the production observation
selector, excluding the 34 already-supported concepts. Both instant and duration
interpretations are probed only for triage; taxonomy period types are not approved
by this scan. Each counted history needs at least three reporting ends and two
distinct values within one measured unit. Any selector error excludes that
company/concept from the structural count.

| Measured quantity | Count |
| --- | ---: |
| Unused us-gaap tags observed | 9,687 |
| Tags with at least one structurally qualifying history | 8,267 |
| Company/concept pairs with structural coverage | 754,911 |
| Pairs with a reporting end within two years of capture | 430,724 |
| Concepts with recent histories in at least 1,000 companies | 94 |

These pairs are not page counts or unique search intents. Tags can represent
alternative definitions, overlapping totals, obsolete taxonomies, maturity
schedules, or narrower accounting scopes. For example, the widely reported
CashAndCashEquivalentsPeriodIncreaseDecrease tag has structural history in2,388
companies but recent coverage in only1. LiabilitiesAndStockholdersEquity requires
a redundancy review against Assets before any additional page is justified.
Useful review candidates include operating lease assets/liabilities, gross property
and equipment, accumulated depreciation, interest paid, and comprehensive income.
Their exact definitions, units, source scope and intent must be reviewed first.

Tracked summary: artifacts/seo/company-concept-coverage-summary-20260920.json.
Complete17,460,544-byte inventory with2,651source bindings is retained under
corpus-local and SHA-bound by that summary. It is not yet included in an isolated
archive or offsite retention claim. Reproduce using
scripts/inventory-company-concept-coverage.mjs with the two delivery directories.
A focused regression verifies rejection of future-only, constant, incompatible-unit,
conflicting and corrupted inputs, preservation of existing-policy boundaries and
deterministic output. No selector, taxonomy policy or publication setting changed.
