# Selected-history publication review queue

This review covers the extended-v1 cohort, not a published expansion. The audit
replays all 349 selected records against their captured SEC companyfacts bytes,
then records page-level flags in
`artifacts/seo/company-selected-quality-extended.json`. It binds the delivery
manifest and audit code by SHA256. Reproduce with:

```sh
node scripts/audit-company-selected-quality.mjs artifacts/seo/corpus-local/company-delivery-extended artifacts/seo/company-selected-quality-extended.json
```

Of 9,030 histories, 1,375 have at least one flag. Flags overlap; unflagged is not
publication approval.

| Check | Histories | Required interpretation/action |
| --- | ---: | --- |
| Last reporting end more than two years before capture | 989 | Preserve historical labeling; review filing/tag continuity before describing anything as current. |
| Multiple original units | 223 | Keep units separate and review comparability; do not convert or splice silently. |
| Recent overall coverage but an old individual unit | 74 | Add per-unit coverage presentation; the overall range alone can obscure old data. |
| Constant/zero-only | 7 | All are legacy core concepts. Review usefulness before admitting standalone pages; do not silently revise old source policy. |
| Identical full numerical vectors | 210 | 105 pairs, compared within company. Review meaning and intent before deciding whether separate canonical pages are useful. |

The equality fingerprint includes every selected kind, unit, interval and value;
it deliberately excludes accession and filing dates. It is a data-content signal,
not evidence of semantic equivalence or issuer error.

## Equal-history triage

| Concept pair | Companies | Review direction |
| --- | ---: | --- |
| Basic / diluted EPS | 61 | Distinct definitions; equal values can occur. Explain the distinction and evaluate page usefulness before any consolidation. |
| Basic / diluted weighted shares | 40 | Same caution; numerical equality does not establish the absence of potentially dilutive securities. |
| Total / current liabilities | 2 | Inspect balance sheet scope before claiming equivalence. CIKs 0001678105 and 0001873213. |
| Operating / SG&A expenses | 1 | Inspect the filing's expense presentation. CIK 0001873213. |
| Net PPE / current accounts payable | 1 | Inspect the actual filing and contexts. CIK 0001816554 (EVENTIKO). |

For EVENTIKO, both selected series contain USD 11,000 at 2023-04-30 and zeros at
2022-04-30, 2024-04-30 and 2025-04-30. Those observations reproduce from the
captured SEC companyfacts response. The 2024 annual accession is
`0001683168-24-005079`. Opening its SEC filing index through the web tool failed;
independent filing verification remains open. Do not change values, infer a
reporting error or consolidate the concepts on this evidence alone.

## First presentation fix

CIK 0001381074 illustrates the per-unit issue: selected assets and several other
concepts extend to 2025-06-30 in USD but only 2021-12-31 in CNY. The current overall
range uses the newest end across units, so its historical-only notice does not
trigger. The data table retains dates and units, but a per-unit coverage summary
would make the distinction easier to see. Validate this real case and preserve
original source records when implementing the display change.

This review does not remove records, approve publication or establish indexed
counts. Resolve the queue with source evidence and explicit editorial decisions;
retain rejected and unresolved cases. Website/MCP/API and engine goals remain in
REQUIREMENTS.md.
