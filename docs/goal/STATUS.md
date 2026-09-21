# Current state

Updated September 21, 2026. Goal ACTIVE, NOT ACHIEVED. All objectives and
publication authorization remain in REQUIREMENTS.md.

Codex reached its usage limit at 04:46Z on September 21 (reset stated as
September 27). Claude continues the same goal from the same records in the
meantime, under the same evidence rules. Hermes remains stopped.

The previous STATUS, with every hash and process handle through PR169, is
preserved at
[history/STATUS-20260921-before-claude-continuation.md](history/STATUS-20260921-before-claude-continuation.md).
Earlier checkpoints are in `history/`. Recorded states are not live telemetry.

## Latest verified transition

**Storage transfer complete.** Recovery79720 finished after the last Codex poll.
Receipt `artifacts/seo/corpus-local/company-five-cohort-storage-transfer-v22-recovery-20260921.json`:
`complete=true`, 10,360/10,360 files, 0 failures, 15 read retries, one write
recovery, plan SHA `7518e204…3aab`, release `7573eb42…c5fc`, destination
`company-reference-staging`. The process is no longer running (checked by PID).
Transfer only: not a capture backup, editorial admission or production activation.

**Clean hosted readiness passed.** Codex's final action reran
`scripts/audit-hosted-company-staging.mjs` (SHA `46c6fc6b…bbf4`, matches the
file) against the clean-route noindex preview
https://meridian-gb8qguqpt-arhans-projects-ac470eaa.vercel.app. Report
`artifacts/seo/company-v22-clean-hosted-readiness-probe-complete-20260921.json`:
23 checks, 0 failures, `passed=true` (16×200, 3×304, 3×404, 1×405). This supersedes
the earlier 7/20 download failures (that failed report stays retained). Claude
spot-checked the directory, a company page, a company download and an unknown
company: 200/200/200/404, all `X-Robots-Tag: noindex`. Representative sample
only: not full-corpus hosted HTTP, cloud load/cost or production.

**PR169** (Southern Copper/AdCare legacy context, The9 conflict retained): all
four CI checks passed at `076faca1`. Open; merge needs the owner (see below).

## Editorial scope (unchanged since PR169)

Batch1: 1,148 reviewed (130 presentation-only), 28 withdrawn, none pending.
Batch2 scope-v31: 672 reviewed (104 presentation-only), 128 pending, 0 withdrawn.
Remaining 128: 96 in 12 documented unresolved reports; 32 across Regional Health
2025, Inhibitor 2013, MacroGenics 2014 and Stereotaxis 2014 not yet reviewed.
The wider deferred basic/diluted queue (10,206 observations, 2,696 filings,
464 companies at the original baseline) is larger than batches 1–2.

## Release evidence

Latest full release checks: scope-v29 (HTTP 90,732 pages/6,646 downloads;
browser 1,392 cases/1,540 note-source checks). Latest sealed archive scope-v29
(45 reports/745 files, SHA `c7a06a92…f4f3`). Scope-v30/31 notes still need
release-check and archive coverage.

## Counts (keep separate)

Candidate URLs 90,732 (3,323 overviews, 87,342 histories, 67 directories), none
live. Live sitemap 327 URLs (fetched September 21). Last confirmed indexed 262
(September 14). Goal 800,000 indexed, target 1,000,000.

## Remaining gates before production activation

1. Merge PR169.
2. Release scope: resolve or explicitly withhold the values in the 12 unresolved
   reports; review or withhold the 32 unreviewed observations.
3. Release checks and archive for the final scope.
4. Production activation code. Company handlers support `indexable`, but nothing
   sets it; production `vercel.json` has no company rewrites; the 327 live static
   URLs must keep working.
5. Sitemaps for the admitted scope, preview verification, production deploy,
   then Search Console submission and measurement.

## Other objectives

Developer adoption: 0 stars on both repos; MCP 0.1.2 got 33 npm downloads
(September 13–19). Engine: live forward-evidence report
`IMMATURE_RECORD_TOO_SHORT` (paper only). The ALPHAC nightly health check has been
red since September 16 on one test
(`tests/unit/test_wave1_data_rights.py::test_wave1_raw_vendor_rows_are_excluded_and_sources_are_mapped`).

## Next action

Owner merges PR169. Claude then works through release-scope gate 2 and the
production-activation build (gate 4) in an isolated branch, with preview
verification before any production change.
