# Meridian / Honesty and Em-Dash Review

Role: honesty plus em-dash critic. Scope of this review: the two direction docs
(`docs/DESIGN_SYSTEM.md`, `docs/SITEMAP_COPY.md`), cross-checked against
`config/brand.js`, the shipped `index.html`, and the real-system facts in the
team brief. Audited 2026-06-16.

Verdict: PASS WITH NOTES. One real, fixable factual inconsistency (a test-count
that disagrees with the documented single source of truth). No em dashes, no
forbidden hype, and the transparency is accurate to the real system.

---

## 1. Em dash (U+2014) audit: PASS

- `grep -rcP "\x{2014}"` over `docs/` returns 0 for both files.
- Repo-wide scan over `*.html *.css *.js *.json *.md` (excluding
  `node_modules`, `dist`, `.vercel`) returns no files containing U+2014.
- Other dash-like Unicode that often sneaks in (en dash U+2013, horizontal bar
  U+2015, minus U+2212, figure dash U+2012) is also absent from source files.
- Ranges in the copy are written correctly with "to" (for example "2020 to 2026",
  "280 to 400", "0.3 to 0.6", "0.8 to 1.0"), and the prose uses periods, commas,
  and colons in place of em dashes throughout.

Result: zero violations. The hard rule holds.

Reproduce:
```
grep -rnP "\x{2014}" /Users/arhancanli/meridian/docs/
grep -rlP "\x{2014}" /Users/arhancanli/meridian --include="*.html" \
  --include="*.css" --include="*.js" --include="*.json" --include="*.md" \
  | grep -vE "node_modules|/dist/|\.vercel"
```

---

## 2. Forbidden hype words: PASS

`grep -niE` for moon, guaranteed, guarantee, 10x, 100x, moonshot, lambo, "to the
moon", get rich, easy money, risk-free, riskless, sure thing, "can't lose",
passive income, financial freedom returns only the docs' own self-imposed
prohibition lists (`DESIGN_SYSTEM.md` lines 37 to 38, 451; `SITEMAP_COPY.md`
line 28). No hype word is used as actual marketing copy anywhere.

No exclamation marks in the copy. No second-person hard sell. The two phrases
that pattern-matched "winning / promise" language are both used correctly in the
honest direction, not as claims:
- "Honesty is a process, not a promise." (`/performance`, line 476)
- "The differentiator of Meridian is not that we always win. It is that we run
  the test in the open and report what passes and what does not." (line 579)
- "Discipline first, profit second." (line 618) frames profit as subordinate to
  discipline, not as a guarantee.

---

## 3. Transparency accuracy vs the real system: PASS

Checked every technical claim against the real-component list in the brief. The
copy describes only real components and does not invent any:

- Data lake: point-in-time, leak-proof, survivorship-bias-free, includes delisted
  instruments, research/live parity. Stated accurately (`/systems` chapter 01).
- Factor library: cross-sectional and time-series momentum, residual reversal,
  funding carry, low-vol and low-beta anomalies, Yang-Zhang/Parkinson volatility,
  Amihud/Corwin-Schultz liquidity, IC-weighted blend. All present, none invented
  (chapter 02).
- Portfolio: EWMA plus Ledoit-Wolf shrinkage covariance, Clarabel mean-variance
  with a rank/inverse-vol fallback, vol-target overlay, drawdown ladder plus kill
  switch. Accurate (chapter 03).
- Backtester: event-driven, signal-at-close to fill-at-next-open, event-driven
  funding, one transaction-cost authority. Accurate (chapter 04).
- ML meta-labeling: cost-honest triple-barrier labels, gradient-boosted
  classifier, isotonic calibration, used only to SCALE conviction, never to flip
  a signal. Stated correctly and the "never flips" constraint is explicit
  (chapter 05).
- HMM regime gate: hand-rolled Gaussian HMM, throttles gross exposure, run
  filtered with no lookahead. Accurate (chapter 05).
- Validation gauntlet: purged walk-forward, Deflated Sharpe, Probabilistic
  Sharpe, PBO via CSCV, combinatorially-purged cross-validation, honest trial
  counts, must-beat-baseline gate. All seven present and described correctly
  (chapter 04 and `/performance` chapter 02).
- Paper-trading loop: 24/7, order-book-walking fills, idempotent orders,
  reconciliation, single authoritative clock, crash-safe/resumable. Accurate
  (chapter 06).

Paper / simulation only is stated everywhere it matters: hero, thesis,
performance lead, performance standfirst banner, both asides, the footer legal
block, the microcopy, and the shipped `index.html`. No real-money auto-trading is
claimed anywhere.

No invented performance numbers. The only numerics are the approved `STATS` and
`FACTS` from `config/brand.js`, and the `/performance` Results chapter is an
explicitly empty, labeled reserved slot ("[ awaiting validated artifact ]", no
fabricated curve, no placeholder Sharpe). This is exactly right.

The honest edge status is framed as rigor, not failure or hype, and is internally
consistent across pages:
- `/performance` standing (line 571): "The crypto-only edge has not cleared the
  bar. We are telling you that on purpose." plus "not yet strong enough, after
  honest deflation and cost, to stake capital on."
- `/progress` edge-status (line 672): "We hold the engineering and the integrity
  as proven; we hold the standalone crypto edge as not yet proven... This is the
  expected outcome of an honest test, not a failure of one."
- The forward path is breadth (an equities sleeve), framed as the disciplined
  answer, not as a rescue. Matches the brief exactly.

---

## 4. Findings to fix

### 4.1 (Blocking-for-accuracy) Test count contradicts the documented source of truth

Two different test counts are presented as fact on two different pages:
- `config/brand.js` `STATS` and `FACTS` (the doc's declared single source of
  truth for all numbers) say "1,400+" automated tests. This is used on the
  landing Performance teaser (line 184) and the `/performance` facts band
  (line 531).
- `/progress` says "around 2,500 tests" / "~2,500 automated tests" in three
  places: the `<meta description>` (line 595), the hero mono stat strip
  (line 612), and the build data line (line 627). This matches the team brief's
  "~2,500 tests" figure for AlphaForge.

Both numbers trace to a real source, but a visitor moving from `/performance`
("1,400+") to `/progress` ("~2,500") sees the same property report two different
test totals with no explanation, which undercuts the transparency thesis. Two
"facts" that disagree is precisely the kind of thing this brand says it does not
do.

Where: `SITEMAP_COPY.md` lines 184, 531 (1,400+) vs lines 595, 612, 627
(~2,500); root cause is `config/brand.js` STATS = 1,400+ while the brief and
`/progress` use ~2,500.

Fix: reconcile to one number across the whole property. Recommended: update
`config/brand.js` `STATS`/`FACTS` to the current real figure (the brief's
~2,500), and have every page bind the test count from `brand.js` via `data-fact`
rather than hardcoding "1,400+" or "~2,500" in markup. The authoring rules
already mandate "verified numbers only" sourced from `brand.js`; this finding is
a violation of that rule, not a copy-tone issue. If the two numbers genuinely
measure different things (for example, a strict subset vs the full suite), label
them so the difference is legible; do not present both unlabeled as "automated
tests, green."

### 4.2 (Note, non-blocking) Hero "earns a positive edge" reads slightly present-tense-optimistic

The hero sub (line 122, and shipped `index.html` line 174) says AlphaForge "runs
in simulation and live paper trading while it earns a positive edge," and the
thesis implies the engine will eventually earn the right to capital. Read in
isolation, "earns a positive edge" can sound like the edge is currently being
achieved, which is in slight tension with the load-bearing `/performance` and
`/progress` statements that the crypto-only edge "has not cleared the bar."

This is not overclaiming: the explicit, repeated "has not cleared / not yet
proven / not yet strong enough" statements on the deep pages are unambiguous, and
"earns" is naturally read as "works toward." But for an honesty brand the hero is
the highest-traffic surface, and the strongest version would make the hero match
the deep pages' candor. Optional tightening, for example: "while it works to earn
a positive edge" or "while it is tested for a positive edge." Flagging as a note,
not a block, because nothing here is false and the full transparency is present
one scroll down and on the linked pages.

---

## 5. Summary

| Check | Result |
|---|---|
| Zero em dashes (U+2014) in docs and repo source | PASS |
| Other dash-like Unicode absent | PASS |
| No forbidden hype words | PASS |
| Paper / simulation only stated everywhere | PASS |
| No invented performance numbers; reserved slot honest | PASS |
| Only real system components described | PASS |
| Edge status framed as rigor, consistent across pages | PASS |
| Numeric claims internally consistent | FAIL: 1,400+ vs ~2,500 test count |

One factual inconsistency to reconcile (4.1) and one optional hero-tone tighten
(4.2). Everything else clears the honesty and em-dash bar.
