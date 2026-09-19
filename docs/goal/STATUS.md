# Current state

Updated: 2026-09-19. Overall goal: **ACTIVE, NOT ACHIEVED**.
Current phase: **2 checkpoint validated; phase 7 environment-binding investigation prepared**.
Phase 1 tooling is tested; whole-corpus measurement remains blocked on source access.

## Verified baseline

- Last verified production sitemap: **263 URLs**. This is not an indexed-page count.
- Tested website draft: **312 indexable URLs**, including 49 new company-reference pages across five companies and 43 financial histories. Not deployed.
- Actual indexed pages: **unknown**; Search Console access question is pending.
- Sitemap capacity: one million synthetic URLs passed as 20 shards. Synthetic URLs do not enter content inventory.
- Current local validation: production build and 300 tests pass (6 preverify + 294 main); five corpus tests and seven IndexNow tests pass. Metadata: zero errors/warnings; indexability: zero conflicts; all 312 indexable pages within three clicks. Sixteen Chromium/WebKit viewport checks pass on the current local production build. Prior MCP package validation: 43 tests; MCP implementation has not changed.
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

- SEC bulk archive HEAD request returned HTTP 403 from this environment on 19 September. No complete corpus was downloaded or counted. Existing five captured snapshots remain usable. Do not bypass access controls or extrapolate their eligibility to the market.
- Search Console baseline unavailable. Asked owner which account/integration manages the property; answer pending.
- PR 69 dependency changes fail publication integrity (16 stale `uv.lock` reproduction bindings) and PostgreSQL migration (`research_lockfile` historical hash). Keep draft. Do not merely replace historical hashes.
- PR 68 and 69 offline pytest jobs still pending at last check. Other PR 68 jobs passed; PR 69 mypy/ruff/browser passed.
- Engine baseline snapshot: four sleeves, four current-epoch daily returns; 248 more observations before Sharpe estimation and 752 before observation-count establishment gate. Modeled cost and tail-risk coverage incomplete. This is a dated snapshot, not a current live metric.

## Next actions (read and verify before proceeding)

1. Website implementation and expanded CI are validated at 78f914bd. Finish remaining keyword research, performance measurement and production release review rather than claiming all SEO work is complete.
2. Review remaining 249 keyword-unassigned pages against their actual research/evidence, not arbitrary keyword variants. Search Console query evidence remains unavailable.
3. Read this folder and ENGINE_ENVIRONMENT_REVIEW.md, then implement phase 7's security/reproducibility fix. Exact historical lock bytes are recoverable and verified; both archive checks and actual replay environment selection must remain truthful. No engine changes were made in the latest investigation.
4. Plan phase 3 rendering/storage using measured source scale; no million-page serving capacity claimed.
5. Complete release readiness and deploy only a passing reviewed result. Recheck production and indexing separately; no deployment has occurred.
