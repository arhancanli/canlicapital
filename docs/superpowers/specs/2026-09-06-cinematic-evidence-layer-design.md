# Cinematic evidence layer for canlicapital.com

Date: 2026-09-06. Owner decision: "cinematic from evidence, desktop full, phones light". This spec
turns that decision into pieces that can each pass the site's gates on their own.

## What the owner asked for

Landing page and sub pages that feel cinematic: 3D scenes, movie-style transitions between pages,
scroll-driven films, and at the same time a site that is calm and understandable.

## The one rule that makes this compatible with the site

Every moving thing on this site is a published artifact being shown, never a decoration. A scene
earns its place by answering "what am I looking at" in one caption that names the artifact it is
drawn from. The site's numbers gate (every numeral traces to a declared artifact) and its writing
gate apply to captions exactly as they apply to prose. Nothing is typed by hand that the artifact
can supply.

Phones get the static version: the authored fallbacks that already exist, posters instead of
scrubbed films, no WebGL. This is the owner's own decision for the homepage hero, applied to every
scene. "Phone" means the same gate js/main.js already uses (mobile user agent, low device memory,
no WebGL, or prefers-reduced-motion).

## Pieces, in shipping order

Each piece ships alone when it passes `npm run build && npm run verify`, the homepage
static-versus-hydrated audit, and the performance check below. Whatever is verified before the
Tuesday post goes live; the rest lands after.

### 1. Page transitions (all pages)

Cross-document View Transitions, declared in CSS: `@view-transition { navigation: auto; }` in the
shared stylesheet every page loads (css/product-shell.css). The product shell header carries a
`view-transition-name` so it stays put while the page beneath it cuts; each page's hero title
carries one so a click from a list to its page morphs the title rather than replacing it. Browsers
without support fall back to a normal navigation, which is exactly the site today. Reduced motion
disables the animation through the same media query the site already honours. Zero JavaScript.

Data: none. Gate: the link-graph and indexability audits unchanged; no markup changes beyond the
attribute; a Playwright check that a navigation between two pages still lands on the right URL.

### 2. Scroll-scrubbed system films (homepage, desktop)

The three system films (engine, broker, record) are rendered deterministically from the published
state at 24 frames per second, twelve seconds each, with a manifest carrying their hashes. Today
they autoplay when scrolled into view. On desktop each film's section becomes a pinned scroll
scene: scroll progress drives `currentTime` (GSAP ScrollTrigger, already a dependency, scrub with
a short lag so it reads as film and not as a slider). The film's existing mode label stays as the
caption. On phones the current autoplay-on-view behaviour is unchanged.

Data: public/system-films/manifest.json. Gate: the film verification script already in prebuild;
the homepage audit; scroll position restored on reload; keyboard scrolling still works.

### 3. The evidence chain, in 3D (/open, desktop)

The signed transparency chain is a real object: a sequence of hashed entries across distinct days
with a head hash and a public key. Scene: a raw WebGL line of entries (one point per entry, one
tick per day, the head highlighted), drawn from public/api/v1/chain/head.json (entry_count,
distinct_days, first_date, last_date, head). Scrolling the /open hero moves along the chain; the
caption names the artifact and the head hash prefix the page already shows. Raw WebGL, like
js/entry-scene.js (three.js was removed today and stays removed).

Data: /api/v1/chain/head.json. Gate: the numbers audit (the caption's counts are the same fields
js/open.js already binds); the scene never fetches the 5.7 MB full log.

### 4. The book, in 3D (/systems, desktop)

The book is four sleeves whose research curves and live curves are published in
public/api/v1/sleeves.json. Scene: four curves laid out in depth, the composite in front, drawn as
lines from the published points; scrolling walks from the first research point to the last live
point. The caption names the artifact and states, in the words the page already uses, that these
are research and paper records, not a forecast.

Data: /api/v1/sleeves.json. Gate: the numbers audit; the /systems page's existing tests.

### 5. Sub-page hero motion (/research, /performance, /progress; after Tuesday)

The editorial pages lost their WebGL manifold when three.js was removed. Each gets a raw WebGL
scene from its own artifact: /research the corpus as a field of one point per published document,
/performance the forward record as a walk, /progress the corrections as a timeline. Same rules.

## Performance budget

Desktop: Total Blocking Time and Largest Contentful Paint on the homepage no worse than the
measurement taken before piece 2 lands (recorded in artifacts/qa before the change). Phones:
strictly no new bytes, no new requests. Each scene module is a dynamic import behind the gate.

## Out of scope

Motion with no artifact behind it. Three.js or any renderer dependency. Sound. Autoplaying
anything with a duration on phones. Changing any published number or its wording.
