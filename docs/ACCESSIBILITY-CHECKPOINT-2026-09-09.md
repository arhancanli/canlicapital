# Accessibility regression checkpoint

The preceding research-archive turn made concrete progress. This checkpoint tested the built site rather than inferring quality from source changes.

## Fixes

- The new cobalt developer closing section inherited dark text on a bold phrase. Axe measured 1.75:1 contrast. Strong and code text now inherit the intended white treatment.
- Shared skip links now use explicit offscreen positioning rather than translated boxes that could leave a border sliver visible. Focus restores them immediately. Both developer and research keyboard entry points are exercised in the new audit.

## Verified evidence

- `artifacts/qa/cinematic-accessibility/report.json`: 14 default views across seven representative routes and two widths, zero automated WCAG violation groups after the contrast fix.
- `artifacts/qa/interactive-accessibility/report.json`: four additional views, with alternate developer language panels selected and the research corpus filtered; zero automated violation groups, skip-link focus assertions passed.
- `artifacts/qa/accessibility-safari/report.json`: actual Safari homepage media, sequence advancement, curve switching, FAQ and evidence deep-link checks passed; developers, systems, research and performance loaded without horizontal overflow.
- Production build and `npm run verify` passed. The latter covered the existing tests and 505-page link, indexability and published-number audits.

The accessibility and webapp-testing skills informed the targeted states and focus checks. These automated results are not a screen-reader certification, complete WCAG conformance claim, visual-parity judgment or production-release approval.

## Next substantive design gap

The active goal still requires complete desktop/mobile Figma compositions and closer chronological comparison of the homepage against the reference. Existing three scene studies do not fulfill that requirement. Developer and research refinements are implemented but not separately authored as complete Figma designs. Do not repeat connection verification or count these passing audits as completion of those design deliverables.
