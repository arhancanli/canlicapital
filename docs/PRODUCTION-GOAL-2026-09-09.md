# Canli Capital release-candidate goal

Started 2026-09-08 22:24 Dubai. Target: review-ready by September 9 morning.
This is a release candidate, not authorization to deploy. Marketing is deferred.

## Scope and truth boundaries

Preserve public routes, research, signed evidence, calculators, developer API
contracts and the external dashboard links. Work only in the isolated preview
checkout. Do not replace newer live research artifacts with the captured snapshot.
No live credentials, trades, key issuance, deployments, campaigns or purchases.
Conceptual 3D imagery must not imply observed returns or actual trading hardware.
Figma: https://www.figma.com/design/n3MbdBAC6STjHudQocaZa7

## Milestones

1. Full site storyboard and design specifications. Compare against the saved
   United Carriers desktop/mobile evidence; publish to Figma.
2. Original continuous 3D asset, first/transition/final frames reviewed before
   bulk rendering. Use Blender geometry/camera changes, not still-image pans.
3. Implement the whole homepage and coherent public-page templates; preserve
   content and functions. Separate motion enhancement from readable HTML.
4. Validate production build, source claims, routes, APIs with mocks, browser
   interactions, reduced motion, no-JS, failed assets, Safari and mobile layouts.
5. Fix release blockers; save evidence, integration instructions and limitations.

## Initial design plan and critique

Reference: giant dimensional subject cropped right; copy aligned to an interior
grid column; restrained, angular uppercase typography; small mono utilities;
white product stages and dark service chapters; continuous object/camera motion.
Our previous still-image version lacked geometry/camera continuity and used
over-compressed typography. Mobile put metadata before the main message.

Subject: ALPHAC's inspectable research process. Primary job: understand the
running paper strategies, inspect their record, or enter developer onboarding.
Palette: black #000000, ink #111111, white #ffffff, paper #f4f4f4,
royal blue #0016cb, orange #ff5500. Use semantic/component aliases.
Typography: evaluate a properly licensed angular display font against the
reference; Inter reading and IBM Plex Mono utilities. No unlicensed font copying.

Selected scene: one machined optical instrument containing four distinct
strategy modules. Closed hero -> visible open assembly -> four individually
inspectable modules -> published evidence -> developer connection. The instrument
is a concept, never a chart or claim of real hardware. Preserve ordinary charts.

```
Desktop: [brand] [index on interior grid]           [key action]
         [space] [large thesis] [cropped 3D engine across right]
         [white introduction / readable explanation]
         [opening assembly, scroll-controlled camera]
         [four modules / dark strategy chapters]
         [white chart / sources / dates]
         [developer environment / runnable quickstart]
         [research / accountability / complete evidence]
         [FAQ / final action / editorial footer]
Mobile:  [compact header]
         [dimensional object + thesis, no metadata obstruction]
         [actions / paper boundary / status]
         [shorter scene progression + all chapter copy]
         [stacked readable sections / touch-safe controls]
```

Keep the visual risk in the continuous instrument. No fabricated testimonials,
brand partners, awards, counters, market feeds or independently audited claims.

## Quality and efficiency checks

- At every milestone and at least every 20 minutes: record completed artifacts,
  evidence, unresolved issues, next highest-impact action and wasted work.
- After two failures of one approach without new evidence: diagnose or switch;
  do not blindly retry. Do not repeatedly re-audit unchanged passing components.
- Review a small set of 3D frames before spending on a full sequence.
- Runtime target: stable scroll on the available Mac; collect timing evidence,
  don't equate installed libraries or passing functional tests with smoothness.
- Critical imagery has a static fallback; never hide all content while loading.
- No horizontal overflow at 320, 390, 768, 1024, 1440 and 1920 pixels.
- All navigation and disclosures keyboard accessible, reduced motion honored.
- Final production readiness remains conditional on live serverless integration,
  fresh production evidence and deployment verification, which this local preview
  alone cannot prove.

## Progress log

- 22:24: Goal started. Figma Pro/Full identity and file create/read verified;
  actual Safari automation verified; Blender Metal rendering verified. Existing
  incremental preview retained as a fallback. Beginning storyboard and 3D proof.
- 22:42: Reviewed two original Blender proof versions; removed projecting
  brackets and adjusted glass/metal lighting before rendering 96 frames.
  Encoded 1280px desktop and 768px mobile WebP sets: 9,461,582 bytes combined.
  Installed locally served OFL-licensed Chakra Petch Medium; corrected mobile
  status order and desktop interior-grid composition. Added demand-driven
  sequence with 3 concurrent loads, 20 decoded frames, no retry on failed frames.
  Nine full-page Chromium layout/no-JS/reduced-motion cases pass. Nine additional
  Chromium/WebKit/Firefox sequence/mobile/failure cases pass. Production build
  passes. Evidence: artifacts/qa/cinematic-rebuild and instrument-sequence.
  Figma local capture opened in Safari; editable component design still pending.
  Efficiency: bulk render started only after proof review; one render invocation
  failed on a trailing separator, fixed with explicit `--frames all`. No repeated
  unchanged retries. Remaining: contrast/motion timing, Figma, public-template
  regression, complete verification suite, real Safari expanded QA, release gates.
- 22:58: Complete verification passes after moving Three.js to development-only
  tooling and retaining a no-runtime-import/bundle guard. Actual Safari passes
  homepage sequence, curves, FAQ, deep hashes and four hubs. Shared shell passes
  42/42 production-preview views. Local Chromium scroll p95: 8.6ms desktop,
  9.1ms mobile; no sampled intervals >50ms; not real-user/network-throttled data.
  Automated accessibility found developer code/table keyboard-scroll defects;
  fixed source generator and added no-JS keyboard regression. All 14 representative
  axe views now report zero violations; manual contrast checks remain necessary.
  Production-dependency audit reports zero known vulnerabilities (not a security
  certification). Figma Safari capture and 31-token/7-style foundation are verified.
  Figma documentation/componentization remains active; no site deployment occurred.
  Efficiency: one shell audit used an inactive default port, corrected to 4188;
  Figma batch search silently clamped to one query, remaining three were explicitly
  checked. Missing Figma standalone typings were replaced by official plugin typings;
  unavailable helper script was replaced using fully read reference patterns.
- 23:17: Final hero contrast/layout review passes all nine width/no-JS/reduced
  cases. Full verification is 269/269. Figma cover is visually verified; 26 color
  swatches and six exact type specimens now document the 31-token foundation.
  Inline Figma screenshots replaced unavailable hosted screenshots; their visual
  proof caught an auto-height reset/overlap, now fixed before pattern reuse.
  Live public status GET succeeds and remains PAPER_ONLY; its timestamp is newer
  than this isolated source snapshot. Release must retain fresh production data.
  Efficiency: website checks are complete except final build and targeted adverse
  conditions; not repeating unchanged suites. Remaining effort is editable Figma
  components/composition, adverse-condition checks and evidence-backed handoff.
- 23:35: Larger-text testing found intrinsic grid overflow and a fixed-height
  hero that could clip enlarged content. Added long-word wrapping, zero minimum
  grid widths and content-driven hero height. All four adverse cases pass:
  150ms/1.6Mbps/4x-CPU cold loading, missing image/font assets, and 200% root text
  at mobile/desktop widths. The cold local test observed ~1.9s LCP, not field CWV.
  Final build, 269 tests, 505-page audits, 42 shell views and actual Safari pass.
  Figma foundations/usage/assets pages and both component families are rendered
  and structurally verified. Component-sized corrections are being finished before
  homepage composition. No live writes, deployment or marketing took place.
  Efficiency: failures led to targeted fixes, not threshold relaxation. Re-ran
  only suites affected by the layout/shared-shell changes. Remaining: component
  integration into the editable full-page design, final Figma QA and release docs.
- 23:55: Figma homepage assembly is active; hero, introduction and all three
  process chapters are visually checked. HTML capture omitted pseudo-element
  gradients and retained ScrollTrigger pin constraints: restored source-bound
  gradient stops and made the design-file process a static three-chapter storyboard.
  A decorative glyph fell back to emoji. Initial first-match lookup targeted a
  separate small link arrow; exact text/node inspection resolved the ambiguity,
  restored the link, and replaced the signature glyph with matching SVG in code
  and Figma. This detour cost time; remaining edits use section-specific IDs.
  Latest production rebuild passes. Final deployment gates and source integration
  safeguards are written in docs/RELEASE-CANDIDATE-2026-09-09.md. No live mutation.
- 00:17: Final production build passes after SVG and API type/control refinements.
  Figma now includes the complete strategy register, actual paper chart, API and
  research. Safari's CSS scroll animations persisted despite the capture's JS
  reduced-motion shim; a scoped static CSS capture resolved missing content.
  Temporary capture code has been removed from the website. Reusing that verified
  capture for remaining sections; no further recapture loop. Remaining work is
  the closing sections, component instances, final design audit and handoff.
- 00:37: Release-candidate implementation and editable Figma handoff are complete.
  Latest build, 269 tests, 505-page source/link audits, 42 shell views, final
  nine-case layout pass, 14 accessibility views and actual Safari passed. The
  last shared-footer glyph was converted to SVG; nine focused viewport/route
  checks pass after that change. Figma has 13 sections, ten control instances,
  31 variables, six text styles and one effect style, with no missing fonts,
  missing images or broken aliases. Three temporary captures were removed only
  after visual verification, recoverable in Figma history. Page order and all
  component variants/bindings were read back. Final proof is p4-final-audit.png.
  Efficiency: hidden-child handling, nested-alias fallback paint and ambiguous
  captured Header lookup caused small design-file detours; exact hierarchy,
  source colors and readback resolved them. No repeated blind capture or retry.
  Final documentation distinguishes this local candidate from deployment and
  requires fresh publishing data, authorized staging checks and release approval.
  Marketing, live systems, purchases and the original checkout remain untouched.
