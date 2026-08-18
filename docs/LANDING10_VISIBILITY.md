# MERIDIAN / LANDING10 VISIBILITY DIRECTION

The owner's instruction: "make everything more VISIBLE." This document is the
token-respecting contrast, legibility, size, and spacing brief for the landing
(`index.html` / `css/landing.css`), covering every section including the new V2
blocks (`.hero__points`, `.hero__proof`, `.offer`, `.proof__curve`, `.founder`).

This is a VISIBILITY brief, not a redesign. The remit: raise legibility where the
page leans too hard on `--grey-600` / `--grey-700` / `--paper-dim` and the eye has
to work, WITHOUT losing the sovereign-fund restraint. We do not add a color, a
glyph, a weight the type scale does not already carry, or a second accent. Every
raise below is expressible in the existing token system. When a raise would cost
prestige, it is flagged and bounded.

This binds `css/landing.css` and surgical, additive rules only. It NEVER redefines
a shared token, a shared type class, the cursor, nav, rail, or grain (DESIGN_SYSTEM
0.2). Where a shared class (`.label`, `.mono-label`, `.body`) is too dim in a V2
context, scope the raise to the V2 container (e.g. `.offer .mono-label`), never the
global class. Build stays green; em-dash audit stays empty.

---

## 0. THE CONTRAST LADDER (the only tiers you may move between)

The palette already encodes a legibility ladder. Every raise in this doc is "move
this element one rung up the ladder," never "invent a new grey."

| Rung | Token | Hex | Sanctioned use | On `--void` |
|---|---|---|---|---|
| 5 (brightest) | `--paper` | `#F4F1EA` | headlines, key values, the one word that must land | ~14:1 |
| 4 | `--paper-dim` | `#B7B4AC` | body, leads, sub-copy, the readable default for prose | ~8.5:1 |
| 3 (AA floor) | `--grey-700` | `#888A90` | labels, eyebrows, mono captions. THE FLOOR for any text | ~5.0:1 |
| 2 (decorative) | `--grey-600` | `#5C5E63` | idle rail numerals, ghost separators, placeholders. NEVER text the reader must read | ~3.0:1 (fails AA for text) |
| 1 (hairline) | `--grey-825` / `--grey-850` | `#2A2C30` / `#222428` | borders only, never type | n/a |

**The single most common defect on this page:** real, readable text and meaningful
separators are set at rung 2 (`--grey-600`) or below. Rung 2 is decorative-only by
DESIGN_SYSTEM 1; any text or any separator-between-meaningful-values rendered there
must move to rung 3 minimum. That is the spine of every fix below.

**The restraint guardrail:** raising visibility is mostly moving rung 2 -> rung 3,
and rung 3 -> rung 4 for content that is genuinely body copy (not a caption). It is
almost never "make it `--paper`." Bright paper is reserved for the headline, the key
numeral, and the one word per chapter that earns the accent. Flooding the page with
`--paper` would read as loud, not legible. Visibility here means CLARITY OF
HIERARCHY: every tier sits one honest rung brighter, and the gaps between tiers stay
wide enough to read as hierarchy. Do not collapse the ladder.

---

## 1. PRIORITY RANKING (fix these first; the rest is polish)

P0 the owner would notice in three seconds:
1. **`.hero__proof` separators** at `--grey-825` (rung 1, a border token used as a
   visible glyph between facts): invisible. The proof row reads as a run-on. (S2.2)
2. **`.proof__curve` (equity slot)** reads as a dead grey box, not "an instrument
   powered on." The whole point is "alive and waiting." (S6)
3. **`.offer__note` / `.offer__aside`** at `--grey-700` 0.75rem mono: the offer's
   own qualifying copy is the hardest thing on the page to read. (S4.3)
4. **`.sys-chain__num` / `.sys-chain__label` at `--grey-600`** (rung 2) for the idle
   chain nodes in the tentpole: the chain-of-custody read is too faint to follow. (S7)

P1 clear legibility raises:
5. `.hero__points` body bullets sit below `.body` size and contrast for primary
   scannable copy (S2.1).
6. `.offer__list li` body rows at `--paper-dim` with `--grey-900` (rung 1) dividers
   the eye cannot see (S4.2).
7. `.proof__curve-caption` at `--grey-700` for the honesty line that must be read
   (S6.4).
8. `.founder__role` and the founder pull-quote attribution legibility (S5).

P2 prestige-preserving micro-raises: the eyebrow `.idx`, the statband footnote row,
the hero status separator, the `.comment` markers (S8).

---

## 2. HERO (the first screen sets the legibility contract)

### 2.1 `.hero__points` (the new scannable bullets)
- **Current:** `font: 400 0.98rem/1.5 var(--ui)`, color `--paper-dim`, hairline
  signal tick `10px` wide.
- **Problem:** these are the page's first scannable promise, but they are set BELOW
  `.body` (1.0625rem) and at a tighter line-height. The four lines that carry the
  pitch read as a footnote under the sub.
- **Raise (legibility + size):**
  - Bump to `font-size: 1.05rem; line-height: 1.6;` (parity with `.body`, slightly
    airier so the four lines breathe as a list, not a paragraph).
  - Keep color `--paper-dim` (rung 4) but set the FIRST word group / the load-bearing
    noun of each bullet is fine to leave; do NOT brighten the whole list to `--paper`
    (that would compete with the headline). Instead lift legibility via weight: the
    UI font resting weight is 350; these bullets at 400 already read a touch firmer,
    keep that.
  - Widen the tick to `12px` and lift its vertical centering (`top: 0.66em`) so it
    aligns to the cap height of the larger text. The tick is the one signal pixel;
    keeping it crisp is what makes the list read as "engineered," not bulleted.
  - Spacing: increase `gap` from `--s-2` (8px) to `--s-3` (16px) so each promise is
    its own line, not a stacked block. Raise `max-width` from `46ch` to `48ch` to
    avoid mid-promise wraps that hurt scannability.

### 2.2 `.hero__proof` (the new proof cue) -- P0
- **Current:** color `--grey-700`, `[data-fact]` values `--paper`, separators
  `.hero__proof-sep` at `--grey-825` (rung 1), `line-height: 1.9`.
- **Problem:** the `--grey-825` separators are a BORDER token used as a visible
  glyph: at 0.75rem they vanish, so "3.5M+ bars 94 instruments 24 factors" runs
  together. The label words ("bars", "instruments") at `--grey-700` 0.75rem are at
  the floor and small, so the row reads as one dim smear with bright numbers
  floating in it.
- **Raise (contrast + structure):**
  - Move the separators up two rungs: `.hero__proof-sep { color: var(--grey-700); }`
    (rung 3). They are meaningful structure between facts, so they earn the floor, not
    the decorative tier. Reduce their margin slightly (`0 0.45em`) so they read as
    dividers, not spaces.
  - Lift the label words from `--grey-700` to a value between floor and dim: set the
    row base color to `--paper-dim` is too bright for captions; instead keep
    `--grey-700` on the row but bump the row `font-size` to `0.8125rem` and
    `letter-spacing: 0.04em` so the small mono is more legible at the floor color.
  - Keep `[data-fact]` at `--paper` (the values are the point) and consider the count
    treatment in S9 so they animate, drawing the eye to the true numbers.
  - This row is a prime candidate for becoming the most visible "instrument readout"
    on the first screen; the fix is structure (visible dividers) + size, not color
    flooding.

### 2.3 `.hero__status` separator (P2, top-right status line)
- `.hero__status-sep` is at `--grey-600` (rung 2) per styles.css. It is a glyph
  between two readable status facts, so it should be rung 3. Scope a landing raise:
  `.hero__status-sep { color: var(--grey-700); }` (still quiet, now visible). The
  `.hero__status` base color `--grey-700` and `.hero__status-val --paper-dim` are
  correct; leave them.

---

## 3. THESIS / FLAGSHIP / SYSTEM / DISCIPLINE (the established sections, mostly fine)

These older sections are correctly tiered (`.body` prose at `--paper-dim`, labels at
`--grey-700`, headlines at `--paper`). Two micro-raises only, for consistency with
the new sections so the whole page reads at one contrast level:

### 3.1 `.thesis__aside` and the `//` comment markers
- `.thesis__aside` is `--grey-700` (floor) and `.comment` is `--grey-700`. The aside
  is a full readable sentence ("Most platforms show you a chart..."), not a caption,
  so it earns rung 4. Scope: `.thesis__aside { color: var(--paper-dim); }`. Keep the
  `.comment` `//` marker at `--grey-700` (it is a deliberately recessed terminal
  mark, the contrast between the dim marker and the brighter sentence is the texture).
  Apply the same logic to `.house__aside`, `.proof__aside`, `.waitlist__aside`,
  `.offer__aside`: the aside SENTENCE is `--paper-dim`, the `//` marker stays floor.

### 3.2 No change to the pinned step bodies, tenet bodies, pillar descriptions
- These are already `--paper-dim` (rung 4). Correct. Do not touch.

---

## 4. THE OFFER BLOCK (#what-it-is) -- the densest new section, needs the most work

This block carries the positioning ("what this is / who it is for / what you get")
and is currently the dimmest meaningful copy on the page.

### 4.1 `.offer__denials` (what this is NOT)
- **Current:** `li` color `--paper` with a `5px` signal dot. Good contrast.
- **Raise (spacing only):** the three denials sit in a wrapped flex with
  `gap: --s-2 --s-5`. On a wide row they read as one line. Increase the row gap to
  `--s-3` and consider forcing them onto their own lines below the offer head with a
  little more air (`margin-bottom: --s-7` is fine). These are the most important
  honesty statements in the block; let them breathe. No contrast change needed.

### 4.2 `.offer__list li` (who it is for / what you get rows) -- P1
- **Current:** `li` `--paper-dim`, divider `border-top: 1px solid var(--grey-900)`
  (rung 1), `.offer__k` keyword `--paper` weight 500.
- **Problem:** the `--grey-900` dividers are effectively invisible, so the rows merge
  into a soft block. The ledger idiom elsewhere on the page (pillars, tenets, roadmap)
  uses `--grey-850` resting hairlines (rung 1-but-visible). The offer list breaks that
  consistency by going one shade darker.
- **Raise (structure):**
  - Move the row dividers from `--grey-900` to `--grey-850`
    (`.offer__list li { border-color: var(--grey-850); }`). This matches the page's
    resting-hairline standard and makes the rows read as a ledger, the same idiom the
    reader has already learned. This is the single highest-value fix in the block.
  - Keep `li` text at `--paper-dim` (rung 4, correct for body rows).
  - Add the ledger HOVER WASH for consistency with every other row on the page
    (S motion brief owns the wash; from a visibility standpoint, on hover lift the
    border to `--grey-825` and wash a faint `--grey-900` gradient, exactly as the
    pillars/tenets do). A row the reader can hover and see respond reads as live.
  - Slightly increase row padding from `--s-3` to `--s-3 0` plus a hair of horizontal
    inset is optional; the priority is the visible divider.

### 4.3 `.offer__note` and `.offer__aside` -- P0
- **Current:** `.offer__note` `--grey-700` 0.75rem mono ("Opens in order..."),
  `.offer__aside` `--grey-700` 0.75rem-ish.
- **Problem:** these qualify the offer ("each capability opens as it is validated"):
  load-bearing honesty copy, set at the floor color and the smallest size. The reader
  most needs these and can least read them.
- **Raise:**
  - `.offer__note`: lift to `--paper-dim` (it sits directly under a column head and
    modifies it, so it is structural, not a footnote). Bump to `0.8125rem`.
  - `.offer__aside` SENTENCE to `--paper-dim` per S3.1 (the `//` marker stays floor).
  - These are the offer's promises about HONESTY; they must be the clearest mono on
    the page, not the faintest.

### 4.4 `.offer__col-head` and `.offer__eyebrow`
- `.offer__col-head` is already `--paper` (correct, it is a column header).
- `.offer__eyebrow` is `--signal` (the one place the accent labels a block). Correct
  and good. Leave both. The column-head bottom border is `--grey-850` (correct).

### 4.5 `.offer` top divider
- `.offer { border-top: 1px solid var(--grey-900); }` (rung 1, invisible). This is a
  major SECTION boundary inside the flagship; it deserves the resting-hairline tier.
  Raise to `--grey-850` so the offer reads as its own composed block, not a continuation
  of the pillars.

---

## 5. THE FOUNDER SECTION (#founder) -- trust copy must be unambiguously legible

### 5.1 `.founder__lead` (the bio)
- **Current:** `--paper-dim`, `max-width: 64ch`. Correct contrast (it is body prose).
  64ch is slightly over the `.body` 62ch measure; tighten to 62ch for the house
  measure. No color change.

### 5.2 `.founder__role` ("Founder")
- **Current:** `--signal`, `letter-spacing: 0.06em`. The accent on the role label is
  fine (one pixel of intent), but at mono-label size it is small. Keep the color;
  ensure it sits at `mono-label` size and add a touch of weight is unnecessary. Leave
  largely as-is; the name above it (`.founder__name display-m`, `--paper` by the type
  class) is the visible anchor and is correct.

### 5.3 `.founder__pull` (the pull-quote) -- P1
- **Current:** `display-quote` (serif italic, `--paper` per the class), left border
  `1px solid var(--signal)`, `padding-left: --s-4`.
- **Raise (presence, not contrast):** the quote is already `--paper`. To make it
  READ as the emotional payoff (and match the visibility lift the owner wants), give
  the signal left-border slightly more presence: keep `1px` but the motion brief
  should DRAW it in (scaleY) so it reads as ignited, and ensure the quote sits with
  enough air above (`margin-top: --s-5` is fine). No color change; the visibility win
  here is the drawn accent border + the slow word reveal (motion brief), not a
  brighter quote.

### 5.4 Founder section spacing
- The `.founder__body` grid (`0.8fr / 1.6fr`) is the section's one asymmetry. Ensure
  the eyebrow `.idx` for this section (currently bare `/` since it is unnumbered) is
  still visible: the unnumbered `/` at 0.5 signal opacity is very faint. Bump THIS
  idx to full signal opacity OR give the founder eyebrow a real index treatment so
  the section does not read as orphaned. See S8.1.

---

## 6. THE EQUITY SLOT (#equity-slot / .proof__curve) -- P0, "powered on, waiting"

This is the single most important visibility moment the owner named: it must read as
"an instrument powered on and waiting," never a dead grey box, and never a fabricated
curve. It is currently a flat bordered box with a faint grid and grey text.

### 6.1 The container
- **Current:** `border: 1px solid var(--grey-850)`, `min-height: 200px`, centered text.
- **Raise (make it read as a live panel):**
  - The border is fine (`--grey-850` resting hairline). On the active/ready state the
    motion brief should lift one edge or the label to signal; from a visibility
    standpoint the box needs INTERNAL contrast structure so it does not read as empty.
  - Raise `min-height` to `240-280px` so it has the presence of a chart frame, not a
    callout box. An equity panel that is too short reads as a banner.

### 6.2 The grid (`.proof__curve-grid`) -- the "powered on" texture
- **Current:** `--grey-900` grid lines (rung 1), `background-size: 44px`, radial mask,
  `opacity: 0.7`.
- **Problem:** at `--grey-900` the grid is barely perceptible, so the panel reads as
  blank. A live instrument panel shows its graticule.
- **Raise:** lift the grid lines to `--grey-850` (still a hairline tier, but visible)
  and keep the radial mask so it fades at the edges. This alone turns "dead box" into
  "oscilloscope at rest." Keep `opacity` around 0.6-0.7 so it never competes with the
  label. This is the honest "powered on" read: a graticule, no curve.

### 6.3 `.proof__curve-label` ("[ live research, backtest in progress ]") -- the heartbeat
- **Current:** `--signal`, `letter-spacing: 0.08em`. Good color (the accent earns its
  moment here, it is the "live" indicator).
- **Raise (presence):** this is the one place the signal label should feel ALIVE.
  Keep `--signal`. The motion brief owns the pulse (a single soft pulse traveling the
  baseline / the label breathing on a slow sine). From a visibility standpoint: bump
  the label to a hair larger than default mono-label (`0.8125rem`) and ensure it sits
  ABOVE the grid (z-index is already 1). Add a `dot--pulse` style signal dot before
  the label so it visually asserts "live," matching the hero status and footer status
  pattern. This ties the slot into the page's existing "live" vocabulary.

### 6.4 `.proof__curve-caption` (the honesty line) -- P1
- **Current:** `--grey-700` (floor), `max-width: 48ch`, `line-height: 1.7`.
- **Problem:** "The real out-of-sample equity curve appears here only after it clears
  the validation gauntlet. Not a day sooner." is the honesty keystone of the whole
  page and it is set at the floor color, small.
- **Raise:** lift to `--paper-dim` (rung 4). This sentence is the brand's integrity
  stated plainly; it must be unambiguously readable. This is a P1 honesty-visibility
  fix.

### 6.5 `.proof__curve-link` (the bridge to /performance)
- Uses the shared `.bridge__link` (`--paper-dim` at rest -> `--paper` on hover).
  Correct. Leave as-is.

### 6.6 The charts module (js/charts.js) honest-pending render
- When the real `js/charts.js` mounts its honest-empty equity component into this slot
  (per the charts brief), the same visibility contract holds: the graticule is
  `--grey-850`, the "in progress" label is `--signal` with a live pulse, the caption is
  `--paper-dim`, and NO curve path is drawn. The pending state must read as a powered
  instrument with a visible graticule and a live label, never a flat box and never a
  fabricated line. The DSR/PBO/capacity visuals adopt the same ladder.

---

## 7. THE SYSTEM PIN CHAIN (.sys-chain) -- P0, the tentpole read must be followable

The chain-of-custody spine in the pinned frame is the landing's signature, but its
idle nodes are set at rung 2 and below.

### 7.1 Idle node numerals and labels
- **Current:** `.sys-chain__num { color: var(--grey-600); }` (rung 2),
  `.sys-chain__label { color: var(--grey-700); opacity: 0.55; }` (floor x 0.55 =
  effectively rung 2).
- **Problem:** the unlit stages of the chain are nearly invisible, so the reader
  cannot read the chain they are watching assemble; only the single active node is
  legible. The "chain of custody" only reads if the upcoming links are faintly visible.
- **Raise:**
  - `.sys-chain__num`: lift from `--grey-600` to `--grey-700` (rung 2 -> rung 3). The
    idle numerals are content the reader scans, not decoration.
  - `.sys-chain__label`: raise resting opacity from `0.55` to `0.7` (so idle labels
    read at roughly the floor, not below it). The active label already goes to
    `--paper` opacity 1 (correct, keep the contrast jump that marks the active link).
  - Keep the idle DOT border at `--grey-600` (it is a true decorative placeholder
    glyph, and the contrast with the ignited signal dot is the point). Dots are
    decoration; numerals and labels are content. Only the content rises.

### 7.2 The `.system__counter` running numeral
- `#stepCurrent` is `.signal-word` (signal color, correct, it is the live stage
  number) and `#stepTotal` inherits mono-label `--grey-700`. Correct. The resolved
  state already brightens it (motion.css). Leave.

---

## 8. PRESTIGE-PRESERVING MICRO-RAISES (P2, do last, do gently)

### 8.1 The eyebrow `.idx` (the numbered chapter spine)
- `.idx { color: var(--signal); opacity: 0.5; }`. The half-opacity signal index is a
  deliberate quiet thread, and on most chapters it is fine against the `.label`
  eyebrow text. KEEP it at 0.5 for the numbered chapters (it is intentional restraint
  and the consistency of the thread matters more than the contrast of one numeral).
- EXCEPTION: the FOUNDER eyebrow uses a bare `/` with no number, at 0.5 opacity, which
  reads as an orphan smudge. For that ONE eyebrow, either raise its idx to full signal
  opacity or give the section a real chapter index. This is a legibility fix for one
  element, not a change to the global `.idx`.

### 8.2 The statband footnote row
- `.statband__list--secondary .stat__val { color: var(--paper-dim); font-size: 1rem; }`
  and labels at `--grey-700`. This is correctly framed as fine print. The values at
  `--paper-dim` 1rem are readable; the labels at `--grey-700` are at the floor, which
  is acceptable for captions. NO raise needed unless the owner specifically wants the
  footnote louder; if so, lift the labels' size to `0.8125rem` rather than their color
  (keep them recessed by tier, legible by size). The primary four `.stat__val` are
  `--paper` (correct).

### 8.3 The hero status / footer status separators
- Covered in S2.3. Any `&middot;` separator currently at `--grey-600` between two
  readable facts moves to `--grey-700`. Audit all `*-sep` classes for rung-2 usage.

### 8.4 The `.bridge__link` arrow and underline
- Already signal at full strength, drawn on hover. Correct and visible. Leave.

---

## 9. CROSS-CUTTING VISIBILITY MOVES (apply page-wide, consistently)

1. **No meaningful text below `--grey-700`.** Grep `css/landing.css` and the V2 blocks
   for `--grey-600` on any text or any separator-between-values; move each to
   `--grey-700` minimum. `--grey-600` survives ONLY on true placeholder glyphs (idle
   chain dots, ghost numerals, the `[ reserved ]` roadmap placeholders).
2. **No meaningful divider below `--grey-850`.** Any `border` / `background` at
   `--grey-900` that separates content the reader compares (offer rows, the offer top
   rule) moves to `--grey-850`. `--grey-900` stays only for the giant ghost wordmark
   fills and hover washes (where invisibility-until-hover is the intent).
3. **Aside SENTENCES are `--paper-dim`; their `//` markers stay `--grey-700`.** This
   one rule fixes every `.*__aside` on the page in a consistent way and keeps the
   terminal-comment texture.
4. **True numbers should COUNT, not just appear (visibility through motion).** The
   `.hero__proof [data-fact]` values are static today. Wiring them to the existing
   `[data-count]` count-up (where a numeric fact, not a string like "3.5M+", allows it)
   draws the eye to the real figures. This is a motion-brief item; noted here because
   "the numbers animating in" is a major perceived-visibility win the owner asked for.
   Honesty hold: a value rendered as a formatted string ("3.5M+", "2,500+") either uses
   the existing count formatter (suffix/group) or stays static; never fake a tick.
5. **Hierarchy gaps must stay wide.** After raising, re-check that headline (`--paper`)
   still clearly outranks body (`--paper-dim`) which outranks caption (`--grey-700`).
   If everything drifts toward `--paper-dim`, the page loses its read. Keep three
   visible tiers in every section.

---

## 10. WHAT NOT TO TOUCH (so visibility does not become loudness)

- Do NOT brighten `.body` / `.body-l` prose beyond `--paper-dim`. It is already the
  correct readable body tier; making prose `--paper` reads as shouting.
- Do NOT add a second accent or use `--signal` to "highlight" more text. The accent
  stays at one pixel of intent per chapter (the eyebrow idx, the equity-slot live
  label, the founder role, the signal-word underline, the CTA). Visibility is achieved
  in the grey ladder, not by spreading the orange.
- Do NOT animate layout to draw attention (DESIGN_SYSTEM 4: transform/opacity/filter
  only). Visibility via motion = reveal, count-up, draw-in, pulse, never a size jump
  that reflows.
- Do NOT touch the sub-pages (`/systems` `/performance` `/progress`) or the shared
  `styles.css` / `motion.css` tokens. Scope every raise to landing-only selectors or
  V2 containers. A change to a shared token would propagate off the landing and break
  the "own landing files only" guardrail.
- Do NOT change the cursor, nav, rail, grain, or intro contrast. They are global chrome
  and correct.

---

## 11. ACCEPTANCE (how to know visibility is done, and restraint is intact)

- Every readable word on the landing sits at `--grey-700` (floor) or brighter. Grep
  confirms no `--grey-600` on text or value-separators.
- Every divider between content the reader compares sits at `--grey-850` or brighter.
- The hero proof row reads as a structured instrument readout with visible dividers,
  not a run-on.
- The equity slot reads as a powered-on panel: a visible graticule, a live signal
  label with a pulse, a clearly readable honesty caption, and NO fabricated curve.
- The offer block reads as a ledger (visible row dividers, hover response) with its
  qualifying notes clearly legible.
- The system-pin chain's upcoming links are faintly readable, so the chain reads as a
  chain, with the active link the clear brightest.
- The founder bio and pull-quote are unambiguously legible; the section is not orphaned.
- AND: there are still three visible contrast tiers in every section, one accent pixel
  per chapter, no new color, no layout animation. The page reads CLEARER, and still
  reads as a sovereign fund. `npm run build` green; `grep -rPn "\x{2014}"` empty.

---

This is the visibility law for LANDING10. Move each element exactly one honest rung up
the ladder where it is too dim, fix the invisible dividers, make the equity slot read
as alive, and keep the hierarchy gaps wide. Clearer, not louder.
