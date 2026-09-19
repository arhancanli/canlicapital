# Measure source coverage before creating pages

The corpus auditor scans a captured SEC Company Facts ZIP into a local SQLite catalog.
It calls the same JavaScript selector used by publication; it does not generate HTML,
modify the live site, or claim that eligible records have passed editorial review.

```sh
python3 scripts/audit-company-corpus.py \
  --archive /absolute/path/companyfacts.zip \
  --output artifacts/seo/corpus-local/catalog.sqlite \
  --captured-at ACTUAL_UTC_CAPTURE_TIMESTAMP
```

Replace the timestamp with the archive's actual capture time, for example the ISO UTC
value recorded by your download process. Do not substitute today's date for an old
capture. If only a hash-bound collection receipt establishes that the source bytes
existed by a time, use `--observed-by` instead. The catalog retains that upper bound
and sets each selected record's `fetched_at` to null; such records cannot enter the
current publication generator without a verified capture record or a fresh capture.
Do not treat filesystem modification times as source retrieval evidence.

`--limit 100` is an explicit sample; it never extrapolates its result.

The database records the archive hash, selector/worker/auditor hashes, source-member
hashes, selected records, eligible financial histories and excluded entities with reason
codes. Rejected observation counts describe omissions within selected concepts. The
original ZIP must be retained to retrieve source bytes; the catalog is not a replacement
for the source archive. A hash proves byte identity, not that a caller-supplied file came
from SEC. Verify acquisition provenance separately.

The scan holds one company's payload at a time, limits each member to 64 MiB, refuses
unexpected paths, duplicate identities and encrypted entries, and never extracts the ZIP.
It checks the archive again after scanning. A failed scan preserves the existing catalog;
a successful full scan atomically replaces it. Very large archives still need disk for
the original ZIP and SQLite catalog and memory for ZIP directory metadata. No million-
entity runtime or serving-capacity benchmark has been completed.

`artifacts/seo/company-corpus-pilot.json` describes a locally assembled five-company
pilot using existing source snapshots. It is not the SEC bulk corpus or a representative
market sample. Its 48 candidate entity/history pages exclude the company directory and
are already represented in the existing 49-page pilot. They are not additional pages.

The [SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
identifies the nightly bulk archive as the efficient source for large acquisitions.
The bulk endpoint returned HTTP 403 in this environment on 19 September 2026. Full-
corpus eligibility remains unmeasured; do not bypass access controls or fabricate totals.

## Existing research collection findings

The engine already holds a selected 600-issuer research cohort. Its collection
receipt and all 48 parquet parts reconcile; 520 captured files match their recorded
byte counts and hashes, and 80 issuers have documented terminal 404 responses.
The website selector accepts 344 companies and 2,657 financial histories: 3,001
candidate company/history pages, with no overlap with the five-company pilot.
It rejects 146 invalid entity responses and 30 companies with insufficient coverage.
A collector's `fetched` status is therefore not a content-quality approval.

The records have a collection receipt dated 16 August 2026, but no individual fetch
timestamps. The audit uses that stated observed-by boundary and retains unknown
`fetched_at` values. It does not establish an independently timestamped capture.
These candidates need source refresh/capture provenance, semantic/editorial review
and serving validation before publication. They are not added to the 312-page site.

Reproduce staging with the research environment's pandas/parquet support:

```sh
/path/to/research/python scripts/stage-research-companyfacts.py \
  --engine-root /path/to/AlphaForge \
  --output artifacts/seo/corpus-local/research-collection.zip \
  --receipt artifacts/seo/research-collection-provenance.json
python3 scripts/audit-company-corpus.py \
  --archive artifacts/seo/corpus-local/research-collection.zip \
  --output artifacts/seo/corpus-local/research-collection.sqlite \
  --observed-by 2026-08-16T00:32:33.725219+00:00
```

The staging command writes outside the original engine tree, uses stable ZIP metadata,
and verifies receipt, part lineage, issuer manifest, source-byte hashes and sizes.
The archive, catalog and original research inputs stay local; the summary and
per-file provenance receipt are tracked. The full SEC corpus remains unmeasured.
