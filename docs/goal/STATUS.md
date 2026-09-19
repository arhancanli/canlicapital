# Current state

Updated: 2026-09-19. Overall goal: **ACTIVE, NOT ACHIEVED**.
Current phase: **1/2 — refreshed cohort reviewed; coverage presentation corrected**.
Next implementation phase: **3 — bounded serving/discovery for the measured corpus**.
All owner requirements remain in REQUIREMENTS.md and are unchanged.

## Page and source measurements

- Last verified production sitemap: **263 URLs**. Production is unchanged.
- Current local draft: **327 indexable pages**, 688 total rendered pages. Seven
  companies, 56 financial histories and their directory add 64 pages to the baseline.
- Actual indexed pages: **unknown**. Search Console account/access question pending.
  Minimum remains 800,000 actually indexed pages, target 1,000,000.
- SEC bulk archive HEAD returned 403 earlier; no full SEC corpus was acquired.
- Older research sample: 520 original gzip captures verified against 48 part hashes
  and issuer lineage. 344 companies/2,657 histories supplied 3,001 candidates;
  individual capture times were unknown. Original engine files remain unchanged.
- Fresh refresh now **complete**: 342 candidates (excluding two already refreshed
  pilot companies), 2,645 histories, **2,987 candidate pages**, zero HTTP exclusions
  and zero source-reproduction errors. Compressed fresh originals: 57,540,391 bytes.
  These are staged locally, not published. Together with the current draft they
  could support 3,314 pages, subject to release review; this is not an indexed count.
- 322 histories need coverage interpretation: 258 end more than two years before
  capture, 76 use multiple units, with 12 in both groups. Neither old coverage nor
  an unusual currency is silently normalized or interpreted as delisting.

## Current validation and changes

- Full current local build/verification: **316 tests pass** (6 + 310), zero metadata
  errors/warnings, zero indexability conflicts, all indexable pages within three
  clicks. Numerical-source, publication and research/trial audits pass.
- Coverage presentation exposes reporting start/end separately from capture dates,
  flags old selected history, and supplies Dataset temporalCoverage. Company
  overviews preserve each unit and distinct same-end interval; no currency conversion.
- Final browser pass after the overview-column change: **36 Chromium/WebKit checks
  pass** at 390/1440. Server 68463 stopped; evidence and renderer hashes are in
  `artifacts/seo/coverage-browser-review.json`.
- Review tool independently rebuilds selected records from archived response bytes,
  checks receipt byte count/hash/identity/date and queue summaries. Tampering and
  partial/duplicate results are tested. Review is not automatic publication approval.
- Last remote website CI verified: **07b0a3b8 passes**, run 35439588965. Current
  coverage/review edits are local until their next checkpoint is pushed and checked.
- Prior unchanged MCP implementation passed 43 tests. On-site repository/MCP/API-key
  entry points and contributor guidance implemented. No adoption/star-growth claim.
- Keyword map: 78 canonical owners, 95 editorial query hypotheses, 249 pages pending
  intent review. No query-volume or ranking evidence is claimed.

## Release status

- Prior preview Ready: https://meridian-mk8f63w5m-arhans-projects-ac470eaa.vercel.app
  (`dpl_5ePSmH8KyqdsufFWnxxMiqKCMw1b`). It predates current coverage changes.
- Publishing branch 894ec07d integrated in bfca8f45. Trial-accounting code/tests match
  the approved design branch; verifier differences are the sharded sitemap reader.
- Original publishing worktree `/Users/arhancanli/canlicapital-website-20260908`
  and engine runtime pointer are unchanged. Remote design branch was deleted; no
  integration PR against it was created. Review remains in website PR 15.
- **Production activation approval pending** through the existing async question.
  The deployment skill requires explicit production authorization. Do not redirect
  the publisher or deploy production without the answer. Do not ask again routinely.
- Source-date manifest hashes preserve dates in Git-free deployment snapshots;
  changed source bytes invalidate bindings and missing-date fallback blocks Vercel.

## Engine status

- PR 68 (ab75af0) complete CI passes; ready for review.
- PR 69 (783ad0c) complete CI passes, including 35m37s offline suite; ready for review.
  Historical lock archive preserves original receipts, with an active-file replay
  guard. No historical publication hashes were rewritten. See ENGINE_ENVIRONMENT_REVIEW.md.
- PR 70 (e0a257c) collector-quality checks pass except offline job still running:
  run 35438489448, job 105885124970. Re-poll this exact handle.
- Dated engine baseline: four sleeves and four current-epoch daily observations;
  cost and tail-risk coverage incomplete. This is not a current live measurement.
  Sharpe >2, >=14 qualified distinct sleeves and realized max drawdown <=10% remain
  unestablished. No broker orders, research replay or engine deployment performed.

## Evidence and next steps

- `artifacts/seo/fresh-refresh-result.json`: completed capture summary.
- `artifacts/seo/fresh-candidate-review.json`: final per-company/history review.
- `artifacts/seo/fresh-review-input.json`: queued identities, catalog and collector hashes.
- Captures/receipts/selected records: ignored `artifacts/seo/corpus-local/fresh-review`.
  Capture session 34744 **completed with exit 0**; do not restart it as if still running.
- `/tmp/canli-units-build.log`, `/tmp/canli-units-verify.log`: current build/316 tests.
- Push this validated checkpoint and check CI. Then use real cohort
  sizes to implement bounded catalog/serving/discovery; don't put an unbounded million
  page Vite build or directory into production. Review flagged coverage before promotion.
- Production activation and Search Console evidence are pending separate answers.
  All independent content, developer adoption and algorithm objectives remain active.
