# Phase 13 — correction and reading-surface consistency

10 September 2026. Approved local implementation. No deployment or production changes.

## Delivered

- Homepage accountability now derives its signed-entry count from the published chain: 797 entries, head sequence 796. The build updates the static fallback; the browser uses the dated head envelope. No signed artifact was edited.
- Film posters recover once from failed WebP to the authored PNG. If both fail, an accessible message replaces the broken image while the artifact description, time and evidence link remain. Reduced-motion playback stays paused. This is bounded recovery, not proof of a particular underlying network cause.
- Research search takes control from smooth scrolling on focus. Filtering emits a content-layout event instead of a synthetic window resize. Immediate filter-to-result navigation passed in Chromium and WebKit with normal motion.
- Homepage API commands preserve their bytes and line structure, scroll horizontally on narrow screens, and have a copy button with announced success/failure and manual-copy focus recovery.
- Systems, Research, Performance, Founder and Progress share paper/ink/cobalt reading surfaces. Systems retains its operating-stage rail, Research its searchable catalog, Performance its dark canvas exhibits, Founder its accountability sequence, and Progress its complete correction chronology.

The frontend-design skill guided scoped visual consistency rather than identical page templates. Accessibility review caught legacy color overrides, including one that appeared only after bundling. The GSAP performance guidance informed explicit layout refresh and input control. Browser-testing guidance kept visual review separate from functional assertions.

## Verification

Built preview: http://127.0.0.1:4188. Hosted Phase 12 preview is unchanged.

| Evidence | Result and scope |
| --- | --- |
| Production build | Passed after the final CSS fixes; this is a local build, not a production deployment |
| Full verification | 279 tests passed; 505-page indexability check had zero conflicts; content, numbers and links checks passed |
| Targeted built-browser audit | 30 cases passed: six routes at desktop/mobile widths in Chromium/WebKit, immediate search-result navigation, WebP recovery and complete poster failure |
| Desktop contrast | Zero detected main-content text-contrast violations on the five revised subpages in Chromium; not an exhaustive WCAG certification |
| Navigation regressions | Four normal-motion journeys and 24 reduced-motion/failure-path cases passed |
| Actual macOS Safari | Six route checks passed, including shell/menu/focus/footer/overflow behavior; not every subpage or physical keyboard interaction |
| Homepage animation regression | Forward/reverse strategy and process traversal, keyboard, reduced motion, resizing, short desktop and failure states passed in Chromium/WebKit |
| Preservation | Homepage main text and links match hosted Phase 12 except the intentional 538-to-797 correction. Shared-shell, nine developer pages, 21 hubs, 458 remaining routes and 16 protected-original checks passed |

Evidence is under `artifacts/qa/phase13-corrections/`; animation evidence is under `artifacts/qa/phase2-atlas/phase13-built/`. Scripts are `audit-phase13.py`, `inspect-phase13.py`, `check-phase13-preservation.py`, `check-phase13-state.py` and `regression-phase13.py` in `scripts/`.

The final 30-case and five-page contrast reruns used the final built CSS. The broader journeys, actual Safari and full verification preceded the last narrowly scoped CSS corrections; the build was rerun afterward. Captures are local, not evidence of a hosted update.

## Figma and remaining limits

Read-only Figma metadata access succeeded for the existing file `n3MbdBAC6STjHudQocaZa7`. No Figma canvas edits were made in this phase. The required `figma-use` gotchas resource contains literal truncation gaps and cannot be read completely through the available interface. Synchronization is pending that workflow prerequisite; this is not an authentication failure.

User visual approval remains outstanding. Passing checks do not establish an exact United Carriers design match or whole-site production readiness. The prior startup performance outlier remains tracked; this phase does not resolve it. No new imagery, videos, paid tools, keys, signups, emails, trading records or backend mutations were created.

## Next approval gate

Proposed next phase: resolve the Figma instruction-resource issue, synchronize representative editable states, then deploy and validate a new isolated preview using the established preview-only backend configuration. Obtain explicit permission first. Production promotion and marketing remain separate.
