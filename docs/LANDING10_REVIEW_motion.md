# Meridian / Landing 10/10 Motion + Consistency Review

Reviewer: motion + consistency critic. Bar: the WHOLE landing reads as a perfect
10/10, with animations that are MUCH better, MORE VISIBLE, CONSISTENT across every
section, genuinely immersive everywhere, and the NEW V2 sections (`.hero__points`,
`.hero__proof`, `.offer`, `.proof__curve`/`#equity-slot`, `.founder`) brought to
full parity with the richly-choreographed older sections (the hero masks, the
System pin). Judged adversarially against `docs/DESIGN_SYSTEM.md` section 4,
`docs/IMMERSION_VISION.md`, and `docs/LANDING10_MOTION.md`.

Build state: `npm run build` is GREEN. Em-dash audit (`grep -rPn "\x{2014}"`) over
source AND dist is CLEAN. The honest equity slot mounts the charts module in its
reserved pending state (`chart__node--pending`, "backtest in progress"); no
fabricated curve. STATUS gate intact. All guardrails on honesty, em dashes, build,
and bundle are respected. The charts module is well built and honest.

## VERDICT: BLOCK

One regression of exactly the kind the brief flags as FAIL: the entire
"marker draws with its line" reward layer in the V2 sections is DEAD CODE. The CSS
gates every V2 marker draw-in behind an `.is-stagger` class on the parent
container, but no JavaScript anywhere (source or dist) ever adds `.is-stagger`. So
the signature beat the CSS authors built for the new sections never fires. The new
sections still get only a plain opacity/y fade, which is precisely the
"under-animated, only basic reveal-fade" complaint this work was meant to kill.
The owner's core problem is still live in the shipped page.

---

## SCORES (1 to 10)

- animation_quality: 6
- consistency: 5
- immersion: 6
- visibility: 8

The architecture and vocabulary are correct and the visibility work is genuinely
done (contrast lifts, real dividers, the statband + hero proof count up). But the
NEW sections are NOT at parity: their bespoke marker choreography does not run, so
they are quieter than the old sections in exactly the way the brief forbids. That
caps consistency and animation_quality until the wiring lands.

---

## BLOCKING

### B1. The `.is-stagger` arm is never added: every V2 marker draw-in is dead code

`css/landing.css` gates the draw-in of every new-section marker behind
`.is-stagger` on the PARENT, e.g.:

```
.js .hero__points.is-stagger li::before { transform: scaleX(0); }
.js .hero__points.is-stagger li.is-in::before { transform: scaleX(1); }
.js .offer__denials.is-stagger li::before { transform: scale(0); }
.js .offer__denials.is-stagger li.is-in::before { transform: scale(1); }
.js .offer__cols.is-stagger .offer__col-head::after { transform: scaleX(0); }
.js .offer__cols.is-stagger .offer__col-head.is-in::after { transform: scaleX(1); }
.js .offer__list.is-stagger li::before { transform: scaleX(0); }
.js .offer__list.is-stagger li.is-in::before { transform: scaleX(1); }
.js .founder__pull.is-stagger::before { transform: scaleY(0); }
.js .founder__pull.is-stagger.is-in::before { transform: scaleY(1); }
```

`js/landing.js` toggles `.is-in` on the items (used by the opacity/y tween) but
NEVER adds `.is-stagger` to any parent. Audit: `grep -rn "is-stagger" js/` returns
nothing; the built bundle confirms it (CSS references `is-stagger` 15 times, the
landing JS 0 times). Result: every marker rests at its failsafe `scale(1)` and
NEVER draws. Specifically inert today:

- `.hero__points li::before` (the four hero signal bullet ticks) never extend.
- `.offer__denials li::before` (the three "Not a fund / Not copy-trading / Not
  advice" signal dots) never ignite.
- `.offer__col-head::after` (the two column-head seam rules) never draw.
- `.offer__list li::before` (the eight who/what-you-get row seams) never draw.
- `.founder__pull::before` (the founder pull-quote signal rule) never draws
  top-to-bottom, the page's trust standing-close gesture.

This is the central failure: the V2 sections get only the generic fade, so they
read quieter than the old sections, which is the exact regression the brief calls
out. `landing.js` doc comments CLAIM these draws fire ("each bullet's signal-
hairline marker drawing with its line, via .is-in", "the column head's hairline
draws (.is-in)", "the left signal rule draws top to bottom"), so the code intent
and the shipped behavior disagree.

WHERE: `css/landing.css` (lines ~379, 461, 493, 535, 677), `js/landing.js`
(`staggerIn`, `initHeroV2.release`, `initOffer`, `initFounder`).

FIX: in `js/landing.js`, add `.is-stagger` to the relevant PARENT immediately
before (or as) the markers are armed, and remove it never. Concretely:
`initHeroV2.release` -> `points.classList.add("is-stagger")` before setting the
`<li>` from-state; `initOffer` -> add `is-stagger` to the `.offer__denials` `<ul>`,
to `.offer__cols`, and to each `.offer__list` `<ul>` at the moment `staggerIn`
arms them; `initFounder` -> add `is-stagger` to `.founder__pull` before toggling
`.is-in`. The cleanest move: have `staggerIn(items, opts)` accept the container
and add `is-stagger` to it (and the marker host) when not reduced-motion, so the
arm and the `.is-in` toggles are always paired. Verify visually that each marker
goes 0 -> 1 as its row lands; confirm reduced-motion still forces the final state
(the existing RM override is also `.is-stagger`-scoped, so once armed it correctly
snaps markers to visible).

### B2. New sections are below parity in animation DENSITY, not just the broken arm

Even with B1 fixed, the new sections carry FEWER simultaneous motion layers than
the old ones, so they will still read quieter. The old chapters layer: char clip-
rise head + section-rule seam draw + body fade + (where present) count-up + scene
pulse, often with parallax/skew depth. The new sections, post-B1, would have: head
char-rise (offer, founder) + a single fade + a marker draw + one pulse. Missing
parity beats the brief explicitly asks to "extend consistently":

- `.offer` and `.founder` have NO `.section__rule` seam draw at their boundary;
  the offer uses a static `border-top` and the founder has nothing. Every other
  chapter on the page draws its seam. Add the shared `.section__rule` (or an
  equivalent scaleX draw) at each new-section boundary so the chapter seam grammar
  is consistent.
- `.hero__proof` and the statband count up (good), but the offer/founder carry NO
  count and NO mono type-in, while the brief lists `.type-mono` as a parity beat
  for data/status lines. The `.offer__note` ("Opens in order...") and the
  `.proof__curve-label` ("[ live research, backtest in progress ]") are mono status
  lines that should write in via `.type-mono` for the terminal-readout texture the
  rest of the page uses.

WHERE: `index.html` (offer/founder boundaries, `.offer__note`,
`.proof__curve-label`), `js/landing.js` / `css/landing.css`.

FIX: add a seam-draw rule at the offer and founder boundaries (reuse
`.section__rule` so scroll.js draws it for free); add `.type-mono` to the two mono
status lines named above so they write in. Keep it to ONE added beat per section,
not a pile, to stay within restraint.

### B3. The equity slot does not "feel powered-on then" do anything alive

The brief asks the equity slot to "feel powered-on" as a signature instrument
beat, and `IMMERSION_VISION` 3.3 describes the reserved instrument as "a flat
baseline in the signal hue with a single soft pulse TRAVELING it." Today the
pending state is: a static graticule + a `.dot--pulse` heartbeat on the label +
ONE node scale-in on enter + an `.is-powered` border-color flip. There is no
traveling pulse along the baseline, so the slot reads as "a box with a blinking
label," not "an oscilloscope at rest." The charts CSS comment even promises a
"traveling crest" that the charts JS pending path does not render. It is honest
(good) but it is NOT the alive, powered-on beat the brief calls the page's
signature new instrument moment, so it is below parity with, say, the System pin.

WHERE: `js/charts.js` `mountEquityCurve` pending branch (the `!live` path), and the
`.proof__curve-grid` host in `css/landing.css`.

FIX: in the pending branch, add ONE soft signal pulse that travels left-to-right
along the baseline on a slow loop (a single small node tweened in x along `baseY`,
transform/opacity only, paused offscreen via the existing draw-on-view trigger or a
ScrollTrigger toggle), OR a low-opacity scan sweep. It must remain unmistakably a
baseline-at-rest (no rise, no curve, no number), so honesty holds. Match the
described "single soft pulse traveling it" so the landing slot and the /performance
reserved slot read as one instrument. Keep it cheap (one reused node, no per-frame
allocation) and respect reduced-motion (static node only).

---

## NON-BLOCKING FIXES (raise it past "fixed" toward 10/10)

1. Couple the hero EXIT to the scene lead. `IMMERSION_VISION` 3.1 asks the wordmark
   to dissolve INTO the live field as the hero recedes (nudge the scene `setScroll`
   lead as the hero column blurs out). The new hero points/proof ride the exit
   scrub for free, but the signature "wordmark dissolves into the manifold" coupling
   is not present on the landing. This is the page's opening signature; add it.

2. The two offer columns lead/trail by 0.12s (good intent) but both columns' marker
   draws are dead (B1), so the deliberate left-leads-right reading order is
   invisible. Once B1 lands, confirm the lead is perceptible; consider 0.14 to 0.16s
   so the eye genuinely reads who-it-is-for before what-you-get.

3. `.hero__proof` counts up its magnitudes but lands LAST in the cascade with a
   ~`points*0.06 + 0.55`s delay plus the count duration. On a fast first paint that
   readout can finish very late; verify it is not stranded at 0 if the user scrolls
   past the hero before the cascade releases (the `aboveLine(hero, 1.2)` fast-path
   covers deep links, but a quick scroll mid-cascade is the edge to check).

4. Scene reactions are well throttled (one coalesced `pulseOnce` per chapter), which
   is correct restraint. But the new sections each fire exactly one pulse on enter;
   that is consistent. No change needed; noting it is CORRECT so a later pass does
   not "add more" and break the discipline.

5. The reduced-motion override block in `landing.css` is itself `.is-stagger`-scoped
   (e.g. `.js .hero__points.is-stagger li::before { transform: scaleX(1); }`). With
   B1 fixed (arm added), this correctly snaps markers visible under RM. Without the
   arm it is also moot. After B1, explicitly test `prefers-reduced-motion: reduce`
   to confirm every marker shows its final drawn state and nothing animates.

---

## WHAT IS GOOD (keep)

- The motion VOCABULARY is correct and shared: one EASE set, one stagger set
  (`row 0.07`, `bullet 0.06`), the count-up idiom reused, scene pulses guarded and
  coalesced. The intent matches the design system exactly.
- VISIBILITY is genuinely lifted: real `--grey-850` dividers, body-tier asides and
  captions, the statband and hero proof count up true facts, the founder eyebrow and
  proof separators raised off the decorative floor. This row of the brief is largely
  met.
- HONESTY is intact end to end: the equity slot is honest-pending (no curve, no
  number, `chart__node--pending` + "backtest in progress"), STATUS-gated, the offer
  framed as forthcoming, the founder grounded, names via `data-brand`/`data-flagship`.
  Zero em dashes in source and dist. The charts module is defensive, accessible
  (title/desc + visually-hidden table), bundle-flat (gsap + ScrollTrigger only), and
  reads the same `fromPerformanceData` contract /performance will adopt. This is
  10/10 work and must not be softened to chase motion.
- The System pin chain-of-custody spine, the bridge pulses, and the waitlist arrival
  beat are unchanged and correct.
- Build green, no layout-property animation, scene calls all guarded, no new deps.

---

## BOTTOM LINE

The scaffolding is right and the honesty/visibility lanes are done. But the headline
deliverable, "the NEW V2 sections at full parity, animations much more VISIBLE," is
NOT shipped: the marker draw-in choreography the CSS built for those sections is
disconnected (B1), the sections carry fewer motion layers than their siblings (B2),
and the signature equity instrument does not feel alive (B3). Land B1 first (it is a
few lines and unblocks the whole new-section reward layer), then B2 and B3 for
genuine parity-and-beyond. After fixes: rebuild green, re-audit em dashes, and do a
side-by-side scroll of an old chapter vs each new section to confirm no new section
is quieter than the old ones on any beat.
