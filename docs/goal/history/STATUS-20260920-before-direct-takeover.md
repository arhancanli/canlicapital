# Current state

Updated: 2026-09-19. Overall goal: **ACTIVE, NOT ACHIEVED**.
Current phase: **1/2/3 — extended concept policy and staged delivery quality verified locally**.
Next: editorial queue resolution and storage integration; per-unit coverage display verified locally.
All owner objectives in REQUIREMENTS.md remain active. The owner reconfirmed the
million-indexed-page vision and all other objectives after the sitemap discussion.

## Counts and claim boundaries

- Last verified production sitemap: **263 URLs**. No expansion deployed to production.
- Normal local website build: **327 indexable pages**, 688 rendered pages.
- Combined staged reference: **349 companies + 2,701 histories + seven directories
  = 3,057 HTML pages**, with **698 original/selected downloads**.
- Combined with the 263 baseline pages, this could support **3,320 pages** after
  integration/release review. It is not a live or indexed count.
- Extended-v1 candidate corpus: **349 companies + 9,030 histories + seven directories
  = 9,386 reference pages**, with 698 downloads. This is an alternative policy over
  the same captures, not an additional 9,386 pages on top of the core corpus. With
  263 baseline pages it could support 9,649 after integration and release review.
  Not published, approved or confirmed indexed.
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
- Latest full local verification: **352 tests pass (6 + 346)**, clean writing,
  metadata, link, indexability and numerical-source/evidence audits. Log:
  `/tmp/canli-unit-coverage-verify.log`; complete test and final audit output verified.
- Latest extended staged browser review: **48 Chromium/WebKit checks pass**, 390/1440
  widths. Fixed long accounting-identifier mobile overflow and inspected the EPS
  mobile screenshot. Core policy previously passed 28 checks.
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
  **6f8cf355** passes both CI jobs, run **35449094967**. Later coverage-display checkpoint
  needs its own CI check; do not confuse prior CI with later edits.
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
  review before any expansion. That audit did not itself change records or the published concept whitelist.
- Evidence: artifacts/seo/company-concept-breadth.json and its executable audit.
  Source growth review can proceed independently while storage/access is pending.

## Extended policy quality checkpoint

- Versioned extended-v1 adds 25 deliberately selected concepts to the original nine.
  Original default selection and pilot HTML reproduction remain unchanged. Added
  concepts require compatible unit shapes and three reporting ends with varying
  values within one unit; missing or incompatible values are never zero-filled.
- All 25 period/type declarations match a SHA-bound official 2026 FASB taxonomy.
  This does not establish historical taxonomy consistency or editorial approval
  for every company. Definitions are bound to a review receipt in regression tests.
- Full local HTTP replay: 9,386 pages, 698 downloads, exact sitemap agreement, no
  orphan pages, maximum three links from /companies. Maximum HTML 31,652 bytes.
  Local sequential timing is not cloud capacity or real-user performance.
- Initial extended browser run failed on a long weighted-share identifier at 390px.
  Added natural inline-code wrapping; all 44 rerun checks pass. No data hidden.
- See EXTENDED_COMPANY_POLICY.md and artifacts/seo/*extended*.json. Raw captures
  and the captured XSD remain ignored. Preview receipt predates this policy.
- Next: verify this checkpoint CI; review per-company freshness, duplicate-intent
  and comparability flags; continue storage/release integration once access is
  resolved. Search Console and production questions remain pending, unchanged.

## Selected-history editorial queue

- Replayed all349 extended selected records against original bytes. New audit
  flags1,375 of9,030 histories:989 historical-only,223 multiple-unit,74 with an
  old unit masked by a newer unit in the overall date range, seven zero-only core
  histories, and210 pages in105 equal numerical-vector groups. Flags overlap.
- Equality comparison includes kind/unit/start/end/value and deliberately excludes
  filing/accession fields.61 pairs are basic/diluted EPS,40 weighted-share pairs,
  two total/current liability pairs, one operating/SG&A pair and one PPE/payables
  pair. Equality alone is not semantic duplication or evidence of a filing error.
- Seven zero-only histories come from the legacy nine-concept policy; extended
  additions do not introduce them. No records were removed or modified by audit.
- Inspect docs/goal/SELECTED_HISTORY_REVIEW.md and the bound per-page queue in
  artifacts/seo/company-selected-quality-extended.json before publication decisions.
- The EVENTIKO pair reproduces from SEC companyfacts captures, but the underlying
  filing index was inaccessible through the web tool. Direct filing verification
  remains unresolved; do not call this issuer data wrong or independently verified.
- Per-unit coverage display is implemented and verified: multi-unit histories list
  each original unit’s range and identify old coverage independently. Actual
  CNY/USD case passed mobile/desktop Chromium/WebKit checks. Flags remain review
  items; the display change does not approve publication or establish indexing.

## Per-unit coverage display validation

- Shared renderer now adds a per-unit range list for multi-unit histories, with
  independent historical notices and no currency conversion inference. Original
  selected/source records and the staged release roots remain unchanged. Existing
  pilot HTML remains byte-identical (the pilot histories have single-unit coverage).
- Added regression for old CNY2021 versus recent USD2025 coverage and browser
  assertions against actual CIK0001381074/Assets. All48 browser checks pass;
  inspected /tmp/canli-unit-coverage-390.png. Local helper server stopped normally.
- Full verify session24473 completed exit0:352 tests and all final audits pass.
  HTTP session77467 completed exit0:9,386 pages/698 downloads, matching sitemap,
  zero failures and unchanged maximum HTML31,652 bytes. Receipts updated.
- Next: verify this pushed checkpoint CI; resolve outstanding semantic/editorial
  decisions and storage access. Production and Search Console remain pending.

## Engine cost-disclosure correction

- Read-only engine report dated2026-09-19T14:27:43.677129+00:00 still shows four
  current sleeves and four daily forward returns; Sharpe estimate remains null.
  These are report observations, not an independent replay of the live book.
- Found crypto not_charged=[] despite the cost contract listing latency, financing
  and idle-cash yield as uncharged. Equity summaries also omitted the contract’s
  FX row (USD-only context remains in the contract).
- PR68 evaluator correction unions declared omissions with state-reported omissions,
  retains extra runtime gaps, marks absent summaries NOT_PUBLISHED, and binds the
  cost contract by hash in evidence output. Does not charge costs or change returns.
- Portable regression plus cost tests:5 pass; Ruff passes. Initial full module run
  failed20 workspace-dependent checks because isolated data/paper/state.json is
  absent; two tests passed. No full integration pass claimed. New regression is
  in a separate portable test module so clean-checkout CI actually runs it.
- Receipt: artifacts/seo/engine-cost-disclosure-review.json; preserves before/after
  omission lists and source/code/contract hashes. No shared runtime writes.
- Next: verify new PR68 CI and continue cost acquisition/measurement prerequisites,
  qualified-sleeve research and the website release/editorial work. All goals open.

## Next 1,000-company capture batch — running

- Phase1 source acquisition resumed. Captured official SEC ticker discovery at
  2026-09-19T14:42:18.860Z:8,031 unique CIKs. Deterministic next1,000 queue excludes
  existing349-company cohort. Receipts: company-next-batch.json and
  company-next-batch-selection.json. Queue builder committed in d48bb968.
- Active exec_command session **59470**, confirmed live this turn. Command:
  `node scripts/refresh-company-candidates.mjs artifacts/seo/corpus-local/next-1000/ciks.json artifacts/seo/corpus-local/next-1000`.
  stdout /tmp/canli-next-1000-refresh.log; progress next-1000/refresh.json.
- Snapshot 2026-09-19T14:44:46.814471+00:00: 77/1,000 processed, {'eligible_for_review': 69, 'excluded': 8}.
  Partial capture is not reviewed eligibility, deployed pages or indexing. Verified
  staged count remains9,386; actual indexed count unknown.
- Poll59470 before restart. If handle missing, inspect process and terminal refresh
  state. Never restart on observation timeout. Retain source bytes and timestamps;
  403/429 stops require inspection, not automatic retry.
- Queue verification covered duplicate discovery IDs, existing exclusions, same-queue
  resume and changed-queue rejection without overwrite.
- Websiteeaebaa78 passes both CI jobs (35449468907). Engine529b0c7 passes five
  jobs; offline pytest pending (35449467653), no complete-CI claim yet.
- Next: monitor capture and independently review accepted records/exclusions. The
  delivery stager currently requires no exclusions. Create a bound accepted subset
  with explicit exclusion evidence before integration; never silently drop failures.
  Storage, production authorization, Search Console and all other goals unchanged.

## Reproduced exclusions before delivery staging

- reviewCandidates now replays source-based exclusions, verifying capture hashes,
  byte counts, identity and matching selector error. Falsely excluding eligible
  data or altering an exclusion reason produces a review error.
- stageCompanyDelivery remains strict by default. Explicit reviewed-exclusions
  mode permits only a complete cohort with reproduced source exclusions, at least
  one eligible company and no review/HTTP errors. The delivery manifest retains
  queue/refresh/selector hashes and every excluded identity/reason/source hash.
- Focused tests cover altered reasons, eligible records falsely excluded, HTTP
  errors, default rejection and unchanged prior delivery pointer after failure.
  Full verify9578 passes354 tests (6+348) and final audits; log
  /tmp/canli-reviewed-exclusion-verify.log. No source/runtime schema changed.
- Partial real-batch review:137 eligible companies,1,197 core candidate pages,
  112 flagged histories, no reproduction errors; complete=false. Exclusions are
  preserved in company-next-batch-partial-review.json, never hidden. These are
  not added to the9,386 verified extended delivery pages or indexed counts.
- Capture59470 polled live after partial review. Continue same handle; no restart.
  Websitebf84aa05 complete CI passes (35449671934); newer review checkpoint needs
  its own CI. Engine529b0c7 offline tests were pending at last check.
- Next: monitor final capture, rerun full review, stage with documented exclusions
  only after completion, then combine and validate the expanded delivery.


## 2026-09-20 — owner-requested Codex supervision

Codex inspected live Hermes session 20260919_204019_ff927b and local changes.
PR15 remains OPEN at 6cdc9f0e; both CI jobs pass for that head, not dirty work.
Review is recorded in CODEX_SUPERVISION.md. Confirmed staging integrity regression:
reviewReportPath accepts stale external review JSON and bypasses a current HTTP500
capture failure (independent temporary fixture). Existing focused tests pass14/14
but do not cover this bypass. Hermes was sent corrective guidance through its CLI.
Macro-rate artifacts use synthetic inputs and report negative Sharpes; they do not
establish two additional qualified sleeves. P&L sign and drawdown defects require
correction. Pipeline presence/syntax does not establish operational readiness.
Hermes has two event/commodity research children; requested source-backed research
and no promotion or manual manifest concatenation. Prior corpus/indexing and
engine performance claims remain unestablished; all owner objectives remain active.
No release or trading authorization is added by supervision.


### Supervision follow-up — confirmed local correction

Hermes read CODEX_SUPERVISION.md and queued steering for both child agents; the
event-driven child log confirms delivery. Hermes removed the reviewReportPath
execution bypass. Codex independently reran the stale-review/HTTP500 fixture:
rejection now passes and the previous delivery manifest remains byte-identical.
All14 focused tests pass again (/tmp/codex-hermes-review-tests-after.log).
This verifies that specific local fix only. Macro P&L/drawdown, synthetic evidence,
pipeline readiness and full delivery integration remain unapproved/open. No
continuous unattended Codex monitoring service was installed by this review.


## 2026-09-20 — persistent supervisor goal and owner steering

Owner explicitly requested active continued supervision with Hermes implementing
code and Codex leading scope and independent quality review, using concise handoffs
to conserve tokens. Goal is active in Codex. Owner clarified to obtain goals from
Hermes directly; do not spend effort mining past Codex sessions.
Hermes supplied HERMES_GOALS_HANDOFF.md. Review found missing content/SEO/keyword/
API/MCP/adoption objectives, downloads mislabeled as pages and stale child status.
S02 in CODEX_SUPERVISION.md requests corrections plus a permanent source-integrity
regression. Two claimed test passes/completions were rejected: nested-directory
guard and wrong-cwd ENOENT never exercise intended behavior; attempted tool writes
were not present on disk. Directed explicit patch tools, existing valid fixture,
retaining original tests and exact expected-error/unchanged-pointer assertions.
Hermes remains engineer; Codex has not accepted S02 or new algorithm artifacts.
