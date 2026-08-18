# Meridian / Landing Structure V2 (Information Architecture, build plan)

The binding spec for the LANDING-ONLY rebuild of `index.html`. The advisor scored
visual quality 8.5/10 and trust "strong" and asked to KEEP the craft. The fix is
NOT a redesign of the world: it is a re-sequencing of the landing so it is
scannable in ~15 seconds, then offers depth on demand. The three sub-pages
(`/systems`, `/performance`, `/progress`) are EXCELLENT and DO NOT CHANGE. The
shared scene (`js/scene.js` / `js/shaders.js`), `js/scroll.js`, `js/shell.js`,
`config/brand.js`, and all CSS tokens DO NOT CHANGE except surgical, home-guarded
edits where this doc names them explicitly.

This doc is law for the lead builder. It pins: (1) the exact section order with
DOM ids and rail/section indices, (2) what relocates to the sub-pages and what
condensed teaser stays, (3) the proof-strip data model and where the real equity
curve slots in later, (4) how the existing System pin + scene handoffs survive the
leaner structure, (5) the founder section, (6) the full COPY. Build the page from
this; do not improvise structure.

---

## 0. Hard constraints the IA is built around (read first)

These are the load-bearing couplings in the shared engine. The new structure
PRESERVES every one of them. Breaking any is a regression FAIL.

| Coupling (in shared, do-not-edit code) | Depends on | New IA keeps it by |
| --- | --- | --- |
| Hero exit scrub (`scroll.js` ~295) | `#hero` + `.hero__body` + `.hero__scroll` | Hero keeps id `#hero`, keeps a `.hero__body` wrapper and `.hero__scroll` cue. |
| System pin tentpole (`scroll.js` ~585, 639) | `#system` section + `.system__sticky` + `.step[data-step]` (5) + `#stepCurrent` / `#stepTotal` | The signature section keeps id `#system`, the sticky frame, all 5 steps, the counter ids. Copy tightens; structure is byte-stable. |
| Convergence handoff (`scroll.js` 594, 403) | `#proof .proof__title .mask__inner` | The proof/performance teaser section keeps id `#proof` and a `.proof__title` head that is a `[data-chars]` mask. |
| Discipline held beat (`scroll.js` ~693) | `#discipline` + `.tenet` rows | RELOCATED to a condensed teaser; see 2.4. The pin is home-guarded and simply will not fire when `#discipline` is absent (the `if (disciplineEl && tenets.length ...)` guard no-ops). This is a SAFE removal: no shared code throws, the beat just does not run. The Discipline DEPTH already lives at `/performance`. |
| Stat band render (`main.js` `renderStats`) | `#statList` UL inside the proof section | Proof strip keeps a `#statList` UL; `main.js` fills it from `STATS`. |
| Count-up (`scroll.js` ~714) | `[data-count]` on stat values (written by `renderStats`) | Unchanged. New static proof figures that want count-up carry `data-count` directly. |
| Rail + chapter counter | `data-section="N"` on each chapter + `data-rail="N"` on each rail item + `__MERIDIAN_PAGE.chapters[N]` label, ALL index-aligned and contiguous from 0 | The new 9-index spine below is contiguous 0..8. Rail list, `data-section`, and the `chapters[]` array are rewritten together so the three stay in lockstep. |
| `landing.js` System chain spine | `#system` + `.step` + `.system__counter` | Unchanged: it reads the same `#system` steps. No edit needed. |
| `landing.js` bridge pulse | `.bridge__link` elements | Unchanged: still one pulse per bridge as each enters view. New bridges inherit it for free. |
| `landing.js` waitlist arrival | `#waitlist` + `.waitlist__label` | Unchanged: waitlist keeps id and label. |
| Top nav clean-URL navigation | `shell.js` rebuilds nav from `NAV` to `/systems` etc. | Unchanged. Do NOT touch nav hrefs. The static fallback anchors in markup may keep `#systems` / `#performance` / `#progress` (the shell overwrites them). |

Net structural decision: the chapter COUNT stays at nine (rail indices 0..8) so the
rail spine, the `data-section` triggers, and the `chapters[]` array need only be
RE-LABELLED and RE-ORDERED, never grown or shrunk in a way that desyncs them. The
old `Thesis` and `Discipline` long-form chapters are replaced 1:1 in the index
budget by the new `Proof` and `Founder` chapters, so the rail stays a clean 9-stop
numbered spine and every scene coupling above keeps its id.

---

## 1. The new section order (exact, with ids and indices)

Nine chapters, rail/section indices 0..8, contiguous. The leftmost column is the
on-screen reading order top to bottom. `data-section` and `data-rail` MUST equal
the Idx. The `chapters[]` array in the inline `__MERIDIAN_PAGE` config MUST be this
exact list of Rail labels, in order.

| Idx | Section id | `class` (section) | Rail label | Eyebrow (`NN /`) | Role |
| --- | --- | --- | --- | --- | --- |
| 0 | `#hero` | `hero section` | `Overview` | (none, hero) | HERO, compressed: headline + subhead + 3-4 bullets + ONE CTA. Keeps on-load reveal. |
| 1 | `#flagship` | `flagship section` | `AlphaForge` | `01 /` The flagship | WHAT IT IS in one tight block, leads to the proof. Condensed: lead + the 5 pillars stay (they are scannable, not manifesto), bridge to `/systems`. |
| 2 | `#proof` | `proof section` | `Proof` | `02 /` Research, in numbers | PROOF STRIP (NEW emphasis). Animated real numerals + the honest live-research / equity-curve slot. Keeps id `#proof` + `#statList` + `.proof__title`. |
| 3 | `#value` | `value section` | `What it is` | `03 /` What this is | VALUE PROP + WHO IT IS FOR + WHAT YOU GET (NEW). Ends the fund/SaaS/copy-trading confusion. |
| 4 | `#system` | `system section` | `Systems` | `04 /` Systems | THE SIGNATURE PIN (tentpole). Unchanged structure (5 steps, sticky, counters); copy tightened. Bridge to `/systems`. |
| 5 | `#performance-teaser` | `house section` (reuse) wrapper holding the Performance teaser | `Performance` | `05 /` Performance | Condensed Performance teaser: one honest line + bridge to `/performance`. (The verified figures themselves now live in the Proof strip at Idx 2.) |
| 6 | `#progress` | `house section` | `Progress` | `06 /` Progress | Condensed Progress teaser: the roadmap table stays (visual), short lead, bridge to `/progress`. |
| 7 | `#founder` | `founder section` | `Founder` | `07 /` Founder | FOUNDER SECTION (NEW). The advisor's highest-impact trust fix. |
| 8 | `#waitlist` | `waitlist-section section` | `Waitlist` | `08 /` Waitlist | WAITLIST CTA close. Unchanged form; intro tightened. |

Footer (`#footer`) is shared chrome, NOT a rail chapter index (the current rail has
a 9th dot for `#footer` at index 8; in V2 the `#footer` rail dot is DROPPED and
index 8 is `Waitlist`). The rail list therefore has exactly nine `<a class="rail__item">`
items, `data-rail="0"` through `data-rail="8"`, hrefs `#hero #flagship #proof #value
#system #performance #progress #founder #waitlist`.

Rail href note: rail item 4 hrefs `#system` (the pin section's real id). Rail item 5
hrefs `#performance` (the zero-footprint anchor inside the Performance teaser, see
2.5). Both match how the current rail already targets the anchor-mark pattern.

### 1.1 The `__MERIDIAN_PAGE.chapters[]` array (exact, replace verbatim)

```js
window.__MERIDIAN_PAGE = {
  id: "home",
  chapters: [
    "Overview", "AlphaForge", "Proof", "What it is", "Systems",
    "Performance", "Progress", "Founder", "Waitlist"
  ]
};
```

Nine entries, index-aligned to the table above. The rail head (`#railName`) reads
these as each `data-section` crosses 50% viewport.

### 1.2 Anchor-mark contract (keep the scene ids, restore the nav targets)

Two sections carry BOTH a scene-coupled id and a nav/rail target id, via the
existing zero-footprint `<span class="anchor-mark">` idiom already in the file:

- `#system` section: keep `data-section="4"`. Inside it keep
  `<span id="systems" class="anchor-mark" aria-hidden="true"></span>` so the nav/
  footer/teaser link `/#systems` (and the rail) land at the top of the pin chapter,
  while the section id stays `#system` for the pin trigger.
- `#performance-teaser` section: it carries `data-section="5"`. Inside it keep
  `<span id="performance" class="anchor-mark" aria-hidden="true"></span>` as the
  rail/nav scroll target. The convergence-handoff head (`#proof .proof__title`)
  now lives in the PROOF strip at Idx 2 (see 2.3), so the handoff and the
  Performance teaser are decoupled cleanly: the handoff fires into `#proof`, the
  Performance nav target lands on `#performance-teaser`.

---

## 2. Section-by-section build spec

### 2.0 Hero `#hero` (compressed) [Idx 0, rail "Overview"]

KEEP: the on-load immersive moment (intro curtain -> manifold reveal -> hero
cascade), the `data-brand` Meridian wordmark as the `<h1>`, the status line, the
`.hero__body` wrapper, the `.hero__scroll` cue, the single primary CTA. These
satisfy the hero-exit scrub coupling and the intro->hero handoff.

CHANGE: strip the four-line `display-m` manifesto statement ("We built the
discipline before we built the profit. AlphaForge is the first algorithm.") down.
Replace the long prose sub with a ONE-LINE subhead plus a compact 3-4 item bullet
strip. Keep exactly ONE strong CTA as the primary action (the secondary "Read how
it works" link may stay as a quiet text link, not a second button).

DOM (within `.hero__body`):
- status line (keep as-is): `Pre-launch` / `AlphaForge in simulation and live paper trading`
- eyebrow `.eyebrow` (keep): see COPY.
- `<h1 class="hero__word display-xl" data-brand-fill>` Meridian wordmark mask (keep).
- NEW headline line `.hero__headline display-m` (a `.mask[data-chars]` so it uses
  the signature char-rise; this REPLACES the 4-line `.hero__statement`). One line.
- NEW `.hero__sub body-l` one-line subhead (replaces the long paragraph).
- NEW `<ul class="hero__points">` of 3-4 `<li class="hero__point">` scannable
  bullets, each a `.mono-label` lead + short clause. Mark the `<ul>` `.reveal-fade`.
- `.hero__actions` (keep): ONE primary `.hero__cta` + one quiet `.hero__link`.

Reduced-motion / no-JS: bullets and subhead are visible by default (`reveal-fade`
only hides under `html.js` + motion allowed, per the shared safety contract).

### 2.1 Flagship `#flagship` [Idx 1, rail "AlphaForge"]

This becomes the compact WHAT-IT-IS block. KEEP the five `.pillar` items (they are
scannable, not manifesto) and the bridge to `/systems`. TIGHTEN the lead paragraph
to two sentences. The giant `AlphaForge` word stays (one display moment is allowed).
Eyebrow becomes `01 / The flagship`.

Bridge (keep): `See the system, end to end -> /systems`.

### 2.2 RELOCATED: the Thesis chapter

The current `#thesis` chapter (the "The edge was never the strategy" manifesto
blockquote + aside) is REMOVED from the landing as a standalone chapter. Its idea
is NOT deleted: it is the founding principle and it reappears, condensed, in TWO
places that already earn it:
- One sentence folded into the Founder bio (Idx 7): "a claim is worth nothing until
  the evidence is on the record."
- The fuller thesis remains available via the footer "Thesis" link, which already
  points to `/#thesis`. UPDATE that footer link target: since `#thesis` no longer
  exists on the landing, repoint the footer "Firm > Thesis" link to `/progress`
  (the build-in-the-open page that carries the discipline-first narrative) OR to
  `#founder`. RECOMMENDATION: point it to `#founder` (the thesis is now embodied by
  the founder principle on the landing). This is a `config/brand.js` FOOTER_COLS
  edit, which is allowed copy/config, not a shared-engine edit. Confirm with the
  director before changing brand.js; if not changing it, the shell will resolve
  `#thesis` to a no-op scroll, which is acceptable but not ideal.

### 2.3 PROOF strip `#proof` [Idx 2, rail "Proof"] (NEW emphasis, "Research, in numbers")

This is the advisor's "missing visual PROOF section". It ABSORBS the old Status/
Proof chapter's stat band and KEEPS its critical ids so the scene handoff and the
stat render keep working.

KEEP (id contracts):
- Section id `#proof`, `data-section="2"`.
- `<h2 class="proof__title display-l" id="proof-head">` with ONE
  `.mask[data-chars]` inner. This is the convergence-handoff target
  (`#proof .proof__title .mask__inner`). The System pin reveals THIS head on its
  final step. So the proof head copy is the handoff payoff line. Per the advisor the
  proof headline is "Research, in numbers"; to keep the handoff semantics ("they are
  one system" -> the proof), the head reads: see COPY (a line that works both as the
  pin payoff and the proof-strip title).
- `<ul class="statband__list" id="statList">` (empty in markup; `main.js`
  `renderStats()` fills it from `STATS`). The four animated numerals come from here
  with count-up already wired (`[data-count]`).
- The secondary `.statband__list--secondary` footnote ledger (0 look-ahead, 1 cost
  authority, 2020 history) stays.

ADD (the visual proof, real + honest):
- A `.proof__metrics` row presenting the five headline proof facts as scannable
  count-up numerals. FOUR of these are the existing `STATS` (rendered by `main.js`
  into `#statList`); the fifth honest framing ("leak-proof data since 2020") is
  carried by the footnote ledger already present. Do NOT duplicate a number in two
  places; use the `#statList` band as the primary numeral row and the footnote
  ledger as the secondary. The proof-strip data model is in section 3.
- A `.proof__slot` panel: the REAL backtest equity-curve slot, reserved and HONEST.
  Until the grand backtest verdict lands, it renders the validation-gauntlet /
  methodology summary as an honest "live research" element, NOT a fabricated curve.
  It links to `/performance`. Markup contract in section 3.2. This reuses the
  `results__slot` empty-frame language already shipped on `/performance` (same
  axis-grid CSS idiom, same `[ awaiting validated artifact ]` caption) so it reads
  as "a chart, pending", never as a missing image and never as a winning curve.

KEEP the bridge: `See the methodology and the gauntlet -> /performance`, and keep
the honest aside ("AlphaForge runs in simulation and live paper trading...").

The proof here is RIGOR AND SCALE, not returns. The honest result so far is a null
and that honesty is the brand: the strip states scale + rigor numbers, shows the
methodology where a return would be, and links out. NEVER a fabricated curve.

### 2.4 VALUE `#value` [Idx 3, rail "What it is"] (NEW)

Ends the "is this a fund / SaaS / copy-trading?" confusion in one honest block.
Three columns / stacked groups, reusing the existing `.pillars` / `.tenets` row
grammar (do NOT invent a new card system):

- WHAT IT IS: a quantitative research platform you watch prove itself in the open,
  then run in paper. Explicit negations: not a fund, not copy-trading, no real
  capital, nothing here is investment advice.
- WHO IT IS FOR: quant-minded builders, crypto / systematic traders, researchers,
  and future investors who want evidence over hype.
- WHAT EARLY ACCESS WILL INCLUDE (framed as forthcoming, since pre-launch): watch
  live paper trading (positions + equity); research dashboard access (attribution,
  drawdown / risk, tearsheets); research reports + the open build log; run-your-own
  simulations. Each item is framed "as it comes online", never as already shipped.

Render: a `.value__grid` with three `.value__col` blocks, each a `.label` head + a
short `.body` line + a `<ul>` of `.mono-label`-led items. This reuses the staggered-
ledger reveal grammar. No new motion device.

### 2.5 SYSTEM pin `#system` [Idx 4, rail "Systems"] (signature, structure unchanged)

The gold-standard tentpole. KEEP EVERYTHING the pin depends on:
- Section id `#system`, `data-section="4"`, `data-cursor-pinned` attribute.
- `<span id="systems" class="anchor-mark">` inside (nav/rail target).
- `.system__sticky` pin frame, `.system__left` (eyebrow, head, sub, counter),
  `.system__right` `<ol class="steps">` with FIVE `.step[data-step="0..4"]`, each
  with its `.step__kicker`, `.step__title`, `.step__body`, `.step__data`.
- `#stepCurrent` / `#stepTotal` counter ids.
- `landing.js` builds the chain spine from these steps automatically.

CHANGE: copy only. The sub line and step bodies may tighten by a sentence each
(advisor: "tighter on copy"). Do NOT remove a step, rename an id, or change the
step count (the pin computes `N = steps.length` and the convergence ramp off it).

Eyebrow becomes `04 / Systems`. Keep bridge: `Read the full architecture -> /systems`.

### 2.6 RELOCATED: the Discipline chapter

The current `#discipline` chapter (head "A system that will not lie to you.", the
three roman-numeral tenets, the closing display-quote) is REMOVED from the landing.
The Discipline DEPTH already lives at `/performance` (Method + What we measure +
Standing). The landing keeps only a one-line echo of it inside the Proof aside and
the Founder principle. The `scroll.js` Discipline pin is home-guarded by
`if (disciplineEl && tenets.length ...)`, so with `#discipline` absent it cleanly
no-ops. SAFE removal, no shared-code edit needed.

If the director wants a trace of it: a single `display-quote` line ("We test against
ourselves harder than any market will.") MAY be placed as the closing pull-line of
the Proof strip. Optional, one line, no tenets.

### 2.7 Performance teaser `#performance-teaser` [Idx 5, rail "Performance"] (condensed)

Now that the verified numerals live in the Proof strip (Idx 2), this chapter is a
SHORT teaser, not a stat host. It holds:
- `data-section="5"`, `<span id="performance" class="anchor-mark">` (nav/rail target).
- Eyebrow `05 / Performance`, a `display-l` head, ONE honest lead line, the honest
  aside, and the bridge `See the methodology and the gauntlet -> /performance`.
- NO `#statList` here (it moved to `#proof`). NO `.proof__title` here (the handoff
  head is in `#proof`).

Reuse the `.house` section grammar (eyebrow + head + lead + aside + bridge) so no
new layout is introduced. This keeps the rail spine at nine stops with a real
Performance chapter while the numbers themselves are shown earlier where they prove
the most.

### 2.8 Progress teaser `#progress` [Idx 6, rail "Progress"] (condensed)

KEEP the multi-algorithm roadmap table (it is the visual centerpiece and scannable).
TIGHTEN the lead to two sentences. Keep `data-fact="phases"` binding (12 phases).
Eyebrow `06 / Progress`. Keep bridge: `Read the build log and the roadmap -> /progress`.

### 2.9 FOUNDER `#founder` [Idx 7, rail "Founder"] (NEW, highest-impact trust fix)

A short, real, professional founder block. Prestige restraint, grounded, no
unverifiable claims (HONESTY GUARDRAIL). Layout reuses the broken-grid asymmetry
idiom (one asymmetry per page is allowed; the flagship already uses one, so here use
a simple two-column name/role + bio split that does NOT add a second strong
asymmetry; keep it a clean stacked or 0.4/0.6 split that reads as composed, not as a
second signature grid). No photo is required (the brand is text-first; an avatar is
optional and, if added, must be a quiet monochrome treatment, never a glossy
headshot). 

DOM:
- `<section class="founder section" id="founder" data-section="7" aria-labelledby="founder-head">`
- `<span class="section__rule">` (tonal seam).
- eyebrow `07 / Founder`.
- `.founder__id`: name `Arhan Canli` (`.founder__name display-m` or `.label`-scale
  per the director's taste; recommend a restrained `display-m`), role `Founder`
  (`.mono-label`).
- `.founder__bio body` (62ch measure): the tightened bio (see COPY). One
  `.signal-word` allowed on the principle ("on the record").
- Optional `.founder__principle display-quote`: the single pull-line embodying the
  thesis. This is where the relocated Thesis idea lands as the founder's principle.

HONESTY: frame the trading background as disciplined, documented market work that
became the brand principle (evidence before claims). NO "predicted/called most
stocks", no performance boast.

### 2.10 Waitlist `#waitlist` [Idx 8, rail "Waitlist"] (close, unchanged form)

KEEP the form, the honeypot, the status line, the helper sub, the aside, the
`.waitlist__label` (the `landing.js` arrival beat draws its underline). TIGHTEN the
intro paragraph. Eyebrow `08 / Waitlist`. The strong incentive-driven CTA repeats
here with honest framing intact.

### 2.11 Footer `#footer` (shared chrome, minimal copy edits)

Unchanged structure. Two copy/config touch-points (both in `config/brand.js`,
director-approved, not shared-engine code):
- "Firm > Thesis" link: `#thesis` no longer exists on the landing. Repoint to
  `#founder` (recommended) or `/progress`. See 2.2.
- Everything else (Platform, Flagship columns, legal block, watermark, tagline,
  colophon) stays.

---

## 3. The proof-strip data model

### 3.1 Which real metrics (all from `config/brand.js`, never invented)

The proof strip presents RIGOR + SCALE, not returns. Sources, in render order:

Primary numeral row (rendered by `main.js renderStats()` into `#statList`, count-up
already wired via `[data-count]`):

| Numeral | Source (`STATS`) | Label |
| --- | --- | --- |
| 3.5M+ | `{value:3.5, suffix:"M+", decimals:1}` | Hourly bars in the lake |
| 94 | `{value:94}` | Instruments, live and delisted |
| 24 | `{value:24}` | Factors measured |
| 2,500+ | `{value:2500, suffix:"+", group:true}` | Automated tests, green |

Secondary footnote ledger (static, `.statband__list--secondary`, already in markup):
0 look-ahead by construction; 1 cost authority (research + paper); 2020 history
starts. The advisor's "leak-proof data since 2020" is the 2020 footnote item; the
"leak-proof" qualifier is copy on the proof lead, not a separate numeral.

Advisor numbers cross-checked against the verified set: 3.5M+ bars (match), 94
instruments (match), 24 factors (match), 2,500+ tests (match, the reconciled count),
since 2020 (match). All five map to verified `STATS`/`FACTS`. No new fact is
introduced. If the director wants the count-up to read on the static footnote
values too (e.g. "2020"), add `data-count` to those spans; otherwise they render
static. DO NOT count-up a value that is not a real number.

DO NOT add any returns/Sharpe/P&L figure here. Performance is deliberately absent;
the honest result so far is a null.

### 3.2 The equity-curve slot (reserved, honest, where the real curve lands later)

A grand backtest is running now. Until its verdict lands, this slot shows the
methodology / validation-gauntlet summary and links to `/performance`, NEVER a
fabricated winning curve.

Markup contract (reuse the `/performance` `results__slot` idiom verbatim so it is
one component, one empty-frame language across pages):

```html
<figure class="proof__slot" role="img"
        aria-label="Out-of-sample equity curve, awaiting validated artifact"
        data-results-src=""> <!-- a future builder wires the artifact URL here -->
  <div class="proof__slot-grid" aria-hidden="true"></div> <!-- CSS axis grid, the
       scene-fallback grid language: reads as 'a chart, pending' -->
  <figcaption class="proof__slot-cap mono-label">[ awaiting validated artifact ]</figcaption>
</figure>
```

Behavior contract:
- The panel renders its HONEST empty state by default: a faint CSS axis grid + the
  `[ awaiting validated artifact ]` caption. NO sample curve, NO placeholder Sharpe,
  NO fabricated tick values.
- Beside or under the slot, a `.proof__slot-note mono-label`: "When AlphaForge
  clears the gauntlet, the out-of-sample equity curve appears here. Until then we
  show the method, not a number." plus the bridge to `/performance`.
- WIRING LATER (not this task): when the grand backtest produces a validated
  artifact (JSON/CSV from the gauntlet), a future builder sets `data-results-src` to
  the artifact URL and a small reader draws the curve from real points. The IA
  reserves the frame so that wiring is additive, no redesign. The slot must carry
  the same six reserved fields available on `/performance`
  (Out-of-sample equity, Deflated Sharpe, Probabilistic Sharpe, PBO, Trials tested,
  Baseline beaten by) IF the director wants them surfaced on the landing; otherwise
  the landing slot stays a single honest frame and the six fields remain a
  `/performance`-only detail. RECOMMENDATION: keep the landing slot to ONE honest
  frame + caption + link (less is more on the landing); the six labeled fields stay
  on `/performance`.

### 3.3 How the proof strip links to `/performance`

Two outbound paths, both honest, both reuse the shared `.bridge__link` atom (so the
`landing.js` ridge pulse fires once as each enters view):
- The slot note bridge: `See the methodology and the gauntlet -> /performance`.
- The chapter bridge at the end of the strip (the existing one): same target. Use
  ONE bridge to avoid duplication; place it under the slot. The Performance teaser
  chapter (Idx 5) carries the other reference to `/performance` so the page never
  feels like it is begging; one bridge per chapter.

---

## 4. How the System pin + scene moments fit the leaner structure

The scene drives off global scroll progress (`scene.setScroll(p)`), the System pin
(`setConverge` ramp + `flareBloom` + `pulseRidge`), the bridge pulses, and the
waitlist arrival. None of these read section COUNT; they read specific ids and the
0..1 scroll fraction. So re-sequencing is safe as long as:

- `#hero` + `.hero__body` exist (hero exit scrub). KEPT (Idx 0).
- `#system` + `.system__sticky` + five `.step` + counters exist (the tentpole + its
  `setConverge` ramp + the single `flareBloom`). KEPT (Idx 4), structure byte-stable.
- `#proof .proof__title .mask__inner` exists as the convergence-handoff target.
  KEPT (Idx 2). NOTE the order change: in V1 the System pin (old idx 3) preceded the
  Proof/Status chapter (old idx 5) in scroll order, and the pin's final step revealed
  the proof head BELOW it. In V2 the Proof strip (Idx 2) comes BEFORE the System pin
  (Idx 4) in scroll order. THIS BREAKS THE "reveal-below-on-final-step" semantics:
  by the time the reader reaches the pin, they have already scrolled past `#proof`,
  so `revealProofHeadEarly()` would fire on an off-screen, already-revealed head.
  RESOLUTION (decision the lead builder must implement, all within the home-guarded
  bounds): the convergence handoff must target a head that comes AFTER the pin in
  scroll order. Two acceptable options:

  OPTION A (preferred, zero shared-code edit): keep the handoff head where the pin
  hands off NATURALLY, i.e. on the chapter that immediately follows the pin in scroll
  order, which in V2 is the Performance teaser (Idx 5). Give the Performance teaser
  head the class hooks the handoff expects: make its head `<h2 class="proof__title">`
  with a `.mask[data-chars]` inner, and give the Performance teaser section a nested
  `id="proof"`-equivalent the handoff query can find. BUT the handoff query is the
  literal selector `#proof .proof__title .mask__inner` and `#proof` is the Proof
  strip at Idx 2. So Option A requires the handoff to target a head inside `#proof`,
  which is now ABOVE the pin. Not viable without a scroll.js edit. => Option A is
  REJECTED. Documented here so the builder does not waste time on it.

  OPTION B (chosen): a SURGICAL, home-guarded edit to `js/scroll.js` is permitted by
  the task ("only surgical home-guarded edits to js/scroll.js"). The minimal edit:
  change the handoff target selector from `#proof .proof__title` to a head that sits
  AFTER the pin in V2 scroll order. The cleanest target is the Performance teaser
  head at Idx 5. Concretely:
    1. In V2 markup, the Performance teaser head is
       `<h2 class="perf-teaser__title display-l" id="proof-head"><span class="mask" data-chars>...`.
       Keep `id="proof-head"` on THAT head (move the id from the Proof strip head to
       the Performance teaser head).
    2. In `scroll.js`, the handoff references `#proof .proof__title .mask__inner` in
       TWO places (line ~403 guard and line ~594 `proofHeadInner`). Change BOTH to
       target the by-id head: `#proof-head .mask__inner`. This is a 2-line, home-only
       behavioral edit (the selector is only meaningful on the landing; sub-pages do
       not have the System pin so `systemPinWillRun` is false and the guard path is
       inert). Guard it so it cannot affect sub-pages: the `systemPinWillRun`
       condition already gates it.
    3. The Proof strip head at Idx 2 then reveals on its OWN normal char-mask trigger
       (it is just a headline now, not a handoff target), which is correct: the proof
       strip should reveal as the reader reaches it, early in the page.

  Net: the pin's final-step bloom + handoff lands on the Performance teaser head
  ("the honest standing") which sits right after the pin, preserving the
  "many signals -> one decision -> here is what is true" beat in the new order. This
  is the ONE permitted surgical scroll.js edit; it is home-guarded by
  `systemPinWillRun` and touches only the two handoff-selector references.

  CONFIRM this edit with the director before shipping, since it touches scroll.js.
  If the director prefers ZERO scroll.js edits, the fallback is OPTION C: keep the
  Proof strip head id `#proof-head` and accept that on V2 the handoff reveals the
  proof head that is already on-screen-or-above; functionally the head still ends up
  revealed (the backstop `revealProofHeadEarly()` on `onLeave` guarantees it is
  never stranded hidden), the only loss is the dramatic timing of the reveal landing
  with the bloom. Acceptable but less polished. RECOMMENDATION: Option B.

- The scene scroll band for home is `[0,1]` (full arc); re-sequencing does not change
  the band. The five scene states still map across the page; the gather still peaks
  in the System pin. No scene-band edit.
- `landing.js` bridge pulses: every `.bridge__link` (flagship, system, performance,
  progress, proof slot) gets one pulse as it enters. New bridges are free.
- `landing.js` waitlist arrival: `#waitlist` + `.waitlist__label` kept. Free.
- The single `flareBloom` of the page stays owned by the System pin only (do not add
  a second flare on the proof strip or the founder section).

---

## 5. Relocation ledger (what moves where; nothing is deleted, depth moves)

| V1 landing content | V2 disposition |
| --- | --- |
| Hero 4-line manifesto statement | COMPRESSED to one headline line + one subhead + 3-4 bullets (Idx 0). |
| Thesis chapter `#thesis` (blockquote + aside) | RELOCATED: idea folded into Founder principle (Idx 7); long-form is the `/progress` build narrative; footer "Thesis" link repointed to `#founder`. |
| Flagship 5 pillars + lead | KEPT, lead tightened (Idx 1). Depth is `/systems`. |
| System pin (5 steps) | KEPT verbatim structure, copy tightened (Idx 4). Depth is `/systems`. |
| Discipline chapter `#discipline` (3 tenets + quote) | RELOCATED: depth is `/performance` (Method, Measures, Standing). Optional one-line quote echo on Proof strip. Pin no-ops safely. |
| Status/Proof chapter `#proof` stat band | KEPT + PROMOTED to the dedicated Proof strip (Idx 2) with the equity-curve slot added. Depth is `/performance`. |
| House/Progress roadmap `#progress` | KEPT roadmap table, lead tightened (Idx 6). Depth is `/progress`. |
| Performance numbers | Numerals shown in Proof strip (Idx 2); the Performance teaser (Idx 5) is now a short bridge chapter. Depth is `/performance`. |
| (new) Value prop / who-it-is-for / what-you-get | ADDED (Idx 3). |
| (new) Founder | ADDED (Idx 7). |
| Waitlist `#waitlist` | KEPT, intro tightened (Idx 8). |

---

## 6. Build plan (ordered, keep build green at every step)

1. Rewrite the inline `__MERIDIAN_PAGE.chapters[]` to the nine V2 labels (1.1).
2. Rewrite the rail `<ul>`: nine `.rail__item`, `data-rail="0..8"`, hrefs per 1
   (drop the `#footer` rail dot).
3. Hero (Idx 0): compress to headline + subhead + bullets + one CTA; keep
   `.hero__body` / `.hero__scroll` / wordmark / status.
4. Flagship (Idx 1): tighten lead; keep 5 pillars + bridge; eyebrow `01 /`.
5. Proof strip (Idx 2): keep `#proof` + `#statList` + footnote ledger + bridge +
   aside; add the `.proof__slot` honest equity-curve frame (3.2); set the proof head
   copy; (Option B) move `id="proof-head"` OFF this head onto the Performance teaser
   head, and give this head its own normal `.mask[data-chars]` reveal.
6. Value (Idx 3): NEW three-group block reusing ledger grammar.
7. System pin (Idx 4): keep structure byte-stable; tighten step copy; eyebrow
   `04 /`; keep `#systems` anchor-mark + bridge.
8. (Option B) `js/scroll.js`: change the two handoff selector references from
   `#proof .proof__title .mask__inner` to `#proof-head .mask__inner`. Home-guarded by
   `systemPinWillRun`. Confirm with director. 2 lines.
9. Performance teaser (Idx 5): NEW short teaser reusing `.house` grammar; carries
   `id="proof-head"` on its head (Option B) + `#performance` anchor-mark + bridge.
10. Progress teaser (Idx 6): keep roadmap; tighten lead; eyebrow `06 /`.
11. Founder (Idx 7): NEW block (2.9) with the COPY below.
12. Waitlist (Idx 8): tighten intro; keep form + ids; eyebrow `08 /`.
13. Footer: repoint "Thesis" link in `config/brand.js` FOOTER_COLS to `#founder`
    (director-approved copy/config edit).
14. CSS: add `.hero__points` / `.hero__point`, `.value__grid` / `.value__col`,
    `.founder__*`, `.proof__metrics`, `.proof__slot` (+ grid + caption + note) to
    `css/landing.css` ONLY, ADDING classes on top of the shared system (no token /
    easing / type-class redefinition). Reuse the `results__slot` grid CSS pattern.
15. `npm run build` (green) + `grep -rPn "\x{2014}"` (empty) after each step.

---

## 7. COPY (the deliverable; refine voice already applied, paste-ready)

Voice: Jane Street / Palantir restraint. Zero em dashes. `data-brand` = Meridian,
`data-flagship` = AlphaForge, bound, never hardcoded.

### Hero (Idx 0)

- Status line: `Pre-launch` / `AlphaForge in simulation and live paper trading`
- Eyebrow: `Institutional-grade quantitative research, in the open`
- Wordmark (h1, data-brand): `Meridian`
- Headline (one line, display-m, char mask):
  `Quantitative research, proven in the open.`
- Subhead (one line, body-l):
  `AlphaForge is a multi-signal quant engine that proves itself in simulation and live paper trading before any capital is deployed.`
- Bullets (3-4, mono-label lead + clause):
  - `Multi-signal` / a 24-factor engine for crypto perpetual futures
  - `Leak-proof` / point-in-time data, honest costs, no look-ahead
  - `Paper only` / it trades live on paper, with no real capital at risk
  - `In the open` / you watch it pass or fail, on the record
- Primary CTA: `Get early access to the dashboard`
- Quiet secondary link (to `#flagship`): `See how it works`

### Flagship (Idx 1)

- Eyebrow: `01 / The flagship`
- Tag: `Algorithm 01`
- Word (data-flagship): `AlphaForge`
- Sub (display-m): `A multi-signal engine for crypto perpetual futures. The first algorithm in the house.`
- Lead (tightened, body-l):
  `AlphaForge scores a curated universe of liquid perpetuals every hour, keeps only the signals that survive honest testing, and trades the next open, never the bar it decided on. It is a research process that happens to trade, and today it trades only on paper.`
- Five pillars: KEEP V1 copy verbatim (Honest universe; Many signals, one decision;
  A portfolio, not a pile of trades; Costs that tell the truth; Next open, never
  this one).
- Bridge: `See the system, end to end` -> `/systems`

### Proof strip (Idx 2)

- Eyebrow: `02 / Research, in numbers`
- Head (display-l, char mask; works as the proof title; this is NO LONGER the
  handoff target under Option B):
  `The proof is the rigor, not a return.`
- Lead (body-l):
  `No marketing numbers live here. These are properties of the engine and its data, the kind of facts you can hold us to. Performance is not among them yet, and we will not publish a return until one is earned in the open.`
- Numeral row (from STATS, rendered by main.js): 3.5M+ hourly bars in the lake; 94
  instruments, live and delisted; 24 factors measured; 2,500+ automated tests, green.
- Footnote ledger: 0 look-ahead, by construction; 1 cost authority, research and
  paper; 2020 history starts (leak-proof since 2020).
- Equity-curve slot caption: `[ awaiting validated artifact ]`
- Slot note (mono-label):
  `A grand backtest is running now. When AlphaForge clears the gauntlet, the out-of-sample equity curve appears here. Until then we show the method, not a number.`
- Aside (//):
  `AlphaForge runs in simulation and live paper trading. No real money is at risk. Real capital waits until a positive edge is proven, and not a day sooner.`
- Bridge: `See the methodology and the gauntlet` -> `/performance`

### Value (Idx 3)

- Eyebrow: `03 / What this is`
- Head (display-l): `Evidence over hype. Read the fine print here, once.`
- WHAT IT IS (col 1):
  - head: `What it is`
  - line: `A quantitative research platform you watch prove itself in the open, then run in paper.`
  - items: `Not a fund.` / `Not copy-trading.` / `No real capital.` / `Nothing here is investment advice.`
- WHO IT IS FOR (col 2):
  - head: `Who it is for`
  - line: `People who want the receipts before the claim.`
  - items: `Quant-minded builders` / `Crypto and systematic traders` / `Researchers` / `Future investors who want evidence over hype`
- WHAT EARLY ACCESS INCLUDES (col 3):
  - head: `What early access includes`
  - line: `It comes online in stages. Each opens as it is ready.`
  - items: `Watch live paper trading: positions and equity` / `Research dashboard: attribution, drawdown and risk, tearsheets` / `Research reports and the open build log` / `Run your own simulations`

### System pin (Idx 4)

- Eyebrow: `04 / Systems`
- Head (display-l): `The system, end to end.`
- Sub (tightened): `Five stages. One unbroken chain of custody from raw market data to a filled order. Each stage can be inspected.`
- Steps: KEEP V1 step kickers/titles/data lines; bodies MAY shorten by one sentence
  each. Keep all five and their `data-step` indices.
- Bridge: `Read the full architecture` -> `/systems`

### Performance teaser (Idx 5) [head carries id="proof-head" under Option B]

- Eyebrow: `05 / Performance`
- Head (display-l, char mask, `id="proof-head"`): `What is true today.`
- Lead (body-l):
  `AlphaForge has not traded real capital, and the crypto-only edge has not yet cleared our gauntlet. We say so plainly, because the test runs in the open and we report what passes and what does not.`
- Aside (//):
  `Most strategies never survive a gauntlet this severe. Honesty about what has not passed is the brand, not a footnote.`
- Bridge: `See the methodology and the gauntlet` -> `/performance`

### Progress teaser (Idx 6)

- Eyebrow: `06 / Progress`
- Head (display-l, char masks): `One method.` / `Many markets.`
- Lead (tightened):
  `AlphaForge is the first algorithm, not the only one. The engine beneath it was built multi-asset from the first line of code, and [data-fact="phases"]12 phases are built and tested. The road forward is breadth.`
- Roadmap table: KEEP V1 verbatim (Algorithm 01 AlphaForge / Crypto perpetuals /
  Paper trading; 02 Equities / Planned, next; 03 Futures / Planned; 04 Cross-asset /
  Planned).
- Aside (//): `Each new algorithm inherits the same standard of proof. Nothing skips the discipline, and nothing trades real money before it earns the right.`
- Bridge: `Read the build log and the roadmap` -> `/progress`

### Founder (Idx 7) [the bio, tightened to prestige restraint, all TRUE]

- Eyebrow: `07 / Founder`
- Name (data: plain text, not brand-bound): `Arhan Canli`
- Role (mono-label): `Founder`
- Bio (body, 62ch):
  `Arhan Canli built Meridian in Dubai, as a deliberate answer to the flashy, fast-money finance he grew up around. He has shipped software products end to end, including Studara, an AI education platform. He trades actively and writes down his thesis before the outcome is known. That habit became Meridian's founding principle: a claim is worth nothing until the evidence is on the record. He built Meridian to make quantitative systems that prove themselves in the open, on honest, leak-proof data, in simulation and paper, before a dollar of real capital is ever at risk.`
- Principle pull-line (display-quote): `A claim is worth nothing until the evidence is on the record.`

### Waitlist (Idx 8)

- Eyebrow: `08 / Waitlist`
- Head (char masks): `Watch it prove` / `the edge, in paper.`
- Intro (tightened, body-l):
  `Early access is a read-only seat to run AlphaForge live, on paper: the same scores, positions, and risk the engine acts on, and each gauntlet artifact as a stage validates, with no real money in play. We open it in order, in small groups.`
- Form label: `Join the waitlist`
- Submit: `Request early access`
- Helper: `No spam. One note when your access opens. Built in the open, simulation and paper only.`
- Aside (//): `Access opens as each stage is validated, not before. There is no waiting on a sales call, only on the engine.`

### Footer (copy unchanged except the Thesis link target)

- "Firm > Thesis" link repointed to `#founder` (was `/#thesis`). All other footer
  copy, the legal block, the tagline ("Institutional discipline, made legible."),
  and the colophon are unchanged.

---

## 8. Acceptance checklist (the lead builder verifies before handing off)

- [ ] Build green: `cd /Users/arhancanli/meridian && npm run build`.
- [ ] Em-dash audit empty: `grep -rPn "\x{2014}" index.html js/ css/ config/ docs/`.
- [ ] Rail has 9 items `data-rail="0..8"`; `chapters[]` has 9 entries; every section
      has `data-section` equal to its rail index; all contiguous 0..8.
- [ ] `#hero` + `.hero__body` + `.hero__scroll` present (hero exit scrub fires).
- [ ] `#system` + `.system__sticky` + 5 `.step[data-step]` + `#stepCurrent` /
      `#stepTotal` present (pin + convergence ramp + single flare fire).
- [ ] `#systems` and `#performance` anchor-marks present (nav/rail land correctly).
- [ ] Convergence handoff lands on `#proof-head` (Option B) and that head is AFTER
      the pin in scroll order; backstop `revealProofHeadEarly` still un-strands it.
- [ ] `#statList` present in `#proof`; `main.js` fills 4 count-up numerals.
- [ ] Proof equity slot renders the HONEST empty frame (no curve, no Sharpe, no tick
      values) + the `/performance` bridge.
- [ ] Value block answers fund / SaaS / copy-trading with explicit negations.
- [ ] Founder block grounded: NO "predicted/called stocks", no performance boast.
- [ ] Top nav still navigates to `/systems` `/performance` `/progress` (clean URLs).
- [ ] `#waitlist` + `.waitlist__label` present (arrival beat fires).
- [ ] Only ONE `flareBloom` on the page (System pin). No second flare added.
- [ ] All new CSS is additive in `css/landing.css`; no token/easing/type redefinition.
- [ ] Reduced-motion + no-JS: every section visible by default, pins degrade to
      stacked lists, scene to a static frame.
```
