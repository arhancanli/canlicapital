# Progress log

## 2026-09-19 — initial review and pilot (before persistent folder)

Reviewed Claude's website evidence-boundary fixes. Prepared isolated website PR 15,
engine-goal evidence PR 68 and dependency PR 69. Pilot expands local inventory from
263 to 312 indexable URLs; production unchanged. Full pilot validation and limitations
are described in `../GLASSBOX-PLATFORM-VISION-2026-09-19.md` and `STATUS.md`.

## 2026-09-19 — owner minimum recorded

Commit `b1c69aee` records minimum 800,000 and target 1,000,000 actual indexed pages.
Inventory deliberately fails its indexed-minimum gate without search evidence.
PR 15 build passes. Indexed count remains unknown.

## 2026-09-19 — phase 1 started

Found selector issues: malformed dates can throw, impossible end/filing dates were
accepted, and same-filing conflicts could evade detection when a newer filing occurred
between duplicate observations. Implemented corrections and exclusion diagnostics;
four existing company-reference tests pass. Added unvalidated bulk ZIP audit/SQLite
catalog and worker. SEC bulk endpoint returned 403; no whole-corpus count claimed.

Owner added exceptional technical SEO and comprehensive keyword coverage requirements.
Acknowledged intent-based coverage within supported subject areas; no promise of all
queries, global superiority or guaranteed rankings.

## 2026-09-19 — goal launched and continuity installed

At owner's explicit request, created an active session goal covering all website,
search, platform and algorithm objectives. Added this folder and repository AGENTS.md
read/update instructions. Current next action is validation of phase 1 changes.

## 2026-09-19 — developer adoption and repository growth added

Owner explicitly requested stronger on-site repository/MCP/API-key promotion and
an active GitHub repository to grow stars. Added to REQUIREMENTS and phase 6.
Plan: contextual developer links, tested onboarding and useful contributor/release
materials; actual adoption/star counts stay evidence-based. No outreach sent.

## 2026-09-19 — phase 1 tooling validated; phase 2 begins

Seven JS selector tests and five Python catalog tests pass. Initial Python run failed
because system Python 3.9 lacks hashlib.file_digest; replaced with bounded streaming
hashing and reran successfully. Existing captured pilot produces five eligible entities
and 43 histories; `artifacts/seo/company-corpus-pilot.json` explicitly labels this
as a local pilot. SQLite/ZIP stay ignored, no candidate pages are published.
Whole-corpus measurement remains blocked on SEC 403. Moving to independent phase 2.

## 2026-09-19 — phase 2 checkpoint and phase 6 adoption overlap

Built current changes and ran npm run verify: 300 tests pass; metadata zero warnings
or errors; 673 built HTML pages, 312 indexable, 361 noindex, zero indexability conflicts;
19,904 internal links and all indexed-eligible pages within three clicks. All visible
numerals trace to published sources. Intent map: 63 owners, 80 query hypotheses,
249 pages unassigned for deliberate review. Search demand remains unmeasured.

Added company-name titles, visible/schema breadcrumbs, related financial-history links,
API/MCP/GitHub entry points, contributor guide and developer-integration issue template.
The phase 6 adoption work overlaps phase 2 because it uses the same navigation and
page generators; API and MCP implementation are unchanged. CI now installs Chromium
and runs full verification, corpus tests and notification batching tests.

Sixteen Chromium/WebKit checks at widths 390/1440 pass on a fresh production preview
at localhost:4185. Browser evidence/screenshots are in artifacts/qa/company-reference.
Reviewed the mobile assets-history screenshot. Five corpus and seven IndexNow tests
also pass. No live keys issued or notifications sent. Preparing checkpoint commit.

## 2026-09-19 — checkpoint pushed; expanded CI caught shallow history

Commit 2acf8087 pushed to PR 15. Expanded CI passed build/browser install but failed
one of 294 main tests: source modification dates collapsed to the checkout date in
GitHub's shallow clone. Local full-history tests had passed. Set actions/checkout
fetch-depth to zero so source-derived sitemap dates remain meaningful. No test was
removed or relaxed. Engine phase 7 inspection started (historical lockfile bindings
also govern migration/replay), then deferred to resolve this website CI failure.

## 2026-09-19 — remote CI passes; next-phase evidence preserved

PR 15 commit 78f914bd passes every expanded CI step on Linux/Node 22, including full
verification, corpus integrity and notification batching. Run 35437145441. The
implementation checkpoint is 2acf8087; 78f914bd fixes full-history checkout.

Engine inspection recovered c57be7b^:uv.lock and verified its SHA-256 equals the
historical publication/migration binding. ENGINE_ENVIRONMENT_REVIEW.md records why
an archival fallback alone is insufficient for replay and the acceptance checks for
a correct fix. No engine files were changed. Phase 7 fix remains outstanding.

Added a CanliCapital-scoped pointer to /Users/arhancanli/AGENTS.md so a continuation
starting in the home directory also rereads this folder after compaction. Goal remains
active. No PR merge, deployment, actual-indexing measurement or algorithm-goal claim.

## 2026-09-19 — phase 7 implementation started

Previous turn classified as progress: website state, CI and continuity artifacts changed.
Reread goal folder and rechecked PRs. PR 69 still has the two known failures; prior
pytest jobs remain pending. Implemented a narrow uv.lock archive resolver with
explicit historical-only receipts, preserved exact old bytes, and added an active
workspace recheck before replay enqueueing. Historical packet/manifests are unchanged.
Seventeen targeted unit checks pass (one private-workspace evidence check deselected).
Broader checks and remote CI pending. No dependency installation of archived versions,
no replay, database mutation, deployment or broker operation performed.

## 2026-09-19 — phase 7 fix committed, wider local checks pass

Engine commit 783ad0c implements historical lock verification and an enqueue-time
workspace-file guard. Forty-nine tests pass; one private-workspace test is explicitly
deselected. Strict mypy and Ruff pass. Publication verifier passes all 16 bundles,
402 checksum-bound files and 32 environment bindings; it still establishes zero new
full reproductions. Original publication and migration files have no diff. PR 69 body
updated with the final approach and limits; push and remote CI are pending handles.

## 2026-09-19 — phase 7 failing jobs fixed; phase 1 source opportunity found

Engine PR 69 commit 783ad0c passes publication integrity, PostgreSQL contracts, mypy,
Ruff and browser CI. Offline pytest remains running (run 35437603714, job 105882846688).
Found 520 local companyfacts gzip files under AlphaForge/data/raw/repurchase_issuance_flow.
The August collection receipt reports 520 successes and 80 terminal 404s in a selected
600-issuer research sample. Exact bytes, part lineage and per-file statuses still need
verification. Capture timestamps are not recorded per file; do not invent them from
filesystem dates. Resuming phase 1 to audit these inputs using an explicit observed-by
boundary, while keeping individual fetch times unknown and publication unapproved.

## 2026-09-19 — existing source cohort audited without inflating page counts

Verified the collection receipt's semantic hash, all 48 part hashes/sizes, issuer-manifest
hash/identities and all 520 raw snapshot hashes/sizes. Staging initially stopped at an
empty-name/string-CIK response marked fetched. Kept source-byte verification distinct
from eligibility: stage all receipt-bound bytes, then reject unusable entities with
the production selector rather than silently drop them or treat fetched as valid.

Results: 344 eligible companies, 2,657 histories, 3,001 candidate pages, zero overlap
with the current five-company pilot; 146 invalid entities and 30 insufficient-coverage
entities excluded. Eight company-reference tests and six catalog tests pass. Added
observed-by support that leaves actual capture times null; publication explicitly
rejects missing or malformed UTC capture timestamps. No candidate was published.

Tracked evidence: artifacts/seo/research-collection-provenance.json and
artifacts/seo/research-company-corpus.json. Local ZIP/SQLite remain ignored. Full-site
verification is running in session 82535. Do not claim it passed until rechecked.

## 2026-09-19 — source-audit checkpoint validation completed

Session 82535 completed successfully: 301 website tests (6 preverify + 295 main)
and all publication/metadata/number/link/indexability audits pass. Six catalog tests
also pass. The existing five-company generator produces unchanged pages; no rendered
HTML changed in this follow-up, so prior browser evidence still applies to those bytes.
Preparing commit/push of source-audit code, source-provenance receipts and this ledger.
