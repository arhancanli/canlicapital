# Phase 10 — isolated free preview backend

10 September 2026. The user approved the organization and accepted the stated $0 additional monthly budget. This phase is complete for provisioning and read-only verification; controlled integration writes and production promotion remain separate.

## Delivered

- New empty Supabase project `canlicapital-preview`, reference `gdqrwikuqzxioxhequtc`, in approved organization `zhtvcnjwjqntugkaxbuh` (`arhancanli's Org`). Region `us-east-1`, Nano compute, organization plan verified as `free` through the management API immediately before creation and during the subsequent checks.
- Four existing validation-schema migrations applied transactionally in dependency order, plus an isolated waitlist table. Nothing was cloned from production, and no unrelated project was reactivated or modified.
- Fresh project service credentials and client-hashing salt supplied only to the new Vercel preview deployment. Production secrets were not retrieved, reused or changed.
- Preview receipt URLs, badge URLs and embed links now resolve to the trusted server-provided Vercel deployment host. Production/local behavior remains unchanged. Request Host headers cannot choose the receipt origin; invalid preview configuration fails rather than falling back to production.

New preview: https://meridian-a8gj4f0mf-arhans-projects-ac470eaa.vercel.app

Deployment `dpl_BX9YJSUBaz4syPnwdcxhqxADJijp`, target `preview`, Vercel status **Ready**. The old Phase 9 preview is not retroactively reconfigured; use this new URL. No production alias was assigned and no Git push occurred.

## Isolation and configuration decisions

Safari and the CLI were authenticated to different Supabase organizations. Read-only management API inspection confirmed the plan of the approved CLI organization, so no organization switch was needed.

Vercel rejected branch-scoped variables with “Project meridian does not have a connected Git repository.” Metadata checks confirmed no variables were created. Instead of connecting Git or widening the scope to every preview, the deployment used the CLI's per-deployment runtime variables. The installed CLI workflow was checked against its source: `--env NAME` reads that named value from the child process environment. Credentials were not passed as command-line values. See [Vercel runtime deployment variables](https://vercel.com/docs/cli/deploy#env).

The deployment skill guided target verification and preview-only publication; the browser-testing skill guided the read-only navigation regression. The user's requested hosted checks extend beyond the deployment skill's normal link-only handoff.

Generated secrets are retained only in ignored local `.vercel/phase10-private.json`, created with mode 0600. Vercel's upload dry run confirmed `.vercel/` and environment files are excluded. Do not copy this file into reports or source control. Project-level preview environment listing still reports no variables: the credentials belong to this deployment only. Future preview deployment must explicitly supply them, as `scripts/phase10-deploy.mjs` does; an ordinary deploy does not automatically inherit them.

## Verification

| Check | Result |
| --- | --- |
| Database tables | All 5 have RLS enabled; anonymous and authenticated SELECT privileges denied |
| Database RPCs | All 3 permit service-role execution and deny anonymous/authenticated execution |
| Empty-store check | 0 API keys, 0 receipts, 0 waitlist entries |
| API health | HTTP 200, `store_reachable: true`, `usage_available: true`, zero key/validation totals |
| Hosted read-only checks | 8 pass: 3 pages, health, GET method rejection for keys/waitlist, unknown receipt and badge 404s |
| Receipt-origin regression | 4 new tests, including mocked validator → receipt/badge URLs and hostile Host headers |
| Project verification | 273 tests plus 6 preverify tests pass; build succeeds |
| Original preservation | 458 reader routes and 16 original publication documents pass existing preservation checks |
| Hosted browser journeys | 4 normal-motion Chromium/WebKit journeys across desktop/mobile pass |
| Actual Safari | 6 representative route checks pass; Escape is dispatched by the harness, not a physical keyboard test |

Evidence lives under `artifacts/qa/phase10-backend/`: deployment metadata, database permission/count checks, hosted HTTP results, browser journeys and Safari captures. No blanket new 489-page visual/a11y audit is claimed for this backend-only phase; Phase 9's all-route coverage is separate.

## Cost and limits

The approved project remained on the Free plan at final inspection; no paid plan, add-on or compute upgrade was purchased. Supabase currently lists Free as $0 with two active projects, 500 MB database storage and inactivity pausing after one week. This is suitable for a bounded preview, not an always-on production uptime promise. See [Supabase Free-plan limits](https://supabase.com/pricing).

No API keys were issued, no validation receipts were written, no signups were submitted and no emails were sent. Receipt routing was tested with mocked storage; actual persisted receipt round trips remain for an approved controlled integration test. Backend provisioning alone is not proof of every form's happy path or production readiness.

## Next approval

Run controlled key issuance, validation/receipt and signup-storage tests against this isolated preview only, with synthetic data and no email delivery. Do not promote production or start marketing without their separate approvals.
