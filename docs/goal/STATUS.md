# Current state

Updated: 2026-09-19. Overall goal: **ACTIVE, NOT ACHIEVED**.
Current phase: **3 — bounded serving and crawl discovery verified locally**.
Next: production release/storage integration and deployment packaging.
All owner objectives in REQUIREMENTS.md remain active. The owner reconfirmed the
million-indexed-page vision and all other objectives after the sitemap discussion.

## Counts and claim boundaries

- Last verified production sitemap: **263 URLs**. No expansion deployed to production.
- Normal local website build: **327 indexable pages**, 688 rendered pages.
- Combined staged reference: **349 companies + 2,701 histories + seven directories
  = 3,057 HTML pages**, with **698 original/selected downloads**.
- Combined with the 263 baseline pages, this could support **3,320 pages** after
  integration/release review. It is not a live or indexed count.
- Actual indexed count: **unknown**; Search Console access/evidence remains pending.
  Minimum remains **800,000 actually indexed**, target **1,000,000**.
- User was told to keep the existing `https://canlicapital.com/sitemap.xml` submission.
  `/company-sitemap.xml` is staged only and must not be submitted as a live expansion.

## Current implementation and verification

- Existing pilot HTML remains byte-identical under the shared renderer. New HTML
  keeps source provenance, reporting coverage, original units and developer links.
- Catalog reads bounded index nodes and records, with a 4 MiB payload cache.
  Download index uses 64 KiB nodes and a 256 KiB cache; actual cohort needs 17 nodes,
  184,535 bytes total, largest node 13,676 bytes. Process/concurrency memory is separate.
- The request loader verifies a small immutable release before assembling company,
  directory and download handlers from its two roots. The local host uses this same
  router. Initial validation is shared; temporary failures can retry. A release object
  cannot enable indexing by claiming approval. A staging API wrapper is implemented; storage remains unconfigured.
- Release binding replays source bytes and selected records before pinning catalog
  and download roots. Corrupt data fails and preserves the prior release pointer.
- Directory lookup now seeks by rank through catalog counts, without a full CIK
  boundary list or reading prior pages/financial records. Pages contain at most
  50 companies; range navigation has at most 20 links per level.
- Staged discovery enumerates the bound catalog into a protocol-bounded sitemap.
  Current sitemap contains exactly **3,057 URLs**, 410,440 bytes. HTTP comparison
  proves the sitemap matches the served reference pages, with no orphan pages and
  maximum **three links from /companies** (not from the site homepage).
- Synthetic navigation test: all 20,000 directory pages reached in at most four
  links. Initial three-link expectation failed and was corrected to the measured
  bound. This tests navigation, not content quality, live capacity or indexing.
- Latest full local verification: **348 tests pass (6 + 342)**, clean writing,
  metadata, link, indexability and numerical-source/evidence audits. Log:
  `/tmp/canli-public-wrapper-verify.log`; session 67317 completed exit 0.
- Latest staged browser review: **28 Chromium/WebKit checks pass**, 390/1440 widths.
  Inspected mobile final-directory screenshot. Local test servers are stopped.
- Prior unchanged MCP tests: 43 pass. Developer links/examples/contributor guidance
  are implemented; no star-growth, usage, conversion or ranking claim.
- Keyword map remains 78 canonical owners, 95 query hypotheses, 249 pending intent
  reviews. Demand and ranking evidence remain unestablished.

## Source state

- Fresh cohort: 342 companies, 2,645 histories, 2,987 candidate pages, zero HTTP
  exclusions/reproduction errors; 57,540,391 gzip bytes. Capture job is terminal.
- Seven pilot companies plus fresh cohort make the combined staged corpus above.
- Coverage flags: 258 histories end more than two years before capture; 76 have
  multiple units, with 12 overlap. Presentation preserves these distinctions.
- Older 520-capture research sample had 344 eligible companies/2,657 histories;
  individual capture times were unknown. Original engine files remain unchanged.
- SEC bulk archive previously returned 403. Full corpus has not been acquired.

## Release, CI and environment

- Website worktree/PR 15 remain the isolated task branch. Prior pushed head
  **7ce4557c** passes both CI jobs, run **35447499909**. Later audit/docs changes
  need their own pushed-head CI check; do not confuse prior CI with later edits.
- Preview Ready: https://meridian-atulevugw-arhans-projects-ac470eaa.vercel.app.
  Vercel lists the new company-reference function (36.84KB). Catalog inactive;
  hosted-data runtime unverified. See artifacts/seo/wrapper-preview.json.
- Publishing history integrated in bfca8f45; original design worktree and engine
  runtime publisher pointer remain unchanged. Production authorization question
  remains pending; generic continuation is not explicit production activation.
- Source-date bindings and isolated snapshot validation remain enforced. Validate
  a clone, then deploy the original upload inputs, never the mutated validation clone.
- Design-wrapper esbuild upgraded 0.23.1 to 0.25.12; missing generated shell dependency
  fixed. Wrapper build/60 tests pass and dedicated CI passes. Default-branch alert
  remains open until a reviewed fix lands there; it has not been dismissed.

## Engine objectives

- Engine PRs 68 (ab75af0), 69 (783ad0c), 70 (e0a257c) passed complete CI and are ready
  for review. No engine merge/deployment or broker orders performed.
- Dependency reproduction archives preserve original historical hashes; active-file
  replay guard implemented. See ENGINE_ENVIRONMENT_REVIEW.md.
- Last dated baseline: four sleeves and four current-epoch daily observations;
  cost/tail coverage incomplete. This is not a fresh live measurement.
- Net forward Sharpe >2, at least 14 qualified distinct sleeves, and realized max
  drawdown <=10% remain unestablished. Continue governed research and forward evidence.

## Next actions and evidence

1. Verify current PR-head CI after the public-wrapper checkpoint push.
2. Resolve the pending storage-provider/access question, configure storage; verify
   assets and sitemap routing, retain genuine 404/503 and staged noindex behavior.
3. Verify a preview, complete release review, then production activation only with
   the pending authorization. Establish Search Console measurements separately.
4. Continue corpus acquisition/intent quality, developer adoption and engine objectives.

Evidence: `company-delivery-measurement.json`, `company-discovery-staged.json`,
`company-release-staged.json`, `company-delivery-browser.json` under artifacts/seo.
Raw source/storage objects remain ignored under artifacts/seo/corpus-local.
See COMPANY_CATALOG.md for reproduction commands and remaining production limits.

## Staging wrapper and storage inspection

- Added `/api/v1/company-reference?path=/companies/...` backed by the verified-release
  router and HTTPS readers. Required settings: COMPANY_RELEASE_HASH,
  COMPANY_CATALOG_BASE_URL and COMPANY_DELIVERY_BASE_URL. Missing configuration
  returns503/no-store; successful responses remain noindex. No canonical-site
  rewrites added and no environment values changed.
- Vercel configuration includes only dist/company-page-assets.json in this function.
  Tests exercise the wrapper with HTTPS fetch fixtures and compiled asset mapping.
  Cloud packaging is Ready and the function is listed; hosted-data behavior still needs verification.
- Read-only Vercel environment listing shows Supabase names, but two CLI exports
  did not provide usable SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY values. The first
  bucket inspection failed during URL construction; the second confirmed absent
  exported values. This is not proof production has missing credentials or no bucket.
- Temporary credential export files were deleted and deletion verified. No secret
  values printed, bucket created, storage objects uploaded or remote settings changed.
- Async question asks which existing storage provider/bucket should be used; pending.
  Production authorization and Search Console evidence are separately pending.

## Source breadth review while storage is pending

- Read-only audit of the same349 captures found102,282 company/concept histories
  across5,910 US-GAAP tags, including99,581 outside the nine selected concepts.
  This is a source opportunity inventory, not eligible/built/live/indexed pages.
- Review flags:1,883 duplicate observation vectors,2,302 zero-only histories and
  4,378 constant-per-unit histories. Flags overlap; do not subtract them as disjoint.
- Existing annual selection and three-reporting-end rule were reused. Kind inferred
  from observation shape is not authoritative taxonomy classification. Definition,
  intent ownership, comparability, duplicate content and material usefulness require
  review before any expansion. No records or published concept whitelist changed.
- Evidence: artifacts/seo/company-concept-breadth.json and its executable audit.
  Source growth review can proceed independently while storage/access is pending.
