# Developer workbench revision

The developer page now uses sequential, full-width quickstart rows and nine progressively enhanced example groups. Each group exposes one language at a time through native buttons with tab semantics, arrow navigation, Home and End. Original code nodes remain intact for key substitution and no-JavaScript reading. The MCP assistant configuration group retains its own original labels rather than being relabeled as programming languages.

Art direction follows the existing Figma typography and black, paper and cobalt palette. The frontend-design skill informed the decision to treat this page as a working API reference: usable code and a clear sequence take precedence over decorative motion. This revision did not add new Figma frames.

## Verification

- Production build passed.
- Six developer browser regressions passed, including mocked key issuance, busy/error states, keyboard language selection and no-JavaScript code scrolling. No real key was issued.
- Content preservation: 489 pages, zero failures.
- Built-preview Chromium at 1440 × 1000 and WebKit at 390 × 844: nine enhanced groups, expected display rules, no horizontal document overflow. Screenshots inspected at `/tmp/canli-workbench-chromium.png` and `/tmp/canli-workbench-webkit.png`.
- Actual Safari WebDriver: Python selection displayed exactly one panel, selected state correct, no horizontal document overflow.

## Remaining boundary

These are targeted checks, not a fresh whole-site accessibility/performance audit. The new workbench has not been separately recreated in Figma. The full-site cinematic redesign goal remains active; no production deployment or claim of reference parity is made.
