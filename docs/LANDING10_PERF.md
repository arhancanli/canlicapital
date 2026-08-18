# MERIDIAN / LANDING10 PERFORMANCE BUDGET (the V2 elevation + charts module)

Role: PERF DIRECTOR for the landing 10/10 elevation. This document is the binding
perf budget for THIS specific pass: bringing the new V2 conversion sections
(`.hero__points`, `.hero__proof`, `.offer`, `.proof__curve`/`#equity-slot`,
`.founder`) to full motion parity with the older choreographed sections (the hero
masks, the System pin), AND landing the NEW reusable data-viz module
`js/charts.js` + `css/charts.css` whose equity-curve component mounts into the
landing `#equity-slot` in its HONEST pending state.

It does NOT replace `docs/IMMERSION_PERF.md`. That document is the property-wide
law (the frame budget, the scene/GPU budget, the ScrollTrigger budget, the
forbidden list). This document INHERITS all of it and adds the deltas this
elevation introduces. Where the two ever appear to differ, IMMERSION_PERF wins;
this file only tightens, never loosens.

Derived from the live source audited 2026-06-17, build green (three bundle
526.02 KB raw / 131.54 KB gzip), em-dash audit clean. Files in scope for the
elevation: `index.html`, `js/landing.js`, `css/landing.css`, NEW `js/charts.js`,
NEW `css/charts.css`, and (data only) `js/performance_data.js` as the chart's
data contract. OFF LIMITS: the sub-pages, `js/scene.js` / `js/shaders.js`
internals, `js/shell.js` nav, `js/cursor.js`; `js/scroll.js` only if a
home-guarded surgical hook is unavoidable.

---

## 0. THE ONE-LINE VERDICT

The elevation is affordable at 60fps WITHOUT touching the scene or the bundle,
because every new effect it needs already has a proven, cheap precedent in the
codebase: GSAP transform/opacity reveals (scroll.js), `[data-count]` count-up
(scroll.js), the self-killing `once:true` ScrollTrigger (`revealOnEnter`), the
scene's existing public uniforms (`pulseRidge` / `flareBloom` / `setConverge`),
and a canvas-2D line chart with a shared IO-paused rAF (performance.js
`drawCurve` + `makeIdleWaveform`). The 10/10 lift comes from choreographing
these MORE AMBITIOUSLY on the new sections, not from a new technique class. The
ONLY genuinely new runtime object is the charts module, and it must be built as a
near-clone of the performance.js chart discipline that already ships. Everything
in this document is "spend the existing budget well, add nothing that has no shed
path or no pause path."

---

## 1. THE DELTA FRAME BUDGET (what the elevation is allowed to add)

The steady-state ceiling is unchanged from IMMERSION_PERF section 1: TWO
persistent rAF loops (scene + cursor) plus the GSAP/Lenis ticker. The elevation
adds AT MOST one transient, IntersectionObserver-gated, self-stopping rAF: the
equity-curve draw-in animation. After it completes (or under reduced motion) it
holds ZERO persistent loops. This is the single hardest rule of this pass.

### 1.1 The charts module rAF rule (the one new loop, and its leash)

The equity-curve "draws in" animation MAY use a short rAF, but it MUST obey the
exact leash the performance.js idle waveform already follows:

1. It starts ONLY when `#equity-slot` (or the chart host) crosses an
   IntersectionObserver threshold the first time. Not on load. Not on import.
2. It is a ONE-SHOT draw-in of bounded duration (target ~900 to 1400 ms), then it
   calls `cancelAnimationFrame` and never schedules again. It is NOT a persistent
   ambient loop. (The honest-pending state has NO real curve to animate, so for
   the landing today there is effectively no continuous loop at all; see 1.2.)
3. While it runs it does ZERO per-frame allocation: no `new`, no array/object
   literals, no `.map/.filter/.slice` inside the tick. Build the point geometry
   ONCE before the loop; the tick only advances a scalar progress and re-strokes.
4. It reads layout (clientWidth/clientHeight) ONCE at size(), never inside the
   tick. On resize, debounce a single re-size, do not re-measure per frame.
5. `visibilitychange` stops it; re-entering the tab does not restart a completed
   draw (a finished curve stays drawn; it is not re-animated on every tab focus).
6. If the host is offscreen when it would start, it does not start; the IO is the
   only trigger. If it is offscreen mid-draw, it MAY pause and resume, OR simply
   finish to final state on the next frame; either is acceptable, a stalled
   half-drawn curve is not.

This is byte-for-byte the discipline performance.js `initIdleWaveforms` proves.
Reuse that shape; do not invent a looser one.

### 1.2 The honest-pending state has essentially zero frame cost

The landing mounts the equity component in its HONEST pending state (no real
data: `EQUITY_CURVE` is `[]`, `STATUS` is `"reserved"`). The pending state is a
static composed frame (the grid + the "powered on" idle), not a busy animation.
Two acceptable cost tiers, in order of preference:

- TIER A (preferred for the landing): the pending state is STATIC after a
  one-shot "power-on" reveal (grid fades up, a flat baseline strokes in once via
  a single GSAP/stroke transition, a node ignites). After that one-shot it holds
  NO rAF. This is the cheapest honest "instrument at rest" and is what the
  landing should ship. The slot already has a CSS grid (`.proof__curve-grid`);
  the module's power-on is a few transform/opacity tweens plus one stroke draw.
- TIER B (only if the owner wants a living idle on the landing): a single soft
  traveling pulse on a dead-flat baseline, IDENTICAL in cost and honesty to
  performance.js `makeIdleWaveform` (flat baseline, no rise, no knee, one gaussian
  swell, one node). If used, it MUST share ONE rAF (not a per-chart loop), be
  IO-paused, visibility-stopped, and zero-alloc per frame. A second idle loop on
  the landing while the scene loop is running is the ceiling from IMMERSION_PERF
  section 1; it is tolerated ONLY under that full discipline and ONLY one of them.

Default recommendation: ship TIER A on the landing. It is honest ("powered on,
backtest in progress"), it costs no steady-state frame, and it leaves the entire
frame budget to the scene. Reserve the living idle (Tier B) for /performance,
which already runs exactly that loop today; do not duplicate it onto the landing.

### 1.3 Hard frame rules (restated, binding on the new sections + module)

Identical to IMMERSION_PERF section 1, no exceptions for the new work:

1. Transform / opacity / filter ONLY in any animation. For the chart, ALSO
   `stroke-dashoffset` / `stroke-dasharray` (SVG) or a canvas re-stroke of a
   pre-built path (canvas). NO width/height/top/left/margin/padding, no animated
   `box-shadow`, no animated `background-position`, no animated `background-size`.
2. No per-frame allocation in any loop (see 1.1.3).
3. No layout read inside any rAF or scrub `onUpdate`. Measure at init/resize only.
4. `will-change` is CSS-declared, scoped, and `auto` at rest. See section 5.

---

## 2. THE CHART RENDERING DECISION: SVG vs CANVAS (and the verdict)

Both the equity curve and the capacity/DSR visuals can be drawn either as inline
SVG (`<path>` + `stroke-dashoffset`) or canvas-2D (`getContext("2d")` + a
re-stroked path). This is the single biggest cost decision in the module. The
budget verdict, with the reasoning, so the builder does not have to relitigate it:

### 2.1 Verdict: SVG is the default for the landing equity slot. Canvas is the fallback for high-point-count curves.

| Axis | SVG `<path>` + dashoffset | Canvas 2D re-stroke |
|---|---|---|
| Draw-in animation | `stroke-dashoffset` is a COMPOSITOR-friendly, single-property animation. GSAP can tween it; the browser strokes one path. No rAF strictly required (GSAP/CSS can own it). Cheapest possible "line draws itself." | Requires a rAF that clears + re-strokes a partial path every frame. More main-thread work, must obey 1.1. |
| Cost at low point count (an equity curve = tens to low hundreds of points) | Negligible. One path element, one animated property. | A full clear + restroke per frame; fine but strictly more work than SVG for the same look. |
| Cost at HIGH point count (thousands of points: a tick-level equity curve, or a dense capacity sweep) | A single `<path>` `d` with thousands of segments is one element but a heavy path; still one paint. Acceptable up to a few thousand points. Beyond that, simplify the data (see 2.3), do not raise segment count. | Canvas wins decisively at thousands of points: no DOM, one draw call, no per-vertex layout/style. |
| Crispness on Retina | Vector, resolution-independent, no DPR juggling. | Must set `canvas.width = cssW * dpr` and `ctx.scale(dpr, dpr)` (performance.js already does this correctly). |
| Reduced-motion static | Trivial: render the final `<path>` with `stroke-dashoffset: 0`, no animation. | Trivial: call the static `frame()` once (performance.js `renderStatic`). |
| Honest-empty state | Trivial: render the grid + a flat baseline path, no curve. | Trivial: the `makeIdleWaveform` flat-baseline frame. |
| Bundle cost | Zero (native SVG). | Zero (native canvas). Neither touches the three bundle. |

### 2.2 The concrete rule for the module

- The landing equity slot ships in the HONEST PENDING state: there is NO real
  curve. So the landing render is the grid + a one-shot power-on + (Tier A) a
  static "instrument at rest." Use SVG or a single static canvas frame; either is
  near-free. SVG is preferred because the SAME element, with `stroke-dashoffset`
  animated to 0, becomes the live draw-in for free when the real data arrives,
  with NO new rAF.
- When the real backtest data wires in (later), the equity curve draws in via
  `stroke-dashoffset` on the SVG path. Point count for an equity curve is small
  (one point per bar aggregated, or a downsampled daily/weekly series), so SVG
  stays cheap. If a future curve is genuinely thousands of points (a dense
  capacity sweep, a per-tick line), the module switches THAT chart to the canvas
  renderer (the `drawCurve` precedent). Expose BOTH renderers behind one API
  (section 3) so the consumer picks per chart without a second module.
- The DSR/PBO/gauntlet visual is NOT a long line: it is a small number of bars or
  a gauge or a scatter of fold dots. That is a handful of SVG elements animated
  on transform/opacity (bars scale up on `scaleY` from a fixed origin; a gauge
  needle rotates; fold dots stagger-fade). SVG, no rAF, GSAP-driven. Cheapest of
  the three. NEVER draw a gauge as an animated arc via per-frame canvas; a CSS
  conic-gradient or an SVG arc with an animated `stroke-dashoffset` is one
  property and far cheaper.

### 2.3 Point-count discipline (the data contract's job, not the renderer's)

A chart's cost scales with point count, in BOTH renderers. The data contract
(`js/performance_data.js` / any JSON the component reads) must hand the component
a SANE point count. The component does NOT draw 50,000 raw bars. Guidance:

- Equity curve: <= ~750 points to the renderer. Downsample (daily/weekly buckets,
  or LTTB) upstream of the component. The eye cannot resolve more on a slot this
  size; more points only cost paint.
- Capacity curve: a curve, tens of points.
- Gauntlet/DSR visual: one element per metric (six rows), or a gauge.

The honest-pending landing renders ZERO data points (empty arrays), so this is a
forward rule for when real data lands; bake the downsample cap into the
component's ingest so a future careless artifact cannot jank the page.

---

## 3. THE CHARTS MODULE API + STRUCTURE (so /performance can adopt it next)

The module is a reusable factory, mirroring the `createScene` / `makeIdleWaveform`
shape already in the codebase. Required properties of the API for perf + adoption:

- A single factory, e.g. `mountEquityCurve(hostEl, { data, status, reducedMotion,
  noWebGL })` returning `{ play, destroy, resize }` (names illustrative; the
  point is the contract, not the spelling). `play` is idempotent (calling twice
  does not start two loops). `destroy` cancels any rAF, disconnects the IO, and
  removes listeners (no leak when /performance later mounts/unmounts on route).
- It reads a DATA CONTRACT, never hardcoded numbers: `status` ("reserved" vs
  "live"), `data` (the point array, empty while reserved). It branches EXACTLY
  like performance.js: anything other than `status === "live"` AND a non-empty
  array renders the honest pending frame. This is a HONESTY guardrail enforced in
  the module, so a half-filled contract can never render a fabricated curve.
- It self-guards `reducedMotion` (compose the final/static frame, no rAF, no
  draw-in) and `noWebGL` is irrelevant to the chart (charts do not use WebGL) but
  the module must still render under `body.no-webgl` because it is independent of
  the scene. A chart that only works when the scene works is a regression.
- It accepts a render mode (`"svg"` default, `"canvas"` for high point count) so
  the same API serves the landing's slot and a future dense /performance curve
  without forking the module.

Perf reason the API matters: a clean `destroy` + idempotent `play` is what keeps
/performance from stacking loops or leaking IOs when it adopts the component on a
client-routed page. Build it leak-clean now.

---

## 4. THE V2 SECTION ANIMATION BUDGET (parity without ScrollTrigger bloat)

The new sections must look as choreographed as the System pin. The cost trap is
authoring a bespoke always-on scrub per bullet/row. DO NOT. Use the self-killing
`once:true` reveal pattern (`revealOnEnter` / the `.reveal-fade`/`.reveal-words`
loops) and staggers, which cost a trigger that DELETES ITSELF on fire. Per-section
direction, with the cost class:

### 4.1 ScrollTrigger budget for the elevation

IMMERSION_PERF section 4: ONE pin per page (the System pin; do not add a second),
and keep ALWAYS-ON scrubs few. The elevation's new triggers must be `once:true`
self-killing reveals, which drop out of the steady-state count the instant they
fire. Concretely:

- The new sections may add reveal triggers freely PROVIDED each is `once:true`
  (self-kills). A stagger of N bullets is ONE trigger with a staggered tween, NOT
  N triggers. Use `gsap.utils.toArray(...).forEach` ONLY to author one tween per
  element where each is independently `once:true`; for a tight group (hero
  points, offer denials, offer rows, statband), prefer ONE trigger on the
  container that fires ONE staggered timeline. Fewer triggers, same look.
- NO new `scrub` trigger for the new sections unless it is genuinely scroll-linked
  cinema. The hero exit scrub and the System/Discipline pins are the page's scrub
  budget. A bullet list does not need a scrub; it needs a stagger on enter.
- BUDGET CEILING for this pass: net new ALWAYS-ON (non-self-killing) triggers = 0.
  Net new pins = 0. The equity slot's draw-in is gated by an IO + a one-shot rAF,
  NOT by a scrub trigger (a scrub would tie a permanent trigger to the slot).
- After the new sections + the chart mount, call `ScrollTrigger.refresh()` ONCE
  (the modules already do on load/post-init). Do not refresh in a loop.

### 4.2 Per-section direction (effect -> cost -> verdict)

- `.hero__points` (the bullets): staggered fade-rise on enter, ONE container
  trigger, `once:true`, transform+opacity. The `::before` signal tick can draw in
  with a `scaleX` on the tween (transform). CHEAP. Approved.
- `.hero__proof` (the facts line: 3.5M+, 94, 24, 2,500+, 2020): count-up via the
  existing `[data-count]` grammar. HONESTY NOTE: these spans currently carry
  literal values as text (`data-fact`), not `[data-count]`. Count-up is only
  honest on TRUE integer facts. "3.5M+" and "2,500+" are approximate display
  strings, NOT clean integers; do NOT fake a rolling odometer that lands on a
  fabricated precise number, and do NOT count "2020" (a year) like a metric. Safe
  approach: count up the clean integers (94 instruments, 24 factors) with
  `[data-count]`; for the "+"-suffixed approximates and the year, use a brief
  mono type-in / fade rather than a numeric roll, so nothing implies a precision
  the value does not have. Transform/opacity + a bounded count tween. CHEAP.
  Approved with the honesty caveat.
- `.offer` head + lead: char clip-rise on the head (it is a display heading: add
  `data-chars` so it joins the `.mask` char-rise loop) + `.reveal-words` on the
  lead. The existing vocabulary, no new device. CHEAP. Approved.
- `.offer__denials` (the "this is not X" chips): staggered reveal, ONE container
  trigger, the signal dot can `scale` in. CHEAP. Approved.
- `.offer__cols` rows (who / what-you-get): the ledger-row idiom, each row
  fade-rises with a staggered delay, the top hairline `border-top` can draw via a
  `scaleX` pseudo-element (transform) NOT by animating border width. ONE trigger
  per column container with a stagger. CHEAP. Approved. WATCH: do not animate the
  `border-top` itself (that is a paint), draw a pseudo-element line via transform.
- `.proof__curve` / `#equity-slot`: the power-on. The grid fades up, the frame
  "energizes" (a one-shot), then the honest baseline/curve renders per section 1
  and 2. Drive the mount from an IO on the slot. The accompanying scene beat is
  ONE `pulseRidge()` (already the landing's idiom via landing.js), optionally ONE
  `flareBloom()` IF the owner wants the slot to feel like the page's data climax,
  but note IMMERSION_PERF reserves the landing's single `flareBloom` for the
  System pin; adding a second flare is a JUDGEMENT call, not a free one. Default:
  `pulseRidge()` only, to respect the one-flare rule. CHEAP. Approved.
- `.founder` reveal + pull-quote: name/role fade-rise, the pull-quote's
  `border-left` signal accent can ignite (color/opacity, the border already
  exists; do not animate its width), the quote does a `.reveal-words` or a left-
  anchored underline-draw on a keyword (the existing `.signal-word`/`.bridge`
  underline idiom, a `scaleX` transform). CHEAP. Approved.

### 4.3 Parallax discipline

IMMERSION_PERF section 4.2: keep `data-parallax` to a SMALL count. The elevation
may add at most a FEW parallax accents (e.g. the founder block or the offer
eyebrow drifting subtly), NOT `data-parallax` on every new row. Each parallax
item is a scrub-linked tween; a handful is fine, dozens are not.

---

## 5. WILL-CHANGE DISCIPLINE (the layer-memory budget)

This is the most common silent regression in a "make it more animated" pass.

1. `will-change` is declared ONLY in CSS, ONLY on elements that actively animate,
   and is effectively `auto` at rest. GSAP auto-adds/removes it for a tween's
   duration; TRUST that for the GSAP-driven reveals. Do NOT add a blanket
   `will-change: transform, opacity` to every new `.offer__list li`,
   `.hero__points li`, etc. Each promoted element is a retained GPU layer; dozens
   of always-promoted small elements is real GPU memory for no benefit.
2. The chart: the animating SVG `<path>` (or the canvas element) MAY carry
   `will-change: transform` or be a single promoted layer DURING the draw-in, but
   the module must NOT leave a permanent `will-change` on the chart at rest. After
   the draw-in completes, drop it (GSAP does this automatically if GSAP owns the
   stroke tween; if a raw rAF owns it, the module clears `el.style.willChange`
   on completion).
3. NO `will-change` on the `.proof__curve-grid` (it is a static masked background;
   promoting it pins a layer for the whole page). NO `will-change` on the founder
   block or the offer container.
4. The hero wordmark already has the ONE expensive filter will-change, correctly
   scoped to the short hero-exit scrub by GSAP. Do not add a second persistent
   filter will-change anywhere in the new sections.

Rule of thumb: count the elements that carry `will-change` at REST after this
pass. The answer must be the same as before the pass (effectively zero promoted
at rest; GSAP transient promotions only). If it is not, you over-promoted.

---

## 6. INTERSECTIONOBSERVER + PAUSING DISCIPLINE

1. The chart's draw-in and any pending-idle are IO-gated on the chart HOST (the
   `#equity-slot`), threshold ~0 with a small negative `rootMargin` so it fires
   as the slot rises into view, exactly like landing.js `initBridgePulse` /
   `initWaitlistArrival`. Unlike the scene's fixed full-screen canvas, the slot is
   an in-flow element, so its IO ACTUALLY fires on scroll (it leaves the viewport),
   which means an idle loop here genuinely pauses offscreen. Good. Use that.
2. The new section reveals use the `once:true` ScrollTrigger (self-disconnecting),
   not an IO, because they are one-shot reveals; that pattern already self-kills.
3. `visibilitychange` stops any chart rAF on tab-hide and does not auto-restart a
   COMPLETED draw on return (a drawn curve stays drawn). Mirror performance.js.
4. The IO callbacks `unobserve` / `disconnect` after firing their one-shot, so the
   observers do not accumulate. landing.js already does this; the chart module
   must too.

---

## 7. REDUCED-MOTION + NO-WEBGL STATIC COMPOSITION (binding)

1. `prefers-reduced-motion: reduce`: the new sections render in their FINAL state
   with NO reveal animation (the `.js` reveals already no-op or set final under
   reduced motion via scroll.js; new CSS for the sections must include a
   `@media (prefers-reduced-motion: reduce)` block that sets transitions to `none`
   and shows final state, exactly as landing.css already does for `.sys-chain` /
   `.bridge` / `.waitlist__label`). The chart composes its STATIC frame: grid +
   honest baseline (pending) or the final `stroke-dashoffset: 0` curve (live), NO
   draw-in, NO idle pulse, NO rAF. This is the composed-poster contract; never
   animate under reduced motion.
2. `body.no-webgl`: the chart is independent of the scene and MUST render and
   compose normally (it is canvas/SVG, not WebGL). Every scene call the new
   sections make (`pulseRidge`, optional `flareBloom`) is guarded
   (`if (s && typeof s.method === 'function')`) so a null scene is a silent no-op,
   exactly as landing.js already guards. A new section's reveal must not depend on
   the scene existing.
3. Mobile: the chart renders (it is cheap), but prefer the STATIC/Tier-A pending
   composition on mobile (no living idle loop competing with anything), matching
   the property's mobile restraint. The new section reveals already degrade via
   the shared mobile gates in scroll.js; do not add mobile-only motion.

---

## 8. CONTRAST / "MORE VISIBLE" WITHOUT A PERF COST

The owner wants the new sections MORE VISIBLE (raise contrast/legibility). This is
a TOKEN + STATIC-STYLE change, NOT a motion change, and it is FREE at runtime:

- Raise resting text from the dimmest greys toward `--paper-dim` / `--paper` on
  the elements the owner reads (the offer rows, the hero proof facts, the founder
  lead) WITHIN the token system. This is a static color value; zero frame cost.
- Do NOT chase "more visible" with animated glows, animated `box-shadow`,
  animated `text-shadow`, or a brightening rAF. Those are paint-per-frame costs
  (IMMERSION_PERF forbidden 8). A brighter RESTING token is free and more legible
  than a pulsing one. Prefer a static contrast lift over any animated brightness.
- The signal accents (ticks, dots, underlines, the pull-quote rule) may use the
  existing `--signal` / `--signal-glow` tokens as STATIC values for a brighter
  read; reserve animated signal-glow for the one-shot reveal moment only, never a
  steady pulse on many elements.

---

## 9. FORBIDDEN FOR THIS ELEVATION (block these; cheaper swap in-line)

Inherits all of IMMERSION_PERF section 6. The elevation-specific additions:

1. A persistent ambient rAF on the landing chart (a forever-pulsing equity idle on
   the landing while the scene loop also runs). -> Two ambient loops + the scene
   is over the ceiling for a conversion page. CHEAPER: ship the Tier-A static
   "powered-on" pending frame on the landing; keep the living idle on /performance
   only.
2. Animating the curve draw-in by re-stroking a full canvas every frame WHEN the
   point count is small. -> Needless main-thread work. CHEAPER: SVG
   `stroke-dashoffset` tween (one compositor property, GSAP/CSS owns it, no rAF).
3. A `scrub` ScrollTrigger tying the curve progress to scroll position. -> A
   permanent trigger pinned to the slot, plus scroll-coupled redraws. CHEAPER: an
   IO one-shot that plays the bounded draw-in once on enter.
4. Count-up / odometer on the approximate "+"-suffixed facts or the year. -> Fakes
   precision the value does not have (a honesty AND a fake-work cost). CHEAPER:
   count only clean integers; fade/type-in the approximates.
5. `will-change` on every new row/bullet, or a permanent `will-change` on the
   chart or the grid. -> Layer-memory bloat (section 5). CHEAPER: GSAP transient
   promotion; nothing promoted at rest.
6. Animating `border-top` / `border-left` width for a "line draws in," or
   animating `height`/`max-height` for the offer rows or any reveal. -> Layout/
   paint per frame. CHEAPER: a pseudo-element line with `transform: scaleX/scaleY`
   from a fixed origin; opacity+translate for the row.
7. A drop-shadow/box-shadow glow animated on the chart node or the slot frame to
   say "powered on." -> Shadow repaint cost. CHEAPER: a static `--signal-glow`
   ring (the `.sys-chain__dot.is-active` precedent uses a static box-shadow, set
   once, not animated) + an opacity fade on a pre-styled element.
8. Any new npm dep for charting (a charting lib, d3, chart.js). -> Bundle bloat;
   the property hand-rolls SVG/canvas. CHEAPER: native `<path>` + `stroke-
   dashoffset`, or the existing `drawCurve` canvas pattern. ZERO new dep.
9. Importing anything from three / adding to the three bundle for the chart. ->
   The chart is 2D; it has no business in the WebGL bundle. CHEAPER: pure DOM.

---

## 10. THE PER-CHANGE GATE (run after every elevation edit)

1. `cd /Users/arhancanli/meridian && npm run build` must be green.
2. `grep -rPn "\x{2014}" .` over source AND dist must be empty (em-dash audit) for
   `index.html`, `js/landing.js`, `js/charts.js`, `css/landing.css`,
   `css/charts.css`, and the dist output.
3. three bundle stays <= ~530 KB raw / ~132 KB gzip (currently 526.02 / 131.54).
   If it grew, the chart pulled in three or a dep crept in: revert it. The chart
   is 2D and must add ZERO to the three bundle.
4. No NEW persistent rAF. The chart's only loop is the bounded, IO-gated,
   visibility-stopped, zero-alloc draw-in (section 1.1), and on the landing the
   default is Tier-A with NO ongoing loop after power-on.
5. No new `pin`. No new always-on `scrub` trigger. New reveals are `once:true`.
6. Count promoted-at-rest elements: same as before the pass (section 5). No
   permanent `will-change`.
7. Reduced-motion spot-check: the new sections compose in final state with no
   animation; the chart composes its static frame (no draw-in, no idle).
8. `body.no-webgl` spot-check: every new scene call no-ops; the chart still
   renders (it is scene-independent); content visible.
9. Honesty spot-check: the landing equity slot shows the honest pending state
   (grid + "backtest in progress"), NO fabricated curve, NO ticks, NO numbers,
   NO knee; the module refuses to draw unless `status === "live"` AND data is
   non-empty.
10. DevTools Performance: a steady scroll through the landing holds 60fps; the
    chart power-on is a single short burst, not a long task > 50 ms; no per-frame
    long tasks after the intro.

---

## 11. SUMMARY FOR THE BUILDERS (the perf contract in one paragraph each)

- CHARTS MODULE (`js/charts.js` / `css/charts.css`): hand-rolled, ZERO new dep,
  ZERO three-bundle impact. SVG `<path>` + `stroke-dashoffset` is the default
  renderer (compositor-friendly draw-in, no rAF needed for the line); a canvas
  re-stroke renderer (the `drawCurve` precedent) is the fallback for high-point-
  count curves. Reads a data contract; renders the honest pending frame unless
  `status === "live"` AND data non-empty. On the landing it ships Tier-A: a
  one-shot power-on then a STATIC honest "instrument at rest", NO ongoing loop.
  Idempotent `play`, leak-clean `destroy` (cancels rAF, disconnects IO) so
  /performance can adopt it. Reduced-motion = static composed frame. Scene-
  independent (renders under no-WebGL).

- V2 SECTION ELEVATION (`index.html` / `js/landing.js` / `css/landing.css`):
  parity via the EXISTING vocabulary choreographed harder. Reveals are `once:true`
  self-killing triggers, one container trigger per group with a STAGGER (not one
  trigger per bullet). Transform/opacity (+ `stroke-dashoffset` for any line, +
  pseudo-element `scaleX/scaleY` for any drawn rule) ONLY. Count-up only on clean
  integers (honesty). Scene beats are guarded `pulseRidge()` (reserve the single
  landing `flareBloom` for the System pin). Net new pins = 0, net new always-on
  scrubs = 0. No permanent `will-change`; nothing promoted at rest. "More visible"
  is a STATIC contrast/token lift, never an animated glow. Reduced-motion and
  no-WebGL compose static.

The engine is fast because all the heavy motion lives in the scene's shaders and
the geometry is static. This elevation keeps that true: it spends only the cheap,
compositor-friendly budget (GSAP transform/opacity reveals, one bounded IO-gated
chart draw-in, static contrast lifts) and adds nothing with no pause path and no
shed path. Restraint remains the performance strategy.
