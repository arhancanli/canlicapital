# Immersion Arc: Regression QA

Role: Regression QA. Scope: verify the four HARD guardrails did not regress
during the interactivity/immersion push. Verdict below is gating (PASS = ship,
BLOCK = do not ship).

Date: 2026-06-16
Working tree: /Users/arhancanli/meridian
Verdict: PASS (no regression on any hard guardrail)

---

## 1. Build is GREEN

`cd /Users/arhancanli/meridian && npm run build`

```
vite v8.0.16 ... 54 modules transformed
dist/index.html        40.25 kB
dist/systems.html      44.02 kB
dist/performance.html  31.96 kB
dist/progress.html     38.17 kB
dist/assets/three-BUpvj0X8.js   526.02 kB  (gzip 131.54)  <- unchanged, not bloated
dist/assets/gsap-CZkpitSS.js    112.93 kB
✓ built in 123ms
```

PASS. Build exits clean. Three bundle is 526 KB, the same order documented in the
brief (no material bloat).

## 2. Top-nav NAVIGATES to clean URLs (no anchor hijack)

The single most likely regression: a smooth-scroll handler swallowing top-nav
clicks. Verified end to end.

- Link model: `config/brand.js` `NAV` declares both `href` (clean URL) and
  `anchor` (landing teaser). The top nav uses `href` unconditionally.
- `js/shell.js` `buildNav()` line 95: `const href = item.href || item.anchor || "#";`
  Renders `/systems`, `/performance`, `/progress`. It does NOT call `resolveHref()`
  (which is anchor-aware on home); `resolveHref` is used only by the FOOTER. So even
  on the landing the TOP nav points to the clean sub-page URLs, as required.
- `buildNav()` line 111 replaces the container wholesale: `links.innerHTML = markup.join("")`.
  The landing's static `#systems` anchors in `index.html` (lines 163-165) are
  overwritten with the clean-URL links at runtime.
- Bootstrap order (`js/main.js`): `buildShell()` (357) -> `bindBrand()` (358) ->
  `initScene()` (377) -> `initScroll()` (391). The nav is rebuilt to clean URLs
  BEFORE the smooth-scroll handler binds, so the handler never sees the old anchors.
- Smooth-scroll handler (`js/scroll.js` 798-806) is gated:
  `document.querySelectorAll('a[href^="#"]')` with `if (id.length > 1 && document.querySelector(id)) { e.preventDefault(); scrollTo(id); }`.
  Clean URLs start with `/`, never `#`, so they are never selected and never
  `preventDefault`-ed. The chapter rail (`rail__item`) keeps its own smooth scroll
  (791-796) and is explicitly skipped in the anchor loop (line 799).
- No global/document-level click delegation hijacks links (only rail items, the
  in-page `#` anchors, the waitlist form, and the cursor pointer events bind clicks).

Dist (shipped) confirmation:

- `dist/assets/main-*.js` minified NAV: `{page:"systems",label:"Systems",href:"/systems",anchor:"#systems"}` (+ performance, progress).
- `dist/assets/main-*.js` minified buildNav: `m.forEach(e=>{let t=e.href||e.anchor||"#"...})`, href-first.
- `dist/assets/scroll-*.js` still contains the gate `a[href^="#"]`.

PASS. Top nav navigates to `/systems` `/performance` `/progress`; CTA resolves to
`#waitlist` (home) / `/#waitlist` (sub-pages). No click handler hijacks the clean URLs.

## 3. Em-dash gate (U+2014) = 0

Audited by Unicode codepoint with PCRE.

- Source (`js/ config/ docs/ *.html`): `grep -rlP "\x{2014}"` -> 0 files.
- Dist (`dist/`): `grep -rlP "\x{2014}"` -> 0 files.
- En-dash (U+2013) and horizontal bar (U+2015) in source JS/HTML: none.

PASS.

## 4. Honesty preserved

- Hero (`index.html` 195-199): "AlphaForge is a multi-signal quantitative engine
  for crypto perpetual futures. It runs live, on paper, while it is tested for a
  positive edge on honest, leak-proof data. No real capital is at risk." The
  "tested for a positive edge" framing is intact; no "earns an edge" overclaim
  anywhere (grep for earns/guaranteed/profit returned only a comment in progress.js).
- Performance page empty frames preserved (`performance.html` 417-453):
  "showing you the empty frame on purpose", "honest empty state", role="img"
  aria-label "Out-of-sample equity curve, awaiting validated artifact",
  `[ awaiting validated artifact ]`, "NO fabricated tick values, NO sample curve,
  NO placeholder". Six fields labeled and empty.

PASS.

---

## Summary

| Guardrail | Result |
|-----------|--------|
| 1. Build green | PASS |
| 2. Top-nav clean-URL navigation, no anchor hijack | PASS |
| 3. Em-dash gate (source + dist) = 0 | PASS |
| 4. Honest copy + performance empty frames | PASS |

No regression on any hard guardrail. Cleared to ship.
