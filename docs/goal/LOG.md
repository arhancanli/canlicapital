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

Coverage/review implementation ad83b53c pushed to PR 15. Capture job is terminal;
no source job needs polling. Remaining active CI is tracked on the PR. Production
and Search Console answers remain pending. Saving final directory screenshots and
browser report with this checkpoint.

## 2026-09-19 — phase 3 begins

Previous turn classified as progress. Reread requirements/status/phase records and
verified current worktree. PR 70 complete CI passes (35m32s offline); ready for review.
Starting immutable, bounded company catalog lookup using the measured fresh corpus.
Company data must not grow the Vite entry graph or require reading all records for
one request. Build hashed records plus bounded range-index nodes; validate bytes,
CIK identity, misses and corruption, and measure actual cohort resource use before
connecting a production storage backend. No production activation or index claim.

## 2026-09-19 — real-corpus storage and HTTP lookup checkpoint

Implemented immutable hashed company records with a bounded range-index tree,
4 MiB byte cache, validated levels/ranges/identities, and directory cursors that
read issuer names without loading financial histories. Nodes split at 128 entries
or 64 KiB; 1 MiB record limit and eight-level maximum. Single-writer staging lock
and pointer-last commit preserve the prior revision on a failed build.

Added staged company GET/HEAD and directory API handlers with ETags, read-only CORS,
correct 404-vs-503 handling and revision-aware pagination. Backend is not configured;
endpoints are not promoted as live. Twelve tests pass, including concurrent cache
accounting, Unicode byte boundaries, corrupt nodes, outage behavior and CORS.

Local HTTP measurement reproduced all 342 captured records, traversed seven directory
pages, and verified missing-company/HEAD/304 behavior. Four index nodes, two levels,
6,553,492 selected-record/index bytes; largest object read 41,977 bytes. Original
57.5 MB compressed source captures remain separate. No cloud/million-page/indexing
claim. See COMPANY_CATALOG.md and artifacts/seo/company-catalog-measurement.json.
Full verification is running in session 66132. Re-poll before claiming completion.

Session 66132 completed successfully: 328 tests (6 + 322), all evidence/SEO/number
audits pass. Building an updated preview snapshot in /tmp/canli-catalog-preview.pFGuSc
to verify deployment packaging; staged data and catalog activation remain excluded.

## 2026-09-19 — deployment packaging verified; validation isolation fixed

Implementation 5e57941a pushed and complete CI passes (run 35440819352). Updated
snapshot local audits pass: 690 pages, 327 indexable, zero metadata/indexability
defects, numerical-source audit and all 14 retracted-claim rules pass.

First cloud preview dpl_D7J9MKioPjize4MsUN82r6R2peSM failed the source-date guard:
local validation had rewritten homepage figures from fresh exports, but its portable
binding described the original input. The issue was the upload workflow; the guard
was not weakened. Restored the bound homepage input and retry deployment
**dpl_3xmLsji65LwWt1BmnxhSoBv4bytE is Ready**, both company API functions packaged:
https://meridian-c2lklakk2-arhans-projects-ac470eaa.vercel.app.

Added validate-deploy-snapshot.mjs: validate a separate clone, leave upload inputs
unchanged. Its mutating-prebuild regression passes, and actual snapshot clone build
passes. No remote preview URL was fetched. Updated proof in catalog-preview.json.
No source catalog upload/activation, production change, indexed-page or cloud-load
claim. Next: source-download backend mapping and catalog-backed HTML/discovery.

## 2026-09-19 — staged HTML and immutable source downloads

Continued phase 3 after rereading all continuity records. Prior checkpoint f5ab6199
has passing remote CI. Extracted the existing company renderer and proved all pilot
company/history documents byte-identical. Added compiled-resource mapping and an
injected catalog HTML handler, retaining original-unit/coverage warnings, provenance,
JSON-LD and GitHub/MCP/API-key links. Fixed reserved internal renderer targets being
accepted as public history names; regression now rejects /all and /overview aliases.

Combined 342 fresh and seven pilot records into a 349-company catalog. Staged 698
immutable original/selected downloads; raw and compressed hashes remain distinct.
Local HTTP measurement passed all 349 overviews, 2,701 histories and seven bounded
directories (3,057 reference pages), five compiled assets, HEAD/304 and genuine404s.
No new Vite entries or public catalog activation. Browser checks passed28 cases in
Chromium/WebKit at390/1440; inspected the mobile Toyota screenshot. Local test servers
stopped. Source corruption regression returns503 and preserves prior delivery pointer.

Final full verification is running in session29894. No cloud-load/indexed-page claim.
Next: pin production source lookup and crawl discovery to the catalog revision,
then deployment packaging and release review; existing production/Search Console
questions remain pending. Algorithm and developer adoption objectives remain active.

Full verification first passed 335 tests (6 + 329), then failed the writing ratchet
on two em dashes in the new directory titles. Replaced punctuation; no contract
ceiling was changed. Re-running the complete verification after that correction.

Session49160 completed successfully:335 tests and all writing, metadata, link,
indexability, publication and numerical-source audits pass. Final full-cohort HTTP
measurement also passes after routing/breadcrumb corrections. Restored only build-
generated timestamp/hash churn; no engine records or shared files were changed.

Checkpoint7a398ff6 pushed to websitePR15 and description updated. New remote CI
run35442251005/job105894975571 is pending; verify it next rather than repeating
local tests. Working tree was clean after push. GitHub's push message surfaced
default-branch Dependabot alert1:esbuild moderate development-server exposure,
fixed0.25.0. Read-only alert lookup confirms open; package-lock packages lookup
found no matching esbuild entry, so dependency lineage/remediation remains to inspect.
No security fix is claimed from that lookup.

## 2026-09-19 — bounded download lookup, release binding and wrapper security

Previous turn was progress. Reread continuity; verified ef1061c4 CI passes. Replaced
local download request map with hash-trie lookup:64KiB nodes,128 descriptors/leaf,
16 children/branch,256KiB cache and prefix/hash/byte checks. Added verified-byte HTTP
adapter and GET/HEAD download handler, with real404 vs503 outcomes. All698 downloads
and3,057 staged HTML pages pass HTTP replay. Measured17 index nodes/184,535 bytes,
maximum node13,676 bytes. Added immutable release binding after selected-record and
original-source replay across349 companies; corruption preserves the old pointer.

GitHub alert1 is the design-system esbuild dependency, not the root Vite lock.
Upgraded0.23.1 to0.25.12; npm audit returnszero vulnerabilities. Authoritative advisory:
https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99.
First wrapper build failed on omitted optical-handoff.mjs; copied the shell dependency
in the generator and ignored the generated copy. Wrapper build/60 tests pass.
Added dedicated wrapper build/test/audit CI so this path stays checked.

Full website verification running in session55417. Next work is bounded crawl
discovery and production release/storage integration. Production/Search Console
answers remain pending; all owner indexing/adoption/algorithm objectives stay active.

Session55417 completed successfully:339 tests (6 +333) and all writing, metadata,
indexability, link graph and numerical-source/evidence checks pass. No additional
UI change required another browser pass. Existing28 staged browser checks remain
the layout evidence; download behavior is covered by the new HTTP replay.

Implementation commits093fb0fd/e6eb2ed7 pushed to PR15. Updated description includes
source bounds, release binding, wrapper security and remaining discovery work.
Remote CI35442672656: wrapper job passed; website job105896110867 verified live.
Next turn should check the existing job/current PR head before new implementation.
No uncommitted runtime or generated-data mutation remains from this checkpoint.

## 2026-09-19 — bounded directory and release-bound crawl discovery

Previous goal turn made concrete progress; subsequent interruption was for the
owner's status/sitemap questions. Owner reconfirmed all goals and asked to continue.
Rechecked actual worktree and completed processes before resuming. Prior head
7bbfae30 passes both CI jobs (35442727719); this does not cover unpushed changes.

Implemented ranked catalog directories: skip whole counted branches, read no
financial records, no complete CIK boundary list. Added range navigation bounded
at 20 links/level on existing directory pages, with unique range descriptions,
previous/next links and canonical breadcrumbs. Synthetic 20,000-page traversal
passes at four links; the initial three-link expectation failed and was corrected.
No synthetic pages were published or counted toward the owner target.

Added asynchronous sitemap enumeration using the existing protocol writer, pinned
to a verified release. Failure during enumeration/count checks preserves the prior
discovery pointer. Staged sitemap contains 3,057 URLs/410,440 bytes. Local HTTP replay
checks exact equality with served pages, all 698 downloads, zero orphan references
and maximum three links from /companies. This is not homepage depth or indexing.

Session 91397 completed: 344 tests (6 + 338), all writing/SEO/evidence audits pass.
Session 44658 completed full HTTP measurement. Browser session 61303 completed all
28 Chromium/WebKit mobile/desktop cases; inspected the mobile page-seven directory.
Local servers stopped. Updated STATUS to one current snapshot, retaining history
here instead of leaving contradictory stale pending states in the restart checklist.

## 2026-09-19 — one verified release for serving

Committed interrupted discovery work as de0df95f and pushed PR15. Both CI jobs pass
(run35447039133). Owner's latest instruction reconfirms the million-indexed-page
vision and every earlier platform/algorithm objective; no requirement was dropped.

Added company-release.js to verify a <=4KiB immutable release, validate root/count
bindings, and assemble company HTML, directory and download handlers together.
Concurrent first requests share validation; an initial outage can recover on retry.
The source object cannot switch on indexing through its approval field. Public
indexing remains disabled until explicit production activation integration.

Local QA now serves through the shared verified-release router, rather than wiring
separate unchecked roots. Passed all3,057 pages,698 downloads and matching sitemap,
zero orphan pages, maximum three clicks from /companies. Preserved request method
and headers explicitly so native Node header getters survive dispatch. Three new
release tests cover shared revision, corruption/count mismatch and outage retry.
Full verification session85142 passed347 tests (6 +341) plus writing/SEO/evidence
checks. Local HTTP session79385 completed. No production configuration or deployment.
Next: real storage, public wrappers, asset/sitemap packaging, preview verification.

## 2026-09-19 — staging API wrapper and storage discovery

Previous goal turn classified as progress. Reread continuity and verified687d6e62
passes both CI jobs (35447238812). Added environment-configured verified-release
wrapper at /api/v1/company-reference, with compiled asset includeFiles configuration,
HTTPS storage adapters, required release/base settings, noindex responses and503
when unconfigured. Canonical site rewrites remain unchanged. Wrapper integration
fixture passes; full verification session67317 passed348 tests (6 +342) and all
writing/SEO/evidence checks. Vercel packaging has not yet been deployed/verified.

Read-only Vercel env listing identified existing Supabase variable names. Asked
owner for existing storage provider/bucket (no secrets requested) while continuing
independent wrapper work. Two exports lacked usable Supabase URL/key values: first
inspection raisedTypeError, second diagnosed missing exported values before any
bucket request. Deleted both temporary export files; verified final absence. Do
not infer the production credentials are absent or attempt to dismiss this as a
storage-service outage. No bucket/storage/settings mutation. Storage answer remains
pending; production and Search Console questions are unchanged.

## 2026-09-19 — wrapper packaging preview and source growth inventory

Previous goal turn was progress. Reread continuity and deployment skill. Verified
7ce4557c complete CI passes (35447499909). Created a Git-archived upload source at
/tmp/canli-wrapper-preview.OR9LYO and validated an isolated clone successfully,
including all five compiled company-page resource references. Uploaded the pristine
source using Node20 Vercel CLI/tgz; no live engine exports overlaid for this packaging
check. First inspect showed Building; next inspect verified **Ready** for
**dpl_67SAYaPX9s9BGzQ9pn4ecdUb4frr**, listing company-reference at36.84KB:
https://meridian-atulevugw-arhans-projects-ac470eaa.vercel.app.
No remote preview fetch, corpus activation, production deploy or index claim.
Evidence and source hashes saved in wrapper-preview.json.

While storage answer remains pending, overlapped phase1 source-growth review with
phase3 packaging. Read-only audit of349 original captures reuses selectObservations
and verifies source/selected bytes. Found102,282 company/concept histories,99,581
outside current selection. Follow-up flags1,883 exact duplicate observation vectors,
2,302 zero-only and4,378 constant-per-unit histories (overlapping). Source labels
and observation shapes are not reviewed taxonomy meanings or approved page intents.
No page count increased. Audit makes the next editorial/taxonomy prioritization
concrete instead of extrapolating the existing nine concepts to one million pages.
Audit sessions41094/65485 completed exit0. Runtime/production code unchanged this
turn; existing348-test evidence remains applicable to those unchanged paths.

## 2026-09-19 — extended accounting policy and mobile quality review

Reread continuity after compaction; owner vision remains fully active. Verified
5fae3c06 passes both CI jobs (35447926796). Captured official 2026 FASB taxonomy
and checked 25 selected concepts against its period/type declarations. Introduced
extended-v1 with explicit policy dispatch and frozen definition receipt; legacy
selection and pilot reproduction stay unchanged. Added compatible unit shapes and
within-unit varying-history gates for new concepts. Reviewed source meanings;
excluded balance-sheet identity and arbitrary tag permutations from this expansion.

Staged separate original/selected delivery and replayed it into a bounded catalog.
349 companies, 9,030 histories, seven directories =9,386 candidate HTML pages;
698 downloads. Release/discovery receipts are unapproved and local only. Full HTTP
check confirms all pages, hashes, download replay, sitemap equality, no orphans
and three-link maximum from /companies. Initial browser check failed because
WeightedAverageNumberOfDilutedSharesOutstanding overflowed at390px. Inline-code
wrapping fixed the cause; rerun passes44 Chromium/WebKit checks. EPSmobile screenshot
visually inspected. Full verify completes351 tests (6+345) and writing/SEO/evidence
audits. Retained failure description; restored only this build's timestamp/hash
churn after JSON comparison and source-date diff review.

New evidence: company-extended-taxonomy-review.json, taxonomy-source.json,
company-release-extended-staged.json, company-discovery-extended-staged.json,
company-delivery-extended-measurement.json and company-delivery-extended-browser.json.
Preview is older than these changes; no production activation or index claim.
Storage/access, Search Console and production authorization questions remain
pending. Next: pushed-head CI, per-company semantic/freshness review and storage
integration; all developer and governed engine objectives remain active.

## 2026-09-19 — selected-history quality queue

Previous goal turn was progress (5f462c70). Reread goal records; verified both CI
jobs pass for that exact checkpoint (35448841972). Added a read-only source-replay
audit for selected histories, preserving production and immutable captures. It
checks each unit's coverage separately and numerical-vector equality independent
of filing/accession differences. Session72030 completed exit0. Independent Python
reconciliation confirms counts, unique paths, flag totals and the seven zero-only
core histories; no added-policy constant history slipped through.

Found1,375 flagged histories with overlapping989 old-coverage,223 multiple-unit,
74 partially historical-unit,7 zero-only and210 equal-vector-page flags.105 equal
vector groups are pairs. The unusual EVENTIKO PPE/payables pair reproduces from
captured companyfacts, including USD11,000 at2023-04-30 and zeros in adjacent years.
This is not independent filing verification: SEC filing-index web open returned
inaccessible. Preserve that uncertainty; no arbitrary correction or merge.

Saved per-page queue and review priorities.74 histories reveal a concrete display
gap: their overall newest date can obscure an old original unit. Next: improve
per-unit coverage presentation, test the real case, then continue editorial and
storage/release work. Runtime/selector code unchanged this turn; prior351 website
and44 browser check results apply to those unchanged paths, not a new runtime test.

## 2026-09-19 — per-unit coverage presentation fixed

Previous turn was progress (6f8cf355). Reread continuity; both CI jobs for that
head pass (35449094967). Implemented shared coverageByUnit and a range list on
multi-unit history pages. Older units receive their own notice even when another
unit has recent data. Source records/policy/release hashes remain unchanged.
Focused regression and existing pilot HTML reproduction pass.

Full verify24473 completes352 tests (6+346) and final audits; log at
/tmp/canli-unit-coverage-verify.log. Browser63869 completes48 Chromium/WebKit
checks, including actual CIK0001381074/Assets CNY2021/USD2025 range assertions.
Mobile coverage screenshot visually inspected. HTTP77467 completes all9,386 pages
and698 downloads with exact sitemap match, no failures and no orphans. Updated
measurement/browser receipts. No generated-source churn or runtime deployment.

The74 partially historical-unit flags are now displayed clearly, not removed or
editorially approved. Other source/semantic review, storage, production activation,
Search Console and all engine/developer objectives remain open. Next: pushed-head
CI, editorial decisions and durable storage integration.
