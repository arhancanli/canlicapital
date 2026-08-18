# LANDING10 / FIRST-IMPRESSION CUSTOMER (DESIGN DIRECTOR) CRIT

Role: first-impression customer, judging ONLY craft. Is the landing now
jaw-dropping, is the motion world-class and CONSISTENT across every section
including the new V2 ones and the charts, is it a true 10/10.

Verdict: PASS_WITH_NOTES, but ONE blocking craft regression keeps it off 10/10.

Scores (1 to 10):
- wow: 7
- motion_craft: 6
- consistency: 5
- overall: 6

The bones are right. The honest equity instrument is tasteful and on-brand, the
hero cascade and count-ups land, the System pin and chain spine are still the
gold standard, the restraint holds, em dashes are clean in source AND dist, the
build is green. But the single signature gesture that was supposed to lift the
new sections to parity, the signal hairline that DRAWS as each line lands, never
plays. It is wired in CSS and described at length in the JS comments, but no code
arms it. So the new sections still read as fade-only next to the choreographed
older ones. That is exactly the gap the owner asked to close, still open.

---

## THE BLOCKING REGRESSION (this is why it is not a 10)

### B1. Every per-line "signal draws as it lands" reward is DEAD across all new sections.

The CSS is built failsafe-first: each draw-in marker rests in its FINAL drawn
state (scaleX/scale/scaleY = 1) and only animates from 0 when its PARENT carries
an `.is-stagger` class. The selectors are explicit:

```
.js .hero__points.is-stagger li::before        { transform: scaleX(0); }
.js .hero__points.is-stagger li.is-in::before  { transform: scaleX(1); }
.js .offer__denials.is-stagger li::before       { transform: scale(0); }
.js .offer__denials.is-stagger li.is-in::before { transform: scale(1); }
.js .offer__cols.is-stagger .offer__col-head::after          { transform: scaleX(0); }
.js .offer__cols.is-stagger .offer__col-head.is-in::after    { transform: scaleX(1); }
.js .offer__list.is-stagger li::before          { transform: scaleX(0); }
.js .offer__list.is-stagger li.is-in::before    { transform: scaleX(1); }
.js .founder__pull.is-stagger::before           { transform: scaleY(0); }
.js .founder__pull.is-stagger.is-in::before     { transform: scaleY(1); }
```

`js/landing.js` adds `.is-in` per item (in `staggerIn`, `initHeroV2`, `initOffer`,
`initFounder`), but it NEVER adds `.is-stagger` to any parent. Verified two ways:

- `grep -n "is-stagger" js/landing.js` and `grep -rn "is-stagger" js/` return
  nothing.
- The built bundle contains no occurrence: no `dist/assets/*.js` matches
  `is-stagger`, while the CSS bundle ships the gated rules.

Consequence: on the hero bullets, the offer denial dots, the offer column-head
seams, the offer list-row seams, AND the founder pull-quote rule, every marker is
painted in its final state from first frame. The `.is-in` toggles the JS fires are
no-ops because the parent gate is absent. The "hairline extends with its line",
the "denial dot ignites as the line lands", the "column seam draws left to right",
the "founder rule writes the quote into the record", none of it happens. The text
still fades/staggers (GSAP opacity/y), so nothing is broken or hidden, but the
distinctive per-line signal choreography, the entire reason this pass exists, is
inert. The code comments promise motion the code does not produce.

This is the difference between "fade-in" and "the same hand that drew the System
pin drew this." Right now the new sections are the former. That is the owner's
complaint, unaddressed.

Fix (small, surgical, ships the intended craft): in `staggerIn`, arm the parent.
When a group is animated for real, add `.is-stagger` to the list/wrapper the
markers hang off, in the SAME tick the items are set to hidden, BEFORE the stagger
runs. Specifically:
- `initHeroV2`: add `points.classList.add("is-stagger")` in the `release()` path
  (and in the reduced-motion / already-scrolled paths, do NOT add it, so the
  markers rest drawn, which is the correct static read).
- `initOffer`: add `.is-stagger` to `.offer__denials`, to `.offer__cols`, and to
  each `.offer__list` right before their respective `staggerIn` calls (motion path
  only; skip under reduced motion so they rest drawn).
- `initFounder`: add `pull.classList.add("is-stagger")` in the motion path before
  toggling `.is-in` (skip it under reduced motion so the rule rests drawn).
Order matters: arm `.is-stagger` (collapse to 0) BEFORE the item gets `.is-in`,
or the first item flips with no transition. Setting `.is-stagger` and then letting
the existing per-item `.is-in` delayedCalls run gives the intended draw.

After the fix, re-confirm: build green, em-dash grep empty, and that with motion
ON the markers actually start collapsed and draw in (the new sections finally read
as choreographed, not pre-painted), while with reduced motion / deep-link they
rest fully drawn (failsafe intact).

---

## CRAFT NOTES (not blocking, but they separate 8 from 10)

### N1. Consistency: the new sections lack the section-rule seam the brief calls the chapter seam.
The offer block opens with a flat `border-top: 1px solid --grey-850` (static),
not the drawn `.section__rule` seam every void/ink boundary uses elsewhere. The
founder section DOES carry `.section__rule`. For one-hand consistency the offer's
top boundary should read as a drawn seam on enter, not a pre-painted border. Today
it is a static line, so the chapter does not "open" the way the others do. Low
effort given the seam grammar already exists.

### N2. Wow ceiling: the equity slot is honest and clean, but it is the page's one
NEW signature instrument and it under-commits to "powered on." The pending node
scales in once and then sits perfectly still. The brief's own language ("an
instrument powered on then draw the curve", "a single soft pulse traveling the
baseline") implies a faint living beat. A single, slow, low-amplitude opacity
breath on the pending node (transform/opacity only, paused offscreen, off under
reduced motion) would sell "live and waiting" far more than a static dot, without
fabricating anything. As-is it is correct but quiet, more "placeholder" than
"instrument." This is the one place to spend a little more to reach wow.

### N3. The hero bullet ticks are 12px hairlines that, once the draw is armed (B1),
will be the first per-line reward a visitor sees. Confirm the stagger CADENCE
matches the System steps / pillars (it uses STAGGER.bullet 0.06, which is right).
No change needed beyond B1, but verify the ticks draw left-anchored in lockstep
with the text rise so the eye reads tick-then-words, not both at once.

### N4. Consistency of the count-up: the hero proof counts (good), the progress
"12" counts (good), but the statband secondary footnote values (`0`, `1`, `2020`)
do not. The brief explicitly asks to "count up the statband". The primary statband
list is rendered by main.js (likely already counts); the secondary footnote row in
the proof section appears static. For parity every true numeral on the page should
tally, or none in a group should, to avoid a half-counting band reading as a bug.
Confirm the secondary row's intent: if it is meant to count, it currently does not.

### N5. Reduced-motion correctness depends on the B1 fix being done right. Today,
because `.is-stagger` is never added, reduced-motion happens to look identical to
motion-on for these markers (both rest drawn), which masks the bug. Once `.is-stagger`
is armed only in the motion path, double-check the reduced-motion branch sets the
final `.is-in` state WITHOUT `.is-stagger` so the markers stay drawn and nothing
animates. The current reduced-motion code adds `.is-in` (fine) but the fix must
NOT add `.is-stagger` there.

---

## WHAT IS GENUINELY 10/10 ALREADY (keep, do not touch)

- The honest equity slot is exactly right: a faint axis frame plus one soft signal
  node, no line, no number, no fabricated knee. It can never be misread as a rising
  curve. The live-data gate (`isChartLive`) requires STATUS === "live" AND a real
  non-trivial series, so the real curve wires in later with zero code change here.
  This is the brand's honesty rendered as craft. The `<title>`/`<desc>` + hidden
  table fallback are present. The draw-on-view path actually fires (`finishMount`
  wires `wireDrawOnView` -> `_draw`). This component is shippable and tasteful.
- The System pin chain-of-custody spine: observes the pin's step classes rather
  than re-deriving state, so it can never disagree with the pin. Correct.
- Ridge-pulse discipline: one coalesced pulse per beat through a single 600ms
  throttle gate, guarded for null scene, off under reduced motion. This is the
  right amount of "the scene answers," never a stutter, never a second flare during
  the System gather. Exactly the restraint the brief demands.
- The count-up reads true numerals from the bound text (never hardcoded), preserves
  the exact suffix shape ("3.5M+", "2,500+"), and leaves the year uncounted. Honest
  and precise.
- Em-dash audit: clean in source AND dist. Build: green. Reduced-motion and
  no-WebGL paths are guarded throughout.
- The charts module is a clean reusable API (`mountEquityCurve` / `mountCapacityCurve`
  / `mountGauntlet`, one data contract via `fromPerformanceData`, idempotent
  `update`/`resize`/`destroy`, safe no-op handle on bad input). /performance can
  adopt it as-is. Good engineering.

---

## BOTTOM LINE

This is a competent, honest, restrained pass with one fatal-to-the-mandate gap:
the signature per-line signal-draw, the exact gesture that was meant to make the
new sections feel as choreographed as the old ones, is wired but never armed, so
it does not play at all. Until `.is-stagger` is set on the parents in the motion
path, the landing is NOT consistent and NOT a 10. The fix is small and the rest of
the work is solid, which is why this is a candid PASS_WITH_NOTES rather than a hard
block: nothing is broken or dishonest, but the headline craft promise is currently
invisible to the visitor. Arm the stagger, add the seam draw and the node breath,
and this reaches the bar.
