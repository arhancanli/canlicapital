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
