# Phase 8: release candidate audit

Approved 10 September 2026. Scope: verify the current built site and fix confirmed defects. No deployment, real key issuance, subscriptions, trading or marketing.

1. Measure isolated startup performance and font/media requests before running concurrent audits. Retain every sample; local lab timing is not field performance.
2. Audit all 489 site routes on the same build for accessibility, rendering and source preservation. Protect 16 original publication artifacts; do not modify their bytes.
3. Exercise cross-family navigation, keyboard/menu behavior, narrow/mobile layout, reduced/normal motion, no-JS and blocked decorative assets; use actual Safari and WebKit as well as Chromium.
4. Fix demonstrated issues at their source/shared generator. Record evidence terminology or deployment integration gaps explicitly, not as silently passed tests.
5. Run project verification, then final build, preservation, regression checks and a release report. Keep laboratory coverage, user visual approval, hosted integration and deployment as separate statuses.

Performance screening budgets for this local investigation: startup LCP 2500 ms and session-window CLS 0.1. Record long tasks and resource volume descriptively; do not mislabel scripted interactions as field INP or these measurements as Lighthouse scores. Investigate violations rather than deleting inconvenient samples.
