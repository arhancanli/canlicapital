# Research archive revision

The research corpus now has its own optical-art masthead, using the existing original `optical-archive-v1.webp` artwork. The inherited narrow heading wrapper was removed after screenshot review. Document titles and summaries use a two-column editorial layout on desktop and a readable stacked layout on mobile. Mobile descriptions are no longer hidden.

Search matches all entered words against titles and descriptions. It preserves every original document node and link, reports result counts, provides an explicit empty state, and restores keyboard focus when cleared. It makes no network requests and sends no search text to a service.

Verified against the built preview: 111 rendered documents matched the source index; matching and empty searches, clearing and focus restoration passed in Chromium desktop and WebKit mobile. Actual Safari found 12 carry-related documents out of 111 without document overflow. The production build passed and the 489-page preservation check reported zero failures. The final width correction was followed by another build and archive browser audit.

Evidence: `artifacts/qa/research-archive/report.json` and sibling screenshots. This is targeted research-page work, not proof of complete visual parity, full-site accessibility, or production deployment. No Figma frames were modified during this revision. The full redesign goal remains active.
