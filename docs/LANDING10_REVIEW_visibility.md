# MERIDIAN / LANDING10 REVIEW: VISIBILITY + POLISH

Role: Visibility + Polish Reviewer. Remit: verify the owner's "make everything
MORE VISIBLE" mandate is met (nothing important is too dim / low-contrast), the
whole landing is 10/10 polished, and the sovereign-fund prestige is intact. Score
visibility and polish (1 to 10). This review reads the SHIPPED files only
(`index.html`, `css/landing.css`, `css/charts.css`, `js/landing.js`,
`js/charts.js`) against `docs/DESIGN_SYSTEM.md` and `docs/LANDING10_VISIBILITY.md`.

VERDICT: PASS_WITH_NOTES. Build green, em-dash audit empty, honesty intact, every
P0/P1 visibility raise from the brief is implemented and present in the built CSS,
contrast is at AA on every readable tier. One minor guardrail nick (a rendered
pure-black vignette shade) and a few small polish opportunities, none blocking.

SCORES: visibility 9 / 10, polish 9 / 10.

---

## 1. BUILD + HARD GUARDRAILS (all green)

- `npm run build`: green (`built in ~116ms`, all four HTML entries emitted).
- Em-dash audit: `grep -rPn "\x{2014}"` over `index.html`, `css/landing.css`,
  `css/charts.css`, `js/landing.js`, `js/charts.js` and over
  `dist/index.html` + `dist/assets/*.css`: EMPTY. Clean in source and dist.
- One design system: landing.css and charts.css ADD classes only. Every color in
  both sheets resolves to a shared token (`--signal`, `--signal-faint`,
  `--signal-glow`, `--signal-deep`, `--grey-700`, `--grey-850`, `--grey-900`,
  `--paper`, `--paper-dim`, `--void`, `--ink`). No second accent hue, no neon, no
  new easing, no re-skinned cursor/nav/rail/grain. Confirmed by grepping for raw
  non-token hex/rgb: none except the black-vignette nick below.
- Honesty: `STATUS = "reserved"` and `EQUITY_CURVE = []` in performance_data.js;
  `isChartLive()` requires `status === "live"` AND a non-trivial (>= 2 point)
  series, so the equity slot renders the pending shell (flat baseline + one soft
  signal node, no line, no number). A fabricated curve cannot render. The slot's
  honest caption is real DOM, not chart-drawn, so it is legible even if the chart
  module fails to mount.

---

## 2. VISIBILITY MANDATE: EVERY P0/P1 RAISE IS IMPLEMENTED

Verified each ranked item from LANDING10_VISIBILITY against shipped source AND the
built `dist/assets/index-*.css`:

P0:
1. `.hero__proof-sep` lifted rung 1 -> rung 3: `color: var(--grey-700)`,
   `margin: 0 0.45em`. Built CSS confirms `hero__proof-sep{color:var(--grey-700)
   ;margin:0 .45em}`. The proof row no longer reads as a run-on. PASS.
2. `.proof__curve` (equity slot) reads as powered-on: graticule lifted
   `--grey-900 -> --grey-850` (built CSS confirms both grid gradients reference
   `--grey-850`), `min-height: 260px`, inner vignette, `.is-powered` lifts the
   border to `--signal-deep` and the grid opacity to 0.65, a `dot--pulse` live
   dot rides the signal label, and js/landing.js fires one ridge pulse + adds
   `.is-powered` on enter. This is now an instrument, not a dead box. PASS.
3. `.offer__note` / `.offer__aside` sentence lifted floor -> `--paper-dim`
   (`.offer__note{color:var(--paper-dim);font-size:.8125rem}`; aside sentence
   `--paper-dim`, `//` marker held at `--grey-700`). PASS.
4. `.sys-chain__num` lifted rung 2 -> rung 3 (`--grey-700`), `.sys-chain__label`
   resting opacity 0.55 -> 0.7; active state still jumps to `--paper` so the
   active link is unmistakably brightest. The chain now reads AS a chain. PASS.

P1:
5. `.hero__points li` at `1.05rem/1.6` `--paper-dim` (`.body` parity), tick 12px,
   gap `--s-3`, max-width 48ch. PASS.
6. `.offer__list li::before` divider moved `--grey-900 -> --grey-850` (built CSS:
   `offer__list li:before{...background:var(--grey-850)}`) plus the shared ledger
   hover wash (`linear-gradient(90deg, --grey-900, transparent)` on `:hover`,
   border to `--grey-825`). The offer reads as a ledger now. PASS.
7. `.proof__curve-caption` floor -> `--paper-dim` (built CSS confirms). The
   honesty keystone sentence is unambiguously readable. PASS.
8. Founder: `.founder__role` keeps the one accent pixel (`--signal`); the
   orphaned bare `/` eyebrow idx lifted to full signal opacity, scoped to
   `.founder .eyebrow .idx` only (the global `.idx` thread stays 0.5). PASS.

P2 micro-raises:
- Aside SENTENCES (`thesis/house/proof/waitlist`) -> `--paper-dim`, their `//`
  markers held at `--grey-700` (built CSS confirms the grouped rule). PASS.
- `.hero .hero__status-sep` lifted `--grey-600 -> --grey-700`, scoped to the hero
  so the global glyph is untouched. PASS.

The single most common defect the brief named (readable text / value-separators
at rung 2 `--grey-600` or below) is eliminated: the ONLY remaining `--grey-600`
in landing.css is the idle `.sys-chain__dot` BORDER, an explicitly sanctioned
decorative placeholder glyph whose ignition contrast is the point (S7.1).

---

## 3. CONTRAST MATH (every readable tier is AA)

Computed WCAG ratios on `--void` (#0A0B0D):

| Tier | Hex | Ratio | Verdict |
|---|---|---|---|
| `--paper` | #F4F1EA | 17.45:1 | AA text PASS (headlines, key values) |
| `--paper-dim` | #B7B4AC | 9.50:1 | AA text PASS (body, leads, raised asides/captions) |
| `--grey-700` | #888A90 | 5.71:1 | AA text PASS (the floor: labels, dividers, `//` markers) |
| `--grey-600` | #5C5E63 | 3.03:1 | AA-large only (kept to the idle chain dot border, decoration) |
| `--grey-850` | #222428 | 1.27:1 | hairline only (borders/graticule, never type) |

On `--ink` (#070809) the floor and body tiers are slightly HIGHER (5.81:1 /
9.68:1), so the darker discipline/footer bands do not regress. Every word the
reader must read now sits at 5.7:1 or brighter. The hierarchy gaps stay wide:
`--paper` (17.45) clearly outranks `--paper-dim` (9.50) which clearly outranks
the `--grey-700` floor (5.71). Three visible tiers survive in every section; the
ladder is not collapsed. "Clearer, not louder" is achieved.

---

## 4. POLISH + PARITY (the new sections reach and exceed the old ones)

- The new V2 sections now carry the FULL reveal vocabulary, not a flat fade:
  `.hero__points` stagger in with each signal tick drawing; `.hero__proof`
  magnitudes COUNT UP from 0 (the data-house tell), the year left as a plain
  fact; the offer is a composed four-beat ledger (denial dots ignite, column
  hairlines draw, rows stagger left-column-leads-right, one ridge pulse); the
  equity slot powers on (grid + border lift) and draws its axis + node; the
  founder role resolves after the name mask and the pull-quote's signal rule
  draws top-to-bottom as the words land. This matches the brief's parity demand.
- FAILSAFE-FIRST discipline is consistent and correct: every drawn marker
  (`.hero__points li::before`, `.offer__denials li::before`, `.offer__col-head
  ::after`, `.offer__list li::before`, `.founder__pull::before`,
  `.proof__curve-grid`) is VISIBLE at rest (`scaleX/scaleY/scale 1`, grid opacity
  on) and only the `.js .X.is-stagger` armed state starts hidden. So with no JS,
  or if a beat throws, the section is fully composed and legible, never stranded.
  js/landing.js wraps each init in `safe()` and reveals text via GSAP (never CSS
  hiding), so text opacity is never gated behind a class that might not toggle.
- Reduced motion: a dedicated block forces every armed marker to its final
  `scale 1` state and the grid to 0.65 opacity, so a reduced-motion reader sees
  the composed diagram, never a mid-animation or hidden frame. The chart's
  `draw()` skips the tween. Correct.
- Restraint held: no `.body`/`.body-l` prose was brightened past `--paper-dim`
  (grep-confirmed), the accent stays at one pixel of intent per chapter (eyebrow
  idx, equity live label, founder role, signal-word underline, CTA), and the
  brief's "do not flood with `--paper`" guardrail is respected. The page reads
  clearer without losing the Jane-Street-x-Palantir quiet.
- Charts module is token-pure, SVG, animates stroke-dashoffset/transform/opacity
  only, carries `<title>`/`<desc>` + a visually-hidden table fallback, and mounts
  behind the host's honesty text (`z-index: 0` wrapper inserted as firstChild;
  the label/caption/link sit at `z-index: 1`). No bundle bloat (gsap + ScrollTrigger
  singletons only; three bundle unchanged at 526kB).

---

## 5. FINDINGS

### F1 (NOTE, minor guardrail nick) Rendered pure-black vignette on the equity slot

`css/landing.css:578` sets the slot background to
`radial-gradient(120% 80% at 50% 50%, transparent 55%, rgba(0, 0, 0, 0.35) 100%)`.
DESIGN_SYSTEM section 9 forbids pure black (#000): "use `--paper` and `--void`."
This is a RENDERED 35%-opacity darkening overlay composited over the void panel,
and the inline comment claims "built from the existing palette (no new color),"
which is not literally true. Visually the difference from a `--void`-derived
shade is negligible (the void is #0A0B0D, almost black), so it does not read as a
new color and does not hurt visibility, but it is a literal violation of the
no-pure-black rule and the comment overstates compliance.

FIX: swap the rendered stop to a void-derived rgba, e.g.
`rgba(10, 11, 13, 0.55)` (the `--void` channels) tuned to the same perceived
darkening, and correct the comment. The two `#000` uses on lines 600-601 are
inside `mask-image` (alpha-channel masking convention, not a rendered color) and
are fine to leave, though `--void`-derived black would be tidier for consistency.

### F2 (NOTE, polish) The `.hero__proof` row is the one place a count could mislead at a glance

The proof magnitudes count up from 0 (`3.5M+`, `94`, `24`, `2,500+`). This is the
intended data-house tell and is honest (final values are the true bound facts).
No action required; flagged only so a future editor does not mistake the brief
0-to-target tick for a fabricated animation. The `since 2020` value is correctly
left un-counted (a year tallying up would read odd). Working as designed.

### F3 (NOTE, optional) `.proof__curve-label` size vs the brief

The brief (S6.3) asked for `0.8125rem` on the live label; shipped value matches.
The live `dot--pulse` is present in markup. One optional polish: the label sits
centered in a 260px panel with the caption directly under it; on very wide
viewports the centered stack can feel a touch sparse against the wide graticule.
Not a defect; only a candidate if the owner wants the panel denser later (the
real curve will fill it). No change needed now.

---

## 6. ACCEPTANCE CHECK (against LANDING10_VISIBILITY S11)

- Every readable word at `--grey-700` (floor) or brighter: YES (grep + math).
- Every value-separator at `--grey-700`+ and every content divider at
  `--grey-850`+: YES (hero proof seps, hero status sep, offer rows, offer top
  rule, graticule all confirmed).
- Hero proof row reads as a structured instrument readout with visible dividers:
  YES.
- Equity slot reads as a powered-on panel (visible graticule, live signal label
  with pulse, readable honesty caption, NO fabricated curve): YES.
- Offer reads as a ledger with visible dividers + hover response + legible notes:
  YES.
- System-pin chain's upcoming links faintly readable, active link brightest: YES.
- Founder bio + pull-quote unambiguously legible, section not orphaned: YES.
- Still three visible contrast tiers per section, one accent pixel per chapter,
  no new color, no layout animation: YES.

---

## 7. BOTTOM LINE

The "more visible" mandate is met across every section, the new V2 blocks are at
or beyond parity with the older choreographed sections, the honesty contract is
airtight (reserved status -> honest pending instrument, no fabricated curve), and
the prestige restraint is intact (one accent, three tiers, no flooding to paper).
Build green, em-dash audit empty, AA contrast on every readable tier.

PASS_WITH_NOTES. The only literal guardrail nick is the rendered `rgba(0,0,0,...)`
vignette (F1), a one-line fix to a void-derived shade. Visibility 9/10, polish
9/10; both reach 10 once F1's pure-black stop is swapped to the void token and the
comment is corrected.
