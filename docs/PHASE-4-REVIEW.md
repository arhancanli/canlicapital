# Phase 4 — shared navigation and clarity

Implemented locally on 9 September 2026. This is a phase handoff, not a production-readiness claim or user visual acceptance. Phase 5 requires permission.

Preview: http://127.0.0.1:4188

## What changed

- Stable ink navbar with Systems, Research, Developers and Verify, a grouped full-width menu and a readable Live record action at mobile widths. The changing broker status now lives inside the menu; its governed data hook and destination remain intact.
- Native disclosure behavior works without JavaScript. With JavaScript: Escape closes and returns focus; outside clicks, link selection and focus leaving the menu close it. Tab is not trapped. Exact destinations receive `aria-current`; parent research sections are not falsely announced as the current article.
- The repeated footer research-to-record story is now an optional native disclosure on every shared-shell page. All explanation, three workflow destinations, footer routes and claim boundaries remain. The automatic footer optical sequence is no longer initialized. Preserved heading deep links open the disclosure.
- Supporting homepage headings and spacing are less repetitive: research, evidence, accountability, FAQ and the optional evidence room no longer all compete at hero scale. No main prose was deleted or reordered. Native strategy/process studies, actual curves, API demonstration, papers, figures and limitations remain.
- Shared focus outlines, control hit areas, reading line height and keyboard-accessible local table overflow apply across page families. Corrected the developer hero's white-on-light filled action.

The detailed preservation map is in `PHASE-4-WORKING-PLAN.md`. This phase does not redesign the unique contents of every subpage; those remain explicit Phases 5–7.

## Verification

| Check | Result |
| --- | --- |
| Shared shell propagation | All 489 baseline pages contain revision 4 and the navigation controller |
| Main preservation | All 489 pass against the original baseline after accounting for only the two previously documented Phase 2 illustration captions |
| Header/footer destinations | All original destinations retained: 22 unique header and 29 footer destinations |
| Archived publication documents | All 16 original paper hashes remain unchanged; wrapper verification passes |
| Build and project verification | Build passes; 273 main tests and 2 preverification tests pass, plus writing, publication, source-number, route, indexability and flow-safety audits |
| Browser shell matrix | 48 passing cases: 12 routes × desktop/mobile × Chromium/WebKit |
| Actual Safari | Six representative routes: menu, Escape handler, focus return, readable CTA, optional footer and no horizontal overflow |
| Scoped automated accessibility | 15 passing header/footer states at widths 320, 390, 768, 1024 and 1440 |
| No JavaScript | Six passing developer-page cases across Chromium/WebKit at 320, 390 and 1440 |
| Opening/process regression | Chromium/WebKit forward/reverse strategy and process navigation, keyboard, reduced motion, resize, short desktop and failed-image/no-JS checks pass |
| Remaining homepage regression | Four passing Chromium/WebKit desktop/mobile cases: 12 section captures, curves, FAQ, mocked signup failure, optional-room expansion, film tabs and reduced motion |
| Shared controls spot check | Four mobile page families pass visible control-height and overflow-region checks; developer filled-action contrast passes |

The 12-route matrix includes homepage, systems, research, developers, a tool, performance, methodology, verification, a measurement, a research article, a publication wrapper and a note. This is representative visual/interaction coverage, not individual visual review of all 489 pages. Safari's default link-navigation preference requires Option-Tab; the WebKit test uses that native sequence.

Evidence: `artifacts/qa/phase4-shell/`, `artifacts/qa/phase2-atlas/phase4-regression/`, `artifacts/qa/phase3-publication/phase4-regression/`. Test scripts are retained under `scripts/audit-phase4-*.py` and `scripts/check-phase4-shell.mjs`. No real key or signup requests were submitted. No deployment or trading changes.

## Performance investigation

An intermediate Phase 4 trace measured desktop shift sums of 0.0410146, 0.0410146 and 0, with the shifting elements identified as navbar primary links, CTA, brand and summary. The old homepage `is-top` rule was changing the grid to three columns. Revision 4 is now excluded from that legacy rule.

Final bounded samples: desktop 0, 0, 0; mobile 0.0193485, 0.0193485. The delayed-font cases explicitly intercepted both Chakra TTF files and WOFF2 fonts. Mobile shifts move the opening image/index as text settles. These are local unthrottled shift sums, not field Core Web Vitals. The earlier Phase 3 0.2824 outlier remains documented and was not reproduced here; do not claim that every startup risk is resolved. Release testing still needs slow-network/device coverage.

## Figma

Updated the existing file with editable desktop/mobile open and closed navigation states and a narrow-desktop keyboard-focus state. Reused the existing color variables, text styles, captured brand vector and Action component. Explicitly verified the visible mobile navigation fonts are Inter and IBM Plex Mono. IDs are in `PHASE-4-DESIGN-STATE.json`.

These are design review states, not a wired interactive prototype or pixel-identical browser captures. Figma groups omit browser link divider details; its status strip is an explanatory note instead of a live artifact value. The browser is authoritative for menu scrolling, focus, current-route indication and reduced-motion behavior. The footer disclosure is verified in the browser, not represented as a new interactive Figma component.

## Remaining work / next permission gate

Phase 5: developer landing page, API onboarding/documentation and every calculator/tool, with mocked loading, error, input and result states. Phase 6: hubs and evidence views. Phase 7: individual long-form and generated routes. Phase 8: complete release checks. Existing dense subpage layouts and long bottom spacing are not silently credited as redesigned by this shared-shell pass.

User visual approval is still pending. Nothing in this phase claims an exact copy of United Carriers or that the entire website is production-ready.
