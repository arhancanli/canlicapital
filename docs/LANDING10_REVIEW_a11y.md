# LANDING10 REVIEW / Accessibility + Reduced-Motion

Reviewer role: Accessibility + reduced-motion. Scope: the NEW V2 landing sections
(`.hero__points`, `.hero__proof`, `.offer` / `#what-it-is`, the honest equity slot
`#equity-slot`, `.founder`) and the new data-viz module (`js/charts.js` +
`css/charts.css`), against the older sections they must reach parity with. Sub-pages
(`/systems`, `/performance`, `/progress`) and the shared engine
(`scene.js` / `scroll.js` internals / `shell.js` / `cursor.js`) were read for the
proven motion + a11y bar but are out of scope to change.

Build at review time: GREEN (`npm run build`, 56 modules, no errors). Em-dash audit
(U+2014) over source and `dist`: CLEAN (zero matches).

VERDICT: PASS (with non-blocking notes). No accessibility or reduced-motion
regression found. The new sections meet or exceed the existing a11y bar.

---

## 1. Keyboard navigation + focus order (PASS)

- No positive `tabindex` anywhere in `index.html` (`grep 'tabindex="[0-9]+"'`
  returns nothing). Natural DOM tab order is preserved through every new section.
- `main#content` is `tabindex="-1"` (skip-link landing target, programmatically
  focusable, not in the tab sequence). Correct.
- The waitlist honeypot input is `tabindex="-1"` + `aria-hidden="true"`: correctly
  removed from BOTH the tab order and the accessibility tree.
- Every new interactive control is a native element: the offer/founder blocks add
  NO new interactive widgets; the equity slot's only control is a real `<a>`
  (`.proof__curve-link` -> `/performance`), keyboard-reachable.
- `aria-hidden="true"` appears only on decorative leaf nodes (dots, separators,
  rules, arrows, grain, canvas, cursor, intro, anchor-marks, `.proof__curve-grid`,
  the live-status dot). NONE wraps a focusable element, so there is no
  aria-hidden focus trap. `#equity-slot` itself is NOT aria-hidden, so its inner
  link stays in the a11y tree.
- Magnetic pull (`data-magnetic`, owned by `cursor.js`) binds to `mousemove` /
  `mouseleave` ONLY. Keyboard focus does not trigger the magnet, so a
  keyboard-focused CTA stays at its rest position and the focus ring sits correctly
  around it. The whole cursor/magnet module is a no-op on touch / coarse pointers.

## 2. Focus-visible (PASS)

- Global `:focus-visible { outline: 1px solid var(--signal); outline-offset: 4px }`
  (`styles.css`) applies to every new link, including `.bridge__link` /
  `.proof__curve-link`, which add no focus override and inherit it.
- Focus-ring contrast `--signal` (#C8553D) on `--void` (#0A0B0D) = **4.52:1**,
  comfortably above the 3:1 non-text UI minimum (WCAG 1.4.11). On `--ink` = 4.63:1.
- The 4px offset keeps the ring clear of the glyph on the dim greys, so focus is
  legible against the new sections' restrained palette ("MORE VISIBLE" satisfied
  for the keyboard path without breaking prestige restraint).

## 3. Reduced-motion (PASS, belt-and-suspenders)

The composed-static story for the new sections + charts is layered three deep, so a
miss in any one layer is caught by the next:

1. JS branches: `landing.js` and `charts.js` each capture
   `prefers-reduced-motion` and, when set, compose the FINAL state with no tween
   (hero points/proof shown + final numerals, offer markers shown, founder rule
   drawn, equity pending node left visible at rest, live curve composed instantly).
2. CSS reveal failsafe: `.js .reveal-fade { opacity: 1 }` under the reduced-motion
   media query (`styles.css`), so `.hero__points` / `.hero__proof` / offer lead /
   founder bio / asides are visible even if their JS beat never runs.
3. Global motion floor: `*, *::before, *::after { animation-duration: 0.001ms;
   animation-iteration-count: 1; transition-duration: 0.001ms } !important`
   (`styles.css`) neutralizes every CSS transition/animation to effectively
   instant, including the new-section marker draws and the `.proof__curve` grid
   lift.

Supporting facts:
- Lenis smooth scroll is disabled under reduced motion (`scroll.js`), so anchor /
  keyboard jumps are native-instant (vestibular-safe).
- `.dot--pulse` (the one looping "live research" heartbeat in the equity-slot label
  and hero status) is set to `animation: none` under reduced motion.
- The chart draw-ins are one-shot GSAP timelines fired ONCE on scroll-enter and
  self-cleaning; under reduced motion `draw()` early-returns / composes the final
  geometry with no tween. The pending equity node renders at its default
  (`opacity 1`) and is never hidden behind a tween.
- No infinite/parallax/autoplay motion exists in the new sections or the charts.
  `[data-parallax]` and `[data-skew]` are `transform: none !important` under
  reduced motion (`motion.css`). Nothing in the new work can trap or disorient.

## 4. Semantic structure (PASS)

- One `h1` (hero wordmark). Each section opens with an `h2`. Sub-items are `h3`.
- `.offer__head` is `h3`, nested inside the flagship section whose head is `h2`:
  a valid level-3 subsection, no skipped level (the pillars above it are also `h3`,
  same level-3 children of the flagship `h2`).
- `.founder__name` is `h2` for its own `<section id="founder">`. Correct.
- `#equity-slot` carries `aria-label` but no `role`; on a generic container the
  label is largely inert for AT traversal, which is fine: the chart's `role="img"`
  + `<title>`/`<desc>` and the visible label/caption carry the meaning. No harm,
  no double-landmark.
- Roadmap uses an explicit `role="table"`/`row`/`columnheader`/`cell` grid; the
  statband is a labeled list. Both are pre-existing and sound.

## 5. Chart a11y fallbacks (PASS)

All three components in `js/charts.js` (equity, capacity, gauntlet) ship the same
contract:
- `<svg role="img" aria-labelledby="title desc" focusable="false">` with a unique
  `<title>` + `<desc>` per instance (id-collision-safe via `nextId`).
- A visually-hidden data `<table>` fallback with `<caption>`, `scope`'d headers,
  and down-sampled rows; the HONEST pending state renders a one-row "Backtest in
  progress, no data yet." table and a desc that says the result appears only after
  the validation gauntlet. No fabricated numbers reach AT.
- The live-data gate (`isChartLive`) keeps the line/verdicts out of the DOM AND out
  of the table until a genuinely live, non-trivial payload exists, so the AT
  experience can never assert a result the page does not have.
- The pending "powered-on" signal node fill is `--signal` (4.52:1 non-text on void)
  so the one meaningful "live and waiting" tell is perceptible.

## 6. "More visible" / contrast on the new sections (PASS)

Token-grounded ratios on `--void`:
- `--paper-dim` body (offer rows, founder bio, hero bullets): **9.5:1**.
- `--grey-700` mono labels (hero__proof base words, denials, captions): **5.71:1**.
- `--paper` bright facts + founder pull-quote: **17.45:1**.
- `--signal` label + focus ring + chart node: **4.52:1**.

The faint frame chrome that is below 3:1 is decorative-only and non-essential:
the `.is-powered` `--signal-deep` border (2.24:1) and the `--grey-850` /
`--grey-900` graticule (1.27 / 1.10:1) carry no text and gate no control; the
slot's MEANING rides on the `--signal` label and the `--paper-dim` caption, both
well above threshold. No contrast minimum is violated.

---

## Non-blocking notes (for the motion owner, not a11y regressions)

- N1. The per-marker draw-in CSS (hero bullet ticks, offer denial discs, offer
  column hairlines, offer list seams, founder pull rule) gates its hidden
  from-state behind a `.is-stagger` class on the parent
  (`.js .hero__points.is-stagger li::before { transform: scaleX(0) }`, etc.).
  `landing.js` toggles `.is-in` per item but never adds `.is-stagger` to any
  parent. NET EFFECT: those markers REST in their final drawn state and never play
  their draw-in. This is a MOTION-fidelity gap, not an a11y issue, and it is
  actually a11y-SAFE: every marker is visible at rest, so nothing is hidden. The
  reduced-motion override block that forces `.is-stagger ... is-in` to final state
  is therefore inert today (the base already shows the final state). If the motion
  owner wires `.is-stagger` on, the reduced-motion override and the global motion
  floor already cover it. Flagging so it is a deliberate choice, not a silent drop.

- N2. `#equity-slot` repeats "backtest in progress" across its `aria-label`, the
  visible label, the caption, the SVG `<desc>`, and the table. Honest and
  consistent, mildly redundant for AT; acceptable (it reinforces the one true
  state). Optional: drop the slot's `aria-label` since the chart `role="img"`
  already names the region.

- N3. Footer column heads are `h2` (peers of the section `h2`s). Pre-existing and
  consistent across pages; not in scope. Noted only for completeness.

## Recommended manual smoke (pre-merge)

1. Tab from page load: skip-link -> rail -> nav (Systems/Performance/Progress
   navigate cross-page) -> hero CTAs -> bridge links -> the equity-slot
   `/performance` link -> waitlist email + submit. Confirm a visible 4px signal
   ring at each stop and no off-screen/displaced focus.
2. OS reduced-motion ON, reload: hero bullets + proof facts shown with final
   numerals (no count), offer + founder fully composed, equity slot shows the
   graticule + signal node + honest caption with no draw-in, anchor jumps are
   instant. Nothing stuck hidden.
3. Screen reader pass over `#equity-slot`: the chart announces as an image
   "Out-of-sample equity curve, backtest in progress..." and the hidden table
   reads "Status: Backtest in progress, no data yet." No fabricated figure.
