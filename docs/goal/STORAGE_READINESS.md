# Storage readiness

Status: runtime upload plan verified locally; no objects uploaded, bucket created,
remote settings changed or production release activated.

## Verified runtime bundle

Release `3f7a621bdb49d3131219daba07c9f7a842b26ba959f5c84dac2349d14b6e9cd6` requires
3,927 reachable objects totaling 505,062,941 bytes (about 482 MiB). This includes
catalog records/indexes, original/selected downloads, the immutable release object,
and archived cohort manifests/indexes. Unreferenced objects are excluded.

Summary: `artifacts/seo/company-combined-storage-plan-summary.json` binds the
complete local plan by SHA-256. The full plan remains ignored at
`artifacts/seo/corpus-local/company-combined-storage-plan.json`; it lists local
paths, destination keys, sizes, hashes and MIME/cache metadata.

```sh
node scripts/prepare-company-storage.mjs artifacts/seo/corpus-local/company-combined-catalog-extended artifacts/seo/corpus-local/company-combined-delivery-extended artifacts/seo/corpus-local/company-combined-storage-plan.json
```

Planning replays sources against selected records and catalog, verifies both
current and archived download mappings, validates release counts and hashes, and
rejects missing/corrupt evidence. It does not write release pointers or use network
access. Three regression tests cover reachable-only collection, provenance,
gzip integrity, altered release pointers, missing archives and corruption.

## Destination and activation requirements

- An existing approved bucket/object prefix with fixed HTTPS `catalog/` and
  `delivery/` bases. Access details are pending from the owner.
- Immutable SHA-addressed keys: no blind overwrite. Verify existing objects and
  uploaded bytes against their declared hashes before reusing them.
- Gzip source snapshots must be served as `application/gzip` without a
  `Content-Encoding` transformation; downloads bind the compressed bytes.
- Set no production environment variables from this preparation step. A hosted
  preview must exercise byte retrieval, HTML/assets/source links and genuine
  404/503 behavior before a separate production decision.
- All staged HTML remains noindex. Editorial flags and search measurement remain
  separate work; storage availability does not approve pages for indexing.

## Access inspection — 2026-09-20

Vercel project `meridian` is linked under the existing owner team. Its environment
listing shows production-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY entries.
A read-only temporary export produced nonempty strings, but parsing did not yield
a usable HTTPS Supabase project URL. Nonempty is not proof of valid credentials.
No bucket request was sent. Temporary exports were deleted without printing values.
This does not establish that the deployed application lacks valid configuration.
Asked the owner for the intended bucket/project and local credential location.

## Separate evidence backup requirement

This runtime plan is NOT a full capture backup. Original acquisition queues,
refresh reports, per-capture receipts and excluded-response bodies remain in the
ignored capture directories and require their own verified retention/upload plan.
The runtime manifest preserves exclusion metadata but does not contain every
excluded response body. Do not claim disaster recovery or independent acquisition
replay is available from the runtime bucket alone. Preserve local captures until
that separate backup is verified.
