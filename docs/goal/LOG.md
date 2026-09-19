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
