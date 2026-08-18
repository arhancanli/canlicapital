# MERIDIAN / LANDING10 CHARTS

The binding spec for the new data-viz module: **`js/charts.js`** + **`css/charts.css`**.
Written by the DATA-VIZ DIRECTOR for the LANDING10 arc (bring the landing to a true
10/10, build the graphs/visuals the owner asked for).

This document is the contract the chart builder implements against. It extends
`docs/DESIGN_SYSTEM.md`, `docs/IMMERSION_VISION.md`, and the existing data contract
`js/performance_data.js`. It does NOT fork any of them. Every guardrail in those
documents still binds and wins on any conflict:

- ZERO em dashes (U+2014) in source or built output. Grep-audited:
  `grep -rPn "\x{2014}" js/charts.js css/charts.css` must return nothing.
- ONE signal hue (`--signal` #C8553D). No second color, ever. No multi-hue gradient.
- HONESTY is the aesthetic. NO fabricated numbers. The chart shows an honest empty
  state ("backtest in progress") until a validated artifact exists. The empty frame
  IS the design.
- 60fps, GPU-light, no bundle bloat. Charts animate `transform` / `opacity` /
  `stroke-dashoffset` ONLY (never layout: width/height/top/left/margin). SVG preferred.
- Reduced-motion = a composed static frame (the final state, no animation). No-WebGL
  is irrelevant to charts (they are 2D DOM, not the manifold), but the SAME visual
  language (void ground, one signal line) is mandatory so they read as one world.
- Accessible: every chart carries `<title>` + `<desc>` and a visually-hidden table
  fallback so the data (or the honest "pending" status) is available to assistive tech.

The build stays green at every step: `cd /Users/arhancanli/meridian && npm run build`.

---

## 0. WHY THIS MODULE EXISTS (and what it must NOT become)

The landing's `#equity-slot` (the `.proof__curve` block in `index.html`) and the
`/performance` results/capacity frames currently render bespoke empty states (a CSS
axis grid on the landing; a canvas `drawCurve` + a canvas idle waveform on
`/performance`). They are good, but they are two separate implementations of the same
idea. The owner wants ONE reusable, honest, beautiful data-viz module so:

1. The landing `#equity-slot` mounts a real chart component in its honest-pending
   state NOW, brought to full motion parity with the richly-choreographed older
   sections (it must feel "powered on", then draw its line when real data lands).
2. `/performance` can ADOPT the same components next, retiring its bespoke canvas
   `drawCurve` / idle-waveform with zero redesign, reading the SAME data contract.

What this module must NOT become:
- It is NOT a charting library. Three components, one data contract, one mount API.
  No axes-config DSL, no legend engine, no tooltip framework, no zoom/pan. Restraint.
- It does NOT invent numbers, sample curves, fake knee points, or placeholder Sharpes.
  The empty state is first-class and load-bearing, not a fallback for a missing line.
- It does NOT bloat the three bundle. It imports `gsap` + `gsap/ScrollTrigger` ONLY
  (the same bundled singletons every other module uses; Vite dedupes them). It does
  NOT import any licensed GSAP plugin (see Section 7: DrawSVG is a trial build in
  `node_modules`, forbidden; we animate native `stroke-dashoffset` instead).
- It does NOT own a persistent rAF loop. All draw-in motion is GSAP timelines fired
  ONCE on scroll-enter (or the page's existing pin), self-cleaning. No fourth loop
  (IMMERSION_PERF section 1). The honest empty state is STATIC by design (a faint
  baseline + a single soft signal node), not an animated idle, so there is nothing to
  tick when pending. This is simpler and cheaper than the current `/performance` idle
  waveform, and just as honest: a powered-on instrument at rest, no fabricated motion.

---

## 1. THE THREE COMPONENTS

All three render the SAME visual language: a void-transparent ground (the page
shows through), faint `--grey-850` axis lines, one `--signal` data stroke at 1.5px,
mono labels only where a label is true. Each is a single `<svg>` in a `viewBox`
coordinate space (default `0 0 1000 420`, `preserveAspectRatio="none"` is NOT used;
we keep `xMidYMid meet` so strokes stay crisp and we scale the geometry in JS, see
Section 4.4). Each component is a pure function of `(el, data)`; calling it twice on
the same `el` clears and re-renders (idempotent, resize-safe).

### 1.1 Equity curve  (`mountEquityCurve`)

The hero component. The out-of-sample equity curve of a validated strategy.

- **Pending state (the default today):** a faint `--grey-850` baseline and left axis
  (the plot frame), a single soft `--signal` node centered on the baseline, and the
  honest caption ("backtest in progress"). NO line, NO rise, NO ticks, NO numbers.
  A flat baseline cannot be misread as a rising equity curve. The node is the one
  "powered-on" tell: the instrument is live and waiting, not broken.
- **Live state (when the artifact lands):** the real equity polyline draws in via
  GSAP `stroke-dashoffset` (left to right, `EASE.out`, ~1.5s), the final equity node
  lands at the right end with a brief signal pulse, and (optional) a drawdown shade
  fills under the curve below its running peak. The axis frame stays; the pending
  node and caption are removed.
- **Optional drawdown shading:** a `--signal-faint` fill between the curve and its
  running-maximum envelope, so the reader SEES the underwater periods. Off unless the
  data declares `drawdown: true` (Section 3). It fades in (opacity) AFTER the line
  finishes drawing, never competing with the draw.

### 1.2 Capacity curve  (`mountCapacityCurve`)

The relationship between deployed capital and net-of-cost expected edge: the point
past which more size erodes the edge through market impact and funding. **Log x axis.**

- **Pending state:** the same honest empty frame (faint baseline + left axis + one
  signal node), with the capacity-specific caption. The x axis carries faint, UNLABELED
  log-decade gridlines (vertical hairlines at each power of ten across the range) so
  the frame reads as a capacity plot specifically, but with NO knee point and NO
  numbers drawn, so it cannot be misread as a fabricated capacity result.
- **Live state:** `sr_ann` (annualized Sharpe, y) vs `capital` (notional USD, log x)
  draws in left to right via `stroke-dashoffset`. The knee (the capital at which the
  curve has fallen a set fraction from its plateau) MAY be marked with a single
  `--signal` node + a mono label of the capital figure, ONLY if `data` provides an
  explicit `knee` point (we never compute and assert a knee the artifact did not state).
- **Log x:** the x scale is `log10(capital)`. Decade gridlines at each integer power
  of ten within `[min, max]`. y is linear in `sr_ann`. See Section 4.3 for the scale.

### 1.3 Gauntlet / DSR-PBO visual  (`mountGauntlet`)

A small, honest verdict visual for the validation gauntlet. It is NOT a curve. It is a
compact strip of the six gauntlet measures (the rows already in
`performance_data.js` `GAUNTLET`), each rendered as a labeled track with a verdict
marker. It is the "did it clear the bar" picture in one glance.

- **Pending state (today):** six tracks, each a faint `--grey-850` rail with the
  measure label (mono) and its gate description, and a hollow `--signal` marker
  sitting at the gate threshold position. NO value is placed, because no value exists.
  The reader sees the SHAPE of the test (six measures, each with a bar to clear) before
  any result, which demonstrates rigor instead of claiming it.
- **Live state:** each track fills a `--signal` segment to the measured position and
  drops a solid marker; a `chip` reads "Clears" / "Holds" exactly as
  `performance.js renderGauntlet` already labels the tri-state (reuse that vocabulary,
  do not invent new verdict words). The DSR and PBO rows are the emphasis (they are the
  deflation story), so their tracks may render slightly taller. The "Holds" (not-yet)
  verdict is rendered as honestly and as calmly as "Clears"; no red-vs-green theatre,
  one hue, restraint. This is the honest result framed as rigor (DESIGN_SYSTEM section 8).
- This component is OPTIONAL on the landing (the landing already has the `.statband`
  and the honest `#equity-slot`; a second pending visual could crowd the proof
  chapter). It is specified here so `/performance` adopts it, and so a single later
  decision can drop it into the landing's proof chapter if the director wants the
  "shape of the gauntlet" picture on the landing too. Build it; mount it on
  `/performance` first, behind the same data contract.

---

## 2. THE PUBLIC MOUNT API

`js/charts.js` exports three mount functions plus one shared status helper. Each is a
thin, guarded, idempotent function. NONE of them throws on bad input: a missing `el`,
a `null` data, or a malformed series renders the honest empty state and returns a
handle whose methods are safe no-ops. (The same defensive contract as
`scene.js` guards and `landing.js`: a chart enrichment can never break the page.)

```js
// js/charts.js  (ES module, imports gsap + gsap/ScrollTrigger only)

/**
 * Mount the equity-curve component into `el`.
 * @param {HTMLElement} el   the mount host (e.g. #equity-slot on the landing).
 * @param {object} data      an EquityData object (Section 3). May be the pending
 *                           shell; the component renders the honest empty state then.
 * @param {object} [opts]    { reducedMotion?: boolean, drawOnView?: boolean,
 *                             label?: string, ariaLabel?: string }
 * @returns {ChartHandle}    { draw(), update(data), resize(), destroy(), el }
 */
export function mountEquityCurve(el, data, opts) { /* ... */ }

/** Same shape, capacity semantics (log x, sr_ann vs capital). */
export function mountCapacityCurve(el, data, opts) { /* ... */ }

/** Same shape, gauntlet strip (six measures, verdict markers). */
export function mountGauntlet(el, data, opts) { /* ... */ }

/**
 * The one branch every component reads. Returns true ONLY when the contract is
 * genuinely live AND the series it needs is present and non-trivial. Anything else
 * (status !== "live", empty array, < 2 points) returns false so the empty state shows.
 * Mirrors performance_data.js isLive() but also validates the payload, so a half
 * filled artifact can never render a fabricated-looking line.
 */
export function isChartLive(data) { /* ... */ }
```

### 2.1 The `ChartHandle`

```
{
  draw()          // run the draw-in (live) or compose the static empty frame.
                  // Idempotent; safe to call once on scroll-enter. Under reduced
                  // motion it sets the final state with no tween.
  update(data)    // re-bind new data and re-render (the wire-in path: when the real
                  // artifact is dropped into performance_data.js, the page calls
                  // update(liveData) and the component transitions pending -> drawn).
  resize()        // re-measure and re-render at the new size (debounced by caller).
  destroy()       // remove listeners / kill any GSAP tweens / ScrollTriggers it owns.
  el              // the mount host, for the caller.
}
```

### 2.2 How `draw-on-view` is wired (no new loop, no new pin)

`opts.drawOnView` (default `true`) makes the component create ONE `ScrollTrigger`
(`start: "top 82%"`, `once: true`) that calls `draw()` when the chart scrolls into
view. This reuses the shared `ScrollTrigger` singleton (no new timeline cost) and
matches the page's reveal trigger lines (IMMERSION_VISION section 1: "top 82%" for
words). On `/performance`, the caller can instead pass `drawOnView: false` and call
`handle.draw()` from inside the existing gauntlet pin's resolution, so the equity
curve draws AS the pin resolves onto the one ridge (the curve drawing in becomes the
visual payoff of the convergence). The component supports both; it never creates a
pin of its own (one pin per page is a design law).

Under `prefers-reduced-motion`, `drawOnView` still fires `draw()` once on enter, but
`draw()` composes the final state instantly (no `stroke-dashoffset` tween), so the
reader gets the full picture with no motion.

---

## 3. THE DATA CONTRACT (what each component reads)

The components read the existing module **`js/performance_data.js`** (the single
source of truth already in the tree). NO new fabricated module is created. The
landing imports the SAME `EQUITY_CURVE`, `CAPACITY_CURVE`, `GAUNTLET`, `STATUS`,
`PROVENANCE`, and `RESERVED_COPY` exports that `/performance` already consumes, so the
landing and `/performance` can NEVER disagree about whether a result exists.

The chart components accept a normalized `data` object the caller builds from those
exports. Define a tiny adapter in `charts.js` (`fromPerformanceData(kind)`) that reads
the live exports and returns the right shape, so callers do not duplicate the mapping:

```js
// EquityData (consumed by mountEquityCurve)
{
  status: "reserved" | "live",     // mirrors performance_data STATUS; "live" only when real
  points: [ { t: number, v: number }, ... ],  // t = x (0..1 or epoch ms), v = equity. [] while reserved.
  drawdown: boolean,               // draw the underwater shade when live (default false)
  caption: string,                 // honest pending caption (from RESERVED_COPY)
  provenance: { artifact, asOf, universe, sampleSpan } | null,  // source line when live
}

// CapacityData (consumed by mountCapacityCurve)
{
  status: "reserved" | "live",
  points: [ { capital: number, sr_ann: number }, ... ],  // log x = capital, y = sr_ann. [] while reserved.
  knee: { capital: number, sr_ann: number } | null,      // ONLY if the artifact states it. Never computed-and-asserted.
  caption: string,
  provenance: { ... } | null,
}

// GauntletData (consumed by mountGauntlet)
{
  status: "reserved" | "live",
  measures: [ { key, label, gate, value: number|string|null, passed: true|false|null }, ... ],
  // value/passed are null while reserved (exactly performance_data.js GAUNTLET).
  emphasis: ["dsr", "pbo"],        // which rows render taller (the deflation story)
  caption: string,
}
```

Mapping from the existing exports (the adapter does this; no number is invented):

| Chart field | Source in `performance_data.js` |
|---|---|
| `EquityData.status` | `STATUS` (treated as "reserved" unless exactly `"live"`) |
| `EquityData.points` | `EQUITY_CURVE` (empty array while reserved) |
| `EquityData.caption` | `RESERVED_COPY.slotCaption` / the landing's own pending caption |
| `EquityData.provenance` | `PROVENANCE` (all null while reserved) |
| `CapacityData.points` | `CAPACITY_CURVE` (empty while reserved) |
| `CapacityData.caption` | `RESERVED_COPY.capacityNote` |
| `GauntletData.measures` | `GAUNTLET` (labels/gates real; value/passed null while reserved) |

**The status field is load-bearing.** `performance_data.js STATUS` is `"reserved"`
today (its header documents this is intentional and that no number may be filled
without a real artifact). `isChartLive(data)` returns false while reserved, so EVERY
component renders the honest empty state. When the grand backtest finishes, the
operator populates `performance_data.js` (sets `STATUS = "live"`, fills the arrays and
`PROVENANCE`) exactly as that file's header already instructs, and BOTH the landing
slot and `/performance` light up with the real curve through the same `update(data)`
path. The chart module needs NO edit to go live. That is the whole point.

---

## 4. RENDERING (cheap, SVG, transform/opacity/stroke-dashoffset only)

### 4.1 Why SVG (not canvas)

SVG is preferred per the brief. It gives us: crisp 1px hairlines at any DPR with no
manual `devicePixelRatio` juggling; native `<title>`/`<desc>` a11y; `stroke-dashoffset`
draw-in that is a pure compositor-friendly property GSAP tweens with no plugin; and a
real DOM the table-fallback can sit beside. The existing `/performance` canvas
`drawCurve` is retired by `update()` adopting these components (the canvas elements can
stay in the markup but go unused, or the markup is simplified when `/performance`
adopts; that is the adopting agent's call, out of scope here). Charts are small static
SVGs; there is no per-frame canvas redraw, so SVG is also the cheaper choice at rest.

### 4.2 The draw-in (the signature motion, native, no plugin)

The polyline is a single `<path>` (or `<polyline>`). To draw it in:

1. On build, compute the path's length with `path.getTotalLength()`.
2. Set `stroke-dasharray = length; stroke-dashoffset = length;` (the line is fully
   hidden, drawn as one dash the length of the whole path, offset entirely off-end).
3. GSAP tweens `stroke-dashoffset` from `length` to `0` over ~1.5s `EASE.out`. The
   line appears to draw from start to end. This is a normal numeric property tween; it
   needs NO DrawSVGPlugin (see Section 7).
4. On completion, the final equity node (a small `<circle>`) scales in (`transform`)
   with a one-shot signal pulse, and the optional drawdown shade fades in (opacity).

`stroke-dashoffset` is GPU-cheap and never triggers layout. The node pulse animates
`transform: scale` + `opacity` only. NOTHING here animates a layout property.

### 4.3 Scales

- **Equity:** x linear over `[min t, max t]`, y linear over `[min v, max v]` with a
  6% horizontal and 12% vertical inset (matches the existing `drawCurve` padding so
  the framing reads identically when `/performance` adopts). Map into the SVG viewBox.
- **Capacity:** x = `log10(capital)` linear-mapped over `[log10(min), log10(max)]`;
  y linear over `[min sr_ann, max sr_ann]`. Decade gridlines (`--grey-900`, 1px) at
  each integer power of ten inside the range. No tick LABELS in the pending state.
- **Gauntlet:** no continuous scale; six fixed-height tracks stacked, each a 0..1
  track where the gate marker sits at a normalized gate position and (live) the value
  marker sits at the measured position. Positions come from the artifact only.

All scale math lives in small pure helpers (`scaleLinear`, `scaleLog`, `buildPath`)
with NO allocation in any animation callback (the path string is built once per
render, not per frame).

### 4.4 Sizing + resize

The SVG fills its host (`width: 100%`, a CSS `aspect-ratio` or an explicit host
min-height holds the box; see `css/charts.css`). Geometry is computed in viewBox units
(`0 0 1000 420`), so a pure CSS resize needs NO re-render. A `resize()` is only needed
if the host's aspect ratio changes the inset math; callers debounce it (180ms, matching
the existing modules) and it is a no-op-cheap re-render (rebuild the path string, no
tween). No `ResizeObserver` loop; the caller drives `resize()` on `window` resize.

### 4.5 The honest empty frame (the default, static)

Pending render = the axis frame (`--grey-850` baseline + left axis) + (capacity only)
faint log-decade gridlines + a single `--signal` node centered on the baseline + the
caption text (rendered in the SURROUNDING DOM, not inside the SVG, so the landing's
existing `.proof__curve-label` / `.proof__curve-caption` styling is reused). The node
gets ONE gentle scale-in on enter (`transform` + `opacity`, ~0.6s `EASE.out`) so the
slot reads as "powered on", then it is still. There is NO persistent animation in the
pending state. This is the entire honest idle: a frame, an axis, one live node, true
words. No fabricated line, no fake trend, no ticks.

---

## 5. MOUNTING INTO THE LANDING `#equity-slot` (the deliverable today)

The landing's proof chapter already has the slot:

```html
<div class="proof__curve" id="equity-slot" aria-label="Live research, backtest in progress">
  <span class="proof__curve-grid" aria-hidden="true"></span>
  <span class="proof__curve-label mono-label">[ live research, backtest in progress ]</span>
  <span class="proof__curve-caption mono-label"> ... </span>
  <a href="/performance" class="bridge__link label proof__curve-link" ...>See the methodology ...</a>
</div>
```

The chart builder mounts the equity component into this slot from `js/landing.js`
(landing owns its own files; `charts.js` is imported there). The mount must PRESERVE
the existing honest copy and the methodology link; it inserts the SVG as the visual
ground BEHIND the label/caption (the existing `.proof__curve-grid` CSS gridlines can
stay as the faint backdrop, or the component's own axis frame replaces them, the
builder picks one so there is a single grid, not two). Concretely:

```js
// in js/landing.js boot(), additive and guarded:
import { mountEquityCurve, fromPerformanceData } from "./charts.js";

function initEquitySlot() {
  const slot = document.getElementById("equity-slot");
  if (!slot) return;
  // read the SAME contract /performance reads; reserved today => honest empty state.
  const data = fromPerformanceData("equity");
  const chart = mountEquityCurve(slot, data, {
    drawOnView: true,                 // draw-in on scroll-enter (one ScrollTrigger)
    ariaLabel: "AlphaForge out-of-sample equity, backtest in progress",
  });
  // when the real artifact is later wired into performance_data.js, this same
  // call renders the drawn curve with no code change here. Nothing else to do.
}
```

Honest-pending today means: `STATUS === "reserved"` -> `isChartLive` false -> the
component renders the powered-on empty frame (faint axis, one signal node, the one
gentle node scale-in on enter) UNDER the existing `[ live research, backtest in
progress ]` label and caption. No line is drawn. No number appears. The slot now feels
"powered on then waiting", at full motion parity with the older sections, and it
becomes the real drawn curve automatically when the backtest lands.

The landing keeps its ONE cinematic beat (the System pin's `flareBloom`); the equity
draw-in is an `EASE.out` reveal, NOT a second cinematic beat and NOT a second pin. The
optional ridge pulse when the curve finishes drawing reuses the existing guarded
`scene.pulseRidge()` (one pulse), consistent with `landing.js`'s bridge/waitlist beats.

---

## 6. ACCESSIBILITY + REDUCED MOTION

Every component, both states:

1. **SVG semantics:** the `<svg>` has `role="img"` and `aria-labelledby` pointing at
   an inner `<title>` and `<desc>`. Pending: title "Out-of-sample equity curve",
   desc "Backtest in progress. No result is shown until it clears the validation
   gauntlet." Live: desc states the headline figure and provenance from the artifact.
   Em-dash-free, sourced only from real data.
2. **Table fallback:** a visually-hidden (`.visually-hidden`) `<table>` (or a `<dl>`)
   sibling carries the same information non-visually. Pending: one row stating the
   status is "backtest in progress, no data yet". Live: the points (down-sampled to a
   readable number of rows) or the gauntlet measures with their gates and verdicts.
   This is the data path for screen readers and for a no-CSS/print render.
3. **Reduced motion:** `draw()` detects `prefers-reduced-motion: reduce` and sets the
   FINAL state with no tween (live: the full curve already drawn; pending: the static
   frame, node already in place, no scale-in). Nothing animates. The reader gets the
   composed poster, exactly as DESIGN_SYSTEM section 7 requires.
4. **Color is never the only signal:** the gauntlet verdict uses the `chip` TEXT
   ("Clears" / "Holds"), not color alone, so a "not yet" result is legible without
   relying on hue (and we keep one hue regardless).
5. **Focus / pointer:** charts are non-interactive (read-outs, not controls), so they
   take no tab stop and add no cursor state; the methodology link beside the landing
   slot keeps its existing `data-cursor` affordance. No pointer trap, no magnetism.

---

## 7. HARD CONSTRAINTS FOR THE BUILDER (regression = FAIL)

- **No licensed GSAP plugin.** `node_modules/gsap/DrawSVGPlugin.js` carries a TRIAL
  marker and is NOT licensed for production. Do NOT import it (or MotionPath,
  CustomEase, etc.). Animate native `stroke-dashoffset` as a plain numeric tween.
  Import ONLY `gsap` and `gsap/ScrollTrigger`, the same bundled singletons every other
  module uses. This keeps the bundle from growing and stays license-clean.
- **Own only the new files.** `js/charts.js` + `css/charts.css` are new. The landing
  mount lives in `js/landing.js` (a landing-owned file). Do NOT edit the sub-pages,
  `scene.js` / `shaders.js`, `shell.js`, `cursor.js`, or `scroll.js`. Drive the scene
  only through its public API (`pulseRidge`, guarded), never its internals.
- **Reuse, do not fork, the contract.** Read `performance_data.js`. Do not create a
  second data file. Do not duplicate the `STATUS`/`isLive` logic beyond the thin
  `isChartLive` payload-validation wrapper.
- **Tokens only.** Every color is a CSS variable (`--signal`, `--signal-faint`,
  `--grey-850`, `--grey-900`, `--paper-dim`, `--grey-700`). Every ease is `EASE.out` /
  `EASE.settle` (mirrored from the shared set). Every space is an `--s-*` token. No
  one-off hex, no new cubic-bezier, no new color. `css/charts.css` may only ADD
  classes; it never redefines a token, an ease, a type class, or a shared component.
- **transform / opacity / stroke-dashoffset only.** Never animate width, height, top,
  left, margin, or any layout property. No `box-shadow` animation in a tween path.
- **No persistent loop, no per-frame allocation.** Draw-in is a one-shot GSAP timeline.
  The pending state is static (one enter scale-in, then still). Build the path string
  once per render. The chart never holds a rAF.
- **Honesty.** No sample data, no fabricated curve, no fake knee, no placeholder
  Sharpe, no invented PBO. The empty state is the design. `isChartLive` gates every
  draw of a real line behind a genuinely-live, non-trivial payload.
- **ZERO em dashes.** In code, comments, captions, `<title>`/`<desc>`, and the table
  fallback. Use commas, colons, periods, or "to" for ranges. Grep-audit before done.

---

## 8. `css/charts.css` (what it owns)

A small stylesheet, loaded LAST on any page that mounts a chart (after the shared
sheets and after `landing.css` / `performance.css`), so it only layers on top. It owns:

- `.chart` (the mount wrapper, `position: relative`, fills its host).
- `.chart__svg` (`display: block`, `width: 100%`, `height: 100%`; the geometry is in
  viewBox units so CSS scaling needs no re-render).
- `.chart__axis` / `.chart__grid` (the faint frame, `stroke: var(--grey-850)` /
  `var(--grey-900)`, 1px, non-scaling-stroke).
- `.chart__line` (the data stroke, `stroke: var(--signal)`, 1.5px,
  `vector-effect: non-scaling-stroke`, `fill: none`, `stroke-linejoin: round`).
- `.chart__shade` (the drawdown fill, `fill: var(--signal-faint)`, opacity tweened).
- `.chart__node` (`fill: var(--signal)`; the powered-on pending node and the live
  end node; a `transform-box: fill-box; transform-origin: center` so its scale pulse
  is centered).
- `.chart__caption` reuse: prefer the host page's existing caption classes
  (`.proof__curve-caption` on the landing) rather than authoring a parallel one.
- `.chart__table` = the `.visually-hidden` table fallback (clip-rect off-screen, the
  standard SR-only pattern; if `styles.css` already ships a `.visually-hidden`,
  REUSE it and do not redefine it).
- `@media (prefers-reduced-motion: reduce)`: `transition: none` on chart parts (the
  draw-in is GSAP-driven and `draw()` skips the tween, so this is belt-and-suspenders).

`css/charts.css` adds NO token, NO ease, NO type class, NO new color. It is geometry
and the four reused variables, nothing more.

---

## 9. DEFINITION OF DONE (the chart builder's checklist)

- `js/charts.js` exports `mountEquityCurve`, `mountCapacityCurve`, `mountGauntlet`,
  `isChartLive`, and `fromPerformanceData`, each guarded and idempotent, importing
  only `gsap` + `gsap/ScrollTrigger`.
- The landing `#equity-slot` mounts the equity component (from `js/landing.js`) in its
  honest-pending state: powered-on empty frame, one gentle node scale-in on enter, the
  existing `[ live research, backtest in progress ]` copy and methodology link intact.
  No line, no number, until real data.
- Components read `performance_data.js` via `fromPerformanceData`; setting
  `STATUS = "live"` and filling the arrays there (no chart-code change) renders the
  real drawn curves on BOTH the landing slot and `/performance` through `update()`.
- The equity and capacity lines draw in via native `stroke-dashoffset` (`EASE.out`,
  ~1.5s); the end node pulses once; the optional drawdown shade fades in after.
- Capacity uses a log x axis with decade gridlines and no fabricated knee.
- The gauntlet visual reuses the `GAUNTLET` rows and the "Clears"/"Holds"/"Reserved"
  verdict vocabulary; "not yet" reads as calmly as "clears" (one hue, restraint).
- Every component carries `<title>` + `<desc>` + a `.visually-hidden` table fallback,
  and composes a static final frame under `prefers-reduced-motion`.
- `css/charts.css` only adds classes; uses only existing tokens/eases/space.
- `npm run build` is green; `grep -rPn "\x{2014}" js/charts.js css/charts.css` is empty.

---

This is the data-viz contract. One module, three honest components, one data contract
already in the tree, mounted into the landing slot in its honest-pending state today,
ready for `/performance` to adopt next, and ready to light up the instant the grand
backtest lands a validated artifact. No fabricated numbers, one signal hue, native
stroke-dashoffset, SVG, accessible, reduced-motion composed, build green.
