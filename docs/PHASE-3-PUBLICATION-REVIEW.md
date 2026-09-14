# Phase 3 — publication chapters review

9 September 2026. Implemented and verified locally; user visual review pending. This is not a production-readiness certificate for the whole site. Phase 4 requires fresh permission.

Preview: http://127.0.0.1:4188. Dev: http://127.0.0.1:4187.

## What changed

| Section | Implemented direction |
| --- | --- |
| Paper record | Actual source-bound curve occupies the full width; larger metrics, clearer tabs, readable dates and verification chain. No invented returns. |
| Developer API | Cobalt chapter with native SVG inputs → arithmetic → receipt; existing status command, tool descriptions and access links retained. No manufactured API response. |
| Research | Three legible paper covers, visible research accounting and original paper routes; no abstract archive panorama. |
| Optional offering | Light two-column reading layout, one column on mobile; all four descriptions and evidence links preserved. |
| Evidence Core | Light explanatory copy and fully legible chapter controls around the existing dark renderer stage. Renderer itself and published counters are unchanged. |
| System films | Existing artifact films, timestamps, playback, transitions and keyboard tabs retained; white explanatory panels. |
| Rebalance | Compact five-row ledger retains all unique steps and links; removed the repeated horizontal pin and decorative optical courier. |
| Dated evidence | Observations, objectives and model estimates remain explicitly separate; readable primary count and source-bound detail panels. |
| Accountability | Named builder foregrounded, then method, execution and correction boundaries. No invented portrait. |
| FAQ | Light native disclosures with clear controls and all answers preserved. |
| Access | Cobalt ending, white form with dark labels/status text and visible error state. |
| Home footer | Compact explanatory ending; no duplicate full-screen optical sequence. Global footer navigation remains intact for Phase 4. |

The frontend-design skill informed the product-led compositions; accessibility guidance informed contrast, focus and fallback checks. Figma composition guidance led to reusing existing foundations and components instead of replacing the original design file.

## Verification

- `npm run build`: passed, Node 22.23.2.
- `npm run verify`: passed; 270 main tests and two preverify tests. Publication, writing, link graph, flow safety and published-number audits passed. The latter covers 505 pages; it is a provenance check, not independent strategy validation.
- `scripts/check-phase2-preservation.mjs`: 489 pages checked; only the two previously documented Phase 2 illustration captions differ from the immutable baseline. Reversing exactly those strings restores the original homepage text hash. No new prose/link/control loss in Phase 3.
- `audit-phase3-publication.py --origin http://127.0.0.1:4188 --label built`: Chromium/WebKit, 1440×1000 and 390×844. Twelve section captures, five curve controls, FAQ keyboard toggles, mocked signup failure, optional-room expansion, film keyboard tabs, reduced motion, no overflow/page errors.
- `audit-phase3-accessibility.py`: zero automated violations across 39 scoped section/form-error states at 1440, 390 and 720 CSS pixels. Incomplete axe checks remain listed in the report. This does not replace VoiceOver, zoom or other manual release checks.
- `audit-phase3-safari.py`: actual macOS Safari passed twelve section viewport captures, all five curve controls, overflow and contrast/fallback assertions. No form submissions.
- `audit-phase3-fallbacks.py`: all four Chromium/WebKit desktop/mobile cases passed with JavaScript disabled and cinema media blocked. Native disclosures and content remain usable.
- `audit-phase2-atlas.py --label phase3-regression`: opening, four strategy stages and three process stages forward/reverse, keyboard reveal, resize, reduced motion, short desktop and missing-media checks passed in Chromium/WebKit.
- Viewport screenshots in `artifacts/qa/phase3-publication/inspection` and actual Safari captures were inspected alongside section screenshots. Long element screenshots can include fixed-header/skip-link capture artifacts and are not evidence of a viewport overlap bug.

## Performance: retained open risk

Local, unthrottled headless Chromium only: API traversal p95 frame intervals were about 9.4 ms desktop and 9.2 ms mobile, with no sampled frames above 50 ms. These are not real-user or low-end-device guarantees.

The initial measurement recorded desktop CLS sum 0.2824 and mobile 0.0189. The first desktop sample lacked shift-source details. A bounded investigation retained all four follow-up traces: desktop sums 0.000212, 0, 0, 0; the final case delayed font requests by 200 ms. The small observed follow-up shift was in shared navigation. The original large shift was not reproduced or explained; it remains a release-performance risk. Do not cherry-pick the later samples or claim the original issue fixed. Continue startup/slow-network investigation during shared-shell and release review.

## Editable Figma

File: https://www.figma.com/design/n3MbdBAC6STjHudQocaZa7

New review frames: desktop `121:100`, mobile `121:101`, on `0:1`. Nine chapter compositions per width, 278 editable text nodes and 22 existing-component instances total. Native vector API illustration and actual paper-curve snapshot; six research covers reuse the existing editable card structures. The earlier file, original images and Phase 2 work remain intact.

These are responsive design storyboards, not pixel-identical browser captures or working API clients. The optional room is represented collapsed; its expanded renderer/films are verified in the website, not recreated as a Figma simulation. Detailed evidence tables, live states, all footer links and interaction behavior remain authoritative in the website. Figma snapshot values must not be interpreted as live updates. Screenshot review corrected horizontal Auto Layout height, instance color fallbacks and inherited optical art in the new research clones.

## Handoff

No deployment, real API key issuance, real signup, trading changes or marketing work. No Phase 4 work authorized or performed. Next proposed phase: shared navigation/footer, typography, tables, forms and buttons across representative page families, with keyboard/mobile/reduced-motion and startup-performance checks. Stop for explicit approval.
