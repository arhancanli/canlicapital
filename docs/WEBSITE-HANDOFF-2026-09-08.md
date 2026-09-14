# Website redesign handoff

Historical handoff for the earlier iteration. The current cinematic release
candidate and its verification/release gates are documented in
[RELEASE-CANDIDATE-2026-09-09.md](RELEASE-CANDIDATE-2026-09-09.md).

Local preview: http://127.0.0.1:4187/

Production-build preview: http://127.0.0.1:4188/ (frontend only, not a deployment).

Working directory: `/Users/arhancanli/canlicapital-website-20260908`.
Branch: `design/glassbox-website-20260908`.

This checkout started from `ab8ee5e3` and includes a snapshot of the existing unpublished work from `meridian`. The original checkout and its automated publication process were not changed. No production deployment, external post, outreach message or paid campaign was performed.

## Authored changes

- `index.html`: strategy-first homepage, preserved data IDs and full evidence sections, new developer chapter, clearer primary actions, reordered content.
- `css/glassbox-home.css`: cinematic opening, large typography, paper strategy section, responsive layouts and reduced-motion handling.
- `scripts/build-glassbox-hero.mjs`: generates a lightweight static SVG from published paper curves. Shared date range; each curve normalized to its own first observation; transparent planes have a horizontal time axis so perspective does not manufacture an upward trend.
- `js/glassbox-home.js`: original scroll-driven canvas cutaway using the four published paper curves. One object opens through research, observation and publication chapters. Shared date/return scales and a horizontal time axis prevent camera rotation from manufacturing a trend. Rendering runs on input, not an idle animation loop; no additional rendering dependency.
- `css/engine-journey.css`: continuous sticky desktop stage, uppercase opening, unpinned mobile/reduced-motion fallback, section contrast and native FAQ styling.
- `index.html` cinematic revision: three linked process chapters, a direct strategy bypass and four native keyboard-operable FAQ disclosures. Existing IDs, evidence sections, API routes and research links remain intact.
- `package.json`: regenerates the illustration during the existing build.
- `scripts/product-shell.mjs` and `css/product-shell.css`: simplified primary navigation, all core routes retained in the menu, shared visual identity and reduced-motion-aware page transitions.
- `scripts/build-standards-and-developers.mjs` and `css/developers.css`: developer introduction explains the task and links directly to key issuance; keeps references and limitations.
- Existing browser audits updated for the intended new layout and menu hierarchy. Source-bound claims and API tests retained.
- `scripts/audit-engine-journey.py`: seven browser configurations plus unavailable-snapshot fallback; checks scroll rendering, sticky stage placement, overflow, keyboard FAQ and changing motion preference. Screenshots and report: `artifacts/qa/engine-journey/`.
- `scripts/audit-writing.mjs`: excludes only `artifacts/reference/` from product-copy scanning. Captured third-party HTML is research evidence, not a published Canli page; the zero-em-dash product-copy ceiling is unchanged.
- `DESIGN.md`: design rationale and captured reference.
- `docs/ACQUISITION-PLAN-2026-09-08.md`: audience priorities, full channel map, first-month experiments, measurement definitions and launch/outreach drafts.

The prebuild regenerates many HTML pages from source. Review generator changes before their output. Existing unpublished evidence snapshots were copied to preserve current work; they should not be interpreted as newly authored research or promoted wholesale over a newer publication. When integrating, apply the authored source changes to the current publishing checkout and regenerate using its current evidence.

## Validation

- Production build passed.
- Full `npm run verify` passed, including 268 tests.
- 505 pages and 14,236 internal links checked; 263 indexable URLs in the sitemap; no indexability conflicts.
- Published-number audit passed across all 505 pages.
- Homepage Chromium audit passed for desktop, mobile and reduced motion: hydrated claims match static content, curve switching works, no page errors, no horizontal overflow, keyboard focus present.
- Shared-shell Chromium audit passed for 42 desktop/mobile views across 21 representative routes.
- API key browser tests use controlled responses to check success, copying, busy states and errors. The production status endpoint was inspected read-only and reported a reachable store. No production key was issued during this work.

## Preview and operating limits

The local preview serves the frontend and the captured public artifacts. Vite does not run the Vercel API functions, so live key issuance requires the deployed application or a configured serverless development environment. Do not add production credentials to the browser or proxy writes merely to make a visual preview look complete.

The static hero is generated at build time; the enhanced desktop cutaway loads `/paper-state.json` once and renders that dated snapshot. Neither is an independently streaming feed. Failed fetches retain the SVG. The existing publication process regenerates the fallback through prebuild once these changes are integrated. The dashboard remains the existing external application.

The frontend-design skill informed the persistent cutaway and asymmetric chapter layout. The webapp-testing skill informed rendered-browser checks and screenshot review. This is an original lightweight interpretation of the reference's continuity, not a replica of its pre-rendered industrial machinery or full WebGL production pipeline. No claim of universal perfection, audited investment performance, measured Core Web Vitals, or real-device coverage is made.

Screenshots are in `artifacts/qa/advisor-homepage/redesign-*.png`. The two existing audit report files contain detailed browser results. Marketing drafts remain ready for review; sending them is a separate external action.
