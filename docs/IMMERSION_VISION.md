# MERIDIAN / IMMERSION VISION

The world-class elevation plan. The site is already 9/9/9/9/8 and every tester
would join. This document is the path from "competent and elegant" to "jaw on the
floor, and somehow still restrained." It is the brief four builders converge on so
the landing dazzles and `/systems`, `/performance`, `/progress` match it, beat for
beat, with ONE motion language, ONE easing vocabulary, ONE scene world.

This extends `docs/DESIGN_SYSTEM.md` and `docs/POLISH_BRIEF.md`. It does not fork
them. Every guardrail in those documents still binds: zero em dashes, one signal
hue, honesty preserved, the top-nav navigates (never anchor-scrolls), 60fps, the
three bundle does not bloat, reduced-motion is a composed static poster, the build
stays green. If a moment here would break a guardrail, the guardrail wins.

The register: Jane Street x Palantir, a sovereign fund. Immersion is achieved
through PRECISION and CONTINUITY, not addition. We are not adding a fifth animated
thing. We are making the four pages feel like one continuous instrument that
breathes, reacts, and resolves. When a moment feels like a "feature," cut it. When
it feels like the same hand drew it everywhere, ship it.

---

## 0. THE THESIS OF THE MOTION (what the immersion MEANS)

The manifold is not decoration. It is the argument, rendered: **many noisy signals,
rigorously resolved into one honest decision.** `uConverge` (0 scattered to 1
gathered) is the verb of the whole property. Every signature moment is a different
conjugation of that verb:

- **Landing** scatters, then GATHERS onto one ridge (the System pin), then RELEASES.
- **/systems** holds the field mid-structure and watches the lattice TIGHTEN as the
  engine assembles, stage by stage.
- **/performance** lives close to the gathered spine and RESOLVES it onto one honest
  verdict (restrained, because the verdict is "not yet").
- **/progress** starts on the one proven spine and FANS it OUT into a fleet of future
  sleeves (plurality).

The immersion ceiling is reached when a visitor feels the scene is *listening*: it
reacts to their scroll position, their cursor, the chapter they are in, and it
carries continuity from page to page so leaving one page and entering the next feels
like the camera flew there, not like a fresh load. Three layers deliver this:

1. **The scene reacts** (scroll-coupled morph, cursor parallax + ridge proximity,
   chapter-aware framing, page-to-page camera continuity).
2. **The scroll choreographs** (signature pinned set-pieces, scrubbed reveals,
   chapter seams, parallax depth planes).
3. **The micro-interactions reward** (magnetic intent, link reveals, cursor states,
   number develops, text that writes itself in).

All three already exist in skeleton. This plan deepens each, and crucially makes the
THREE SUB-PAGES carry the same weight as the landing.

---

## 1. THE SHARED EASING + TIMING VOCABULARY (one language, restated as law)

Builders MUST use these and only these. They are already in CSS (`--ease-*`) and in
the `EASE` objects in `scroll.js` / `performance.js` / `systems-page.js`.

| Token | Curve | Reserved for |
|---|---|---|
| `EASE.out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default reveal, hover, underline draw, counters, parallax-adjacent. |
| `EASE.settle` | `cubic-bezier(0.22, 1, 0.36, 1)` | Per-character clip-rise + variable-weight settle ONLY. |
| `EASE.inOut` | `cubic-bezier(0.65, 0, 0.35, 1)` | Pinned cross-fades (step focus pull). |
| `EASE.cinema` | `cubic-bezier(0.83, 0, 0.17, 1)` | ONE per page: the intro lift and the page's single tentpole camera settle. |

Timing constants that must match across pages (so the rhythm is one hand):
- Pin length: `"+=" + (N * 105) + "%"` (already shared by every pin). Keep it.
- Convergence window inside a pin: smoothstep over a `[start, end]` band
  (`0.45 -> 0.96` for gather pages, `0.30 -> 0.92` for the release page). Keep it.
- Reveal trigger lines: `top 88%` (heads), `top 90%` (mono), `top 82%` (words),
  `top 85%` (section rules). Do not invent new trigger fractions.
- Scrub smoothing: `0.4` to `0.6` for scrubbed depth moves. Never 0 (jittery).
- Lenis `lerp: 0.085`. Byte identical on all four pages. NEVER tune per page.

New shared constants this plan introduces (add to a single shared place, e.g. a
`MOTION` export so all four pages read the same numbers):
- `PARALLAX_PLANES`: depth fractions `{ far: 0.06, mid: 0.12, near: 0.20 }` for the
  three-plane parallax read. Reuse on every page.
- `MAGNETIC_STRENGTH`: `{ cta: 16, row: 10 }` (already in cursor.js). Do not exceed.
- `RIDGE_PROX_RADIUS`: the cursor-to-ridge distance (world units) under which the
  scene lifts the ridge (Section 2.3). One value, all pages.

---

## 2. SHARED SCENE UPGRADES (make the manifold feel ALIVE and MEANINGFUL)

The scene engine (`scene.js` + `shaders.js`) already does the hard part: GPU
displacement, five-state morph, convergence, bloom-on-accent, watchdog, pause,
static frame. These upgrades make it feel *alive* without bloating the bundle or
dropping below 60fps. Every one is additive to the existing `createScene` contract;
none requires new geometry uploads or new draw calls of consequence.

### 2.1 Page-to-page camera CONTINUITY (the single biggest "one world" lift)

**The problem:** today each page sets a scene band, but entering a sub-page snaps the
camera to that band's start. The four pages feel like four loads of one scene, not
one continuous flight.

**The upgrade:** persist the last scroll/converge state across navigations and have
the new page's scene EASE from there to its band on first paint, under the intro
curtain. Two mechanisms, pick the cheaper that ships clean:

- (a) `sessionStorage` writes the global arc position + converge on `beforeunload`;
  `initScene` reads it and seeds `current` / `convergeOverride` so the first
  `renderOnce` composes from the prior frame, then `start()` eases to the page band.
- (b) A short `EASE.cinema` camera "arrival" tween (0.8s, under the curtain lift) from
  a neutral entry pose to the page's `sceneStill`, so every sub-page entry reads as a
  deliberate camera move INTO this chapter, not a cut.

Ship (a) if it stays clean; otherwise (b). Either way the rule is: **no hard cut on
entry.** The curtain masks the warm-up; the first visible frame is already moving
toward this page's framing. This is what makes `/systems` feel like the camera
descended from the landing's plan view, and `/progress` feel like it pulled back.

Expose one new optional scene method, additive and guarded everywhere:
`scene.enterFrom(p, converge)` (seed the arc + gather, then ease to the band). If
absent (old scene, no-WebGL), callers no-op exactly like `setConverge`/`flareBloom`.

### 2.2 A living ambient breath (depth that never freezes, but never distracts)

The camera already has a `yaw` breath (`Math.sin(yaw * 0.05) * 0.15`). Deepen the
sense of a living instrument with TWO sub-degree, always-on motions that cost nothing:

- **Fog breath:** oscillate `fog.density` by `+/- 0.002` on a ~22s sine, independent
  of scroll, so the depth of the void subtly inhales and exhales. The horizon line
  feels alive, not painted.
- **Ridge filament shimmer:** the signal ridge already animates height. Add a tiny
  per-frame opacity shimmer (`+/- 0.04`) on a slow noise so the one colored line reads
  as a live readout, like a heartbeat trace, not a static stroke. It must stay below
  the level where it reads as flicker. One element, the accent, earns this.

Both are pure uniform writes, zero allocation, and freeze gracefully in the static
frame. Disabled feel under reduced motion (the static poster holds one composed pose).

### 2.3 Cursor that the MANIFOLD answers (reactivity that means "it sees you")

The scene already takes `setPointer` for camera parallax and surface brightening
(`uCursor`). Deepen the reactivity so the manifold feels responsive, not just
parallaxed:

- **Ridge proximity lift:** when the cursor's projected world point passes within
  `RIDGE_PROX_RADIUS` of the signal ridge, call a soft, throttled `pulseRidge()` (or
  a new `uCursorRidge` brightening), so moving the cursor near the spine makes it
  glow a touch. The reader discovers that the one colored line responds to them. This
  is the single most "alive" micro-moment, and it costs one distance check per frame.
- **Cursor wake on the field:** the existing `curBright` already brightens the surface
  under the cursor. Widen its falloff slightly and let it leave a brief, decaying
  trail (a single smoothed lag point), so the field ripples faintly where the cursor
  has been. Homeopathic. Off on touch/mobile (no pointer), off under reduced motion.

Hard limits: cursor reactivity is desktop-pointer only, never on the convergence
climax (the camera already calms `cursorScale` to 0.25 at converge: keep that, and
also damp ridge-proximity lift at high converge so the climax holds dead still). The
manifold reacting must never fight the tentpole's stillness.

### 2.4 Convergence as a SHARED, CONTINUOUS uniform (consistency of meaning)

Every page already drives `uConverge` in its own band. Make the read identical:

- The bloom threshold drop, the field dim, the spine ignition, the focus-band narrow
  are all already keyed to `uConverge`. Do not re-tune them per page. A reader who
  watches the landing gather and then watches `/performance` resolve must see the
  SAME visual grammar of gathering, just framed closer. This is non-negotiable for
  the "one hand" read. Builders touch framing (camera) and band (scroll range), never
  the convergence shader response.

### 2.5 No-WebGL and reduced-motion: composed posters, not fallbacks

Per POLISH_BRIEF J4 and DESIGN_SYSTEM 9, the static state must read as a finished
poster. For each page, tune `sceneStill` so a screenshot with motion off is on-thesis:

- Landing: mid-arc gather (the field visibly collapsing), `~0.5` to `0.62`.
- /systems: lattice forming, off-axis plan view, `~0.42`.
- /performance: close on the gathered spine, dead-on, `~0.78`.
- /progress: pulled back, the fan beginning, `~0.4`.

The `renderOnce` path already shares `updateBloom`, so the static frame shows the
gathering glow. Builders only choose the pose; the engine composes it. The no-WebGL
CSS `.scene-fallback` gradient + faint grid must echo the same pose direction (a
single warm signal locus where the ridge would be), so even the gradient reads as
the same world.

---

## 3. SIGNATURE SCROLL MOMENTS (the set-pieces, one tentpole per page + the connective beats)

Each page earns exactly ONE `EASE.cinema` tentpole (the held, pinned, scene-coupled
climax) and ONE hand-placed broken-grid asymmetry. Everything else is the shared
reveal grammar, deepened. Below, per page: the tentpole (mostly built, here is how to
elevate it), plus the connective signature beats that make the page feel composed.

### 3.1 LANDING (the reference the other three must match)

Tentpole (exists): **"The System" pin.** Five steps cross-fade in a pinned frame as
the field gathers onto one ridge, then a single restrained `flareBloom` on lock and
the handoff to "What is true today." This is the gold standard. Elevations:

- **Hero exit as a camera pull-back THROUGH the wordmark** (exists in `scroll.js`
  hero-exit scrub). Deepen by coupling it to the scene: as the hero column recedes and
  blurs, nudge the scene's `setScroll` lead slightly so the manifold appears to be
  what the camera pulls back INTO. The wordmark dissolving into the live field is the
  property's opening signature. Keep amplitudes small (it is depth, not a leave).
- **The two ridge ignitions on hero reveal** (exist: wordmark settle, flagship line).
  Keep. They are the first proof the scene is coupled to the type.
- **Convergence ramp inside the pin** (exists, smoothstep `0.45 -> 0.96`). Keep
  exactly. The landing's convergence IS the template every gather page reuses.

Signature connective beats (the landing already has these; they are the menu the
sub-pages copy): the per-character clip-rise heads, the section-rule seam draws at
each void/ink boundary, the mono type-in data lines, the stat counters, the Discipline
recessed beat, the parallax ghost numerals/wordmark, the velocity skew.

### 3.2 /systems: THE ENGINE ASSEMBLES (tentpole = the pipeline tightening walk)

Today `/systems` has the pipeline spine (lights stages as you descend), staggered
schematic reveals, the drawdown-ladder fill, and the gauntlet seam draw + one flare.
It is strong but has NO PINNED TENTPOLE: it is the "studies the architecture" page and
deserves one held beat where the lattice visibly tightens as the engine assembles.

**The tentpole to build: the "Chain of custody" pin.** Pin the gauntlet/backtester
chapter (or a dedicated pinned frame at the engine's culmination) and, across the pin,
walk the SIX stages (data lake -> factors -> portfolio -> backtester -> overlays ->
paper loop) one at a time as focus steps, while the manifold's `uConverge`/`tighten`
ramps so the lattice visibly TIGHTENS from loose grid to structured filament. This is
the on-thesis beat: the reader watches the architecture resolve. Reuse the EXACT pin
grammar from `performance.js initGauntletPin` (pin, `pinSpacing`, `onUpdate` step +
converge drive, `is-resolved` + ONE `flareBloom` on lock, `onLeaveBack` reset). The
flare fires once, when the paper loop (the last stage) locks: "the engine is whole."

Because `/systems` lives in the structure band (`[0.22, 0.62]`), the pin should drive
`setConverge` to a MID value (e.g. ramp to ~0.55, not 1.0): the structure forms but
does not fully resolve here (that is `/performance`'s job). This keeps the four-page
convergence arc honest: systems = forming, performance = resolved, progress = released.

Signature connective beats (deepen what exists to match the landing density):
- The pipeline spine is the page's living chapter tracker (keep). Add a hairline
  CONNECTOR draw between lit nodes so the chain literally draws itself as you descend.
- Every chapter head uses the per-character clip-rise (confirm `[data-chars]` on each
  `.sys-chapter__head`). The factor-families ledger, the flow strips, the brake
  panels, the gauntlet tests keep their staggered enter, but each chapter must open
  with a section-rule seam draw at its void/ink boundary, matching the landing.
- The drawdown-ladder fill stays the page's one bespoke gesture beyond the tentpole.

### 3.3 /performance: THE VERDICT RESOLVES (tentpole = the gauntlet pin, restrained)

Tentpole (exists, strong): **the gauntlet pin.** Six measures cross-fade while the
manifold tightens onto the single ridge; ONE restrained `flareBloom` on the last
measure (the result is "not yet," so the bloom is muted, never triumphant). This is
correct. Elevations that raise immersion without touching the honesty:

- **The resolution must read as the camera arriving on the spine.** This page sits in
  the high band (`[0.7, 1.0]`); the pin should drive `setConverge` to a full 1.0 (the
  field is gathered, the spine is the subject). The camera framing for this page is
  dead-on, close to the ridge (per DESIGN_SYSTEM). Confirm the band + still keep it
  there so even before the pin the page already feels "close to the resolved decision."
- **The reserved Results slot, powered on** (POLISH_BRIEF J3, already built as the
  idle waveform). This IS a signature moment: a flat baseline in the signal hue with a
  single soft pulse traveling it, unmistakably an instrument powered on and waiting,
  never a fabricated curve. Keep it gated to `STATUS !== "live"`. The pulse traveling
  the baseline is the page's quiet "alive" beat between the pin and the standing close.
  When two reserved frames are combined (POLISH_BRIEF C3), the surviving frame owns
  this; do not run two idle waveforms back to back.
- **The standing close** ("the edge has not cleared the bar / intellectual honesty is
  the only edge that compounds") is the emotional payoff. Give it the held-italic
  `display-quote` treatment with a slow word reveal, and let the scene settle to its
  most disciplined, stillest pose as the close lands (the camera stops breathing for a
  beat). Stillness, here, is the immersion.

### 3.4 /progress: THE FLEET FANS OUT (tentpole = the roadmap pin, releasing)

Tentpole (exists, built per POLISH_BRIEF J1): **the roadmap pin.** Four algorithm
sleeves cross-fade one at a time while the manifold RELEASES (fans out) from the
gathered spine into a fleet of receding future surfaces; AlphaForge (proven) locks lit
with ONE restrained `flareBloom`. This is the on-thesis beat for the breadth chapter.
This page lives in the plurality band (`[0.0, 0.4]`); the pin ramps `setConverge` DOWN
(`1 -> 0`) so the one proven signal visibly splits into the future. Elevations:

- **The fan-out must be legible as "one proven, more to come," not "scatter."** Drive
  the `spread` read so the surfaces fan into distinct receding LANES (the shader
  already has the plurality split). AlphaForge stays the brightest, nearest lane;
  reserved sleeves recede into fog. The restraint: the future lanes are dimmer and
  unlit (no signal tint), because they are not proven yet. Honesty in the geometry.
- **The phase explorer** (twelve collapsible phases) is the page's dense interactive
  ledger. Each phase bar, on open, should reveal its detail with the shared fade-rise
  (not a raw height toggle that thrashes layout: animate opacity/transform of the
  detail content, with the row using a max-height-free technique or pre-measured
  transform). Keep it keyboard-operable, default-open with no JS.
- **The edge-status section** ("not yet proven") must MATCH /performance's standing
  candor in tone and treatment, so the two honesty surfaces read as one voice.

---

## 4. PREMIUM MICRO-INTERACTIONS (the reward layer, identical on all four pages)

These are the small, constant rewards that make every interaction feel expensive.
They are GLOBAL CHROME: build once, behave identically on all four pages. Most exist;
this section is the spec for completeness and consistency so a builder cannot ship a
sub-page that is quieter than the landing.

### 4.1 Magnetic targets (exists in cursor.js)
- CTAs: `data-magnetic`, strength 16, radius 1.6. Center-out underline sweep.
- Data/tier rows: `data-magnetic-row`, strength 10, radius 0.7. Softer; content barely
  drifts. Body links NEVER magnetic.
- Every sub-page's primary CTA must be the single dominant magnetic control
  (POLISH_BRIEF T4/T6); the lateral nav link demotes to a secondary text link.
- Disabled on touch/coarse/reduced-motion (native cursor returns). Keep exactly.

### 4.2 Link reveals (the underline grammar)
- Body/nav links: a hairline `--signal` underline draws on hover, sweeping from LEFT
  (`EASE.out`). The two CTAs sweep from CENTER (the primary signature). `.signal-word`
  draws its underline on scroll reveal (`.is-lit`) and pulses the ridge. Do not add a
  third underline direction. Confirm every sub-page link uses this, not a bare
  color change.

### 4.3 Cursor states (exists in cursor.js, must be identical everywhere)
- `is-hover` (ring brightens, optional `data-cursor` caption), `is-cta` (ring turns
  signal, blend normal), `is-canvas` (ring dims over the manifold), `is-text` (native
  I-beam), `is-down` (press tick), velocity squash. The pinned-caption whisper during
  a tentpole (`#system.is-pinned[data-cursor-pinned]`) MUST be wired on every page's
  pin (it already is on /performance `#gpin` and /progress `#roadmapPin` via
  `data-cursor-pinned`; add it to the new /systems pin). One quiet caption per pinned
  region, never an affordance.

### 4.4 Number counters + text develops (the data-house tell)
- Counters: `[data-count]` count up on enter (`EASE.out`, 1.6s, tabular mono). Every
  big numeral on every page that represents a true fact should count, never just
  appear. Reserved/null values NEVER count (they stay the placeholder glyph).
- Mono type-in: `.type-mono` writes data lines left to right with a signal caret that
  relaxes to rest. Use for status lines, the trial count / baseline params
  (POLISH_BRIEF T3), the as-of date (T9). This is the terminal-readout texture that
  sells "quant instrument" and it must appear on the sub-pages, not just the landing.
- Per-character head clip-rise with variable-weight develop is the SIGNATURE reveal.
  Every hero and chapter head on every page opts in via `[data-chars]`. A sub-page
  head that uses a plain fade has failed the consistency bar.

### 4.5 Hover/press feedback on rows (the ledger idiom)
- Staggered ledger rows (pillars, tenets, gauntlet rows, roadmap rows, factor families,
  phases) lift their border `--grey-850 -> --grey-825` and wash a faint `--grey-900`
  gradient on hover (`EASE.out`). Identical on every page. This is the workhorse dense-
  data interaction and it must feel the same in all four.

### 4.6 Focus states (accessibility is part of the premium)
- `:focus-visible`: 1px `--signal` ring, 4px offset, on every interactive element.
  Pins never trap focus. The skip link is the first focusable element on every page.
  Keyboard users get a non-pointer path to every scene affordance (the pipeline spine
  nodes, the phase toggles, the rail items are all real anchors/buttons). This is not
  optional polish; it is the prestige bar.

---

## 5. PER-PAGE CHOREOGRAPHY (so all four feel equally extraordinary)

A compact, builder-facing per-page checklist. Each page must be able to tick EVERY
row, or it is quieter than its siblings. "Has" = ships today; "Add/Elevate" = this
plan's work.

### Landing (the reference)
- Tentpole: The System pin, gather to 1.0, one flare. (Has. Keep.)
- Scene continuity: WRITE the arc/converge state on unload for sub-pages to read. (Add.)
- Cursor-ridge reactivity, fog/ridge breath. (Add, shared.)
- Hero exit pull-back coupled to scene lead. (Elevate.)
- Every head clip-rise, seam draws, mono type-in, counters, parallax, skew. (Has.)
- One broken-grid asymmetry (flagship intro / pillars). (Has.)

### /systems (forming)
- Tentpole: NEW Chain-of-custody pin, lattice tightens to MID converge (~0.55), one
  flare on the paper-loop lock. (Add.)
- Scene: enterFrom the landing's plan-view pose; band `[0.22, 0.62]`. (Elevate.)
- Pipeline spine + drawing connector between lit nodes. (Elevate.)
- Every `.sys-chapter__head` clip-rise; seam draw at each void/ink boundary; ledgers
  stagger + hover wash; drawdown-ladder fill (bespoke gesture). (Has/confirm.)
- Pinned-caption whisper on the new pin. (Add.)
- One broken-grid asymmetry. (Confirm one, not more.)

### /performance (resolved)
- Tentpole: gauntlet pin, gather to 1.0, ONE restrained flare. (Has. Keep restrained.)
- Scene: band `[0.7, 1.0]`, close dead-on the spine; camera stills on the standing
  close. (Elevate.)
- Reserved Results slot powered-on idle waveform (the page's alive beat). (Has. Keep
  honestly empty; combine the two reserved frames so it runs once.)
- Standing close: held `display-quote`, slow word reveal, scene settles still. (Elevate.)
- Trial count / baseline params / as-of date as mono type-in (true facts, no result).
  (Add per POLISH_BRIEF T3/T9.)
- Every head clip-rise, seam draws, counters on true facts, ledger hover. (Confirm.)
- One broken-grid asymmetry. (Confirm.)

### /progress (released)
- Tentpole: roadmap pin, release converge `1 -> 0`, fan into distinct dimmer lanes,
  ONE restrained flare on AlphaForge lock. (Has. Keep restrained, keep future lanes
  unlit = honest.)
- Scene: band `[0.0, 0.4]`, pull back; enterFrom continuity. (Elevate.)
- Phase explorer: transform/opacity reveal on open, keyboard-operable, default-open
  no-JS. (Elevate to avoid layout thrash.)
- Edge-status candor matches /performance standing voice. (Confirm.)
- Every head clip-rise, seam draws, counters, ledger hover, pinned-caption whisper.
  (Confirm.)
- One broken-grid asymmetry. (Confirm.)

---

## 6. PERFORMANCE + SAFETY BUDGET (the immersion must never cost the 60fps or the honesty)

Every builder holds to this, or the upgrade is a regression:

- **Bundle:** the three bundle is ~526KB. Do NOT add geometry, textures, or a second
  scene. All scene upgrades in Section 2 are uniform writes + one distance check +
  one optional `enterFrom` seed. No new draw calls of consequence. No new npm deps.
- **60fps:** transform/opacity/filter only. No animating layout (width/height/top/
  margin). The phase-explorer open (3.3/5) must animate transform/opacity, not raw
  height. The watchdog still sheds quality before frames drop; never override it.
- **Lazy + paused:** scene stays dynamic-imported, IntersectionObserver-paused
  offscreen, tab-hidden-paused. The idle waveform pauses offscreen. New reactivity
  (cursor-ridge, breath) runs only inside the live frame loop, so it is already paused
  when the loop stops.
- **No per-frame allocation:** reuse vectors/objects. The cursor-trail lag point is a
  single reused scalar pair, not a new array per frame.
- **Reduced-motion:** every signature moment degrades to the composed static poster
  (Section 2.5). Pins become vertical lists. Lenis off, native scroll. Cursor native.
  No content is EVER gated behind motion; the `.js` gate + 6s failsafe stay.
- **No-WebGL:** the `.scene-fallback` poster reads as the same world. Every scene call
  is guarded (`enterFrom`, `setConverge`, `flareBloom`, `pulseRidge`) so a null scene
  is a silent no-op on every page.
- **Honesty:** no fabricated value, tick, curve, or knee, ever. The reserved Results
  slot stays honestly empty (gated to `STATUS === "live"` AND non-empty arrays). The
  bloom is never celebratory on /performance or /progress (the result is "not yet").
  The hero says "tested for a positive edge," not "earns" one. Do not soften the
  deep-page candor to chase immersion.
- **Em dashes:** zero, in source AND dist. After every change:
  `cd /Users/arhancanli/meridian && npm run build` (green) and
  `grep -rPn "\x{2014}" .` (empty).

---

## 7. CONVERGENCE CHECKLIST FOR THE FOUR BUILDERS (who owns what, so they do not collide)

The work parallelizes cleanly into four lanes that share the scene contract but touch
different files. The scene API additions (Section 2.1/2.3) are ONE shared change that
must land first; the rest is per-page and independent.

- **Builder 0 (Scene, lands first):** `scene.js` + `shaders.js`. Add `enterFrom`,
  cursor-ridge reactivity + decaying field wake, fog/ridge breath, confirm the shared
  convergence response is untouched per page. Add `sessionStorage` continuity write/
  read. Tune each page's static `sceneStill` poster. Keep the bundle flat, keep the
  watchdog. Expose new methods additively and guard nothing else changes.
- **Builder 1 (Landing):** `index.html`, `scroll.js`, landing CSS. Elevate the hero
  exit to couple with the scene lead; write the continuity state on unload; confirm
  every connective beat is the reference density. Owns the System pin (keep as gold
  standard).
- **Builder 2 (/systems):** `systems.html`, `systems-page.js`, `css/systems.css`. Build
  the NEW Chain-of-custody pin (mid converge, one flare), the connector draw on the
  pipeline spine, the pinned-caption whisper, confirm head clip-rise + seam draws on
  every chapter. One asymmetry.
- **Builder 3 (/performance + /progress):** `performance.html`/`progress.html`,
  `performance.js`/`progress.js`, their CSS. Keep the gauntlet + roadmap pins
  restrained; elevate the standing close stillness; the fan-out lanes; the phase
  explorer transform reveal; the mono type-in of true facts; confirm parity of every
  connective beat with the landing.

After each lane lands: build green, em-dash audit empty, and a side-by-side check that
the page entered feels continuous with the page left (no hard scene cut), and that no
sub-page is quieter than the landing on any row of the Section 5 checklist.

---

## 8. THE BAR, RESTATED

Done is when: a visitor scrolls the landing and the wordmark dissolves into a field
that gathers onto one signal as five steps resolve; they click Systems and the camera
arrives, the engine assembles stage by stage as the lattice tightens; they click
Performance and the camera is already close on the resolved spine, the verdict lands
honest and the instrument waits, powered on; they click Progress and the camera pulls
back as the one proven signal fans into a fleet of futures. Four chapters, one flight,
one hand. The cursor is answered. Nothing is fabricated. It runs at 60fps, degrades to
a poster, and there is not one em dash in sight.

That is 10000x more immersive, and still a sovereign fund.
