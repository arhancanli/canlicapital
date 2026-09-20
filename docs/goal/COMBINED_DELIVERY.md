# Combined company delivery

Status: local staging only; publication is not approved. See STATUS.md for current
verification and remaining work. Source values and exclusions are preserved.

## Inputs and trust boundary

`artifacts/seo/company-combined-inputs-extended.json` pins two previously reviewed
extended-v1 delivery manifests by exact SHA-256. One contains 349 companies; the
other contains 853 companies and 147 documented exclusions. These pins must come
from an independently reviewed cohort. Rehashing an unreviewed manifest does not
approve its exclusions, editorial quality or source completeness.

The combiner requires both manifests to match their pins and selection policy.
It resolves every source/selected descriptor through the original download index,
checks the object's bytes and hash, and replays selected financial records from
original source bytes. Duplicate company identities fail rather than choosing a
winner or double counting. Policy changes require a new separately reviewed cohort.

The combined output preserves exact source manifest bytes, original index objects,
original/selected downloads and capture-review metadata. It builds a new download
index for the complete union. Its manifest uses `source_deliveries` to retain both
cohort bindings and their exclusions. The original manifests remain available as
immutable objects, not merely file paths on this machine.

Inputs must be original cohorts, not recursively combined deliveries. This keeps
provenance self-contained without a hidden dependency on prior combined folders.
A single-writer lock prevents concurrent output mutation. Rejected builds preserve
the previous delivery.json pointer; unused immutable objects may remain locally.
No garbage collection, source edits, deployment or publication approval occurs.

## Reproduction

From the repository root with the existing captures and staged inputs:

```sh
node scripts/combine-company-deliveries.mjs artifacts/seo/company-combined-inputs-extended.json artifacts/seo/corpus-local/company-combined-delivery-extended
node scripts/build-company-catalog-from-delivery.mjs artifacts/seo/corpus-local/company-combined-delivery-extended artifacts/seo/corpus-local/company-combined-catalog-extended
node scripts/build-company-release.mjs artifacts/seo/corpus-local/company-combined-catalog-extended artifacts/seo/corpus-local/company-combined-delivery-extended
node scripts/build-company-discovery.mjs artifacts/seo/corpus-local/company-combined-catalog-extended artifacts/seo/corpus-local/company-combined-delivery-extended artifacts/seo/corpus-local/company-combined-discovery-extended
node scripts/measure-company-delivery.mjs artifacts/seo/corpus-local/company-combined-catalog-extended artifacts/seo/corpus-local/company-combined-delivery-extended dist artifacts/seo/company-combined-delivery-extended-measurement.json artifacts/seo/corpus-local/company-combined-discovery-extended
node scripts/audit-company-selected-quality.mjs artifacts/seo/corpus-local/company-combined-delivery-extended artifacts/seo/company-combined-selected-quality-extended.json
```

The catalog/release builders independently bind the union to its served records.
Discovery is rebuilt from that same release. HTTP replay checks all pages/downloads,
exact sitemap agreement, orphan detection and links from the company directory.
Browser sampling uses `audit-company-cohort-browser.py` against a local preview;
its receipt states the tested routes and widths explicitly. Timing remains local
sequential timing, not production load or field performance.

## Quality and release boundaries

The combined corpus has 1,202 companies and 31,727 histories. The quality audit flags
3,924 histories, with overlapping counts: 3,405 historical-only, 226 multiple-unit,
77 partially historical-unit, 20 constant (including 19 zero-only), and 338 pages
in 169 equal-numerical-vector groups. Numerical equality does not prove semantic
duplication. No flags is not editorial approval. Original values remain untouched.

These are staged records and routes, not confirmed indexed pages. The combined
corpus replaces the separate cohorts for serving; do not add its page count to
their counts. Core and extended selections are likewise alternatives. Storage,
editorial release decisions, production verification and search measurements remain
separate requirements, alongside developer adoption and governed engine outcomes.


## Verified checkpoint

Full local HTTP replay passed 32,954 pages and 2,404 downloads with exact sitemap
agreement, no failures and no orphan pages. Maximum depth is four links from the
company directory; maximum HTML size is 36,223 bytes. Browser sampling passed
54 checks over nine routes in Chromium/WebKit at 320, 390 and 1440 pixels. The
longest-issuer mobile screenshot was visually inspected. The entire local suite
passes 368 tests plus the publication/SEO audits. None of these checks establish
production capacity, editorial approval, actual indexing or forward performance.
