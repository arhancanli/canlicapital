# MERIDIAN / DESIGN SYSTEM

The single, binding design language for every Meridian page. The landing page
and the three sub-pages (`/systems`, `/performance`, `/progress`) are ONE world.
A visitor moving between them must feel the same hand: same tokens, same type,
same cursor, same scroll feel, same motion grammar, same restraint. Quality is
identical everywhere or the brand reads as broken.

This document is law. It is derived from what already ships in
`css/styles.css`, `css/motion.css`, `css/cursor.css`, `js/scene.js`,
`js/shaders.js`, `js/scroll.js`, `js/main.js`, `js/cursor.js`. **Extend that
system. Do not fork a second one.** If you need a value, it almost certainly
already exists as a CSS variable or an `EASE` token. Use it. Inventing a parallel
palette, a second easing set, or a competing type scale is the one unforgivable
failure here.

---

## 0. THE NON-NEGOTIABLES (read before anything)

1. **ZERO em dashes.** The em-dash character (Unicode U+2014) must not appear in
   any page, any copy, any built output, any comment, any data file. Use a comma,
   a colon, or the word "to" for ranges (`2021 to 2026`). This is grep-audited as
   a hard build failure. After writing any page, run:
   `grep -rPn "\x{2014}" .` over your files. It must return nothing.
2. **One design system.** Every page imports the same four stylesheets in the same
   order (`styles.css`, `cursor.css`, `motion.css`, page-or-shared extras last).
   Page-specific CSS may only ADD classes; it may never redefine a token, an
   easing, a type class, the cursor, the nav, the rail, or the grain.
3. **One signal hue.** `--signal` (#C8553D) is the only chromatic accent on the
   entire property. No second color. No neon. No gradients between two hues. The
   3D scene owns the live accent; CSS uses `--signal` / `--signal-deep` /
   `--signal-glow` / `--signal-faint` as its companions, never a new color.
4. **Honesty is the aesthetic.** Copy states the scope plainly: PAPER /
   SIMULATION ONLY, pre-launch, waitlist. The crypto-perps edge does NOT yet
   clear the gauntlet, and we SHOW that. Frame it as rigor and intellectual
   honesty, never as failure, never as hype. Forbidden words anywhere: "moon",
   "guaranteed", "10x", "to the moon", "risk-free", "passive income", any return
   promise. We make no numeric performance claim that is not literally true and
   sourced from the engine.
5. **Restraint over decoration.** Jane Street x Palantir. A sovereign fund, not a
   crypto landing page. When in doubt, remove. Polish means refining what is
   there to be faster, quieter, more precise. It never means adding sparkles,
   glyphs, accessories, or a fifth animated thing.
6. **Keep the build green.** `cd /Users/arhancanli/meridian && npm run build`
   must succeed after every change. Each page is a Vite HTML entry (see Section
   10). Nothing is fetched at runtime; three / gsap / lenis are bundled.

---

## 1. COLOR TOKENS (extend, never replace)

All defined in `css/styles.css :root`. Use the variable, never the literal hex.

| Token | Value | Use |
|---|---|---|
| `--void` | `#0A0B0D` | Page background. The default canvas everywhere. Also the WebGL clear color and fog, so the 3D dissolves seamlessly into the page. |
| `--ink` | `#070809` | Darker band background (`.section--ink`) for tonal chaptering. One step deeper than void. |
| `--paper` | `#F4F1EA` | Primary foreground: headlines, key values, the cursor dot. Warm off-white, never pure #FFF. |
| `--paper-dim` | `#B7B4AC` | Secondary text: body, leads, sub-copy, nav links at rest. |
| `--grey-700` | `#888A90` | Labels, eyebrows, mono captions. The recessed-but-readable tier (AA-safe over void/ink). The floor for any text. |
| `--grey-600` | `#5C5E63` | DECORATIVE ONLY: idle rail numerals, ghost separators, placeholders. Never body text. |
| `--grey-825` | `#2A2C30` | Hairline ACTIVE/hover state only (border-color), never resting borders. |
| `--grey-850` | `#222428` | Resting hairlines: section rules, table borders, input borders, the rail line. |
| `--grey-900` | `#15171A` | Faint fills: hover gradient wash, the giant ghost numerals/wordmarks behind content. |
| `--signal` | `#C8553D` | THE accent. Used at ~1 pixel of intent at a time: an underline draw, an active rail tick, the CTA border, a pulse dot, the live ridge in 3D. |
| `--signal-deep` | `#7E3324` | Pressed / fill states (submit fill-from-left), mono-data selection. |
| `--signal-glow` | `rgba(200,85,61,0.14)` | Faint signal wash for convergence tints. |
| `--signal-faint` | `rgba(200,85,61,0.06)` | The faintest signal hairline tint. |

**Tonal chaptering rule:** alternate `--void` and `.section--ink` (`--ink`) to
separate chapters. Each tonal change is marked by ONE `.section__rule` hairline
that draws left to right on enter (see Section 4). This is how a long page reads
as composed chapters rather than a scroll of blocks. Every sub-page uses the same
void/ink rhythm so they feel cut from the same material.

---

## 2. SPACE, GRID, LAYOUT

Spacing is an 8px-based geometric scale. Never hardcode a px gap that an `--s-*`
token already expresses.

```
--s-1 4   --s-2 8   --s-3 16  --s-4 24  --s-5 40
--s-6 64  --s-7 104 --s-8 168 --s-9 272 --s-10 440
```

Grid tokens (do not invent new container widths):
- `--max: 1440px`: the content max-width. Every page centers content in this.
- `--margin: clamp(24px, 6vw, 120px)`: the page gutter / spine. The left index
  rail aligns to it. All page content respects it.
- `--gutter: 24px`: inter-column gutter.

Layout primitives, reused on every page:
- `.content`: the main wrapper (`z-index: 1`, sits above the fixed scene).
- `.section`: `max-width: var(--max); margin: 0 auto; padding: var(--s-9) var(--margin)`.
  The default chapter block. `position: relative` so a `.section__rule` can anchor.
- `.section--ink`: full-bleed darker band; its direct children re-center to `--max`.
- **Section vertical rhythm:** chapters breathe with `--s-9` top/bottom padding;
  hero/closing moments may use `--s-10`. Sub-pages match this exactly. Do not
  tighten one page's rhythm relative to another.

**The broken-grid tell (the hand-placed signature).** Meridian is not a clean
12-column template. Each page must carry ONE deliberate asymmetry, the same kind
seen in `.flagship__intro` (a 1.15fr / 0.85fr split where the giant word holds
the wider column) and `.pillars` (a slight right-margin overhang). One per page,
quiet, intentional. It says a person composed this. More than one per page is
noise, not craft.

Responsive breakpoints are fixed by the existing system; honor them:
- `<= 1024px`: the left rail hides (it is a desktop spine). Broken grids collapse
  to single column.
- `<= 768px`: mobile. Nav collapses to brand + single CTA, deep links hidden. A
  2px top `mobile-progress` bar replaces the rail. Pinned/scrubbed sequences
  degrade to static vertical lists. `--s-9`/`--s-10` shrink.
- `<= 420px`: `--margin` drops to 20px; tightest stacking.

---

## 3. TYPOGRAPHY

Three families, each with one job. Loaded once in `<head>` (Fraunces, Space
Grotesk, JetBrains Mono). Never add a fourth family.

- `--serif: "Fraunces"`: DISPLAY ONLY. Headlines, wordmarks, the one held italic
  quote, the giant ghost numerals. Variable font: drive `opsz` and `wght` to make
  type feel optical and expensive. Larger sizes use lower `wght` (280 to 400) so
  big type reads refined, not heavy.
- `--ui: "Space Grotesk"`: body, leads, nav, labels, UI. Resting body weight 350.
- `--mono: "JetBrains Mono"`: DATA. Every number, kicker, status line, data
  caption, table cell. `font-variant-numeric: tabular-nums lining-nums` so columns
  of figures align. Numbers are mono, always. This is the data-driven house tell.

**Type scale (use these classes verbatim; do not author one-off font-sizes):**

| Class | Family | Role |
|---|---|---|
| `.display-xl` | serif, opsz 144 / wght 280 | The one hero wordmark per page. `clamp(4.5rem, 11vw, 13rem)`. |
| `.display-l` | serif, opsz 110 / wght 330 | Major chapter headlines. `clamp(2.75rem, 6vw, 6rem)`. |
| `.display-m` | serif, opsz 60 / wght 400 | Sub-headlines, statement lines. `clamp(2rem, 4vw, 3.5rem)`. |
| `.display-quote` | serif italic, slnt -4 | The ONE held closing statement per page. Largest italic after wordmarks. |
| `.serif-quote` | serif italic, wght 300 | A pulled quote / aside in serif. |
| `.body-l` | ui, 350 | Lead paragraph under a headline. `max-width: 38ch`. |
| `.body` | ui, 350, 1.58 lh | Long-form prose. `max-width: 62ch`. Honor the measure: prose never runs full width. |
| `.label` | ui, 500, 0.16em tracking, uppercase | Eyebrows, nav, column heads. Color `--grey-700`. |
| `.mono-data` | mono, 500 | Big numerals. `clamp(2.5rem, 5vw, 4.5rem)`. |
| `.mono-label` | mono, 400, 0.1em tracking | Data captions, status lines, kickers, table cells. |

**Measure discipline:** prose columns are capped (`.body` 62ch, `.body-l` 38ch).
Headlines are capped tighter (12ch to 26ch) so they break into composed lines, not
ragged paragraphs. Never let a headline or body run the full 1440px.

**Eyebrow + index grammar (every chapter on every page).** Each chapter opens with
an `.eyebrow` that pairs a half-strength signal index with a label:
```
<p class="eyebrow label"><span class="idx">/03</span> Performance</p>
```
The `.idx` (signal at 0.5 opacity) threads a faint numbered spine down the whole
property. Number chapters per page; the index is the connective tissue that makes
four pages feel like one numbered document.

**Accent atoms (shared, do not reinvent):**
- `.signal-word`: a word that gets a hairline signal underline drawn on reveal
  (`.is-lit` added by scroll). Use sparingly: one or two per chapter at most.
- `.comment`: a grey inline aside (terminal-comment feel), `--grey-700`.
- `.dot` / `.dot--pulse`: the 7px signal status dot. Used for "live" / "pre-launch".

---

## 4. MOTION LANGUAGE

Motion is choreographed by GSAP + ScrollTrigger, smoothed by Lenis. It is
**transform/opacity/filter only.** No animating layout properties (width, height,
margin, top/left). Everything degrades to a static, fully-visible state under
`prefers-reduced-motion` and on mobile. Content is NEVER hidden without a
guaranteed reveal path (the `.js` gate + boot failsafes in `main.js`).

### 4.1 Easing tokens (the ONLY curves allowed)

Defined once in CSS (`--ease-*`) and mirrored in `scroll.js` `EASE`. Use these
four. Do not paste a new cubic-bezier.

| Token | Curve | Use |
|---|---|---|
| `--ease-out` / `EASE.out` | `cubic-bezier(0.16, 1, 0.3, 1)` | The house "expensive" ease-out. Default for reveals, hovers, underline draws. |
| `--ease-settle` / `EASE.settle` | `cubic-bezier(0.22, 1, 0.36, 1)` | Type settle: the per-character clip-rise + variable-weight settle. |
| `--ease-in-out` / `EASE.inOut` | `cubic-bezier(0.65, 0, 0.35, 1)` | Symmetric, for pinned cross-fades (e.g. the step focus pull). |
| `--ease-cinema` / `EASE.cinema` | `cubic-bezier(0.83, 0, 0.17, 1)` | FILMIC. Reserved for exactly two beats: the intro curtain lift and each page's ONE tentpole camera settle. Heavier on purpose, so the climax reads as different from everything else. |

`EASE.cinema` is precious. One cinematic beat per page, no more. Overusing it
flattens the hierarchy and the page stops feeling composed.

### 4.2 Scroll-reveal grammar (the consistent vocabulary)

Every page reveals content with this exact vocabulary, so a reader's eye is
trained once and rewarded everywhere:

1. **Headline clip-rise (per-character).** Display heads split into `.char`
   atoms inside a `.mask` (overflow-clipped). Chars rise `yPercent 115 -> 0`,
   opacity `0 -> 1`, `EASE.settle`, stagger ~0.02s, while Fraunces `wght` climbs
   from 280 to its rest weight (the type "develops" in). Opt in via `[data-chars]`
   on the head. This is the signature reveal. Hero and every chapter headline use it.
2. **Line / word fade-rise.** Body leads and sub-copy: `.reveal-fade` /
   `.reveal-line` / `.word` rise a short distance and fade in, `EASE.out`,
   content-aware duration (heavier display leads rise slower).
3. **Mono type-in.** Data lines opt in with `.type-mono`: characters reveal left
   to right like a terminal readout, with a thin signal caret on the active line
   that relaxes to rest color once written. Use for status lines and data captions.
4. **Staggered ledgers.** Rows (pillars, tenets, table rows, roadmap rows) enter
   on a stagger as one ledger, separated by `--grey-850` hairlines. Hover lifts the
   border to `--grey-825` and washes a faint `--grey-900` gradient. This row idiom
   is the workhorse layout for dense data on every sub-page.
5. **Section rule draw.** At each tonal chapter boundary, a single full-bleed 1px
   `.section__rule` scales from `scaleX(0)` to `1` left to right (`.is-drawn`).
   One per boundary. This is the seam between chapters.
6. **Parallax + velocity skew.** `[data-parallax]` (yPercent) and `[data-skew]`
   (skewY on scroll velocity) add depth. Subtle. GPU hints declared in motion.css.
   Disabled on mobile and reduced-motion.

### 4.3 Pinned tentpole beat (one per page)

Each page earns ONE held, pinned moment, choreographed against its 3D scene, that
delivers the page's thesis. On the landing it is "The System" pin: five steps
cross-fade inside a pinned frame while the manifold converges onto a single signal
ridge, then a bloom flare punctuates "they are one system." The inactive steps
blur and recede (`filter: blur(1.5px)`, opacity 0); the active step is sharp.

Each sub-page mirrors this STRUCTURE with its own content (Section 5 gives each
page's beat). The grammar is constant: pin the frame, scrub the scene's primary
uniform with pin progress, cross-fade focus with `EASE.inOut`, resolve with a
single `EASE.cinema` settle + one bloom flare, then release. Reduced-motion and
mobile drop the pin and render the content as a plain vertical sequence.

### 4.4 Lenis settings (identical on every page)

```
new Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true })
```
Wired to GSAP's ticker; `gsap.ticker.lagSmoothing(0)`. Skipped entirely under
`prefers-reduced-motion` (native scroll). Do not change `lerp` per page; the
scroll *feel* is part of the brand and must be byte-identical across pages. Use
the shared `scrollTo(target)` (1.1s duration) for any in-page anchor jump.

### 4.5 The cursor (identical on every page)

Owned by `js/cursor.js` + `css/cursor.css`. A two-part pointer:
- **Dot**: 6px solid `--paper`, no blend, lerped to the real pointer for a silky
  settle. The precise mark.
- **Ring**: 40px, `mix-blend-mode: difference`, grows by `transform: scale` ONLY
  (never box metrics, which caused wobble). The intent layer.

States (set by JS, do not invent new ones):
- `.is-hover` on links/interactive: ring brightens, optional mono caption from
  `data-cursor`.
- `.is-cta` on the two access controls only: ring turns `--signal`, blend goes
  normal so the true hue shows. The accent earns its moment here.
- `.is-canvas` over open scene ground: ring dims to a whisper.
- `.is-text` over inputs: marks hide, native I-beam owns it.

Magnetism (`data-magnetic` / `data-magnetic-row`) is reserved for the CTAs and
tier/data rows ONLY. The CTA underline sweeps from center (primary signature); body
links sweep from left (secondary). Disabled on touch/coarse/reduced-motion, where
the native cursor returns. The cursor is global chrome: it must behave identically
on all four pages. Do not re-skin it per page.

---

## 5. THE 3D / CANVAS WORLD (one motif, four chapters)

There is ONE visual world: **The Manifold** (`js/scene.js` + `js/shaders.js`). A
persistent, line-based market surface, lit by a single signal ridge filament,
filmed by a camera that genuinely flies through the geometry, with a disciplined
film stack (high-threshold bloom on the accent, vignette, homeopathic chromatic
aberration). It is GPU-light: static geometry uploaded once, all motion in shaders,
post skipped on mobile, an adaptive watchdog, IntersectionObserver/visibility pause,
and a composed static frame for reduced-motion.

**The whole property shares this one scene engine.** Each page is a different
*chapter* of the same manifold, framed by a different camera flight and a different
value of the convergence uniform. This is what makes four pages feel like one
world. You do NOT build a second scene; you compose a new camera/state path against
the existing `createScene` contract.

Scene public API (already shipped, do not change signatures):
```
createScene(canvas, { reducedMotion, mobile }) -> {
  start, stop, renderOnce, dispose, resize,
  setScroll(p),        // 0..1 global scroll -> blends the state descriptors
  setPointer(nx, ny),  // normalized pointer parallax
  pulseRidge(),        // a brief lift on the signal ridge
  setConverge(v),      // 0..1 gather the field onto one ridge (null = release)
  flareBloom(),        // the single climax bloom flare
  renderer,
}
```

The scene morphs through five scroll states (hero / coalescing / lattice plan-view
/ tightening-validation / plurality). `uConverge` (0 to 1) gathers the scattered
field onto the single ridge; the bloom threshold drops as it gathers so only the
resolved spine blooms. This convergence-onto-one-signal IS the brand metaphor:
many signals, rigorously resolved into one honest decision.

**Per-page chapter framing (the coherent motif, four faces):**

| Page | Manifold chapter | Camera framing | Convergence read | Tentpole beat |
|---|---|---|---|---|
| **Landing** | The whole arc | All five states across the full scroll | scatter -> gather -> release | "The System" pin: field converges to one ridge, bloom flare. |
| **/systems** | Coalescing + lattice | Low push-in to the structured grid (plan view). Camera studies the architecture. | mid (0.3 to 0.6): structure forming, not yet resolved | Pinned walk through the engine's layers (data lake -> factors -> portfolio -> backtester -> ML -> regime gate -> gauntlet) as the lattice tightens. |
| **/performance** | Tightening / validation | Dead-on, close to the single ridge. The most disciplined, still frame. | high (0.8 to 1.0): the field is gathered, the spine is the subject | Pinned reveal of the validation gauntlet (purged walk-forward, DSR, PSR, PBO, CPCV, baseline gate). The honest result: it does not yet clear the bar. The bloom is restrained, not triumphant. |
| **/progress** | Plurality | Pull back and up: the surfaces fan out as a fleet of future sleeves. | release (0.0 to 0.4, fanning): one proven, more to come | Pinned roadmap: AlphaForge (live in paper) plus reserved/future sleeves (equities breadth) receding into depth. |

Rules for the per-page scene:
- Reuse `createScene` and the existing states. A sub-page sets its scroll range to
  emphasize the relevant chapter (e.g. /performance lives in the high-convergence
  band) rather than authoring new geometry or shaders.
- The signal ridge is the ONLY colored element in 3D. Never add a second 3D hue.
- Lazy-init the scene (dynamic import, as `main.js` does) and pause it offscreen.
  Heavy scenes never block first paint; the intro curtain masks warm-up.
- Reduced-motion: one composed static frame, mid-convergence, so the thesis is
  legible even frozen. No-WebGL: the CSS `.scene-fallback` gradient + faint grid.
- The scene is `position: fixed; inset: 0; z-index: 0; pointer-events: none`,
  fading in via `.is-ready`. Content sits above at `z-index: 1`. This layering is
  identical on every page.

If a sub-page genuinely cannot reuse the manifold (it should be able to), a 2D
canvas fallback is permitted ONLY if it obeys the same rules: void background,
single signal accent, line-based, GPU/CPU-light, reduced-motion static frame. It
must look like the same world. A different-feeling scene is a failure.

---

## 6. GLOBAL CHROME (shared shell on every page)

Every page ships the same shell so navigation between pages is seamless. Build it
once, include it verbatim:

1. **Grain overlay**: `.grain`, fixed, `z-index: 100`, opacity 0.025, overlay
   blend. One per page. Never tune per page.
2. **Intro curtain**: the calibrating loader that lifts to reveal the live scene.
   The landing owns the full intro; sub-pages may use a shorter calibration or
   skip straight to a fast curtain lift, but the lift motion (`EASE.cinema`,
   translateY off-screen) is identical. Never cross-fade onto a static frame.
3. **Sticky top nav**: `.nav`, fixed, `z-index: 50`. Hides on scroll-down, shows
   on scroll-up, gains a backdrop blur + hairline after the first viewport. It
   carries: the **Meridian wordmark** (home, links to `/`), the three section
   links **Systems** (`/systems`), **Performance** (`/performance`), **Progress**
   (`/progress`), and the **Join / waitlist CTA** (`.nav__cta`, magnetic,
   center-out underline). On the current page, mark its nav link `aria-current="page"`
   and give it the resting-lit state (paper, underline shown). On mobile, collapse
   to wordmark + CTA only. The nav is identical chrome on all four pages.
4. **Left index rail** (desktop, `<= 1024px` hidden): `.rail`, the vertical spine
   at `--margin` with a signal fill that tracks scroll progress, a vertical
   chapter head (`railIndex` / `railName`) that ticks as chapters cross, and the
   numbered chapter list. Each page populates the rail with ITS chapters. The
   mechanism is shared; only the labels differ.
5. **Mobile progress bar**: the 2px top signal bar that replaces the rail under
   768px.
6. **Footer**: `.footer`: a status line with the live dot, a 3-column link grid,
   the legal/scope line, and the giant `--grey-900` watermark wordmark bleeding off
   the bottom. The footer is identical on every page (it is also the cross-page
   nav). Scope/honesty copy lives here and must say PAPER / SIMULATION, pre-launch,
   no real capital, no claimed returns.

Each page must ship real, per-page meta: a true `<title>`, `<meta name="description">`,
canonical URL, and Open Graph/Twitter tags matching that page's content. Semantic
HTML: one `<h1>` per page (the hero wordmark/headline), landmark `<header>`/`<main>`/
`<footer>`, a skip link as the first focusable element, labelled nav regions.

---

## 7. INTERACTION + ACCESSIBILITY BAR

Every page must clear ALL of these, identically:
- **Keyboard:** full tab order, visible `:focus-visible` ring (1px `--signal`,
  4px offset), skip link first. All interactive scene affordances have a
  non-pointer path. Pins never trap focus.
- **Reduced motion:** honored globally. Scene freezes to one composed frame; Lenis
  off; reveals show static; pins become vertical lists; cursor reverts to native.
  No content is ever gated behind motion.
- **Touch / coarse pointer:** custom cursor and magnetism disabled; native cursor;
  hover affordances become tap-safe.
- **No-JS / boot failure:** content is visible by default; reveal classes only hide
  under `html.js` + motion allowed; a 6s failsafe force-opens the intro and
  un-hides everything. Replicate this safety on every page.
- **Contrast:** text never below `--grey-700` (AA-safe). `--grey-600` is decorative
  only. Validate any text composited over the brighter parts of the scene.
- **Performance:** lazy-init the scene; pause offscreen and on tab-hidden; no
  per-frame allocation; no layout thrash (transform/opacity/filter only);
  `will-change` only where motion.css already declares it. Target a steady 60fps
  desktop; the watchdog sheds quality before frames drop.

---

## 8. COPY + CONTENT STANDARDS

- **True, sourced, specific.** No lorem, no rounded-up claims. Numeric claims come
  only from `config/brand.js` (`STATS` / `FACTS`), the single source of truth,
  bound via `data-fact` / `data-brand` / `data-flagship`. If a sub-page needs new
  verified facts, ADD them to `brand.js`; do not hardcode numbers in markup.
- **The real components only** (for /systems and /performance detail): the
  point-in-time leak-proof data lake and survivorship-bias-free universe (includes
  delisted instruments); the factor library (cross-sectional + time-series
  momentum, residual reversal, funding carry, low-vol and low-beta anomalies;
  Yang-Zhang / Parkinson volatility; Amihud / Corwin-Schultz liquidity; IC-weighted
  blend); the portfolio layer (EWMA + Ledoit-Wolf shrinkage covariance,
  mean-variance via Clarabel with a rank/inverse-vol fallback, a vol-target overlay,
  a drawdown ladder + kill switch); the cost-honest event-driven backtester
  (signal-at-close to fill-at-next-open, event-driven funding, one transaction-cost
  authority); ML meta-labeling (cost-honest triple-barrier labels, gradient-boosted
  classifier, isotonic calibration, used only to SCALE conviction, never to flip a
  signal); the HMM regime gate (hand-rolled Gaussian HMM, throttles gross exposure,
  filtered/no-lookahead); the validation gauntlet (purged walk-forward, Deflated
  Sharpe Ratio, Probabilistic Sharpe, Probability of Backtest Overfitting via CSCV,
  combinatorially-purged cross-validation, honest multiple-testing trial counts, a
  must-beat-baseline gate); the 24/7 paper-trading loop (order-book-walking fills,
  idempotent orders, reconciliation, one authoritative clock). **Do not invent any
  component beyond these.**
- **Honesty as headline, not footnote.** /performance states plainly that the
  crypto-perps-alone edge is rigorously tested and so far does NOT clear the bar,
  and that this is the point: most strategies never survive a real gauntlet; we run
  ours in the open and report what passes and what does not. The roadmap forward is
  breadth (an equities sleeve). This is presented as strength.
- **Tone:** quiet, precise, declarative. Short sentences. Long-form only where it
  earns it (the engine detail on /systems, the methodology on /performance). No
  exclamation marks, no hype adjectives, no second-person hard sell.
- **ZERO em dashes.** (Restated because it is the most common failure.) Periods,
  commas, colons, or "to" for ranges.

---

## 9. THE PRESTIGE BAR (what makes it 10/10) AND THE FORBIDDEN LIST

**A page is done when:**
- It feels cut from the same cloth as the other three: same dark void, same warm
  paper type, same single signal accent, same cursor, same scroll feel, same
  reveal grammar, same numbered chapter spine.
- Type does the heavy lifting. The composition reads as typographic and quiet, not
  decorated. There is one display moment, one held italic, one tentpole beat.
- The data is mono, tabular, and true. Numbers align. Nothing is fabricated.
- There is exactly one hand-placed asymmetry and one cinematic beat. Hierarchy is
  obvious: the eye lands story -> proof -> act.
- The 3D is the same manifold world, framed for this chapter, and dissolves into
  the void with no seam.
- It is fully accessible and degrades gracefully to a beautiful static state.
- `npm run build` is green and `grep -rPn "\x{2014}"` is empty.

**Forbidden, on any page, always:**
- Em dashes (U+2014). The hard failure.
- A second accent color, neon, multi-hue gradients, glow spam.
- Hype words: moon, guaranteed, 10x, risk-free, passive income, any return promise.
- Any performance number not sourced from the engine via `brand.js`.
- Decorations, sparkles, emoji, accessory glyphs, badges, stickers, gloss.
- A second design system: a new palette, a new easing, a new type scale, a re-skinned
  cursor, a different nav/footer, a competing scene that does not feel like the
  manifold.
- More than one cinematic beat or more than one broken-grid asymmetry per page.
- Animating layout properties; blocking first paint on the 3D; per-frame allocation.
- Pure white (#FFF) or pure black (#000); use `--paper` and `--void`.
- Crypto-bro framing of any kind. We are a sovereign fund, in restraint.

---

## 10. BUILD + ROUTING (multi-page on Vite + Vercel)

The site becomes multi-page with clean URLs `/systems`, `/performance`,
`/progress`. Implementation contract for whoever wires the build:
- Each page is its own HTML entry added to Vite's `rollupOptions.input` (keyed so
  the output is `systems.html`, `performance.html`, `progress.html` alongside
  `index.html`). All four crawl the SAME shared CSS and a SHARED JS entry; per-page
  logic is a thin module that selects the page's scene chapter and rail chapters.
- `vercel.json` keeps `cleanUrls: true` and `trailingSlash: false`, so
  `/systems` serves `systems.html`. Keep the existing cache headers and the
  `/api/waitlist` no-store rule untouched.
- Shared code stays shared: one `styles.css`/`cursor.css`/`motion.css`, one
  `scene.js`/`shaders.js`/`scroll.js`/`cursor.js`, one `brand.js`. Sub-pages import
  these; they do not copy them. A change to a token propagates to every page by
  construction. That is the guarantee that quality stays identical.
- After any change: `cd /Users/arhancanli/meridian && npm run build` (must be
  green) and `grep -rPn "\x{2014}" .` (must be empty).

---

This is the world. Four pages, one hand. Extend the system, do not fork it. When in
doubt, remove. Restraint, rigor, honesty: that is the brand.
