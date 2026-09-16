# Visual redesign / second direction

Status: in progress, user review required. The previous candidate was rejected
for visual quality. Its test results are not design approval.

Subject: Canli Capital's own systematic research, paper strategies and developer
validation API. Audience: researchers and developers. Opening's job: make the
open-research proposition unmistakable and give direct access to strategies/API.

Reference: https://unitedcarriers.com/ and saved chronological captures in
artifacts/reference/united-carriers. Direct browsing is the fallback because the
Firecrawl executable is unavailable on the current shell. No copied brand assets.

## Observed gaps

- A 1280px frame was enlarged beyond its native detail in the hero. The rings read
  as repetitive industrial machinery, with broad blown reflections and soft edges.
- Thin display strokes and tight tracking reduced the reference's typographic
  authority. A conventional full-width navigation bar competed with the inset index.
- Hero, white introduction and black sequence were disconnected stacked stages.
- Figma and automated tests became the focus before visual approval. This pass
  stops at a rendered opening/transition review before propagating the direction.

## Plan

Palette: void #000000, paper #f4f4f4, type #ffffff, cobalt #0016cb,
copper #ff5500, secondary #bac3ce. No new decorative palette.
Type: locally licensed Chakra Petch Bold for the opening, Inter for explanation,
IBM Plex Mono for navigation and controls. Actual bold font, not synthetic weight.
Layout: oversized right-hand optical sculpture; inset heavy statement; sparse
navigation; status and paper-only boundary remain readable. A cobalt atmospheric
exit connects to a spacious white editorial introduction.
Signature: one precise optical-glass object with visible interior layers, an
original conceptual metaphor for inspectable strategies, never live telemetry.

Composition alternatives considered:

    A / existing machinery       B / optical direction (selected)
    [bar full of links]          [brand]     [index]          [action]
    [    text / metal rings]     [           enormous glass object  ]
    [status strip]              [       heavy statement             ]
    [hard white cut]            [       explanation / direct links  ]
                                [blue atmosphere -> white reading   ]

Critique: simply generating a shinier version of the same rings would preserve
the rejected idea. Replace the silhouette and material vocabulary. Keep the
surrounding interface quiet; do not add fake signal counters, particles, awards,
unearned claims or a complicated custom cursor.

Quality gates: inspect native image dimensions and pixels; verify no accidental
upscaling at target width; review desktop/mobile screenshots and browser recording;
verify keyboard, no-JS/reduced-motion and preserved links. User decides whether
this direction earns extension to the remaining page.

## Progress / 07:08 Dubai

- New goal active. Reassessed the actual reference and previous full-size captures.
- Generated a new optical image with built-in OpenAI generation; exact prompt and
  native dimensions recorded in OPTICAL-IMAGE-PROMPT-2026-09-09.md. Its output was
  1672 × 941, not the requested 4K. No fabricated resolution claim.
- Rebuilt the opening typography, navigation density, composition, mobile line
  breaks/buttons and atmospheric transition. Preserved the existing evidence IDs,
  native disclosures and routes. Later sections are not yet redesigned in this pass.
- Eight responsive/browser/fallback cases and a browser recording completed.
  Actual Safari interactions, production build, 269 tests and 14 representative
  automated accessibility views pass. These are functional safeguards, not approval.
- Created a separate original Blender scene and rendered a native 3840px master.
  Its first lighting setup had distracting rectangular reflections; one targeted
  grazing-light revision is rendering. The AI image remains the current direction
  asset until the high-resolution alternative is visually checked.
- Opened the review gallery in Safari. Figma deliberately remains at the rejected
  version until the new visual direction is approved; no second synchronization
  effort before that checkpoint. No deployment, publishing or trading changes.
- Efficiency: reused measured reference evidence, changed the method once for
  unavailable Firecrawl, inspected real output dimensions, and limited native
  material study to a targeted lighting revision rather than blind regeneration.

## Progress / 07:11 Dubai

The grazing-light revision was inspected and selected for the actual opening:
native 3840 × 3840 WebP plus 1536px responsive derivative. Original lossless
master and editable Blender scene are retained. This is original geometry,
not an AI upscale. Broad highlights no longer cross the headline area.
The hero still uses scroll-linked 2D presentation, not a real-time rotating WebGL
scene; do not call the motion equivalent to the reference's interactive globe.
Final responsive/Safari review is being refreshed after this asset selection.
The review gallery and recorded browser scroll are the next user checkpoint.

## Review checkpoint / 07:13 Dubai

The selected native asset, updated mobile composition and header alignment were
visually checked in the actual page. Eight browser/viewport/fallback cases pass;
actual Safari regression and 14 representative axe views pass after selection.
At a 1440px viewport and DPR 2, the browser selects optical-master-v3.webp for an
1180.8px-wide image element. Source is 3840px, so this view does not upscale it.
The 1536px derivative is approximately 114KB; native WebP approximately 358KB.
Final build passes. The 269-test suite passed during this pass before the last
asset-only selection and header offset refinement. No new production-readiness
claim is made from the earlier candidate's results.

Review: http://127.0.0.1:4187/artifacts/qa/optical-opening-v2/review.html
Actual scroll: artifacts/qa/optical-opening-v2/opening-scroll.mp4 (WebM fallback).
Logs are retained in that review directory. Figma and later sections remain at
the previous direction. Goal stays open; next decision is visual approval of
this opening/transition before extending its art direction across the whole site.

## Follow-up validation / 9 September

- Four adverse-condition cases pass on the rebuilt preview: slow cold mobile,
  unavailable image/font assets, and 200% root text at 390px and 1440px.
  These are local browser simulations, not physical-device or browser-zoom certification.
- Screenshot inspection caught arbitrary enlarged headline/menu word splitting
  despite the automated pass. The accessibility-guided correction enables natural
  headline hyphenation, brand word wrapping and an unbroken menu label. Inspected
  the refreshed enlarged-text screenshot; rebuilt and reran all four cases successfully.
- Review gallery images load and its MP4 advances in WebKit (10.04-second duration).
- Slow-cold simulated LCP was approximately 3.4 seconds before the wrapping correction;
  this is an observation, not a production performance pass. Enlarged-text CLS readings
  include the test's deliberate post-load text-size change.
- No further art variants or site-wide propagation pending the actual visual review.
  Functional passes do not establish reference-level visual quality. Goal remains active.
