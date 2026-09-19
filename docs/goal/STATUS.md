# Current state

Updated: 2026-09-19. Overall goal: **ACTIVE, NOT ACHIEVED**.
Current phase: **3 — bounded download lookup and bound release verified locally**.
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
  These are staged locally, not published. The combined local delivery proof now serves 3,057 reference pages, including seven
  paginated directories. With the 263-page baseline this could support 3,320 pages
  after release review/integration; it is not a live or indexed count.
- 322 histories need coverage interpretation: 258 end more than two years before
  capture, 76 use multiple units, with 12 in both groups. Neither old coverage nor
  an unusual currency is silently normalized or interpreted as delisting.

## Current validation and changes

- Full current local build/verification: **339 tests pass** (6 + 333), including the snapshot-isolation regression, zero metadata
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
- Last remote website CI verified: **ef1061c4 passes**, run35442282673. Snapshot
  isolation helper passes its targeted regression and an actual cloned snapshot build.
- Prior unchanged MCP implementation passed 43 tests. On-site repository/MCP/API-key
  entry points and contributor guidance implemented. No adoption/star-growth claim.
- Keyword map: 78 canonical owners, 95 editorial query hypotheses, 249 pages pending
  intent review. No query-volume or ranking evidence is claimed.

## Release status

- Updated preview Ready: https://meridian-c2lklakk2-arhans-projects-ac470eaa.vercel.app
  (`dpl_3xmLsji65LwWt1BmnxhSoBv4bytE`). Includes coverage fixes and packages both
  catalog read endpoints; no catalog data activated. See `artifacts/seo/catalog-preview.json`.
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
- PR 70 (e0a257c) complete CI passes, including the 35m32s offline job
  105885124970. Marked ready for review; no engine merge/deployment.
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
- Check CI for the pushed checkpoint. Then use real cohort
  sizes to implement bounded catalog/serving/discovery; don't put an unbounded million
  page Vite build or directory into production. Review flagged coverage before promotion.
- Production activation and Search Console evidence are pending separate answers.
  All independent content, developer adoption and algorithm objectives remain active.

## Phase 3 implementation checkpoint

- Immutable catalog and staged API/company-directory handlers implemented. See
  `COMPANY_CATALOG.md` for the data format, bounds, exact commands and remaining work.
- Local HTTP measurement reproduces all 342 real records and all seven directory
  pages. Four index nodes over two levels; 6,553,492 selected-data/index bytes.
  Largest actual object read 41,977 bytes; cache payload stays below 4 MiB.
- Twelve catalog tests and full verification pass: **328 total tests** (6 + 322).
  `/tmp/canli-catalog-final-verify.log` records the completed result.
- No backend configured or catalog activated. New endpoints fail 503 when unavailable;
  no live onboarding claims have been added. HTML rendering/discovery, source-download
  storage mapping and deployment packaging verification remain necessary next work.
- Prior website CI at 7a53c974 passes (run 35440123419). PR 70 full CI passes and is
  ready for review. No source collection/engine test process remains live from those jobs.

- Updated preview packaging verified Ready by CLI. Initial attempt failed because
  local validation rewrote the bound homepage input before upload. Restored its
  original input and retried successfully; no date guard was weakened.
- `scripts/validate-deploy-snapshot.mjs` now builds an isolated clone, excluding
  secrets/cache metadata and retaining required inventory/dependencies. Regression
  proves original homepage bytes remain unchanged; actual snapshot clone build passes.
- Remaining phase 3 work: backend/source-download mapping, catalog-backed HTML and
  bounded crawlable discovery, then review/activation. API JSON alone is not SEO pages.

## Catalog-backed HTML checkpoint

- Shared pure renderer preserves all 63 existing company/history documents byte for
  byte. Catalog-fed HTML uses the five compiled Vite resource tags, with no thousands
  of new build entries. Invalid history aliases return 404; storage errors return 503.
- Combined catalog: **349 companies, 2,701 histories, seven directories = 3,057
  reference HTML pages**. Local HTTP measurement verifies every page and all **698
  original/selected downloads**, including source replay. Largest HTML: 28,902 bytes.
- Download staging preserves original gzip bytes in immutable content-addressed
  objects. Raw-response hashes and compressed-object hashes remain distinct. Local
  preview resolves a full manifest; a bounded production download index is still needed.
- Browser review: **28 Chromium/WebKit checks pass** at 390/1440, including Toyota,
  H World, SoFi, old Apple revenue coverage, and the final directory page.
- Evidence: `artifacts/seo/company-delivery-measurement.json` and
  `artifacts/seo/company-delivery-browser.json`. Local preview servers are stopped.
- Production wrapper, storage upload, bounded production discovery/sitemaps and
  deployment verification remain open. No new production routes activated. Full
  final verification passed (session49160):335 tests, clean writing/SEO/evidence audits.

- Latest HTML checkpoint **7a398ff6** pushed to PR15; remote CI run35442251005
  is pending. Check it before starting the next phase. Default-branch Dependabot
  alert1 (esbuild, moderate, fixed0.25.0) is open; inspect actual dependency lineage
  before proposing a fix. No production mutation or dependency fix occurred.

## Bounded download/release checkpoint

- Previous goal turn classified as **progress**: committed delivery implementation,
  full-cohort measurements and browser evidence. Current turn reread all continuity
  records and verified ef1061c4 remote CI passes.
- Preview now routes all source/selected downloads through a bounded immutable
  index instead of a complete request lookup map. Real cohort:17 nodes,184,535
  index bytes; largest node13,676 bytes, cache limit256KiB.
- Full3,057-page/698-download HTTP replay passes with the new handler. Release
  binding independently matches all selected records and original sources to the
  catalog revision; both roots are in `artifacts/seo/company-release-staged.json`.
- Four new download-index tests pass, including concurrent cache accounting,
  corruption, path-prefix validation, HTTP byte caps and404/503 behavior. Release
  regression preserves the old pointer on corrupt data. Full verification
  session55417 passed:339 tests and all writing/SEO/evidence checks.
- Dependabot alert1 traced to **design-system/package-lock.json** esbuild0.23.1.
  Upgraded to0.25.12 (npm audit:zero vulnerabilities). Initial wrapper build failed
  because the copied shell omitted optical-handoff.mjs; build now copies that input.
  Wrapper build and60 tests pass; dedicated CI added. Default-branch alert is still
  open until a reviewed fix lands there. No security-alert dismissal.
- Production source wrappers/storage, directory discovery/sitemaps, packaging and
  activation remain open. No production change, index count or adoption claim.

- Pushed **093fb0fd** (design-wrapper fix) and **e6eb2ed7** (bounded source lookup
  and release binding) to PR15; PR description updated. CI run35442672656 is live:
  design-wrapper job105896110723 passed, website job105896110867 was in progress
  at last verification. Check this run and the current PR head after continuation.
