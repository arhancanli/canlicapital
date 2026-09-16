# Phase 6: hub delivery review

10 September 2026. User approved this phase with “ok next phase.” Local implementation; no deployment or Phase 7 authorization implied.

## Changed

Eight core hubs (Systems, Performance, Research, Methodology, Measurements, Verify, Review, Foundry) and all 13 research topic hubs now share the established reading palette, typography, local navigation and responsive spacing. Strategy presentations remain on the existing Research page; no duplicate strategy routes were invented.

- Systems uses full-width chapter introductions followed by its actual operating diagrams. The duplicate floating pipeline navigation is hidden; equivalent destinations remain in the new native section navigation.
- Research retains strategy/factor content and gains a build-time, searchable 111-document library. It stays visible when JavaScript or the JSON request fails. Search now survives replacement of the library nodes after refresh.
- Performance retains its existing animated test sequence and results, with tighter chapter hierarchy. This is not a new animation engine or a replacement of every exhibit.
- Methodology and Verify use open reading layouts with direct section links and legible commands.
- Measurements and every topic hub use searchable document rows with responsive title/description layouts.
- Review and Foundry retain their distinct review and execution-boundary exhibits. Contrast and invalid definition-list markup were corrected without dropping their notes.

The frontend-design skill guided hierarchy and scoped page-family styling. The accessibility skill led to contrast fixes, native labeled search, focus treatment and valid definition-list notes. No generated image/video assets were added in this phase; existing product exhibits remain.

## Preservation and implementation

`scripts/build-hub-experience.mjs` runs last in prebuild, after source generators. It enhances only the explicit 21 routes; missing anchor or library templates fail the build. `css/hub-experience.css` is scoped to those routes. `js/hub-experience.js` adds progressive search.

The immutable baseline is `artifacts/qa/phase6-hubs/before.json`. Preservation passes for all 21 original main bodies, ignoring outer whitespace and reversing documented additions: local navigation, a visible static library/title, and semantic wrappers around existing definition notes. Original research documents, links, figures and caveats were not rewritten. The newly rendered library uses the existing `normalizeEditableCopy` punctuation contract; its 111 paths/titles/descriptions are regression-checked against the public index under that rule. Two repeated enhancements produce identical source hashes.

The verification suite runs some source generators. Run the final `npm run build` after verification so generated hubs have their enhancements reapplied. Do not build while browser captures are running.

## Verification evidence

- Project verification passed, including tests, publication/paper/trial checks, source-number checks and a 505-page internal link audit.
- Final production build passed. Writing ratchet passed after the final build.
- 42 desktop/mobile Chromium captures: all 21 routes, top and middle states; no horizontal overflow or uncaught page errors.
- 46 Chromium/WebKit interaction/fallback cases passed: local target existence, search/no-match/clear and research-library JSON/no-JS fallbacks.
- 48 resilience cases passed: all 21 hubs at tablet width without JavaScript in both engines, plus keyboard-anchor and normal-motion forward/reverse scrolling on Systems, Performance and Research.
- Actual macOS Safari: nine desktop hub smoke checks passed, including library search where applicable and lower-page captures. This is representative, not complete Safari interaction coverage.
- Desktop/mobile main-content accessibility: 42 states, zero final WCAG-tagged automated violations. Reports are saved separately as `accessibility-1440.json` and `accessibility-390.json`. Automated checks are not WCAG certification.

Artifacts live under `artifacts/qa/phase6-hubs/`. Earlier `before`, `after`, and unqualified accessibility reports are retained as diagnostic history. Final accessibility reports supersede the earlier failing reports. Final screenshot captures precede the last Systems-label opacity and static-library punctuation corrections; neither changes layout.

## Figma and review limits

Read back the existing editable developer-study node `147:170` in Figma file `n3MbdBAC6STjHudQocaZa7` to confirm shared ink, gray, white, cobalt, Inter body and action definitions. No new Phase 6 screen frames were created. Existing foundations are not proof of 21-screen Figma synchronization.

Every scoped route has automated render evidence. Human visual inspection sampled all eight core families and the Crypto topic layout, not every screen region of every topic. Passing these checks does not establish reference-level visual parity or user visual approval.

Existing Research copy still uses “live sleeves/live record” alongside paper-history and killed-strategy qualifications. Source-number traceability does not resolve that terminology or establish performance; reconcile it against dated evidence during release review. The earlier startup performance outlier also remains a Phase 8 risk. No financial result was newly validated here.

## Next approval gate

Phase 7 covers every remaining inventoried article, measurement, publication, trial, note and route, preserving original publication documents. Phase 8 remains the site-wide release candidate audit. Ask permission before Phase 7; do not deploy, issue keys, subscribe users, trade or start marketing under this phase.
