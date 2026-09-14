# Phase 10 — isolated preview backend

Approved by the user after Phase 9, including the named organization and a $0 additional monthly budget. Implementation and read-only verification are complete; see PHASE-10-REVIEW.md. The initial investigation below is retained as historical context, not current status.

## Verified state

- Supabase CLI authentication works. There is no Supabase management tool exposed in this session and no management token in the shell environment; the CLI's existing authentication was used without printing credentials.
- The CLI exposes one organization, `arhancanli's Org` (`zhtvcnjwjqntugkaxbuh`). Its three visible projects are inactive and unrelated to Canli. None has been reactivated or repurposed.
- No existing Canli preview backend was found in that account. The production project reference documented in the historical migration is not among the visible projects. This does not prove that production is unavailable; it is an account-access distinction.
- Billing tier, available free allocation and incremental cost are not verified. Do not create a potentially paid resource without an agreed spending limit.

## Bounded implementation after confirmation

1. Confirm the intended organization and current cost before creating a new, empty `canlicapital-preview` project. Do not clone production data or retrieve production service credentials.
2. Apply the validation schema in dependency order: base validation API; key-source extension; usage-summary function; usage-summary v2. Verify permissions for the service role and denial for anonymous/authenticated clients. Do not blindly use the duplicate date prefixes as migration versions.
3. Prepare the waitlist table with RLS and restricted access if signup storage is included: configuring the shared Supabase variables switches the existing waitlist handler to database persistence. No signup or email tests are authorized merely by provisioning.
4. Generate new preview-only server secrets, including `API_CLIENT_SALT`. Scope Vercel variables to this preview branch, not production or unrelated previews. Never print secret values, put them on command lines, or add them to the upload manifest.
5. Address the hard-coded production receipt URL in `api/_lib/handler.js` before calling the preview isolated end-to-end. Use trusted server configuration for preview receipt links; do not trust arbitrary request Host headers. Keep production behavior unchanged and add regression tests.
6. Deploy a new preview and verify read-only health, empty isolated data and front-end regression behavior. Controlled key issuance, validation writes or email delivery require the separately agreed test scope; do not use a smoke script that creates keys without that approval.

## Resolved approval and implementation

The user approved `arhancanli's Org` and accepted the explicitly stated $0 default. The management API confirmed this organization is on the Free plan; a new Nano project was created there without upgrading the organization or changing existing projects. Safari was signed into a different organization; its plan was not used as evidence for the approved target.

Branch-specific Vercel variables were rejected because the existing project has no Git integration. Instead, the new credentials were supplied only to the new preview deployment's runtime environment. No project-wide preview variables or Git integration were added. Read-only health, database permissions, empty-store and representative browser checks passed. Controlled key/validation/signup writes and email tests still need separate approval.
