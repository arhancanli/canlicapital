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
