# Meridian / Immersion QA: Motion + Performance review

Role: motion + perf QA. Reviewed every page against the world-class bar AND the
perf budget. Audited the live source on 2026-06-16. Build is green
(`vite build`, three at 526KB / 131KB gzip, unchanged) and the U+2014 audit over
source + dist returns nothing. The hard guardrails are intact (see "Guardrails
verified" below). One BLOCKING consistency defect, two medium notes, a few low
polish notes.

---

## Verdict

PASS_WITH_NOTES, with ONE item I am flagging as blocking-quality:

The /progress manifold is forced to FULL convergence (the resolved single-spine
pose that belongs to /performance) for roughly the top 80% of the page, instead
of the scattered/plurality (fanned-out) read the page exists to show. This breaks
the "one scene world, four chapters" thesis on a whole page, and contradicts that
page's own reduced-motion poster. It is a one-line fix and it is the single thing
standing between this property and a clean motion-consistency pass.

Everything else lands: the signature beats are present and consistent (one pinned
tentpole + one restrained `flareBloom` per page, the cursor whisper generalized to
all four pins, one easing vocabulary, one Lenis feel, GPU-light scene with watchdog
+ offscreen pause), reduced-motion is a composed poster per page, and the no-WebGL
fallback is intact on all four.

---

## BLOCKING

### B1. /progress holds the manifold fully GATHERED for ~80% of the page (wrong chapter).

Where: `js/progress.js:267` (`initRoadmapPin`, the init call `sceneConverge(1)`).

What happens: `initRoadmapPin()` runs at boot (one rAF after the page boots) and
immediately calls `sceneConverge(1)`. In `js/scene.js` `applyDescriptor`
(scene.js:640), a non-null `convergeOverride` takes ABSOLUTE priority over the
scroll descriptor: `const cv = convergeOverride == null ? desc.converge : convergeOverride;`.
So from page load until the reader reaches the roadmap pin (the pin sits at
`progress.html:617`, AFTER sections 0 to 4: hero, build, phases, edge-status,
roadmap), the manifold is pinned at converge = 1.0: the dead-on, single-spine,
camera-centered "resolved verdict" pose. That is the /performance chapter, not
/progress.

Why it is wrong:
- The design system (DESIGN_SYSTEM section 5 table) assigns /progress the
  PLURALITY chapter: "pull back and up, the surfaces fan out as a fleet of future
  sleeves," convergence "release (0.0 to 0.4, fanning)." The page config agrees:
  `progress.html:70` `sceneBand: [0.0, 0.4]`. The descriptor over that band gives
  converge roughly 0 to 0.21 (scattered/forming). The override throws all of that
  away and shows 1.0.
- It is INCONSISTENT WITH ITS SIBLINGS, which is the exact seam the brand says it
  exists not to have. Both other gather/forming pages init to the descriptor, not
  to a forced value:
  - `js/performance.js:533` ends `initGauntletPin` with `sceneConverge(null)` (let
    the high band drive), and only the bounded standing-settle sets `converge(1)`
    while `#standing` is on screen, releasing on leave (performance.js:558-563).
  - `js/systems-page.js` sets NO init override and releases to `null` on both pin
    exits (systems-page.js:359-360); the forming band drives the scene above the pin.
  Only progress.js forces a value at init and never releases it until the pin is
  physically reached. It is the lone outlier.
- It contradicts the page's OWN reduced-motion poster: `sceneStill: 0.4`
  (progress.html:71) composes through `staticConverge(0.4)` in scene.js, a low,
  visibly-fanning gather. A sighted, motion-on reader sees a fully-resolved spine;
  the reduced-motion reader sees the correct fanning poster. The two states
  disagree about what the page's scene even is.

Fix: make the init match the siblings. In `js/progress.js:266-267` change the init
`sceneConverge(1)` to `sceneConverge(null)`, so the `[0.0, 0.4]` descriptor drives
the scattered/plurality read everywhere ABOVE the pin. The pin already begins its
fan-out from gathered at its first `onUpdate` (`1 - eased` with `eased` 0 at the
top of the pin, progress.js:255-263) and `onLeaveBack` releases to `null`, so the
"begin gathered on the proven sleeve, then fan out as the reader descends" beat is
preserved AT the pin, which is where it belongs. The only change is that the rest
of the page stops impersonating /performance. Net: 1 line. Rebuild + re-audit
U+2014 after.

(If a deliberately-higher ambient gather is wanted on /progress entry, raise the
band's low end in `progress.html` `sceneBand` instead, so the DESCRIPTOR carries it
and the page-to-page arrival ease still composes. Never reintroduce a static
init override; that is what causes the wrong-chapter freeze.)

---

## Notes (non-blocking)

### N1. [MEDIUM] The convergence smoothstep windows are duplicated, not shared, and progress diverges silently.
Where: `js/scroll.js:54` exports `MOTION.CONV_WINDOW = { gather: [0.45,0.96], release: [0.30,0.92] }`
as the single source for the gather/release ramps, but every page re-declares the
literals locally instead of importing it: `js/performance.js:500-501`
(`CONV_START=0.45 / CONV_END=0.96`), `js/systems-page.js:341-342` (same),
`js/progress.js:242-243` (`REL_START=0.30 / REL_END=0.92`). They happen to match
`MOTION.CONV_WINDOW` today, but nothing enforces it, so a future tweak to one page's
ramp silently forks the "one hand" motion timing. This is the same class of drift
the brief calls out for the roadmap status (POLISH_BRIEF C1).
Fix: import `MOTION` from `scroll.js` in the three page modules and read
`MOTION.CONV_WINDOW.gather` / `.release` instead of re-pasting the numbers, the way
`EASE` is already shared. Pure refactor, no behavior change; it makes the shared
timing structurally true rather than coincidentally true.

### N2. [MEDIUM] `EASE.cinema` is declared on every page module but only one of four actually spends it on a camera/scene settle.
Where: `js/performance.js:52`, `js/systems-page.js` (local `EASE_OUT` only; cinema
absent), `js/progress.js` (local `EASE_OUT` only). DESIGN_SYSTEM section 4.3 says
each page earns exactly ONE cinematic beat: "resolve with a single `EASE.cinema`
settle + one bloom flare." The bloom flare is fired on all four (good), but the
filmic `EASE.cinema` CURVE is only attached to a visible resolve on the landing
(scroll.js `EASE.cinema`) and, via CSS, on the gauntlet/roadmap counter color
transition (e.g. `progress.css:377` `--ease-cinema`). The sub-page pin RESOLUTIONS
themselves cross-fade with the house ease-out / in-out, not the reserved filmic
curve, so the climax does not read as a different, heavier beat from the rest of
the page on the sub-pages the way it does on the landing.
This is a refinement, not a defect: the flare + the dim-and-hold (`is-resolved`)
already mark the climax. But if the goal is the landing-grade "this beat is
different" feel on all four, give the single resolved-step settle on each sub-page
pin the `EASE.cinema` curve (one transition, on the active step's settle at lock),
matching the landing. Keep it to the ONE resolve per page (section 4.3 forbids a
second cinematic beat). Verify the U+2014 audit and 60fps after.

### N3. [LOW] Reduced-motion poster math is good, but the high-band poster never reads as the "still, dead-on" frame the spec wants.
Where: `js/scene.js:429-436` `staticConverge` clamps the poster gather to a max of
0.85 ("keep a hair of the scattered field visible around the spine"). For
/performance (`sceneStill: 0.78`) the live, motion-on tentpole RESOLVES to
converge = 1.0 (the dead-on still spine, the page's whole thesis), but the
reduced-motion poster caps at 0.85, so the frozen frame is slightly less resolved
than the moving page's own climax. DESIGN_SYSTEM J4 asks the static state to be
"composed as deliberately as the moving one"; here the highest-band page's poster
is deliberately held just short of its own resolved pose.
This is defensible (the cap guarantees the gather READS as a gather on the low-band
pages), and it affects only reduced-motion visitors, so it is low. If you want the
/performance poster to match its live climax, let `staticConverge` reach a higher
ceiling (closer to 1.0) for high `p`, while keeping the 0.4 floor for the low-band
pages, e.g. lerp the ceiling with `p`. Optional.

### N4. [LOW] `cursor.js` caches a single `[data-cursor-pinned]` node; correct today, fragile by contract.
Where: `js/cursor.js:104` `const pinnedSection = document.querySelector("[data-cursor-pinned]")`.
Each page ships exactly one tentpole pin with the attribute (verified: index/system,
systems/chainPin, performance/gpin, progress/roadmapPin), so the single cached
reference is correct. The per-frame reconcile (cursor.js:249-255) and the hover read
(cursor.js:196) use `closest("[data-cursor-pinned].is-pinned")`, which is robust, so
the only single-node assumption is the cached `pinnedSection` used to clear the
whisper when the pin releases while the pointer sits still. If a page ever ships two
pinned regions, that reconcile would track only the first. Leave as-is (one pin per
page is a design law), but the comment at cursor.js:103 should state the invariant it
relies on ("exactly one [data-cursor-pinned] per page") so a future builder does not
quietly break it. Documentation-only.

### N5. [LOW] `systems-page.js` boot has a dead reduced-motion branch.
Where: `js/systems-page.js:394-395`:
```
if (isDesktop && !prefersReduced) initPipeline();
else if (isDesktop) initPipeline(); // reduced motion still gets the static lit spine
```
Both branches call `initPipeline()` with no difference, so the condition is a no-op
that reads as if it does something. `initPipeline` already honors reduced motion
internally (it builds the static lit spine via IO + initial-state seeding, no
animation). Collapse to `if (isDesktop) initPipeline();`. Pure tidy, zero behavior
change.

---

## What I verified is WORKING (do not regress)

- Signature beats land and are CONSISTENT: exactly one pinned tentpole per page
  (`pin: ".system__sticky"` scroll.js:653, `.cpin__sticky` systems:347,
  `.gpin__sticky` performance:506, `.rpin__sticky` progress:248) and exactly one
  restrained `flareBloom()` per page, fired on the final-step lock and reversible
  on scroll-up. None are triumphant (the honest result is not celebratory).
- The reduced-motion / mobile fallback for every pin is a real stacked list, not a
  blurred-to-0 frame: the `.is-pinned ... :not(.is-active){opacity:0}` blur rule is
  gated behind `.is-pinned`, which JS only adds when NOT reduced/mobile
  (performance.css:541, progress.css:369, systems.css:639), and the reduced-motion
  media block restores `position: relative; opacity: 1` for every step/sleeve/stage
  (e.g. progress.css:447-455). Confirmed mirrored across all three sub-pages.
- The scene is GPU-light and well-governed: static geometry uploaded once, all
  displacement in shaders, half-res bloom, post skipped on mobile/reduced, an
  adaptive watchdog that sheds quality one-way (scene.js:584), IntersectionObserver
  + visibilitychange pause (main.js:303-312), DPR cap, no per-frame allocation in
  the frame loop. The three bundle is unchanged at 526KB.
- One rAF discipline holds: the only persistent per-frame loops are the scene
  (paused offscreen), the cursor (transform-only, desktop only, paused n/a but
  cheap), the single shared idle-waveform loop on /performance (IO-paused,
  reserved-only, renders only on-screen canvases, zero alloc), and the Lenis
  ticker. No page spins up a redundant concurrent loop. landing.js adds NO new rAF
  loop (one MutationObserver + two self-disconnecting IOs).
- No layout thrash: all motion is transform/opacity/filter. The hero-exit blur is
  scoped to a short scrub window with GSAP-managed will-change (scroll.js:303-318).
- Page-to-page continuity is real and guarded: `persistArc`/`readPriorArc`
  (scene.js:787-821) + `enterFrom` ease the camera between pages so a navigation
  reads as one continuous flight, with stale/privacy-mode guards.

## Guardrails verified (a regression in any of these is a hard FAIL; all PASS today)

1. Top-nav navigation intact: `shell.js buildNav` uses `item.href` (the clean URL)
   for all four NAV items on every page (shell.js:95-101); no smooth-scroll-to-anchor
   was reintroduced on the top bar. The rail + in-page `#anchors` keep their smooth
   scroll (scroll.js:791-807). The CTA routes to `#waitlist` on home and `/#waitlist`
   off-home (shell.js:106). PASS.
2. ZERO em dashes (U+2014): `grep -rPn "\x{2014}"` over source + dist (excluding
   node_modules) returns nothing. PASS.
3. Performance: 60fps-plausible, GPU-light, lazy-init scene, offscreen + tab-hidden
   pause, reduced-motion composed static poster (per-page `sceneStill`), no-WebGL
   fallback, transform/opacity only. PASS (B1 is a correctness-of-pose issue, not a
   frame-budget issue).
4. Honesty preserved: no copy touched in this review; the reserved Results slot,
   the idle waveform's dead-flat baseline (no ticks/knee/numbers, gated to non-live),
   and the restrained blooms are all intact. PASS.
5. Consistency: one motion language, one easing vocabulary (the `EASE` tokens), one
   Lenis feel (lerp 0.085), one cursor, one scene world. The ONE seam is B1 (and the
   structural-sharing nits N1/N2). PASS once B1 is fixed.

---

## Suggested order

1. B1 (one line in progress.js) first: it is the only thing breaking the cross-page
   scene thesis, and it is the cheapest fix in the list.
2. N1 (share `MOTION.CONV_WINDOW`) and N5 (dead branch) as a tidy pass: pure
   refactors, zero behavior change, they make the "one hand" structurally true.
3. N2 (`EASE.cinema` on sub-page resolves) and N3 (high-band poster ceiling) if the
   goal is to push the climax differentiation and the static state to landing grade.
4. N4 (document the one-pin invariant) whenever cursor.js is next touched.

After each change: `cd /Users/arhancanli/meridian && npm run build` (green) and
`grep -rPn "\x{2014}" .` over source + dist (empty).
