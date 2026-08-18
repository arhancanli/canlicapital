# Meridian / Landing Copy V2

The rebuilt landing copy. Conversion-clear and scannable in about fifteen seconds,
then depth on demand. This document is the single source of truth for the new
LANDING (`index.html`) copy only. The three sub-pages (`/systems`, `/performance`,
`/progress`) are excellent and unchanged; the long-form depth that used to live on
the landing now relocates to them, and the landing carries condensed teasers that
point there.

## What changed and why

An external advisor rated the craft 8.5/10 and trust "strong," and said keep both.
The landing's problem was not quality, it was legibility and conversion: too
text-heavy and manifesto-like, no visual proof section, an unclear value
proposition (is this a fund, a SaaS, copy-trading?), a weak call to action, and no
founder credibility. V2 fixes exactly those, in the existing prestige voice.

New landing order: compressed hero, proof strip "Research, in numbers," value
prop + who it is for + what you get, the signature System immersive moment (kept,
tighter copy), a new founder section, and the waitlist close. The Thesis,
Discipline, and House manifesto blocks compress to one-line teasers that link out.

## Binding rules (unchanged from DESIGN_SYSTEM.md and SITEMAP_COPY.md)

- ZERO em dashes (U+2014) anywhere. Periods, commas, colons, or "to" for ranges.
- "Meridian" binds via `data-brand`, "AlphaForge" via `data-flagship`. Never
  hardcode the names as text nodes.
- Verified numbers only, sourced from `config/brand.js` `STATS` / `FACTS`:
  3.5M+ hourly bars, 94 instruments (live and delisted), 24 factors, 2,500+
  automated tests (green), history from 2020, 1 cost authority, 0 look-ahead.
  Performance numbers do not exist yet and must not be invented.
- Scope honesty throughout: paper and simulation only, no real capital, no claimed
  return, nothing here is investment advice. The offer is forthcoming early access.
- Voice: Jane Street and Palantir restraint. Quiet, precise, declarative. No hype
  words, no exclamation marks, no second-person hard sell.

---

# (00) HERO `#hero` (compressed)

The on-load immersive moment stays (the manifold reveal, the wordmark dissolving
into the field, the two ridge ignitions). Only the copy is cut down: a clear
headline of what it is, a one-line subhead, three to four scannable bullets, and
ONE strong call to action. The four-line `display-m` statement and the long
paragraph are removed; the bullets and the single subhead carry the message now.

- **Status line (mono-label, top-right):** `Pre-launch` `·`
  `AlphaForge in simulation and live paper trading`
- **Eyebrow (label):** Quantitative research, proven in the open
- **Wordmark (display-xl, `data-brand`):** Meridian
- **Headline (display-m, per-line masks, what it is):**
  - Institutional-grade quantitative
  - research, proven in the open.
- **Subhead (body-l, one line, `data-flagship`):**
  AlphaForge is a multi-signal quant engine proving itself through simulation and
  live paper trading, before any real capital is ever deployed.
- **Bullets (3 to 4, scannable; mono-label or label, hairline-separated):**
  - A multi-signal engine, not a bot watching a chart.
  - Tested on honest, leak-proof data going back to 2020.
  - Running live, in paper. No real capital is at risk.
  - You watch it prove itself, in the open, before a dollar is deployed.
- **Primary CTA (the single dominant magnetic control):** Get early access
- **Secondary link (text, demoted):** See how it works
  (smooth-scrolls to `#system`)
- **Scroll cue (mono-label):** Scroll

Notes for the builder:
- One headline, not a manifesto. The bullets do the scanning work; keep each to a
  single line so the eye reads four facts in a couple of seconds.
- The CTA microcopy under the form lives at the waitlist close, not here. The hero
  CTA is one verb plus a clear object: "Get early access."
- Honesty guardrail from the review: say "proving itself" and "before any real
  capital is deployed," never that an edge is currently achieved. The subhead is
  forward-tense on purpose.

---

# (01) PROOF STRIP `#proof-strip` "Research, in numbers" (NEW, visual, honest)

The advisor's missing visual proof section. The proof here is RIGOR AND SCALE, not
returns. The honest result so far is a null on crypto alone, and that honesty is
the brand, so this strip never shows a winning curve. It animates the real
numerals (count-up on true values only, via the existing `.statband` +
`[data-count]` grammar) and reserves a slot for the real backtest equity curve.
A grand backtest is running now; until its verdict lands, the slot shows the
validation-gauntlet methodology and an honest "live research" element that links to
`/performance`, never a fabricated curve.

- **Eyebrow (label):** Research, in numbers
- **Head (display-l or display-m):** Built on rigor, not on claims.
- **Lead (body-l, short):** These are not marketing figures. Each is a property of
  the engine and its data, the kind of fact you can hold us to. Performance is not
  among them yet, on purpose.
- **The numbers (statband, count-up on enter, from `STATS`):**
  - `3.5M+` Hourly bars in the lake
  - `94` Instruments, live and delisted
  - `24` Factors measured
  - `2,500+` Automated tests, green
- **Footnote ledger (mono-label, secondary statband):**
  - `0` Look-ahead, by construction
  - `1` Cost authority, research and paper
  - `2020` Leak-proof data starts
- **The equity-curve slot (honest, reserved; reuses the `scene-fallback` grid
  language so it reads as "a chart, pending," never a fake curve):**
  - **Slot label (mono-label):** `[ live research, backtest in progress ]`
  - **Slot caption under it (mono-label):** The real out-of-sample equity curve
    appears here only after it clears the validation gauntlet. Not a day sooner.
  - **Slot link:** See the methodology and the live research `->` `/performance`
- **Aside (`//`, body):** A grand backtest is running now. We will publish what it
  shows, in full, whether it clears the bar or does not. Most strategies never
  survive a gauntlet this severe. Saying so is the point.

Notes for the builder:
- Only the four `STATS` values count up; the footnote ledger values (0, 1, 2020)
  are not animated, exactly as today. Reserved or null values never count.
- The equity-curve slot MUST stay honestly empty until a validated artifact exists
  (wire from `data-results-src` later, same contract as the `/performance` results
  slot). No sample curve, no placeholder Sharpe, no fabricated ticks. The faint CSS
  axis grid reads as an instrument powered on and waiting.
- This strip sits high on the page (right after the hero) so a fifteen-second
  scanner sees scale and rigor before any prose.

---

# (02) VALUE PROP + WHO IT IS FOR + WHAT YOU GET `#what-it-is` (NEW)

The block that ends the "is this a fund, a SaaS, or copy-trading?" confusion in one
honest pass. Three clear columns or stacked sub-blocks: what it is, who it is for,
what early access includes. Frame the offer items as WHAT IT WILL INCLUDE as each
comes online, since Meridian is pre-launch.

- **Eyebrow (label):** What this is
- **Head (display-l):** A research platform you watch prove itself.

### What it is (body, plain)

Meridian is a quantitative research platform. You watch AlphaForge prove itself in
the open, then run it yourself in paper. It is not a fund. It is not copy-trading.
There is no real capital, and nothing here is investment advice. You are not buying
a signal. You are getting a seat to watch a quantitative system be tested honestly,
and a set of tools to test it yourself.

- **Plain-language tells (three short mono-label denials, hairline-separated):**
  - Not a fund. We manage no money for you.
  - Not copy-trading. There are no trades to copy, and no real capital to risk.
  - Not advice. Nothing here is an offer, a solicitation, or a recommendation.

### Who it is for (label head + short ledger)

For people who want evidence over hype:

- **Quant-minded builders** who want to see the method, not a marketing curve.
- **Crypto and systematic traders** who judge a system by how it is tested.
- **Researchers** who want honest, leak-proof data and a real validation gauntlet.
- **Future investors** who want to watch the proof accumulate before it matters.

### What early access includes (label head; framed as forthcoming, four items)

Early access opens in order, as each capability comes online. It will include:

- **Watch live paper trading.** A read-only view of the same positions and equity
  the engine acts on, updating as it runs. No real money in play.
- **Research dashboard access.** Factor attribution, drawdown and risk, and full
  tearsheets, the same instruments the engine reads.
- **Research reports and the open build log.** What we found, what cleared the bar
  and what did not, and the build documented phase by phase.
- **Run your own simulations.** Point the engine at a question and see how it
  holds up, on the same honest data and the same costs.

- **Aside (`//`, body):** Each capability opens as it is validated, not before.
  There is no waiting on a sales call, only on the engine.

Notes for the builder:
- "It will include" framing is load-bearing: these are forthcoming, since Meridian
  is pre-launch. Do not present them as live features available today.
- Render the four offer items as the shared staggered ledger (hairline-separated
  rows, mono index, serif title, body description), the same idiom as the pillars.
  No badges, no checkmark glyphs, no "coming soon" stickers.

---

# (03) THE SYSTEM immersive moment `#system` (KEPT, copy tightened)

The signature pinned GSAP set-piece, the gold-standard tentpole, stays exactly as
choreographed (five steps cross-fade as the manifold converges onto one ridge, then
the single restrained `flareBloom`). Only the framing copy tightens; the five step
bodies are kept as shipped. It links into `/systems` for the depth.

- **Eyebrow (label):** `03 /` Systems
- **Head (display-l):** The system, end to end.
- **Sub (body-l, tightened to one sentence):** One unbroken chain of custody, from
  raw market data to a filled order. Five stages, each a discipline you can inspect.
- **The five steps (mono kicker, display-m title, body, mono data line) UNCHANGED
  from the shipped pinned sequence:**
  - `01 / Data` Point-in-time, or it does not count.
  - `02 / Signals` Edges that survive their own scrutiny.
  - `03 / Portfolio` Sized by risk, not conviction.
  - `04 / Risk` The brakes are part of the engine.
  - `05 / Execution` Filled at the open, costed in full.
- **Teaser link (bridge):** Read the full architecture `->` `/systems`

Notes for the builder:
- Keep the pin, the chain-of-custody spine (`js/landing.js`), the counter, and the
  one flare. Only the head/sub copy is shortened. The step bodies stay verbatim so
  the tentpole is not regressed.

---

# (04) CONDENSED TEASERS (the relocated manifesto, now one-line bridges)

The long Thesis, Discipline, and House depth moves to its rightful home on the
sub-pages. On the landing it becomes three short teaser cards or a compact ledger,
each a single sentence plus a bridge link. The ideas are not deleted, only
relocated. These can sit as one compact "Where to go deeper" block, or be woven
beside the relevant sections; keep them brief.

- **Eyebrow (label):** Go deeper

### Thesis teaser (links to the thesis context / `/systems`)

- **Line (serif-quote, short):** The edge was never the strategy. It was the
  discipline around it.
- **Bridge:** Why discipline first `->` `/systems`

### Discipline / methodology teaser (links to `/performance`)

- **Line (body, short):** We test against ourselves harder than any market will:
  walk-forward, deflated statistics, a must-beat-baseline gate.
- **Bridge:** See the methodology and the gauntlet `->` `/performance`

### House / roadmap teaser (links to `/progress`)

- **Line (body, short):** One method, many markets. AlphaForge is the first
  algorithm, built on an engine that was multi-asset from the first line of code.
- **Bridge:** Read the build log and the roadmap `->` `/progress`

- **Honest standing line (mono-label, kept on the landing, do not soften):** The
  crypto-only edge has not yet cleared our bar. We say so on purpose, and the path
  forward is breadth.

Notes for the builder:
- The full Thesis blockquote, the three roman-numeral Discipline tenets, the proof
  lead, and the four-row roadmap table all relocate to the sub-pages (they already
  exist there per SITEMAP_COPY.md). On the landing they survive only as these
  one-line teasers plus bridge links, so the page reads in fifteen seconds.
- Keep the verb-plus-destination bridge grammar ("Read the full architecture", "See
  the methodology", "Read the build log"). Never "click here."

---

# (05) FOUNDER SECTION `#founder` (NEW, the advisor's highest-impact trust fix)

A short, real, professional founder block. Grounded prestige restraint. No
unverifiable performance boasts: the trading background is framed as disciplined,
documented market work that became the brand principle. This is the highest-impact
trust addition on the page.

- **Eyebrow (label):** `05 /` The founder
- **Name (display-m or serif, `Arhan Canli`):** Arhan Canli
- **Role (mono-label):** Founder
- **Bio (body, tightened to the brand voice):**

  Arhan Canli grew up in Dubai, surrounded by the flashy, fast-money finance that
  Meridian is a deliberate answer to. He is a builder and a trader. He has shipped
  multiple software products end to end, including Studara, an AI-driven education
  platform. He trades actively, and he writes down his theses before the outcome is
  known. That habit became Meridian's founding principle: a claim is worth nothing
  until the evidence is on the record. He built Meridian to make quantitative
  systems that prove themselves in the open, on honest, leak-proof data, in
  simulation and paper trading, before a dollar of real capital is ever at risk.

- **Pull line (serif-quote, optional, the principle):** A claim is worth nothing
  until the evidence is on the record.

Notes for the builder:
- Honesty guardrail: do NOT write "predicted/called most stocks" or any
  performance boast. On this audience that reads as retail-guru and destroys the
  trust the rest of the site earns. Keep it grounded, confident, professional.
- No photo is required; if one is added later it stays restrained (no gloss, no
  badge). The credibility is the documented-before-the-outcome habit, stated
  plainly, not a portrait.
- Bind "Meridian" via `data-brand`. "Studara" is a real product name, a plain text
  node is fine (it is not one of the two bound brand names).

---

# (06) WAITLIST CTA close `#waitlist` (the strong, repeated call to action)

The conversion chapter, kept honest, with the incentive-driven CTA repeated. The
existing form (email input, honeypot, status line, sub note) stays; the framing
copy is tightened around the early-access incentive.

- **Eyebrow (label):** `06 /` Early access
- **Head (display-l, two-line masks):**
  - Watch it prove the edge,
  - in paper.
- **Intro (body-l, tightened):** Early access is a seat to watch AlphaForge prove
  itself, live and in paper. You get the read-only view of the same scores,
  positions, and risk the engine acts on, and each gauntlet result as a stage
  validates, with no real money in play. We open it in order, in small groups.
- **Form label (label):** Get early access
- **Form input placeholder:** you@email.com
- **Submit button (label):** Request early access
- **Form helper (mono-label):** No spam. One note when your access opens. Built in
  the open, simulation and paper only.
- **Form success (mono-label):** You are on the list. We open access in order, as
  each stage is validated.
- **Form error (mono-label):** That did not go through. Try again, or reach us from
  the footer.
- **Aside (`//`, body):** Access opens as each stage is validated, not before.
  There is no waiting on a sales call, only on the engine.

Notes for the builder:
- The submit button copy ("Request early access") and the hero CTA ("Get early
  access") are intentionally aligned around the early-access incentive. Keep both.
- Honesty intact: "prove itself," not "the edge that is winning." No return promise.

---

# Footer (unchanged)

The shared footer partial is unchanged: status line with the live dot, the three
nav columns rendered from `FOOTER_COLS`, the legal block (paper and simulation only,
no real capital, no claimed return, nothing is investment advice), the giant
Meridian watermark, the tagline "Institutional discipline, made legible.", and the
colophon. Do not edit the footer copy as part of this rebuild.

---

# Reusable microcopy (consistent across the landing)

- **Primary hero CTA:** Get early access
- **Form submit:** Request early access
- **Scope tag (mono-label):** Paper and simulation only. No real capital.
- **Status dot label:** AlphaForge / simulation and live paper trading / no real
  capital
- **Bridge link verbs:** "Read the full architecture", "See the methodology",
  "Read the build log", "See the roadmap", "Get early access." Always an action
  plus a destination, never "click here."
- **Equity-curve slot caption:** `[ live research, backtest in progress ]`
- **Founding principle (pull line):** A claim is worth nothing until the evidence
  is on the record.

# Em-dash audit reminder

After the landing is rebuilt against this copy, run the hard audit:
`cd /Users/arhancanli/meridian && npm run build` (must be green) and
`grep -rPn "\x{2014}" .` (must be empty). This copy document contains zero U+2014.
