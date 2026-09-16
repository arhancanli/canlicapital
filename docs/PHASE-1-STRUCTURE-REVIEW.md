# Phase 1 — information architecture review

9 September 2026. User approved Phase 1 only. This is a source-based structure review and implementation contract, not a visual sign-off of 489 pages. No website markup, imagery, styles or Figma compositions were changed during this approved phase.

## Decision

Keep the product and its evidence; reduce repeated explanations. The homepage serves two visitors: someone inspecting Canli's own strategies and someone who wants to use the validation API. Both should reach the actual product before being asked to inspect the complete research machinery.

Recommended main reading order:

**What ALPHAC does → four strategies → paper record and its limits → how the work is tested and published → developer tools → research → accountability and FAQ → access.**

This replaces the current long introduction-before-product emphasis. The process remains cinematic, but a visitor should not have to complete a pinned animation to find strategies or the API. The reference's continuity is useful; its freight narrative and lead-generation content are not our information architecture.

## Every homepage area: keep, merge or make optional

| Current area | Decision for implementation | Information that must survive | Owner phase |
| --- | --- | --- | --- |
| Header/navigation | Keep; make direct product paths clearer | Research, strategies, paper dashboard, developer access and complete route index | 4 |
| Hero `.cinema-hero` | Keep; plain explanation of own strategies, paper basis and API | Existing actions and execution boundary | 2 |
| Intro `#introduction` | Merge its useful explanation into hero/process; remove standalone repetition | Open-work explanation and existing links | 2 |
| Opening `.cinema-process` | Keep as the single principal process illustration, after product/record in final order | Research, observation, publication and correction distinctions | 2, integration in 3 |
| Strategies `#sleeves` | Keep all four; explain each mechanism before artistic metaphor | Names, execution basis, weights, source-bound observations, research-only correlation caveat | 2 |
| Paper record `#live-record` | Keep, with limitations immediately beside curve | Composite/sleeve switching, negative days, timestamps, paper labels, dashboard link | 3 |
| Developer entry `#developer-api` | Keep; show input → validation → receipt | Free-key workflow, examples, endpoint links; no investment endorsement | 3 |
| Offering `.offering` | Merge, not wholesale delete | Move paper marks/account metrics to record; research/trial/correction facts to research; repository/testing facts to developer/engineering; independent-review limits to accountability | 3 |
| Evidence room `#record-details` | Keep optional expansion (already closed by default) | Deep links must open it; all unique underlying sources remain reachable | 3 |
| Evidence core `#evidence-core` | Optional technical view, not another required process hero | Frozen identities, failed trials, sleeve boundaries, signed sequence and source hooks | 3 |
| System films `#system-films` | Optional inspectable artifacts | All three films, dated provenance, limitations, source links and playback controls | 3 |
| Rebalance `#method` | Keep optional detail; avoid a second mandatory scroll-pinned journey | Five distinct questions and data/trial/risk/broker/verification links | 3 |
| Research `#research` | Keep; lead with useful papers, not another process speech | Paper links, library, trial denominator, failed work and accounting distinctions | 3 |
| Evidence `#evidence-details`, `#evidence` | Keep limitations expanded; consolidate presentation with record | Observed vs simulated vs objectives, maturity, reconciliation, missing turnover/slippage and dated sources | 3 |
| Evidence grammar | Integrate labels where claims appear; retain a compact key | Three meanings remain explicit; simulated/planned cannot inherit observed styling | 3 |
| Accountability `#trust` | Keep, shorten duplicated method/execution descriptions | Named builder, methodology, corrections, self-published status, paper boundary and all links | 3 |
| FAQ `.home-questions` | Keep all four questions | Capital, glassbox, API and investment/copy-trade boundaries | 3 |
| Access `#access` | Keep; separate dashboard, API and optional updates | No account needed for public material; signup purpose; no paid-plan claim invented | 3 |
| Footer `.cc-handoff` | Remove the repeated full process narrative from routine subpages; make home ending compact | Existing navigation/source links, provenance principles and reduced-motion access | 3–4 |

Merge means relocate unique content before removing its old container. Preserve fragment destinations or supply a meaningful in-page target. Do not leave invisible dummy anchors or retain an entire duplicate purely to satisfy a text hash.

## All top-level routes have a distinct job

| Route | Job and simplification boundary |
| --- | --- |
| `/` | Product overview and two direct paths: inspect the strategies; use the API |
| `/research` | Find and understand research; library should not sit behind another complete brand story |
| `/systems` | Explain implementation/data/risk/execution; retain technical specificity |
| `/performance` | Observations and their measurement basis; distinguish research curves from paper record |
| `/developers` | Get a key, run an example, understand results; advanced reference follows working quickstart |
| `/tools` | Choose a calculator; group by user question instead of duplicate marketing descriptions |
| `/how-to-validate-a-backtest` | Guided workflow connecting the calculators; not redundant with tool reference |
| `/methodology` | Research rules and admission criteria; keep rules distinct from observed results |
| `/open` | Transparency commitments and reproduction entry points; shorten repeated performance narrative only after source mapping |
| `/verify` | Verification steps and limits; retain commands, hashes and failure guidance |
| `/measurements` | Browse dated measurements and their sources |
| `/trials` | Complete trial denominator and packets; failed work is not disposable content |
| `/progress` | Changes and corrections; preserve historical statements and supersession |
| `/founder` | Authorship and accountability, not another full product landing page |
| `/engineering` | Code/repository ownership and reproducibility; preserve technical evidence |
| `/notes` | Engineering note index |
| `/costs` | Cost assumptions and omissions; do not hide uncomfortable limitations |
| `/review` | Review process and actual status; public criticism is not independent peer review |
| `/foundry` | Research-only subsystem and operational gates; do not imply execution authority |

## Coverage and editing boundaries

Source inventory: 19 top-level pages, 124 research pages, 89 measurements, 228 trial packets, 16 publication wrappers, 7 tools, 5 notes and 1 standard = **489 site pages**. Additionally **16 original publication HTML artifacts** live under `public/`; preserve their bytes. The 22 HTML specimens in `ds-bundle` are component examples, not public page routes. External dashboard and backend API behavior are not proved by this source inventory.

- Homepage/legacy hubs: inspect their source HTML and JS bindings before changing structure.
- Generated documents: change their generator, not only the emitted HTML. Relevant sources include `build-papers`, `build-measurements`, `build-trials`, `build-publication-wrappers`, `build-notes`, `build-standards-and-developers` and individual tool builders in `scripts/`.
- Shared navigation/footer: use the product-shell source and synchronizer. `progress.html` additionally has generated correction regions; preserve those markers.
- Every route remains visually unreviewed under the revised direction until its later batch supplies evidence. A shared template improvement is not an individual page inspection.

## Content issues to verify during implementation

1. Static homepage source contains different signed-entry counts in the core/evidence/accountability areas. Hydration may reconcile them; verify the loaded data and no-JS state before claiming these are current or altering values.
2. Homepage copy uses four active sleeves while paper-account counts are three. These count different things, not automatically an inconsistency. Keep AlphaForge's local simulation explicit.
3. `/research` source heading says “One neutral core” while the homepage discusses observed exposure ranges. Verify basis and dates before reconciling wording; do not invent neutrality.
4. `/performance`, `/open` and `/research` repeat research-result narratives. Prefer canonical detail plus short summaries, but never merge away costs, sample limitations or failed criteria.
5. “Live” in navigation can be read as funded. Proposed label: “Paper dashboard”. No actual nav change made in Phase 1.

## Acceptance and next gate

Phase 1 is complete when the inventory is regenerated, this section/route decision map is recorded, preservation checks pass, and existing disclosure/deep-link behavior is rechecked. Browser checks cover that behavior only; they do not establish cinematic quality or production readiness.

Result: all Phase 1 checks passed. `inventory-redesign.mjs` reports 489 pages plus 16 protected documents. `check-design-preservation.mjs` reports zero failures across 489 pages. `audit-redesign-disclosure.py` passed Chromium/WebKit at desktop and mobile sizes. `audit-phase1-safari.py` passed in actual Safari against the current dev server. No build/deployment or full-site visual audit was performed in this phase.

Phase 2 permission request: design and implement the revised opening, single process story and four strategy presentations, including brighter native-render studies and editable Figma compositions. Review a representative render at intended display size before producing a full asset series. Preserve actual data and test desktop/mobile, reduced motion, keyboard access and Safari forward/reverse scrolling. Stop at its review gate; do not silently start Phase 3.
