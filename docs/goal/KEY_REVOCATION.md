# API key revocation release candidate

Implementation is on PR15. No production migration or activation has been performed.
Apply `supabase/migrations/20260920_key_revocation.sql` to the intended database
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
