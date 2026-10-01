# Current state

Updated September 21, 2026. Goal ACTIVE, NOT ACHIEVED. All objectives and
publication authorization remain in REQUIREMENTS.md. Work continues from these records.

Earlier versions of this file are in the repository's git history.
Recorded states are not live telemetry.

## Latest verified transition: v27 live in production (September 23)

PR205 merged as 3915e039 after the storage transfer (52,141/52,141), the clean
hosted readiness with the filing sample (35/35) and the browser flow. The
production checkout moved to 3915e039 and the scheduled hourly deploy published it
at about 20:33:23Z (19 company sitemap shards observed).

Admission v27 (`config/company-admission-v27.json`, decision 2026-09-22):

- Indexable: 916,208 company URLs: 12,738 overviews, 498,608 histories (260,052
admitted with a stated-condition notice under option C), 256 directory pages,
12,715 filing indexes and 391,891 filing pages. The 6,672 historical filers carry
the company-level notice on their overview and filing index and the last filing
date in the directory.
- Served noindex but reachable: 14,564 histories with other flag sets, plus all
pages of the 15 companies with a pending accounting-scope review (730 histories,
631 filing pages).
- Downloads stay noindex.

Verified live on canlicapital.com (September 23, `corpus-local/v27-live-checks.log`):

- An admitted history, a history admitted with a notice, a filing index, a filing
  page, and a historical filer's overview and filing index (notice present) return
  200 with no X-Robots-Tag, meta `index, follow` and a self-canonical; the
  directory too.
- A history withheld for another flag, a pending-review company, its filing page
  and a download return 200 with `X-Robots-Tag: noindex`. An unknown company
  returns 404 noindex.
- `/sitemap.xml` is a sitemap index: `sitemap-site.xml` (263) and 19 company
shards = 916,471 URLs (916,208 company URLs).
- Slowest of the 14 checks 36,125 ms end to end from the test machine.
- IndexNow: the hourly deploy's own submission at 20:33:49Z accepted 102,521 new
or updated canonical URLs (916,471 in the sitemap); the manual run found nothing
further to submit.

The v26 transition record is preserved in LOG.md (2026-09-23).
## Counts (keep separate)

- Built candidate URLs: 932,163 (v27, staged).
- Live indexable company URLs: 813,892.
- Live sitemap URLs: 814,155.
- Submitted to IndexNow: 814,155 cumulative (77,622 on September 21, 79,444 on September 22, 401,034 and 257,343 new or updated on September 23).
- Submitted to Google: sitemap resubmission pending (owner action in Search Console).
- Confirmed indexed: 262 as of September 14; no new measurement yet.
- Goal: 800,000 indexed, target 1,000,000.

## Editorial scope

Batch1: 1,148 reviewed, 28 withdrawn, none pending. Batch2 scope-v31: 672
reviewed, 128 pending. The 15 companies holding those pending observations are
withheld from indexing until resolved. Flagged histories: 23,838 admitted with a
notice under the September 22 decision (option C); 6,504 with other flag sets stay
withheld under COMPANY_EDITORIAL_POLICY.md.

## Other objectives

- Developer adoption: 0 stars on both repos; MCP 0.1.2 had 33 npm downloads
  (September 13–19).
- Engine: live forward-evidence report `IMMATURE_RECORD_TOO_SHORT` (paper only).
- ALPHAC nightly health check: red since September 16 on the Wave 1 data-rights
  test. PR #56 moved the policy review date to 2026-09-15, which invalidated the
  five sources reviewed on 2026-08-26. Current terms re-review is in progress.

## Progress log, September 21 (evening)

Everything below is verified against live files, PRs or logs, not planned.

| Area | Done | Evidence |
| --- | --- | --- |
| Release | v22 clean set live: 77,359 indexable company URLs, 13,373 withheld noindex | PR170 f6d37926; live header/canonical checks |
| Sitemaps | Index now lists stable children: sitemap-site.xml (263), sitemap-companies-1.xml (50,000), sitemap-companies-2.xml (27,359) | PR174 6820607a; deployed 16:23Z; all four files 200 as Googlebot; 563 sampled pages 200, indexable, self-canonical |
| IndexNow | Only new or updated URLs are submitted; state kept outside the deploy snapshot | PR172 51bd9d70; 16:29Z deploy logged "skipped: none of 77622 URLs is new or updated" |
| Records | Goal folder brought current | PR171 6437c062 |
| Capacity | SEC bulk companyfacts inventoried: 7,281 active filers, 375,915 current-concept histories, 413,535 filings | PR173 061c49a3; SOURCE_CAPACITY.md |
| Repository | GitHub release v0.2.0 with notes; 8 topics added (mcp, mcp-server, sec-edgar, xbrl, financial-data, backtesting, api, model-context-protocol) | github.com/arhancanli/canlicapital/releases/tag/v0.2.0 |
| MCP | 0.2.0 candidate adds company_financial_history over the company reference; 53 tests, package smoke, live check pass | PR175 (open); npm publish still needs the owner |
| Engine | Wave 1 data-rights terms re-reviewed (6/6); running checkout fast-forwarded to 025dd27; live config fingerprint unchanged (553aff51); stale test counts fixed | alphac PR72 merged 025dd27e; PR73 open |

Not done, in the owner's hands: Search Console resubmission of sitemap.xml
(a "Couldn't fetch" on sitemap-companies-1.xml predates the 16:23Z deploy);
npm publish of canli-validation-mcp 0.2.0; alphac PR73 merge after CI.

Not yet measured: Google indexed count (baseline 262 as of September 14);
npm downloads of 0.1.2 were 174 for September 14 to 20; both repositories
still have 0 stars.

## v23 staged release (built September 21, 18:10Z; not uploaded, not live)

Ten cohorts: the five v22 cohorts carried over byte for byte, four new cohorts
captured from SEC on September 21 (queues from the bulk companyfacts archive,
ranked by concept coverage, disjoint from every attempted CIK), and a tenth cohort
of 89 v22-era companies re-derived from retained bytes after the selector began
accepting digit-string CIKs (COMPANY_EDITORIAL_POLICY.md). Capture: 3,793 CIKs,
0 HTTP errors, 0 not-found. Eligible after review: 968 + 919 + 781 + 312 + 88 =
3,068; every remaining exclusion is INSUFFICIENT_COVERAGE except two identity
failures.

Release 4a5d9160…, catalog b6f3b3ea…: 6,391 companies, 157,113 histories,
163,632 candidate URLs, 128 directory pages, 19,790 objects (1.83 GB; 9,731 new
against the v22 plan, 557 MB). `scripts/verify-v23-runtime.mjs` passed: 3,323
carried, 3,068 added from pinned queues, every object hashed, sitemap leaves exact.

Admission v23 (clean-set rules plus the owner's flag decision of September 22,
option C of FLAGGED_HISTORY_REVIEW_PROPOSAL.md): 156,714 indexable URLs (6,376
overviews, 150,210 histories of which 23,838 carry a stated-condition notice, 128
directories); 6,504 histories with other flags and the same 15 pending-review
companies withheld noindex. File `config/company-admission-v23.json`, SHA-256
c8bda817….

Upload and hosted checks complete (September 22): storage transfer 19,790/19,790
verified in run 3 (17,922 existing, 1,868 created, 0 verified after a create
error, 0 failures; run 2 stopped on an HTTP 429 at 16,020 and is retained), clean
hosted readiness 23/23 on the noindex preview of the activation branch (deployment
dpl_2najQCutTLYwK3WZTkv6xqWuR23Y), browser flow passed. PR178 pins release
4a5d9160… and admission v23 (156,714 admitted URLs); merging it activates v23.

## v24 staged release (built September 22, 14:10Z; not uploaded, not live)

Policy extended-v23 (PR #180, 38 expanded concepts after the 100-character slug
bound removed one) applied to the same 6,391 companies as v23. The five original
cohorts were re-derived from retained bytes under the current selector
(`*-r2` directories, fresh 404 receipts), which absorbs the tenth-89 companies;
nine cohorts combined. Transition proof: every extended-v22 record reproduces byte
for byte and is an unchanged subset of its extended-v23 selection; 139,706
histories added, none changed or removed.

Release 19fd560e…: 6,391 companies, 296,819 histories (157,113 carried + 139,706
added), 303,338 candidate URLs, 7 sitemap shards, 19,772 objects (2.55 GB; 13,379
new against the v23 plan, 1.65 GB). `scripts/verify-v24-runtime.mjs` passed.
Admission v24 (clean-set rules): 245,060 indexable URLs (6,376 overviews, 238,556
unflagged histories, 128 directories); 57,533 flagged histories and the same 15
pending-review companies withheld.

Order of operations: v23 upload (running) → v23 hosted checks → activate v23
(#178) → v24 upload → v24 hosted checks → activate v24. Local HTTP audit of v24
started 14:12Z.

## v25 staged release (built September 22, 15:50Z; not uploaded, not live)

The v24 delivery (same manifest bytes, policy extended-v23, 6,391 companies,
296,819 histories) plus the filing page family: policy filings-v1 derived from the
delivered source bytes into one gzip document per company
(`scripts/build-company-filings.mjs`), bound into the release as `filings_root`
664a9b19…. 257,357 filing pages across 6,387 companies; 4 companies hold no
qualifying filing (every filing thin under the 8-concept rule); 1,366 thin filings
unbuilt; 0 withheld for conflicts. Filings catalog: 6,387 leaves + 51 index nodes,
230 MB compressed (4.50 GB inflated).

Release 292f9b8e…: 567,082 candidate URLs (303,338 v24 URLs + 6,387 filing indexes
+ 257,357 filing pages), 12 sitemap shards, 26,210 objects (2.78 GB; 6,438 net new
against the v24 plan, 230 MB: the filings objects, with the release object replaced).
`scripts/verify-v25-runtime.mjs` passed: every staged filings document equals a
fresh derivation from the delivered bytes, the discovery set is the v24 set plus
exactly the filing family, the plan is the v24 plan plus exactly the filings
objects.

Admission v25 (clean-set rules, filing pages follow their company, plus the
owner's flag decision of September 22, option C): 556,677 indexable URLs (6,376
overviews, 287,075 histories of which 48,519 carry a stated-condition notice, 128
directories, 6,372 filing indexes, 256,726 filing pages); withheld: 9,014
histories with other flags, and the same 15 pending-review companies with 730
histories and 631 filing pages. File `config/company-admission-v25.json`, SHA-256
56ae90eb…; the accession list lives in the pinned sidecar
`config/company-filing-admission-v25.json.gz` (1,112,677 bytes), read only by the
production sitemap step; the serving function decides filing indexability per
company.

Local HTTP audit (`measure-company-delivery.mjs`, sequential local Node HTTP):
567,082 pages (6,391 overviews, 296,819 histories, 6,387 filing indexes, 257,357
filing pages, 128 directories), 12,782 downloads, 0 failures; every sitemap URL
served and every page reachable within 5 clicks of the directory; largest page
105,551 bytes; median 3.3 ms
(`company-nine-cohort-v25-http-measurement-20260922.json`).

Upload and hosted checks complete (September 23): storage transfer 26,210/26,210
verified in run 5 (16,033 existing, 10,173 created, 4 verified after a create
error, 0 failures, 0 rate-limit holds; runs 1–4 stopped on HTTP 429 and 500
responses that the uploader now handles, all retained), clean hosted readiness
35/35 with the filing sample on the noindex preview of the activation branch
(dpl_5hjjqLtg8z4QjgDQu2brbD1uUuPZ), browser flow passed. PR195 pins release
292f9b8e… and admission v25 (556,677 admitted URLs); merging it activates v25.

## v26 staged release (built September 22, 21:06Z; not uploaded, not live)

The historical filers family (HISTORICAL_FILERS_PROPOSAL.md; owner go of September
22). Discovery over the retained bulk archive in the explicit historical mode
(historical, filings on or after 2009-01-01): 8,800 eligible entities in 9
coverage-ranked slices. The first four slices (4,000 entities with at least 40
published concepts) were captured 19:27–19:58Z in four parallel runs at one
request per second: 0 HTTP errors, 0 not-found. Review: eleventh-1000 991
candidates / 9 excluded, twelfth-1000 981 candidates / 19 excluded,
thirteenth-1000 956 candidates / 44 excluded, fourteenth-1000 882 candidates / 118
excluded; every exclusion is a coverage failure. Staged under extended-v23 and
combined with the nine v24 cohorts.

Release 5141e69b…: 10,201 companies (6,391 carried from v24 byte for byte, 3,810
added; 4,120 historical filers whose overview, filing index and directory entry
state the last filing date), 457,906 histories, 349,054 filing pages across 10,197
companies, 827,563 candidate URLs in 17 sitemap shards, 205 directory pages.
Storage plan 41,806 objects (3.80 GB; 15,972 new against the v25 plan).
`scripts/verify-v26-runtime.mjs` passed: every v24 company carried unchanged,
every new company from a historical capture queue, every filings document
re-derived from the delivered bytes, discovery equal to the derived set, plan
bound to the release.

Admission v26 (clean-set rules, filing pages follow their company, option C):
813,892 indexable URLs (10,186 overviews, 444,896 histories of which 206,340 carry
a stated-condition notice, 205 directories, 10,182 filing indexes, 348,423 filing
pages); withheld: 12,280 histories with other flag sets and the same 15
pending-review companies. File `config/company-admission-v26.json`, SHA-256
5af3b2d2…; sidecar `config/company-filing-admission-v26.json.gz`. This is the
first release whose admissible set exceeds 800,000 URLs; it is not an indexed
count.

Local HTTP audit: 827,563 pages (10,201 overviews, 457,906 histories, 10,197
filing indexes, 349,054 filing pages, 205 directories), 20,402 downloads, 0
failures; every sitemap URL served and every page within 5 clicks of the
directory; largest page 111,611 bytes; median 3.1 ms
(`company-thirteen-cohort-v26-http-measurement-20260922.json`).

Upload and hosted checks complete (September 23): storage transfer 41,806/41,806
verified in run 1 (35,154 existing, 6,649 created, 3 verified after a create
error, 0 failures, 0 rate-limit holds; first run with the hardened uploader),
clean hosted readiness 35/35 with the filing sample on the noindex preview of the
activation branch (dpl_Duawhq2xUriVrA5m2CVq97uYTTfL), browser flow passed. PR201
pins release 5141e69b… and admission v26 (813,892 admitted URLs); merging it
activates v26.

## v27 staged release (built September 23, 03:25Z; not uploaded, not live)

The remaining historical filers (slices 05–09 of the same historical discovery:
4,800 entities with 4–40 published concepts) were captured 02:38–03:04Z on
September 23 in five parallel runs at one request per second: 0 HTTP errors, 0
not-found. Review: fifteenth-1000 799 candidates / 201 excluded, sixteenth-1000
689 candidates / 311 excluded, seventeenth-1000 511 candidates / 489 excluded,
eighteenth-1000 321 candidates / 679 excluded, nineteenth-800 232 candidates / 568
excluded; every exclusion is a coverage failure. Staged under extended-v23 and
combined with the thirteen v26 cohorts.

Release 389ae2ca…: 12,753 companies (10,201 carried from v26 byte for byte, 2,552
added; 6,672 historical filers whose overview, filing index and directory entry
state the last filing date), 513,902 histories, 392,522 filing pages across 12,730
companies, 932,163 candidate URLs in 19 sitemap shards, 256 directory pages.
Storage plan 52,141 objects (4.13 GB; 10,771 new against the v26 plan).
`scripts/verify-v27-runtime.mjs` passed: every v26 company carried unchanged,
every new company from a historical capture queue, every filings document
re-derived from the delivered bytes, discovery equal to the derived set, plan
bound to the release.

Admission v26 (clean-set rules, filing pages follow their company, option C):
916,208 indexable URLs (12,738 overviews, 498,608 histories of which 260,052 carry
a stated-condition notice, 256 directories, 12,715 filing indexes, 391,891 filing
pages); withheld: 14,564 histories with other flag sets and the same 15
pending-review companies. File `config/company-admission-v27.json`, SHA-256
873430b8…; sidecar `config/company-filing-admission-v27.json.gz`. This completes
the historical filers family from the September 19 archive; it is not an indexed
count.

Local HTTP audit: 932,163 pages (12,753 overviews, 513,902 histories, 12,730
filing indexes, 392,522 filing pages, 256 directories), 25,506 downloads, 0
failures; every sitemap URL served and every page within 5 clicks of the
directory; largest page 111,611 bytes; median 3.9 ms
(`company-eighteen-cohort-v27-http-measurement-20260923.json`).

Upload and hosted checks complete (September 23): storage transfer 52,141/52,141
verified in run 1 (41,370 existing, 10,770 created, 1 verified after a create
error, 0 failures, 12 rate-limit holds absorbed; first run with the hardened
uploader), clean hosted readiness 35/35 with the filing sample on the noindex
preview of the activation branch (dpl_5AJRjTq47Y4QpPNALJunt4ifc7fV), browser flow
passed. PR205 pins release 389ae2ca… and admission v27 (916,208 admitted URLs);
merging it activates v27.

## Next actions

1. Owner resubmits https://canlicapital.com/sitemap.xml in Search Console. Then
   measure crawl, index and exclusion counts by page family.
2. Growth toward 800,000 indexed: v27 is live (916,208 indexable); every archive
   entity that meets the discovery rules is captured, reviewed and released.
   Next growth is NEXT_FAMILIES_PROPOSAL.md: equal-vector representatives
   (+6,990) and annual reporting-period pages (+118,784), owner decision
   pending; then v28. Indexed counts are measured in Search Console after each
   activation.
3. Developer adoption: publish MCP 0.2.0, keep releases substantive, measure stars
   and npm downloads weekly.
4. Engine: merge PR73; the nightly publish regenerates the audits and the health
   check should turn green on the next run. Sharpe, sleeve and drawdown goals
   remain immature (six current-epoch returns, four sleeves).
