# Current state

Updated: 2026-09-19. Overall goal: **ACTIVE, NOT ACHIEVED**.
Current phase: **1 resumed — audit existing SEC source collection while phase 7 offline CI runs**.
Phase 1 tooling is tested; whole-corpus measurement remains blocked on source access.

## Verified baseline

- Last verified production sitemap: **263 URLs**. This is not an indexed-page count.
- Tested website draft: **312 indexable URLs**, including 49 new company-reference pages across five companies and 43 financial histories. Not deployed.
- Actual indexed pages: **unknown**; Search Console access question is pending.
- Sitemap capacity: one million synthetic URLs passed as 20 shards. Synthetic URLs do not enter content inventory.
- Current local validation: existing production build is unchanged by the source-audit follow-up; 301 tests pass (6 preverify + 295 main); six corpus tests and seven IndexNow tests pass. Metadata: zero errors/warnings; indexability: zero conflicts; all 312 indexable pages within three clicks. Sixteen Chromium/WebKit viewport checks pass on the current local production build. Prior MCP package validation: 43 tests; MCP implementation has not changed.
- PR 15 expanded CI at `78f914bd` passes on Linux/Node 22: build, full evidence/SEO verification, browser tests, corpus tests and notification tests. The initial shallow-history failure at `2acf8087` is fixed by fetching full history. Run: https://github.com/arhancanli/canlicapital/actions/runs/35437145441. No PR has been merged or deployed.

## Current implementation (2acf8087 implementation; 78f914bd CI correction, both pushed)

- `scripts/lib/company-reference.mjs`: reject impossible date order, handle invalid calendar dates safely, detect conflicting facts regardless of input order, and expose exclusion diagnostics.
- `scripts/company-catalog-worker.mjs`: reuse production selector for bounded per-entity audit requests.
- `scripts/audit-company-corpus.py`: local ZIP-to-SQLite candidate catalog; source/member/code hashes; atomic replacement; exclusions; explicit sample scope; no publishing.
- Seven company-reference tests and five Python bulk-catalog tests pass. Pilot catalog reproduces five entities and 43 histories (48 candidate entity/history pages, excluding the directory); see `artifacts/seo/company-corpus-pilot.json`. This is not a whole-market count.
- Goal folder and AGENTS.md continuity instructions installed. Read these before each phase and after compaction.
- Phase 2: 63 canonical keyword-intent owners and 80 editorial query hypotheses; 249 indexable pages remain unassigned for review. No demand/rank measurement claimed. Company titles preserve entity names; visible/schema breadcrumbs and sibling links added. CI now installs Chromium and runs full evidence/SEO, corpus and IndexNow checks.
- Phase 6 overlap: company pages and shared footer promote API keys/MCP; developer hero promotes MCP/GitHub. CONTRIBUTING and an integration issue template support substantive contributions. No outreach, releases, npm publishing or star-count claims.

## Blockers and unresolved evidence

- SEC bulk archive HEAD request returned HTTP 403 from this environment on 19 September. No complete corpus was downloaded or counted. A local research collection contains 520 companyfacts gzip files; all 48 parts, issuer-manifest lineage and 520 file hashes/sizes verified. Selector accepts 344 companies and 2,657 histories (3,001 candidates), rejecting 146 invalid entities and 30 insufficient histories. Individual capture times are unknown, so candidates are not publication approved. This is a selected sample, not the full SEC corpus. Do not bypass access controls or extrapolate their eligibility to the market.
- Search Console baseline unavailable. Asked owner which account/integration manages the property; answer pending.
- PR 69's historical-environment fix is committed as 783ad0c and pushed: 49 local tests, strict mypy/Ruff and all 16 publication integrity checks pass. Original publication/migration files are unchanged. Remote publication integrity, PostgreSQL, mypy, Ruff and browser jobs pass at 783ad0c; the offline pytest job remains running. Keep draft until remaining checks finish.
- PR 68 and 69 offline pytest jobs still pending at last check. Other PR 68 jobs passed; PR 69 mypy/ruff/browser passed.
- Engine baseline snapshot: four sleeves, four current-epoch daily returns; 248 more observations before Sharpe estimation and 752 before observation-count establishment gate. Modeled cost and tail-risk coverage incomplete. This is a dated snapshot, not a current live metric.

## Next actions (read and verify before proceeding)

1. Source-audit follow-up passes 301 website tests and six catalog tests. Push the observed-by catalog/source-provenance checkpoint. Core website CI last passed at 0656b03c; the current source-audit follow-up is not yet pushed. Then refresh and semantically review eligible source candidates before publication.
2. Review remaining 249 keyword-unassigned pages against their actual research/evidence, not arbitrary keyword variants. Search Console query evidence remains unavailable.
3. Read this folder and ENGINE_ENVIRONMENT_REVIEW.md, then finish phase 7's security/reproducibility CI review. Historical archive resolver, explicit verification receipts and an enqueue-time active-file guard are implemented in 783ad0c. Forty-nine local tests, type/style checks and publication verification pass. Remote PostgreSQL/publication/mypy/Ruff/browser checks now pass; offline pytest remains running; no publication manifest or migration packet was rewritten.
4. Investigate why the historical SEC collector marked invalid entity responses as fetched; preserve original evidence and fix future collection gates in an isolated change. Plan phase 3 rendering/storage using measured source scale; no million-page serving capacity claimed.
5. Complete release readiness and deploy only a passing reviewed result. Recheck production and indexing separately; no deployment has occurred.
