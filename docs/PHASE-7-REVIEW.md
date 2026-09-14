# Phase 7: remaining reading and operating pages

Approved 10 September 2026. Local implementation; Phase 8 and deployment require separate permission.

## Scope and design

458 routes: 111 research papers, 89 measurements, 228 trial packets, 16 publication wrappers, five individual notes, one standard, and eight remaining top-level pages (Costs, Engineering, Founder, validation guide, Notes, Open, Progress and Trials).

The frontend-design skill guided a document-centered treatment: a sticky section index next to long evidence documents, compact native disclosures on other layouts and mobile, shared Chakra Petch headings, Inter/sans-serif reading text, paper/ink/cobalt surfaces. Original diagrams and family-specific exhibits remain; this phase does not invent a new film or animation for every paper.

- Research and measurements: open reading layouts, source-derived heading navigation, readable prose and code. Measurement name/value rows stack on mobile instead of compressing long identifiers into a narrow column.
- Trial packets: retained first measurement, completeness label, distribution, legend and caveat, with contrast adjusted for a light reading surface. Complete and incomplete remain distinctly labeled.
- Publications: smaller, more readable title treatment and direct wrapper-section navigation. Archive, review and capital boundaries remain. Original archived documents are excluded from enhancement.
- Notes: measured reading width, consistent headings and readable code blocks.
- Remaining operating pages: compact section access and refined hierarchy without removing their existing exhibits. Open's overlapping introduction was rebuilt as an in-flow reading sequence; Progress uses the same opening treatment.

The accessibility skill led to contrast fixes, native keyboard-operable disclosure, focusable scrollable tables/code, and a semantic repair to Founder's definition list. No source prose, figures, publication claims or original destinations were intentionally rewritten.

## Implementation and preservation

`scripts/phase7-scope.mjs` defines the explicit route boundary using the original site inventory. `scripts/build-reader-experience.mjs` runs last in prebuild, after Phase 6. It adds root scoping, a stylesheet/module, a document index and missing section anchors, and repairs only the documented focus/definition-list markup.

`artifacts/qa/phase7-reader/before.json` is the immutable whole-source hash baseline, including 16 protected original HTML publication artifacts. The preservation check reverses only those explicit additions before comparing the entire source. Protected originals are compared without normalization. The project also has independent publication-wrapper verification.

Verification tests regenerate some source pages. Run the final build after `npm run verify` to reapply the presentation layers; never rebuild during browser captures.

## Evidence and review limits

Results: 916 all-route desktop/mobile cases with zero reported issues; 28 final representative captures with zero issues; 14 actual Safari desktop smoke checks; 28 WebKit keyboard/no-JS cases; 14 normal-motion WebKit cases; 14 final representative mobile accessibility states with zero WCAG-tagged violations. Project verification passed 273 tests plus two preverify tests. Final build, 458-page whole-source preservation, 16 protected-original hashes and two repeat enhancement runs passed.

The all-route run preceded final contrast/focus/Founder markup and Open/Progress alignment corrections. Final representative checks cover the corrections; screenshots precede the very last Founder semantic/publication-opacity fix, which was rechecked in the final accessibility run. Three temporary sample navigation timeouts were not reproduced in the full run or final sample run; preserve `sample-before-final.json` rather than claiming they never occurred. `accessibility-before-fixes.json` retains the initial findings.

Final counts and unresolved findings belong in `PHASE-7-DESIGN-STATE.json` and the per-route coverage artifact. The full desktop/mobile audit captures every route and checks HTTP status, horizontal overflow, runtime errors and index targets. It is not human visual approval of every screenshot or every interaction.

Representative visual critique includes all 14 sampled families/top-level routes, with top/middle/bottom captures. Actual Safari and WebKit/no-JS checks are representative. Earlier failing/time-out reports are retained; isolated reruns must identify what they supersede rather than resetting the baseline. Accessibility sampling is not all-route WCAG certification.

Figma: existing shared definitions were read back from file `n3MbdBAC6STjHudQocaZa7`, node `147:170`. No new Phase 7 frames were created. The browser implementations have not been mirrored into 458 editable Figma screens. Existing non-self-hosted reading-font delivery and earlier performance risks remain part of release review.

No performance result, public claim, API key workflow, trading system or marketing action was independently validated or changed in this phase. No deployment. Reference-level visual parity and user approval remain unclaimed.

## Next gate

Phase 8 is the whole-site release candidate audit: current-build route behavior, cross-family journeys, Safari/responsive/keyboard/motion/failure states, font/media delivery, performance and remaining claims terminology. Ask permission before starting it.
