# API key revocation release candidate

Implementation from PR15 is merged. On September20 the exact migration was applied
to production project bpnensyowfmdwhqmfdrg and its database behavior verified.
Receipt: artifacts/platform/production-key-revocation-20260920.json. The public
revocation route is live at application revision9608542c; staged and live-domain
disposable-key lifecycle checks pass.
For another environment, apply `supabase/migrations/20260920_key_revocation.sql`
before deploying the matching API and documentation, after normal release review.
It depends on the existing validation API tables and quota function. Do not infer
migration status from this document or an HTTP status endpoint.

`POST /api/v1/keys/revoke` revokes only the key in the Authorization bearer header.
The body is absent or an empty JSON object, with a 1024-byte limit. The endpoint
stores only the key hash, consumes no validation quota, and returns no key.
Repeated calls preserve the original revocation timestamp. Unknown keys return
401. Storage errors or malformed storage results return 503; clients must not
assume revocation succeeded after an uncertain response. A later repeated request
can establish the resulting state. There is no automatic retry or atomic rotation.

Both quota admission and revocation lock the same key row. Requests already
admitted may finish and save receipts; later admissions are denied. Public receipts
are retained. Revocation is irreversible through this API. Replacement issuance
is separate and subject to the existing issuance quota. Only the backend service
role can execute the revocation RPC directly.

Verification includes handler/body/storage tests, generated OpenAPI and developer
examples, and a disposable PostgreSQL16 CI job. The database test covers exhausted
keys, repeat calls, retained receipts and role permissions. A concurrent test holds
a revocation transaction open, starts a quota admission behind it, then verifies
that admission returns unauthorized without charging usage. No production key is
used. The developer quickstart only invokes validation routes; the revocation
example requires an explicit separate action.

Release verification must record the actual migration and deployed revision, then
use a disposable synthetic key to check issue, validate, revoke, repeated revoke
and rejection of a later validation. Do not use an owner's existing key. Keep the
successful migration if application deployment is rolled back: removing row locks
would restore the race. Never clear revoked_at as a rollback step.

## Deployment coordination — September20 release review

The running publisher reads
`/Users/arhancanli/alphaforge/config/site_landing_design_source.txt`, currently
pointing at `/Users/arhancanli/canlicapital-production-20260920` (revision9608542c). Both nightly
`live_publish.sh` and change-gated `live_deploy_hourly.sh` use the site snapshot
helper. The hourly path runs downstream of the minute25 live tick.

A manual deployment alone would be replaced by a later refresh of the old site.
After database identity, migration and hosted API checks pass, roll out the
approved website revision through that source selection as part of publication.
Use a dedicated clean release checkout and the reviewed snapshot helper. Preserve
the fresh public evidence overlay and the publisher's existing gates. Do not
reset the dirty running engine or change the trading loop to deploy the website.
The source-selection file and reviewed helper were updated under the shared
deployment lock after successful promotion. The previous pointer and helper
are backed up in /tmp/canli-publisher-before-20260920; exact hashes and receipts
are in artifacts/platform/production-activation-9608542c.json. Rollback must
coordinate the source pointer as well as domain promotion and retain the migration.
