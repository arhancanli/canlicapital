# Phase 9 — preview deployment and hosted validation

Approved by the user after Phase 8. Production deployment is not authorized.

1. Resolve the existing Vercel team/project and authentication without changing production settings or Git integration.
2. Verify upload inputs, excluding credentials, agent databases, QA captures and local render sources while retaining the build-time route inventory.
3. Deploy a preview only; inspect the actual build state, not merely the CLI's upload-success message.
4. Perform the requested read-only hosted routing, headers, assets, public API and representative browser checks. Do not issue keys, submit subscriptions, send email or trade.
5. Record observed results and any protection/integration blockers. Request separate approval before production promotion or other expansion.

Resolved target: team `arhans-projects-ac470eaa`, project `meridian` (`prj_8Tz8L3XtQvz2iW3h86o8DASbIUb2`), whose existing production URL is `https://canlicapital.com`. The app dashboard is a different project and is not a deployment target. Repository matching returned no linked Git projects; local linking to the verified existing project and direct CLI preview deployment are used without Git pushes or automatic-deployment changes.

The first unarchived upload failed with `fetch failed`/`Upload aborted`; no preview URL was returned. After excluding unused authoring assets, Vercel's dry run identified 2,555 files / 126,402,791 bytes, with the required inventory included and private paths excluded. The archived retry uploaded 47.1 MB and returned preview deployment `dpl_AjbtGrNihgt6JKW4TdHZh6R5zGDc`; build and hosted checks remain separate from upload success.

QA fallback: Firecrawl CLI/credential are unavailable in the current shell. Use the established Python browser harness and read-only HTTP checks. Do not infer full accessibility conformance or real-device performance from these tests.
