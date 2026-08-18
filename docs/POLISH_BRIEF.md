# Meridian / Polish Brief: the road from 9 to 10

Synthesized from five customer test reports (Institutional Allocator, Sophisticated
Quant Trader, Design Director, Skeptical Journalist, Target Waitlist Signer).
Audited against the live source on 2026-06-16. The build is green and the U+2014
audit is clean as of this writing; both must stay that way after every change here.

## The verdict, in one line

All five testers would join the waitlist. Scores cluster at 9/9/9/9/8 (immersion,
prestige, clarity, trust, conversion), with the Waitlist Signer giving trust a 10.
Nobody questions the craft, the honesty, or the cross-page coherence. The gap to a
true 10 is narrow and specific: a handful of consistency seams (the same brand the
site says it exists to avoid), one conversion leak, two pages that are denied the
hero treatment the other two get, and a small set of trust nicks that a hostile
reader can quote out of context. None of this is a rebuild. It is precision.

The single most-cited fix, named by ALL FIVE testers and ranked high by four, is the
hero line "earns a positive edge." Fix that first.

---

## How this is prioritized

Three buckets, ranked within each by how many testers raised it and how load-bearing
it is to the 10/10 thesis (honesty + one-hand coherence + jaw-drop):

1. JAW-DROP / IMMERSION upgrades (the experience ceiling: hero + signature scroll).
2. CROSS-PAGE CONSISTENCY fixes (the "one hand, one document" promise).
3. TRUST / CLARITY / COPY fixes (the honesty brand's credibility surface).

Each item lists the consensus behind it, the exact file and change, and the impact.
A "DO NOT BREAK" list closes the brief: the things every tester praised that a
polish pass must not regress.

---

# BUCKET 1: JAW-DROP / IMMERSION (the experience ceiling)

## J1. Give /progress its own pinned tentpole beat. [HIGH]
**Consensus:** Design Director (high). Corroborated by every tester's "one hand"
praise, which this directly threatens: three pages have a pinned, scene-choreographed
climax and one does not.

**Finding (verified):** `js/progress.js` ships ONLY the phase accordion
(`initPhaseExplorer`). There is no ScrollTrigger pin, no `setConverge` drive, no
`flareBloom`. Landing has "The System" pin, /systems has the gauntlet seam + bloom,
/performance has the full gauntlet pin (`initGauntletPin`, performance.js:235-297).
/progress is the quiet, lesser sibling, and you feel it on entry from any other page.

**Change:** Add a pinned roadmap tentpole to `progress.html` `#roadmap` (currently a
static `.roadmap__row` table starting ~line 573) plus a new `initRoadmapPin()` in
`js/progress.js`. Reuse the EXACT pin grammar from `js/performance.js:235-297`
(`ScrollTrigger.create` with `pin`, `pinSpacing`, the `onUpdate` step/converge drive,
the `is-resolved` + single `sceneFlare()` on lock, `onLeaveBack` reset). Drive
`scene.setConverge(null)` / the plurality fan-out so the manifold visibly splits into
a fleet of receding future sleeves as the four algorithm rows reveal one at a time
(AlphaForge lit, the three reserved rows receding into depth), then fire exactly ONE
restrained `scene.flareBloom()` as AlphaForge locks. The scene already lives in
`window.__meridianScene`; guard every call exactly as performance.js does. /progress
already sits in the plurality band per `page-config.js`, so this is the on-thesis beat.
Reduced-motion / mobile: rows stack as today (mirror the `prefersReduced || isMobile`
early-return in initGauntletPin that adds `is-active` to all steps).

**Why high:** This is the one structural gap in the "four pages, one hand" promise,
and it is the page about breadth that should literally fan the manifold out. Closing
it is the largest single lift to overall immersion consistency.

## J2. Renew the wow on entry to each sub-page (hero scale). [HIGH]
**Consensus:** Design Director (high). Reinforced by the shared observation that the
wow is front-loaded onto the landing.

**Finding (verified):** The landing hero is `display-xl` (the giant "Meridian"
wordmark, the single most arresting thing on the property). All three sub-page heroes
are `display-l`: `performance.html:139` `.hero__word display-l`, `progress.html:140`
`.hero__word display-l`, `systems.html:149` `.sys-hero__head display-l`. The sub-pages
open competent and elegant, a full tier quieter than the landing.

**Change:** Promote ONE line of each sub-page hero to a true display moment, keeping
exactly one hero moment per page (design system section 9). Two viable routes, pick
one and apply it identically across all three for coherence:
- (a) Pair each sub-page hero sentence with the giant `--grey-900` ghost wordmark
  treatment already used in the footer (`.footer__wordmark display-xl`, shell.js:162):
  an oversized word bleeding behind the headline. This reuses an existing, on-system
  device, so it adds nothing new.
- (b) Bump the lead clause of each hero to `display-xl` scale while the supporting
  clauses stay `display-l`.
Edit the sub-page hero blocks in `css/performance.css` (`.perf-hero .hero__word`),
`css/systems.css` (`.sys-hero__head`), `css/progress.css` (progress `.hero__word`).
Keep the per-character clip-rise reveal intact.

**Why high:** Two testers' core "not yet a 10" reason is that entering a sub-page
does not renew the breathtaking-ness. Route (a) is preferred: it reuses the ghost
wordmark already in the system, so it cannot fork a second device.

## J3. Make the reserved /performance frames feel powered-on, not empty. [MEDIUM]
**Consensus:** Design Director (medium), Waitlist Signer (low, "reads-as-broken"
risk), Allocator + Quant (the "two empty panels in a row" momentum leak). Four of five
touched this region.

**Finding (verified):** `#results` (performance.html:394, section 04) and `#capacity`
(performance.html:449, section 05) are two deliberately-empty bordered frames stacked
back to back, immediately before the emotional payoff in `#standing` (section 06).
The reserved state is honest but visually inert; it leans entirely on copy to read as
intentional rather than as a failed data load.

**Change (no fabricated values, ever):** In `js/performance.js` `renderCurvesIfLive`
path / the pending state, and `css/performance.css` `.results__pending` /
`.capacity__pending`, draw a slow, faint, single-hue procedural "breathing" baseline
on the results canvas: a flat-ish line with a soft `--signal` pulse traveling along
it, NO numbers, NO tick values, clearly a placeholder waveform in the manifold's
visual language. The frame then reads as an instrument that is powered on and waiting.
The `drawCurve` path already strokes `#C8553D` at 1.5px; reuse that exact aesthetic
for a non-data idle waveform that is unmistakably not a result. Keep it gated so the
moment STATUS flips to "live" the real curve replaces it.

**Why medium not high:** It strengthens the load-bearing transparency moment, but the
empty frame is correct as-is. This makes it beautiful rather than merely correct. See
also C3 (combine the two panels), which should land WITH this so the page does not
have idle dead air twice in a row.

## J4. Compose the reduced-motion / static state as deliberately as the moving one. [MEDIUM]
**Consensus:** Design Director (medium). The design system itself (section 9) demands
"a beautiful static state."

**Finding:** The reduced-motion fallbacks are functional, not composed. `scene.js`
`renderOnce` freezes on a neutral frame; the static panels read "unfinished" rather
than "reserved with intent" when nothing moves.

**Change:** In the reduced-motion paths in `css/motion.css` and `scene.js`
`renderOnce` + the `.scene-fallback` gradient, freeze the scene on a more cinematic
mid-convergence camera (slight off-axis, the signal ridge clearly the subject) rather
than a neutral frame. `page-config.js` already exposes `sceneStill` per page for
exactly this; tune each page's `sceneStill` so a screenshot with motion off still
reads as a finished poster. Give the static section rules and reserved panels a
settled, intentional finished look.

**Why medium:** It lifts the accessibility floor to the prestige bar, but affects only
the reduced-motion experience, so fewer visitors see it than J1 or J2.

---

# BUCKET 2: CROSS-PAGE CONSISTENCY (the "one hand" promise)

These are the seams the honesty brand says it exists not to have. Each is small;
together they are the difference between "one document by one hand" and "almost."

## C1. Reconcile the Algorithm 02 roadmap status across the two pages. [HIGH]
**Consensus:** Quant Trader (high), flagged explicitly as a crack in the radical-
transparency story.

**Finding (verified):** The same four-row roadmap renders twice with one row in two
states. `index.html:577` marks Algorithm 02 Equities `Planned` (plain
`.roadmap__status mono-label`). `progress.html:584` marks the same row `Planned, next`
with the extra `roadmap__status--next` class. Same table, two different states for one
row.

**Change:** Reconcile to one. Recommended: render the roadmap from a single shared data
model the way nav and footer already are (`config/brand.js` + `js/shell.js`), so the
table can never drift again. Minimum: change `index.html:577` to `Planned, next` and
add the `roadmap__status--next` class so it is byte-identical to progress.html:584.
Prefer the shared-model route; it is the structural fix that matches how the rest of
the chrome is built.

**Why high:** On a site whose entire pitch is "two facts that disagree is the thing we
exist not to be," a discerning reader who catches this (the Quant did) gets a real
crack in the thesis. Cheap to fix, disproportionate trust cost if left.

## C2. Vary the gauntlet's weight across pages so it reads as motif, not slogan. [LOW]
**Consensus:** Quant Trader (low), Design Director (low). Two testers, same root.

**Finding (verified):** "Most strategies never survive a gauntlet this severe" / "a
real gauntlet" appears near-verbatim on `systems.html:538` and `progress.html:408`.
"refuse a lie" recurs (`systems.html:156`, `systems.html:696`). The full six-test
exposition appears as a pinned sequence on /performance, a six-row block on /systems,
and an accordion line on /progress. The repetition reads as a recurring slogan, which
is exactly what the restraint brand is positioned against.

**Change:** Let each page own the gauntlet at a different intensity. /systems owns the
full six-row exposition (`#backtester`). /performance owns the pinned cinematic walk.
On /progress, reduce the gauntlet to a single evocative line plus a link rather than
restating the tests in the phase-09 accordion (`progress.html:408`). Keep the strongest
line ("Most strategies never survive...") in exactly ONE tentpole location and vary or
drop it on the others. Same idea, three intensities: motif, not redundancy.

**Why low:** It is a refinement of an already-strong asset, not a defect. But it is
pure brand discipline (restraint = the luxury), so it belongs in a 10/10 pass.

## C3. Resolve the two back-to-back reserved panels on /performance. [MEDIUM]
**Consensus:** Allocator (medium), Design Director (medium, "dead air twice"),
Waitlist Signer (low). Three testers.

**Finding (verified):** `#results` (section 04) and `#capacity` (section 05) are two
empty-by-design frames stacked adjacently before `#standing`. The Allocator notes
Capacity is not even in the sitemap spec (`SITEMAP_COPY.md` section 4 ends at Results
+ Standing); having two principled empty frames dilutes the one load-bearing
transparency moment.

**Change:** Either (a) fold Capacity into the Results panel as a labeled secondary
tab/row of the same reserved frame, or (b) move `#capacity` behind `#standing` so the
two empty panels are not adjacent. One principled empty frame should be the page's
transparency moment. Update `performance.html` section order and the rail items
(`performance.html:116-118` `data-rail` indices) and `css/performance.css` accordingly.
Land this together with J3 so the surviving reserved frame is also powered-on.

**Why medium:** It protects the single most-praised element on the whole property (the
honest empty Results slot) from being diluted by a second, weaker empty frame.

---

# BUCKET 3: TRUST / CLARITY / COPY (the honesty brand's credibility surface)

## T1. Fix the hero "earns a positive edge" overclaim. [HIGH, #1 PRIORITY]
**Consensus:** ALL FIVE testers. Ranked high by four (Allocator, Quant, Journalist),
medium by one (Waitlist Signer). It is the single most-cited finding in the entire
test. The prior honesty review (REVIEW_honesty.md 4.2) flagged it and it was not fixed.

**Finding (verified):** `index.html:197-198` hero sub reads: "It runs in simulation and
live paper trading / while it earns a positive edge on honest, leak-proof data."
Present-tense "earns a positive edge" reads as: the edge is being achieved now. This
directly contradicts the load-bearing candor one scroll down and on the deep pages
(/performance #standing: "The crypto-only edge has not cleared the bar"; /progress
#edge-status: "not yet proven"). On an honesty brand, the highest-traffic surface is
the one place the candor loosens, and it is the seam every skeptic pulls on.

**Change:** Edit `index.html:198` AND the canonical copy in `docs/SITEMAP_COPY.md:122`
(keep them in sync). Change "while it earns a positive edge on honest, leak-proof data"
to "while it is tested for a positive edge on honest, leak-proof data" (or "while it
works to earn a positive edge"). No loss of meaning; the hero now matches the deep
pages exactly.

**Why #1:** Unanimous, on the highest-traffic surface, on the single axis (honesty)
that is the brand's entire differentiator. This is the one fix that, alone, is worth a
point of trust across every persona. Do it first.

## T2. Ship a static no-JS nav + footer legal block on every sub-page. [HIGH]
**Consensus:** Skeptical Journalist (high), explicitly a "trust and arguably compliance
nick."

**Finding (verified):** Sub-page nav is 100% JS-dependent. `systems.html:137`,
`performance.html:127`, `progress.html:121` ship `<nav class="nav__links"
aria-label="Primary"></nav>` empty; `js/shell.js` injects the links AND the entire
footer (including the legal/risk disclaimer) at runtime. The sub-page `<footer>` is a
bare `<footer class="footer" id="footer">...</footer>` shell (systems.html:709,
progress.html:628, performance.html:532). With JS disabled or failed, a visitor on
/performance has no nav and NO footer legal/risk disclaimer at all. The landing has a
static fallback; the sub-pages do not.

**Change:** Hardcode the three clean-URL nav links plus the Join CTA inside each
sub-page's `.nav__links`, and inline the footer status line + legal/disclaimer block
as static markup. Then have `shell.js` re-point/re-mark the existing nodes (it already
does exactly this for the landing: `buildNav` re-points authored links,
`buildFooter` has a `hasGrid` branch that only rebuilds columns when markup exists at
shell.js:125-141) rather than building from empty. The legal/risk disclaimer must be
present with JS disabled on every page.

**Why high:** For a "company you can audit" brand, the risk language vanishing without
JS is a real compliance and trust exposure, and the fix reuses the exact re-point
pattern shell.js already runs on the landing.

## T3. Wire the ONE true number: the honest trial count + the baseline definition. [HIGH]
**Consensus:** Allocator (high), Quant Trader (medium, "name the gauntlet's design
parameters"). The most-differentiating number on the property is itself a placeholder.

**Finding (verified):** Every gauntlet value in `js/performance_data.js` is null
(correct). But the honest trial count fed into the deflation, and the literal baseline
definition, are TRUE today and require no result to disclose. The gauntlet is described
beautifully on /systems (`#backtester`) but names zero design parameters: no train/test
window, no purge/embargo size, no rebalance cadence (hourly is implied by 3.5M+ hourly
bars but never stated), no trial count, no baseline definition. A quant evaluating
rigor wants these named; naming them needs no result.

**Change:** Add a `TRIALS` field and a baseline-definition string to
`performance_data.js` (these are facts, not results), surface the trial count in the
reserved Results panel's "Trials tested" field (RESULTS_FIELDS already has key
`trials`, performance_data.js:133) and in `renderGauntlet` for the baseline row. Keep
EVERY Sharpe / PBO / equity value reserved. On /systems `#backtester`, add one mono
dataline naming the parameters that need no result: e.g. "purge N bars / embargo M bars
/ rebalance: hourly / trials: <count> / baseline: vol-targeted long-only". Source any
number from `config/brand.js` per the verified-numbers rule; add to FACTS first if new.

**Why high:** This converts the deflation story from CLAIMED to DEMONSTRATED without
fabricating a single result. The Allocator's words: it is the one number that is true
today and costs nothing to admit.

## T4. Embed the waitlist form (or one dominant CTA) on each sub-page closing. [HIGH]
**Consensus:** Waitlist Signer (high, "the biggest conversion leak"). Quant Trader and
Allocator both noted the conversion ask is thin. Conversion intent is the lowest score
(8) across all five testers; this is the lever.

**Finding (verified):** No sub-page ships an inline waitlist form. Every sub-page CTA
routes to `/#waitlist` (shell.js sets `ctaHref = "/#waitlist"` for sub-pages,
shell.js:102), bouncing the user back to the landing at the exact moment a page has
earned the signup (e.g. /performance #standing closes on "Intellectual honesty is the
only edge that compounds", then sends them away to find the field).

**Change:** Embed the real waitlist form inline at each sub-page's closing chapter.
`js/waitlist.js` `initWaitlist` already scans the whole document and self-inits any
form on any page, and the markup/CSS contract (`#waitlist-form`, `.waitlist__row`,
the honeypot, `#waitlist-status`) is shared, so duplicate that block into each sub-page
closing. If a second full form is undesired, at minimum make the primary CTA a single
DOMINANT access control and keep the lateral nav link clearly secondary (see T6).

**Why high:** It is the single biggest conversion leak and the cheapest to close,
because the form already self-inits anywhere.

## T5. Resolve the og:image / favicon comment contradiction. [MEDIUM]
**Consensus:** Skeptical Journalist (medium), Brand review (non-blocking). "A comment
asserting an asset that does not exist, on a site whose thesis is nothing fabricated."

**Finding (verified):** `index.html:13` head comment says "image is the same inline
mark used for the favicon," but there is no `og:image` on any page and `twitter:card`
is `summary` with no image on all four (index/systems/performance/progress line 17/20).
A false comment plus a bare image-less link preview.

**Change:** Either add a real `og:image` (a void card with the signal dot, matching the
favicon, served from `dist`) and switch `twitter:card` to `summary_large_image` on all
four heads, or delete the false comment at index.html:13. Do not leave source asserting
an asset that does not exist. Preferred: add the real card (raises the share surface to
the page's own restraint).

**Why medium:** Small, but it is the brand's own thesis (nothing fabricated) violated
in its own source comment, exactly the kind of thing this audience hunts.

## T6. Make the sub-page closing CTA hierarchy unambiguous. [MEDIUM]
**Consensus:** Waitlist Signer (in the same fix as T4). Reinforces the conversion lever.

**Finding (verified):** Sub-page closings place two CTAs side by side at equal visual
weight (e.g. /performance: "See the roadmap" + "Join the waitlist"; /systems: "See the
performance methodology" + "Join the waitlist"). The primary access action and a lateral
nav link share weight, so the eye is not always pulled to the one act.

**Change:** Make "Join the waitlist" the single dominant control (the CTA treatment,
magnetic, signal accent) and demote the lateral link to a clearly secondary text link
in `css/systems.css`, `css/performance.css`, `css/progress.css` closing blocks. Pairs
naturally with T4.

**Why medium:** Sharpens the story->proof->act hierarchy the testers already praise; it
is dilution, not a defect.

## T7. Build the recommended on-brand 404 page. [MEDIUM]
**Consensus:** Waitlist Signer (medium). The sitemap explicitly recommended it
(`SITEMAP_COPY.md:728`).

**Finding (verified):** No `404.html` in source or `dist`. With clean URLs in play, a
mistyped/stale link drops a discerning visitor onto a bare host 404, off-brand.

**Change:** Add `404.html` using the shared shell (void background, single signal
accent, the cursor, the grain): head "Off the map.", sub "That page is not part of the
meridian. Back to the start.", link to `/`. Add it to `vite.config.js`
`rollupOptions.input` (currently keyed inputs at vite.config.js:53) and wire
`vercel.json` so the host serves it.

**Why medium:** A property this composed should not have an unstyled escape hatch, but
it is an edge surface fewer visitors hit.

## T8. Raise reserved placeholder values from --grey-600 to --grey-700. [LOW]
**Consensus:** Institutional Allocator (low). The design system declares its own floor.

**Finding (verified):** `css/performance.css:146` `.gauntlet__value[data-empty="1"]`
and `css/performance.css:288` `.results__field-value[data-empty="1"]` use `--grey-600`,
which DESIGN_SYSTEM section 1 declares "DECORATIVE ONLY ... Never body text" and section
7 sets `--grey-700` as the readable floor. These em-dash placeholder values FUNCTION as
content. Keep `--grey-600` only for the truly decorative separators
(`.standfirst__sep` :56, `.chip--reserved::before` :172, `.gpin__counter-sep` :419).

**Change:** Raise the two `[data-empty="1"]` rules to at least `--grey-700`. Leave the
decorative separators at `--grey-600`. Aligns the page with its own contrast law.

**Why low:** Real but small accessibility/consistency nick; only the reserved-state
"--" glyphs are affected.

## T9. Surface a cadence / "last gauntlet run" timestamp in the reserved state. [MEDIUM]
**Consensus:** Quant Trader (medium). Turns "indefinitely blank" into "actively pending."

**Finding (verified):** `performance_data.js` `PROVENANCE.asOf` exists but is null and
unshown while reserved; there is no as-of date, no re-run cadence note. For a build-in-
the-open claim, the date of the most recent failed run is more convincing than a static
empty frame.

**Change:** Bind an "as of" / "last gauntlet run" date and a re-run cadence note in the
reserved state (extend `PROVENANCE` and `bindReservedCopy` in performance.js:139, which
already reads PROVENANCE but only when live). Source the date from `config/brand.js`.
The empty frame then reads "actively pending," not "waiting on itself."

**Why medium:** Strengthens the most-praised element (the honest reserved slot) with a
concrete signal of liveness, but is additive rather than fixing a defect.

## T10. Add one concrete forward milestone / early-access grant. [MEDIUM]
**Consensus:** Allocator (medium, "turns watch-it into be-there"), Quant Trader (low,
"what does early access grant a practitioner"). Both want the offer concretized.

**Finding (verified):** /performance #standing and /progress #edge-status state the
honesty strongly but offer no concrete next milestone, and the waitlist sells "a seat
to watch it happen" with no signal of what early access grants.

**Change:** Add one milestone-gated line on /performance #standing or /progress
#edge-status, e.g. "Access opens to the first cohort when the equities sleeve clears
purged walk-forward." And one sentence at the waitlist intro on what early access grants
a practitioner (e.g. read-only view of the live paper ledger and the gauntlet artifacts
as each stage validates). Do not invent a date; gate it on a milestone, which stays
honest. Keep it in `config`/copy, sync `SITEMAP_COPY.md`.

**Why medium:** Lifts conversion intent (the lowest score) without any honesty cost,
because a milestone gate is a commitment to a test, not a promise of a result.

## T11. Tighten "live paper trading" to "live, on paper" where it reads ambiguously. [LOW]
**Consensus:** Skeptical Journalist (low). A hostile skim could quote "live trading."

**Finding (verified):** "live paper trading" appears at index.html:181, 197, 621, 662
(and the meta descriptions). Always rescued by an adjacent "no real capital," so not
misleading on a careful read, but quotable out of context.

**Change:** Tighten to "live, on paper" or "paper trading, run live" at the prose
instances (index.html:197, 621) so "live" cannot be skimmed as real-market trading.
Keep the adjacent "no real capital" everywhere it already appears. Leave the meta
descriptions if they read clearly. Sync any change to `SITEMAP_COPY.md`.

**Why low:** Defensible as written; this is belt-and-suspenders for the hostile reader.

## T12. Restore the spec waitlist success line + fix the README. [LOW]
**Consensus:** Waitlist Signer (low, success copy), Skeptical Journalist (low, README).

**Findings (verified):**
- `js/waitlist.js:33` success reads "You are on the list. We will reach out the moment
  your access opens." The spec (`SITEMAP_COPY.md:718`) is "You are on the list. We open
  access in order, as each stage is validated." The spec version reinforces the
  validation-gated thesis at the one moment the user has committed.
- `README.md:6-7` says "Vanilla ES modules. No build step. Three.js, GSAP ... loaded
  from a CDN via an importmap." The repo is a Vite multi-page build with self-hosted,
  fingerprinted three/gsap/lenis. Anyone auditing the repo (the brand's invited posture)
  hits a doc describing a different architecture than what ships.

**Change:** Set `js/waitlist.js:33` `MSG.success` to the spec line. Rewrite the
README build/run section to match reality: a Vite multi-page build (`npm run build`,
`npm run preview`), three/gsap/lenis self-hosted and bundled, not a CDN importmap.

**Why low:** Both are small, but the README is the audit surface the brand invites, and
the success line is the last on-brand beat at conversion.

---

# DO NOT BREAK (the praised elements a polish pass must preserve)

Every tester scored 9+ and would join. The following were named as strengths by
multiple personas. A polish pass that regresses any of these has failed regardless of
what it adds:

1. **The honest empty Results slot.** STATUS=reserved, every value null, the
   `[ awaiting validated artifact ]` caption, the "Numbers appear here only after they
   clear purged walk-forward and the deflation. Not before." note. Named the single
   most trust-building thing on the property by THREE testers. J3/C3/T9 must keep it
   honestly empty; NEVER fabricate a value, a tick, a sample curve, or a knee point.
   The `drawCurve` path must stay gated to `STATUS === "live"` AND non-empty arrays.
2. **The restrained bloom.** The gauntlet pin fires ONE muted `flareBloom`, never
   triumphant, because the result is not triumphant (performance.js:266). Do not make
   any bloom celebratory. J1's progress flare must be equally restrained.
3. **The "edge has not cleared the bar" candor, on the landing AND the deep pages.**
   T1 makes the hero MATCH this; it must not soften the deep-page statements
   (/performance #standing, /progress #edge-status).
4. **One signal hue, one cursor, one Lenis feel (lerp 0.085), one numbered chapter
   rail, byte-identical nav/footer from the shared model.** Every "one hand" praise
   rests on this. Sub-page work (J1, J2, T2) must reuse the shared modules, never fork
   a second device, palette, easing, or scene.
5. **The reconciled test count (2,500+ bound via data-fact).** Already fixed; do not
   reintroduce a second number. C1 extends this discipline to the roadmap.
6. **The robust boot path:** html.js gate, 6s failsafe, reduced-motion static frame,
   no-WebGL fallback, offscreen pause, never strands content hidden. T2's static nav/
   footer must keep the no-JS guarantee, not weaken it.
7. **Zero em dashes (U+2014) and zero hype words, in source AND dist.** Grep-audited as
   a hard failure. Re-run `grep -rPn "\x{2014}"` and `npm run build` after EVERY change
   in this brief. Both must stay clean and green.
8. **The correct, non-laundered technical depth** (purged WFV, DSR/PSR, PBO via CSCV,
   EWMA/Ledoit-Wolf, Clarabel MVO, triple-barrier meta-labeling that scales-never-flips,
   Gaussian HMM). T3 may only NAME real parameters; invent no component beyond the
   approved list.

---

# Suggested execution order

1. **T1** (hero overclaim) and **C1** (roadmap status) first: unanimous / near-unanimous,
   tiny, pure trust. Sync `SITEMAP_COPY.md`.
2. **T2** (static no-JS nav/footer + legal) and **T4** (inline waitlist on sub-pages):
   the two structural trust/conversion fixes.
3. **J1** (progress tentpole) and **J2** (sub-page hero scale): the two HIGH immersion
   lifts that close the "front-loaded wow" gap.
4. **T3** (true trial count + baseline + gauntlet params): demonstrate the deflation.
5. **C3 + J3** together (combine reserved panels and make the survivor powered-on).
6. The remaining MEDIUM/LOW items (J4, C2, T5-T12) as a finishing pass.

After each item: `cd /Users/arhancanli/meridian && npm run build` (green) and
`grep -rPn "\x{2014}" .` over source + dist (empty). Preview with `npm run preview`.
