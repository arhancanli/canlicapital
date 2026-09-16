# Phase 2 — native strategy atlas

9 September 2026. Implemented and verified locally; user visual approval pending.
Phase 3 has not started. No deployment, real key issuance or trading changes.

## Review locations

- Built preview: http://127.0.0.1:4188/
- Editable desktop storyboard: https://www.figma.com/design/n3MbdBAC6STjHudQocaZa7?node-id=99-36
- Editable mobile storyboard: https://www.figma.com/design/n3MbdBAC6STjHudQocaZa7?node-id=99-37
- Reusable Strategy study component: https://www.figma.com/design/n3MbdBAC6STjHudQocaZa7?node-id=103-2
- Browser captures and machine-readable results: `artifacts/qa/phase2-atlas/`.

## Implemented scope

The opening now has a paper/ink/cobalt hierarchy, separate copy and imagery, direct strategy/API actions and the existing paper-only boundary. The introductory block is more compact; no prose was removed.

All four strategies now receive a full-width mechanism study, explanation, route caption and original execution/weight/observation information. Desktop scenes have reading holds and direct native-button navigation. Mobile and reduced motion show the four studies as a readable vertical sequence. No-JavaScript mode retains the original strategy text and facts.

The main process now shows research inputs, paper observations and publication as connected documents. Three controls allow direct navigation. Focusing a chapter link reveals its scene, including in actual Safari. Text and imagery have separate reading space. These are conceptual illustrations, not performance charts or order replays.

Six original scenes were rendered in Blender/Cycles with Metal, 64 samples and denoising at native **3840×1920**: hero, AlphaMax, AlphaTrend, AlphaVintage, AlphaForge and process. Transparent backgrounds with shadow catchers avoid rectangular image seams. After a remaining hero crop was found, its final camera was fitted analytically to the projected geometry bounds with a 4% safe frame. Web derivatives are 960/1920/3840px. All 18 total about 2.2 MiB; the browser selects a responsive size, not all sizes. The final hero is approximately 48/132/426 KiB respectively.

Source: `scripts/render-strategy-atlas.py`. Native PNGs, editable Blender files and render manifests: `artifacts/production/strategy-atlas-transparent/`. Web assets: `public/cinema/atlas/`.

## Figma work and its limits

Reused the existing Canli variables, text styles and Action components. Created one missing reusable Strategy study component with six editable text properties and eight linked desktop/mobile instances. Artwork uses a locked 2:1 aspect ratio, verified at 1324×662 and 342×171. Process copy is editable in three desktop and three mobile reading states.

Screenshot review found blank WebP rendering in Figma; native PNG uploads fixed it. It also caught collapsed Action heights and a nonresponsive image override; fixed with explicit 48px sizing and the shared aspect-ratio constraint. The component's source artwork, IDs and validation state are in `PHASE-2-DESIGN-STATE.json`.

These are editable **storyboards**, not pixel-identical captures of every scroll position. Desktop web imagery fits the pinned viewport, while Figma shows full artwork proportions. Figma does not reproduce live observation hydration, shared navigation, chapter-control behavior or every browser status label. The web implementation remains authoritative for those interactions. Existing earlier Figma explorations were preserved, not silently replaced.

## Verification

| Check | Evidence / result |
| --- | --- |
| Production build | `npm run build` passed after final assets and CSS |
| Full verification | `npm run verify` passed: 270 tests; publication, link, indexability, flow and published-number audits passed |
| Chromium and WebKit | `audit-phase2-atlas.py`, built preview; all four strategies and three process stages forward/reverse; active states, image loads, copy/art/metrics separation, keyboard activation and focus reveal |
| Responsive/fallback | 390×844 mobile, 1440×1000 desktop, short 1280×720 desktop, reduced-motion teardown, desktop re-entry without duplicate controls, no-JS plus blocked art, no horizontal overflow or page errors |
| Actual macOS Safari | `audit-phase2-safari.py`, built preview; measured viewport 1728×1032; all stages forward/reverse, native image loads, focused chapter-link reveal and preserved disclosure state |
| Focused accessibility | axe-core 4.10.3: 27 scoped states across 1440×1000, 390×844 and 720×500; zero automated violations. Primary/control target-size checks passed |
| Preservation | `check-phase2-preservation.mjs`: 489 pages; all existing IDs, links and controls unchanged. Only two intentional homepage captions differ; reversing those exactly reproduces the original text hash |
| Local performance observation | Unthrottled headless Chromium, local built preview: process-scroll p95 9.0ms desktop / 9.6ms mobile, zero frames over 50ms in the measured runs. This is not a field performance claim |

The original strict preservation checker deliberately still reports `index.html: textHash changed`. Its baseline was **not** rewritten. The separate Phase 2 checker explains only these two changes:

- “Original optical study / not trading hardware” → “Mechanism studies / not performance data”.
- “Original 3D assembly / conceptual, not a system schematic” → “Research → Paper observations → Published record / conceptual sequence”.

The additional JS-inserted figure captions are illustrative explanations; original static product/evidence text is preserved. Published document artifacts were not edited as part of this phase.

The final hero framing was an image-only change after the full verification, accessibility and performance runs. Build, Chromium/WebKit behavior, actual Safari and preservation checks were refreshed afterward. The saved local timing observations therefore precede that last image-only replacement; they are not a benchmark of a deployed release.

## Design critique and remaining limits

The implementation takes the saved United Carriers reference's large editorial scale, readable focal object, restrained palette and continuous scroll chapters. It uses original strategy models, not copied shipping assets. The repeated structure across strategies intentionally makes mechanisms and execution basis comparable.

Motion is currently scroll-linked **2D presentation of native renders**, not a live 3D simulation, generated video, or an exact reproduction of the reference's interactive scenes. Additional software by itself would not prove visual parity. User approval of this direction is still needed.

Record/API/research/evidence/accountability/FAQ/access/footer still include earlier visual treatments. Their contrast and transitions have not received this Phase 2 redesign. Shared navigation, detailed subpages and release qualification are also later phases. The main reading-order proposal remains pending integration rather than being silently reordered here.

No full-site production-readiness claim: manual VoiceOver/forced-colors/true browser-zoom review, real-device performance, live integrations and complete route-by-route visual verification remain. Local frame measurements and automated accessibility checks are limited evidence, not certification.

## Next permission gate

Request Phase 3 approval to redesign the remaining homepage record, API, research, evidence, accountability, FAQ, access and footer sections; consolidate repetition without hiding claim limitations; integrate section order and transitions; synchronize editable designs and verify controls, failure states, responsive/reduced-motion layouts and actual Safari. Do not begin without explicit permission.
