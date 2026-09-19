# Engine environment-binding review

Status: implemented and locally validated in engine commit 783ad0c; remote CI/review pending.

PR 69 changes the active dependency lock to patch AnyIO, GitPython and pip advisories.
All 16 publication manifests and the EIA legacy migration bind the old lock digest.
The old bytes are recoverable from `c57be7b^:uv.lock` and match the expected digest:

- Historical lock SHA-256: `5caca664242722a3a3112663d7a19b7b5000583e30ade3753e1b8ffdecfd6f06`
- Proposed active lock SHA-256: `115040738b6247d9fa10631c03dca6661b0662710097adfc852623c968fe30ec`

Relevant code:

- `scripts/verify_publication_clean_checkout.py::_verify_bindings` currently requires
  every environment binding to match the active root file. Its report explicitly
  proves archive integrity, not regeneration of returns.
- `src/alphaforge/foundry/migration.py::_verify_binding` binds source files for legacy
  import. The EIA migration packet also specifies `uv run python ...` in a disposable
  workspace with no network. It cannot silently use a different active lock.
- `config/foundry_legacy_migrations/eia_petroleum_inventory_v1.json` is itself a
  canonically hashed prepared packet; mutating it changes the packet identity.

A correct fix must separate archival verification from active-environment replay.
Preserve exact historical lock bytes and binding hashes. Any archive resolver must
be explicit, narrowly scoped, hash checked and visible in the receipt; current-code
binding failures must still fail. A replay must materialize the expected historical
environment in its isolated workspace, or explicitly remain blocked. Merely accepting
an archived lock during validation while `uv run` uses the new root lock is incorrect.
Do not mark existing receipts as reproduced under patched dependencies.

Required evidence before merge: mutation tests for missing/corrupt/escaping archived
bindings; immutable publication/packet hashes; current-lock versus historical-lock
receipt distinction; isolated replay environment selection (or an explicit blocked
replay state); publication integrity and PostgreSQL contracts; dependency tests.

No engine code, publication manifests, migration packets, runtime environment or
broker operations were changed during this investigation. PR 69 remains a draft.

## Implemented follow-up

`src/alphaforge/environment_archive.py` verifies active root files or the exact
historical uv.lock text archive. Receipts expose original/resolved paths and active
versus bound digests. No fallback is available for source-code or project-definition
drift. Publication checks bind the resolver hash and preserve all original bundle
files. Foundry records `replay_environment_files_match` and rechecks files immediately
before enqueueing; a mismatched active environment blocks before database access.

The integration fixture copies real historical bound files into a temporary workspace
for database lifecycle tests. It does not install archived dependencies or execute
research. Matching files does not establish an installed environment or valid image.

Local results: 49 tests pass, one private-workspace evidence test deselected; strict
mypy and Ruff pass; all 16 publication bundles pass the integrity verifier; git diff
confirms original publication files and migration packet unchanged. PR 69 retains
the dependency patches. No production installation, replay or database mutation.
