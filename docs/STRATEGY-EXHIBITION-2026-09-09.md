# Strategy exhibition checkpoint

Compared saved United Carriers desktop contact sheets 01 and 02 against fresh built-preview strategy, record, developer and research captures. The reference moves a persistent subject through full-scene environments; the current strategy register was a two-by-two card grid. This was a concrete compositional mismatch, not a test failure.

The desktop strategy register now uses four full-width stages, original optical layers and distinct lighting backgrounds. All original strategy text, execution labels, target weights and bound observations remain in their original nodes. There are explicit navigation buttons and reading holds; scrolling is not intercepted or snapped. Mobile, short viewports and reduced motion retain the original readable register.

The frontend-design skill guided the compositional change. The GSAP ScrollTrigger skill guided pinning, refresh and responsive cleanup. A first-pass navigation highlight drift after refresh was corrected by reading the rendered track position instead of maintaining a separate state tween.

Verification: production build passed; 489-page preservation check reported no failures. `scripts/audit-strategy-exhibition.py` passed in Chromium and WebKit for all four stages, reverse navigation, reduced-motion teardown and mobile fallback. Screenshots and results are in `artifacts/qa/strategy-exhibition`.

Remaining limitation: this is a full-scene presentation of the strategy register, not yet the reference's level of spatial environmental storytelling. The scenes reuse original layers and lighting gradients rather than four bespoke rendered environments. This change is not yet represented in the existing Figma desktop or mobile composition. Full goal completion remains unproven.
