# Goal work log

Full chronology through the fourth-v9restore is preserved unchanged in
[history/LOG-20260920-through-fourth-v9.md](history/LOG-20260920-through-fourth-v9.md).
That archive links earlier logs; no prior evidence or failure was removed.
All owner requirements remain in REQUIREMENTS.md. Current state is in STATUS.md.

## 2026-09-20 — concise post-release/editorial checkpoint

Previous turn merged the tested website release and verified hosted unavailable-store
API behavior. Current turn withheld Nika's exact ambiguous revenue history, verified
all683company differences, passed403tests/fullHTTP/102browser checks and completed
an isolated archive restore. Detailed receipts and preserved failures are linked
from STATUS and the archived log. Engine post-merge CIpassed all six jobs; website
Dependabot alert1is fixed. Owner production-database question remains pending.

Condensed active status and log to reduce repeated context without discarding any
objective, source evidence, historical failure or owner-reserved decision. No
production activation, indexing or financial outcome established. Continue source
quality/capacity work while release prerequisites are resolved.

## 2026-09-20 — Supabase login and database identity check

Owner requested direct laptop inspection because they do not know the project.
Safari DOM access confirmed a signed-in dashboard; organization switcher and CLI
list only arhancanli's Org. canlicapital-preview changed from restoring to
ACTIVE_HEALTHY. Its read-only usage_summary reports six validations; the live
canlicapital.com validation status reports twelve with store_reachable and
usage_available true. Phase10/14 records explicitly identify the visible database
as isolated preview, with production credentials unchanged. Historical production
reference bpnensyowfmdwhqmfdrg is not accessible to the current account; exact current
production identity remains unconfirmed. No migration, credential replacement or
production switch performed. Need access to the production-owning account or
organization; owner need not guess a project. Session goal tool currently reports
paused; this explicit inspection request was completed without resuming broad work.

## 2026-09-20 — account recovery inspection

Owner authorized laptop inspection and help signing in. Safari profile menu confirms
GitHub identity arhancanli (owner Gmail displayed); this account exposes only the
preview organization. Chrome opens Supabase sign-in with no existing session.
Chrome explicitly disables JavaScript through Apple Events; setting was not changed
or bypassed. Left the Chrome Supabase sign-in page foregrounded for the owner to
check saved login suggestions. No sign-out, password reset, new account, permission
grant, credential export or production database change was performed. Historical
Phase10 notes confirm Safari previously used a different organization, but do not
establish which other login owns current production.

## 2026-09-20 — production account located

Owner supplied a different Supabase personal access token. Read-only management
organization/project listings succeeded and identified canlicapital, reference
bpnensyowfmdwhqmfdrg, ACTIVE_HEALTHY, eu-central-1, in organization
qhbioocttcsfubsityha (arhancanli@icloud.com's Org). This matches the historical
production configuration reference; current runtime binding and schema remain to
verify before migration. Opened that project's dashboard in Chrome. No database
writes, project changes or credential persistence performed. Token excluded from
these records and repository.

## 2026-09-20 — production key-revocation database migration

Confirmed live API binding by issuing one labeled disposable synthetic key through
canlicapital.com and locating its hash in the intended database. RLS is enabled on
all three validation tables. Applied exact migration SHA256
8cb8fbb31cae6309ec911225d3616a64df51f14e763dd1caad7b7ff5b5c03fe1.
Validation succeeded before revocation; RPC revocation and repeated timestamp
matched; later public validation returned401 without charging quota. Receipt
697e042184ebc7ba22e9266a remains public. Existing keys' revocation-state fingerprint
is unchanged; backend-only function grants and quota row lock verified. Healthy
production usage now includes one explicitly synthetic validation (13total).

Initial read-only probe attempted restricted usage_summary and correctly failed;
changed to a permitted table aggregate, without widening grants. A local HTTP
success check initially expected200 rather than the query endpoint's201; fixed
before mutations. Neither preflight failure applied a migration or issued a key.
Production application deployment is being prepared from tested305b2f0b in a
dedicated checkout; publisher pointer not yet changed.

## 2026-09-20 — production candidate9608542c

The first fresh-export snapshot failed the sitemap date guard for seven measurement
routes: hourly JSON changed its bytes, invalidating archived Git-date bindings,
and these embedded artifacts did not supply a content date. The fix omits the
optional lastmod for undated measurements while retaining discovery and known
dates; it does not reuse invalid bindings or stamp the deployment date. Full
403website tests pass, along with three sitemap integration tests including an
archive without Git and without glassbox bindings. Initial regression fixture
lacked installed dependencies; adding an explicit shared dependency symlink
resolved that fixture-only failure. Build and all four remote CI jobs pass.

Dedicated clean release checkout is canlicapital-production-20260920. Fresh export
snapshot4268e36640a5fa20a72e9a00e5b9ee22f3b1c0b432d3afca2f08829e1a7e80ed
passes the isolated Vercel-mode build. The reviewed merged snapshot helper passes
13local shell tests; pytest reports no Python coverage for these shell tests.
Production-environment deployment was staged with --skip-domain as
meridian-beas6ce22-arhans-projects-ac470eaa.vercel.app. Hosted issue/validate/revoke/
repeat/reject/retained-receipt checks pass; synthetic key confirmed revoked.
12browser cases pass across Chromium/WebKit and390/1440 widths. Full sitemap scan
and domain activation remain pending at this checkpoint.

## 2026-09-20 — production activation and live verification complete

All327staged sitemap routes verified:324passed initially; two connection resets
and one timeout passed a single targeted recheck with matching canonical URLs.
Original failures remain in staged-production-routes-9608542c.json and successful
rechecks in the separate receipt.12browser checks and full staged key lifecycle pass.
Fresh chain verifies1,064entries/signatures (628disclosed,436opaque), with the entire
previous1,063entry prefix unchanged. This is evidence verification, not new returns.

Promoted dpl_6jFma3DpVDWB5ZZWSgn5pALicLz2 at11:24:49UTC. Under the shared publisher
lock, installed the exact reviewed/tested merged snapshot helper and atomically
selected the clean production checkout at9608542c. The trading loop, broker
configuration and engine state were not changed. Previous source/helper are backed
up; hashes are recorded in production-activation-9608542c.json.

Live canlicapital.com issue/validate/revoke/repeat/reject/retained-receipt/health
checks pass; all release-test keys are confirmed revoked. Identical synthetic
validation input reuses its content-hashed receipt. Explicit Vercel alias API
confirms the primary, www and legacy meridian aliases point at this deployment.
Initial verification expected custom aliases in the project's embedded target
list; that incomplete list caused a local assertion, resolved by checking the
authoritative alias endpoints. No repromotion or domain mutation was needed.
Homepage/developers/founder/status/sitemap respond successfully without noindex
headers; exact live sitemap bytes match the validated327URL build. Seven measurement
URLs omit unprovable lastmod. Existing submitted sitemap URL is unchanged; Google
indexing gain remains unestablished. All company cohorts remain local/noindex.

## 2026-09-20 — taxonomy-constrained source capacity and repository closeout

Prior goal turn is classified as progress: production migration and coordinated
website/API activation completed with live evidence. PR16merged as6cc2c517 after
all four checks passed at05e9fbf6; both trees match8ac027e2. Post-merge CI35508225593
is successful. Engine PR68/69/70exact heads were rechecked as ancestors of tested
integration867d211 and closed as incorporated into PR71; no branch was deleted.

New offline audit verifies2,651retained source bodies and94FASB declarations.
Correct period/type/unit constraints leave140,596recent company/concept pairs,
unchanged from these concepts' earlier triage counts. Other currencies excluded
from USD coverage are not called invalid. Numerical comparisons found2,013full
liabilities-and-equity/assets matches,651issued/outstanding-share matches and no
full operating-lease-liability/undiscounted-payment matches. Matching numbers do
not prove semantic identity. Six next-review candidates have explicit source-scope
boundaries in CONCEPT_REVIEW.md; no concepts or pages were admitted.

Initial audit stopped because the selector module hash differed from the older
inventory. Retrieved exact original module720c224e and verified its recorded SHA;
complete observation function plus date/error dependencies are byte-identical to
current code. That equivalence is checked on every run and recorded, rather than
ignoring the mismatch. XML extraction first exceeded Node's default subprocess
output buffer; a bounded16MiBbuffer handles the pinned4.97MBtaxonomy. No source
network request or replacement capture was made.

Five focused regressions cover types, units, periods, recency, conflicts, numerical
alignment and corrupted inventory bytes. Added both inventory and typed-review
tests to routine verification;6preliminary+404main tests pass with all audits.
Independent second full run reproduces reportSHA9718793aab1c96da4c9d52cd265147ded07ecd20f77664288dda33ba9bdbd849
exactly. Restored12audit inputs from a22,712,320byte local archive with exact hashes.
The archive explicitly excludes raw company-body recovery and makes no offsite
claim. Source-date/sitemap churn from tests was restored to the clean starting
bytes; publication state and the production checkout were not changed.

## 2026-09-20 — retained primary-filing concept review

Previous goal turn is progress: typed coverage, duplication measurements and an
isolated audit-input restore completed. PR17passed all four checks and merged as
cacdf594; tree equals2c4e8c4d (de6b0f2d). Post-merge CI35508990999passed.

Source-bound six-concept targets intersect40retained primary filings from38
companies,198observations. Initial preparation encountered legacy receipts without
body_path; their conventionally paired response bodies were resolved and verified
against the original hashes/lengths, without modifying receipts. Ordering is
explicitly deterministic. No new SEC request or retry was made.

Final parser reproduces153inline facts and37additional facts from13retained XBRL
instances. Eight historical rows remain unresolved in Dentsply Sirona and Compass
Minerals filings; missing instances were not fetched. Parser hardening preserves
namespace, entity, period, simple-USD-unit, nil/dimension, transform, sign and scale
checks; counterfeit namespaces/transforms and fake zero text cannot be accepted.
Preliminary extraction was superseded by complete reruns after parser hardening.
Six regression cases and all17corpus tests pass, including a clean environment
installed from exact hash-locked BeautifulSoup/soupsieve/typing-extension wheels.
CI now explicitly installs those parser dependencies in a venv. PyPI wheel
downloads occurred; SEC source acquisition did not.

Manual scope notes cover14company/concept cases and27observations, not all190
numerical matches. Parent attribution, discounted lease liabilities, operating
interest cash flows, and gross/accumulated property balances remain distinct.
NextDecade's construction assets constrain wording about productive capacity.
Oruka's current companyfacts identity versus ARCA in the retained filing requires
historical identity care; shared CIK does not prove unchanged business scope.

Archive117files/127,406,080bytes includes40primary filings,13instances, receipts,
comparison code, tests and locked wheels. Isolated restoration verifies every hash
and exactly replays reportSHA57142e68a205d6072165cde0b16fbdbd36977930c16b4dbc48489db30c7ab501.
ArchiveSHAc3a7d042aabc031923d4803abe7d71c6d1ba1b1caf39811da13d5f3c4a75dc49.
Target regeneration still needs original companyfacts cohort archives; no offsite
claim. No source admission, production deployment, new page or indexing gain.

## 2026-09-20 — legacy capture reconciliation

Prior turn made progress through retained-filing verification. PR18 passed all
four CI jobs35509711510 and merged as ea4bc3ca. Both reviewed and merged trees
are5a8648c523710a0fd13ae4c0150f428a410be303.

Inspection of the older capture index corrected the prior assumption that two
XML instances were missing: both were saved under EX-101.INS filenames. A
separate offline supplement verifies primary source, accession and body hashes
and reproduces all eight previously unmatched figures. Original report and
archive remain intact. Primary table extracts preserve attribution, capitalized
interest and mineral-property scope distinctions. Existing intersegment-revenue
exclusions are unaffected.

Isolated12file archive restore reruns the supplement and reproduces exact SHA
aba1b76ef26079fdb6ae3b5a9ed2f42661eaee60cd5e35be9165f4a69668ea34.
No acquisition, retry, definition change or production deployment. Numerical
coverage198/198 is not all-history review, concept admission or new indexed pages.

The push exposed two new moderate Soup Sieve advisories (Dependabot2/3).
Updated the current lock to patched2.9.0, with wheel SHA independently checked
against PyPI metadata. It requires Python>=3.10; system3.9 rejected the package,
so verification uses a clean3.12 environment. Historical locks, wheels and
receipts remain unchanged. All17corpus tests pass under the patched dependency.
Both the full40-filing report and eight-observation supplement reproduce
byte-identically under the patched dependency.

PR19 merged as514c092dfeab6c3d0aced9446d12ce56618c0aac after all four
CI35510179271jobs passed at4c8e1557. Tested and merged trees both
8a3b53001913a9224fb8ba880778c13e0a556ad6. Post-merge CI and Dependabot
closure are pending; alerts2/3still reported open immediately after merge.
Production remains unchanged.

## 2026-09-20 — storage transfer implementation and live canary

Previous turn is progress: PR19 merged source reconciliation and security patch.
Post-merge CI35510323267/35510261053passes; no open Dependabot alerts remain.
Read-only project inspection found no buckets. Under persistent publication
authorization, created restricted-format public company-reference-staging in the
verified production Supabase project. No existing policies or production page
variables changed. Authenticated credentials remained in process memory.

New immutable uploader validates complete pinned plans before writes, bounds
concurrency, never overwrites/retries, verifies remote bytes and preserves partial
receipts. Six uploader regressions and three planner tests pass. Full corrected
v3preflight verifies6,249objects/828,340,450bytes. Live two-object transport
canary verifies15,415bytes of JSON/gzip through unauthenticated retrieval.
This establishes remote transport only; corpus transfer, hosted preview, page
admission and separate capture backup remain unfinished.

Storage PR21: https://github.com/arhancanli/canlicapital/pull/21. Initial full
transfer stopped with exit1 after69verified objects/5,105,149bytes on a transport
read failure. Original receipt and failure remain preserved. Bounded read-only
inspection confirms endpoint availability and one created-but-unrecorded object;
no assumption that failure meant upload absence. Added failing-key/transport-type
evidence, code hash and GET cache-control enforcement; nine storage tests pass.
A separate controlled resume will reverify existing objects at concurrency2.

Controlled resume is running via exec session81071 at reviewed candidate219a7205,
concurrency2; receipt corpus-local/company-three-cohort-remote-transfer-resume1-20260920.json.
Poll this exact handle before inferring completion or starting another transfer.
Original session30526is terminal exit1; no other uploader remains active.
PR21updated CI is pending. No production deployment required for this script.

PR21merged as9f1e607c after all four CI35510772919jobs passed. Tested and
merged trees match4e2989ec. Resume1session81071is now terminal exit1 after
240verified objects/18,275,734bytes; preserved receipt identifies HTTP502 on a
public read. No uploader is currently running. Added explicit opt-in read-only
retries: at most3attempts/object and10retries/run for recognized transport faults
or502/503/504. Permission, rate-limit, corruption and writes never auto-retry.
All11storage tests pass, including retry budgets and create-once behavior.

Clean preview checkout canlicapital-company-preview-20260920 at9f1e607c validates
in an isolated build clone. First CLI upload failed with fetch failed; API listing
confirmed no new deployment. A bounded second preview attempt is underway.
Deployment-local public storage settings only; no production environment changes.
The scheduled publisher has since created READY deployment dpl_C1LAYUEx6VtXiiUxi3ZatwXqfRTu
using production application revision9608542c; no claim that preview changed production.

Preview dpl_Gw2aMA1cscjaGtV3c9JzF95voFai is READY at9f1e607c; all four hosted
unavailable checks pass. Successful data serving still awaits complete storage.
Resume2session58999terminated exit1 after336verified objects with UNKNOWN_TRANSPORT,
zero read retries. Do not infer subtype from this old generic error. Added sanitized
machine-category details for subsequent diagnosis; unknown failures still stop.
All uploader sessions are terminal. Preserved every partial receipt and failure.
DOM TimeoutError numeric codes now classify by name; a regression proves bounded
retry and omission of sensitive upstream messages. Twelve storage tests pass.
Status was consolidated with the prior version archived to reduce contradictory
current-state statements. PR22remains the current review.

## 2026-09-20 — failed-object reconciliation and reviewed recovery merge

Previous turn made progress: hosted unavailable checks and read-recovery tests
completed. Read-only inspection of both failed keys confirms one absent object
and one stored object with exact bytes; company-storage-failed-read-diagnosis-20260920.json.
Started explicit resume3 with new receipt and improved diagnostics at87acdbbd.
Session75189is active; checkpoint352verified objects, beyond prior336, with no
retries/failures at that observation. Earlier terminal receipts remain unchanged.

PR22passed all four CI35511309210jobs and merged as4337d655; reviewed and merged
trees both5e83e54c3e2b9c7ae26a226ffee88021a274aa15. Post-merge CI pending.
No production page activation, complete corpus-transfer or indexing claim.

## 2026-09-20 — create reconciliation and candidate inventory

Previous goal turn made progress through read-retry recovery and source inspection;
owner status questions clarified the distinction between potential and indexed
pages. Verified selected-object hashes across all three candidate manifests:
3,323unique companies/87,348histories. Projected merged directory67pages would
produce90,738candidate URLs; this combined artifact is not yet built and includes
existing pilot overlaps. No new live or indexed-page claim.

Resume3session75189is terminal after557verified objects/40,312,854bytes. Two read
resets recovered; a create reset stopped the process. A read-only check found the
failed key absent. New recovery records ambiguous writes and checks exact public
bytes before doing anything further. Matching bytes finish verification without
another write. Explicit writeAttempts=2 permits one more immutable create after
confirmed absence; global10retry bound. Defaults, permission errors, rate limits,
corruption and unknown HTTP failures cannot trigger blind writes. Sixteen storage
tests pass, including lost reply, absent-object retry, corruption and global budget.

PR23merged as1811814b647fedbbef7639ea96fa0ae670c3992a after all four
CI35511895380jobs passed at ac2584c1. Both trees match
2b9774a5f96274c724a705004859078d6f7c117a; post-merge checks pending.
Resume4session65658is confirmed active, using ac2584c1 with concurrency4,
readAttempts3/writeAttempts2. Receipt:
corpus-local/company-three-cohort-remote-transfer-resume4-20260920.json.
Latest checkpoint612verified objects/44,466,024bytes, no recovery events or
failures. Poll this exact handle before treating it as stopped or restarting.
Production remains unchanged; hosted successful-data checks await full transfer.

## 2026-09-20 — response stream recovery

Previous turn made progress: PR23merged, fresh runtime transfer and candidate
counts were verified. Post-merge main checks are successful. Resume4session65658
then ended at695verified objects on a response-body ECONNRESET. Partial buffers
were discarded and not credited. Stream errors now use the same bounded read
recovery classifier as request errors. Broken denied/rate-limited/ambiguous400
responses still cannot trigger retries; HTTP status remains authoritative.
Eighteen storage tests pass. Every earlier partial receipt remains unchanged.

While storage ran, captured17older primary cash filings for18remaining observations.
Latest two retained statements provide seven numerical matches and five visible
year-end columns, with18earlier observations explicitly outstanding. Separate
source review continues; no editorial policy or production page was changed.

## 2026-09-20 — stream recovery merged and cash evidence replayed

Previous user-facing turn was status only (no progress); this continuation verified
push completion, created PR24 and merged after all four CI checks passed. Tested
b5925447 and mergef99d6606 have identical tree8cdf966e6f1908aeeb247578d4183838907f665b.
Started fresh resume5 session23870; earlier receipts preserved, no concurrent
uploader. Active transfer passed the previous695-object boundary.

Historical17filing XML comparison matched17/18; the unmatched Holding2007instant
was present under exact http://xbrl.us/us-gaap/2009-01-31 namespace. Added narrowly
scoped legacy recognition and regression coverage. Revised18/18 report is separate
from the original. Archived111files/54,312,960bytes and verified isolated offline
inline/XML replay. Receipt company-cash-history-archive-20260920.json.
Statement-level review remains open; no publication approval, all-history scope
claim, production-page expansion or indexing gain. Consolidated current STATUS
to remove obsolete active-session statements; historical receipts/logs preserved.

## 2026-09-20 — historical statement interpretation verified

Previous turn made progress: storage recovery merged, numerical source evidence
archived/replayed and PR25opened. This turn confirmed resume5 session23870 still
active and merged PR25after all four CI35512759597jobs passed. Tested194688b0 and
merged757b4625 share treef58eacca6e39aeaeb58591164cac7377ebee0ff7.

Inspected all17historical cash-flow tables with exact entity headings, annual
columns and opening/closing rows. Eighteen selected zero instants correspond to
opening balances; Atlantica1996is inception-column opening cash, not evidence of a
1996published annual report. Reproducible report binds primary/XML receipts and
retains matching contexts. New113file archive verified hashes and byte-identical
isolated scope replay. No source values, production settings or admission policy
changed. Transfer remains active; no new live/indexed-page claim.

## 2026-09-20 — cumulative policy replay for combined expansion

Merged PR26 with all checks and identical tree; post-merge checks pass. Began
combining five cohorts, retaining the expected stop for mixed policy versions.
Restaged four cohorts under existing cumulativev9 policy; unchanged fourth reused.
Full selected-record comparison found no change beyond selection_policy for all
3,323companies. Source objects and exclusions unchanged; metadata truthfully tracks
current replay selector. Original artifacts preserved. Session24408 is combining
pinnedv9 deliveries; no release or URL counts claimed until all builds verify.

Resume5session23870 terminal exit1 at1721objects/126028025bytes.
The tenth read recovery had been consumed; a later60second read timeout correctly
stopped. All in-flight workers settled. Stop receipt retained. No active uploader.
Combined delivery24408completed; catalog3,323companies verified; pipeline28956
continues release/discovery/storage-plan checks. Next transfer should use larger
verified release rather than continue uploading the superseded v3candidate.

Five-cohort pipeline28956completed exit0. Release9b562e4b5a1095e6dadb330915060b8b320ba02fc9384e9c5aef72f8d0aee4a2
binds3,323companies/87,348histories;67directories yield90,738unique candidate URLs.
Independent sitemap XML/hash/uniqueness check passes. Storage plan10,360objects/
1,280,295,450bytes; plan SHA6cafb5205963ea8187a8f014dfeb8342bdd487f2274c33603ff96d332a83750c.
No uploader active. Previous v3resume5 stopped at1,721verified objects. Next transfer
should target combinedv9release, with appropriate bounded recovery and later new
preview binding. No live/indexed-page increase. Earlier projected count is now
supported by a combined artifact; prior count receipt remains unchanged.

## 2026-09-20 — bounded large-transfer recovery and five-cohort archive

Previous goal turn made progress: all five cohorts combined under cumulativev9,
90,738unique sitemap URLs and full storage plan verified, PR27opened. This turn
merged PR27after all four checks passed, exact tree preserved. Added explicit
read/write retry budgets with unchanged defaults and per-object bounds; all20
storage/planner tests pass. PR28reviews a98637c4. Five-cohort transfer26312active
with recorded4/3/2/200/50policy; no concurrent older uploader.

Added five-cohort-v9 archive profile preserving all five acquisition queues and
six editorial capture directories alongside runtime closure. Five archive tests
pass. Build35755completed with23,115files/2,691,512,320bytes. Separate summary pins
b77ae93d4fe8c6935aa5569c81f8030ac19819d26ac2b4bf1b747b2f317ebd41.
Repository snapshot a98637c4 plus separate current packager.py are retained.
Isolated restore61898is active; no replay completion or remote-backup claim yet.

PR28 merged asf54d26e793b815baea6a0d0a8d032ca6b3f0d79d after all four
CI35513563000jobs passed; reviewed/merged tree6f5ccfffe21aa3e92d4ac4ee15e5bf49b8464f2f.
Archive restore61898completed exit0: all23,115member hashes verified, all five
capture queues replay with1,026exclusions/zero errors, all10,360runtime objects and
roots exactly reproduced. No original capture/runtime directory reads. Manual
scope reports were preserved but not all rerun by this combined restore; no offsite
backup claim. Updated current STATUS/ledger and preserved previous versions to
remove stale pending/active claims. Transfer26312continues independently.

## 2026-09-20 — representative five-cohort hosted delivery verified

Previous turn made progress through archive replay and active bulk transfer.
Merged PR29asb2b8c035 after all four CI35513797336jobs passed; reviewed and merged
treese84a0c176ef185056d212f8de951e06dc039cb8d. Post-merge checks successful.
Validated a clean sourcef54d26e7clone, deployed original source with deployment-local
five-cohort public settings. APIconfirmed dpl_CL9YBfWudnroTVMroAGJruvmVH6A READY.

Four unavailable-state checks passed. Prepared29-object runtime dependency probe,
full-plan/manifest hash bound; probe10532completed exact public verification while
bulk26312continued. First ready audit retained three304robots-header mismatches.
Second retained a fetch failure plus three weak/strong validator mismatches.
HTTP-aware validator now binds304to a previously verified200/noindex/no-store,
compares opaque validators under If-None-Match weak semantics, rejects changed
validators/conflicting robots and requires empty body/no-store. Three regression
tests pass. Standards: RFC9111sections3.2/4.3.4; RFC9110section13.1.2.
Final audit64924passed23checks, zero failures. Failed receipts remain unchanged.
This verifies representative explicit API delivery, not canonical routes/full
corpus/publication/indexing. Bulk transfer remains active; no production changes.

## 2026-09-20 — clean preview correction and focused browser verification

Recent owner replies were status/planning only, not implementation progress.
Reverified PR30 merged70a66bde, working branch and committed59ed2524 evidence.
Bulk session26312 polled live; receipt3253objects/0failures at checkpoint.
Clean preview1 exposed static directory shadowing and missing edge405Allow;
preview2 source1ab2 adds opt-in preview postbuild cleanup and method header.
Cloud cleanup log and23HTTP checks pass, including exact directory contents.
Browser27passes/5failures retained; all WebKit passed, Chromium has network
changes and one overflow finding. Added prior-report-hash-bound failed-case mode,
recording browser versions and requiring every failed case to receive an outcome.
Session84477 now checking exactly those five against the same immutable preview.
Owner repeated all goals; REQUIREMENTS remains unchanged and fully active.
No production expansion, new Google submission or indexed gain claimed.

Focused84477 completed4passes/1desktop-flow failure. A single bounded desktop
recheck34514 also failed. Preserve both receipts; stop blind retries and diagnose
request-level behavior before treating the browser gate as complete. Mobile layout
and mobile full navigation now pass, without a CSS change. Six configuration and
conditional-HTTP regression tests pass. No production activation.

## 2026-09-20 — request-level Chromium diagnosis

Previous turn made progress: four failed browser cases passed focused verification,
remaining desktop failure preserved and draft PR31 opened. All four CI35515580577
jobs pass at8b50bfc6. Added failed-request and flow-step instrumentation, omitting
query strings/fragments. Diagnostic11602 failed while opening the directory:
five CSS/JS requests aborted with ERR_NETWORK_CHANGED, including company CSS.
Independent urllib checks94247 fetched all five exact URLs with200, expected MIME
and recorded hashes. No assertion that this proves browser reliability or a fixed
network environment. Browser gate remains open; no speculative CSS patch.
Bulk26312 polled live; checkpoint3506verified objects/0failures, incomplete.

## 2026-09-20 — independent hosted browser verification

Previous turn produced request-level evidence. Added pinned public preview config
and no-retry Chromium desktop-flow CI. Run35515799025 passed atba510cd1 using PR
merge checkout59354e22/Chromium151.0.7922.34: directory→company→Assets→developer,
zero failed requests or page errors. Downloaded receipt matches script/config
hashes. Prior local failures retained; different platform/browser versions mean
this does not isolate the underlying local network cause. Representative32cases
have passing evidence across runs; no single fresh32case pass claimed. All four
standard CI35515798960jobs pass. Combined selected-quality audit65287 started
against fullv9delivery; pending. Bulk26312 still active when polled this turn.

Audit65287 completed:3,323companies/87,348histories reproduce;13,148flagged pages
with overlapping reasons, including10,630historical-only and1,500pages in750equal
numerical-vector groups. Summary pins full local report and verified gzip. These
are review flags, not automatic exclusions or approval of unflagged pages.

## 2026-09-20 — preview merge and equality review queue

Previous turn completed independent browser evidence and combined quality audit.
PR31 latestcb2f6f02 passed all five checks (CI35515925562/browser35515925557).
Repository disallows merge commits; first merge-mode request rejected without a
merge. Squash merge59b10c83 succeeded; tested and merged trees exactly equal
35eb23d444e47f1d05a5b1bf2b6ad9a20645baa2. New isolated work branch
research/company-quality-triage-20260920 starts from that merge.
Reproduced750equal-vector groups from pinned quality report and selected records:
712nonzero basic/diluted,37other nonzero,1zero-only. All remain review-pending.
TECHCOM capex/revenue history is all zero; EVENTIKO payable/property includes
11,000 and zero. Need primary scope/usefulness, not automatic deduplication.
Source-linked queue preserves all groups and non-basic/diluted observations.
No production release or indexed gain. Bulk26312 confirmed live this turn.

## 2026-09-20 — retained equality filing comparisons

Previous turn merged PR31 and opened PR32 with750group triage. New target mapping
retains all priority observations:41primary filings/212observations available,
159filings/398observations missing. Initial reviewer invocation rejected the new
schema before reading filings; added explicit support for the compatible equality
target schema without changing comparison rules. Run38554 completed212/212matches;
six inline and three XML tests pass. Source matches are not semantic admission.
Reviewed3M2023–2025 net sales versus disaggregated total-company revenue, and
EVENTIKO2024–2025 separate zero payable/fixed-asset lines with nonzero related-party
loans. Website Development appears in fixed assets; earlier11,000values remain
outside this primary comparison. Limited scope notes retained, no broad approval.
Bulk26312 polled live;3914objects/0failures at checkpoint.

## 2026-09-20 — historical acquisition and EVENTIKO scope completion

Previous turn reproduced212retained observations and documented gaps. PR32 checks
pass at144cd463. Prepared full159missing-filing acquisition queue without dropping
observations; legacy latest_selected_accession field explicitly means exact target,
not latest company filing. Paced session43531 active; unchanged403/429stop rules.
First EVENTIKO captures close4additional selected observations. All8selected values
across2022–2025 now reproduce in3primary filings:2023Website Development/Total Fixed
Assets11,000 and separateAccounts Payable11,000, other selected instants zero.
Nonzero related-party liabilities are separately disclosed. Scope notes preserve
these distinctions; no automatic deduplication, company-wide admission or release.
Bulk26312live;4074objects/0failures at checkpoint. Full historical capture unfinished.

## 2026-09-20 — enforce currency namespaces in historical comparisons

Previous turn captured missing EVENTIKO evidence and source-reviewed all8selected
observations for its equal pair. Both43531capture and26312upload polled live.
Review found XML helper trusted literal iso4217:USD without resolving the namespace.
It now resolves scoped QName bindings, rejecting undefined/incorrect/rebound
prefixes and accepting valid aliases. Updated formerly undeclared test fixture;
four XML regressions pass. All17corpus tests pass. XML tests were outside prior
CIglob; npm test:corpus now explicitly runs them too. Replay44938 retains212/212
matches and identical per-filing results with new helper hash in a separate report.
Original evidence remains unchanged. No source admission or production release.

## 2026-09-20 — incremental source comparison without duplicate credit

Previous turn strengthened currency QName verification and preserved exact replay.
Both43531capture and26312upload polled live. CI35516535342passes atb68e4d43.
Added optional prior-target binding to target preparation: prior body hashes and
observations must remain identical before excluding them from new comparison.
New snapshot59filings/134observations;100filings/264observations missing at capture.
Comparison69766 completed83matches/51unresolved across25legacy filings. Combined
with prior212 yields295matched of346compared, not299:EVENTIKO4supplement overlaps.
Unresolved queue preserved for separate XBRL/source comparison; no automatic source
error or admission finding. Bulkcheckpoint4270objects; full capture still active.

## 2026-09-20 — exact legacy XBRL inputs prepared

Previous turn added83numerical matches and retained51unresolved observations.
Capture43531and upload26312polled live. Prepared immutable subset inputs for all
25unresolved filings/51observations from captured indexes. Every index has one
unambiguous instance in the expected issuer/accession directory; primary hashes
match comparison evidence. Parent capture completeness is explicitly separate from
subset completeness. No new XML acquisition yet; start after primary capture
terminates, with existing access-stop and pacing behavior. No numerical gap closed
by URL selection alone and no production admission.

## 2026-09-20 — source review tooling merged and continuity consolidated

Previous turn pinned25exact XBRL inputs. PR32mergedb5dc0ac2 after all four
CI35516768834checks pass at0dcfa6f7. Both trees40d3071a73e02164a89fb58289696e8c08bcf537.
Newbranchresearch/company-legacy-evidence-20260920; postmerge checks pending.
Both43531and26312polled live;129capture entries/4573storage objects at checkpoint.
Consolidated current STATUS and archived prior detail to remove obsolete draft,
active-check and branch claims. All owner objectives and open gates preserved.
No production release or source-admission claim.

## 2026-09-20 — primary acquisition complete; legacy date parsing corrected

Primary43531terminal0: all159index/primary pairs verified, immutable completed
receipt retained. Union of disjoint prior targets excludes already-compared rows;
final primary25429adds138/264matches, for433/610across all200primary filings.
XBRL49534first25filings gives39/51;12unmatched values exist under whitespace-padded
instant dates. Comparator now strips surrounding date whitespace while exact
mismatches still fail; fiveXMLtests pass. Original report preserved; separate
offline replay51/51. Thus484/610numerically reproduced, not semantic admission.
SecondXBRL18988active for51filings/126observations using pre-fix helper; inspect and
replay offline under corrected helper once terminal. No parallel primary collector.
Postmerge PR32 CI35516871919passed. Scope/archival/production gates remain open.

SecondXBRL18988terminal0:116/126initial matches; corrected offline date-whitespace
replay126/126. Original preserved. Exact observation-set union against all38priority
groups verifies610/610with no omissions/double credit. Numerical closure only;
primary-context/usefulness and other groups remain open. Only26312bulk remains
known active. New evidence/date fix in draft PR33.

## 2026-09-20 — isolated priority equality archive replay

Previous turn closed610/610numerical observations and preserved failures. New
archive/replay46444terminal0:941files/293,847,040bytes, checksum
cb89a5df08529157f6bc2e42f3d498b6b9d5b05fcfc2960c46e7f048adf436bc.
All member bytes verified in temporary restore; locked dependencies installed
from bundled wheels with no index/network. Archived prior helper replays original
primary reports while later supplemental instances are held outside scan scope;
current helper then replays corrected XBRL reports. All five reports byte-identical;
exact610observation queue union matches without duplicate credit. No original
capture directories used by replay. Not manual-scope rerun, queue regeneration or
offsite backup. Bulk26312polled live;5129objects/0failures at checkpoint. PR33
CI35517263780passes at1a019807; packager additions pending their own checks.

## 2026-09-20 — reviewed revenue context becomes source-bound page content

Previous turn archived/replayed610observations. PR33mergedc9ac91c6 after all four
CI35517514528checks passed at12dabec8; both treesb6581a1f54916285ba89b1e8d29204fb080e7732.
Newbranchfeat/company-filing-context-20260920. Reviewed latest revenue statement/
disaggregation rows for3M,CONMED,Digital Brand Media,Mosaic,AbbVie. Added short
source-linked notes to both history pages per company, bound to exact sourceSHA,
CIK and both reviewed observations. Changed evidence suppresses stale notes.
Ten renderer tests pass; actual ten pages render from hash-verified selected records.
Notes clarify matching totals without declaring every historical tag interchangeable
or approving corpus publication. Production unchanged; broader scope review open.

## 2026-09-20 — source-bound EVENTIKO asset/payable explanation

Previous turn added five revenue-presentation notes and opened PR34. Added the
already reviewed EVENTIKO context to its payable/property histories: website
development and accounts payable are separate11,000lines forApril30,2023, with
related-party loans separately disclosed. Note binds exact source and all8selected
observations; cites retained2024filing. Twelve actual history renders pass; all10
renderer tests pass including changed evidence suppression. No deployment.
Bulk26312polled live;5572objects/0failures at checkpoint.

## 2026-09-20 — storage429 stop and provider diagnosis

Previous turn added reviewed EVENTIKO copy. PR34merged34f2b81e after four checks;
tested2ca4f9fe and merged trees67b8efb122bd96a625a6d7933a5312c9b8e31da3.
Bulk26312terminal1 at5625objects on create429; no retry. Failure retained with
54read recoveries/4write reconciliation events. Provider log query first rejected
noncanonical ISO dates; corrected query succeeded.429record shows DatabaseError
and pool/connection indicators, not a proven quota exhaustion. Read-only health:
ACTIVE_HEALTHY,17connections/max60; not a storage pool capacity guarantee.
No uploader restarted or limits changed. Added sanitized Retry-After retention;
18tests pass including no retry for429and omission of arbitrary upstream content.
Fresh failed-key public inspection retained; next step is paced/concurrency1
recovery design with all current fail-closed reconciliation rules intact.

## 2026-09-20 — paced immutable storage recovery

Previous goal turn only reaffirmed objectives; no implementation progress. Verified
local e5177ec0 pacing commit and PR35 still at52031799. All20storage/planner tests
pass. Credential-waiting launcher88342 was terminated before replacement77617;
no uploader had started in the old launcher. New transfer is confirmed live with
36reverified objects/zero failures at the initial checkpoint. One worker and500ms
minimum between request starts, same bounded reconciliation and hard stops.
Fresh resume1receipt preserves original5625-object429failure without overwriting.
No provider settings changed; no production expansion or indexing gain.

Review found the early401/403/429read branch omitted diagnostic metadata. Fixed
it without enabling retries, with a receipt-level regression for all three codes.
All21storage/planner tests pass. Active77617 remains pinned to e5177ec0 and has not
hot-reloaded this later diagnostics-only change.

## 2026-09-20 — storage merge and liability primary context

Previous turn launched paced recovery and fixed hard-stop read diagnostics.
All four PR35checks passed at9e7c2bba; squash merge bcfcb371 preserves exact
tree eeebaf502754ca3fbdd1836e215d06ac9f4f1b91. Recovery77617polled live.
New offline helper binds numerical closure, queue and three primary reports,
then selects latest reporting date for all17liability pairs. Twelve have separate
primary total/current rows with equal values; retained scope review covers those
24rows only. Five XML-only cases remain pending. Atlantica accession-order mistake
corrected: latest selected date is2025-12-31, not2019. No blanket admission.

## 2026-09-20 — legacy liability statement context

Previous turn merged storage diagnostics and reviewed12latest liability pairs.
Retained balance sheets close limited primary-context review for four of five
XML-only pairs: North America Frac Sand, Glucose Health, GRN and Atacama.
Each table preserves reporting columns, component liabilities and equal total/
current amounts; source hashes match numerical comparison evidence. Green Stream
primary is an amendment solely furnishing XBRL, with no original financial
statements. Preserve that explanatory note and keep original-statement review open.
Supplement and byte-identical isolated-output replay complete without network.
No all-history admission, publication or changed observations. Transfer77617live.
