# Generic revenue scope review

On 2026-09-20, original-filing inspection identified three misleading generic
revenue histories in the staged extended-v1 corpus. All selected numbers reproduced
from SEC companyfacts, but the inspected filings use those facts for intersegment
sales or revenue after eliminations. They do not establish company-wide revenue.
A numerical match and an undimensioned context did not establish measure scope.

| Company | Inspected filing | Selected observations checked | Decision |
|---|---|---|---|
| Flowserve / 0000030625 | 2025 10-K | 2025, 2024, 2023; intersegment sales | Exclude the generic Revenues history. |
| Santander Holdings USA / 0000811830 | 2021 10-K | 2021, 2020, 2019; intersegment revenue/expense | Exclude the generic Revenues history. |
| OFG Bancorp / 0001030469 | 2023 10-K | 2023, 2022, 2021; intersegment revenue | Exclude the generic Revenues history. |
| Imunon / 0000749647 | 2023 10-K | Selected 2022 licensing revenue of USD500,000 | Retain the tag-specific history; no inference about other income. |
| Dentsply Sirona / 0000818479 | 2016 10-K | Inline comparison unavailable | Unresolved; no automatic exclusion or approval. |
| Compass Minerals / 0001227654 | 2013 10-K | Inline comparison unavailable | Unresolved; no automatic exclusion or approval. |

The source receipt is `artifacts/seo/company-constant-filing-evidence.json`.
Twelve index/primary capture bodies and inspection scripts are retained under
ignored `artifacts/seo/corpus-local/editorial-constant-filings/`. Their scope is
the latest selected accession, not every historical observation. The earlier
sealed archive excludes this newly acquired material.

## Corrected candidate policy

`extended-v2` preserves the extended-v1 concept definitions and ordinary selection
rules, adding three source-bound exclusions in
`scripts/lib/company-editorial-dispositions.mjs`. Each decision binds CIK, exact
SEC source hash and accounting tag. Changed source bytes require renewed review
and fail with EDITORIAL_REVIEW_REQUIRED; do not silently transfer the disposition
or change a frozen policy to make a fresh capture pass.

The three generic revenue histories are omitted from selected records. Their
company overview explains the omission and links to the inspected filing. The
raw SEC download remains unchanged. Other zero histories are not discarded by a
blanket zero-value rule. Earlier policy versions remain reproducible as historical
candidates, but the known misleading histories disqualify those candidates from
publication as-is.

All1,968 new records are compared against the earlier candidate: only these three
concepts are removed, yielding52,413 selected histories. The renderer omits their
pages and links and includes the overview explanation. Receipt:
`artifacts/seo/company-editorial-v2-migration.json`. Combined catalog, HTTP,
sitemap, browser and archive verification for the corrected candidate remain
separate required checks. No publication or indexing claim follows from this fix.

## Later non-inline review — 2026-09-20

Dentsply and Compass are now resolved as two additional scope errors. Their saved
XBRL instances match all six selected observations by entity, period, unit and
value. Dentsply's linked terse label is Intersegment net sales; Compass's label is
Intersegment sales. See company-noninline-revenue-scope-review.json for source
hashes, context IDs and label roles. The primary documents also contain the
corresponding intersegment headings. These two cases supersede the unresolved
entries above and require exclusion in the next policy version. Do not publish
v2 as-is merely because its technical checks pass.

The broader constant-case review captured all33 primary filings;12complete inline
comparisons pass numerically and21need standalone XBRL inspection. An unmatched
extraction can reflect a non-inline filing or unsupported transform and is not
an issuer-data error. The next policy change awaits that broader review. The
latest v2 full HTTP replay and84browser checks pass but do not resolve these
additional semantic release gates.

## Consolidated constant-history review and extended-v3

The additional 21 XBRL bundles match all46 selected observations by entity, period,
unit and numerical value, excluding dimensional and nil facts. Label linkbases
embedded in taxonomy schemas are supported. Together with the12 complete inline
comparisons, every constant-history case now has a latest-selected-accession
numeric comparison. This is not an all-history or publication audit.

Three further scope decisions join the five intersegment cases:

| Company / CIK | Inspected context | Decision |
|---|---|---|
| Burzynski / 0000724445 | Revenue-tagged zeros occur in a deferred-tax discussion about historical earnings. | Omit the generic revenue history; earnings language does not establish revenue. |
| Provectus / 0000315545 | Linked label qualifies the measure as material revenue; narrative discusses absence of substantial revenue. | Omit the generic zero-revenue history; no substantial revenue does not establish zero total revenue. |
| Data443 / 0001068689 | The zero measure covers cash equivalents alone. Separate Cash facts report USD197,364 and USD168,208 for2025/2024. | Omit the combined cash-and-equivalents history; do not replace it with invented or summed values. |

`extended-v3` adds these three decisions plus Dentsply and Compass to the three
unchanged v2 exclusions. Exact source hashes remain mandatory. The v2 policy and
its earlier records remain reproducible. Eight histories are omitted in total;
other zero histories remain available pending remaining quality/usefulness gates.
No issuer-data error or bad faith is alleged: the defect is the reference site's
unqualified interpretation of a narrower disclosure.

`company-constant-xbrl-comparison.json` binds the instances, label roles, periods,
units and matched values and records the separate scope decisions. Data443's
nonzero balance-sheet Cash facts are included as corroborating source facts.
Patriot Gold's office-equipment purchase row is retained as the selected PPE
payment, with the existing limitation that this does not cover every investment.
Remaining retained cases are not automatically approved by absence of a detected
contradiction. Existing historical/unit/constant disclosures and release gates apply.
