# Canli Capital / Open evidence

The October 2026 redesign treats finance as something a reader can inspect. The
opening thesis is **Conviction needs evidence.** Its dimensional illustration uses
the actual published paper equity curves and declares their paper basis. The story
moves through the vision, selection bias, trial accounting, failures, forward
observation, tools, ALPHAC, company provenance and the work still ahead.

A light reading surface, midnight opening and footer, blue actions, and ice
colored evidence planes form one visual vocabulary. Bricolage Grotesque carries
headings, Inter carries prose, and IBM Plex Mono carries units and source labels.
All fonts are self hosted with swapping faces and metric matched fallbacks.
Licenses and source URLs are preserved under `public/fonts` and
`docs/redesign/font-sources.json`.

## The complete site

The same foundation styles every editable route, including noindex trial records.
Six families keep distinct jobs: the narrative homepage, chapter hubs, document
readers, calculator workbenches, developer references, and company filing data.
The source inventory is `docs/redesign/routes.json`. Immutable original papers and
checksummed evidence stay preserved; their reading wrappers use the new design.

Primary navigation is Research, ALPHAC and Developers. A native Explore disclosure
keeps the complete route hierarchy and repositories accessible on desktop, phone
and without JavaScript. Readers have document indexes, spacious prose, complete
tables, keyboard scrolling and visible source boundaries. Workbenches keep inputs,
units, results and source context together, with secondary source context in native
disclosures. The company renderer serves static and hosted pages with the same
stylesheet and exact source markup.

## Motion and evidence

The homepage separates and traces the evidence process with the existing real
WebGL renderer. The opening paper planes move with scrolling. The common GSAP
module animates chapter headings, reading progress, source paths and navigation
using native scrolling. It never animates numbers. Complete HTML stays visible
before enhancement. Reduced motion preserves the same copy, source values and
static diagrams without the moving sequence.

Research, the open record, performance and six calculator defaults render during
the build through their existing JavaScript data binders in a local DOM. They read
captured artifacts and reuse the existing computation cores. This render requires
no browser binary or external network. Browser enhancement attaches controls and
can refresh published data afterward. Missing research evidence stops the render;
it does not create a substitute value. Each calculator publishes its derived
default display and renderer hash under `public/glassbox/calculator-defaults`,
retaining its illustrative basis and numerical traceability.

## Source ownership

`css/design-system.css` owns tokens, type, components, responsive behavior and data
graphics. `css/story.css` owns homepage composition. `css/page-layouts.css` carries
only the structural and functional declarations needed by generated markup; its
migration inputs are in `docs/redesign/layout-sources.json`. Old theme files remain
historical source and are excluded from editable page delivery.
`css/product-shell.css` imports the shared foundation.

Page generators run first. `scripts/build-site-design.mjs` applies the foundation
and table regions. `scripts/build-static-evidence.mjs` renders data defaults, then
the design step normalizes their markup. Future changes belong in these sources
and page generators. The hand authored homepage retains the answer, comparison,
FAQ and evidence generators' marked regions.

## Figma

The editable [October page](https://www.figma.com/design/n3MbdBAC6STjHudQocaZa7?node-id=159-2)
contains desktop and mobile narrative boards, the five other family templates,
nine bound color variables, five text styles, and Action, Source notice, Evidence
row and Input field components. Its paper illustration imports the generated
source SVG. The boards describe the visual system and content hierarchy; route
screenshots and browser checks document the final implementation.

Current route and verification evidence is recorded in
[the redesign delivery record](docs/redesign/README.md).
