# October 2026 website redesign

The redesign brings every editable canlicapital.com page onto one design system.
The homepage tells an eighteen-chapter story from the vision and selection problem
through published failures, paper evidence, developer tools, ALPHAC, company data,
authorship and the work ahead. Native scrolling moves the published paper planes
and the five-state evidence scene. Reading pages use a quiet, complete layout.

The [Figma October page](https://www.figma.com/design/n3MbdBAC6STjHudQocaZa7?node-id=159-2)
contains editable boards, variables, typography and components. [DESIGN.md](../../DESIGN.md)
describes the design and build ownership. [routes.json](routes.json) is the exact
editable route inventory; it includes public noindex trial records.

| Family | Routes | Behavior |
| --- | ---: | --- |
| Homepage | 1 | Narrative, source curves, native scroll, complete static evidence |
| Chapter | 18 | ALPHAC, research, performance, methodology and institution hubs |
| Reader | 587 | Research, measurements, trials, notes and publication wrappers |
| Reference | 64 | Company directory and filing histories; shared hosted renderer |
| Workbench | 8 | Calculators and annotation interface |
| Developer | 6 | API guide and the source-configured MCP family |

The 700 built HTML pages comprise these 684 routes and 16 immutable original
papers. Original paper hashes remain unchanged. The redesign preserves the 337
indexable URLs and 363 public noindex documents. Sitemap eligibility is separate
from actual search-engine indexing.

## Implementation

- `css/product-shell.css` imports the shared foundation. `design-system.css` owns
  tokens, fonts and components; `story.css` owns the homepage; `page-layouts.css`
  retains structural layouts. Old visual themes are excluded from delivery.
- Shared navigation has Research, ALPHAC and Developers, with the complete route
  hierarchy in a native disclosure. It works without JavaScript.
- The company source renderer supplies the same design to static and hosted
  company routes. Financial values and filing provenance stay source derived.
- Research, open data, performance and six calculator defaults render through
  their existing browser binders at build time. Missing inputs fail closed.
  Calculator artifacts carry renderer/dependency hashes, computed output and an
  explicit illustrative boundary. The verifier checks those hashes; tests
  reproduce all six artifacts. Computation cores are unchanged.
- Pure reading/navigation transforms are shared with the standalone paper
  generator. Repeated paper generation preserves the complete reading layout.
- The execution lab labels its chart as the published comparison preset. Its
  controls update the isolated-assumption sweep, as the existing core specifies.
- All fonts are local. Licenses and [source records](font-sources.json) accompany
  the new Bricolage Grotesque and IBM Plex Mono assets.

## Verification

Node 22.23.2 `npm run build` and `npm run verify` passed. The latter ran 1,302 tests
and six preverify cases, followed by writing, publication, source, SEO, link,
indexability, numerical and search-intent audits. All 30,281 visible numerals trace
to published artifacts. On-page checks report zero errors and warnings. Every
indexable page is reachable within three homepage clicks.

`scripts/verify-browser.sh` checks the production bundle with a unique served
build marker. It runs the homepage audit, 42 shared-shell views, all 684 editable
routes at desktop and 320px with JavaScript off (1,368 cases), sixteen working
calculator/navigation cases and two motion cases. The motion check reaches every
desktop evidence state using native scroll, then changes the system preference
and verifies cleanup. Phones preserve the compact static diagram.

Reports are in [all-routes-no-js.json](../../artifacts/qa/october-redesign/all-routes-no-js.json),
[flows.json](../../artifacts/qa/october-redesign/flows.json) and
[motion.json](../../artifacts/qa/october-redesign/motion.json), with the homepage
and shell reports in their existing QA folders. These are local Chromium checks,
not an accessibility certification, field-performance measurement or proof of
search indexing. Intermediate failures and their corrections remain recorded in
the goal log.

The committed-date/Git-free deployment proof and PR delivery are recorded below
after the signed source and date-binding commits. Production remains unchanged;
the owner merges protected main and controls deployment.

## Figma references

| Artifact | Node |
| --- | --- |
| October page | 159:2 |
| Desktop narrative | 159:20 |
| Mobile narrative | 159:179 |
| Chapter / reader / workbench | 159:74 / 159:95 / 159:116 |
| Company / developer | 159:137 / 159:158 |
| Action / source notice / evidence row / input field | 159:18 / 163:9 / 163:12 / 163:15 |
| Published paper SVG | 166:21 |

The boards establish content hierarchy and design vocabulary. Browser captures
document the final delivery. Broader indexing, adoption, expert annotation,
independent research and governed ALPHAC outcomes remain open.


## Committed deployment-date proof

Signed source commit 2280b88f and paired date/output commit 48dd5ddd are verified.
The exact required Git-free command exited 0 from the prepared build, and left
no tracked diff. [The receipt](../../artifacts/qa/october-redesign/deployment-date-proof.json)
binds the source head, committed manifest and sitemap hashes. An earlier empty
checkout lacked generated dataset cards; its failed prerequisite is recorded
separately. Final protected-main PR checks follow source delivery.


## Review delivery

[PR #380](https://github.com/arhancanli/canlicapital/pull/380) contains the full redesign and prerequisite #375.
All local build, source, browser and deployment-date checks above passed.
Automatic checks run on the final branch. The owner retains protected-main
merge and production deployment.


## Full-rebuild regression and shell contracts

The release-style generator and final design pass now preserve exact source
bytes across repeated generation, including the homepage, progress and open
data pages. The deployment-date CI guard caught accumulating insertion
whitespace; a regression composes the actual production transforms.
All 60 React wrapper contracts pass with the complete shared footer styles.
The expanded native footer also passes desktop and 320px browser checks with
JavaScript off; reports and captures are in the October QA folder.
