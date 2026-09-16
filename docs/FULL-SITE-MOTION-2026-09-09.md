# Approved direction, full-site continuation

The user approved the optical opening on 9 September and requested the entire
landing page and subpages receive the same level of motion without losing product
visibility or information. This supersedes the opening-only review checkpoint.

## Art direction

Subject: ALPHAC's systematic research, paper execution and inspectable calculations.
Audience: researchers inspecting evidence and developers evaluating the API.
Job: demonstrate the product, then let the reader inspect its complete record.

Retain the approved black (#000000), paper (#f4f4f4), cobalt (#0016cb), white
(#ffffff), silver (#bac3ce) and copper (#ff5500) palette. Chakra Petch 700 for
display, Inter for reading, IBM Plex Mono for utility/data. No invented metrics.

Layout alternatives considered:

    Repeated spectacle: image → cards → image → cards
    Chosen: optical object → research process → strategies → actual console
            → API request → complete evidence → research → accountability → access

The first option repeats imagery without explaining the product. The second
keeps motion attached to the user's question: what it does, what was observed,
what can be reproduced, and where its limits are.

Signature: the glass assembly's separation carries into staggered strategy rows,
the evidence console, an API request/receipt progression and a large closing mark.
Do not animate numeric values through fabricated intermediate results. Do not
hide tables, source links, forms or disclosures behind scroll-only interactions.

## Implementation and checks

- Save exact main-content text, IDs, links and controls for all shell-bearing pages
  before changing presentation. `scripts/check-design-preservation.mjs` is the guard.
- Open the existing full-evidence sections by default; retain their native controls.
- Shared motion belongs in the generated shell so archival documents are included.
  Long-form reading and interactive tools receive restrained chapter/structural
  animation, not long pins that interrupt reading or changing inputs.
- Dedicated landing choreography includes strategies, console, API, evidence,
  research, questions, access and footer, not just heading reveals.
- Reduced motion, no JavaScript, keyboard/hash jumps and browser restoration remain
  first-class. Motion must not gate content visibility.
- Check all public shell outputs statically and sample every page family in Safari /
  responsive browsers. Record actual limitations; this does not certify perfection.

## Baseline

489 shell-bearing pages captured before edits. Existing generated outputs and
unrelated work are preserved. No deployment or live API mutations authorized.

## Implemented result

- Full homepage: approved opening; existing frame-driven research assembly;
  sticky strategy introduction with advancing rows; actual interactive paper
  console; staged developer workflow; default-open evidence rooms; restyled
  offering, live evidence core and source-bound films; continuous vertical
  rebalance trace; research cards; detailed broker/claim tables; authorship,
  questions, release-note form and closing wordmark.
- Shared site: optical typography, structural chapter motion, reading progress,
  native menu entrance, hero parallax on core hubs and document entrances on
  generated papers/tools. Existing hub diagrams and functional animations kept.
- Shared bottom: a vector research packet follows a Bezier path from inputs,
  through a validation aperture, into the record. Its two sheets close and its
  conceptual receipt seal appears. All three links remain ordinary usable links.
  No API call is made by the scene and no result is fabricated.
- Wide screens use a sticky closing stage; phones scroll normally. Enlarged text
  disables sticking when the content no longer fits. Reduced motion returns to
  the complete static diagram, including when changed during a visit.

## Verification evidence

- `scripts/check-design-preservation.mjs`: all 489 captured pages retain exact
  normalized main text, IDs, link destinations and controls. Every one includes
  the shared motion module and closing scene after generation.
- 505 built HTML outputs: 489 site pages plus 16 verbatim publication paper
  artifacts. Raw artifacts are deliberately not reskinned; their publication
  wrappers receive the shared design. Publication verification remains passing.
- `audit-full-site-motion.py`: 68 route/browser/fallback cases passed during the
  initial full-site pass. `audit-remaining-families.py`: 32 further desktop/mobile
  WebKit cases pass after the closing sequence and remaining-family corrections.
- `audit-optical-handoff.py`: 20 cases across Chromium/WebKit, desktop/mobile,
  reduced motion and no JS. Actual packet positions change across the route;
  keyboard focus returns the wide scene to the corresponding stage.
- `audit-journey-coverage.py`: all 14 post-opening main sections have working
  motion hooks and were visited at desktop/mobile sizes without overflow.
  Runtime preference toggling and large-text unsticking pass after cleanup fixes.
- Actual Safari: full lower journey, three carrying positions, curve switching,
  sequence progression, FAQ/hash behavior and 12 representative subpages pass.
  Screenshots and report: `artifacts/qa/full-site-motion/safari-final/`.
- Build passes. 269 tests and source/route/number audits passed before the final
  reduced-motion lifecycle correction; that correction is covered by the focused
  runtime preference tests and a fresh build. Earlier 14-view axe checks had zero
  reported violations; this is not a comprehensive accessibility certification.
- Full browser recording includes the carrying scene. It is actual browser
  footage, not AI-generated video. The offline review gallery references local
  images and video to remain useful if a development server stops.

## Corrections and efficiency

The review caught a calculator min-content overflow, tight mobile heading leading,
a horizontally hidden fifth strategy tab, incomplete trace/evidence choreography,
an out-of-order scroll refresh, and a runtime preference cleanup failure. Fixed
the causes and retested the affected behavior. GSAP's completed entrance triggers
are retained until context cleanup rather than self-removing during a preference
rebuild, avoiding mutation of its refresh iteration. Animations still play once
and do not loop on repeated entry. No dependencies were installed or upgraded.

A trial-page QA assertion initially expected its h1 inside main; inspection showed
the unchanged hero is before the article. The check now tests one h1 on the page.
An automation stability wait was replaced with native scroll for long chapters;
actual controls, rendered positions and overflow assertions were retained.

## Handoff and limitations

Preview: http://127.0.0.1:4188/
Closing scene: http://127.0.0.1:4188/#cc-handoff-title
Review: artifacts/qa/full-site-motion/review.html (also opens directly in Safari).

This is an implemented, locally verified design pass, not a claim of literal
perfection or production certification. Existing live services were not mutated,
real keys were not issued, forms were not submitted, and nothing was deployed.
Physical-device coverage, real backend staging flows, production performance,
current-data parity and deployment remain separate release gates. Figma has not
been synchronized to this new full-site implementation.
