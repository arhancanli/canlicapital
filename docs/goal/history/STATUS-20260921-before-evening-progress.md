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

## Next actions

1. Owner resubmits https://canlicapital.com/sitemap.xml in Search Console. Then
   measure crawl, index and exclusion counts by page family.
2. Re-review the five Wave 1 data-source terms and restore the engine health check.
3. Growth plan beyond v22 toward 800,000 indexed: more issuers, more supportable
   concepts, review of flagged histories, and new source-backed page families.
