# LANDING10 / Regression Review

Role: Regression Reviewer. Scope: confirm the Landing 10/10 motion + charts work
introduced NO regressions against the hard guardrails. Build, navigation, sub-page
integrity, em-dash hygiene, three-bundle weight, and shared-engine isolation.

Verdict: **PASS**, no regressions found. Safe to ship.
Reviewed: 2026-06-17. Repo is not git-tracked, so attribution uses file mtimes
(owned files = Jun 17; every protected file = Jun 16, untouched) plus content audits.

---

## 1. Build is GREEN

`cd /Users/arhancanli/meridian && npm run build` succeeds, reproducibly:
- `56 modules transformed`, `built in ~130ms`, no errors/warnings.
- Ran twice; identical output and identical content hashes.
- Owned source modules syntax-check clean (`node --check js/landing.js js/charts.js`),
  and the built entry chunks parse clean (`dist/assets/index-Bar-U7OF.js`,
  `dist/assets/main-t5tJG_Ih.js`).

## 2. Top-nav still NAVIGATES to clean URLs (not hijacked)

- `config/brand.js` NAV (untouched, Jun 16) defines the three destinations with
  clean URLs: `/systems`, `/performance`, `/progress`.
- `js/shell.js` `buildNav()` (untouched, Jun 16) renders the TOP MENU from
  `item.href` (clean URL) as plain `<a href>` anchors, code comment is explicit:
  "The TOP MENU always NAVIGATES to the dedicated sub-page (clean URL)". No
  `preventDefault`, no `pushState`, no click interception.
- `js/landing.js` does NOT touch `#nav` / `.nav__links` / `buildNav` / NAV
  (grep clean). It cannot hijack navigation.
- The `#systems` / `#performance` / `#progress` strings in static `dist/index.html`
  are the in-page landing TEASER section ids, not the top bar; the top bar is
  injected by shell.js at runtime from the clean-URL NAV model.

## 3. Sub-pages not edited / still render

- `systems.html`, `performance.html`, `progress.html` and their CSS/JS
  (`systems-page.js`, `performance.js`, `progress.js`, `css/*`) all carry Jun 16
  mtimes, untouched today.
- Each builds to a non-trivial dist HTML referencing its own intact bundle
  (`assets/systems-*.{js,css}`, `assets/performance-*.{js,css}`,
  `assets/progress-*.{js,css}`). No broken references.

## 4. Em-dash (U+2014) audit = 0 in source AND dist

Three independent scans, all clean:
- `grep` for the literal char across all source + dist: no hits.
- `perl -CSD` codepoint scan for `\x{2014}`: no hits in source or dist.
- Byte-level UTF-8 scan (`grep -aP '\xe2\x80\x94'`) across every dist html/js/css
  and every owned source file: CLEAN.
- Bonus: owned source also carries zero en-dash (U+2013), horizontal bar (U+2015),
  or minus sign (U+2212), no sneaky substitutes.

## 5. Three bundle NOT bloated; shared engine untouched

- `dist/assets/three-BUpvj0X8.js` = 526.02 kB / 131.54 kB gzip. Identical size AND
  identical content hash across two consecutive builds.
- `js/scene.js`, `js/shaders.js` untouched (Jun 16). The three bundle contains zero
  landing/chart strings (`grep -c "mountEquityCurve|landing|equity-slot|founder" = 0`).
- New `js/charts.js` imports ONLY `gsap`, `gsap/ScrollTrigger`, and the existing
  `./performance_data.js` data contract, NO `three`/WebGL import. Charts render as
  lightweight SVG (`createElementNS`), animating `stroke-dashoffset` / `transform` /
  `opacity` (no layout thrash). The chart code lands in the small `index-*.js`
  landing chunk (14.08 kB), not in the three bundle.

## 6. Shared scene/shell/cursor/scroll isolation

- `js/scene.js`, `js/shell.js`, `js/cursor.js`, `js/scroll.js`, `js/main.js`,
  `js/page-config.js`, `js/performance_data.js`: all Jun 16, untouched. scroll.js
  was NOT edited (no surgical home-guard needed).
- `js/landing.js` drives the scene ONLY via the public handle
  `window.__meridianScene`, calling the single public method `s.pulseRidge()` behind
  a `typeof === "function"` guard. `pulseRidge` is part of scene.js's public return
  surface (`return { setScroll, setPointer, pulseRidge, ... }`). No internals reach.

## 7. Honesty guardrail (chart + offer + founder)

- `performance_data.js` (untouched) exports `STATUS = "reserved"`, `EQUITY_CURVE = []`,
  `CAPACITY_CURVE = []`. The grand backtest data is genuinely absent.
- The `#equity-slot` in `index.html` mounts in honest-pending state:
  `aria-label="Live research, backtest in progress"`, visible label
  `[ live research, backtest in progress ]`. No fabricated curve.
- `js/charts.js` treats the empty state as first-class: a chart renders live only
  when `STATUS === "live"` AND the series has 2+ valid points; otherwise it draws
  the honest empty frame (unlabeled gridlines, pending nodes, reserved chips).
  Malformed input collapses to the pending shell rather than throwing. A clean
  `mountEquityCurve(...) / fromPerformanceData()` API is exported for /performance
  to adopt next.

## Runtime check note (non-blocking)

A full headless render was attempted but the project only vendors
`@puppeteer/browsers` (a utility), not the `puppeteer` launch package, and no install
should be performed during review. Verification therefore relied on: reproducible
green build, `node --check` parse of source + built chunks, and exhaustive static +
byte-level audits above. No runtime regression indicators found. If a live smoke
test is desired before deploy, run it in an environment with `puppeteer` installed
(check: nav `<a>` hrefs resolve to `/systems|/performance|/progress`, `#equity-slot`
shows the pending label, sub-pages load with no console errors).

---

## Guardrail scorecard

| Guardrail                                   | Result |
|---------------------------------------------|--------|
| `npm run build` GREEN                       | PASS   |
| Top-nav navigates to clean URLs (not hijacked) | PASS |
| Sub-pages unedited / still render           | PASS   |
| Em-dash U+2014 = 0 (source + dist)          | PASS   |
| Three bundle not bloated                    | PASS   |
| Shared scene/shaders/shell/cursor/scroll untouched | PASS |
| Scene driven via public API only            | PASS   |
| Chart honest-pending (no fabricated data)   | PASS   |

No blocking issues. No regressions.
