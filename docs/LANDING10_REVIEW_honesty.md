# LANDING10 Honesty Review

Role: Honesty Reviewer. Scope: the LANDING10 work (new V2 sections + the new
js/charts.js / css/charts.css data-viz module + the equity-slot mount), audited
against the hard honesty guardrails. Build verified green before review.

Verdict: PASS. No fabricated curve, Sharpe, PBO, tick, or result anywhere. The
offer is forthcoming-framed, the founder is grounded, paper-only and
not-advice disclosures are intact, and every brand/flagship/fact value is bound
from the single source of truth (config/brand.js), never hardcoded into the new
sections.

## What was checked

1. Build is green (`npm run build`): dist/index.html 47.83 kB, all four pages
   build, no errors.
2. Em-dash audit (U+2014): clean in BOTH owned source (index.html, js/landing.js,
   css/landing.css, js/charts.js, css/charts.css, js/performance_data.js,
   config/brand.js) AND in dist/. Zero occurrences.
3. The charts module honesty gate.
4. The data contract (js/performance_data.js).
5. The equity-slot mount in js/landing.js + index.html copy.
6. The offer block framing (#what-it-is).
7. The founder section grounding (#founder).
8. Brand / flagship / fact binding.

## Charts module: HONEST-empty until real data (js/charts.js)

- `STATUS = "reserved"` in performance_data.js, so `fromPerformanceData()` returns
  empty `points: []` for equity and capacity, and null measure values for the
  gauntlet. The live arrays (EQUITY_CURVE, CAPACITY_CURVE, GAUNTLET values) are
  ONLY sliced/read when `STATUS === "live"`. Confirmed in dist:
  `points: t && Array.isArray(i) ? i.slice() : []`.
- `isChartLive(data)` is a real double gate: it requires `data.status === "live"`
  AND a non-trivial payload (>= 2 points for curves, or at least one measure with
  both `value != null` and `passed != null` for the gauntlet). A half-filled
  artifact therefore can NEVER render a fabricated-looking line. Confirmed in dist.
- Pending equity render: a faint axis frame + ONE soft signal node centered on a
  FLAT baseline. No line, no rise, no ticks, no numbers. A flat baseline plus a
  single node cannot be misread as a rising equity curve.
- Pending capacity render: UNLABELED log-decade gridlines + one node. The generic
  1e4..1e9 decade span is used only to shape the empty frame and NO label and NO
  knee is drawn, so it cannot read as a fabricated result. The knee marker renders
  ONLY if an explicit artifact knee is supplied (`d.knee`), never computed.
- Pending gauntlet render: six faint rails with HOLLOW gate markers at a fixed
  reference position. The gate marker comment explicitly states it represents "the
  bar", not a value, and no number is implied. Verdict chips read "Reserved" while
  pending.
- A11y strings are honest: the pending title/desc say "Backtest in progress. No
  result is shown until it clears the validation gauntlet." and the table fallback
  says "Backtest in progress, no data yet." No invented data in the SR path.
- No fabricated-number pattern (Sharpe value, percentage, return figure) exists
  anywhere in the built index JS. Grep for `Sharpe N.N`, `N.N%`, `N.N Sharpe`
  returned nothing.

## Data contract: clearly-labeled placeholder shell (js/performance_data.js)

- `STATUS = "reserved"`. PROVENANCE all null. EQUITY_CURVE and CAPACITY_CURVE are
  empty arrays. Every GAUNTLET row has `value: null, passed: null`. Every
  RESULTS_FIELDS value is null.
- GAUNTLET_PARAMS holds only design facts (rebalance cadence, purge, embargo,
  trials count, baseline definition), explicitly NOT results. The trials figure
  ("2,500+") matches the reconciled FACTS.tests ("2,500+"), so the test count is
  one number across the property.

## Equity slot mount (js/landing.js initEquitySlot + index.html)

- Mounts `mountEquityCurve(slot, fromPerformanceData("equity"), ...)` in the
  reserved state. Same contract /performance will read, so the landing and the
  methodology page can never disagree about whether a result exists.
- The HTML slot copy is honest-pending: status pill reads
  "[ live research, backtest in progress ]"; caption reads "The real out-of-sample
  equity curve appears here only after it clears the validation gauntlet. Not a day
  sooner." Confirmed present in dist/index.html.
- On chart failure the static honest frame (grid + label + caption + link) is left
  standing. No path renders a fabricated curve.

## Offer block: forthcoming-framed (#what-it-is)

- Heading "What this is" plus an explicit denials ledger: "Not a fund. We manage no
  money for you." / "Not copy-trading. No real capital is at risk." / "Not advice.
  Nothing here is an offer or a recommendation."
- Early-access capabilities are framed as forthcoming, not delivered: the note
  "Opens in order, as each capability comes online." and the aside "Each capability
  opens as it is validated, not before." The lead frames it as a seat to watch a
  system be tested, not a signal being sold.
- Paper-only is repeated in-context ("No real money in play.").

## Founder: grounded (#founder)

- "Arhan Canli grew up in Dubai..." Claims are grounded and verifiable in spirit:
  builder/trader, shipped products including Studara (an AI education platform),
  trades actively, writes theses before outcomes. No fabricated track record, no
  AUM, no returns, no credentials invented. The pull-quote ("A claim is worth
  nothing until the evidence is on the record.") is a principle, not a performance
  claim. Consistent with the user profile (Dubai entrepreneur, Studara).

## Paper-only / not-advice intact

- Hero status pill: "Pre-launch" + "AlphaForge in simulation and live paper
  trading". Hero sub and bullets repeat "No real capital is at risk" and "before a
  dollar is deployed".
- Proof lead: "AlphaForge has not traded real capital, and we will not publish a
  return until one has been earned in the open."
- Footer disclosure: "Nothing on this page is investment advice, an offer, or a
  solicitation." intact.
- Progress section admits the honest negative: "The crypto-only edge has not yet
  cleared our own bar, and we say so plainly."

## Names bound via data-brand / data-flagship

- BRAND = "Meridian", FLAGSHIP = "AlphaForge" in config/brand.js. main.js binds
  every `[data-brand]` and `[data-flagship]` from these. The new sections (offer,
  equity slot, founder, hero points/proof) all use the data attributes; no hardcoded
  brand or flagship literal was introduced that bypasses the single source.

## Facts: bound, not fabricated

- hero__proof and statband numerals (3.5M+ bars, 94 instruments, 24 factors,
  2,500+ tests, since 2020, 12 phases) all originate in config/brand.js
  (STATS/FACTS) and are written by main.js into the `data-fact` spans. The landing
  count-up reads the already-bound text and animates 0 -> that real value, so it
  cannot invent a quantity not in config. `data-fact="since"` (the year 2020) is
  explicitly excluded from count-up. The statband secondary footnotes (0
  look-ahead, 1 cost authority, 2020 history start) are construction/architecture
  facts, not performance results.

## Notes / non-blocking observations

- The new motion enriches honest content only (reveals, staggers, count-ups of real
  facts, the powered-on pending instrument). No animation manufactures or implies a
  result. The "powered on, waiting" equity node is a status tell, not a data point.
- When the grand backtest lands, honesty depends on the operator setting
  `STATUS = "live"` AND filling EQUITY_CURVE / GAUNTLET values from the real
  artifact in performance_data.js. The code path is correct; the future risk is
  purely operational (do not flip STATUS before the artifact is real). The double
  gate (status + non-trivial payload) is the safeguard and is sound.
