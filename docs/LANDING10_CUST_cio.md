# Meridian / Landing 10/10 First-Impression Review (CIO)

Role: first-impression customer, a CIO landing cold on the elevated landing
(index.html). I experience ONLY the landing on load: the rendered hero, the new
V2 sections, the equity slot, the founder, the waitlist. I reason from the actual
markup + landing.js + charts.js + the CSS as they ship (verified against the built
dist bundle, not just source). I am demanding: an 8 is not enough.

Build: `npm run build` GREEN. Em-dash audit over source AND dist: CLEAN. Honesty
intact (equity slot is honest-pending, no fabricated curve, STATUS-gated; offer
framed as forthcoming; founder grounded; names via data-brand/data-flagship). Top
nav navigates to the sub-pages. Those guardrails hold. This review is about whether
the page now hooks in 3 seconds and reads as a perfect 10/10 with animations that
are clearly better, MORE VISIBLE, and CONSISTENT across EVERY section. It does not,
yet, because of one regression of exactly the kind the brief flags as FAIL.

## VERDICT: BLOCK

The headline deliverable, "the NEW V2 sections at full parity, animations much more
VISIBLE and consistent everywhere," is NOT shipped. The entire marker draw-in
reward layer the CSS built for the new sections is DEAD CODE: landing.js never adds
the `.is-stagger` class the CSS gates every V2 marker on, so the signature beats
never fire and the new sections still get only the plain fade the owner already
complained about. As the customer, I feel the page get quieter exactly where it
should be getting richer.

---

## SCORES (1 to 10)

- onload_hook: 8
- immersion: 5
- visibility: 8
- prestige: 8
- would_join: 6

The hero opening genuinely hooks (8), visibility is honestly lifted (8), and the
prestige restraint is intact (8, one accent, three tiers, no flooding). But
immersion caps at 5 because the new sections read as static next to the richly
choreographed old ones, and would_join sits at 6 because the trust keystones (the
offer denials, the founder pull-quote, the equity instrument) land flat at the exact
moment the page is asking me to commit.

---

## THE EXPERIENCE, AS I LIVE IT ON LOAD

### First 3 seconds (the hero): hooks, but only half-delivered
The intro calibrates, "Meridian" char-rises, the two-line statement masks lift, the
scene answers with ridge ignitions, the sub and CTA cascade up. This is a genuine
hook, the page reads as a serious instrument immediately. The `.hero__proof`
magnitudes count up (3.5M+ bars, 94 instruments, 24 factors), which is the data-house
tell I expect. GOOD.

But the FIRST scannable promise, the four `.hero__points` bullets, release with only
a plain opacity/y fade, and each bullet's signal tick sits static (it never draws in
with its line). The hero is the most-animated thing on the page and even here the new
content is the quiet part.

### The offer block (#what-it-is): the positioning lands flat
This is the block that answers "is this a fund, a SaaS, or copy-trading?", the most
important read for me as a buyer. The head char-rises (good, scroll.js owns it) and
the lead fades. Then: the three sharp denial dots ("Not a fund / Not copy-trading /
Not advice") never ignite, the two column-head seams never draw, and the eight
who-it-is-for / what-you-get row hairlines never draw. They all sit at their static
failsafe state. The "left column leads the right" reading order the code intends is
invisible because neither column's markers move. After the cinematic System pin
right above it, this dense, decision-critical block feels like a plain document. The
page loses its momentum exactly where I am evaluating the offer.

### The equity slot (#equity-slot): honest, but not alive
This is pitched as the page's signature new instrument moment, and it is honest
(no curve, no number, "backtest in progress", a single pending node). I respect the
restraint, the honesty is the aesthetic and it is intact. But it does NOT feel
powered-on: a static graticule, a blinking label dot, and one node that scales in
once. There is no soft pulse TRAVELING the baseline. It reads as "a box with a
blinking label," not "an oscilloscope at rest." The charts CSS comment even promises
a "traveling crest" the JS never renders. For the one beat the brief calls the
page's signature new instrument, it is below the bar the System pin set.

### The founder (#founder): the trust standing-close does not stand
The name char-rises and the bio fades. But the pull-quote, "A claim is worth nothing
until the evidence is on the record," is the emotional payoff, and its signal rule
(meant to DRAW top to bottom as the words land, "writing" the testimony into the
record) never draws. It sits static. The page's single most persuasive line lands
without its gesture. As the customer this is the moment that should make me trust the
founder, and it passes by quietly.

### What carries the page (the OLD sections): richly animated, which makes the
### contrast worse
The hero masks, the System pin chain-of-custody spine (nodes igniting, connector
filling as the field converges), the discipline char-rises, the statband count-up,
the bridge pulses, the waitlist arrival underline, all fire. They are excellent. The
problem is precisely that they make the new sections feel under-built by comparison.
The page does not read as ONE hand across every section, which is the bar.

---

## BLOCKING (must fix to reach the 10/10 the owner asked for)

### B1. Every new-section marker draw-in is dead code (the central regression)
`css/landing.css` gates the draw-in of every V2 marker behind `.is-stagger` on the
PARENT (e.g. `.js .hero__points.is-stagger li::before { transform: scaleX(0) }`,
`.js .offer__denials.is-stagger li::before { transform: scale(0) }`,
`.js .offer__cols.is-stagger .offer__col-head::after`, `.js .offer__list.is-stagger
li::before`, `.js .founder__pull.is-stagger::before`). `js/landing.js` toggles
`.is-in` on the items but NEVER adds `.is-stagger` to any parent. Verified: `grep -rn
"is-stagger" js/` is empty and the BUILT bundle (`dist/assets/index-*.js`) has zero
occurrences while the CSS references it 21 times. Result: every marker rests at its
failsafe `scale(1)` and never draws. Inert today: the four hero bullet ticks, the
three offer denial dots, the two column-head seams, the eight offer row seams, the
founder pull-quote rule.

WHERE: `js/landing.js` (`staggerIn`, `initHeroV2` release, `initOffer`,
`initFounder`); `css/landing.css` (~379, 461, 493, 535, 677).

FIX: add `.is-stagger` to the relevant PARENT at the moment the markers are armed,
paired with the `.is-in` toggles already there. Cleanest: have `staggerIn(items,
opts)` accept the marker-host container and add `is-stagger` to it (when not reduced
motion) so the arm and the per-item `.is-in` are always paired. Specifically:
`initHeroV2.release` -> `points.classList.add("is-stagger")` before the `<li>`
from-state; `initOffer` -> arm `.offer__denials`, `.offer__cols`, and each
`.offer__list`; `initFounder` -> arm `.founder__pull` before toggling `.is-in`.
Verify each marker goes 0 -> 1 as its row lands; confirm reduced-motion still snaps
to the final state (the RM override is also `.is-stagger`-scoped, so once armed it
correctly forces markers visible).

### B2. The equity slot does not feel powered-on (the signature instrument is inert)
The pending state is a static graticule + a label heartbeat + one node scale-in.
There is no pulse traveling the baseline, so the page's signature new instrument
reads as a box, not an oscilloscope at rest. This is below parity with the System pin.

WHERE: `js/charts.js` `mountEquityCurve` pending (`!live`) branch; the
`.proof__curve-grid` host in `css/landing.css`.

FIX: in the pending branch, add ONE soft signal pulse that travels left to right
along the baseline on a slow loop (a single reused node tweened in x along `baseY`,
transform/opacity only, paused offscreen via the existing draw-on-view trigger), or
a low-opacity scan sweep. Keep it unmistakably a baseline-at-rest (no rise, no curve,
no number) so honesty holds, and static under reduced motion. This matches the
"single soft pulse traveling it" the vision doc describes, so the landing slot and
the /performance reserved slot read as one instrument.

### B3. The new sections carry fewer motion layers than their siblings
Even with B1 fixed, the new sections are below the old chapters' density. Two cheap
parity beats, one per gap, no pile:
- The `.offer` block has NO seam draw at its boundary (it uses a static `border-top`
  inside the flagship). Every other chapter draws a `.section__rule` seam. Add a
  seam-draw at the offer boundary so the chapter-seam grammar is consistent. (The
  founder already carries a `.section__rule`, so it is fine; the offer is the gap.)
- The mono status lines `.offer__note` ("Opens in order...") and the
  `.proof__curve-label` ("[ live research, backtest in progress ]") just appear. The
  System steps use `.type-mono` to write data lines in; add `.type-mono` to these two
  so the terminal-readout texture is consistent on the new sections too.

---

## NON-BLOCKING (raise it past fixed toward 10/10)

1. Couple the hero EXIT to the scene lead (IMMERSION_VISION 3.1): as the wordmark
   column recedes and blurs, nudge the scene `setScroll` lead so the wordmark
   dissolves INTO the live field. The page's opening signature is not present yet.
2. Once B1 lands, confirm the offer columns' left-leads-right is perceptible;
   consider 0.14 to 0.16s lead so the eye reads who-it-is-for before what-you-get.
3. `.hero__proof` lands last in the cascade with a `points*0.06 + 0.55s` delay plus
   the count duration; confirm it is not stranded at 0 if I scroll past the hero
   mid-cascade (the `aboveLine(hero, 1.2)` fast-path covers deep links, but a quick
   scroll during the cascade is the edge to test).
4. Keep the scene pulses as they are: exactly one coalesced `pulseOnce` per chapter
   is correct restraint. A later pass must NOT "add more" and break the discipline.

---

## WHAT IS GOOD (keep, do not soften)

- The motion VOCABULARY is correct and shared (one EASE set, one stagger set, the
  count-up idiom, guarded coalesced scene pulses). The scaffolding is right.
- VISIBILITY is genuinely lifted: real `--grey-850` dividers, body-tier asides and
  captions, the statband and hero proof count up true facts, the separators and
  founder eyebrow raised off the decorative floor. This row of the brief is met.
- HONESTY is intact end to end and must not be touched to chase motion: the equity
  slot is honest-pending (no curve, no number, STATUS-gated), the offer is
  forthcoming, the founder grounded, zero em dashes in source and dist. The charts
  module is defensive, accessible (title/desc + visually-hidden table), bundle-flat
  (gsap + ScrollTrigger only), and reads the same `fromPerformanceData` contract
  /performance will adopt. This is 10/10 work.
- The System pin chain-of-custody spine, the bridge pulses, the waitlist arrival
  beat, and the top-nav navigation are unchanged and correct.

---

## BOTTOM LINE

The page hooks me in 3 seconds and the bones are right, but it is not a 10/10: the
new V2 sections, the offer positioning, the equity instrument, and the founder
standing-close, read quieter and flatter than the cinematic old sections, which is
exactly the under-animation the owner called out. Land B1 first (a few lines, it
unblocks the whole new-section reward layer), then B2 and B3 for genuine
parity-and-beyond. After fixes: rebuild green, re-audit em dashes, and scroll an old
chapter against each new section to confirm no new section is quieter than the old
ones on any beat. Until then: BLOCK.
