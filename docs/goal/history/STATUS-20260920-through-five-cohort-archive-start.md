# Current state

Updated September20,2026. Goal **ACTIVE, NOT ACHIEVED**. Codex implements directly;
Hermes remains stopped. All objectives and claim boundaries are in REQUIREMENTS.md.
Prior detailed status is preserved unchanged in
history/STATUS-20260920-through-fourth-v9.md; earlier history remains linked there.

## Current checkout and releases

Website worktree: /Users/arhancanli/canlicapital-expansion-20260919.
Branch fix/company-storage-stream-recovery-20260920. PR21 merged as9f1e607c;
tree matches tested219a7205 and all four pre-merge CI jobs passed.
PR22 merged as4337d655 after all four CI35511309210jobs passed; tested and
merged trees match5e83e54c. It includes bounded read recovery and hosted audit.
Post-PR19 Dependabot check reports no open alerts. Current work is storage
transport diagnosis and hosted staging, not page activation.
Production application revision9608542ce019307674269667c4aa16ebc69dd43e is live
on canlicapital.com. Dedicated clean publisher checkout:
/Users/arhancanli/canlicapital-production-20260920.
Deployment dpl_6jFma3DpVDWB5ZZWSgn5pALicLz2 is READY; explicit alias API confirms
canlicapital.com, www.canlicapital.com and meridian-pearl-mu.vercel.app.
All four CI jobs pass;403website tests, three sitemap integration tests and13shell
snapshot tests pass. Staged/live disposable-key lifecycles pass. All327staged
sitemap URLs verified:324first-pass and three bounded successful network rechecks.
12Chromium/WebKit cases pass across390/1440 widths. Live sitemap bytes match the
validated build. Seven undated measurements omit optional lastmod; no invented dates.
Receipts: artifacts/platform/*9608542c.json and artifacts/qa/staged-production-*.

Website PR15merged as4a1fcd16. Its tree equals tested6719ba52; all four CIjobs passed.
Preview https://meridian-3e5mqtw82-arhans-projects-ac470eaa.vercel.app is READY.
The static scan verified326pages plus one connection reset; targeted recheck passed
that URL on both previews. Exact327sitemap membership and three evidence hashes
match. Updated preview verifies four unavailable-store API contracts. These are
preview checks, not successful production database operations.

MCP0.1.2 is published and latest on npm and the official MCP registry. Downloaded
npm bytes exactly match the tested tarball. Receipts: artifacts/platform/mcp-*
publication-20260920.json.48MCP tests/packed stdio checks passed; real adoption
remains unestablished. Smithery/Glama listings are unverified.

Engine PR71merged as0aff241a; tree equals tested867d211. All six pre-merge and
post-merge CI35504254363jobs passed. Portable baseline4,366passed55skipped;
serial performance1passed; PostgreSQL11passed. Original dirty running engine
was not reset; trading activation remains pending. Only the reviewed website
snapshot helper and presentation-source pointer were activated for this release.
Constituent PR68/69/70are closed after verifying their exact heads are ancestors
of tested867d211; their work is preserved in merged integration PR71.
Website Dependabot alert1was confirmed fixed at10:32:48UTC; no alert dismissed.

## Measured outcomes and limits

| Measure | Verified scope |
| --- | --- |
| Indexed baseline | Google aggregate262indexed as of Sep14, exported Sep20; not a canonical URL-level count |
| Not indexed | 40:32noindex,3redirects,3discovered,2crawled |
| Live production sitemap | 327URLs after Sep20activation; previously263; not an indexed count |
| Static candidate | 690HTML:327indexable,363noindex |
| Three-cohort v3 | 1,968companies,52,408histories,40directories:54,416URLs |
| Fourth v9 | 683companies,17,713histories,14directories:18,410URLs |
| Fifth v8 | 672companies,17,227histories,14directories:17,913URLs |
| Search intent | 104owners,147query hypotheses,223unassigned pages |
| Forward evidence | Five returns,four sleeves; IMMATURE_RECORD_TOO_SHORT |

Company cohorts remain local/noindex. Pilots overlap static pages: do not sum these
as live/indexed counts. Goals remain800,000actually indexed canonical pages,
target1m; source-backed quality/SEO and relevant intent; real API/MCP/repository
adoption; combined NET FORWARD Sharpe>2,at least14economically distinct qualified
sleeves and realized maxDD<=10%. No investment-outcome completion claim.

## Current source and recovery checkpoints

Fourth v9withholds only Nika Revenues at source72455d4e: the tagged no-income
wording does not unambiguously establish total revenue. Full683company comparison
proves every other selected field/source unchanged except policy.403website tests,
18,410HTTP pages/1,366downloads and102browser checks pass.2,074runtime objects,
245,821,972bytes.3,145overlapping quality flags remain, including21zero histories.
Archive4,959files734,187,520bytes,SHA570ee00d7ee6f8510dbb839cd4452f5400da3635f01960bda0a182499a826f97.
Isolated restore replays683companies317exclusions, exact runtime objects and all
four scope reports. Releasee932c19db7bdcee76a56f01ec65a7da3bbd7f9a0b2ea2a4d76ba712902d36dce.
Receipts: artifacts/seo/company-fourth-*-v9.json and company-fourth-v9-evidence-*.json.
Historical v6archive remains intact; current correction does not approve all history.

Fifth v8excludes Livento real-estate revenue, Eaton major customers, Annovis
materiality wording and Minerva product-sales scope.17,913HTTP pages/1,344downloads,
90browser checks,2,041runtime objects203,939,518bytes pass.3,298quality flags remain.
Archive4,887files662,538,240bytes,SHA34284ad7d17398ffbfc2356e3db0fbb0ba669f9f2807ea6019c98dfa2202cf00.
Restore reproduces672companies328exclusions, exact runtime objects and both scope
reports. Release548419b07d725f975d36e6c6a80f907d1b29009cdb5ae99e058c5456c7728e4f.

Three-cohort v3:54,416HTTP pages/3,936downloads,114browser checks,6,249runtime
objects. Eight source-scope exclusions,6,705quality flags.13,183file archive SHA
27d5ffe86251571d767106e0ab06f81b420da4d4fe841f412a48bcba627ea76f restores successfully.
Earlier versions and failures remain preserved. All archives are local, not offsite.

Deployed public evidence was refreshed into candidate45987764.163content hashes,
two commitment signatures and1,063transparency entries verify; original1,060prefix
unchanged.627disclosed payloads,436opaque commitments. No engine determinism claim.
See EVIDENCE_REFRESH.md and artifacts/algo/deployed-evidence-refresh-20260920.json.


Typed concept review:2,651source bindings and all94taxonomy declarations verify.
140,596recent pairs are unchanged under correct types;2,013companies have fully
equal liabilities-and-equity/assets histories. Five focused regressions and the
full410website checks pass; second full audit reproduces exact report bytes.
Audit-input archive22,712,320bytes/SHA128c02a0ef70bd5bf859b20bdb03f9db8a675c1e14c235fe30dbd662891fd235
restores all12inputs exactly. It is not a self-contained company-source archive
or offsite backup. Definitions, admission and publication remain unchanged.

Retained-filing review:40primary documents/38companies/198observations;153inline
and37retained-instance matches, eight unresolved. Six strict parser regressions
and all17corpus tests pass in a clean hash-locked environment. Archive117files,
127,406,080bytes/SHAc3a7d042aabc031923d4803abe7d71c6d1ba1b1caf39811da13d5f3c4a75dc49
restores and reproduces the report byte-for-byte. This replays comparisons, not
companyfacts target regeneration or offsite recovery. No new pages admitted.

## Next work and external dependencies

- Owner publication approval persists. New owner-provided account token successfully
  lists the historical production project canlicapital, reference
  bpnensyowfmdwhqmfdrg, ACTIVE_HEALTHY in eu-central-1, organization
  qhbioocttcsfubsityha (arhancanli@icloud.com's Org). Production project access is
  now verified. Disposable live key issuance confirmed the actual runtime binding.
  Exact key-revocation migration applied and verified; existing keys unchanged.
  Token not saved in repository. production-key-revocation-20260920.json.
- Database migration is complete. Staged production API lifecycle passes.
  Production API and live-domain lifecycle are verified. Publisher pointer now
  selects the clean canlicapital-production-20260920 checkout; hourly/nightly
  paths use the reviewed snapshot helper. No trading changes. KEY_REVOCATION.md.
- Supabase company-reference-staging bucket now exists. Two-object JSON/gzip
  canary passes exact public-byte verification. Full candidate transfer and
  hosted preview remain pending; private capture backup remains separate.
- Continue all-history scope/unit/usefulness review; latest-filing numerical equality
  is insufficient. Fourth priority queue430observations/185filings remains incomplete.
  Taxonomy/coverage audit of94high-coverage concepts is complete:140,596recent
  pairs, not approved pages. Six candidates now have a retained-filing sample:
  190of198figures reproduced in the original report; a separate verified legacy
  XML supplement reproduces the other eight, for198of198across40filings.14scope
  cases/27observations have bounded manual notes. Broader historical/identity
  review and admission decisions remain open; CONCEPT_REVIEW.md. No policy changed.
- Discovery8,031CIKs and34old concepts cannot alone reach800k; prior upper bound
  253,575URLs.3,467identities remain unqueued after fifth reservation. Additional
  useful sources/families are required. No artificial keyword variants. A SEC bulk
  archive HEAD returned403: do not retry it through alternate paths. SOURCE_CAPACITY.md.
- Search Console needs URL-level exports for3discovered/2crawled exclusions.
  Browser JavaScript/assistive restrictions were not bypassed. INDEXING_BASELINE.md.
- Engine research needs owner-reserved blind labels and protocol decisions; no
  synthetic substitute or unapproved sleeve admission. No broker orders.

Production database migration and website activation are verified. No
running-engine trading activation, actual indexing gain or investment outcome is claimed.

## Current storage and preview checkpoint

PR24 merged as f99d6606f948faa8c09eec12e91be54c883b367f after all four
CI35512565187 jobs passed at b59254471324c0683b8ffb8073374cd4cdfd8ef5.
Reviewed and merged trees match 8cdf966e6f1908aeeb247578d4183838907f665b.
Eighteen storage/planner tests cover bounded read and create recovery, interrupted
response bodies, rejection statuses and corruption. All prior partial receipts
remain intact. Resume4 ended at695 verified objects on a response-body reset.

Resume5 session23870 is terminal exit1 using the reviewed uploader, concurrency4,
readAttempts3/writeAttempts2. Fresh receipt:
corpus-local/company-three-cohort-remote-transfer-resume5-20260920.json.
Stopped after 1721 verified objects/126028025bytes on read timeout,
with all10read retries consumed. No uploader is active. Preserve resume5 receipt;
next transfer targets the larger verified plan after its checks complete.
The complete three-cohort plan is6,249objects/828,340,450bytes. Public staging bucket
company-reference-staging has no public write policy added. Exact-byte GET/cache
canaries passed. No production page activation or complete transfer is claimed.

Preview dpl_Gw2aMA1cscjaGtV3c9JzF95voFai is READY at
https://meridian-omfw4yrid-arhans-projects-ac470eaa.vercel.app
Source9f1e607c, isolated checkout canlicapital-company-preview-20260920.
Four hosted unavailable-state checks passed (404/405/503 GET/HEAD and cache/robots).
Ready-data checks, canonical routes, corpus-wide HTTP/browser verification and
production rollout remain pending. Production publisher checkout stays9608542c.

Candidate inventory:3,323unique companies plus87,348history pages. Verified combined
catalog and discovery now include67directory pages, yielding90,738unique candidate
URLs. Pilot overlaps mean these are not net-new live pages.
Count receipt: company-expansion-candidate-counts-20260920.json.

## Historical cash review checkpoint

PR25 merged as757b46257b1ac8b6fe9f299a4fa3d8851369335f after all four
CI35512759597 jobs passed at194688b041f745dc4e99457a3d0892f40e0167e5;
both trees f58eacca6e39aeaeb58591164cac7377ebee0ff7.
Branch research/cash-statement-scope-20260920 preserves17older primary
filings and17XMLinstances for18selected observations across Holding and Atlantica.
Original comparison matched17/18. Exact retained legacy namespace support resolves
the remaining observation; revised offline comparison matches18/18. Three XML
regression tests pass, retaining identity/date/unit and lookalike rejection.
Archive111files/54,312,960bytes SHA256
e0329e7bf4a5084152c53762e656a41e82633a2862f2979e732cdfc01ad20f37
restored every hash and reproduced inline/XML reports byte-for-byte offline.
This is local evidence preservation, not offsite backup or source admission.

Statement scope review now covers all18older observations across17filings.
Each is visible as an opening zero in the earliest annual cash-flow column, except
Atlantica1996-12-31, corresponding to opening cash in the inception1997column.
XML instant dates, entity, units and numeric zeros support the interpretation;
it does not prove a separate annual report was published for each instant year.
Holding statements belong to the holding partnership; separate operating LP cash
must not replace them. Atlantica zero balances coexist with financing/operating
cash flows. No selected data values or admission policy changed.
Report company-cash-history-statement-scope-20260920.json SHA256
367303c7300e0e0ea613a861e532fd6e8c285f89130bb2272ee7d72b9cec220b.
Separate scope archive113files/54,394,880bytes SHA256
c8836ee076a85c914e55f3aa5f732cdca0c5bbc781bdd0eadce0ef5172d422a1
verified every restored hash and reproduced scope report byte-for-byte offline.
Two latest retained filings separately support seven numerical matches/five
visible year-end columns. Broader review of other cash histories, metrics and
remaining editorial flags continues; no whole-corpus approval follows.

Overall goal remains active; actual indexing and governed forward outcomes remain
unproven. Next serving action: upload the new five-cohort plan with bounded recovery,
then configure a preview for its release and run hosted ready-state checks.

## Verified five-cohort candidate

PR26 merged as4b24bd5040dd3bb55a0806d478682d87e12bdf73 after all four
CI35513004800 jobs passed at219b779dc67d8d07d0c900a3e75fda2716f857fc;
reviewed and merged tree88e99ad5d4088b10076dfcf6cb8cc7669f066def. Post-merge CI
is successful. Historical statement-scope evidence is merged.

Combining the original batches correctly stopped on differing selection policies
(v3/v9/v8). Original pins/failure receipt retained. Replayed first/second/third/fifth
into fresh v9 directories using existing cumulative policy; fourth already usedv9.
Session55226 exited0. All3,323selected records differ only in selection_policy;
source descriptors, concept values and excluded capture lists are unchanged.
First cohort now includes explicit capture-review metadata; selector hashes reflect
current replay code. Original artifacts remain unchanged; v3upload later stopped as recorded below.
New pins: company-five-cohort-v9-inputs-20260920.json. Combination24408and
catalog/release/discovery/storage pipeline28956both completed exit0. Release:
9b562e4b5a1095e6dadb330915060b8b320ba02fc9384e9c5aef72f8d0aee4a2
Catalog:66305915c903391dfca9ad7a829f5fbbfea06c6d3b877daac2819e307e755d1e
Downloads:a28baba4bdfc213e576c77e68b6f45245f1c3ab8c00caec7a42f540d2cd4d1c7
Plan:6cafb5205963ea8187a8f014dfeb8342bdd487f2274c33603ff96d332a83750c
Runtime10,360objects/1,280,295,450bytes. Source replay and archived-manifest/index
binding checks pass for all3,323companies/87,348histories. Independent XML/hash/
unique-URL audit verifies90,738URLs in two shards (50,000and40,738), including
67directories. No production rollout, Google submission or indexing gain.

No uploader is active. Resume5for earlier three-cohort plan ended at1,721verified
objects/126,028,025bytes, with10read retries consumed. Next upload should use the
new five-cohort plan; retain existing immutable objects and verify any reused keys.
Review explicit bounded retry allowance for10,360objects, keeping per-object limits,
permission/rate-limit failures and corruption terminal. Do not blindly rerun the
old v3plan. Five-cohort runtime archive/isolated restore still needed; earlier
cohort archives remain preserved. Source admission and offsite backup remain open.

## Current transfer and archive verification

PR27 merged as0c2b646e8607e58f0990f3bbfb6bc70b6684f9d4 after all four
CI35513399510 jobs passed at12dc203d3db67afae57f985796a6e6d5f9abbaf3.
Both trees def9e9101444404fde6d9c73240bd18d2ea672ba. Post-merge status pending.
PR28 reviews a98637c4e6b8ce5e738c4648d79cc70a154f398a: explicit bounded retry
budgets recorded in receipts, default10preserved. Twenty storage/planner tests pass.

Five-cohort upload session26312 is active, concurrency4/readAttempts3/writeAttempts2,
read budget200/write budget50. Current receipt:
corpus-local/company-five-cohort-transfer-20260920.json. Latest verified checkpoint
112objects with no failures. Poll this exact handle before restarting; no older
uploader is active. Permission, rate-limit, corruption and per-object limits remain
terminal. Complete transfer/hosted data verification not yet achieved.

Five-cohort archive built successfully (session35755 terminal0):23,115files,
2,691,512,320bytes, SHA256
b77ae93d4fe8c6935aa5569c81f8030ac19819d26ac2b4bf1b747b2f317ebd41.
Contains all five completed capture queues, exclusions, six editorial capture
directories, reachable runtime objects and repository a98637c4. Updated packager
is included separately as packager.py; saved repository precedes this profile.
Isolated restore session61898 is active. Poll before claiming source/runtime replay;
no offsite backup or publication approval. Exact summary:
company-five-cohort-evidence-archive-summary-20260920.json.
