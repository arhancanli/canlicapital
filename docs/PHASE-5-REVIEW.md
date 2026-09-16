# Phase 5 — developer and tool review

10 September 2026. Approved implementation is local; user visual acceptance is pending. This is not whole-site production certification. Phase 6 and deployment have not started.

## Delivered

Nine routes: `/developers`, `/tools`, and `/tools/{deflated-sharpe,backtest-overfitting,selection-risk,execution,breadth,trial-accounting,evidence-chain}`.

Developer onboarding now has a clear light-surface introduction, local section navigation, a step-by-step code workbench and stronger endpoint hierarchy. The directory uses full-width entries instead of repeated cards. Each tool keeps its actual calculator or evidence visualization, with compact introductions, readable input/result separation and consistent typography. Long textual results no longer inherit oversized numeric styling. Trial-accounting and chain headings are reduced so their instruments appear sooner. Small chain metadata and hash text were enlarged.

The frontend-design skill informed the instrument-led direction; the accessibility skill informed contrast, description-list semantics, keyboard-scrollable tables and button semantics. No new decorative AI assets or video were needed for this functional phase. Existing evidence, charts and source qualifications were retained; calculator cores and trading logic were not changed.

Behavior improvements: visible clipboard failure guidance, copy-current-example controls, 15-second key request timeout without retries, malformed-key response handling, correct replacement on repeated requests, unavailable numeric output on invalid DSR/PBO input, and disabled source-dependent trial/chain controls while loading or after failure. The DSR error explicitly identifies the rail as the previous valid calculation. Real API keys were never issued during QA.

## Verification

All artifacts are under `artifacts/qa/phase5-developer/`.

| Check | Evidence |
| --- | --- |
| Build and full existing verification | `npm run build`, `npm run verify`; 273 main tests plus two pre-tests passed, site audits passed |
| Phase-specific preservation | `preservation.json`: nine pages; original text, links, IDs, control markup retained; only additive developer section navigation excluded |
| Desktop/mobile rendering | `final/report.json`: 18 Chromium cases at 1440/390, no page errors or horizontal page overflow; screenshots of introductions and working areas |
| Tablet geometry | `tablet.json`: 18 Chromium cases at 720/1024, no horizontal page overflow |
| Interaction states | `states/report.json`: 24 Chromium/WebKit cases; mocked key success/busy/quota/service failures, missing key, clipboard denial/success, repeated key replacement, invalid/reset/filter/mutation flows |
| Degraded states | `fallbacks.json`: 28 Chromium/WebKit cases; no-JS reading/links, failed source actions disabled, network/malformed JSON/timeout key responses |
| Actual Safari | `safari/report.json`: nine route smoke checks, working-area captures, developer language selection; no real issuance |
| Focused accessibility | `accessibility-final.json`: nine mobile main-content scans, zero WCAG-tagged violations; three advisory rule instances retained for nested complementary landmarks |

Automated accessibility is not WCAG certification. VoiceOver, exhaustive focus traversal, full performance budgets, all animation/failure combinations and production backend checks remain release-stage work. Safari coverage is a smoke check, not a claim that every interaction was tested in Safari.

The immutable Phase 5 start is `before.json`; older site-wide baselines were not reset. Source-bound evidence updates already present at the start of this phase are not credited as redesign changes. Earlier failed QA attempts were investigated: wrong synthetic input events and premature asynchronous assertions were test defects; description-list markup, contrast, copy handling and failed-source controls required code fixes.

## Figma coverage and limits

Existing file `n3MbdBAC6STjHudQocaZa7`, Website composition page `0:1`. Editable desktop first-key frame `147:170` and mobile frame `155:172` were inspected. Shared colors, typography and the Action component were reused. The temporary capture `148:2` was removed after comparison; retained studies preserve the first-step reference and can be edited. The capture script is not in the generated site.

This is a focused first-key review, **not a full nine-route Figma mirror or interactive prototype**. The captured code workbench is editable but not a new component library. The reused Figma Action is 48px with an arrow; the actual key button is 44px without one. Mobile code scrolls in the browser but is clipped in the static frame. Exact node references and limits are in `PHASE-5-DESIGN-STATE.json`.

## Next gate

Review locally at `http://127.0.0.1:4188/developers` and `/tools`. Ask for explicit permission before Phase 6: strategy, performance, systems, methodology, research and evidence hubs. Marketing, deployment and whole-site release certification remain outside this completed implementation batch.
