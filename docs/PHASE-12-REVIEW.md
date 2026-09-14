# Phase 12 — final preview review

10 September 2026. Approved: site-wide visual review and launch checks. Production promotion was not authorized. **Review complete; launch not recommended yet.** This phase changed audit scripts and documentation, not application code or the deployed preview.

Preview: https://meridian-a8gj4f0mf-arhans-projects-ac470eaa.vercel.app

## Findings, in priority order

- `index.html:381` — P1: accountability says **538 signed entries**, while `verify.html:245` says **797**, and the homepage dated record shows sequence **796**. Reconcile the source and timestamp and bind all current-count displays to it. Do not replace an immutable historical figure or guess that every count has the same accounting basis.
- `css/hub-experience.css:29` — P2, visual judgment: Systems keeps a long, uniformly dark sequence below its light opening. Performance and Research have similar extended dark runs; Founder and Progress retain the older navy palette. The navigation is consistent, but the page bodies do not yet meet the brief's shared paper/ink/cobalt direction. Recompose explanatory reading areas without deleting evidence, and reserve dark surfaces for distinct exhibits.
- `css/cinematic-home.css:138` — P2: `pre-wrap` plus `overflow-wrap:anywhere` splits the mobile homepage API URL mid-path. Preserve literal command bytes, but present readable wrapping or an accessible horizontal-scroll code block with a copy action. Screenshot: `home-390-developer-api.png`.
- `index.html:256` — reliability risk: opening the evidence room twice showed the engine poster as broken (`complete:true`, `naturalWidth:0`), despite HTTP 200. A later isolated check displayed it correctly and all three standalone WebP decodes passed at 960px. **Not a confirmed corrupt asset.** Investigate lazy-loading/error recovery and retain a usable still or explicit loading/error state. Screenshots retain both failed and successful observations.
- `scripts/audit-phase8-journeys.py:24` — unresolved normal-motion test risk: desktop WebKit timed out waiting for the filtered research result to stabilize. A single isolated follow-up, sampling its position while the scroll settled, clicked successfully. This does not establish that the initial failure is fixed. Preserve the timeout and investigate scroll/filter interaction before release.

The design-review skill supplied checks for focus, motion, code/content handling and image presentation, using the current [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). Source review found explicit focus-visible replacement, labeled signup input and reduced-motion rules; this was not a fresh exhaustive accessibility certification.

## Verification performed

| Check | Observed outcome |
| --- | --- |
| Published routes | 489/489 passed hosted HTTP/header checks |
| Additional checks | 31/31 passed: redirects, assets, read-only API, and 16 byte-preserved original publication documents |
| Rendered route sampling | 15 real routes × desktop/mobile: 30 cases passed status, H1, overflow, script-error and visible completed-image checks |
| Reduced-motion journeys and media/font/JS fallback cases | 24 passed across Chromium and WebKit |
| Actual macOS Safari | Six routes passed menu, Escape/focus and expandable-footer checks |
| Normal-motion journey suite | Incomplete: three combinations advanced successfully; desktop WebKit research click timed out |
| Atlas motion regression | Incomplete: Chromium stage/reverse/keyboard/responsive checks reached the no-JS fallback navigation, which timed out waiting for network idle. No full-suite pass claimed; WebKit atlas checks were not reached |

The first visual script mistakenly included nonexistent `/execution`, producing two 404s. The inventory confirms `/tools/execution` is the actual route. The original failed observations remain in `visual-checks.json`; the corrected route and a broker-measurement route passed in `visual-followup.json`. This was an audit-list error, not a removed or broken published page.

HTTP checks are not visual acceptance. The rendered image check initially covered default-visible content and could miss lazy images in closed disclosures; the expanded evidence-room follow-up exposed that limitation. Browser naturalWidth may be density-corrected by srcset, so these measurements are not proof of raw asset pixel dimensions or Retina quality.

## Visual coverage and judgment

Captured the entire default homepage and all 11 main section positions at 1440px and 390px. Separately opened and inspected offering, Evidence Core, films, rebalance and footer. Reviewed desktop family overviews for Developers, tools, Systems, Performance, Research, Methodology, Verify, Founder, Progress and publication wrappers; inspected mobile homepage details and representative long-form/mobile layouts. Captures exist for 15 real routes, not individual visual approval of all 489 pages.

The homepage's main reading path has a clearer hierarchy and readable paper/cobalt contrast. Research covers, the explicit paper record, FAQ and closing access area have distinct roles. The optional room still repeats the research-to-record explanation across several sections; retain its unique links and disclosures while reducing repeated framing in a future approved edit. Dense research documents should remain documents, not acquire decorative motion merely to imitate the homepage.

No new Figma edits, generated images, videos or reference-site extraction occurred in this review. This is an assessment against the recorded design brief, not a fresh pixel-by-pixel comparison with United Carriers. The browser-testing skill kept automated form writes blocked and separated browser behavior evidence from visual judgment.

## Evidence

- [HTTP routes](../artifacts/qa/phase12-review/http/routes.json)
- [Additional HTTP checks](../artifacts/qa/phase12-review/http/http-checks-corrected.json)
- [Initial rendered checks](../artifacts/qa/phase12-review/visual-checks.json)
- [Corrected route follow-up](../artifacts/qa/phase12-review/visual-followup.json)
- [Reduced-motion/fallback journeys](../artifacts/qa/phase12-review/journeys/journeys.json)
- [Actual Safari](../artifacts/qa/phase12-review/safari/report.json)
- [Expanded inspection and WebKit follow-up](../artifacts/qa/phase12-review/inspection.json)
- [Poster follow-up](../artifacts/qa/phase12-review/film-posters.json)
- Screenshots: `artifacts/qa/phase12-review/`; incomplete atlas capture: `artifacts/qa/phase2-atlas/phase12-hosted/`.

## Next phase proposed — correction and design consistency

Ask permission before starting Phase 13. Resolve the count's source binding first; diagnose poster recovery and the normal-motion research interaction; polish mobile command presentation; then bring the identified subpage bodies into the shared design direction with before/after content preservation. Test targeted changes locally before proposing another preview deployment. Keep Figma compositions synchronized if design changes are made. Production, emails, new synthetic backend records and marketing remain separate authorizations.

Launch gates still include the findings above, user visual acceptance, explicit production/backend configuration review, deployment approval, and post-deployment verification. No real-key issuance, signup, email, trading, production mutation or deployment occurred in Phase 12. The Phase 11 retained synthetic records and revoked key were not changed.
