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
  cannot enable indexing by claiming approval. No public wrapper/storage configured.
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
- Latest full local verification: **347 tests pass (6 + 341)**, clean writing,
  metadata, link, indexability and numerical-source/evidence audits. Log:
  `/tmp/canli-release-runtime-verify.log`; session 85142 completed exit 0.
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
  **de0df95f** passes both CI jobs, run **35447039133**. The new release-loader
  checkpoint requires its own pushed-head CI check; do not confuse prior CI with later edits.
- Preview Ready: https://meridian-c2lklakk2-arhans-projects-ac470eaa.vercel.app.
  It predates later delivery/discovery work; catalog inactive, no backend configured.
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

1. Verify current PR-head CI after the release-loader checkpoint push.
2. Configure real storage and public wrappers for the verified-release handler; package
   assets and sitemap routing, retain genuine 404/503 and staged noindex behavior.
3. Verify a preview, complete release review, then production activation only with
   the pending authorization. Establish Search Console measurements separately.
4. Continue corpus acquisition/intent quality, developer adoption and engine objectives.

Evidence: `company-delivery-measurement.json`, `company-discovery-staged.json`,
`company-release-staged.json`, `company-delivery-browser.json` under artifacts/seo.
Raw source/storage objects remain ignored under artifacts/seo/corpus-local.
See COMPANY_CATALOG.md for reproduction commands and remaining production limits.
