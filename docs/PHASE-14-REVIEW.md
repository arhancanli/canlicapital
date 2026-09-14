# Phase 14 — isolated hosted preview and Figma handoff status

10 September 2026. Approved preview work; production promotion excluded.

## Preview delivered

https://meridian-c45jtfc8c-arhans-projects-ac470eaa.vercel.app

Deployment `dpl_DDcnkejsBofmiEnF5K8YYDMHHah4`, Vercel project `meridian`, target **preview**, status **Ready**. This deployment contains the Phase 13 corrections; the previous hosted preview does not.

The existing isolated Supabase project `gdqrwikuqzxioxhequtc` is reused. Runtime credentials were supplied through the child process environment, scoped only to this deployment. The existing identity guards passed; the local private configuration remains ignored with permissions 0600. No project-wide environment variables, Git push, production aliases or production credentials were changed.

The deployment skill guided preview target checks and publication; the approved hosted verification extends beyond its usual link-only handoff. Browser-testing guidance informed the read-only hosted regression. The deploy helper now accepts a guarded evidence directory so this phase does not overwrite Phase 10 deployment records.

## Hosted verification

All evidence in this section is against the new URL, not localhost.

| Check | Result |
| --- | --- |
| Targeted browser cases | 30 passed: Chromium/WebKit, desktop/mobile, six routes, count correction, command copy, immediate research result activation and injected poster failures |
| Normal-motion journeys | Four passed: home → research search → paper → verification → developers, both engines and widths |
| Actual macOS Safari | Six routes passed: navigation, menu, focus, footer and no horizontal overflow. Escape is dispatched by the harness, not a physical keypress |
| Desktop text contrast | Zero detected main-content violations on Systems, Research, Performance, Founder and Progress in Chromium |
| Read-only API checks | Five passed: health, method guards for key/waitlist endpoints, unknown receipt and badge rejection |
| Bounded startup traces | Four hosted Chromium desktop samples: layout-shift sums 0, 0.00148835, 0 and 0; last sample delayed font responses by 200 ms |
| All-route HTTP audit | 488 of 489 passed initially; one TLS handshake timeout passed a single bounded recheck with HTTP 200 and expected headers |
| Additional HTTP/asset checks | All 31 passed, including redirects, preview headers, font/bundle byte integrity and 16 preserved original publication documents |

API health reports `store_reachable: true` and `usage_available: true`. Existing synthetic usage is nonzero from the approved Phase 11 integration; this phase did not issue keys, validate payloads, write receipts, submit signups or send emails. Browser mutation requests are blocked in the Playwright journey/targeted harnesses; Safari tests only navigation and shell controls.

The initial all-route command exited with an assertion failure because its saved first-pass result includes the TLS timeout for `/trials/abc2f98882a8cb5d`. That evidence was not overwritten. `http/route-rechecks.json` records the one successful follow-up, and `summary.json` verifies the combined coverage. No application fix or redeployment was needed for the timeout; its root cause is not established beyond the reported handshake failure.

Representative hosted screenshots were inspected, including the corrected Founder commitment text and mobile command-copy surface. Automated passes are not a new claim that all pages have undergone individual visual review, exhaustive accessibility certification, or that the reference site's design has been matched exactly. Phase 13's local build and 279-test verification remain separately documented.

## Figma remains blocked

The mandatory `figma-use` reference `skill://figma/figma-use/references/gotchas.md` was retried once. Its returned text is 46,354 characters and contains a literal “1,791 tokens truncated” gap. No paginated reader or `get_figma_skill` tool is exposed. Reading the returned string in smaller pieces cannot recover text absent from the response.

No Figma canvas edits were attempted. This is a required instruction-resource failure, not evidence that authentication or the paid plan failed. Editable Figma synchronization remains incomplete; the phase is not wholly complete while that deliverable is blocked. A complete resource response or accessible local copy of the mandatory skill is needed to resume that workflow safely.

## Approval boundary

Review this preview in Safari before approving production promotion. No production deployment, marketing work, purchase or new integration test records are authorized by this phase. The earlier startup performance outlier and user visual acceptance remain open; neither is resolved by passing hosted routing checks.
