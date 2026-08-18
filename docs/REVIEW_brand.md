# Meridian / Brand and Quality Review

Reviewer: brand + quality critic. Bar: a 10/10, ultra-immersive, CONSISTENT
multi-page experience (`/`, `/systems`, `/performance`, `/progress`) sharing one
design system, one cursor, one scroll feel, one manifold scene, one numbered
chapter spine. Judged adversarially against `docs/DESIGN_SYSTEM.md` and
`docs/SITEMAP_COPY.md`.

Verdict: BLOCK. The single landing page that exists is close to the bar in
isolation. The multi-page property that the brief, the design system, and the
sitemap all describe as the deliverable does not exist. The brand cannot read as
10/10 and "consistent across all pages" when three of the four pages are absent.

Build state at review: `npm run build` is green but emits only `dist/index.html`.
Em-dash audit (`grep -rPn "\x{2014}"`) over source is clean. No hype words in copy.

---

## What is genuinely strong (keep, do not regress)

- The token system in `css/styles.css :root` is faithful and disciplined: exact
  palette (`--void #0A0B0D`, `--ink`, `--paper #F4F1EA`, single `--signal
  #C8553D` plus its deep/glow/faint companions), the 8px `--s-*` scale, `--max`
  / `--margin` / `--gutter`. No rogue second accent, no neon, no multi-hue
  gradient. One signal hue, honored.
- All four easing tokens exist and are used correctly (`--ease-out`,
  `--ease-settle`, `--ease-in-out`, `--ease-cinema`), with cinema reserved for
  the intro lift and the type-settle moments. The motion grammar matches the doc.
- The broken-grid signature is present and singular per chapter
  (`.flagship__intro` 1.15fr / 0.85fr; pillars right overhang).
- Copy is true, sourced from `config/brand.js`, scope-honest (paper / simulation,
  no real capital, no claimed return), and free of em dashes and hype words. The
  honesty-as-strength framing in the Status chapter is on brand.
- The boot path is robust and accessible: `html.js` gate, reduced-motion static
  scene, 6s failsafe force-open, no content gated behind motion, skip link first.

This is real 9/10-level work on the landing. The block is about scope and
cross-page consistency, not about the landing's intrinsic craft.

---

## BLOCKING (must fix to reach the stated bar)

### B1. The three sub-pages do not exist. (the central failure)
The TARGET, `docs/DESIGN_SYSTEM.md` (sections 5, 10), and `docs/SITEMAP_COPY.md`
(sections 3, 4, 5, 7) all specify `/systems`, `/performance`, `/progress` as
deeply-detailed interactive sub-pages. Only `index.html` exists.
- `vite.config.js` `rollupOptions.input` is `resolve(root, "index.html")` only,
  and its own comment says "index.html is the single entry."
- `dist/` after build contains only `index.html` (plus assets). No
  `systems.html`, `performance.html`, `progress.html`.
- No partials, no per-page scene tuning module, no per-page rail data.
A four-page property where three pages are missing cannot be "consistent and
premium across all pages." Fix: build the three HTML entries from the sitemap
copy, add each to Vite input, import the same shared CSS/JS, lazy-init the same
`createScene` with the per-page convergence band described in DESIGN_SYSTEM
section 5, and feed each its own rail chapters. The sub-pages must reuse the
shared modules (not fork them) so the manifold, cursor, and scroll feel are
byte-identical.

### B2. The shared nav is not the cross-page nav and has no active state.
`index.html` nav links are `AlphaForge` / `System` / `Status` (in-page anchors).
The contract (DESIGN_SYSTEM section 6.3, SITEMAP_COPY section 2) is
`Systems` (`/systems`), `Performance` (`/performance`), `Progress` (`/progress`)
plus the Meridian wordmark home and the Join CTA, with the current page's link
carrying `aria-current="page"` and a resting-lit state.
- grep finds zero `aria-current`, zero `is-current`, zero clean-URL `href="/..."`
  anywhere in `index.html`, `js/`, or `css/`.
Until this is the shared chrome with a real current-page state, navigating
between pages will not feel like one numbered document. Fix: lift the nav to a
shared partial (or byte-identical duplicate), point links to the clean URLs,
add the active-state class + `aria-current`, and on the landing keep the
smooth-scroll-to-teaser behavior.

### B3. The landing was not updated to the sitemap spec it is supposed to anchor.
Even as a standalone page, `index.html` diverges from `docs/SITEMAP_COPY.md`
section 2:
- Section IDs are `#system`, `#proof`, `#house`; the sitemap requires `#systems`,
  `#performance`, `#progress` so the nav teasers and the sub-page URLs line up.
- The three teaser "read the full page" bridge links are absent: no "See the
  system, end to end -> /systems" at the end of flagship, no "Read the full
  architecture -> /systems", no "See the methodology and the gauntlet ->
  /performance", no "Read the build log and the roadmap -> /progress".
- `CHAPTER_NAMES` in `js/scroll.js:611` is a hardcoded const ("Overview, Thesis,
  AlphaForge, System, Discipline, Status, House, Waitlist, Colophon") and the
  rail labels still say System / Status / House. The sitemap renames these to
  Systems / Performance / Progress and notes the array must be parameterized per
  page. As written the rail spine cannot be reused by the sub-pages.
- Footer columns still link only to in-page anchors; the sitemap requires several
  to point to the new clean URLs (`/systems`, `/performance`, `/progress`).
Without these the teasers do not link out and the four pages do not share one
chapter spine.

---

## NON-BLOCKING (polish; fix in passing)

- `og:image` is absent though the `index.html` head comment claims "The card
  image is the same inline mark used for the favicon." Either add the OG image
  (a void card with the signal dot, matching the favicon) or delete the false
  comment. `twitter:card` is `summary` with no image. Low cost, raises the share
  surface to the same restraint as the page.
- `bindBrand()` in `js/main.js:39` overwrites the crafted `<title>` ("Meridian /
  AlphaForge, a quant engine proving itself in paper") with the bare "Meridian /
  AlphaForge" at runtime, discarding the better meta title. When the sub-pages
  arrive each needs its own true `<title>` (sitemap sections 3 to 5) that brand
  binding must not clobber; consider binding only the brand token inside the
  title, not replacing the whole string.
- Skip-link CSS in `index.html` hardcodes `#F4F2ED` (a near-paper that drifts
  from `--paper #F4F1EA`) and other literals. Defensible since it is intentionally
  self-contained for load-order independence, but align the value to the real
  paper so the off-white is identical to the rest of the property.
- `README.md` is stale: it describes a CDN importmap, no-build-step setup, but the
  repo is a Vite build with self-hosted three/gsap/lenis. Update it so the build
  and run instructions match `package.json` / `vite.config.js`.

---

## Bottom line

The landing is a credible 9/10 on its own and the design system is sound and
faithfully implemented. But the deliverable is a four-page, consistently premium
experience, and three of those pages are not built, the landing is not yet wired
to host them, and the shared nav has no cross-page identity. As measured against
the stated 10/10 multi-page bar, this is a BLOCK until the sub-pages exist, reuse
the shared system verbatim, and the landing + nav + rail are reworked to the
sitemap so all four pages read as one numbered document by one hand.
