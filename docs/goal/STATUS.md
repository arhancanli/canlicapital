# Current state

Updated September20,2026. Goal ACTIVE, NOT ACHIEVED. Codex implements directly;
Hermes is stopped. All owner requirements remain in REQUIREMENTS.md. Previous
status is preserved in history/STATUS-20260920-through-five-cohort-archive-start.md.

## Current execution

Website worktree: /Users/arhancanli/canlicapital-expansion-20260919.
Branch research/five-cohort-hosted-preview-20260920. PR27 merged as0c2b646e
with all four CI35513399510jobs passing; reviewed/merged tree
def9e9101444404fde6d9c73240bd18d2ea672ba. PR28 merged as
f54d26e793b815baea6a0d0a8d032ca6b3f0d79d after four CI35513563000jobs passed;
reviewed a98637c4 and merged trees equal6f5ccfffe21aa3e92d4ac4ee15e5bf49b8464f2f.
Post-merge PR28 checks passed. PR29 merged asb2b8c0354d5f712cbb2abfb150596112ee2c8834
after all four CI35513797336jobs passed at1d6ad4cb. Both trees
e84a0c176ef185056d212f8de951e06dc039cb8d; post-merge checks pass.

Five-cohort uploader session26312 is active, using codea98637c4. Settings:
concurrency4, readAttempts3, writeAttempts2, total read budget200/write budget50.
Per-object limits, permission/rate-limit/corruption stops, exact-byte verification
and create-only reconciliation remain enforced. Twenty storage/planner tests pass.
Receipt: corpus-local/company-five-cohort-transfer-20260920.json.
Latest observed checkpoint: 1364 verified objects, 13 read retries, 0 failures.
Poll exact handle before restarting. Prior v3resume5session23870 is terminal after
1,721objects/126,028,025bytes; receipt and failures preserved. Do not restart oldv3.
Full transfer and page activation remain incomplete. Separate representative
hosted ready-data checks now pass; see the preview section below.

## Verified combined candidate

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

Last verified live application revision9608542c serves327sitemap URLs. Clean
publisher checkout: /Users/arhancanli/canlicapital-production-20260920.
Hourly publication can change deployment IDs; inspect current alias binding before
claiming an exact live deployment. Verified327URL scan,12Chromium/WebKit cases,
sitemap bytes and staged/live key-revocation lifecycles remain recorded in
artifacts/platform/*9608542c.json and artifacts/qa/staged-production-*.
Supabase production projectbpnensyowfmdwhqmfdrg and key-revocation migration verified.
Correct-account credential is held separately; do not use wrong CLI preview identity.

Five-cohort preview dpl_CL9YBfWudnroTVMroAGJruvmVH6A is READY:
https://meridian-kd3tqy3yw-arhans-projects-ac470eaa.vercel.app
Clean sourcef54d26e793b815baea6a0d0a8d032ca6b3f0d79d, checkout
/Users/arhancanli/canlicapital-five-cohort-preview-20260920. Validation clone
/var/folders/qk/0lc9wn8s1cjb65x50t0gn3km0000gn/T/canli-validation-rqoTGB;
build log /tmp/canli-five-cohort-preview-build.log. Deployed original clean source;
only deployment-local public storage settings bind the five-cohort release.
Production settings unchanged. Earlier v3preview remains historical evidence.

Four unavailable-state checks passed before the probe upload. Separate29-object/
1,274,386byte probe transfer10532completed with exact public-byte verification,
concurrency1 alongside bulk26312. It contains only dependencies for first/middle/
last company and first-directory checks; completion does NOT mean full transfer.
Probeplan8529568b6497739c4a75c70897696ada384917a637f1a4a01de792c989f37cba
binds full plan6cafb520; source CIKs0000001750/0001090872/0001873213.

Initial ready audit44329failed only on three304responses omitting X-Robots-Tag.
Recheck31384retains one fetch failure and weak-versus-strong ETag mismatch findings.
Corrected audit requires a prior verified200/noindex/no-store for the same path,
matching If-None-Match opaque validator, empty304body and unchanged no-store.
Full/error responses still directly require noindex/no-store. Three regression
checks reject missing prior evidence, changed validators and conflicting robots.
RFC9111sections3.2/4.3.4 and RFC9110section13.1.2 explain the conditional semantics.
Neither failed receipt was replaced. Final audit64924completed exit0 with23checks,
zero failures: company/history HTML, source/selected download hashes, assets,
HEAD/ETag and genuine404responses. Receipt:
company-five-cohort-preview-ready-recheck2-20260920.json.

Next: complete bulk transfer, prepare clean canonical routing in a preview, then
browser/user-journey and full-corpus checks plus remaining editorial/admission
work. Explicit API sample is not canonical-route activation, all-page HTTP proof,
cloud-load benchmark, production release or Google indexing evidence.

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
