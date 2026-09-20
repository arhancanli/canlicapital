# Current state

Updated: 2026-09-20. Overall goal: **ACTIVE, NOT ACHIEVED**.
Owner: Arhan Canli. Implementation and review: **Codex directly**.
Hermes acknowledged stop and idle at 08:01 local. No further Hermes delegation.
Read REQUIREMENTS.md for the complete owner objectives; none were removed.

## Current checkpoint

Current checkpoint: combined delivery for 1,202 companies verified locally under
extended-v1. Next: editorial release policy, durable storage and hosted preview
integration. Prior releases remain unchanged; publication is not approved.

- Restored the full package.json verification command after Hermes replaced it with
  four tests, dropping the remaining tests/audits. Existing gates retained.
- Replaced its broken source fixture with two real-source regressions: stale review
  cannot override HTTP500 or omit a failed company; both preserve prior manifest bytes.
- Staging always recomputes source review. Verified 404 exclusions require a bound
  response receipt; a generic reproduced flag is insufficient.
- Takeover focused tests 16/16; full `npm run verify` **362/362 (6+356)** and all final
  writing, metadata, links, indexability and numerical-evidence audits pass.
  Logs: /tmp/canli-takeover-focused.log and /tmp/canli-takeover-verify.log.
- Fresh next 1,000 source replay: complete=true, **853 candidates, 7,449 candidate
  pages, 676 flagged histories, 147 exclusions, 0 errors**. Exclusions: 51 invalid
  entities, 35 insufficient coverage, 61 captured 404 responses. No captures rewritten.
  Receipt: artifacts/seo/company-next-batch-codex-review.json.
- Website PR15 OPEN at **fb0a05de**; CI **35489967924** completed successfully
  for this exact head. New editorial evidence below has separate commit/CI state.
  No production deployment claimed.

## Counts and boundaries

| Measure | Evidence/status |
|---|---|
| Actual indexed canonical pages | Unknown; search-engine evidence pending |
| Owner minimum/target | 800,000 /1,000,000 actually indexed |
| Last production sitemap observation | 263 URLs on 2026-09-19; not freshly measured |
| Current static local verification | 688 HTML pages,327 indexable,361 noindex |
| Prior extended staged delivery | 349 companies + 9,030 histories + 7 directories = 9,386 pages; 698 downloads |
| New extended staged cohort | 853 companies + 22,697 histories + 18 directories = 23,568 pages; 1,706 downloads; not deployed |
| Combined extended staged delivery | 1,202 companies + 31,727 histories + 25 directories = 32,954 pages; 2,404 downloads; not deployed |

The core/extended policies are alternatives over the same source, not additive.
Staged page/download counts prove neither release approval nor search indexing.
Prior staged HTTP/browser evidence is in company-delivery-extended-measurement.json
and company-delivery-extended-browser.json. It predates this takeover.

## Quality, platform and engine objectives

- Source-backed useful distinct accessible maintained content; relevant intent
  coverage and exceptional technical SEO remain mandatory before expansion.
- Current static intent audit: 78 canonical owners, 95 hypotheses, 249 pending reviews.
  No demand, ranking, adoption or worldwide superiority claim.
- Open-source glass-box platform, tested API/MCP onboarding, contributor guidance
  and genuine developer/repository adoption remain active objectives.
- Engine targets: combined NET FORWARD Sharpe > 2; at least 14 economically distinct
  qualified sleeves; realized combined maximum drawdown <= 10%; disclose costs/gaps.
- Fresh read-only inspection: four sleeves and five current-epoch daily returns,
  report dated2026-09-20T04:26:55Z. Embedded hash and all source bindings match.
  Sharpe remains null/immature; no current outcome established by this takeover.
- Hermes algorithm prototypes remain UNAPPROVED: synthetic data, P&L/drawdown
  defects and absent qualification evidence. See artifacts/algo/README.md.

## External dependencies and next steps

1. Resolve editorial publication rules for the combined review queue, preserving
   historical coverage, original units and semantic distinctions.
2. Integrate durable storage and verify a hosted preview using the combined release;
   keep noindex and genuine error responses until release approval.
3. Storage-provider/access remains unresolved in earlier work. Preview packaging
   existed, but hosted-data runtime and production integration remain unverified.
4. Search Console measurement is pending. Production activation remains a separate
   unresolved release decision from prior sessions; local continuation is authorized.
5. Reverify engine PRs/contracts/current evidence and prioritize governed research;
   do not promote prototypes, rewrite historical evidence or place broker orders.

Current task ledger: EXECUTION_LEDGER.md. History: LOG.md and
history/STATUS-20260920-before-direct-takeover.md. Historical Hermes reports are
explicitly superseded; their success claims are not acceptance evidence.

## T04 delivery checkpoint — 2026-09-20

- New-cohort release a79b6775e1dd93566ad806d79eb93b3a709073d0c99406433c16cb8852c5eacd.
  Catalog 0c020bde…; download 2419de96…. Prior 349-company release unchanged.
- Full local HTTP replay: 23,568 pages, 1,706 downloads, exact sitemap agreement,
  zero failures/orphans, maximum 3 links from /companies, maximum HTML 36,223 bytes.
  Local sequential timing is not cloud capacity or real-user performance.
- 54 Chromium/WebKit sample checks pass at 320/390/1440 widths. Two mobile screenshots
  inspected. Samples include longest issuer/concept names, most observations/units,
  large values, EPS, first/last directories. This is not all-page browser coverage.
- Selected-history audit: 2,549 flagged histories; overlapping 2,416 old-coverage,
  three multi-unit/partially historical, 13 constant (12 zero-only), 128 equal-vector
  pages in 64 groups. Preserve source values; no editorial approval inferred.
- Added mixed valid/404 staging regression; corrupt HTTP body preserves prior pointer.
  Focused 17/17 pass; prior full 362-test suite predates this extra test only.
- Evidence: artifacts/seo/company-next1000-{stage,release,discovery,browser}-extended.json,
  company-next1000-delivery-extended-measurement.json and
  company-next1000-selected-quality-extended.json. Original objects remain ignored.

## Combined delivery checkpoint — 2026-09-20

- Combined release: `3f7a621bdb49d3131219daba07c9f7a842b26ba959f5c84dac2349d14b6e9cd6`.
  Exact pinned source manifests, original download indexes, source/selected objects
  and all 147 exclusions retained. Input manifests and releases unchanged.
- Full verification: **368 tests (6+362)** and all final audits pass. Five combiner
  tests cover valid release construction, original evidence traversal, bad pins,
  corruption, duplicate identities, mixed policies, forged values and writer locks.
- Local HTTP: **32,954 pages / 2,404 downloads**, exact sitemap, no failures/orphans,
  maximum **four** links from /companies (new larger directory hierarchy), maximum
  HTML 36,223 bytes. Do not retain the smaller cohorts' three-link claim here.
- Browser: **54 checks** across nine deterministic samples, Chromium/WebKit,
  320/390/1440 widths; mobile longest-issuer screenshot inspected. No failures.
- Editorial queue: **3,924 flagged histories**; overlapping 3,405 historical-only,
  226 multi-unit, 77 partially historical-unit, 20 constant including 19 zero-only,
  and 338 equal-vector pages in 169 groups. These flags are not resolved by rendering.
- `COMBINED_DELIVERY.md` documents reproduction, pin authority and publication limits.
  Receipts: `artifacts/seo/company-combined-*.json`. This combined corpus replaces
  the separate cohorts for serving; never add combined and input page counts.
- 554 unapproved Hermes-generated files moved into ignored `.bak/hermes-20260920/`;
  every byte hash verified after relocation. `artifacts/algo/archived-inventory.json`
  preserves paths/hashes. Source captures and accepted implementation remain intact.
- Logs: /tmp/canli-combine-final-verify.log, /tmp/canli-combined-http.log,
  /tmp/canli-combined-browser.log. Publication/indexing/forward outcomes remain open.

## Storage preparation — 2026-09-20

- Reachable runtime/provenance plan: **3,927 objects / 505,062,941 bytes**.
  Full local plan and bound summary documented in STORAGE_READINESS.md.
- Full `npm run verify`: **371 tests (6+365)** and final audits pass; log
  /tmp/canli-storage-verify.log. Three storage-plan regressions pass separately.
- No upload or remote mutation. Vercel lists production Supabase settings, but
  parsed export did not yield a usable HTTPS project URL. Temporary files deleted;
  no secret values printed and no bucket call attempted. Owner connection question pending.
- Runtime upload planning excludes original acquisition queues and excluded-response
  bodies; separate verified capture backup remains required. No recovery claim.
- Next independent work: editorial publication rules and fresh governed engine
  evidence while awaiting storage details. All owner objectives remain active.

## Engine inspection — 2026-09-20

- PR68 head529b0c7, PR69 head783ad0c and PR70 heade0a257c remain OPEN; all six
  checks pass for each exact head. These passes exclude local uncommitted edits.
- Found malformed uncommitted ERCAllocator addition in engine goals worktree:
  invalid escaped quotes prevented Python parsing. Preserved full original and patch
  under .bak/codex-takeover-20260920, hash27505a144839467f8c2a12ed7d7abf4e9f9664332449f5dcb7cf9924f8284780,
  restored exact committed optimizer. Authorship not independently established.
- Existing runtime report: five daily returns versus252 estimate/756 establishment
  minima, four sleeves versus14 target; no Sharpe estimate. Realized drawdown
  reported3.8964% to date, which does not establish a future10% bound.
- Correction to stale mechanism wording: actual drawdown contract records live=true,
  activation2026-09-15 and prior owner decision. owner_goals.json still contains
  older not-live prose; reconcile this separately without changing sealed history.
  This inspection changes no runtime, orders, risk settings or activation.
- Receipt: artifacts/algo/engine-evidence-inspection-20260920.json. Existing report
  embedded hash and every source binding verified; this is not an evaluator rerun
  or independent replication. Cost omissions remain visible.

Focused optimizer/cost-disclosure validation: **41 passed**, explicit imports from
the repaired goals worktree. Earlier cross-worktree import run is not acceptance.

## Governed research checkpoint — 2026-09-20

- Activation wording resolution: PR68 already projects current status from the risk
  contract and labels owner-goals status as historical. Verified19 owner-goal tests;
  do not overwrite historical configuration prose. Prior "needs repair" note resolved.
- Spin-off diagnostic previously counted unverified cache files and hardcoded its
  verdict. It now requires the exact98 unique frozen hashes before measuring; failed
  input validation leaves the existing output unchanged. Verdict follows token count.
  Removed the automatic claim that unmatched-token documents had been human-reviewed.
- Seven new integrity tests plus19 owner-goal tests pass (26 total); Ruff passes;
  clean-checkout publication integrity passes for16 bundles/39 code bindings.
- Real replay:98/98 hashes match; shipped detector16 hits, any-token11, nearby-token5,
  six shipped hits without token. Frozen30% gate remains unreachable by token-detector
  repair. DATA_GATED remains; no market data, returns or hypotheses opened.
- Engine change61b587f pushed on PR68; exact-head CI must be checked separately.
  Receipt artifacts/algo/spinoff-prorata-integrity-replay-20260920.json.
- Registration inventory records204 initial candidates2016–2025, not204 confirmed
  events and not756 daily out-of-sample observations. These units cannot be compared
  directly to establish admission feasibility. Other research routes retain their
  author, independent-label and source-timing gates.

## History context checkpoint — 2026-09-20

- Added shared numerical-history comparison and source-preserving explanations for
  matching concepts and per-unit constant/zero values. Kept all definitions, source
  values and separate pages. Two new renderer regressions pass.
- Full npm verify passes373 tests(6+367) and all final publication/SEO audits.
  Reproduced combined quality queue unchanged:3,924 flagged histories; no editorial
  approval inferred. Full HTTP replay and expanded browser sampling pass.
- COMPANY_EDITORIAL_POLICY.md records flag-specific treatment and remaining review,
  including six unusual equal-history pairs. Disclosures do not clear release gates.

- Final checks:32,954 pages/2,404 downloads, exact sitemap, zero failures/orphans,
  four-link directory bound;66 browser checks over11 routes at320/390/1440 in
  Chromium/WebKit. Equal-history mobile screenshot inspected. No production claim.
- Disclosures cover338 matching-history pages and24 pages with a constant unit
  (19 zero-valued). The prior20 constant audit flags require all units constant;
  this24 count includes histories with only some constant units, so it is not a
  change in the audit definition or source values.
- Website prior6108a391 CI35489757169 passed. Engine61b587f run35489715539
  remains in progress at this check. New website changes require their own CI.

## Exceptional matching-history review — 2026-09-20

- Inspected six pairs across five companies against their latest selected filings;
  all28 selected observations match undimensioned inline facts after period, unit,
  scale and sign checks. Also inspected Eventiko2024 for the11000 asset/liability
  values and separate source rows. All12 capture bodies(6indexes/6primaryfilings)
  match retained receipt hashes and byte lengths.
- Decision: retain distinct concepts with comparison context, no equality-driven
  merging. COMPANY_PAIR_REVIEW.md and company-exceptional-pairs-filing-evidence.json
  record scope, facts and limitations. Other editorial/release gates remain open.
- New filing captures live in ignored corpus-local/editorial-filings and must join
  the separate durable evidence backup. Existing runtime upload inventory excludes
  them. Initial web-reader error and Python403 retained as failures, not evidence.
- Websitefb0a05de CI35489967924 passed; engine61b587f CI35489715539 remains running.

## Developer integration checkpoint — 2026-09-20

- MCP HTTP/API failures now set isError while retaining full response envelopes;
  negative validation verdicts remain normal results. Failed key issuance cannot
  install a session key. Added30-second header/body deadline, redirect rejection,
  no automatic retry and transport errors that omit reflected response bodies.
- Runtime version now follows package.json(0.1.1) rather than hardcoded0.1.0.
  Added missing MCP CI job: locked install, high-severity audit and package tests.
- Clean npm ci and48 MCP tests pass, including real stdio success/error handshake,
  stalled-body timeout, credential redirect prevention and secret-safe errors.
  npm audit reports0vulnerabilities. Package dry-run contains README/package.json
  and two source modules; no package published or version bumped.
- Public read-only status check2026-09-20T04:55:53Z succeeds without credentials;
  store_reachable=true,12 total validations,0today,0keys today. This is server
  telemetry, not independent developer adoption, attribution or durable storage access.
  Receipt artifacts/developer/mcp-status-check-20260920.json binds local handler.
- Prior websitedfdae74a CI35490262960 passes. Engine61b587f run35489715539 still
  running when checked; no current complete engine CI pass claimed.

## Third1,000 source capture — 2026-09-20

- Fixed batch selection to skip pinned prior queues as well as accepted companies;
  three regressions cover exclusion membership, tampering and queue preservation.
  Full verify passes376 tests(6+370) and final audits; log/tmp/canli-batch-selection-verify.log.
- Retained ticker snapshot has8,031 CIKs; skipped1,197 already staged and147 prior
  non-admissions; new queue1,000, remaining unqueued5,687. Not publishable counts.
  Receipts:company-prior-capture-queues.json and company-third-batch-selection.json.
- Capture started2026-09-20T04:59:42Z; live exec session **73982**, directory
  artifacts/seo/corpus-local/third-1000, log/tmp/canli-third1000-capture.log.
  Last verified49/1000 processed:41 eligible-for-review,5 excluded,3HTTP errors,
  stopped=null, no finished_at. This is an incomplete checkpoint, not acceptance.
- On continuation poll73982 first; do not launch another capture from a stale
  progress file or an observation timeout. Finish/replay the original queue before
  confirmed404 review or staging; preserve every failure. Existing release unchanged.
- Websitead264cef CI35490429296 passed, including new MCP CI. Engine61b587f
  run35489715539 remained active at the last poll.
