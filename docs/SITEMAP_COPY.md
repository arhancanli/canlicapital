# Meridian / Sitemap and Copy

Content architecture for the multi-page Meridian pre-launch experience. This is
the single source of truth for the top navigation, the page map, and the full
written copy of every page and section. Builders implement against the existing
design system (`css/styles.css`, `css/cursor.css`, `css/motion.css`,
`config/brand.js`) and the existing motion grammar (`js/scroll.js`, `js/scene.js`).
Do not fork a second design language.

## Authoring rules (non-negotiable)

- **Zero em dashes.** The U+2014 character appears nowhere in any page, copy, or
  built output. Use a period, a comma, a colon, or the word "to" for ranges
  (write "2020 to 2026", never the dashed form). This is grep-audited as a hard
  failure of the build.
- **Brand binding.** "Meridian" is rendered through `data-brand`, "AlphaForge"
  through `data-flagship`, the tagline through `data-tagline`. Never hardcode the
  two names as text nodes; bind them so a rename in `config/brand.js` propagates.
- **Verified numbers only.** The only numeric claims permitted are the approved
  `STATS` and `FACTS` in `config/brand.js` (24M+ daily bars across 8,436
  survivorship-free US stocks 1997 to 2026, 3.5M+ crypto hourly bars, 94
  instruments live and delisted, 50 factors registered, 2,820+ automated tests,
  green, crypto history from 2020, 1 cost authority, 0 look-ahead). Performance
  numbers do not exist yet and must not be
  invented. The Performance page reserves a clearly-marked artifact slot for the
  day real backtest output is wired in.
- **Scope honesty.** Everywhere it matters: paper and simulation only, no real
  capital, no claimed return. This is the brand, not a disclaimer.
- **Voice.** Jane Street and Palantir restraint. Quiet, precise, prestigious.
  No hype words ("moon", "guaranteed", "10x", "revolutionary", "game-changing").
  Long-form where the idea earns it; never padded.

## Shared design tokens (already defined, do not redefine)

Palette `--void #0A0B0D`, `--ink #070809`, `--paper #F4F1EA`, signal `--signal
#C8553D`. Type: Fraunces (display serif), Space Grotesk (UI), JetBrains Mono
(data). Type classes: `display-xl`, `display-l`, `display-m`, `serif-quote`,
`display-quote`, `body-l`, `body`, `label`, `mono-data`, `mono-label`. Motion
primitives reused on every page: `.mask[data-chars]` per-character clip-rise,
`.reveal-fade`, `.reveal-words`, `.reveal-line`, `.type-mono` terminal readout,
`.section__rule` hairline draw, `.signal-word` accent plus ridge pulse,
`[data-parallax]`, `[data-skew]`, `[data-magnetic]`, `[data-cursor-pinned]`. The
Manifold scene (`scene.js`) exposes `setScroll`, `setConverge`, `flareBloom`,
`pulseRidge`, `setPointer`; each sub-page lazy-inits its own tuned variant.

---

# 1. Sitemap and top navigation

Four destinations plus the conversion. Each nav item is BOTH a teaser section on
the landing page AND a link to its own deeply detailed sub-page. Clean URLs via
the existing `cleanUrls: true` in `vercel.json`.

```
/                 Landing (the full narrative; teasers link down then out)
/systems          The architecture story (was "System" on the landing)
/performance      The honest methodology and the reserved results slot ("Status")
/progress         The 12-phase build log, edge status, and roadmap ("Progress")
```

### Top nav structure (sticky, shared on every page)

The nav is the existing `header.nav` component, lifted to a shared partial so it
is byte-identical across pages. Left: the Meridian wordmark, which is the home
link. Right: three section links plus the waitlist CTA.

| Slot | Label | Landing target | Sub-page |
| --- | --- | --- | --- |
| Brand (home) | `Meridian` | `/#hero` | `/` |
| Link 1 | `Systems` | `/#systems` | `/systems` |
| Link 2 | `Performance` | `/#performance` | `/performance` |
| Link 3 | `Progress` | `/#progress` | `/progress` |
| CTA | `Join the waitlist` | `/#waitlist` | `/#waitlist` |

Behavior, unchanged from `main.js`: hide on scroll-down, reveal on scroll-up,
hairline plus backdrop blur after the first viewport. On the sub-pages the nav
links point to the canonical clean URLs; on the landing they smooth-scroll to the
matching teaser section (Lenis `scrollTo`). The active page link carries the
signal underline at rest (`is-current`). On mobile the three links collapse and
only the wordmark and the CTA remain, matching the current responsive rule.

### Left index rail (per page)

The existing `.rail` chapter spine is retained per page with page-appropriate
chapter names fed to `CHAPTER_NAMES` in `scroll.js`. Landing keeps its current
nine chapters. Each sub-page declares its own rail (see per-page sections). The
rail is desktop-only and is replaced by the thin top progress bar under 1024px.

### Cross-page consistency contract

Every page ships: the grain overlay, the calibration intro on first paint, the
custom cursor, Lenis smoothing, the same GSAP reveal language, a tuned Manifold
scene, real per-page `<title>`, `<meta name="description">`, canonical link, and
Open Graph and Twitter tags. The footer is the shared partial on every page.

---

# 2. Landing page (`/`)

The landing keeps its existing chapter spine and extends it so that three of its
chapters become explicit teasers that link out to the new sub-pages. Order, rail
indices, and section ids below. The hero, thesis, flagship, discipline, house,
waitlist, and footer chapters are already written and shipping; their copy is
reproduced here as the canonical source and lightly tightened. The new work is
the teaser framing on Systems, Performance, and Progress, each ending in a
"read the full page" link.

Rail chapters (landing): `Overview, Thesis, AlphaForge, Systems, Discipline,
Performance, Progress, Waitlist, Colophon`.

## (00) Hero `#hero`

- **Status line (mono-label, top-right):** `Pre-launch` / `AlphaForge in
  simulation and live paper trading`
- **Eyebrow:** Building an institutional-grade algorithm in the open
- **Wordmark (display-xl, `data-brand`):** Meridian
- **Statement (display-m, per-line masks):**
  - We built the discipline
  - before we built the profit.
  - AlphaForge is the
  - first algorithm.
- **Sub (body-l):** AlphaForge is a multi-signal quantitative engine for crypto
  perpetual futures. It runs live, on paper, while it is tested for a positive
  edge on honest, leak-proof data. No real capital is at risk. Early
  access is by waitlist.
- **Primary CTA:** Join the waitlist  ·  **Secondary:** Read how it works (to `#flagship`)
- **Scroll cue:** Scroll

## (01) Thesis `#thesis`

- **Eyebrow:** 01 / Thesis
- **Quote (serif-quote, `reveal-words`):** The edge was never the strategy. It
  was the `discipline` around it. Point-in-time data. A refusal to fool
  ourselves. We built that discipline first, and we will not commit real capital
  until the engine has earned it.
- **Aside (`//`):** Most platforms show you a chart and ask for your trust. We
  show you the method, then ask you to watch it prove itself in paper.

## (02) AlphaForge / the flagship `#flagship`

Existing five-pillar chapter, unchanged. Eyebrow "02 / The flagship", tag
"Algorithm 01", the giant `AlphaForge` word, the lead paragraph, and the five
pillars (Honest universe; Many signals, one decision; A portfolio, not a pile of
trades; Costs that tell the truth; Next open, never this one). This chapter is
the natural lead-in to `/systems`; close it with a quiet bridge link.

- **Bridge link (new, end of flagship):** See the system, end to end → `/systems`

## (03) Systems teaser `#systems`

This chapter becomes the teaser for `/systems`. Keep the existing pinned
five-step Manifold convergence sequence as the on-landing experience (Data,
Signals, Portfolio, Risk, Execution). Reframe the head and add the outbound link.

- **Eyebrow:** 03 / Systems
- **Head (display-l):** The system, end to end.
- **Sub (body-l):** Five stages. One unbroken chain of custody from raw market
  data to a filled order. Each stage is a discipline, and each one can be
  inspected.
- **Step copy:** unchanged from the shipped pinned sequence (the five steps with
  their `step__data` mono lines).
- **Teaser link (new):** Read the full architecture → `/systems`

## (04) Discipline `#discipline`

Existing recessed pinned chapter, unchanged. Eyebrow "04 / The discipline", head
"A system that will not lie to you.", the three roman-numeral tenets
(Walk-forward, always; Statistics that have been made to confess; Built to
survive its worst day), and the closing display-quote "We test against ourselves
harder than any market will." This chapter is the lead-in to `/performance`.

## (05) Performance teaser `#performance`

This replaces the current "Status / Proof" chapter as the teaser for
`/performance`. It keeps the honest stat band (the only numbers on the page) and
reframes the headline around proof and methodology rather than a static "status".

- **Eyebrow:** 05 / Performance
- **Head (display-l):** What is true today.
- **Lead (body-l):** No marketing numbers live on this page. The figures below
  are properties of the engine and its data, the kind of facts you can hold us
  to. Performance is not among them, because AlphaForge has not traded real
  capital, and we will not publish a return until one has been earned in the
  open.
- **Stat band (from `STATS`):** 24M+ daily bars, equity lake (1997 to 2026) ·
  8,436 US stocks, survivorship-free · 50 factors registered · 2,820+ automated
  tests, green.
- **Footnote ledger:** 0 look-ahead, by construction · 1 cost authority, research
  and paper · 2020 history starts.
- **Aside (`//`):** AlphaForge runs in simulation and live paper trading. No real
  money is at risk. Real capital waits until a positive edge is proven, and not a
  day sooner.
- **Teaser link (new):** See the methodology and the gauntlet → `/performance`

## (06) Progress teaser `#progress`

New chapter, folded into the existing "House" chapter's slot or placed adjacent.
It teases `/progress`: the build is twelve phases deep, the edge is honestly not
yet cleared on crypto alone, and the path forward is breadth. Keep the existing
multi-algorithm roadmap table as the visual centerpiece.

- **Eyebrow:** 06 / Progress
- **Head (display-l):** One method. Many markets.
- **Lead (body-l):** AlphaForge is the first algorithm, not the only one. The
  engine beneath it was built multi-asset from the first line of code: one data
  contract, one cost authority, one validation library, one execution loop.
  Twelve phases are built and tested. The crypto-only edge has not yet cleared
  our own bar, and we say so plainly. The road forward is breadth.
- **Roadmap table:** Algorithm 01 AlphaForge / Crypto perpetuals / Paper trading
  · Algorithm 02 [reserved] / Equities / Planned, next · Algorithm 03 [reserved] /
  Futures / Planned · Algorithm 04 [reserved] / Cross-asset / Planned.
- **Aside (`//`):** Each new algorithm inherits the same standard of proof.
  Nothing skips the discipline, and nothing trades real money before it earns the
  right.
- **Teaser link (new):** Read the build log and the roadmap → `/progress`

## (07) Waitlist `#waitlist`

Existing conversion chapter, unchanged. Eyebrow "07 / Waitlist", head "Watch it
prove the edge, in paper.", the intro paragraph, the email form (with honeypot),
the status line, and the sub note "No spam. One note when your access opens.
Built in the open, simulation and paper only." Aside: "Access opens as each stage
is validated, not before. There is no waiting on a sales call, only on the
engine."

## (08) Footer `#footer` (shared partial)

Status line, three nav columns (Platform, AlphaForge, Firm), the legal block, the
giant Meridian wordmark watermark, the tagline, and the colophon. The footer nav
columns are updated so their links point to the new clean URLs:

- **Platform:** AlphaForge (`/#flagship`) · Systems (`/systems`) · The Discipline
  (`/#discipline`) · The House (`/progress`)
- **AlphaForge:** Performance (`/performance`) · How it works (`/systems`) · Join
  the waitlist (`/#waitlist`)
- **Firm:** Thesis (`/#thesis`) · Building in the open (`/progress`) · Contact
  (`/#waitlist`)
- **Legal (unchanged):** Meridian provides quantitative trading software and
  research. Nothing on this page is investment advice, an offer, or a
  solicitation. AlphaForge is in simulation and live paper trading. No statement
  here describes live capital performance, and no return is claimed. Simulated and
  paper results do not indicate future outcomes.
- **Tagline (`data-tagline`):** Institutional discipline, made legible.
- **Colophon:** © 2026 Meridian. Built in Dubai. Type set in Fraunces, Space
  Grotesk, and JetBrains Mono.

---

# 3. `/systems` page

The deep architecture story. This is where the curious reader who clicked "read
the full architecture" arrives. It expands the landing's five-step teaser into
six detailed chapters, each a real component of AlphaForge described truthfully.

- **`<title>`:** Meridian / Systems, the architecture of AlphaForge
- **`<meta description>`:** How AlphaForge works, end to end: a leak-proof
  data lake, an IC-weighted factor library, a risk-aware portfolio, a cost-honest
  backtester, an ML and regime overlay, and a 24/7 paper-trading loop. Built in
  the open, in simulation and paper only.
- **Rail chapters:** `Overview, Data, Factors, Portfolio, Backtester, Overlays,
  Paper loop`
- **Scene:** the Manifold tuned so the convergence (`setConverge`) tracks the
  reader's descent from raw scatter (Data) to the single gathered spine
  (Backtester), then fans out again on the paper loop. `flareBloom` fires once,
  on the gauntlet beat in the Backtester chapter.

## (00) Systems hero

- **Eyebrow:** Systems
- **Head (display-xl or display-l):** The machine, with the cover off.
- **Sub (body-l):** AlphaForge is not a bot watching a chart. It is a research
  process that happens to trade. Six components carry a single decision from raw
  market data to a costed fill, and every one of them is built to refuse a lie.
  Here is each, in order, with nothing hidden.
- **Mono index line (`type-mono`):** data → factors → portfolio → backtester →
  overlays → paper loop

## (01) Data integrity `#data`

- **Kicker:** 01 / Data integrity
- **Head (display-m):** Point-in-time, or it does not count.
- **Body:** The data lake is the foundation, and it is built to make a lie
  expensive. Every bar is stamped with the moment it could actually have been
  known, to the millisecond. A decision evaluated at one o'clock may read only
  what existed at one o'clock. One reader enforces this on every query, so a leak
  is not something we hope to avoid. It is something the data layer will not
  permit. The same store feeds research and live paper trading, so a backtest and
  a live decision read from one contract, never two that merely resemble each
  other.
- **Sub-point, survivorship:** The universe is survivorship-bias-free. It includes
  the instruments that died. Listing and delisting are recorded as historical
  facts, so a backtest cannot quietly drop the names that went to zero and keep
  only the winners. The graveyard is in the data, by design.
- **Sub-point, parity:** Research code and live code share the same path. There is
  no second implementation that drifts. What the backtester runs is what the paper
  loop runs.
- **Data line (`type-mono`):** 3.5M+ hourly bars / from 2020 / 94 instruments,
  live and delisted / zero look-ahead

## (02) The factor library `#factors`

- **Kicker:** 02 / The factor library
- **Head (display-m):** Many signals, measured before they vote.
- **Body:** AlphaForge scores every instrument across two dozen factors drawn
  from the published anomaly literature and from market microstructure, then
  blends them by how much real predictive content each one carries. The blend is
  information-coefficient weighted: a factor earns its weight by its measured
  correlation with future returns, not by how good its story sounds. What does not
  earn its place is shrunk toward zero. The engine would rather hold cash than
  trade a signal it cannot defend.
- **The families (list, real components only):**
  - **Momentum, two kinds.** Cross-sectional momentum (which names are leading the
    pack) and time-series momentum (whether a name is trending against its own
    past). Held on a short leash, because momentum is the factor most prone to
    crowding.
  - **Residual reversal.** The short-horizon tendency of a name to revert after
    moving away from what its peers and its own structure imply.
  - **Funding carry.** The funding rate paid between longs and shorts on a
    perpetual, read as a carry signal rather than noise.
  - **Low-volatility and low-beta anomalies.** The persistent tendency of calmer,
    lower-beta instruments to deliver better risk-adjusted returns than their
    racier peers.
  - **Volatility estimators.** Yang-Zhang and Parkinson estimators that use the
    full open-high-low-close bar, not just closes, for a less noisy read on risk.
  - **Liquidity measures.** Amihud illiquidity and the Corwin-Schultz spread
    estimator, so the engine knows what a position will actually cost to hold and
    to exit.
- **Closing line:** The output is one score per instrument, per hour. A single
  number that the rest of the system can size, constrain, and fill against.
- **Data line (`type-mono`):** 50 factors / IC-weighted blend / one score per
  instrument, per hour

## (03) Portfolio and risk `#portfolio`

- **Kicker:** 03 / Portfolio and risk
- **Head (display-m):** A portfolio, not a pile of trades.
- **Body:** Scores become positions through a portfolio construction step that
  treats correlated bets as one bet. The covariance is estimated with an EWMA that
  leans on recent data and a Ledoit-Wolf shrinkage that pulls a noisy sample
  matrix toward a stable target, so the estimate is usable even when the history is
  short. Positions are solved by mean-variance optimization using the Clarabel
  conic solver, with a rank and inverse-volatility fallback for the moments the
  optimizer cannot find a clean solution. A volatility-target overlay then scales
  the whole book so it holds a chosen level of risk through calm and through
  stress, rather than a steady number of bets that quietly grows dangerous when
  the market does.
- **The brakes:** Risk is part of the engine, not bolted on after. A drawdown
  ladder reduces gross exposure in steps as losses accumulate, and a kill switch
  stands behind it for the case the ladder is not enough. The system is designed to
  do less when the market gives it less to work with, and to fail toward safety
  when something is wrong.
- **Data line (`type-mono`):** EWMA + Ledoit-Wolf covariance / Clarabel MVO,
  rank fallback / vol-target overlay / drawdown ladder + kill switch

## (04) The cost-honest backtester `#backtester`

- **Kicker:** 04 / The truth backtester
- **Head (display-m):** Costs that tell the truth.
- **Body:** The backtester is event-driven and built to remove the two ways a
  backtest usually flatters itself. First, timing: a signal computed at a bar's
  close is filled at the next bar's open, never the bar it decided on, so there is
  no looking ahead by construction. Second, cost: spreads, exchange fees, and the
  funding paid on perpetuals are charged exactly as they would be charged live.
  Funding is modeled as the discrete, event-driven cash flow it actually is, not
  smeared into an average. One transaction-cost authority prices every fill, in
  research and in paper trading alike, so the number a strategy earns in a
  backtest is the number it would have paid for in the market.
- **The gauntlet (the prestige centerpiece, its own emphasized block):** A good
  backtest is easy to fake and easy to fool yourself with. So before any result is
  trusted it must clear a validation gauntlet:
  - **Purged walk-forward.** Train on the past, test on a future the model never
    saw, with a purge and embargo so no information bleeds across the boundary,
    then roll forward and repeat.
  - **Deflated Sharpe Ratio and Probabilistic Sharpe Ratio.** A Sharpe is
    discounted for how many strategies were tried to find it and for the
    non-normal shape of returns, so a number that survives is one that is unlikely
    to be luck.
  - **Probability of Backtest Overfitting (PBO), via CSCV.** Combinatorially
    symmetric cross-validation estimates the chance that the strategy that looked
    best in-sample is actually no better than the median out-of-sample.
  - **Combinatorially-purged cross-validation.** Many train and test splits, each
    purged, so the estimate of performance is not a single lucky path.
  - **Honest trial counts.** We count the number of configurations tested and feed
    that count into the deflation, rather than pretending we only ever tried one.
  - **A must-beat-baseline gate.** A strategy must beat a simple, honest baseline
    by a meaningful margin, or it does not pass. Beating zero is not the bar.
- **Closing line:** Most strategies never survive a real gauntlet. The point of
  building one this severe is so that, when something does survive, the number
  means what it says.
- **Data line (`type-mono`):** signal-at-close → fill-at-next-open / event-driven
  funding / one cost authority / purged WFV + DSR + PBO + baseline gate

## (05) The intelligence overlays `#overlays`

- **Kicker:** 05 / The overlays
- **Head (display-m):** Conviction, scaled. Exposure, gated.
- **Body, meta-labeling:** A gradient-boosted classifier sits on top of the
  factor signal as a meta-labeler. It is trained on cost-honest triple-barrier
  labels (did a position hit its profit target, its stop, or its time limit first,
  net of costs) and its probabilities are isotonically calibrated so a stated 70
  percent means roughly 70 percent. Critically, the model is used only to SCALE
  conviction up or down. It never flips a signal. The factor engine decides
  direction; the meta-labeler decides how much to believe it.
- **Body, regime gate:** A hand-rolled Gaussian hidden-Markov model reads the
  market's latent regime and throttles gross exposure when the regime is adverse.
  It is run filtered, with no lookahead, so its view at any moment uses only what
  was knowable then. When the market turns hostile, the engine carries less.
- **Closing line:** Neither overlay is a black box bolted to the front. Both sit
  inside a decision the factor engine has already made, and both can only make the
  engine more careful, never more reckless.
- **Data line (`type-mono`):** triple-barrier labels / gradient-boosted +
  isotonic calibration / scales conviction, never flips / Gaussian HMM regime gate

## (06) The paper-trading loop `#paper-loop`

- **Kicker:** 06 / The paper loop
- **Head (display-m):** The same system, run live, on paper.
- **Body:** Research and paper trading are not two systems that resemble each
  other. They are one system, run twice. A 24/7 loop walks the live order book to
  estimate realistic fills, places idempotent orders so a retry can never
  double-count, reconciles its own ledger against the venue so its books are
  always honest, and runs off a single authoritative clock so every component
  agrees on what time it is and what was knowable. State is written down, so a
  process killed mid-decision resumes exactly where it stopped, with no lost
  position and no double fill. This is the part that decides whether an edge
  survives contact with a real market, so it is engineered for the moment things
  go wrong.
- **Closing line:** No real capital touches this loop. It is the dress rehearsal,
  run in full costume, for as long as it takes to earn the right to a live stage.
- **Data line (`type-mono`):** order-book-walking fills / idempotent orders /
  reconciliation / one authoritative clock / crash-safe, resumable

## (07) Systems closing / CTA

- **Quote (display-quote):** Built to refuse a lie, end to end.
- **Sub:** That is the whole machine. What it has produced so far, honestly
  reported, lives on the performance page.
- **Links:** See the performance methodology → `/performance`  ·  Join the
  waitlist → `/#waitlist`

---

# 4. `/performance` page

The honest methodology and the place where real numbers will live. This page is
deliberately number-light today: it explains what the gauntlet measures and why,
states the verified engine facts, and reserves a clearly-marked, visually
present slot for the real backtest curves and statistics the day they are wired
from artifacts. No invented numbers, ever.

- **`<title>`:** Meridian / Performance, methodology and honest results
- **`<meta description>`:** How Meridian measures whether an edge is real:
  purged walk-forward, Deflated and Probabilistic Sharpe, Probability of Backtest
  Overfitting, a must-beat-baseline gate. The verified engine facts, and a
  reserved slot for real results. No claimed return; simulation and paper only.
- **Rail chapters:** `Overview, Method, What we measure, The facts, Results,
  Standing`
- **Scene:** the Manifold held in its tightened, dead-on convergence state
  (`setConverge` near 1) for most of the page, so the page reads as the moment of
  scrutiny. The reserved results chapter uses a calm, near-still frame so the
  eye goes to the (eventual) data, not the motion.

## (00) Performance hero

- **Eyebrow:** Performance
- **Head (display-l):** We would rather show you the method than a number we
  cannot defend.
- **Sub (body-l):** Most platforms lead with a curve. We lead with how the curve
  is judged, because a curve is only as honest as the test behind it. This page
  explains exactly how we decide whether an edge is real, states the facts we can
  prove today, and holds an open slot for the results, reported in full, the day
  they are earned.
- **Standfirst banner (mono-label, signal):** Paper and simulation only. No real
  capital. No claimed return.

## (01) Methodology `#method`

- **Kicker:** 01 / Method
- **Head (display-m):** Honesty is a process, not a promise.
- **Body:** Every result Meridian reports is produced the way the system would
  actually have to live. The model is trained on the past, tested on a future it
  has not seen, and rolled forward, with a purge and an embargo around every
  train and test boundary so no information leaks across it. There is one set of
  rules for research and one for reality, and they are the same set. Costs are
  charged in the test exactly as they are charged in paper, by a single
  transaction-cost authority. Signals computed at a bar's close are filled at the
  next open. Nothing in the method is there to make the number bigger; everything
  in it is there to make the number trustworthy.
- **Pull line (serif-quote):** We test against ourselves harder than any market
  will.

## (02) What the gauntlet measures `#measures`

- **Kicker:** 02 / What we measure
- **Head (display-m):** Six ways to catch ourselves out.
- **Intro:** When you search enough ideas, one of them will look brilliant by
  luck. The gauntlet exists to tell that apart from a real edge. Each test below
  is a different way of asking the same hard question: would this survive if the
  world had not been so kind?
- **The measures (cards or ledger rows, one per metric):**
  - **Purged walk-forward.** The backbone. Out-of-sample by construction, with
    purge and embargo so the test set is genuinely unseen. If an edge only exists
    in-sample, this is where it disappears.
  - **Deflated Sharpe Ratio.** A Sharpe ratio discounted for the number of trials
    behind it and for the non-normal shape of real returns. It answers: given how
    hard we looked, how impressed should we actually be?
  - **Probabilistic Sharpe Ratio.** The probability that the true Sharpe is above
    a chosen threshold, given the sample. A confidence statement, not a point
    estimate.
  - **Probability of Backtest Overfitting.** Estimated by combinatorially
    symmetric cross-validation. The chance that the configuration that looked best
    in-sample is no better than the median out-of-sample. Lower is better; high
    PBO is the classic signature of a curve-fit.
  - **Combinatorially-purged cross-validation.** Performance estimated across many
    purged train and test combinations, so the headline figure is not one lucky
    path through history.
  - **Honest trial counting and a must-beat-baseline gate.** We count every
    configuration we tried and feed it into the deflation, and we require a
    strategy to beat a simple honest baseline by a meaningful margin. Beating zero
    is not the bar.
- **Closing line:** A strategy clears the gauntlet or it does not. There is no
  partial credit, and there is no quiet rerun until the answer is the one we
  wanted.

## (03) The verified facts `#facts`

- **Kicker:** 03 / The facts
- **Head (display-m):** What is true today.
- **Lead:** These are the only numbers on this page, and every one is a property
  of the engine and its data rather than a performance claim. They are the facts
  you can hold us to.
- **Stat band (from `STATS`, same component as the landing):** 24M+ daily bars,
  equity lake (1997 to 2026) · 8,436 US stocks, survivorship-free · 50 factors
  registered · 2,820+ automated tests, green.
- **Footnote ledger:** 0 look-ahead, by construction · 1 cost authority, research
  and paper · 2020 history starts.
- **Aside (`//`):** Performance is deliberately absent from this ledger.
  AlphaForge has not traded real capital, so there is no live return to report,
  and we will not manufacture one from a backtest.

## (04) Results, reserved `#results`

The load-bearing transparency moment. A real, present, clearly-labeled slot that
says: the numbers go here, and they are not here yet. It must look intentional,
not like a missing image. Built so a future builder wires it from artifacts (for
example a JSON or CSV emitted by the gauntlet) without redesigning the page.

- **Kicker:** 04 / Results
- **Head (display-m):** This is where the curve will go.
- **Body:** When AlphaForge clears the gauntlet, this is where the evidence will
  live: the out-of-sample equity curve, the Deflated and Probabilistic Sharpe
  ratios, the Probability of Backtest Overfitting, the trial count behind them,
  and the baseline it had to beat. We are showing you the empty frame on purpose.
  A results page that fills itself with a number before the number is real is
  exactly the thing this company exists not to be.
- **Reserved artifact panel (markup contract):** A bordered panel
  (`results__slot`) holding a placeholder state with the mono caption
  `[ awaiting validated artifact ]` and a faint axis grid drawn in CSS (reuse the
  `scene-fallback` grid language so it reads as "a chart, pending"). Wire from a
  build artifact via a `data-results-src` attribute when the gauntlet output is
  ready; until then the panel renders its honest empty state. The component must
  carry no fabricated tick values, no sample curve, no placeholder Sharpe.
  Reserved fields, labeled and empty: `Out-of-sample equity` · `Deflated Sharpe` ·
  `Probabilistic Sharpe` · `PBO` · `Trials tested` · `Baseline beaten by`.
- **Microcopy under the panel (mono-label):** Numbers appear here only after they
  clear purged walk-forward and the deflation. Not before.

## (05) The honest standing `#standing`

The brand's defining moment, stated as strength. Do not soften it into failure,
and do not spin it into hype.

- **Kicker:** 05 / Standing
- **Head (display-l):** The crypto-only edge has not cleared the bar. We are
  telling you that on purpose.
- **Body:** Here is the honest status, the kind most platforms would never print.
  AlphaForge, tested rigorously on crypto perpetual futures alone, does not yet
  clear our validation gauntlet. The signal is real enough to be interesting and
  not yet strong enough, after honest deflation and cost, to stake capital on.
  Most strategies never survive a gauntlet this severe; ours has not yet, on this
  asset class alone, and we would rather say so than dress a backtest up as a
  promise. The differentiator of Meridian is not that we always win. It is that we
  run the test in the open and report what passes and what does not.
- **Pull line (display-quote):** Intellectual honesty is the only edge that
  compounds.
- **Forward line:** The path from here is breadth, and it is on the progress page.
- **Links:** See the roadmap → `/progress`  ·  Join the waitlist → `/#waitlist`

---

# 5. `/progress` page

The build transparency page: the 12-phase journey, the honest edge status again
(stated from the build's point of view), and the roadmap forward. This is the
page that earns trust by showing the receipts.

- **`<title>`:** Meridian / Progress, the build in the open
- **`<meta description>`:** Twelve phases shipped, 2,820+ automated tests, mypy
  strict, CI. The honest status of the edge, and the roadmap forward: an equities
  sleeve and breadth across asset classes. Simulation and paper only; no claimed
  return.
- **Rail chapters:** `Overview, The build, Phases, Edge status, Roadmap, Standing`
- **Scene:** the Manifold in its plurality / fan-out state for most of the page
  (the field spreading into a fleet), since this page is about breadth and what
  comes next. A single `pulseRidge` on the "12 phases" stat.

## (00) Progress hero

- **Eyebrow:** Progress
- **Head (display-l):** Built in the open, phase by phase.
- **Sub (body-l):** Meridian is a company you can audit. AlphaForge is twelve
  phases of engineering deep, every phase tested before the next began, and the
  whole of it is held to a single standard of proof. This page is the build log,
  the honest status of the edge, and where the house goes next.
- **Mono stat strip (`type-mono`):** 12 phases shipped / 2,820+ automated tests /
  mypy --strict / continuous integration

## (01) How it was built `#build`

- **Kicker:** 01 / The build
- **Head (display-m):** Discipline first, profit second.
- **Body:** The order of the work is the thesis. The data integrity, the cost
  authority, the validation gauntlet, and the crash-safe execution loop were
  built before any serious effort went into chasing return, because a good
  backtest only means something on top of a process honest enough to trust. The
  engine is statically typed under mypy strict, every phase is covered by tests
  that must pass in continuous integration before the next phase starts, and
  research and live code share one path. Nothing here is a prototype dressed up as
  a product.
- **Data line (`type-mono`):** 12 phases / 2,820+ tests, green / mypy --strict /
  CI on every change

## (02) The twelve phases `#phases`

- **Kicker:** 02 / Phases
- **Head (display-m):** Twelve phases, in the order they had to come.
- **Intro:** The build was sequenced so that each phase could be trusted before
  the next leaned on it. Foundations first, then signal, then the machinery that
  decides whether the signal is real, then the loop that runs it live on paper.
- **Phase ledger (numbered rows, grouped into four arcs; honest framing, no
  fabricated dates):** The phases are presented in four arcs. Each row is a
  component already described on the systems page, here framed as a build
  milestone.
  - **Foundations.** Point-in-time, leak-proof data lake. Survivorship-bias-free
    universe including delisted instruments. Research and live code parity.
  - **Signal.** The factor library: momentum, residual reversal, funding carry,
    low-volatility and low-beta, with Yang-Zhang and Parkinson volatility and
    Amihud and Corwin-Schultz liquidity. The IC-weighted blend.
  - **Portfolio and proof.** EWMA and Ledoit-Wolf covariance, Clarabel
    mean-variance optimization with a fallback, the volatility-target overlay, the
    drawdown ladder and kill switch. The cost-honest event-driven backtester. The
    validation gauntlet: purged walk-forward, Deflated and Probabilistic Sharpe,
    PBO via CSCV, combinatorially-purged cross-validation, honest trial counts,
    the must-beat-baseline gate.
  - **Intelligence and live paper.** ML meta-labeling with triple-barrier labels
    and isotonic calibration, used only to scale conviction. The Gaussian HMM
    regime gate. The 24/7 paper-trading loop: order-book-walking fills, idempotent
    orders, reconciliation, one authoritative clock.
- **Implementation note for builders:** Render as a vertical phase ledger reusing
  the `roadmap__row` / `tenet` row language (hairline-separated rows, mono index,
  serif title, body description). Mark each shipped row with the live signal dot.
  Do not assign phase numbers to specific calendar dates; "12 phases" is the
  verified count, the per-phase split above is the honest grouping.

## (03) The edge status `#edge-status`

Restate the honest standing, framed from the build side. Consistent with the
performance page; never contradictory.

- **Kicker:** 03 / Edge status
- **Head (display-m):** What the build has and has not proven.
- **Body:** Twelve phases of engineering have produced a system that is, by
  construction, hard to fool: leak-proof data, honest costs, and a gauntlet
  severe enough that most strategies never survive it. What those twelve phases
  have not yet produced is a crypto-only edge that clears that gauntlet. We hold
  the engineering and the integrity as proven; we hold the standalone crypto edge
  as not yet proven, and we report it that way. This is the expected outcome of an
  honest test, not a failure of one.
- **Aside (`//`):** A platform that has never reported a strategy failing to clear
  its own bar is a platform that is not really running the bar.

## (04) The roadmap `#roadmap`

- **Kicker:** 04 / Roadmap
- **Head (display-l):** The way forward is breadth.
- **Body:** A single asset class is a single bet on one market staying
  inefficient in one way. The strongest answer to a thin standalone edge is not a
  louder claim; it is more, lowly-correlated sources of return run through the same
  honest machine. The next algorithm is an equities sleeve. The engine was built
  multi-asset from the first line of code: one data contract, one cost authority,
  one validation library, one execution loop. A new strategy does not need a new
  platform. It inherits a discipline that already exists, and it has to clear the
  same gauntlet before it earns a dollar.
- **Roadmap table (shared with the landing house chapter):** Algorithm 01
  AlphaForge / Crypto perpetuals / Paper trading · Algorithm 02 [reserved] /
  Equities / Planned, next · Algorithm 03 [reserved] / Futures / Planned ·
  Algorithm 04 [reserved] / Cross-asset / Planned.
- **Aside (`//`):** Each new algorithm inherits the same standard of proof.
  Nothing skips the discipline, and nothing trades real money before it earns the
  right.

## (05) Progress closing / CTA

- **Quote (display-quote):** We are building the proof in public, one phase at a
  time.
- **Sub:** Early access is a seat to watch it happen, in simulation and live paper
  trading, with no real money in play.
- **Links:** Join the waitlist → `/#waitlist`  ·  See the architecture →
  `/systems`

---

# 6. Microcopy and shared strings

- **Primary CTA (all pages):** Join the waitlist
- **Form submit button:** Request early access
- **Form helper:** No spam. One note when your access opens. Built in the open,
  simulation and paper only.
- **Form success:** You are on the list. We open access in order, as each stage is
  validated.
- **Form error (generic):** That did not go through. Try again, or reach us from
  the footer.
- **Scope tag (reusable mono-label):** Paper and simulation only. No real capital.
- **Status dot label (footer and hero):** AlphaForge / simulation and live paper
  trading / no real capital
- **Cross-page bridge link verbs (consistent):** "Read the full architecture",
  "See the methodology", "Read the build log", "See the roadmap", "Join the
  waitlist". Always an action plus a destination, never "click here".
- **Reserved-results caption:** [ awaiting validated artifact ]
- **404 page (recommended):** Head "Off the map." Sub "That page is not part of
  the meridian. Back to the start." Link to `/`.

---

# 7. Implementation notes for downstream builders

- The three sub-pages are separate HTML entries. Add each to `vite.config.js`
  `rollupOptions.input` so Vite bundles `/systems`, `/performance`, `/progress`
  alongside `index.html`. Clean URLs are already handled by `vercel.json`.
- Lift the top nav and the footer into shared partials (or duplicate them exactly)
  so they are byte-identical across pages. Update both for the new clean-URL links
  per section 2 and the landing footer block.
- Each sub-page imports the same `css/*.css`, the same `js/main.js` boot path, and
  lazy-inits its own Manifold tuning. Reuse `data-section`, `data-chars`,
  `type-mono`, `reveal-fade`, `section__rule`, `signal-word`, `[data-parallax]`,
  `[data-magnetic]`, `[data-cursor-pinned]` exactly as the landing does.
- Feed each sub-page its own `CHAPTER_NAMES` array to `scroll.js` (the array is
  currently a const; parameterize or branch per page).
- Keep all numeric claims sourced from `config/brand.js`. If a sub-page needs a
  new verified fact, add it to `FACTS`/`STATS` first, then bind via `data-fact`.
- Run the em-dash audit before every commit: grep for the U+2014 character
  across `index.html`, `systems.html`, `performance.html`, `progress.html`,
  `css/`, `js/`, `config/`, and this doc. Any hit is a hard build failure.
- Keep the build green: `cd /Users/arhancanli/meridian && npm run build`.
