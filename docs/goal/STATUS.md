# Current state

Updated: 2026-09-19. Overall goal: **ACTIVE, NOT ACHIEVED**.
Current phase: **4 — preview ready; integrate with the approved production publisher**.
Phase 1 tooling is tested; whole-corpus measurement remains blocked on source access.

## Verified baseline

- Last verified production sitemap: **263 URLs**. This is not an indexed-page count.
- Tested website draft: **327 indexable URLs**, including 64 new company-reference pages across seven companies and 56 financial histories. Two fresh SEC captures (Dollar General and Cousins Properties) add 15 pages. Production is unchanged; preview deployment is Ready per Vercel CLI.
- Actual indexed pages: **unknown**; Search Console access question is pending.
- Sitemap capacity: one million synthetic URLs passed as 20 shards. Synthetic URLs do not enter content inventory.
- Current local validation: 302 tests pass (6 preverify + 296 main), including archive source-date validation. Prior unchanged corpus and IndexNow suites pass. Release snapshot: 690 rendered pages, 327 indexable; metadata zero errors/warnings, indexability zero conflicts, all indexable pages within three clicks; numerical-source and all 14 retracted-claim rules pass. Thirty-two Chromium/WebKit viewport checks pass, including both new companies and Assets histories. Prior MCP package validation: 43 tests; MCP implementation has not changed.
- PR 15 expanded CI at `78f914bd` passes on Linux/Node 22: build, full evidence/SEO verification, browser tests, corpus tests and notification tests. The initial shallow-history failure at `2acf8087` is fixed by fetching full history. Run: https://github.com/arhancanli/canlicapital/actions/runs/35437145441. No PR has been merged or deployed.

## Current implementation (2acf8087 implementation; 78f914bd CI correction, both pushed)

- `scripts/lib/company-reference.mjs`: reject impossible date order, handle invalid calendar dates safely, detect conflicting facts regardless of input order, and expose exclusion diagnostics.
- `scripts/company-catalog-worker.mjs`: reuse production selector for bounded per-entity audit requests.
- `scripts/audit-company-corpus.py`: local ZIP-to-SQLite candidate catalog; source/member/code hashes; atomic replacement; exclusions; explicit sample scope; no publishing.
- Seven company-reference tests and five Python bulk-catalog tests pass. Pilot catalog reproduces five entities and 43 histories (48 candidate entity/history pages, excluding the directory); see `artifacts/seo/company-corpus-pilot.json`. This is not a whole-market count.
- Goal folder and AGENTS.md continuity instructions installed. Read these before each phase and after compaction.
- Phase 2: 78 canonical keyword-intent owners and 95 editorial query hypotheses; 249 indexable pages remain unassigned for review. No demand/rank measurement claimed. Company titles preserve entity names; visible/schema breadcrumbs and sibling links added. CI now installs Chromium and runs full evidence/SEO, corpus and IndexNow checks.
- Phase 6 overlap: company pages and shared footer promote API keys/MCP; developer hero promotes MCP/GitHub. CONTRIBUTING and an integration issue template support substantive contributions. No outreach, releases, npm publishing or star-count claims.

## Blockers and unresolved evidence

- SEC bulk archive HEAD request returned HTTP 403 from this environment on 19 September. No complete corpus was downloaded or counted. A local research collection contains 520 companyfacts gzip files; all 48 parts, issuer-manifest lineage and 520 file hashes/sizes verified. Selector accepts 344 companies and 2,657 histories (3,001 candidates), rejecting 146 invalid entities and 30 insufficient histories. Individual capture times are unknown, so candidates are not publication approved. This is a selected sample, not the full SEC corpus. Do not bypass access controls or extrapolate their eligibility to the market.
- Search Console baseline unavailable. Asked owner which account/integration manages the property; answer pending.
- PR 69's historical-environment fix is committed as 783ad0c and pushed: 49 local tests, strict mypy/Ruff and all 16 publication integrity checks pass. Original publication/migration files are unchanged. Remote publication integrity, PostgreSQL, mypy, Ruff and browser jobs pass at 783ad0c; the offline pytest job remains running. Keep draft until remaining checks finish.
- PR 68 full CI passes, including the 23m19s offline suite. PR 69 offline pytest remains running; its other jobs pass. PR 70 collector-quality CI passes all jobs except the still-running offline pytest job.
- Engine baseline snapshot: four sleeves, four current-epoch daily returns; 248 more observations before Sharpe estimation and 752 before observation-count establishment gate. Modeled cost and tail-risk coverage incomplete. This is a dated snapshot, not a current live metric.

## Next actions (read and verify before proceeding)

1. Source-audit checkpoint c3c5e3dc is pushed and passes 301 local website tests and six catalog tests. CI run 35438057534, job 105884006622, passed for c3c5e3dc. Then refresh and semantically review eligible source candidates before publication.
2. Review remaining 249 keyword-unassigned pages against their actual research/evidence, not arbitrary keyword variants. Search Console query evidence remains unavailable.
3. Read this folder and ENGINE_ENVIRONMENT_REVIEW.md, then finish phase 7's security/reproducibility CI review. Historical archive resolver, explicit verification receipts and an enqueue-time active-file guard are implemented in 783ad0c. Forty-nine local tests, type/style checks and publication verification pass. Remote PostgreSQL/publication/mypy/Ruff/browser checks now pass; offline pytest remains running; no publication manifest or migration packet was rewritten.
4. Collector v4 fix is local in /Users/arhancanli/alphac-source-quality-20260919, branch fix/sec-companyfacts-source-quality. Commit e0a257c is pushed in PR 70. Twenty-four tests and Ruff pass. Final-code read-only validation rejects 146 invalid payloads and accepts 374 valid retrievals; all original bytes are unchanged and all 520 individual capture times remain unknown. Fresh future downloads now receive hash-bound UTC capture receipts; legacy caches are never backdated. PR 70 publication, PostgreSQL, mypy, Ruff and browser CI pass; offline pytest is running (run 35438489448, job 105885124970). Plan phase 3 rendering/storage using measured source scale; no million-page serving capacity claimed.
5. Complete release readiness and deploy only a passing reviewed result. Recheck production and indexing separately; no deployment has occurred.

## Release snapshot checkpoint

- Snapshot: `/tmp/canli-preview.v8wzFm`, task design plus stable live exports using
  the existing publisher's snapshot helper. No live source/runtime configuration changed.
- Deployment snapshots omit Git. Added `config/source-dates.json` with SHA-256
  bindings and archive recovery in `scripts/lastmod.mjs`. Missing source dates now
  block Vercel builds instead of silently using deployment day. File mutation,
  directory membership changes and symlinks reject stale portable dates.
- `VERCEL=1 npm run build` passes in the Git-free snapshot. Build/audit logs under
  `/tmp/canli-snapshot-date-check.log` and `/tmp/canli-final-verify.log`.
- Initial Vercel preview upload failed with a TLS invalid-session-id error. Retrying
  with the installed Node 20 CLI and a single tgz archive succeeded. Deployment
  `dpl_5ePSmH8KyqdsufFWnxxMiqKCMw1b` is Ready per CLI inspect.
  Preview: https://meridian-mk8f63w5m-arhans-projects-ac470eaa.vercel.app.
  Local validation receipt: `artifacts/seo/release-preview.json`.
- Production publisher still points to `canlicapital-website-20260908`; an isolated
  production push would be overwritten. Review integration with that approved design
  source before release. Do not silently redirect the live publisher.

- Release implementation b02e8a2a is pushed to PR 15. Vercel inspect confirmed Ready
  for the preview above. No preview HTTP/browser fetch, production deployment, merge,
  or search submission occurred. Website CI for this commit must be checked next.
- Next concrete action: inspect the approved design branch/publisher integration,
  reconcile task changes without overwriting other work, and verify the integrated
  release. All corpus, indexing, API/MCP adoption and forward algorithm goals stay active.
