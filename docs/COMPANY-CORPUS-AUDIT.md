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
capture. `--limit 100` is an explicit sample; it never extrapolates its result.

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
