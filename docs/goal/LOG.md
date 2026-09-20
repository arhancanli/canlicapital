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

## 2026-09-19 — engine cost disclosure retains declared omissions

Previous turn was progress (website4fce3854). Reread continuity and engine owner
contracts; PR68 priorab75af0 complete CI passes. Read current shared maturity
report without mutation: four forward returns/four sleeves, no Sharpe estimate.
Found crypto omission list empty despite three declared NOT_CHARGED rows.
Changed the isolated PR68 evaluator to union declared and state-reported omissions,
retain extra gaps, label missing summaries NOT_PUBLISHED and hash-bind the cost
contract. Equity’s declared FX row also becomes visible; its USD-only reason
remains in the contract. This is a disclosure correction, not new cost charging.

First broad test invocation failed20 checks for missing ignored paper state;
retained log /tmp/canli-cost-disclosure-tests.log. Portable cost selection passed4,
explicit new regression passed1. Moved regression to its own portable module
(the original module is centrally classified workspace_evidence). Final focused
run34973:5 passed; Ruff clean. Its trailing diff check failed on an accidental
blank line in the old test module, which was then restored toHEAD. No integration
pass or performance result claimed. Before/after read-only disclosure receipt
saved to engine-cost-disclosure-review.json. Next: pushed-head CI, cost-data
prerequisites, governed research and website release work.

## 2026-09-19 — launch next source cohort

Previous turn was progress (engine529b0c7/websiteeaebaa78). Reread continuity;
website CI passes, engine offline tests still running while other five jobs pass.
Captured official SEC ticker discovery with timestamp/hash and selected1,000 new
CIKs outside existing cohort. Started original-byte capture session59470; polled
live. Queue builder reproduces exact queue and rejects replacement. Four direct
fixture checks pass. New source counts remain candidates, not pages.

First continuity-write attempt failed because system Python lacks datetime.UTC;
code/receipts committed asd48bb968. Corrected to datetime.timezone.utc and saved
this follow-up log and STATUS with exact running handle and current snapshot.
Next: monitor same process, review all outcomes, preserve exclusions when preparing
accepted cohort. No production/runtime mutation; all goals stay active.

## 2026-09-19 — preserve source-reproduced exclusions in staging

Previous turn was progress (source batch andbf84aa05). Reread continuity and
polled59470 live; did not restart. Verified website checkpoint CI passes. Added
source replay for excluded records and an explicit staging mode that retains
exclusions and queue/refresh/selector bindings. Default stays strict; HTTP errors,
changed exclusion reasons, falsely excluded valid records and partial cohorts
cannot pass. Failure preserves prior delivery pointer. Eight focused checks pass;
full verify9578 passes354 tests and final audits.

Partial real-batch review captured137 eligible companies/1,197 core candidate
pages and112 flagged histories; no reproduction errors, complete=false. Persisted
partial review receipt for inspection; no delivery staging or page-count increase.
Capture59470 remains live at final poll. Next: keep polling same process and review
complete cohort before explicit exclusion-aware staging. All platform, indexing
and engine goals remain open; storage/production/Search Console questions unchanged.


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


## 2026-09-20 — direct Codex takeover and verified repair

Owner ended Hermes delegation and requested direct implementation/leadership.
Hermes notified through its CLI; acknowledged idle. Its referenced child batches
were already not live. New direct-execution goal active; all objectives preserved.
Restored full verify command after Hermes truncated it to four tests. Replaced
invalid zero-byte fixture with real-source stale-review/omitted-failure regressions.
Focused16 tests pass. Full verify3690 exit0:362 tests (6+356) and all final audits.
Initial apply_patch replacement failed before changes; replacement then applied
through explicit file write. No failure was counted as a passing test.

Fresh source replay1721 exit0:853 companies,7449 core candidate pages,676 flagged
histories;51 invalid entities,35 insufficient coverage,61 bound404 exclusions,
zero replay errors. Hermes's asserted reproduction blocker was unsupported.
Saved independent review; original captures unchanged. Local candidates, not live
or indexed pages. PR15 verified OPEN at6cdc9f0e with both CI jobs green; dirty
local takeover work not covered by those checks.

Consolidated current STATUS and EXECUTION_LEDGER; archived preceding status/ledger;
marked historical Hermes reports superseded. Unapproved algorithm artifacts kept
with explicit defect/claim boundaries. Previous failed fixture/package preserved
under /tmp/canli-codex-takeover-20260920. Next:T04 verified cohort staging, continuing
all editorial, storage/release, indexing, platform adoption and engine goals.


## 2026-09-20 — T04 extended new-cohort staging started

Prior turn classified progress (verified takeover repairs and source review). Read
continuity, verified local files and PR15 still OPEN at6cdc9f0e. Starting extended-v1
staging for853 eligible companies in next-1000-delivery-extended, with original
147 reproduced/captured exclusions retained. Prior delivery roots untouched.
Then catalog/release/discovery and real local HTTP replay; no index/release claim.


## 2026-09-20 — new extended cohort verified end to end

Staging10459, catalog39284, quality58143, release75628 all exit0. New release
contains853 companies/22,697 histories;147 exclusions retained. Discovery23,568
URLs. Full HTTP85222 exit0:all23,568 pages and1,706 downloads reproduce, sitemap
exact, zero failures/orphans,3-link company-directory bound, max HTML36,223 bytes.
Browser25866 exit0:54 Chromium/WebKit checks at320/390/1440 on9 deterministic
risk samples. Two390px screenshots visually inspected; no overflow found. Local
helper server stopped. Prior extended release pointer equals recorded8a35a0fc….

Audit flags2,549 histories with overlapping2,416 historical-only,3 multi-unit and
partially historical,13 constant including12 zero-only,128 equal-vector pages in64
groups. These are unresolved editorial flags, not removed values or approved pages.
Added a real-fixture valid/404 staging regression; confirms response retention and
unchanged prior pointer after corruption. Focused17 tests pass. No runtime code
changes since full362-test takeover validation; only the extra test/browser harness
and staged data/receipts. Next:checkpoint changes and build a verified combined
cohort, then editorial/storage/release work. All indexing/developer/engine goals open.


### Checkpoint pushed — 60e27321

Committed repaired validation, bound404 exclusions, honest continuity and new-cohort
receipts; pushed existing PR15 branch. Initial PR API response was stale6cdc9f0e;
rechecked and confirmed60e27321 with both jobs running in CI35488566338. Poll that
run; do not treat the previous green run as evidence for this head. Unapproved
Hermes prototypes and old unverified reports remain local/untracked.


## 2026-09-20 — combined-cohort phase started

Previous turn progress: verified new cohort and pushed60e27321. Read continuity and
polled same CI35488566338, still running. Implementing pinned-source combination
with exact input manifests archived, full selected/source replay, index reassembly,
duplicate/policy/corruption rejection and atomic prior-pointer preservation. Inputs
and prior releases remain unchanged; no publication or indexing claim.


## 2026-09-20 — combined release verified

Combiner verifies pinned manifest bytes, compatible policies, original index
bindings and selected/source replay; rejects duplicates/forged values/corruption,
archives input manifests and index nodes, rebuilds union index and atomically
replaces only output delivery pointer. Lock prevents competing writers. Five
behavioral tests pass, including preserved prior pointer after rejected builds.
Initial version retained manifests but not original index objects; strengthened
archival closure and added traversal assertions before final verification.

Real combined build18447 exit0:1,202 companies from two cohorts. Catalog92239,
quality70501, release74128, discovery all exit0. Final full verify65292 exit0:
368 tests (6+362), writing/SEO/links/indexability/numerical audits pass. HTTP33344
exit0:32,954 pages/2,404 downloads, exact sitemap, zero failures/orphans. Maximum
company-directory depth is FOUR links in the larger hierarchy, not prior three;
maxHTML36,223. Browser26981 exit0:54 checks,9 samples,320/390/1440 Chromium/WebKit;
longest-issuer mobile screenshot inspected. Preview helper stopped.

Quality flags3,924 histories with overlapping3,405 historical-only,226 multi-unit,
77 partially historical-unit,20 constant (19zero-only),338 pages in169 equal-vector
groups. Preserved flags and source values; editorial release remains unresolved.
Archived554 unapproved Hermes-generated files under ignored.bak/hermes-20260920;
verified every file hash and saved path/hash inventory. No source capture removed.
CI35488566338 passed for prior60e27321; this new code requires its own pushed CI.
Next: editorial publication rules and durable storage/hosted preview integration;
all actual indexing, quality, platform/adoption and governed engine goals remain.


### Combined checkpoint pushed — 77029551

Pushed existing PR15; verified API head77029551 and queued CI35488994575. All
implementation/evidence committed; subsequent continuity update records this push.
Next turn should poll that exact run before carrying forward any CI claim.


## 2026-09-20 — storage preparation and access recheck

Prior turn progress: verified/pushed combined corpus. Read continuity; current
77029551 CI35488994575 passes. Existing Vercel CLI59.19.0 found in npm cache;
read-only env listing shows production-only Supabase settings. Initial export
nonempty checks were too weak: parsed values do not yield a usable HTTPS Supabase
URL, so no bucket request was sent. Temporary credential exports removed without
printing values. Asked owner for target bucket/project and local credential path.
No remote settings/buckets/objects changed. Preparing a verified reachable-object
upload plan while access is pending; this is runtime/provenance inventory, not a
complete capture-evidence backup or publication approval.


## 2026-09-20 — runtime storage plan verified

Planner validates release/catalog/download coherence, source replay and archived
cohort mappings; collects only reachable hash-addressed objects and retains exact
gzip bytes. Corrupt data, changed pointer or missing archived evidence fails.
Three regressions pass. Full verify73497 exit0:371 tests(6+365) and final audits.
Real inventory28097 exit0:3,927 objects/505,062,941 bytes; summary binds local plan
hash and code. No network writes. Documented separate capture-evidence backup gap
instead of calling the runtime inventory a full backup. Storage access question
pending; subsequent work can advance editorial policy and governed engine evidence.


### Storage checkpoint pushed — e43a0a6f

Verified PR15 heade43a0a6f; CI35489349842 has one running and one queued job.
No remote storage mutations. Poll this exact run on continuation; do not reuse
prior head results. Goal remains active across storage, editorial and engine work.


## 2026-09-20 — current engine evidence and optimizer cleanup

Website exact heade43a0a6f CI35489349842 passes. Engine PR68/69/70 each OPEN
and all six checks pass. Uncommitted engine optimizer addition failed AST parsing
at line284 (escaped quote); preserved original bytes and patch under engine
.bak/codex-takeover-20260920, restored exact HEAD. No runtime state touched.
Read-only existing forward report inspection verifies embedded content hash and
every source binding. Five current-epoch returns/four sleeves, null Sharpe; full
receipt retained. Fresh risk contract contradicts stale not-live prose: activation
records September15 with prior owner decision. Recorded distinction; made no
activation changes. Focused optimizer/cost-disclosure validation launched.

Focused validation: initial41-test run passed but coverage paths exposed editable
imports from security worktree, so that run is not acceptance for the repaired
worktree. Re-ran with explicit PYTHONPATH=$PWD/src, serial execution and no
coverage override effects:41 passed in2.49s, exit0. No new trading code accepted.
Next: reconcile stale owner-goal mechanism prose against authoritative activation
evidence, then governed research/admission gaps; storage question remains pending.


## 2026-09-20 — spin-off diagnostic integrity repair

Prior turn classified progress: optimizer recovery plus verified source-bound report.
Fresh inspection showed public activation projection already corrected in PR68;
19 owner-goal tests pass, historical config prose intentionally retained. Website
34a166c8 CI35489594591 passes. Research backlog retains sealed narrative kills and
human/source gates; no automatic candidate promotion. Spin-off diagnostic found
counting unverified cache entries and hardcoding verdict. Fixed exact98-hash closure,
missing/extra/duplicate/corrupt rejection, measured verdict and removed inferred human
review claim. Seven regressions pass;26 combined tests, Ruff and publication integrity
pass. Real98-document replay gives11 token hits,5 nearby,16 shipped (6 no-token).
Frozen30% gate stays failed. No prices/returns opened, trials spent or runtime writes.
Engine commit61b587f pushed to PR68; new CI pending. Continue editorial/storage and
research source quality; don't retune failed identities to manufacture14 sleeves.


## 2026-09-20 — contextual company-history disclosures

Prior turn progress: spin-off source-integrity repair. Returned to company quality
while storage access is pending. Shared exact numerical-history comparison between
renderer and audit; added matching-definition links and per-unit constant/zero
notes without altering values or approval status. Full verify passes373 tests and
final audits. Recomputed source-bound quality report retains3,924 flags. Added
real matching/zero routes to browser sampler. Editorial policy explicitly keeps
semantic usefulness/source review open; no page-count-driven automatic approvals.
HTTP/browser verification running, results to be recorded after completion.

Final HTTP52645 exit0:32,954 pages/2,404 downloads, exact sitemap, zero failures,
maxHTML36,223bytes and4-link bound. Browser89908 exit0:66 checks/11routes, two
engines and three widths; matching-history mobile screenshot inspected. New context
covers338 matching pages,24 with constant units(19zero); this differs from20
all-units-constant flags by design. Verification4148 exit0:373tests+audits.
Prior website6108a391 CI35489757169 passes; engine61b587f CI35489715539 still running.


## 2026-09-20 — original-filing review of exceptional equal vectors

Previous turn was progress: contextual rendering,373tests,fullHTTP and66browser
checks. Current turn inspected the six unusual pair groups against captured
companyfacts and original primary filings. Node captures succeeded after the
web-reader failed and initial Python3M request returned403. Preserved12body hashes
for six unique primary filings/indexes, including additional Eventiko2024. Matched
28 selected latest-accession observations under undimensioned context/period/unit
and scale/sign checks, plus inspected four Eventiko2024 facts. Source selected
records replay independently. Decision retain separate concepts with comparison
links; no automatic merge based on equal values. Review is Codex source inspection,
not independent human replication or all-history/publication approval. Documents
and bound receipt preserve scope. No application code changed in this turn.
Websitefb0a05de CI35489967924 passes; engine61b587f run35489715539 still running.


## 2026-09-20 — MCP reliability and continuous verification

Previous turn progress: six source-bound editorial decisions. MCP review found
HTTP errors returned as successful tool results, no deadline, and no package CI.
Corrected result flags without stripping envelopes, bounded header/body fetches,
rejected redirects, suppressed reflected nonJSON/network errors, and prevented
failed key responses installing keys. No retry may duplicate validation/key writes.
Handshake version now follows package.json. Added MCP CI job. Clean locked install,
48 tests(realstdio included), audit0vulnerabilities pass. First pack dry-run with
--prefix inspected root by mistake; correct mcp cwd dry-run verifies expected four
package files. Neither command published or generated a tarball. Public status
GET succeeded with no credential/keyissuance/validationmutation;12total validations
are telemetry only. Source receipt and status contain limits; adoption remains open.
Prior website CI35490262960 passes; engine35489715539 still running.


## 2026-09-20 — genuinely new source cohort capture

Previous turn progress:MCP reliability48tests+CI. Freshad264cef CI35490429296 passes.
Batch selector skipped only accepted companies and would silently reacquire147
prior exclusions/failures. Added optional SHA-pinned priorqueue ledger and tests;
all376tests+audits pass. New1,000queue excludes both priorqueues and combinedcohort;
from8,031 fixed discovery IDs,5,687 remain after this queue. No eligibility/page
extrapolation. Capture session73982 started04:59:42Z, verified stilllive at49rows
(41revieweligible,5excluded,3HTTPerrors), unfinished. Originalqueue/captures remain
untouched; no duplicatejob or automatic403/429retry. Resume by polling samehandle.


## 2026-09-20 — source-evidence packaging and actual restore

Prior turn progress: capture73982 launched after pinnedqueue fix. Polled same live
handle; no duplicatecapture. Built explicit-file company evidence archive with
completed acquisition/HTTP404 bodies, editorial captures, runtimeobjects and exact
repository revision. Nine corpus/archive tests pass. Pack38685 exit0:7,843files,
1,034,352,640bytes, SHA22ef0f561462ef620aa277a4b8ec2050ca3ef6efd02a611677724dc59db49bfd.
Restore54546 exit0: separate temporaryworkspace,342+853eligible and147exclusions
replay without errors;3,927 runtimeobjects exactlymatch keys/hashes/sizes and all
release roots. Wholearchivehash independently matched summary. Temporary restore
removed; archive localonly. Documented instructions and partial-output semantics.
Capture now299/1000(221eligible,55excluded,23HTTPerrors), unfinished. Websiteprior
a2e557f3 CI35490624532 passes; engine35489715539 remains running.

## 2026-09-20 — API key lifecycle candidate

Previous checkpoint completed a verified local evidence archive. Added a bearer-only
revocation endpoint and explicit migration, with shared key-row locking against
stale quota admissions. Database role/idempotence/receipt/concurrency checks run
in disposable PostgreSQL CI, never production. Added storage-response validation,
handler regressions, manifest/OpenAPI/developer examples and deployment ordering.
Review found and fixed pre-parsed string body byte-cap bypass; regression covers
UTF-8 and oversized empty input. Initial tests caught stale manifest/limits/lifecycle
expectations; updated to the new explicit contract. Full verification in progress.
Engine61b587f full CI35489715539 and website1d9209a4 CI35490907923 now pass.
Local build and final verify now pass381tests(6+375) and every final audit.
Generated artifacts regenerated through the full build to preserve reader features
and accurate source bindings. Capture73982 at823/1000, unfinished; no staging.
Revocation commitb9fcc63f CI35491443303 passed its real PostgreSQL lifecycle and
concurrency job. MCP CI caught duplicated quota wording after the new body limit;
updated the package's published sentence and fixture, keeping the drift test.
All48MCP tests now pass locally. First CI failure retained; corrected head needs CI.

## 2026-09-20 — completed third cohort and delivery verification

Previous turn made progress on revocation; corrected0cdd6ad7 CI35491496322 passes
all4jobs. Polled existing capture73982 until exit0, never restarted. Replayed entire
queue:766eligible,157reproducible content exclusions,77HTTP404; independent404
capture27608exit0, finalreplay zeroerrors and234verifiedexclusions. Stage21556exit0
creates separate extended candidate with766companies and20,689histories. Quality
9223exit0:2,789flaggedhistories andsix unusual equalpairs pendingfilinginspection.
Full HTTP47993exit0:21,471URLs/1,532downloads, exactsitemap, nofailures. Browser73473
exit0:66checks/11routes/twoengines/threewidths; matchinghistory mobile inspected.
Updated topSTATUS to distinguish current evidence from historical checkpoints.
Prior combinedrelease andarchive preserved; newcohort is not deployed, indexable,
merged or backedupoffsite. All owner goals remainactive.

## 2026-09-20 — third-cohort filing dispositions and combined candidate

Previous turn made verified source/delivery progress. Freshwebsite4fd7ea82 CI
35491855670passes. OrdinaryNode captured eight SECfiling/indexbodies after webreader
could access onlyVisiumindex. All24selected observations in six unusual pairs
match originalseparate rows with entity/context/unit/scale/sign checks. Global
Technologies restatement-dimensionalfacts excluded;scope latestselectedaccession,
not allhistory. Sourcehashes/scripts/dispositions recorded;flags unchanged.
Combined94717exit0 creates separately pinned1,968companycandidate. Quality6675
exit0 retains6,713flags. HTTP1912exit0 verifies54,424URLs/3,936downloads and two
sitemapshards;66browserchecks19274exit0. Storage75785exit0 verifies6,249objects/
828,366,117bytes locally. No upload, productionchange or actualindexing claim.
Priorcombinedrelease/archive preserved; largerarchive andisolatedrestore pending.

## 2026-09-20 — three-cohort evidence portability

Previous turn combinedsource/delivery work was progress; a901b9f8 CI35492196422
passes. Added explicitthree-cohort archiveprofile preserving olddefault and sealed
archive. Strengthened exactqueue completionchecks; added untrustedwholearchivehash
regression. Eleven archive/corpus tests pass. Build36615exit0 creates12,952file/
1,581,578,240byte localarchive SHA103a3839594086e211ef698232f2ed3011e94bae92de3fd27ecc59a5be8d23f4.
New reusable restoreharness67775exit0 verifies wholeSHA andeverymember, extracts
savedrepository in temporaryworkspace, replays allthreequeues(342+853+766eligible,
381verifiedexclusions,zeroerrors), and rebuilds runtimeplan matching6,249object
keys/hashes/lengths andallroots. Verifier sourcehash independentlymatches retained
code. Temporaryrestore removed; olderarchive retained. No offsite durability or
productionchange claimed. Documentation includes exact replaycommand andscope.

## 2026-09-20 — semantic revenue error discovered and corrected in v2

Previous archive turn made verifiedprogress;7e111ee9 CI35492406633 passes. Reviewing
33constanthistories found implausiblegenericrevenuezeros atestablishedcompanies.
Captured12filing/indexbodies for sixcases. Nine selectedzeros inFlowserve,Santander,
OFG match intersegment-eliminationrows, demonstratingthat correctnumbers and
undimensionedcontexts do not establishmeasure scope. Imunonlicensefact retained;
twonon-inline cases unresolved. Allcapturesretained, no sourcefactrewritten.
Implemented source-pinnedextended-v2 exclusions andoverview disclosure. Buildand
383tests+audits pass. Restagedthreecohorts, comparedall1,968records:exactlythree
conceptsremoved,rawsourcesunchanged. Combinedv2catalog/release/discoverybuilt.
FullHTTP19226 andbrowser22919 running; do not reuse priorv1measurement forv2.
Originalv1archive remains reproducible butno longer a publishablecandidateas-is.

Browser22919exit0:84checks/14routes including allthree scopedexclusionoverviews
and theirhistory404s. HTTP19226stillrunning; samehandle mustberesumed.

## 2026-09-20 — older XBRL scope proof and complete constant-case acquisition

Previous turn implementedsemanticfix(v2), notcompletion. SameHTTP19226nowexit0
and60100bd6CI35492885392passes. Read olderDentsply/Compass XBRLinstances+labels:
sixselectedvalues match, labels explicitlyintersegmentsales. Confirmedtwoadditional
exclusions required; keepv2reproducible, noapprovalforpublication. All33constant
cases captured84526exit0;12completeinlinecomparisons,21needseparateXBRL. These
areverificationgaps, not automaticallybadfacts. Additionalcapture56575 failedon
embeddedlabel-layout inOrukaXSD, preservedfailure andaddedlayoutsupport. Resumed
samecaptureworkfromverifiedcache as15210, stillrunning atcheckpoint. No retry
onaccess/rate-limiterrors. Next finishsource-review andmakecoherentpolicyupdate.

Capture15210 nowexit0:21case bundles,42uniqueinstance/label-or-schema bodies,
allstatus200 withverifiedlength/hash. No acquisitionprocess remainsrunning.
Next: offlineinstance/context/unit/value andscope review, thennextpolicyversion.

## 2026-09-20 — complete constant-case comparison and extended-v3

Previous turn made sourceacquisition/scopeprogress; a43fdef7CI35493322351passed.
Offline21XBRLbundles match46selectedfacts with entity/date/unit/value checks.
Embeddedlabel-linkbases supported. Scopeinspection foundqualified earnings/revenue
andcash-equivalent statements beyondfiveintersegmentcases. Data443 separateCash
facts confirmnonzerobalances despitecash-equivalentszeros. Consolidated8sourcebound
exclusionsinv3; v2unchanged. Retainedcases remainpendingothereditorialgates.
Build18152exit0:384tests+audits. Stage71737exit0 andfullrecordmigration:1,968
companies,52,408histories,onlyeightconceptsremoved,rawsourcesunchanged. Combined
6657exit0. Browser80933exit0:114checks inclscopeoverviews/404s;mobileData443inspected.
Quality87267exit0:6,705flags. Storage37363exit0:6,249objects/828,340,450bytes.
FullHTTP11564running; nextpollsamehandle thenupdatearchive/restore.

FullHTTP11564exit0:54,416URLs/3,936downloads,exacttwoshard sitemap,no failures,
maxHTML36,223bytes/four-link bound. Allv3localchecks complete;archiveupdate next.

## 2026-09-20 — corrected v3 archive and isolated restore

Previous turn fixed8source-scope interpretations andverifiedv3delivery;df5acde5
CI35493915578passes. Addedexplicitv3profilewithsharedbuilder/restoreconfiguration,
retainingoldprofiles. Elevenarchive/corpus tests pass. Build/restore22247exit0:
13,183files/1,695,528,960bytes,SHA27d5ffe86251571d767106e0ab06f81b420da4d4fe841f412a48bcba627ea76f.
Newarchiveincludesconstantfilingcomparisons/captures andv3runtime. Wholehash+every
member verified; temporarysaved-repositoryreplay matchesallthreequeues and381
exclusions,6,249runtimeobjects/828,340,450bytes,allrelease/catalog/downloadroots.
Verifier sourcehash checked;temporaryrestore removed;olderarchives preserved.
No remote durability,productionactivation orgoalcompletion claimed.

## 2026-09-20 — navigation intent ownership

Verified archive CI35494145919 success and PR15 open at1fad2600. Reviewed built
content for thirteen navigation pages, assigned distinct reader tasks and branded
query hypotheses, and documented overlapping tool/directory boundaries. Audit now
91 owners/121 hypotheses/236 unassigned, with327 static indexable pages unchanged.
Three intent tests pass. Recorded founder-page zero-observation snapshot conflict
with newer five-observation engine evidence for a separate freshness review.
No content generation, production publication, search demand or indexing claim.

## 2026-09-20 — dated founder evidence snapshot

Traced founder count0 to public forward report generated September15, byteSHA
7d1752b43526d6e2f042fa980d1f2e80295d445422fa349eaf4314049dd53739 matching evidence-map
binding. Replaced current-record labeling with dated snapshot, source link and
window; preserved narration with historical boundary. Added source-binding and
fact/date rejection, three regressions and independent built-page provenance check.
Initial audit failed on newly introduced dates; exact source tracing fixed it.
Full build/verify passes6+381tests; six Chromium/WebKit widthchecks pass. Browser
probe initially compared uppercased rendered text; corrected DOM-text assertion.
No historical source changed. Restored unrelated generated churn from clean start.
Newer engine evidence still requires complete publication refresh. Prior head
bbec4dd9 CI35494409052 passes. All owner outcomes remain active/unestablished.

## 2026-09-20 — stable export refresh and nested-state exclusion

Captured full newer public export with stable hashes. Found7nested agent files
in public export; excluded them from candidate and fixed engine snapshot copy and
overlay in PR68 ce93d8c.13tests/Ruffpass. Initial candidate verification required
actual full Git history for sitemap tests; after retaining it, build/verify pass.
Imported53files and rebuilt dependencies. Main6+381tests/all audits and six browser
checks pass;163content hashes/2signatures reproduce.1,060-entry chain allsignatures
valid,953prior entries unchanged. Five forward returns/four sleeves stillIMMATURE.
No source runtime changes, broker orders, production publication or goal completion.
Detailed receipts and limits: EVIDENCE_REFRESH.md. Former websitehead75615c3e CIpasses.

## 2026-09-20 — first observed Search Console indexing baseline

Read owner's open coverage Google Sheet via local XLSX export, without editing
sheet or changing browser JavaScript-security settings. Latest chartSeptember14:
262indexed/40notindexed, all-known-pages scope.32noindex+3redirect+3discovered+
2crawled exclusions sum40. Raw workbookSHA5f90caa3d103cb180c3f190bc2566074f5bead67a1e9043371d4611dc03d77af;
raw saved ignored, aggregate receipt retained. No excluded URL examples supplied
in workbook. Further per-URL review needed before proposing indexability changes.

## 2026-09-20 — verified live indexing checks, audit classification repair

Committed refreshed evidence/indexbaseline aee1ff55; CI35495437077passes. Checked
263live URLs. InitialrawHEAD26failures were falsely counted as indexability defects;
corrected audit to separateunknown/non-successful responses and capconcurrency12.
3tests pass; added toregularverify. Correctedpass1HTMLtimeout/5rawfailures retained;
all6targetedGETs subsequently200, raw5noindex. No persistent technical blocker
confirmed, nor any claim to identify Google's5excludedURLs from aggregatecounts.
Laptop UI assistive access denied and JSautomationdisabled; two categoryGoogleSheets
exports requested, not yet received. See INDEXING_BASELINE.md and threeHTTP receipts.

## 2026-09-20 — research-topic intent and editorial review

Reviewed13existing hubs; assigned26distinct editorial query hypotheses. Auditnow
104owners/147hypotheses/223unassigned;327indexable unchanged. Revised rejected-
candidate and equity topic prose to scope failures to actual trials, distinguish
sourcefeasibility from performance, and remove unsupported field-wide claims.
Full build/verify passes6+384tests andall audits; no newpages or manuscriptchanges.
Restored unrelated generated churn. Priorhead772d60d2 CI35495690688passes.
See SEARCH_INTENT_REVIEW.md; indexing remains262asofSeptember14, not increased
by intent assignment. No production activation or algorithm outcome claim.

## 2026-09-20 — source capacity reconciled and current status consolidated

Replayed capacity frompinneddiscovery/queues/v3delivery and all1,968selectedhashes:
8,031discovered,5outside-discoveryadmitted,381nonadmissions,5,687unqueued,34concepts.
Current54,416candidateURLs matchrelease. Fixedmodelallentityceiling281,421;
retainingcurrentselections/exclusions bounds253,575. This isnoteligibility/indexing
forecast andcannot meet800,000. Broader sourcefamilies mustbevalidated. OfficialSEC
bulkdocs consulted; onecompanyfacts.zip HEAD403,bodynotdownloaded,noretry.
Archived entire previousSTATUS before rewritingcurrentfacts; oldunknown-indexing,
oldcounts and oldCIclaims removed fromcurrentcheckpoint withoutdeletinghistory.
Sourceaudit andreceipt: audit-company-source-capacity.mjs/company-source-capacity-20260920.json.
Websitea8865e57 CI35495845450passes; enginece93d8c suite remainsliveatlastpoll.

## 2026-09-20 — retained issuer discovery, without duplicate acquisition

Compared the retained 7,992-CIK ticker snapshot with the current 8,031-CIK source:
65 additional identities, four already staged, five held back because a retained
acquisition exists, leaving 56 new unattempted candidates. No eligibility claim.
Seven available cached bodies match raw hash/length; four valid integer identities
are already staged, three string CIKs require schema/provenance review. Two other
bodies absent. No normalization, retry, publication, return-data read or engine edit.
Retained 37 source/body bindings; independent hash/length check and exact report
replay pass. New receipt/script documented in SOURCE_CAPACITY.md. Material is not
in the old sealed archive. It does not materially close the 800,000-page gap.
Engine ce93d8c CI35494803169 now passes all six jobs. Website 0e911990 CI35496075672
passes. Current status and phases corrected to reflect measured indexing and the
remaining hosted-release work. Owner goal stays active.

## 2026-09-20 — identity-exclusion audit, without weakening admission

Verified all 106 INVALID_ENTITY outcomes against complete capture queues, original
body hashes and unchanged v3 selector. Of 102 matching numeric CIK strings, many
lack a name or enough core history. Categories:45missing names,48below-four-core
histories,10priority identity/scope reviews,3other missing identifiers. Extended
concept eligibility was not assessed. Entergy Arkansas discovery versus Entergy
Corporation response shows why blindly coercing identifiers is insufficient.
No source bytes, old exclusions or release pointers changed. Deterministic replay
is identical; 13 selector tests pass. Receipt/script and COMPANY_IDENTITY_REVIEW.md
preserve the review queue and limitations. No network, returns or broker activity.
Prior website75b84b22 CI35496306735 passes. Full owner goal remains active.

## 2026-09-20 — filing evidence for ten identity-review cases

Captured 13 latest-selected core filing indexes and primary documents:26HTTP200
bodies, independently verified hashes/lengths. All13cover CIKs match. All137selected
core observations match source inline facts with entity, period, currency, value,
scale/sign and dimensional/nil exclusions. Regenerated targets match exactly.
Reports, capture/target/comparison scripts retained; bodies ignored and not yet
sealed. No general CIK coercion, admission, old exclusion mutation or release
change. A versioned exact-source identity exception remains a proposed next step,
not publication approval or all-history verification. Website4e169847 CI35496483722
passes. No return-data access, broker operation or production publication.

Follow-up verification: target/filing coverage must be exact and unique, review
input hashes must agree, and cover identities are re-extracted from captured
bytes rather than trusted from report metadata. The hardened comparison exits0
and reproduces the original report byte-for-byte. Prior user-facing turn only
rechecked browser tabs and reported the baseline; this turn completes evidence
review and preservation. Category URL exports remain pending.

## 2026-09-20 — identity matches expose a subsidiary-scope error

Previous turn committed and pushed filing comparison evidence as3e903ee0; this
turn inspected matching table rows and surrounding narrative. Princeton's three
Revenues observations (2020–2022) belong to unconsolidated portfolio company
Advantis Certified Staffing Solutions despite matching undimensioned Princeton
contexts. Recorded exact-source concept-exclusion requirement before any future
identity admission. New script verifies original body hash/length and preserves
the table and identifying passage. Existing INVALID_ENTITY exclusion remains;
no normalization, policy change, new candidate or publication. Numerical matching
is explicitly separated from semantic acceptance. Full owner goal remains active.

## 2026-09-20 — dependency checkpoint and identity evidence retention

Previous turn's Princeton scope disposition was progress; e9bb4829 now passes
all CI35497231896 jobs. GitHub alert1 is default-branch esbuild0.23.1; candidate
already fixes it in093fb0fd with0.25.12. Fresh registry audits of all three npm
packages exit0 with zero known vulnerabilities; bound lock hashes and audit
responses retained. No redundant dependency update, dismissal or merge.

Sealed a separate identity supplement using the existing exact-member archive
verifier:77files/26,521,600bytes, SHAb48b199b8d459e42641cd8e444e73d5d05f4aa4443a40855f81c287779e3a853.
Build/replay56222 exits0. Temporary isolated restore reproduces targets,137numeric
comparisons and Princeton disposition byte-for-byte using only archived inputs.
Capture report is hash-preserved, not refetched; full106caseaudit not rerun.
Originalv3archive preserved. Runtime versions recorded, not bundled. Supplement
is localonly; retained discovery and offsite retention remain outstanding.

## 2026-09-20 — fourth source batch with retained-acquisition holdbacks

Previous archive turn made verified retention progress; c31e8b65CI35497398668 now
passes. Recovered600prior acquisition CIKs from24hash-bound retained status parts,
reading identity columns only. Pinned new ledger combines all three websitequeues
and retained acquisitions. This holds back220additional discovery identities.
Selected1,000new CIKs,4,467remaining; independent overlap checks pass against every
ledger and current delivery. Holdbacks and queue receipt replay byte-identically;
nine existing queue/capture tests pass. Original queues unchanged.

Capture29020 started07:39:43UTC in fourth-1000; last early observation12processed
(10eligible-for-review,1excluded,1HTTPerror), unfinished. No duplicate process,
retry on403/429, page staging or production publication. Poll same handle next.
EnginePR68/69/70 rechecked open with current heads and six passing jobs each;
none merged and no engine runtime modified. Capacity/indexing and forward goals
remain unachieved; new capture counts cannot establish publication quality.

## 2026-09-20 — capture resume preserves failures and completed evidence

Previous turn launched genuine source acquisition. Same session29020 remainslive;
latest checkpoint193/1000(129review candidates,45excluded,19HTTPerrors), unfinished.
Found collector would implicitly reacquire prior HTTP/transport failures, rewrite
completed report dates and silently replace altered staged records on resume.
Added full ordered queue binding, prior-result validation, failure retention,
access-stop rejection, immutable completed reports and offline record comparison.
Missing receipts cannot trigger new fetches; partial replay cannot truncate prior
outcomes. Legacy complete queues can replay; unbound partial queues fail closed.

Initial focused run exposed interruption handling inside the HTTP-error catch
(could duplicate a result) and a test fixture that changed a completed queue.
Moved HTTP failures through a typed error to the single outer pause; isolated the
expanded fixture in a new directory. Added six regressions and expanded old tests.
Full verify21062 exits0:6+390tests and allfinalaudits. Restored only verification's
unrelated source-date/sitemap churn from the initially clean worktree. Current
running capture loaded older code and was neither restarted nor modified.
Website8f3e992fCI35497522210 passes. No production, source-policy or indexing change.

## 2026-09-20 — independent partial source review

Previous resume fix was implementation progress. Polled same capture29020; still
live. Copied an atomic278-outcome progress snapshot, queue and its referenced
original bodies/receipts/records into an isolated temporary directory. Offline
review45144 exits0:177candidates,70reproduced content exclusions(33insufficient
coverage,37identity),31HTTP404outcomes,214flagged histories,zeroerrors. Retained
snapshot bytehash1eb052f450b745cdcb561d54f8def55a784970b76b1deb755e8660471d9d3750
at corpus-local/fourth-partial-review-input-20260920.json; output binds this exact
input. Temporary workspace removed. No second capture, failed-request retry or
production change. Core-only potential pagecount1,569 is not extended delivery.
Clarified current versus older editorial queue counts and incorporated the
Princeton portfolio-company scope failure into the shared review requirement.

## 2026-09-20 — actual MCP package release boundary and executable fix

Previous partial review was source-verification progress. Same capture29020 still
live, latest checkpoint485/1000(301review candidates,121excluded,63HTTPerrors).
Npm registry and integrity-verified0.1.1tarball contradict earlier goal status:
0.1.1 was published September6 and lacks candidate request-deadline/redirect code.
Retain historical error here; corrected current STATUS and release documentation.
Assigned candidate0.1.2 consistently in package, lock and registry manifest.

Added an isolated actual-tarball install/stdio test to CI. Initial run failed:
entry check compared a raw file URL to a symlinked executable path. Canonicalized
argv path with realpath/pathToFileURL; installed .bin executable now passes from
a consumer directory with spaces.48source tests+1installed-package test pass.
Added shipped MITlicense and repository/homepage/issue metadata; README example
no longer prints the key envelope. Removed contradictory registry publish steps.
Pack retention initially used the wrong cwd-relative destination, then corrected;
both0.1.1and0.1.2tarballs now retained with verified npm integrity and SHA256.
Candidate pack matches tested integrity; temporary install removed. Receipt in
artifacts/platform/mcp-release-readiness-20260920.json. No publication, registry
submission, production key issuance or independent-adoption claim.

## 2026-09-20 — packaged MCP read-only live verification

Previous turn fixed actual installed executable startup and immutable-version
confusion. All7298ea1dCI35498051186jobs now pass, including package install/stdio.
Verified archived candidate SHA, installed exact tarball in a temporary consumer
and exercised public service_status plus intentionally absent get_receipt through
the real MCP transport.57655exit0; correct0.1.2handshake, full canli.api.v1envelopes,
four limits sentences retained, success versus not_found isError preserved.
Service reports reachable store,12total validations and0today; unattributed
telemetry is not independent adoption. Temporary install removed; read-only
receipt retained. No key, validation, revocation, npm publication or registry write.

Asked owner for the final decision on publishing the exact tested0.1.2tarball;
this is pending and no approval is inferred. Independent sourcecapture29020
continues; latest checkpoint625/1000(403review candidates,146excluded,76HTTPerrors).
No duplicate capture or production site change. Overall goal remains active.

## 2026-09-20 — isolated combined engine candidate

Previous packaged live-read verification was progress. Read continuity before
phase7overlap. Refetched maincb59488 and verified all three PRheads/mergeability.
Created a separate integration worktree and merged69(783ad0c),70(e0a257c),68(ce93d8c)
without conflicts; combinedhead74c5461,24changed files. Original worktrees and
running engine untouched; pre-existing .venv in goals worktree left alone.
Frozen uv sync exits0 into this worktree's own environment. Ruff61425exit0,
mypy54293exit0(184files),publication verifierexit0(16tracked bundles,402checksum
files). This proves preparation integrity, not full result reproduction.

Portable offline pytest89693 remainslive with4workers; log at
/tmp/canli-engine-integration-pytest.log. Pushed integration branch, then explicitly
dispatched completeCI35498286728 on exacthead; queued at checkpoint. No additional
PR, production merge or runtime activation. Receipt records exact heads/lockhash,
passing checks and unfinished jobs. Same websitecapture29020 remainslive; latest
785/1000(519review candidates,175excluded,91HTTPerrors). Owner npm release decision
remains pending; no approval inferred or publication performed.

## 2026-09-20 — fourth cohort completion and integration test correction

Capture29020, error-body verification29952, final replay29016, staging53349,
quality48996 and catalog72265 all completed successfully. Fourth cohort contains
683 review candidates, 200 content exclusions and 117 verified HTTP404 outcomes.
Separate staging has 17,719 histories and 3,151 overlapping flags; catalog root
93abb688d0b8ec940ec41e38f1c5b95e8b2873748b7bff19747693ad6bc1875a.
Editorial, HTTP/browser, archive and release integration work remains outstanding.
Existing 1,968-company release and production remain unchanged.

Initial combined engine pytest89693 failed: 4,385 passed, 33 skipped, 2 failed.
Preserved log: /tmp/canli-engine-integration-pytest.log. Both failures concerned
launchd test worktree path assumptions. Fix867d2113698d41d9f697adad5aeb7006dddc23a1
checks shared Git identity, with same-repository acceptance and unrelated-repository
rejection coverage. All four focused tests and Ruff passed. Serial performance
61174 passed (1 test). Old-head CI35498286728 remains in progress; it cannot
establish current-head verification. No runtime configuration changed.

Owner requests notification when deployment is needed. MCP0.1.2 remains ready
for the previously requested publication decision; this message is not explicit
publication approval. Company expansion and engine integration are not yet
release-ready. Goal remains active.

## 2026-09-20 — fourth cohort delivery verification and editorial targets

Previous turn was progress: verified catalog completion and corrected continuity.
Built a separate source-verified release pointer and discovery sitemap, without
changing the existing three-cohort release. Full HTTP23014 and browser89679 both
exit0. All18,416 URLs (683 companies,17,719 histories,14 directories),1,366downloads
and exact sitemap membership pass; maximum3clicks from company directory and
31,467HTML bytes. Browser sample:66checks,11routes,two engines,three widths,
zero failures. Local sequential measurements do not establish hosted capacity.
Both HTTP servers were managed and shut down at test completion.

Added deterministic prepare-company-editorial-targets.py, binding quality and
selected-record hashes. Priority queue:55concepts across30companies,36latest
selected filings, covering27constant histories and14unusual equality groups.
Replay is byte-identical and a mismatched quality input is rejected. Common
EPS/share equality pairs and other flags remain outside this priority subset.
Only one constant history is nonzero: Liberty Star capital purchases, USD500;
this is a review target, not a source-error conclusion. No editorial approvals.
Reports and queue are retained; source filing review and archive remain next.

Engine CI35498286728 re-polled: five jobs pass, offline pytest remains live on
74c5461. Latest867d211 still needs full remote verification. No duplicate job or
production activation. MCP publication decision remains pending.

## 2026-09-20 — fourth cohort primary filings and source discrepancy

Previous turn made progress through complete local delivery checks and a bound
editorial queue. Generalized capture/comparison into separate scripts, leaving
historical identity evidence code untouched. Capture23675 completed:36filings,
72index/primary responses. Comparison43634 exits0:120selected observations,
73inline matches,47unresolved. Missing/unsupported inline facts are retained as
unresolved, not silently counted as successful comparisons. Separate XBRL review
is still required. Completed capture replay verifies bytes without rewriting the
report; a prior403access-stop fixture rejects resume before network activity.

Liberty Star1172178 equipment purchases is the only nonzero constant history.
Its2021instance contains an undimensioned USD500fact matching Companyfacts.
Captured separate instance608,932bytes SHA
7be42acf9dc15043ed421351c70d73fc5b7171e27142896319e21a05f27ea491.
Rendered statement lists operating cashflow-380,879 and financing362,573, exactly
reconciling netchange-18,306 without investing activity. Preserved source-bound
passage, context and HOLD_PENDING_SOURCE_RECONCILIATION; meaning of500 remains
unproven. No automatic exclusion, admission, or all-history error claim. Web
open of the already-captured index was unavailable; retained source bytes are
authoritative for this review. All primary captures and instance returned200.

EngineCI35498286728 still reports offline tests running; five other jobs pass.
WebsiteCI35499369255 was running on195494cf at checkpoint. No deployment,
publication or runtime activation; overall goal remains active.
