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

## Completed-cohort archive and restore — 2026-09-20

Local archive: `artifacts/seo/corpus-local/completed-evidence-20260920.tar`.
It contains7,843 files and is1,034,352,640 bytes. Its SHA-256 is
`22ef0f561462ef620aa277a4b8ec2050ca3ef6efd02a611677724dc59db49bfd`.
The tracked summary is `artifacts/seo/company-completed-evidence-archive-summary.json`;
restore results are `artifacts/seo/company-completed-evidence-restore.json`.

Included: verified runtime objects and local release pointers; every file in the
completed fresh-review and next-1000 acquisition directories, including queues,
refresh reports, per-capture receipts and excluded HTTP bodies; editorial filing
captures/receipts; and a repository snapshot at a2e557f3. The packager itself is
included with its manifest hash. The active third cohort is excluded. This is a
company-source/replay package, not a backup of all owner projects, runtime trading
state, private credentials or every historical experiment.

The outer manifest binds each regular file by path, length and SHA-256. Verification
rejects missing or extra members, corruption, links and path traversal. Archive
creation and restoration refuse existing outputs. An interrupted operation may leave
a partial output; inspect it and use a new destination rather than overwriting it.
Before trusting a received archive, compare its whole-file hash to the separately
retained tracked summary. A self-contained hash manifest alone proves no origin.

A separate temporary restore passed both capture replays:342 eligible records in
the first queue,853 plus147 reproduced exclusions in the second, zero errors.
Runtime planning from the restored repository and objects reproduced all3,927 keys,
hashes and lengths, all counts and the exact release/catalog/download roots.
The restored workspace was removed after verification; the archive remains local.
Nine Python corpus/archive tests pass, including corrupt-member, link, traversal
and overwrite regressions. This verifies portability, not off-device durability.

```sh
# Compare this result with the independently retained summary first.
shasum -a 256 artifacts/seo/corpus-local/completed-evidence-20260920.tar
python3 scripts/package_company_evidence.py verify artifacts/seo/corpus-local/completed-evidence-20260920.tar
# Destination must not already exist. Replace it with a chosen temporary location.
python3 scripts/package_company_evidence.py restore artifacts/seo/corpus-local/completed-evidence-20260920.tar --destination /tmp/canli-restored-evidence
# Extract the verified repository snapshot into the restored workspace.
tar -xf /tmp/canli-restored-evidence/repository.tar -C /tmp/canli-restored-evidence/workspace
cd /tmp/canli-restored-evidence/workspace
node scripts/review-company-candidates.mjs artifacts/seo/corpus-local/fresh-review /tmp/restored-first-review.json
node scripts/review-company-candidates.mjs artifacts/seo/corpus-local/next-1000 /tmp/restored-second-review.json
node scripts/prepare-company-storage.mjs artifacts/seo/corpus-local/company-combined-catalog-extended artifacts/seo/corpus-local/company-combined-delivery-extended /tmp/restored-runtime-plan.json
```

Next: approved remote retention destination, transfer and independent remote-byte
verification, followed by hosted preview checks. The new third cohort needs its own
completed capture/review and a later archive version; never modify this sealed one.

## Three-cohort candidate — 2026-09-20

A separate runtime plan now binds release
`9dae2a4a62b647c96892f90d30a826f783de1a9f62eefff27adffc4d6d1c8a34`:
6,249 reachable objects totaling 828,366,117 bytes, for 1,968 companies and 52,416
histories. Exact roots and plan hash are in
`artifacts/seo/company-three-cohort-storage-plan-summary.json`; its ignored full
plan is `artifacts/seo/corpus-local/company-three-cohort-storage-plan.json`.
The plan's source replay and object verification passed. Nothing was uploaded.

This candidate has its own delivery, catalog and discovery directories under
`corpus-local/company-three-cohort-*-extended`. The earlier 1,202-company runtime
plan and sealed archive remain valid for their earlier scope. They do not protect
the third capture queue, its exclusions, the new editorial filings or the new
combined runtime. An updated archive and isolated restore remain required before
claiming equivalent portability for the three-cohort candidate.

## Three-cohort archive and restore verified — 2026-09-20

`artifacts/seo/corpus-local/three-cohort-evidence-20260920.tar` contains 12,952
files, totaling 1,581,578,240 archive bytes. Its separately retained whole-file
SHA-256 is `103a3839594086e211ef698232f2ed3011e94bae92de3fd27ecc59a5be8d23f4`.
Summary and restore receipts are tracked as
`company-three-cohort-evidence-archive-summary.json` and
`company-three-cohort-evidence-restore.json` in `artifacts/seo/`.

The archive includes all three completed capture queues and exclusions, both
editorial-filing directories, the original third-cohort replay, all runtime objects
reachable from the new release, its pointers and plan, and repository a901b9f8.
The exact packager is also included separately as `packager.py`; that updated
packager is newer than the saved repository snapshot. Earlier archives are retained.

A separate temporary restore verified every member and replayed the saved
repository's source checks:342+853+766 eligible captures,147+234 verified exclusions,
zero errors. It reproduced all6,249 runtime keys, hashes and byte lengths and the
exact release/catalog/download roots without reading original capture or runtime
object directories. The temporary restore was removed after verification.

The packager supports explicit `--profile three-cohort`; its default remains the
older two-cohort bundle. It rejects unfinished queues, stopped captures, duplicate
IDs and result sets that omit or replace requested IDs. Eleven archive/corpus tests
pass. The restore harness first checks the entire archive against the separate
summary and refuses to overwrite its output receipt.

```sh
# Replay an existing archive; choose a NEW output receipt path.
python3 scripts/verify_company_evidence_restore.py \
  artifacts/seo/corpus-local/three-cohort-evidence-20260920.tar \
  artifacts/seo/company-three-cohort-evidence-archive-summary.json \
  /tmp/canli-new-restore-receipt.json
```

This is verified local portability. No remote copy, upload, hosted configuration
or disaster-recovery claim follows from it. Destination access and independent
remote-byte verification remain open.

## Corrected v3 archive — 2026-09-20

The corrected candidate has a separate sealed archive:
`artifacts/seo/corpus-local/three-cohort-v3-evidence-20260920.tar`.
It contains13,183files and1,695,528,960archivebytes. Independently retained SHA-256:
`27d5ffe86251571d767106e0ab06f81b420da4d4fe841f412a48bcba627ea76f`.
Tracked summary and restore receipts are
`artifacts/seo/company-three-cohort-v3-evidence-archive-summary.json` and
`artifacts/seo/company-three-cohort-v3-evidence-restore.json`.

This archive includes all three completed queues and their exclusions, all three
editorial-filing directories (including constant-history/XBRL evidence and retained
failure logs), the corrected v3 runtime and pointers, repository df5acde5, and the
exact newer packager as a separate file. Earlier sealed archives remain intact.
The CLI profile is `three-cohort-v3`; the historical default remains `two-cohort`.
Builder and restore share explicit profile configuration, so v3 paths cannot
silently resolve to the earlier extended-v1 inventory.

An isolated restore verified the whole-file SHA and every archive member. Saved
repository code reproduced342+853+766eligible captures and381verified exclusions,
with zero replay errors. All6,249runtime keys, hashes and byte lengths and exact
release/catalog/download roots match the v3 plan. Source/runtime replay did not
read original local capture or object directories. The temporary restore was
removed afterward. Eleven archive/corpus tests pass.

```sh
# Choose a new output receipt path; existing receipts are never overwritten.
python3 scripts/verify_company_evidence_restore.py \
  artifacts/seo/corpus-local/three-cohort-v3-evidence-20260920.tar \
  artifacts/seo/company-three-cohort-v3-evidence-archive-summary.json \
  /tmp/canli-v3-new-restore-receipt.json
```

The restore verifies captured bytes and source/runtime reproduction; it does not
claim independent replication of every manual editorial judgment. No remote copy
or production activation has occurred. Remote destination access, verified remote
bytes and hosted behavior remain outstanding.
