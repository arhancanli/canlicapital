# Current state

Updated September20,2026. Goal ACTIVE, NOT ACHIEVED. Codex directly implements;
Hermes stopped. All owner objectives remain in REQUIREMENTS.md. Prior detailed
status preserved in history/STATUS-20260920-through-equality-triage.md.

## Current execution

Worktree /Users/arhancanli/canlicapital-expansion-20260919, branch
fix/dbmm-period-scope-20260920. PR34 merged as
34f2b81e9dec93047c90c4185d1a59fe9ada3661 after four CI35517891088checks passed
at2ca4f9fe; tested/merged tree67b8efb122bd96a625a6d7933a5312c9b8e31da3.
PR33 merged as
c9ac91c67f490196a3efe5d8ea160ad76e937f67 after all four CI35517514528checks passed
at12dabec8. Tested/merged trees bothb6581a1f54916285ba89b1e8d29204fb080e7732.
PR32 merged as
b5dc0ac266333dedb5e22b8a2a50ca9b59c262fb after all four CI35516768834checks pass
at0dcfa6f73768fe6419a547012e87ad0952dc7ca6. Tested/merged tree both
40d3071a73e02164a89fb58289696e8c08bcf537. PR31 previously merged59b10c83 with
five checks and exact tree equality. Post-merge PR32 CI35516871919passed.

Bulk storage26312 is TERMINAL exit1 at5625verified objects, incomplete.
Create of delivery/objects/54f880cf171ac6dff01c2e394b1a4aea0d1b31cca2f482974a1b7845eb69f056.json.gz
returned429 and stopped without retry.54read retries/4write recovery events preceded
that stop. Receipt corpus-local/company-five-cohort-transfer-20260920.json remains
unchanged; stop summary company-five-cohort-storage-stop-20260920.json.
Original uploader26312 is terminal. Paced recovery77617 is TERMINAL exit1 after deliberate Ctrl-C supersession at2412objects; zero recorded failures. Do not poll/restart26312as live.
Read-only provider logs show DatabaseError/429 at2026-09-20T14:53:06.280000, with
pool/connection indicators. No raw headers/messages or credentials stored. Project
ACTIVE_HEALTHY at15:00UTC, aggregate17connections/max60, not proof of storage pool
capacity. See company-storage-429-log-diagnosis{-v2}-20260920.json and
company-storage-health-20260920.json. Exact failed-key public inspection is recorded
in company-storage-denied-key-inspection-20260920.json. No write attempted.
Supabase documentation says storage429 can involve pooler max_clients; this is
context, not conclusive diagnosis: https://supabase.com/docs/guides/storage/debugging/error-codes.
PR35 now retains sanitized numeric/date Retry-After metadata on rejected reads
and writes without changing429hard-stop behavior.21storage/planner tests pass,
including one denied request without retry/write and omission of upstream bodies.
The active recovery uses earlier e5177ec0: create diagnostics and pacing are
present, but read-denial metadata was added afterward; do not claim it hot-reloaded.
Paced recovery77617 launched from e5177ec0 after20storage/planner tests passed.
One worker, minimum500ms between request starts, read/write bounds3/2 and shared
retry budgets200/50. Fresh receipt corpus-local/company-five-cohort-transfer-
resume1-20260920.json records code SHA4d9b812261243ed1421f45e1be981a4899417338b3a8a407f0a88a0f24207afc.
Initial checkpoint36objects verified, zero failures, incomplete; these are
reverified objects, not36new uploads. Existing objects are independently checked;
only absent objects can be created. Any429/permission/corruption stops recovery.
Original failure receipt unchanged; no limits/settings/billing changed.
The previous credential-waiting launcher88342 had no recoverable session handle;
it was explicitly terminated before launching77617, so no duplicate uploader exists.

Primary acquisition43531 is terminal exit0: all159index/primary pairs verified,
complete receipt company-equal-history-capture-complete-20260920.json. All200
priority primary filings are now retained (41original+159new).
First XBRL49534 terminal:39/51matches; whitespace-date fix offline replay now51/51.
Second XBRL18988 is terminal exit0:116/126initial matches. Corrected date-whitespace
offline replay now126/126. Original result preserved. No acquisition/comparison process remains active. PR33 evidence/tooling is merged.
Archive/replay46444completed exit0. Archive corpus-local/equal-history-evidence-
20260920.tar:941files/293,847,040bytes, SHA256
cb89a5df08529157f6bc2e42f3d498b6b9d5b05fcfc2960c46e7f048adf436bc.
Isolated restore verifies all member hashes, installs locked wheels offline and
reproduces all five comparison reports byte-for-byte plus exact610/610observation
closure. Receipt company-equal-history-archive-20260920.json. Prior/current helper
versions preserved; later instances withheld during earlier primary replay.
Does not regenerate companyfacts queue, rerun manual interpretation or establish
offsite backup. PR33 CI35517263780passed all four checks at1a019807 before packager
addition; current additions require their own checks.


Earlier v3upload sessions are terminal with failures retained. Do not resume the
superseded v3plan. V10transfer82504 is terminal, deliberately superseded; v10pipeline77545 completed exit0. Archive/replay46444completed exit0.

## Latest liability presentation review

PR35 merged as bcfcb37157b6a0bb16813a0eb4ae0ed9291d8624 after all four
CI35518895959checks passed at9e7c2bba. Tested/merged trees match
eeebaf502754ca3fbdd1836e215d06ac9f4f1b91. Recovery77617 is superseded; receipt preserved.
New offline helper prepares all17liability/current-liability pairs using latest
selected reporting date, avoiding accession-order errors. Twelve pairs have
separate primary rows, reviewed as equal totals at the listed date; five XML-only
pairs initially remained pending. Four now have reviewed retained balance-sheet
tables in company-liability-legacy-context-20260920.json; Green Stream
0001437476 was initially open because its primary is an XBRL-only amendment.
Original accession0001683168-21-004121 now captured with index/primary hashes;
its balance sheet supplies the matching927,297USD April30,2021totals. Separate
company-greenstream-original-context-20260920.json binds the original and amendment
without rewriting selected accessions. All17latest pairs now have limited
statement context; all-history scope and publication remain open. Archive4857
completed exit0:35files/4,997,120bytes, SHA256
f16e4ac95ee698890faaca6663abece7c7882d86373401e7deee412c177b6345.
Isolated restore installs locked dependencies offline and reproduces all three
reports byte-for-byte. Receipt company-liability-evidence-archive-20260920.json.
Manual interpretation is preserved, not independently rerun; no offsite-backup claim.
All three context reports
reproduce byte-for-byte offline. Evidence company-liability-presentation-{review,scope}-
20260920.json. Atlantica correctly selects2025rather than2019. No all-history
admission, new page notes or deployment follows from these limited checks.

## Current filing-context improvement

Six companies now have source-bound context. Five latest-period revenue presentations reviewed:3M,CONMED,Digital Brand Media,
Mosaic andAbbVie. Source-linked notes explain consolidated totals versus geographic/
segment breakdowns on both matched history pages. Notes require exact CIK,captured
source hash and all reviewed observations (period/unit/value/accession); changed
evidence suppresses them. No blanket tag equivalence or all-history admission.
Ten renderer tests pass including stale-note guards and unchanged pilot output;
twelve real selected history pages render notes locally. EVENTIKO adds the reviewed
website-development/payable distinction, bound to all8selected observations and
linked to its2024annual report. Evidence company-revenue-
presentation-scope-20260920.json and company-filing-context-render-v2-20260920.json.
Implementation scripts/lib/company-filing-notes.mjs; not yet deployed.

## Birdie Win expense scope — publication hold

All three selected2023–2025 SG&A values aggregate statement general/administrative
expenses with separately presented depreciation in segment disclosures. Primary
statements report47,162+137=47,299;48,364+718=49,082;29,237+744=29,981USD.
Evidence company-birdie-expense-scope-20260920.json binds both filings and all
selected periods. Withhold CIK0001873213/SellingGeneralAndAdministrativeExpense
before publication; retain OperatingExpenses and original values. Policy extended-v10
now implements the source-bound exclusion while preservingv9.20selector and6delivery
tests pass; real captured Birdie replay confirms only SG&A is removed. Five cohorts
restaged in4701(terminal0); comparison61318(terminal0) verifies all3,323companies
and exact source descriptors. Histories87,348→87,347; only policy metadata and
Birdie SG&A removal/notice changed. Receipt company-five-cohort-v10-transition-
20260920.json pins all five new manifests. Rebuild combined catalog/release/sitemaps
and storage plan next; the oldv9candidate must not be admitted unchanged.
Pacedv9 transfer77617 was stopped as superseded after v10combined delivery built.
Receipt company-v9-transfer-superseded-20260920.json records2412verified objects.
Pipeline77545 completed exit0. V10transfer82504 is terminal, deliberately superseded with one worker/500ms
spacing and existing3/2attempt limits,200/50shared retry budgets. Fresh receipt
corpus-local/company-five-cohort-v10-transfer-20260920.json; no publication approval.

PR36 merged4d091c1f0a34b31bed9002c728cc1ab84e04564f after four CI35519464225
checks passed atf9038476; tested/merged treeba6a7e72f022befa3cd5b2d157b73ce618468252.

## Remaining priority equality context

Report company-remaining-equality-context-20260920.json records latest-period
context for14other pairs/28observations. Eight asset/current-asset pairs, three
operating/net-loss pairs, Morgan payable/current-liability, Emo comparative
cash/current-assets and TECHCOM zero revenue/capex retain their distinct scope.
Three legacy tables are source-hash checked. Offline replay is byte-identical;
manual interpretations are recorded, not independently certified. This report was
created after the v10archive and is not claimed archived there. Broader historical
scope,712basic/diluted groups and other flags remain open.

## Exact priority scope coverage

PR37 mergedcf86ac95f4a0233138e253ee5ebe1997905513d9 after four CI35520397809
checks passed at10b451cd; both treesdfad64d51e92d3adf227250eaff3857f5a9dbadc.
company-priority-scope-coverage-20260920.json deduplicates the exact observation
keys supported by all retained scope reports:610original priority observations,
90with recorded context review, including3withdrawn Birdie SG&A observations.
Baseline:87active observations have scope review;520still need it.
Historical revenue review now adds65exact previously pending inline observations
across3M,CONMED,Digital Brand Media,Mosaic andAbbVie;15legacy revenue observations
still need primary context. Separate v2ledger records155reviewed including3withdrawn,
152active reviewed and455pending at that checkpoint. Legacy primary review now
closes14more; v3ledger records169reviewed including3withdrawn,166active reviewed
and441pending. One Digital Brand Media contract-revenue observation for2020
remains unresolved:268,957USD is assigned2020in XBRL but geographic disclosure
prose and asset label say2019. Statement revenue supports2020 but does not settle
the geographic date conflict. Resolve or explicitly withhold this observation
before admission; do not silently correct it or approve the history unchanged.
Report company-legacy-revenue-context-20260920.json preserves seven primary
filings/tables and preceding prose; replay byte-identical. Reports company-historical-revenue-context-
20260920.json and company-priority-scope-coverage-v2-20260920.json preserve
the original ledger and bind the supplement to its hash. No newly admitted pages. The full pending queue
retains issuer, exact selected row and accession. Report replays byte-for-byte.
This counts recorded reviews, not machine-certified interpretation or admission.
It excludes712basic/diluted groups and other corpus flags. Next: review historical
primary context in this exact queue without double-crediting latest-period work.

## Exact disputed-period exclusion implemented

PR38mergedad8202ff851791358c7d13979948dfd3061cb215 after all four
CI35520830847checks passed ateeeae0ba. Tested/merged trees match
08544f70919bf54211d3341cc7da62304aa442fd.
Policy extended-v11 now withholds only Digital Brand Media contract revenue
for2019-09-01through2020-08-31,268,957USD,accession0001185185-21-001609,
bound to reviewed sourceSHA1d83049f...a36021. Other periods and statement revenue
remain unchanged. Record carries the exact omitted observation and reason;
overview and affected history explain the gap with a filing link.31selector/
renderer tests pass, including the actual104,479byte compressed capture fixture,
changed-source/capture-date rejection and unchanged existing pilot HTML.
Old policies remain reproducible. Five-cohort v11staging16829completed0;
comparison7564completed0 verifies all3,323companies/87,347histories againstv10.
Only selection-policy metadata, one DBMM observation and its explanation change.
All source descriptors and other values are unchanged. Receipt company-five-cohort-
v11-transition-20260920.json pins five new manifests. Combined catalog/release/
discovery/storage pipeline90963 is active; no new release/URL count asserted yet.
V10uploader82504was deliberately stopped as superseded; receipt company-v10-
transfer-superseded-20260920.json retained. No uploader active. Full v11rebuild
and later immutable reconciliation are required before publication.

## Immediate next work

All610selected observations across38priority equality groups now numerically
reproduce:433primary matches+51first XBRL+126second XBRL. Summary
company-equal-history-numerical-closure-20260920.json binds five comparison reports
and verifies exact equality with the queue's610unique observations, without double
credit. Both initial failed XBRL reports and corrected offline replays preserved.
This does not close source-scope/usefulness review, the712basic/diluted groups,
other corpus flags, or production admission.

Preserve all unmatched cases and failed reports, finish primary scope/usefulness
review and archive/replay new evidence. Full storage transfer, whole-release
delivery/load checks, editorial admission and production activation remain open.
Owner publication approval persists; it does not substitute for these checks.
Prior1–3day/tonight estimates were provisional, not measured completion forecasts.

## Current v10 combined candidate

Pipeline77545completed exit0.3,323companies+87,347histories+67directories =
90,737unique URLs. Independent XML/hash/uniqueness and full URL-set comparison
shows exactly one removal: Birdie Win SG&A; no added or other removed URL.
Two sitemap shards:50,000and40,737URLs. Oldv9artifacts remain preserved.

Release:a72ba35e459570be3b8fd009c042eeddc2348eb966695e5960a71d08829f433b
Catalog:88aaccb5340edf1f2a6b522b0e972065c79348344ca73c337c11dd970283f6d1
Downloads:1404ffe09853d68c04f1ba0f350d121c77813f51ff0a8ccaa65fbdb8026bb72c
Deliverymanifest:d92baf65e00228fe351a398035f8fd4f103b6a98a7c1bba00108f2569110a6d0
Storageplan:2ef810f405e2182093288e11d1698df6cc93262f9df7ebdeae81284c691850ff
Paths corpus-local/company-five-cohort-{delivery,catalog,discovery}-v10 and
company-five-cohort-storage-plan-v10.json. Plan10,360objects/1,280,300,997bytes;
3,323keys shared withv9,7,037new keys. Shared keys are not remote verification.
Audit company-five-cohort-v10-discovery-audit-20260920.json binds all roots.
V10transfer82504 is terminal, deliberately superseded (fresh v10transfer receipt), one worker/500ms.
Archive build/replay39153 completed exit0 from repository3ddb2536; output
corpus-local/five-cohort-v10-evidence-20260920.tar. Summary and restore receipts
use prefix company-five-cohort-v10-evidence-.23,119files/2,697,574,400bytes,
SHA633cfbe1ccbbda383483cfb8cc4d40c3a9399b55b006072079b4ef779c81a62b.
Isolated restore replays all five queues with1,026exclusions/zero errors and
all10,360runtime objects; Birdie scope report reproduces byte-for-byte with
locked offline dependencies. Local portability only, no offsite backup.
Remaining editorial and hosted verification stay open. No deployment or indexed gain. Production remains327sitemap URLs.

## Previous v9 candidate (preserved; superseded)

3,323companies +87,348histories +67directories =90,738unique candidate URLs.
Local XML/hash/uniqueness audit verifies two shards (50,000and40,738URLs).
Includes pilot overlaps; not net-new live or indexed pages. All five cohorts replay
under existing cumulativev9 policy with values, sources and exclusions unchanged.
Original mixed-policy rejection and every original manifest remain retained.

Release:9b562e4b5a1095e6dadb330915060b8b320ba02fc9384e9c5aef72f8d0aee4a2
Catalog:66305915c903391dfca9ad7a829f5fbbfea06c6d3b877daac2819e307e755d1e
Downloads:a28baba4bdfc213e576c77e68b6f45245f1c3ab8c00caec7a42f540d2cd4d1c7
Plan:6cafb5205963ea8187a8f014dfeb8342bdd487f2274c33603ff96d332a83750c
Runtime10,360objects/1,280,295,450bytes. Ignored paths under corpus-local:
company-five-cohort-{catalog,delivery,discovery}-v9 and
company-five-cohort-storage-plan-v9.json. Tracked receipts:
company-five-cohort-{policy-replay,discovery-audit,storage-plan-summary}-20260920.json.

Archive five-cohort-v9-evidence-20260920.tar contains23,115files/2,691,512,320bytes.
SHA256:b77ae93d4fe8c6935aa5569c81f8030ac19819d26ac2b4bf1b747b2f317ebd41.
Build35755and isolated restore61898both terminal0. Restored source replay:
342+853+766+683+672accepted captures and1,026exclusions, zero errors. Seven pilots
are included separately in runtime. All10,360runtime keys/hashes/bytes and exact
roots reproduce without reading original capture/runtime directories. Saved repo
a98637c4 plus separate newer packager.py retained. Editorial captures preserved;
this combined restore does not rerun every manual scope report. Earlier scope
archives have their own replay receipts. This is local portability, not offsite backup.
Receipts: company-five-cohort-evidence-{archive-summary,restore}-20260920.json.

## Production and hosted preview

Production remains application revision9608542c with327sitemap URLs; owner already
submitted https://canlicapital.com/sitemap.xml (rechecked HTTP200/327URLs).
Clean publisher /Users/arhancanli/canlicapital-production-20260920. Hourly publication
can change deployment ID; inspect alias before asserting an exact live deployment.
No expansion page activation or indexed gain. API-key revocation migration verified
on Supabasebpnensyowfmdwhqmfdrg; correct-account credential held separately.

Clean preview https://meridian-9zuz7qkhn-arhans-projects-ac470eaa.vercel.app
is deployment dpl_C3NZMgurfcejtqhL1Pwuo57BMrE3, source1ab2ef029b4703624d4fcca848709ff7eaefb215.
Opt-in preview postbuild removes generated pilot copies that shadow dynamic routes.
Default production routing unchanged.23HTTP checks pass including exact directory
membership;32representative browser cases have passing evidence across runs:
27initial,4focused and1independent GitHub desktop flow. Not one fresh32case run.
Local Chromium network failures retained; CI35515799025/35515925557 desktop flow
passes without failed requests. These checks cover representative noindex pages,
not all90,738URLs, cloud load, accessibility certification or actual indexing.

Probe upload29objects/1,274,386bytes is complete, not full storage. Explicit API
preview dpl_CL9YBfWudnroTVMroAGJruvmVH6A and all earlier failed HTTP/browser reports
remain retained. Exact receipt paths/history in archived prior STATUS.

## Editorial evidence and remaining gaps

Combined selected-quality replay:3,323companies/87,348histories,13,148flagged pages
with overlapping reasons.10,630historical-only,1,309multi-unit,402partially historic
units,75constant,74zero-only,1,500pages in750equal-vector groups. Flags are not
confirmed defects or admission of unflagged pages. Full local report/gzip hashes:
company-five-cohort-selected-quality-summary-20260920.json.

All750equality groups reproduced from selected records:712nonzero basic/diluted,
37other nonzero,1zero-only. Priority38groups mapped to610selected observations
across200filings. Initial41retained filings reproduce212/212. Incremental59filings
cover134more observations:83match,51unresolved in25filings. Thus295/346compared
match. At that snapshot100filings/264observations lacked captures; subsequent acquisition completed; see current610/610closure above. EVENTIKO4supplement overlaps incremental results, not extra.

Limited primary interpretations:3M2023–2025 matching revenue totals; EVENTIKO all
8selected observations for payable/property2022–2025 in3filings. Separate11,000
asset/payable lines and nonzero related-party loans are explicit; fixed assets
include website development. Equality does not make concepts interchangeable.
No company-wide admission. Other source-scope/usefulness checks remain open.

XML helper now resolves scoped currency QNames, rejects incorrect/undeclared/
rebound prefixes and accepts valid aliases.17corpus+5XML tests pass and run in CI.
Post-fix212observation replay has identical filing results with new helper hash;
original reports/archives unchanged. New acquisition evidence now has verified archival closure and isolated replay.
No offsite-backup claim.

## Other owner objectives and remaining evidence

- Google baseline262indexed as of Sep14(exportSep20),40not indexed. No new actual
  indexing gain. URL-level exports needed for3discovered/2crawled exclusions.
- Search intent104owners/147hypotheses/223unassigned pages; relevant coverage open.
  Discovery8,031CIKs/34old concepts cannot reach800k; additional useful sources and
  families required.3,467identities unqueued after fifth. Prior SEC bulk403 remains
  an access stop; do not retry through alternate paths. SOURCE_CAPACITY.md.
- Source/editorial review incomplete. Versioned scope exclusions retained; fourth
  queue430observations/185filings incomplete. Six extra concept samples reproduce
 198/198figures across40filings, not admission. Historical cash scope18observations/
 17filings now reviewed as opening balances, with entity and reporting context.
  Latest two filings separately reproduce7observations. CONCEPT_REVIEW.md.
- MCP0.1.2published on npm/official MCP registry; exact package bytes and48tests
  verified. Real API/MCP/repository adoption remains unproven; no artificial activity.
- Engine PR71merged0aff241a from tested867d211; six CIchecks passed (4,366portable,
 55skipped; one serial performance;11PostgreSQL). PR68/69/70closed as incorporated.
  Running engine not activated for trading; dirty original preserved. Only reviewed
  website snapshot helper/presentation pointer activated. Five forward returns/four
  sleeves remain immature. Owner-reserved blind labels/protocol decisions pending.

Goals remain800kactually indexed canonical pages(target1m), exceptional quality/
SEO/relevant intent, real developer adoption, governed combined NET FORWARD
Sharpe>2,at least14economically distinct qualified sleeves and realized maxDD<=10%.
No broker orders, fabricated evidence or unapproved research decisions.
