# MERIDIAN / LANDING10 MOTION DIRECTION

The unified, section-by-section GSAP choreography that takes the LANDING (index.html)
to a consistent 10/10. This document is the MOTION DIRECTOR's binding brief for the
landing builders. It does three things:

1. Defines ONE easing + stagger + scene-reaction vocabulary used in EVERY section, so
   the whole page reads as one hand (not a richly-animated old half + an
   under-animated new half).
2. Specifies, section by section, the entrance reveal, the scrubbed/pinned beat, the
   scene reaction, and the micro-interactions, bringing the NEW V2 sections
   (`.hero__points`, `.hero__proof`, `.offer`, `.proof__curve`, `.founder`) to full
   parity with, and beyond, the existing choreographed sections (the hero masks, the
   System pin).
3. Specifies the NEW reusable data-viz module (`js/charts.js` + `css/charts.css`) and
   how its equity-curve component mounts into `#equity-slot` in an HONEST pending
   state, with a clean API `/performance` adopts next.

It EXTENDS, never forks, `docs/DESIGN_SYSTEM.md` (sections 3, 4) and
`docs/IMMERSION_VISION.md` (sections 1, 2, 3.1, 4). Every guardrail there still binds.
If a beat here would break a guardrail, the guardrail wins.

OWNERSHIP (hard): the landing builders touch ONLY `index.html`, `js/landing.js`,
`css/landing.css`, and the NEW `js/charts.js` + `css/charts.css`. They drive the scene
through its PUBLIC API only (`window.__meridianScene`: `setScroll`, `setPointer`,
`pulseRidge`, `setConverge`, `flareBloom`, `enterFrom`). They do NOT edit
`js/scene.js` / `js/shaders.js` internals, `js/shell.js` nav logic, or `js/cursor.js`.
`js/scroll.js` is touched only surgically, home-guarded (`isHome`), and only if a beat
genuinely cannot be reached from `landing.js` (it almost always can: `landing.js` runs
after `main.js` and can read every class scroll.js sets and call the scene). The top
nav must keep NAVIGATING to `/systems` `/performance` `/progress`.

---

## 0. THE PRINCIPLE: WHY THE NEW SECTIONS LOOK UNDER-ANIMATED, AND THE FIX

The old sections (hero, thesis, flagship, the System pin, discipline, the statband)
carry the FULL reveal grammar: per-character clip-rise heads, word reveals, mono
type-in, count-up numerals, section-rule seam draws, parallax, the pinned tentpole,
and a scene reaction (`pulseRidge` / `setConverge` / `flareBloom`) wired to the beat.

The new V2 sections were added with ONE atom each: `.reveal-fade` (a flat opacity +
12px rise). That is the single quietest atom in the vocabulary, so they read as a
different, cheaper page. They are ALSO missing the two things that make the old
sections feel alive: a STAGGER (so a group enters as a composed ledger, not one
block) and a SCENE REACTION (so the manifold answers the beat).

The fix is NOT to invent new motion. It is to apply the EXISTING grammar at the EXISTING
density to the new sections, in the right register:

- Every group (`.hero__points`, `.offer__denials`, `.offer__list`, `.offer__cols`)
  enters on a STAGGER, as a ledger, not a single fade.
- Every true numeral that currently only fades (`.hero__proof` facts) COUNTS UP, same
  as the statband, because counting is the data-house tell and these are the same kind
  of fact.
- Every new chapter head uses the per-character clip-rise (`data-chars`), not a plain
  fade, so it develops in like every old head.
- Every new section gets ONE scene reaction keyed to its entrance (a `pulseRidge`), the
  same way the old sections do, so the manifold listens everywhere.
- The equity slot reads as an instrument POWERED ON (a faint grid lights, a baseline
  ignites, a soft pulse travels it), reusing the proven `/performance` idle-waveform
  language, then later DRAWS the real curve. Never a fabricated curve.
- The founder reveal gets a composed two-stage entrance (id resolves, then the bio and
  the pull-quote land), with the pull-quote treated as a held statement (the
  `display-quote` standing-close register), so the page's emotional trust beat carries
  weight equal to the discipline close.

Result: the new sections reach parity (same atoms, same density), then go BEYOND by
adding the equity slot's powered-on instrument beat, which no old section has.

"MORE VISIBLE": where the new sections lean on the dimmest greys (`--grey-700`,
`--grey-825` separators, `--grey-900` borders), raise the RESTING legibility and the
on-reveal contrast one notch within the token system (Section 9), so the owner notices
the difference without losing prestige restraint. We never add a color; we use the
brighter tiers we already own (`--paper-dim` -> `--paper` on the key tokens, the signal
hairline as the one pixel of intent).

---

## 1. THE ONE VOCABULARY (easing, stagger, scene reaction) USED EVERYWHERE

This is the single language. No section invents its own. Builders read these numbers
here and nowhere else, so the page reads as one hand.

### 1.1 Easing (the four house curves, already in CSS `--ease-*` and `scroll.js EASE`)

| Token | Curve | Used for, on the landing |
|---|---|---|
| `EASE.out` | `cubic-bezier(0.16, 1, 0.3, 1)` | DEFAULT. Every fade-rise, every stagger, every underline draw, the count-ups, the parallax-adjacent moves, the equity slot power-on, the founder reveal. |
| `EASE.settle` | `cubic-bezier(0.22, 1, 0.36, 1)` | Per-character clip-rise + variable-weight settle ONLY (the `data-chars` heads). |
| `EASE.inOut` | `cubic-bezier(0.65, 0, 0.35, 1)` | The System pin cross-fades only (already wired in scroll.js). Not used by new sections. |
| `EASE.cinema` | `cubic-bezier(0.83, 0, 0.17, 1)` | RESERVED. The intro lift + the ONE System-pin convergence settle. The landing already spends its single cinematic beat on the System pin. NO new section may use `EASE.cinema`. The equity-curve DRAW (when real) eases with `EASE.out`, not cinema. |

`EASE.cinema` stays precious: ONE tentpole per page. The new sections raise density
with `EASE.out` staggers and `EASE.settle` heads, never a second cinematic beat.

### 1.2 The stagger constants (one set, every group on the page)

These mirror what scroll.js already uses for pillars/rows, so a new group enters at the
same cadence as the old ledgers. Builders use these exact numbers:

```
STAGGER.row    = 0.07   // ledger rows / list items entering as a sequence
                        // (matches scroll.js pillars delay (i % 3) * 0.07)
STAGGER.bullet = 0.06   // tight scannable bullets (hero points, denials)
STAGGER.char   = 0.02   // per-character head clip-rise (scroll.js animateChars default)
STAGGER.word   = 0.018  // word reveals (scroll.js reveal-words / type-mono)
DUR.fade       = 0.8    // the house fade-rise duration (scroll.js .reveal-fade)
DUR.row        = 0.7    // a ledger row's rise (scroll.js pillar)
DUR.head       = 0.78   // a char head settle (scroll.js animateChars)
DUR.count      = 1.6    // count-up (scroll.js [data-count])
RISE.fade      = 18     // px, the house fade-rise y distance
RISE.row       = 24     // px, a ledger row's rise (slightly heavier than a fade)
```

A group of N items enters with `stagger: STAGGER.row` (or `.bullet`), `EASE.out`. The
LAST item lands ~`(N-1) * stagger + DUR` after the first, which for the offer columns
(4 items) is ~`0.21 + 0.7 = ~0.9s`, the same composed-ledger feel as the pillars. Never
animate all items at once (that is the flat fade that reads cheap); never stagger so
slowly the reader waits (cap any group's total entrance at ~1.1s).

### 1.3 Trigger lines (one set, do not invent new fractions)

From IMMERSION_VISION section 1, already used everywhere:

```
heads     -> ScrollTrigger start "top 88%"
mono      -> "top 90%"
words     -> "top 82%"
fades/rows-> "top 90%"  (revealOnEnter default 0.9)
section rule -> "top 85%"
scene reactions (pulseRidge on enter) -> rootMargin "0px 0px -22% 0px" (matches
             landing.js initBridgePulse), so the manifold answers as the chapter
             is genuinely arriving, not on first pixel.
```

### 1.4 The scene-reaction palette (drive via the public API, guarded)

The manifold is the argument. Every section gets ONE reaction, in the right register,
so the scene listens everywhere. Reach it via `window.__meridianScene`; EVERY call is
guarded so a null scene / missing method is a silent no-op (exactly as landing.js
`scenePulse()` and performance.js already do):

| Reaction | API call | Register / when |
|---|---|---|
| Ridge pulse | `pulseRidge()` | The default "the manifold answers this beat." One per section entrance, one per signal-word, one per bridge (already wired). The new sections each get exactly ONE on entrance. Throttle: never more than one pulse per ~600ms (coalesce). |
| Gather | `setConverge(0..1)` | RESERVED for the System pin (scroll.js owns it) and, NEW, the equity slot power-on may nudge a brief, small gather to ~0.35 then RELEASE (`setConverge(null)`) so the slot's ignition reads as the field briefly focusing on the one signal. Optional; if it competes with the pin in any way, drop it and use `pulseRidge()` only. The pin's gather is sacrosanct. |
| Flare | `flareBloom()` | The page's ONE flare belongs to the System pin (scroll.js). NO new section fires `flareBloom`. The equity slot, the founder, the offer NEVER flare. |
| Arrival continuity | `enterFrom(p, c)` | The landing seeds the OUTBOUND arc on unload (the sub-pages read it); the landing itself enters under the intro and does not `enterFrom`. Confirm the persist-on-unload write still happens (scene.js `persistArc` runs on unload); landing.js adds nothing here. |

Scene-reaction rule: a reaction must be a CONSEQUENCE of a reveal the reader sees, never
a free-running animation. Throttle pulses (one per section, coalesced), and NEVER fire a
scene reaction during the System pin's converge ramp (the pin owns the field there).

### 1.5 Reduced motion + no-WebGL (one contract, every new beat)

Every beat below degrades the same way, no exceptions:
- `prefers-reduced-motion`: the section renders in its FINAL composed state, fully
  legible, no rise, no stagger, no count animation (numerals show their final value),
  no pulse. The equity slot shows its grid + baseline + caption STATIC (no traveling
  pulse). The founder shows fully resolved. Nothing is ever hidden without a guaranteed
  static reveal (the `.js` gate + the 6s failsafe in main.js still apply).
- Mobile (`<=768px`): pins/scrubs already degrade (scroll.js); the new staggers still
  run as cheap entrance fades (transform/opacity only), but the equity slot's traveling
  pulse pauses offscreen and the founder grid stacks. No layout animation, ever.
- No-WebGL / null scene: every scene call is a guarded no-op. The equity slot still
  powers on via CSS/canvas (it does not need the 3D scene). The page is unaffected.

---

## 2. SECTION-BY-SECTION CHOREOGRAPHY

Each section below specifies: ENTRANCE (which reveal atom, what staggers), SCRUB/PIN
(any held or scrubbed beat), SCENE (the manifold reaction via the public API), MICRO
(the reward-layer interactions). "(Has)" = ships today, keep. "(Add)" = this brief's
new work. The NEW V2 sections are marked NEW and must tick every row.

### 2.0 HERO (`#hero`) including the NEW `.hero__points` + `.hero__proof`

The hero's display lines already cascade beautifully from the intro handoff
(`scroll.js onIntroDone`: wordmark first, statement lines, two ridge ignitions, then the
sub + actions reveal last). KEEP that exactly. The gap is the two NEW V2 blocks that sit
between the sub and the actions, and after the actions: `.hero__points` (4 bullets) and
`.hero__proof` (5 facts). Today both are a single `.reveal-fade` (one flat fade for the
whole `<ul>` / whole `<p>`), which is why the new hero content reads quieter than the
display lines above it.

- ENTRANCE (the cascade order, extend `onIntroDone`'s rising column):
  The hero reveals as ONE rising column. The points and proof must land IN that column,
  staggered, not as a separate late fade. Wire them into the existing
  cascade timeline (landing.js can observe the hero, or, surgically and home-guarded,
  scroll.js `onIntroDone` releases them). Order and timing:
  1. Wordmark + statement lines (Has).
  2. `.hero__sub` (Has).
  3. `.hero__points` bullets (NEW): each `<li>` rises `y: RISE.fade -> 0`, `opacity 0 ->
     1`, `EASE.out`, `stagger: STAGGER.bullet`, starting ~`subDelay + 0.15`. The 10px
     signal hairline marker (`li::before`) DRAWS IN with the bullet: `scaleX(0) -> 1`
     from left, `EASE.out`, so each bullet's signal tick extends as the line lands (this
     is the per-bullet reward, the same hairline-draw idiom as `.signal-word`). Add the
     transform-origin + transition in `css/landing.css`; toggle a `.is-in` class per
     `<li>` from landing.js as each staggers in (or drive directly with gsap on the
     `::before` via a wrapper span if cleaner; a class toggle on the `<li>` is simplest
     and matches the house pattern).
  4. `.hero__actions` (the CTA + link) reveal next (Has, keep the position so the CTA is
     the visual destination of the column).
  5. `.hero__proof` facts (NEW): the `<p>` rises as a fade (Has), AND its true numerals
     COUNT UP. Today they are `data-fact` text ("3.5M+", "94", "24", "2,500+", "2020"),
     which only fade. Make the three pure-integer-friendly ones (`94`, `24`) count, and
     handle the suffixed ones (`3.5M+`, `2,500+`) and the year (`2020`) as count-ups too
     via the SAME `[data-count]` mechanism scroll.js already runs (it supports
     `data-decimals`, `data-suffix`, `data-group`). Implementation: in landing.js (or a
     home-guarded scroll.js add), after `main.js` binds `data-fact`, ALSO set the
     count-up attributes on these spans so the existing `[data-count]` trigger animates
     them: e.g. `data-count="94"`, `data-count="24"`, `data-count="3.5" data-decimals="1"
     data-suffix="M+"`, `data-count="2500" data-suffix="+" data-group="1"`,
     `data-count="2020"`. The year counts from 0 fast (or, cleaner, set the year to NOT
     count and only fade, since a year counting to 2020 can read odd; RECOMMENDATION:
     count the four magnitudes, leave the year as a fade-in, so "since 2020" reads as a
     fact, not a tally). The count must read the SAME source of truth (the `FACTS` /
     `STATS` values), never a hardcoded number (honesty: bind, do not invent). The
     separators (`&middot;`) stay static at `--grey-825`.
- SCRUB: the HERO EXIT (Has, scroll.js): as the first viewport leaves, the hero column
  lifts, recedes, blurs, dissolves into the void, and the `sceneLead` half-sine nudges
  the manifold so the wordmark dissolves INTO the live field. KEEP EXACTLY. The points
  and proof ride that same exit transform (they are inside `.hero__body`), so they
  recede with the column for free, no extra work.
- SCENE: the two ridge ignitions (wordmark settle, flagship line) Has. The points/proof
  need NO additional scene reaction (the hero already spends two pulses; a third would
  be noise). Do not add one.
- MICRO: the CTA "Get early access" is the single dominant magnetic control
  (`data-magnetic`, center-out underline) Has. The "See how it works" link is the
  secondary left-sweep link Has. The proof facts, once counted, sit at `--paper` (Has,
  `.hero__proof [data-fact] { color: var(--paper) }`), so they are the brightest mono on
  the hero, which is correct (they are the proof). No hover affordance on the proof line
  (it is a readout, not a control).

### 2.1 THESIS (`#thesis`)

- ENTRANCE: the section-rule seam draws (Has). The `.thesis__line` uses `.reveal-words`
  (per-word reveal, the held-aside register) Has, with `.signal-word` "discipline"
  drawing its underline + pulsing the ridge (Has). The `.thesis__aside` fades (Has).
- SCRUB: `data-skew` velocity skew on the thesis line (Has). Keep.
- SCENE: `signal-word` "discipline" pulses the ridge on reveal (Has, scroll.js). One
  pulse, correct.
- MICRO: the `.comment` mono `//` glyph, the italic serif-quote register. Keep.
- PARITY NOTE: this section is already at full density. No change. It is the REFERENCE
  the offer block must match.

### 2.2 FLAGSHIP + PILLARS (`#flagship`)

- ENTRANCE: head clip-rise (`data-chars` on `.flagship__word`) Has. `.flagship__sub`,
  `.flagship__lead` fade (Has). The five `.pillar` rows stagger in as a ledger
  (`(i % 3) * 0.07`, `EASE.out`) Has. `.signal-word` "survive" draws + pulses (Has).
- SCRUB: none (this is a reveal chapter, not a tentpole). Correct.
- SCENE: `signal-word` pulse (Has).
- MICRO: pillar rows are the ledger idiom; on hover the border lifts `--grey-850 ->
  --grey-825` and washes `--grey-900` (Has, shared). Keep.
- PARITY NOTE: full density. The pillars are the LEDGER reference the offer columns
  must match.

### 2.3 THE OFFER BLOCK (`#what-it-is`) NEW V2 SECTION

This is inside `#flagship` (after the pillars). Today every part is a flat `.reveal-fade`
(the head, the lead, the aside) and the denials + columns have NO reveal at all (they
just appear). This is the single biggest under-animation. Bring it to pillar-density.

- ENTRANCE (a composed four-beat ledger, top to bottom):
  1. `.offer__eyebrow` ("What this is", signal-colored): fade-rise, `EASE.out`,
     `start "top 88%"`. It is the chapter marker; keep it the first thing to land.
  2. `.offer__head` ("A research platform you watch prove itself."): this is a
     `display-m`. PROMOTE it to a per-character clip-rise. Wrap its text in
     `<span class="mask" data-chars><span class="mask__inner">...</span></span>` in
     index.html so scroll.js's mask loop splits + settles it with `EASE.settle`, exactly
     like the discipline / proof / waitlist heads. (Today it is a plain `.reveal-fade`
     `<h3>`; the markup change is the only way it reaches head parity. This is required.)
  3. `.offer__lead`: fade-rise (Has, keep).
  4. `.offer__denials` (3 items, "Not a fund / Not copy-trading / Not advice"): STAGGER
     in as a ledger, `stagger: STAGGER.bullet`, `EASE.out`, `start "top 90%"`. Each
     denial's signal dot (`li::before`, the 5px signal disc) IGNITES as the line lands:
     animate it `scale(0) -> 1` + opacity, `EASE.out`, with the line. The denials sit at
     `--paper` (Has), so they are the brightest copy in the block, which is right (they
     are the sharp "this is NOT" facts). Drive via a `.is-in` class per `<li>` toggled on
     the stagger (landing.js), with the CSS owning the dot's `scale`/transition.
  5. `.offer__cols` (the two columns, "Who it is for" / "What early access includes"):
     reveal as TWO sub-ledgers. The two `.offer__col-head` labels draw their bottom
     hairline (`border-bottom`, today static `--grey-850`) as a LEFT-anchored
     scaleX draw on enter (the seam-draw idiom), `EASE.out`. Then the `.offer__list`
     items in each column stagger in, `stagger: STAGGER.row`, `EASE.out`, `start
     "top 90%"`, with the LEFT column leading the RIGHT by ~0.12s so the eye reads
     who-it-is-for then what-you-get (a deliberate reading order, not two columns firing
     at once). Each `.offer__list li`'s top hairline (`border-top`, today `--grey-900`)
     draws left-to-right with its row (reuse the same scaleX hairline idiom). The
     `.offer__k` keyword (`--paper`, 500) is the bright anchor of each row.
  6. `.offer__aside` ("Each capability opens as it is validated..."): fade-rise (Has).
- SCRUB: none. The offer is a reveal chapter (it sits before the System pin, the page's
  one tentpole). Do not add a pin.
- SCENE: ONE ridge pulse as the `.offer__head` settles (the manifold answers "here is
  what this is"). Fire from landing.js via an IntersectionObserver on `.offer`
  (rootMargin `-22%`), guarded, once. NOT a flare, NOT a gather. One quiet pulse.
- MICRO: the `.offer__list li` rows are a ledger; give them the SAME hover wash as the
  pillars/roadmap (`border` lifts `--grey-900 -> --grey-825`, faint `--grey-900`
  gradient), so the dense list feels identical to every other ledger on the property.
  This is "more visible" done right: the resting separators stay quiet, but on hover the
  row answers. (Add the hover rule in `css/landing.css` reusing the shared tokens; do not
  make them magnetic, they are not CTAs.) The two CTAs/bridges in this region keep their
  existing link grammar.
- "MORE VISIBLE" tuning here: the `.offer__list li` resting text is `--paper-dim`
  (correct for body), but the `.offer__note` and `.offer__aside` are `--grey-700`. Keep
  `--grey-700` (it is the readable floor) but ensure the `.offer__k` keywords and the
  `.offer__denials` carry `--paper` so each row has a bright anchor. Raise the
  `.offer__col-head` from a static hairline to a drawn one (above) so the columns feel
  composed, not boxed.

### 2.4 THE SYSTEM PIN (`#system`) the tentpole

The gold standard. Five steps cross-fade in a pinned frame; the field gathers
(`setConverge` smoothstep `0.45 -> 0.96`); one `flareBloom` on lock; the Status headline
hands off. landing.js already adds the chain-of-custody spine that lights node-by-node.
KEEP ALL OF IT. This is the page's ONE `EASE.cinema` beat and ONE flare.

- ENTRANCE: head clip-rise, sub fade, the pin engages at `top top`, holds `+= N*105%`.
  (Has.)
- PIN: step cross-fade (`EASE.inOut`), converge ramp (smoothstep), `is-resolved` on the
  last step, one flare, handoff to `#proof .proof__title`. (Has.) The chain spine fills
  node-by-node (landing.js). (Has.)
- SCENE: `setConverge` ramp + `pulseRidge` per step + ONE `flareBloom` on lock. (Has.)
- MICRO: the pinned-caption cursor whisper (`data-cursor-pinned="the field converging on
  one signal"`) (Has). The running counter + the chain spine. (Has.)
- DIRECTOR NOTE: do NOT touch the pin's converge response, easing, or timing. The new
  sections raise to its NEIGHBORHOOD of density; they never compete with its cinematic
  register. The one thing to verify: the chain spine's reveal (`.is-ready` fade) lands
  cleanly when the pin engages and not before (landing.js already guards this).

### 2.5 DISCIPLINE (`#discipline`)

- ENTRANCE: head clip-rise (two `data-chars` masks) Has. lead fade Has. three `.tenet`
  rows reveal (Has). `.signal-word` "confess" draws + pulses (Has).
- SCRUB/PIN: the discipline held beat (Has, scroll.js): a brief recessed pin where the
  three roman ghosts scrub and the section recedes to its darkest read (`.is-recessed`),
  the tenets focus one at a time. KEEP. This is a recessed beat, not a tentpole (no
  flare), a deliberate dimming contrast to the System pin's gather.
- SCENE: `signal-word` pulse (Has). The recessed beat does not drive converge (correct).
- MICRO: the `.tenet__ghost` roman numerals parallax (Has, scroll.js auto-applies
  `data-parallax` to `.tenet__ghost`). The `.discipline__close` is a held `display-quote`
  (Has). Keep.
- PARITY NOTE: full density. This is the register the FOUNDER pull-quote must match.

### 2.6 PROOF + STATBAND + THE EQUITY SLOT (`#proof`)

The head ("What is true today.") is owned by the System-pin handoff (Has). The statband
counts up (Has, `[data-count]` via scroll.js). The NEW part is the equity slot
(`#equity-slot`), today a static panel (grid + label + caption + link) with NO motion.

- ENTRANCE:
  - `.proof__title`: char head, revealed by the pin handoff (Has). Without the pin
    (reduced/mobile) it reveals on its own trigger (Has).
  - `.proof__lead`: fade (Has).
  - `.statband`: the four `.stat__val` numerals COUNT UP (Has, `[data-count]`). The
    secondary footnote stats (the struck `0`, `1`, `2020`) reveal via `.stat--zero
    .is-in` (Has). KEEP. Ensure the count-up STAGGERS across the four stats so the band
    fills left-to-right rather than four simultaneous tallies: give each `.stat__val` a
    small ascending `delay` (i * 0.08) on its count tween (a one-line add where the
    `[data-count]` trigger fires; if done in scroll.js it must be home-guarded, but it is
    cleaner to leave scroll.js alone and accept the simultaneous count, which is already
    acceptable. RECOMMENDATION: leave the statband as-is; it already counts and reads
    well. Do not over-engineer.)
  - `.proof__curve` (`#equity-slot`) NEW MOTION: see Section 2.6.1 below. It POWERS ON.
  - `.proof__aside`, the bridge: fade (Has).
- SCRUB/PIN: none here (the System pin already handed off into this chapter).
- SCENE: ONE ridge pulse as the equity slot powers on (the manifold answers the
  instrument waking). Guarded, once, from charts.js/landing.js. Optionally a small,
  brief `setConverge(0.35)` then release as the baseline ignites (the field focuses on
  the one signal as the instrument lights), but ONLY if it does not read as competing
  with the System pin's gather that just resolved; if in any doubt, `pulseRidge()` only.
- MICRO: the equity slot's bridge link ("See the methodology and the live research") is
  the secondary link grammar (Has). The slot itself is a readout (not interactive beyond
  the link).

#### 2.6.1 THE EQUITY SLOT POWER-ON (the new section that goes BEYOND parity)

This is the landing's new signature instrument beat, the equivalent of the
`/performance` reserved Results slot. It must read as an instrument powered on and
WAITING, never a fabricated curve. The choreography, on entrance (`#equity-slot` crosses
`top 85%`):

1. The panel border draws: the frame's hairline (`--grey-850`) lights from a dim resting
   state to its full hairline as the slot enters (a brief opacity/border lift, `EASE.out`).
2. The grid lights: `.proof__curve-grid` fades from 0 to its resting `opacity: 0.7`
   (`EASE.out`, ~0.6s), the radial mask already focuses it center. This is the "screen
   powers on" beat.
3. The baseline IGNITES: a dead-flat horizontal baseline in the signal hue draws across
   the slot center, left to right (`stroke-dashoffset` on an SVG line, or a `scaleX(0)
   -> 1` from left on a 1px element, `EASE.out`, ~0.9s). A FLAT line, deliberately, so it
   can NEVER be misread as a rising equity curve. This reuses the `/performance`
   idle-waveform's honesty principle (flat baseline, no rise/fall/knee).
4. The pulse TRAVELS: once the baseline is lit, a single soft signal swell (a gaussian
   crest, the exact `makeIdleWaveform` shape) glides left-to-right along the baseline,
   looping slowly (~one pass per ~4s, `phase += 0.0045`-class drift), with a faint bright
   node riding the crest. This is the "instrument alive, waiting" heartbeat. It is the
   landing's analogue of the `/performance` reserved waveform.
5. The label + caption fade in (the `[ live research, backtest in progress ]` label in
   signal, the caption in `--grey-700`), `EASE.out`, after the baseline lights, so the
   copy lands on a powered instrument, not a blank box.

This is rendered by the NEW `js/charts.js` module (Section 3), NOT bespoke code in
landing.js. The slot's pulse loop obeys the EXACT performance budget of the
`/performance` idle waveform: ONE rAF, IntersectionObserver-paused offscreen,
visibility-stopped on tab-hide, zero per-frame allocation, reduced-motion = one composed
static frame (grid + flat baseline + one centered crest, no travel). No-WebGL is fine
(this is a 2D canvas/SVG, independent of the 3D scene). When the real artifact lands
later, charts.js DRAWS the real curve over the same slot (Section 3.4) and the idle never
starts. NO fabricated curve, ever, until `STATUS === "live"` AND a non-empty point array
exists.

"MORE VISIBLE" here: today the slot is all dim greys on void (grid `--grey-900`, caption
`--grey-700`). The power-on sequence (grid lighting, baseline igniting in SIGNAL, the
traveling crest at `rgba(200,85,61,0.7)`) raises the slot from "a faint empty box" to "a
live instrument," which is exactly the visibility lift the owner wants, achieved with the
one signal hue and motion, not a new color.

### 2.7 THE FOUNDER (`#founder`) NEW V2 SECTION

Today: section-rule (Has), eyebrow, and the bio `.reveal-fade` + the pull-quote with NO
reveal motion (it just appears). The founder is the page's TRUST keystone and must carry
weight equal to the discipline close. Bring it to head + held-statement parity.

- ENTRANCE (a composed two-stage reveal: the person resolves, then the testimony lands):
  1. `.section__rule` seam draw (Has).
  2. `.eyebrow` ("The founder") fade (Has).
  3. STAGE ONE, the identity: `.founder__name` ("Arhan Canli", a `display-m`). PROMOTE
     to a per-character clip-rise: wrap in `<span class="mask" data-chars><span
     class="mask__inner">Arhan Canli</span></span>` in index.html so scroll.js settles it
     with `EASE.settle`, exactly like every other name/head on the property (today it is a
     plain `<h2>` that only sits there). The `.founder__role` ("Founder", signal-colored)
     fades in just after, `EASE.out`. This is the "the person resolves into focus" beat.
  4. STAGE TWO, the testimony: `.founder__lead` (the bio) fade-rise (Has, keep), starting
     after the name settles (a ~0.2s gap so the name leads).
  5. THE PULL-QUOTE ("A claim is worth nothing until the evidence is on the record."): a
     `display-quote`, the held-statement register. Reveal it with a SLOW WORD reveal
     (`.reveal-words` grammar: per-word `opacity/y`, `stagger: STAGGER.word`, `EASE.out`,
     `start "top 82%"`), the SAME treatment IMMERSION_VISION 3.3 specifies for the
     `/performance` standing close. The left signal border (`border-left: 1px solid
     --signal`, Has) DRAWS top-to-bottom (`scaleY(0) -> 1`, `EASE.out`) as the quote's
     words land, so the signal rule "writes" the quote into the record. This is the
     founder's standing-close moment, parity with the discipline close + the
     `/performance` standing close.
- SCRUB/PIN: none. The founder is a held REVEAL, not a tentpole (one tentpole per page).
- SCENE: ONE ridge pulse as the pull-quote's last word lands (the manifold answers the
  thesis statement), guarded, once. NOT a flare. The pull-quote IS the page's quiet
  emotional payoff; one pulse marks it, no more.
- MICRO: the founder block has no interactive controls; the bio links (if any) use the
  shared body-link underline. The broken-grid asymmetry already lives in
  `.founder__body` (the `0.8fr / 1.6fr` split). The page's ONE asymmetry is the flagship
  intro / pillars split (DESIGN_SYSTEM 2); the founder's split is a layout choice, not a
  second "tell" asymmetry, so it is fine, but do NOT add a third deliberate asymmetry
  elsewhere.
- "MORE VISIBLE": the bio is `--paper-dim` (correct body), the pull-quote is `--paper`
  (Has, the bright held statement), the role is signal (Has). This is already the right
  contrast hierarchy; the motion is what was missing. Do not brighten the bio further.

### 2.8 THE HOUSE / PROGRESS (`#progress`)

- ENTRANCE: head clip-rise (two `data-chars` masks) Has. lead fade (Has, with the
  `data-fact="phases"` "12" inline). The four `.roadmap__row` rows stagger in as a ledger
  (`(i % 4) * 0.06`, `EASE.out`) Has. `.house__aside`, bridge fade (Has).
- SCRUB/PIN: none (the roadmap tentpole lives on `/progress`; the landing teaser is a
  reveal). Correct.
- SCENE: no dedicated pulse today; ADD ONE ridge pulse as the live roadmap row
  (`.roadmap__row--live`, AlphaForge / Paper trading) enters, so the manifold answers the
  one proven, live sleeve. Guarded, once, from landing.js (IntersectionObserver on the
  live row, `-22%`). This brings the section to the "scene answers every chapter"
  consistency the rest of the page now has.
- MICRO: roadmap rows get the shared ledger hover wash (Has, `data-magnetic-row` is NOT
  applied here, and should not be; these are not CTAs). The live row's `.dot` is the
  status mark. The "12" should COUNT UP: it is currently a `data-fact` text. Apply the
  same `data-count` treatment as the hero proof facts (`data-count="12"`), bound to
  `FACTS.phases`, so the one numeral in the lead tallies like every other true number on
  the page. (Add in landing.js after main.js binds `data-fact`.)
- PARITY NOTE: with the pulse + the count-up "12", this section matches the rest.

### 2.9 WAITLIST (`#waitlist`)

- ENTRANCE: head clip-rise (two `data-chars` masks) Has. intro fade (Has). The form
  reveals; the `.waitlist__label` underline draws (the arrival beat, landing.js
  `.is-lit`) Has. aside fade (Has).
- SCRUB/PIN: none. Correct (the page's tentpole is the System pin).
- SCENE: the waitlist arrival beat (landing.js): one ridge pulse as the chapter enters
  (Has). KEEP. This is the page arriving at its decision. No flare.
- MICRO: the submit button is the dominant magnetic CTA (`data-magnetic`, center-out
  underline) Has. The input has the `is-text` cursor state, focus ring, etc. (shared
  cursor.js) Has. The form fill-from-left on submit (waitlist.js) Has. Keep.
- PARITY NOTE: full density (it was always a strong section). No change.

### 2.10 FOOTER (`#footer`)

- ENTRANCE: the giant `.footer__wordmark` parallaxes (Has, scroll.js auto-applies
  `data-parallax 0.12` to `.footer__wordmark`). The status dot pulses (Has). The link
  grid is shared chrome (shell.js). No new motion needed; the footer is a quiet landing,
  not a reveal moment. KEEP.
- SCENE: none (the page has resolved; the footer is the colophon). Correct.

---

## 3. THE CHARTS MODULE: `js/charts.js` + `css/charts.css`

A NEW reusable data-viz module the landing owns, built so `/performance` adopts it next
without a rewrite. It renders THREE component types from a data contract, each with an
HONEST empty / "backtest in progress" state and a clean draw-when-real path. It is
GPU-light: lightweight `<canvas>` (or inline SVG), animating ONLY `stroke-dashoffset` /
transform / opacity, never layout. It reuses the EXACT visual language and budget of the
`/performance` `drawCurve` + `makeIdleWaveform` (void ground, ONE signal hue
`#C8553D` / `--signal`, line aesthetic, one shared rAF, IO-paused, reduced-motion static).

### 3.1 The data contract (extend `js/performance_data.js`; do not invent a parallel one)

The charts module reads the SAME contract `/performance` already defines in
`js/performance_data.js`, so there is one source of truth across pages. The landing
imports from it (or from a thin re-export). Relevant exports already present:

```
STATUS           // "reserved" | "live"  (treat anything != "live" as reserved)
EQUITY_CURVE     // [] while reserved; [{ t, v }, ...] when live  (x position, equity)
CAPACITY_CURVE   // [] while reserved; [{ capital, netEdge }, ...] when live
GAUNTLET         // the 6 measures (label, gate, value, passed) for the DSR/PBO/gauntlet visual
GAUNTLET_PARAMS  // trials, baseline, purge, embargo (design facts, not results)
RESERVED_COPY    // honest empty-state strings
isLive()         // STATUS === "live"
```

The charts module NEVER reads a number not in this contract, and renders the reserved
state whenever `!isLive()` OR the relevant point array is empty. A future builder wires
the real backtest by populating `EQUITY_CURVE` / `CAPACITY_CURVE` / `GAUNTLET[].value`
and flipping `STATUS = "live"`; the charts redraw with no markup change. (Mirror the
operator note already at the top of performance_data.js.)

If the landing needs a contract field `/performance` does not yet export, ADD it to
`performance_data.js` (the shared file), do not fork a second data file.

### 3.2 The three components (one factory, three variants)

A single factory `createChart(mount, { type, data, ...opts }) -> { draw, destroy,
setData, resize, powerOn }`, so all three share one render core, one rAF discipline, one
honest-empty branch. The variants:

1. `type: "equity"` THE EQUITY CURVE.
   - Reserved: powers on (grid lights, flat signal baseline ignites left-to-right, one
     soft crest travels it, looping), per Section 2.6.1. HONEST: a flat baseline cannot
     be misread as a rising curve.
   - Live (`isLive()` AND `EQUITY_CURVE.length >= 2`): DRAWS the real out-of-sample curve
     by animating `stroke-dashoffset` from full length to 0 (the curve "draws in" left to
     right), `EASE.out`, ~1.4s, in `--signal`, on void, no fill, 1.5px line (matches
     `drawCurve`). A faint baseline grid behind it. The leading point gets the bright
     node. NO axis numbers unless the contract provides true tick labels.
2. `type: "capacity"` THE CAPACITY CURVE.
   - Reserved: the same honest power-on idle (flat baseline + traveling crest), with the
     pulse traveling RIGHT-TO-LEFT and a small phase offset, so it reads as a DIFFERENT
     instrument in the same world (exactly the `makeIdleWaveform` `reverse` convention),
     never a fabricated knee.
   - Live: draws the capacity curve (`capital` x, `netEdge` y) the same draw-in way. The
     knee/rolloff is a PROPERTY OF THE DATA, never drawn unless the points carry it.
3. `type: "gauntlet"` THE DSR / PBO / GAUNTLET VISUAL.
   - This is the validation visual: a small multiples / bar-and-gate read of the six
     `GAUNTLET` measures (DSR, PSR, PBO, purged walk-forward, CPCV, baseline gate). Each
     measure is a row with its label, its GATE (the must-clear threshold, a true design
     fact), and a marker for the measured value vs the gate.
   - Reserved: every row shows its label + gate + a "reserved" marker (the `--` glyph and
     a dim "Reserved" chip, exactly the `/performance` `renderGauntlet` tri-state), with
     a single soft sweep animating across the rows on power-on (a stagger reveal of the
     rows, `STAGGER.row`, `EASE.out`), so it reads as a configured instrument. NO
     fabricated pass/fail, NO fabricated value (the gauntlet's whole point is honesty
     about what has not cleared).
   - Live: each row fills its value vs gate and flips its chip to the honest verdict
     (Clears / Holds), driven by `GAUNTLET[].value` / `.passed`. The verdict is RESTRAINED
     (the result so far is "not yet"); never a triumphant treatment.
   - On the LANDING, the gauntlet visual is OPTIONAL (the landing slot recommendation is
     ONE honest equity frame + caption + link; the six fields stay a `/performance`
     detail per LANDING_STRUCTURE_V2 3.2). Build the `gauntlet` variant in charts.js so
     `/performance` can adopt it, but MOUNT only the `equity` variant on the landing's
     `#equity-slot` for now. Keep the landing slot to one honest frame.

### 3.3 The clean public API (so `/performance` adopts it next)

```
import { createChart } from "./charts.js";

const chart = createChart(mountEl, {
  type: "equity" | "capacity" | "gauntlet",
  // data is read from performance_data.js by default; pass explicitly to override:
  status: STATUS,                 // "reserved" | "live"
  points: EQUITY_CURVE,           // [] => reserved; >=2 => draw real
  reservedCopy: RESERVED_COPY,    // honest empty-state strings
  reducedMotion: <bool>,          // caller passes the media-query result
  onPulse: () => scene.pulseRidge(), // OPTIONAL: the chart calls this once on power-on
                                     // so the manifold answers; guarded by the caller.
});

chart.powerOn();   // run the honest power-on sequence (idle) if reserved
chart.draw();      // draw the real curve if live + non-empty (else no-op)
chart.setData(...) // re-point and redraw (for a future live wiring without reload)
chart.resize();    // debounced; the caller wires window resize
chart.destroy();   // disconnect IO, cancel rAF, free the canvas
```

Contract guarantees the API must hold:
- `powerOn()` on a reserved chart starts AT MOST one shared rAF, IO-paused offscreen,
  visibility-stopped on tab-hide, zero per-frame allocation (reuse one scalar phase + one
  reused point buffer). If TWO reserved charts exist on a page (the future `/performance`
  case), they share ONE rAF (the `initIdleWaveforms` pattern: one driver renders only the
  on-screen canvases), never two concurrent loops.
- `draw()` is a guarded no-op unless `isLive()` AND `points.length >= 2`. It can NEVER
  draw a fabricated point.
- Reduced motion: `powerOn()` renders ONE composed static frame (grid + flat baseline +
  one centered crest, no travel) and returns without starting a loop. `draw()` renders
  the final curve statically (no draw-in animation).
- No-WebGL / null scene: the chart is independent of the 3D scene; `onPulse` is the only
  scene touch and is guarded by the caller. The chart renders fully.
- The `onPulse` callback fires ONCE per `powerOn()` (not per frame), so the manifold
  answers the instrument waking, not the loop.

### 3.4 Mounting into the landing `#equity-slot` (honest-pending)

In `js/landing.js` (or a thin import in index.html's module load order, after main.js),
mount the equity chart into the existing `#equity-slot`:

- Keep the existing honest markup (the grid, the `[ live research, backtest in progress ]`
  label, the caption, the bridge link). The chart RENDERS INTO the slot (a `<canvas>` it
  appends, or it lights the existing `.proof__curve-grid` and draws the baseline over
  it), it does not replace the copy. The label + caption stay the honesty anchor.
- Call `createChart(equitySlot, { type: "equity", status: STATUS, points: EQUITY_CURVE,
  reservedCopy: RESERVED_COPY, reducedMotion, onPulse: scenePulse })`, then on the slot's
  entrance (IntersectionObserver, `top 85%` / `-15%` rootMargin), call `powerOn()` (and
  `draw()`, which is a no-op while reserved). The `onPulse` fires the ONE ridge pulse for
  the slot (Section 2.6 scene). Guard everything; if charts.js fails to load or throws,
  the slot stays its current static honest frame (the existing markup is the failsafe,
  exactly like landing.js wraps its boot in try/catch).
- Because `STATUS === "reserved"` today, the slot powers on to the idle (flat baseline +
  traveling crest) and NEVER draws a curve. When the grand backtest lands, the operator
  populates `EQUITY_CURVE` + flips `STATUS`, and `draw()` renders the real curve over the
  same slot with no markup change. This is the "wire in later" path, already clean.

### 3.5 `css/charts.css` (the new stylesheet, additive, shared-token only)

- Owns ONLY the chart components' presentation: the `<canvas>` sizing inside a mount, the
  powered-on grid lift, the baseline/curve container, the reserved chip + value glyph
  styling for the gauntlet variant, and the reduced-motion static rules.
- Built ENTIRELY from existing tokens (`--signal`, `--signal-deep`, `--signal-glow`,
  `--signal-faint`, `--grey-*`, `--void`, `--ease-out`, `--s-*`). It defines NO new
  token, NO new color, NO new easing. It may ADD component classes only (DESIGN_SYSTEM
  0.2).
- Loaded LAST in the head of any page that uses it (after the shared sheets), like
  `landing.css`. On the landing, add `<link rel="stylesheet" href="./css/charts.css" />`
  after `landing.css`. `/performance` adds the same line when it adopts the module.
- It must NOT redefine `.proof__curve` / `.proof__slot` (those are owned by landing.css /
  performance.css); it styles the chart's OWN internals (e.g. `.chart__canvas`,
  `.chart__baseline`, `.chart__row`, `.chart__chip`). The host slot keeps its frame.

---

## 4. THE BUILD CONTRACT (what "done" looks like, and the guardrails)

A landing builder is done when EVERY section ticks its row in Section 2, the charts
module ships per Section 3, and ALL of these hold:

- ONE vocabulary: every reveal uses `EASE.out` / `EASE.settle` and the Section 1.2
  stagger constants. No section invents a curve or a cadence. The new sections are
  indistinguishable in CADENCE from the old ones (the offer reads like the pillars, the
  founder pull-quote reads like the discipline close, the equity slot reads like the
  `/performance` reserved waveform).
- ONE cinematic beat: the System pin keeps the page's only `EASE.cinema` + only
  `flareBloom`. No new section adds a second.
- ONE asymmetry: the flagship/pillars broken grid stays the page's deliberate tell. No
  new section adds a competing one (the founder split is layout, not a tell).
- The scene LISTENS everywhere: every chapter (hero, thesis, flagship, offer, system,
  discipline, proof+slot, founder, progress, waitlist) drives exactly ONE guarded scene
  reaction on its beat (a `pulseRidge`, or the pin's `setConverge`/`flareBloom`), with
  pulses throttled (one per section, coalesced), and NEVER a reaction during the pin's
  converge ramp.
- HONESTY: the equity slot stays honestly pending (`STATUS === "reserved"`), powers on to
  a FLAT baseline + traveling crest, draws NO curve. The offer stays framed as
  forthcoming. The founder stays grounded. Names bind via `data-brand` / `data-flagship`;
  numbers bind via `data-fact` / `data-count` to `FACTS` / `STATS`, never hardcoded.
- "MORE VISIBLE": the equity slot powers on in signal (visible lift); the offer's
  `.offer__k` keywords, `.offer__denials`, and drawn column hairlines raise legibility;
  the hero proof + the "12" count up. All within the token system, no new color.
- PERF: 60fps. transform / opacity / filter / `stroke-dashoffset` only, never layout.
  The charts use a lightweight canvas/SVG, one shared rAF, IO-paused offscreen,
  visibility-stopped, zero per-frame allocation. The three bundle is NOT touched (no new
  geometry, no new 3D). No new npm dependency (charts.js is hand-rolled canvas/SVG, like
  `drawCurve` already is). GSAP/ScrollTrigger are the shared singletons (Vite dedupes).
- REDUCED MOTION + NO-WEBGL: every beat degrades to a composed static state; the equity
  slot shows grid + flat baseline + one centered crest, static; the founder + offer show
  fully resolved; pins become lists; Lenis off; cursor native; the `.js` gate + 6s
  failsafe stand. No content is ever gated behind motion.
- NAV: the top nav keeps NAVIGATING to `/systems` `/performance` `/progress` (shell.js
  `buildNav` uses `item.href`). Nothing here changes that.
- ZERO em dashes (U+2014) in source AND dist. After every change:
  `cd /Users/arhancanli/meridian && npm run build` (green) and
  `grep -rPn "\x{2014}" .` (empty), including the new `js/charts.js` + `css/charts.css`.

---

## 5. THE MARKUP CHANGES THE NEW MOTION REQUIRES (so builders do not guess)

The choreography above needs these SMALL, surgical `index.html` edits (landing-owned
file). They are the minimum to bring the new heads to parity; everything else is JS/CSS.

1. `.offer__head` (`#what-it-is`): wrap its text in a char mask so it clip-rises like
   every other display-m head:
   `<h3 class="offer__head display-m"><span class="mask" data-chars><span class="mask__inner">A research platform you watch prove itself.</span></span></h3>`
   (remove the `reveal-fade` class from the `<h3>`; the mask owns its reveal now).
2. `.founder__name` (`#founder`): same char-mask wrap so the name resolves in:
   `<h2 class="founder__name display-m" id="founder-name"><span class="mask" data-chars><span class="mask__inner">Arhan Canli</span></span></h2>`
   (the `id` stays on the `<h2>` for the `aria-labelledby`).
3. `.founder__pull` (`#founder`): give the pull-quote a word-reveal hook so it lands as a
   held statement: add `reveal-words` to a wrapping span, matching the thesis line and the
   standing-close grammar:
   `<p class="founder__pull display-quote"><span class="reveal-words">A claim is worth nothing until the evidence is on the record.</span></p>`
4. `.hero__points li::before` and `.offer__denials li::before`: these signal marks animate
   in with their line. The simplest house-consistent path is a `.is-in` class toggled per
   `<li>` by landing.js on the stagger, with `css/landing.css` owning the marker's
   `transform: scaleX(0)`/`scale(0)` at rest and `scaleX(1)`/`scale(1)` on `.is-in`,
   `--ease-out`. No markup change needed beyond what exists; landing.js adds the classes.
5. `#equity-slot`: keep all existing children; charts.js appends its `<canvas>` (or lights
   the existing grid + draws the baseline). No copy is removed.
6. The hero proof facts + the progress "12": no markup change; landing.js adds the
   `data-count` (and `data-decimals`/`data-suffix`/`data-group`) attributes after main.js
   binds `data-fact`, reading the value from the already-bound text / `FACTS`, so the
   number is never hardcoded.

These six are the only `index.html` touches. Everything else is `landing.js`,
`landing.css`, `charts.js`, `charts.css`. `scroll.js` is touched only if a hero-cascade
hook for the points/proof genuinely cannot be reached from landing.js; if it must be,
the edit is home-guarded (`isHome`) and confined to releasing the new hero blocks inside
`onIntroDone`, nothing else.

---

## 6. SECTION CHECKLIST (every row must tick, or the section is quieter than its siblings)

| Section | Head clip-rise | Group stagger | Count-up (true numerals) | Scene reaction | Held/scrubbed beat |
|---|---|---|---|---|---|
| Hero | Has (cascade) | NEW: points stagger + marker draw | NEW: proof facts count | Has (2 ignitions) | Has (exit pull-back) |
| Thesis | n/a (word reveal) | n/a | n/a | Has (signal-word) | Has (skew) |
| Flagship + pillars | Has | Has (pillars) | n/a | Has (signal-word) | n/a |
| OFFER (NEW) | NEW: offer__head mask | NEW: denials + cols stagger + hairline draws | n/a | NEW: 1 pulse on head | n/a |
| System pin | Has | Has (chain spine) | n/a | Has (converge + flare) | Has (TENTPOLE) |
| Discipline | Has | Has (tenets) | n/a | Has (signal-word) | Has (recessed beat) |
| Proof + statband | Has (handoff) | n/a | Has (statband counts) | NEW: 1 pulse on slot power-on | n/a |
| EQUITY SLOT (NEW) | n/a | n/a | n/a | NEW: 1 pulse (via onPulse) | NEW: power-on idle (BEYOND parity) |
| Founder (NEW) | NEW: name mask | n/a | n/a | NEW: 1 pulse on pull-quote land | NEW: held pull-quote word reveal |
| Progress | Has | Has (roadmap rows) | NEW: "12" counts | NEW: 1 pulse on live row | n/a |
| Waitlist | Has | n/a | n/a | Has (arrival pulse) | n/a |
| Footer | n/a | n/a | n/a | n/a (resolved) | Has (wordmark parallax) |

When every NEW cell is built, the landing reads as ONE hand from top to bottom: the same
clip-rise heads, the same staggered ledgers, the same count-ups, the same one-pulse scene
answer per chapter, the same easing, and ONE cinematic tentpole. The equity slot and the
founder pull-quote then push it BEYOND the old baseline with a powered-on instrument beat
and a held testimony, both honest, both within the token system, both at 60fps.

DIR.
