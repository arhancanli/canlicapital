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
