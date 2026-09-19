# Extended company policy review

`extended-v1` is a staged selection policy, not publication approval. It yields
9,386 reference pages from the existing 349 captures: 349 overviews, 9,030
histories and seven directories. Do not add this count to the core policy's 3,057
pages. Neither count establishes live or indexed pages.

The 25 added concepts cover financing/investing cash flow, retained earnings,
basic/diluted EPS and weighted shares, income tax, tangible/intangible assets,
share compensation, operating results, current assets/liabilities, interest,
payables/receivables, buybacks, inventory, gross profit and expense categories.
Exact definitions and tags: `scripts/lib/company-extended-concepts.mjs`.
Definitions explain scope differences and limitations rather than implying that
accounting values are investment returns. Balance-sheet identities and arbitrary
lease-year/tag permutations are not added merely to multiply pages.

## Admission and provenance

- Original nine-concept selection remains the default. Old selected records and
  pilot HTML reproduce unchanged. Extended records explicitly name their policy.
- Added concepts require three reporting ends and at least two different numeric
  values within one unit. Constant/zero-only added histories fail this gate.
- Monetary units require three uppercase letters; share units require `shares`;
  per-share units require a three-letter prefix followed by `/shares`. This is a
  shape check, not verification of every ISO currency or economic comparability.
- Compatible units remain separate; no currency conversion or zero filling occurs.
  Annual duration selection and original filing/capture provenance are preserved.
- All 25 concept period/type declarations match the captured official taxonomy:
  https://xbrl.fasb.org/us-gaap/2026/elts/us-gaap-2026.xsd
  SHA256: `5df2d5054b8a37ef1a00bbbad621317833e7c2cb65a421a283128efbd707da7e`.
  The receipt binds the definition map, so changing it requires a new reviewed
  policy version rather than silently rewriting old evidence.

A 2026 declaration does not prove that every historical filing used unchanged
semantics. Restatements, share classes, stale histories, currency changes and
company-specific comparability still need review. Basic and diluted EPS can equal
each other while remaining different concepts; equal vectors alone do not settle
canonical ownership. The broader source audit's duplicate/constant flags are not
an extended-policy editorial approval.

## Reproduction

Run from the website root using the existing captured cohort:

```sh
python3 scripts/verify-company-concept-taxonomy.py artifacts/seo/corpus-local/taxonomy/us-gaap-2026.xsd artifacts/seo/company-extended-taxonomy-review.json
node scripts/stage-company-delivery.mjs artifacts/seo/corpus-local/fresh-review artifacts/seo/corpus-local/company-delivery-extended public/company-data extended-v1
node scripts/build-company-catalog-from-delivery.mjs artifacts/seo/corpus-local/company-delivery-extended artifacts/seo/corpus-local/company-catalog-extended
```

Use the release/discovery/measurement commands in COMPANY_CATALOG.md with these
separate extended catalog/delivery/discovery directories. Browser QA accepts
`--extended`. Keep the original captures and the core staging directories intact.

Evidence under artifacts/seo: taxonomy-source.json,
company-extended-taxonomy-review.json, company-release-extended-staged.json,
company-discovery-extended-staged.json, company-delivery-extended-measurement.json,
and company-delivery-extended-browser.json. Raw captures and XSD are ignored.

All 9,386 pages and 698 downloads passed local HTTP checks, with exact sitemap
agreement and no orphan pages. All 44 browser checks passed after correcting long
identifier overflow on mobile. These checks do not establish cloud load capacity,
field performance, ranking quality, publication approval or indexing. Storage and
production integration remain pending. Keep the existing production sitemap
submission at https://canlicapital.com/sitemap.xml.
