# Current state

Updated: 2026-09-20. Overall goal: **ACTIVE, NOT ACHIEVED**.
Owner: Arhan Canli. Implementation and review: **Codex directly**.
Hermes acknowledged stop and idle at 08:01 local. No further Hermes delegation.
Read REQUIREMENTS.md for the complete owner objectives; none were removed.

## Current checkpoint

Current checkpoint: combined delivery for 1,202 companies verified locally under
extended-v1. Next: editorial release policy, durable storage and hosted preview
integration. Prior releases remain unchanged; publication is not approved.

- Restored the full package.json verification command after Hermes replaced it with
  four tests, dropping the remaining tests/audits. Existing gates retained.
- Replaced its broken source fixture with two real-source regressions: stale review
  cannot override HTTP500 or omit a failed company; both preserve prior manifest bytes.
- Staging always recomputes source review. Verified 404 exclusions require a bound
  response receipt; a generic reproduced flag is insufficient.
- Takeover focused tests 16/16; full `npm run verify` **362/362 (6+356)** and all final
  writing, metadata, links, indexability and numerical-evidence audits pass.
  Logs: /tmp/canli-takeover-focused.log and /tmp/canli-takeover-verify.log.
- Fresh next 1,000 source replay: complete=true, **853 candidates, 7,449 candidate
  pages, 676 flagged histories, 147 exclusions, 0 errors**. Exclusions: 51 invalid
  entities, 35 insufficient coverage, 61 captured 404 responses. No captures rewritten.
  Receipt: artifacts/seo/company-next-batch-codex-review.json.
- Website PR15 OPEN at **60e27321**, pushed on 2026-09-20. CI run
  **35488566338** passed for this exact head. New combined-delivery code remains
  local and is not covered by that remote result. No production deployment performed.

## Counts and boundaries

| Measure | Evidence/status |
|---|---|
| Actual indexed canonical pages | Unknown; search-engine evidence pending |
| Owner minimum/target | 800,000 /1,000,000 actually indexed |
| Last production sitemap observation | 263 URLs on 2026-09-19; not freshly measured |
| Current static local verification | 688 HTML pages,327 indexable,361 noindex |
| Prior extended staged delivery | 349 companies + 9,030 histories + 7 directories = 9,386 pages; 698 downloads |
| New extended staged cohort | 853 companies + 22,697 histories + 18 directories = 23,568 pages; 1,706 downloads; not deployed |
| Combined extended staged delivery | 1,202 companies + 31,727 histories + 25 directories = 32,954 pages; 2,404 downloads; not deployed |

The core/extended policies are alternatives over the same source, not additive.
Staged page/download counts prove neither release approval nor search indexing.
Prior staged HTTP/browser evidence is in company-delivery-extended-measurement.json
and company-delivery-extended-browser.json. It predates this takeover.

## Quality, platform and engine objectives

- Source-backed useful distinct accessible maintained content; relevant intent
  coverage and exceptional technical SEO remain mandatory before expansion.
- Current static intent audit: 78 canonical owners, 95 hypotheses, 249 pending reviews.
  No demand, ranking, adoption or worldwide superiority claim.
- Open-source glass-box platform, tested API/MCP onboarding, contributor guidance
  and genuine developer/repository adoption remain active objectives.
- Engine targets: combined NET FORWARD Sharpe > 2; at least 14 economically distinct
  qualified sleeves; realized combined maximum drawdown <= 10%; disclose costs/gaps.
- Four sleeves/four forward daily observations is an old baseline, requiring fresh
  verification. No current outcome established by this takeover.
- Hermes algorithm prototypes remain UNAPPROVED: synthetic data, P&L/drawdown
  defects and absent qualification evidence. See artifacts/algo/README.md.

## External dependencies and next steps

1. Resolve editorial publication rules for the combined review queue, preserving
   historical coverage, original units and semantic distinctions.
2. Integrate durable storage and verify a hosted preview using the combined release;
   keep noindex and genuine error responses until release approval.
3. Storage-provider/access remains unresolved in earlier work. Preview packaging
   existed, but hosted-data runtime and production integration remain unverified.
4. Search Console measurement is pending. Production activation remains a separate
   unresolved release decision from prior sessions; local continuation is authorized.
5. Reverify engine PRs/contracts/current evidence and prioritize governed research;
   do not promote prototypes, rewrite historical evidence or place broker orders.

Current task ledger: EXECUTION_LEDGER.md. History: LOG.md and
history/STATUS-20260920-before-direct-takeover.md. Historical Hermes reports are
explicitly superseded; their success claims are not acceptance evidence.

## T04 delivery checkpoint — 2026-09-20

- New-cohort release a79b6775e1dd93566ad806d79eb93b3a709073d0c99406433c16cb8852c5eacd.
  Catalog 0c020bde…; download 2419de96…. Prior 349-company release unchanged.
- Full local HTTP replay: 23,568 pages, 1,706 downloads, exact sitemap agreement,
  zero failures/orphans, maximum 3 links from /companies, maximum HTML 36,223 bytes.
  Local sequential timing is not cloud capacity or real-user performance.
- 54 Chromium/WebKit sample checks pass at 320/390/1440 widths. Two mobile screenshots
  inspected. Samples include longest issuer/concept names, most observations/units,
  large values, EPS, first/last directories. This is not all-page browser coverage.
- Selected-history audit: 2,549 flagged histories; overlapping 2,416 old-coverage,
  three multi-unit/partially historical, 13 constant (12 zero-only), 128 equal-vector
  pages in 64 groups. Preserve source values; no editorial approval inferred.
- Added mixed valid/404 staging regression; corrupt HTTP body preserves prior pointer.
  Focused 17/17 pass; prior full 362-test suite predates this extra test only.
- Evidence: artifacts/seo/company-next1000-{stage,release,discovery,browser}-extended.json,
  company-next1000-delivery-extended-measurement.json and
  company-next1000-selected-quality-extended.json. Original objects remain ignored.

## Combined delivery checkpoint — 2026-09-20

- Combined release: `3f7a621bdb49d3131219daba07c9f7a842b26ba959f5c84dac2349d14b6e9cd6`.
  Exact pinned source manifests, original download indexes, source/selected objects
  and all 147 exclusions retained. Input manifests and releases unchanged.
- Full verification: **368 tests (6+362)** and all final audits pass. Five combiner
  tests cover valid release construction, original evidence traversal, bad pins,
  corruption, duplicate identities, mixed policies, forged values and writer locks.
- Local HTTP: **32,954 pages / 2,404 downloads**, exact sitemap, no failures/orphans,
  maximum **four** links from /companies (new larger directory hierarchy), maximum
  HTML 36,223 bytes. Do not retain the smaller cohorts' three-link claim here.
- Browser: **54 checks** across nine deterministic samples, Chromium/WebKit,
  320/390/1440 widths; mobile longest-issuer screenshot inspected. No failures.
- Editorial queue: **3,924 flagged histories**; overlapping 3,405 historical-only,
  226 multi-unit, 77 partially historical-unit, 20 constant including 19 zero-only,
  and 338 equal-vector pages in 169 groups. These flags are not resolved by rendering.
- `COMBINED_DELIVERY.md` documents reproduction, pin authority and publication limits.
  Receipts: `artifacts/seo/company-combined-*.json`. This combined corpus replaces
  the separate cohorts for serving; never add combined and input page counts.
- 554 unapproved Hermes-generated files moved into ignored `.bak/hermes-20260920/`;
  every byte hash verified after relocation. `artifacts/algo/archived-inventory.json`
  preserves paths/hashes. Source captures and accepted implementation remain intact.
- Logs: /tmp/canli-combine-final-verify.log, /tmp/canli-combined-http.log,
  /tmp/canli-combined-browser.log. Publication/indexing/forward outcomes remain open.
