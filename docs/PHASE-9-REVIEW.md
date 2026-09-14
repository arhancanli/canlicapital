# Phase 9 — hosted preview, with an API setup blocker

10 September 2026. Preview deployment and read-only hosted validation were approved. No production promotion, Git push, backend credential changes, key issuance or subscription submission was performed.

Preview: https://meridian-f3xjbosh7-arhans-projects-ac470eaa.vercel.app

Deployment: `dpl_AjbtGrNihgt6JKW4TdHZh6R5zGDc`, project `meridian`, team `arhans-projects-ac470eaa`. Vercel inspection confirmed **Ready**, target **preview**, with serverless functions built. The production domain still resolves to a separate production deployment, `dpl_9uBVpnAjFHdf6UoUNQWgV3MSPf2m`, at the final inspection. This preview was not promoted; other actors' production activity is outside this audit.

## Packaging corrections

- The Phase 7/8 build generators read `artifacts/qa/redesign-scope/inventory.json`, previously excluded from Vercel uploads. Added a narrow exception for that inventory; other QA output stays excluded.
- Explicitly excluded environment files, agent state/database, Git/local Vercel state, node_modules and unused render/reference/tooling assets. Public shipping imagery, films, evidence and original documents remain included.
- The first unarchived upload failed (`fetch failed`, `Upload aborted`) without returning a preview URL. The revised dry-run manifest had 2,555 files / 126,402,791 bytes; the archived retry uploaded 47.1 MB successfully.
- Vercel CLI authentication and the single team were verified. Repository linking found no Git-integrated project; linked this workspace to the existing project identified by its production URL and used a direct preview upload. No new project or Git integration was created. Linking generated an ignored local environment file, which was excluded from uploads.

The deployment skill guided target resolution and preview-only publication. The browser-testing skill guided the hosted journeys. Firecrawl QA could not run because the CLI/credential were unavailable in this shell; Python browser and HTTP checks provided the fallback. The user's approved hosted-validation request includes fetching the preview, beyond the deployment skill's usual link-only handoff.

## Results

| Check | Observed result |
| --- | --- |
| All 489 source routes | HTTP 200, HTML delivery, nosniff and preview noindex headers |
| Canonical redirects | `/developers.html` → `/developers` and `/research/` → `/research`, HTTP 308 |
| Missing route | Genuine HTTP 404, not a homepage fallback |
| Static API discovery | Status, chain head and OpenAPI endpoints return HTTP 200 |
| Sitemap / robots | Both return HTTP 200 |
| Local Inter + 5 homepage JS/CSS assets | HTTP 200, immutable caching and SHA-256 match against local files |
| 16 original publication documents | Expected `.html` → clean-URL redirects, followed by byte-for-byte matches with local protected originals |
| Chromium/WebKit navigation | 8 complete home → research search → paper → verify → developers journeys across 2 widths and normal/reduced motion |
| Media/font failure handling | 20 hosted cases across 5 routes, 2 engines, JavaScript on/off |
| Actual macOS Safari | 6 representative hosted route checks pass; menu/footer/focus and layout. Escape is dispatched by the harness, not a physical-keyboard Safari test |
| Dynamic validation health | **FAIL: HTTP 500, missing preview backend configuration** |

Of 31 additional HTTP checks, 30 pass and one remains blocked. Full-page HTTP headers include the configured CSP, Permissions-Policy, Referrer-Policy, nosniff and frame denial. These checks are not a penetration test or full CSP hardening assessment.

Evidence: `artifacts/qa/phase9-preview/`. `routes.json` covers hosted HEAD checks, not renewed all-route visual/accessibility testing. `http-checks-corrected.json` validates original documents after following the intentional clean-URL redirect. The initial `http-checks.json` is retained: its original-document failures were a harness expectation error (requiring 200 directly on `.html`), not broken site routes. Browser reports and screenshots identify the exact hosted origin.

## Confirmed blocker and reproduction

1. GET the preview's `/api/v1/validate/status` endpoint.
2. It returns HTTP 500 / `FUNCTION_INVOCATION_FAILED`, not a healthy validation-service response.
3. Vercel reports no variables configured for the preview environment.
4. This deployment's runtime logs identify the cause: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required by `defaultStore()`.

Do not infer that the production API is broken from this preview failure. Do not copy production credentials or enable production-backed writes merely to obtain a passing preview check. No secrets were fetched from production and no environment variables were added.

Full API/signup integration needs an agreed preview backend and, separately, permission for controlled key/email tests. Email delivery was not tested. An isolated backend may require new service resources and is the next approval gate. The site is available for visual review now, but this phase is not a complete production sign-off.

## Security follow-up

A process diagnostic unexpectedly included an Anthropic API credential in tool output. The value is not reproduced in project documentation or reports, and was not used for this task. The user was notified to rotate that credential. No unauthorized rotation or broader credential changes were made.
