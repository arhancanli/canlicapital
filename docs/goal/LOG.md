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

## 2026-09-19 — checkpoints pushed; active handles recorded

Website source-audit commit c3c5e3dc pushed to PR 15; PR description updated. Code
hashes in the audit match current selector/worker/auditor; staging-script hash and
archive hash reconcile with the provenance receipt. CI run 35438057534, job
105884006622 is pending. Engine PR 69 commit 783ad0c has passing publication,
PostgreSQL, mypy, Ruff and browser checks; offline job 105882846688 remains running.
These handles must be re-polled, not treated as terminal from elapsed time alone.
No merge, deployment or indexed-page claim. Next source work: correct future collector
quality gates, refresh reviewed candidates with valid capture provenance, then test
serving/discovery expansion. All other owner goals remain active.

## 2026-09-19 — future collection gate correction

Prior goal turn classified as progress. Reread phase records; website c3c5e3dc CI
passes. Engine 783ad0c offline test job still running, other jobs pass.
Created isolated source-quality worktree from origin/main cb59488. Collector v4 now
checks company identity/name and fact-container shapes, records invalid_payload with
source hashes, and preserves malformed caches instead of deleting/refetching them.
Legacy/missing statuses cannot satisfy current completion; counts distinguish legacy
parser records and invalid payloads. Valid entities with no relevant tags stay valid
retrievals, without becoming claims of usable financial-history coverage.

Twenty-three collector and downstream audit tests pass. Read-only evaluation of the
520 real source files is running in session 59355; network is forbidden and original
compressed hashes are checked before/after. No original part/receipt was rewritten.

## 2026-09-19 — collector v4 checkpoint pushed

Added atomic per-download capture receipts binding URL/CIK/raw hash/UTC retrieval time;
legacy caches keep null times and mismatched receipts fail validation. Twenty-four
collector/downstream-audit tests and Ruff pass. Final-code offline evaluation again
checked 520 originals: 146 invalid_payload, 374 fetched, 520 unknown capture times;
compressed bytes unchanged. The tracked revalidation receipt matches the committed
collector SHA-256. No network or original-data mutation occurred.

The first commit attempt failed because the scratch worktree had no Ruff on PATH.
Used the existing verified environment for the hook; commit e0a257c then succeeded
and was pushed in draft PR 70. Removed the temporary untracked .venv symlink afterward.
PR 68 full CI now passes; PR 69 offline job remains running. Source refresh/editorial
review and production release remain next implementation work; actual indexing and
all algorithm outcome goals remain unestablished.

## 2026-09-19 — collector CI checkpoint

PR 70 at e0a257c passes publication integrity, PostgreSQL, strict mypy, Ruff and
browser CI. Offline pytest is running: run 35438489448, job 105885124970. Website
ledger/revalidation commit 68ebb16e pushed. No merge or deployment. Next phase should
prioritize verified source refresh and production-release assessment so the tested
website improvements can become a live corpus; do not repeat completed scaffolding.

## 2026-09-19 — phase 4 source refresh and release snapshot

Reread the continuity folder before moving to release work. Fresh official SEC
captures for CIK 0000029534 and 0000025232 add 15 source-backed pages; local total
327 indexable (seven companies, 56 histories, directory). Actual indexed count is
still unknown, production last verified at 263. Source capture bytes and selected
records are preserved. Keyword ownership grows to 78 with 95 query hypotheses.

Found and fixed Git-free snapshot lastmod fallback: content-hashed source-date
manifest preserves recorded dates, invalidates changed files/directories/symlinks,
and deployment rejects missing-date fallback. Thirteen date tests pass, full
verification passes 302 tests. Snapshot uses the approved helper with this task's
design and current live exports: 690 rendered pages, 327 indexable, metadata and
indexability clean, links within three clicks, visible numerals sourced, all 14
retracted-claim rules pass. Thirty-two browser checks pass across Chromium/WebKit,
390/1440 widths, including both new company/Assets pages and developer links.

Initial preview upload failed at Vercel file upload with TLS invalid session id;
retrying Node 20 plus tgz. The first copy command mistakenly addressed the snapshot
as both source and destination; corrected absolute paths, then the actual strict
snapshot build passed. No production release or runtime source change.

Archive retry created preview deployment dpl_5ePSmH8KyqdsufFWnxxMiqKCMw1b;
CLI inspect reports Building. Local snapshot checks and hashes recorded in
artifacts/seo/release-preview.json. No deployed URL was fetched.

## 2026-09-19 — preview ready, implementation pushed

Vercel CLI inspect confirms Ready for dpl_5ePSmH8KyqdsufFWnxxMiqKCMw1b:
https://meridian-mk8f63w5m-arhans-projects-ac470eaa.vercel.app.
Implementation b02e8a2a pushed to PR 15. Worktree clean after that commit; local
browser server stopped after validation. No production or shared-source mutation.
Next: reread goal folder and review approved design/publisher integration. Search
Console evidence and algorithm forward outcomes remain unresolved. PR 69/70 offline
jobs were still pending at the last check; their other checks pass.

## 2026-09-19 — publishing branch integration

Previous turn classified as progress (preview + pushed implementation). Revalidated
website CI: run 35439160050 passes at 4b236bcd. Engine PR 69/70 offline jobs remain
live/pending; other checks pass. Merged design/glassbox-website-20260908 into the
isolated task branch to reconcile ancestry. The 648 conflicts were generated output
plus four source/config files whose conflicts contained only expansion additions.
Preserved the expansion additions and regenerated all outputs. Existing trial
accounting JS, tests and generators match the publishing branch exactly; verifier
differences are only the new sharded-sitemap reader. Full build and 302 tests pass,
327 indexable pages, no metadata/indexability defects. No shared worktree changed.
The integration merge records history already represented in the tested source;
production pointer remains unchanged. Prepare a reviewable PR targeting the actual
publishing branch before any activation.

## 2026-09-19 — release approval pending; source refresh phase resumes

Remote publishing branch was deleted (ls-remote confirms no head), so no PR against
that branch was created. Integrated review stays in PR 15. Requested explicit
production activation via asynchronous question, citing deploy-to-vercel's preview
restriction. No activation until answer. Continuing phase 1 independently: refresh
the measured eligible cohort into a resumable staged capture set, with source/identity
validation and honest capture receipts, before any further page publishing.

## 2026-09-19 — staged cohort refresh and complete security CI

Added a bounded, resumable source-refresh queue. Captures retain exact source bytes,
hashes and original capture times. Resume revalidates the archive, corrupt receipts
stay available for inspection, wrong identity is excluded, responses stop at 64 MiB,
and 403/429 stop the queue without retries. Six tests pass; added to full CI suite.
First queue preparation used a lowercase status against the uppercase SQLite enum;
assertion stopped with no requests. Corrected to ELIGIBLE_FOR_REVIEW and queued 342
companies. Session 34744 is live, receipts update after each entity; no publication.

Integrated website CI passes at bfca8f45. PR 69 full offline CI passes in 35m37s;
PR 68 and PR 69 are now ready for review. PR 70's offline handle remains live.
Production approval is still pending. Do not change the publisher source or deploy
production without the requested answer. All outcome objectives remain active.

## 2026-09-19 — cohort review and reporting-coverage correction

Previous turn classified as progress; session 34744 re-polled live, not restarted.
Website CI passes at 07b0a3b8 (run 35439588965); PR 70 offline suite still pending.
Independent review replays staged records from original gzip captures, validates
receipt byte counts, identities, capture times and queue summaries, and flags old
coverage/multiple units without automatically approving publication. Five tamper/
partial-result tests pass. First partial review: 179 companies, 1,581 candidates,
zero reproduction errors, 147 old histories under its initial year-based heuristic.

That finding led to a content correction: explicit selected reporting coverage,
visible warning when it ends more than two full years before capture, and Dataset
temporalCoverage metadata. A recent retrieval date must not imply recent accounting
coverage. Shared date-based helper and two boundary tests replace the year-only
heuristic. Full build and 315 tests pass; SEO/number audits pass. Browser verification
of the real Apple Revenues history (ends 2018-09-29) is running in session 20934,
server 88784 on 4288. This changes the local draft; earlier ready preview is not
being claimed as this newer version. Production approval remains pending.

All 36 Chromium/WebKit checks pass, including visible old-coverage warning and
matching Dataset temporalCoverage. Browser server stopped. Evidence and renderer
hashes recorded in artifacts/seo/coverage-browser-review.json.

## 2026-09-19 — refresh and complete cohort review finished

Session 34744 exited 0. All 342 fresh entities eligible for review; independent
full replay yields 2,645 histories / 2,987 candidate pages, zero errors/exclusions.
Fresh gzip originals total 57,540,391 bytes. Current date-based review flags 258
old histories and 76 multiple-unit histories (12 overlap, 322 total flagged).
Toyota's JPY/USD and other foreign-filer currency sets remain distinct. The overview
previously selected one latest row across currencies; corrected to keep each unit
and every same-end interval, with visible start/end columns. A new helper test
covers that loss scenario. Full verification now passes 316 tests. Final browser
pass after the column change is running in 62016; source refresh itself is finished.

Capture summary and final review are tracked. No staged company enters the public
site. Rewrote STATUS to remove contradictory stale running-job statements and retain
current goals, counts, approvals, evidence and next actions.

Final session 62016 passes all 36 browser checks after the unit/interval overview
change. Server 68463 stopped. Updated browser receipt binds final renderer bytes.
