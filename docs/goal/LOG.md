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
