# Phase 8 — local release candidate

Approved 10 September 2026. This phase validates and repairs the built candidate; it is not deployment or user visual acceptance.

## Changes

- Fixed the reader contents panel changing height after mobile startup. It now starts closed in HTML on both widths, with native user-controlled expansion; JavaScript no longer closes it after paint.
- Registered the missing Inter body face locally with optional font display. The unmodified variable font and SIL license are bundled; see INTER-FONT-PROVENANCE.md. Other historical external font requests remain.
- Fixed low-contrast text found on 48 routes: the homepage strategy explanation/data, verdict labels on 46 research pages, and emphasized inline code on one note.
- Added a visible research execution-basis statement and evidence link. Running paper systems and model expectations must not be mistaken for funded execution or established forward returns. Original descriptions and artifact records remain intact.
- Fixed WebKit menu link activation after keyboard focus/Escape. WebKit can blur the summary to body on mousedown without focusing the anchor; the former focusout handler closed the disclosure before mouseup. Body focus is no longer mistaken for an outside focus destination. Outside-click, actual focus departure and Escape still close the menu.
- Disabled optional cross-document snapshot transitions after Chromium reported intermittent `Transition was skipped` page errors. The reduced-motion-only opt-out did not address the normal-motion failure. Native navigation now works in both modes; section, scroll and menu motion remain. `navigation: none` is the native opt-out described by [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40view-transition).

The accessibility skill informed the contrast, stable disclosure and keyboard fixes; the webapp-testing skill informed rendered-state inspection and cross-browser verification. No new Figma frames or generated imagery/video were created in this verification phase.

## Evidence and limits

Evidence is under `artifacts/qa/phase8-release/`; `summary.json` and `build-manifest.json` identify the checked candidate. Earlier failed reports are retained rather than overwritten with passing baselines.

| Check | Result and scope |
| --- | --- |
| Site routes | 489 routes; whole-body mobile axe WCAG-tagged checks and layout at 390/1440px. Four network-idle timeouts in the full final scan passed a targeted retry. No unresolved reported issues. |
| Project verification | 273 tests plus 2 preverify tests; writing, source-number, indexability and link checks pass. 505-page graph includes the 16 original documents; 14,337 internal links checked. Final build succeeds. |
| Preservation | 458 Phase 7 routes plus 16 original HTML artifacts, 21 Phase 6 hubs, 9 Phase 5 pages, and all 22 header/29 footer destinations pass existing baselines. Only explicitly marked additions are exempted; protected originals are hashed without normalization. |
| Cross-page navigation | Home → research → searched paper → verification → developers, at both widths in Chromium/WebKit: 4 reduced-motion and 4 normal-motion journeys. |
| Failure cases | 20 Chromium/WebKit checks across 5 route families with decorative media/fonts blocked, with and without JavaScript. Research keeps all 111 static library entries. |
| Existing workflows | 24 mocked developer/tool cases; 4 homepage control cases; 4 homepage fallback cases. No real key issuance or subscription. |
| Shared shell | 48 cases across 12 route families, 2 widths and 2 engines: keyboard entry, Escape/focus return, focus departure, outside click, active links, footer, layout and reduced motion. |
| Actual Safari | 6 representative desktop routes: menu, footer, focus restoration and layout. Escape is dispatched by the test; physical keyboard sequences are covered separately in Chromium/WebKit. |
| Visual inspection | Final strategy heading, research opening/basis, mobile paper and note captures inspected. This is representative inspection, not human review of every section on 489 pages. |

### Startup performance

Isolated runs avoided concurrent automated browsers. The initial 20 samples exposed a mobile paper CLS of 0.185; after the disclosure/font corrections, both corresponding paper samples measured 0.018. Across 20 post-fix samples, maximum session-window CLS was 0.048 and LCP 532ms.

Three mobile samples with 4× CPU slowdown, 150ms latency and 200,000 bytes/second download measured a maximum LCP of 992ms and CLS of 0.038. These clear the chosen local screening budgets of 2500ms and 0.1. Raw long-task/resource observations remain in the reports. These are startup lab observations, not field INP, smooth-scroll frame-rate guarantees or Lighthouse scores. The earlier Phase 3 outlier remains historical evidence; it is not retrospectively relabeled fixed by these samples.

All-route accessibility/layout and startup runs preceded the last focus-handling correction and cross-document transition opt-out. Final navigation, shell and Safari regressions follow those changes. No layout or typography changed after the all-route run.

### Service observations

A read-only GET to the existing deployed validation status endpoint returned reachable storage and available usage reporting; the app dashboard returned HTTP 200. This does not validate the redesigned candidate's hosted API integration. No login, real key request or backend mutation was performed.

## Next approval gate

Local release checks are complete. Do not call the entire website production-certified or visually approved. Request permission for a preview deployment and hosted validation; do not replace production automatically.

Hosted work must check redirects, cache/security headers, asset delivery, serverless routing and environment integration. Real key issuance or email delivery needs an explicitly agreed test. User visual review in Safari, representative assistive-technology testing and real-device/field performance remain distinct acceptance work. Marketing is not part of this phase.
