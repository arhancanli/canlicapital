# Current state

Updated September 21, 2026. Goal ACTIVE, NOT ACHIEVED. All objectives and
publication authorization remain in REQUIREMENTS.md. Codex is usage-limited
until September 27; work continues from these records. Hermes remains stopped.

The previous STATUS is preserved at
[history/STATUS-20260921-before-production-activation.md](history/STATUS-20260921-before-production-activation.md).
Recorded states are not live telemetry.

## Latest verified transition: v22 clean set live in production

PR169 merged as 28f6e944 and PR170 as f6d37926 (all four CI checks passed on
both; the merged PR170 tree 73da6f09 equals the tested preview tree). The
production checkout (the hourly deploy's design source) moved to f6d37926. The
scheduled hourly deploy published it at 15:33Z: landing deployment
meridian-8c5ag8pvq aliased to production.

Owner release decision (2026-09-21, "clean set"), in `config/company-admission-v22.json`:

- Indexable: 77,359 company URLs, made up of 3,308 overviews, 73,984 histories
  without a selected-quality flag, and 67 directory pages.
- Served noindex but reachable: 12,959 flagged histories, plus all 414 pages of
  the 15 companies with a pending accounting-scope review.
- Downloads stay noindex.

Verified live on canlicapital.com (September 21):

- Admitted directory, overview and history pages return 200 with no
  X-Robots-Tag, meta `index, follow` and a self-canonical.
- Flagged histories, pending-review companies and downloads return 200 with
  `X-Robots-Tag: noindex`. An unknown company returns 404.
- `/sitemap.xml` is a sitemap index with two shards, 50,000 + 27,622 =
  77,622 URLs (263 site pages plus the 77,359 admitted company URLs).
- All 64 previously live company URLs return 200. 58 stay indexable; six are now
  noindex because v22 flags them historical-only (for example Apple Revenues
  ends in 2018 and Microsoft Revenues in 2010).
- Server time, from connect to first byte, was at most 1.73 s across those 64
  at six parallel requests.
- IndexNow accepted 77,622 canonical URLs at 15:33Z.

## Counts (keep separate)

- Built candidate URLs: 90,732.
- Live indexable company URLs: 77,359.
- Live sitemap URLs: 77,622.
- Submitted to IndexNow: 77,622.
- Submitted to Google: sitemap resubmission pending (owner action in Search Console).
- Confirmed indexed: 262 as of September 14; no new measurement yet.
- Goal: 800,000 indexed, target 1,000,000.

## Editorial scope

Batch1: 1,148 reviewed, 28 withdrawn, none pending. Batch2 scope-v31: 672
reviewed, 128 pending. The 15 companies holding those pending observations are
withheld from indexing until resolved. The 12,959 flagged histories are
withheld until reviewed under COMPANY_EDITORIAL_POLICY.md.

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

Admission v23 (same clean-set rules): 132,876 indexable URLs (6,376 overviews,
126,372 unflagged histories, 128 directories); 30,342 flagged histories and the
same 15 pending-review companies withheld noindex.

Open before activation: storage upload of the 9,731 new objects (owner-run with
the Supabase service key), hosted readiness on a clean preview, the full local
HTTP audit (running), a browser audit, and an activation PR that pins release
4a5d9160… and admission v23.

## Next actions

1. Owner resubmits https://canlicapital.com/sitemap.xml in Search Console. Then
   measure crawl, index and exclusion counts by page family.
2. Growth beyond v22 toward 800,000 indexed: upload, verify and activate v23
   (132,876 indexable); then curated additional concepts, review of the flagged
   histories, historical filers with explicit historical framing, and a filing-level
   page family only after its own reader task and editorial rules.
3. Developer adoption: publish MCP 0.2.0, keep releases substantive, measure stars
   and npm downloads weekly.
4. Engine: merge PR73; the nightly publish regenerates the audits and the health
   check should turn green on the next run. Sharpe, sleeve and drawdown goals
   remain immature (six current-epoch returns, four sleeves).
