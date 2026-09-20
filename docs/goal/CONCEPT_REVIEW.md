# Typed concept review — September 20, 2026

This is an offline review queue, not a publication policy. No new company page,
concept definition or indexability setting is admitted by this report.

`node scripts/audit-typed-concept-coverage.mjs` checks 94 concepts with at least
1,000 recent histories in the earlier structural inventory. It verifies every
retained delivery/source hash and CIK across 2,651 companies, then uses each
concept's period type and data type from the pinned 2026 FASB taxonomy. Monetary
coverage is measured in USD, shares in shares, and percentage concepts in pure
units. Other currencies are excluded from this measurement, not declared invalid.

The observation selector's module changed after the inventory because editorial
policies were added. Its complete date-validation, error-class and observation
selection block is byte-identical to the original SHA-bound module. The audit
checks and records both module hashes and that block's hash; it fails if observation
behavior changes. The original module is retained with the local audit inputs.

The 94 concepts still have **140,596 recent company/concept histories** under the
correct types and units. Mixed rows in 14 concepts did not change these aggregate
coverage counts. This is not 140,596 approved pages or distinct search intents.
The full report is `artifacts/seo/company-typed-concept-coverage-20260920.json`,
SHA256 `9718793aab1c96da4c9d52cd265147ded07ecd20f77664288dda33ba9bdbd849`.

| Compared histories | Companies with both qualifying histories | Identical full reported value histories | Equal / shared observations |
| --- | ---: | ---: | ---: |
| Liabilities and equity / assets | 2,615 | 2,013 | 39,931 / 40,751 |
| Common shares issued / outstanding | 2,019 | 651 | 18,676 / 27,901 |
| Operating lease liability / undiscounted payments due | 2,016 | 0 | 74 / 12,728 |

Full equality requires matching every selected reporting period, unit and value;
partial intersections do not qualify. These comparisons include historical
qualified histories, not only recent ones. Numerical equality does not prove
semantic equivalence. The first pair is a strong duplication warning; the second
requires preserving issued/outstanding distinctions; the third must not be combined
as alternative tags for the same measurement.

The next source-scope review should prioritize the following reader questions.
Descriptions below paraphrase the source-bound companyfacts descriptions retained
in the report. They are review constraints, not already-approved public copy.

| Candidate | Recent companies | Reader question and scope to verify in primary filings |
| --- | ---: | --- |
| OperatingLeaseRightOfUseAsset | 2,150 | What operating-lease asset is recognized? Distinguish the right to use an asset from owned property and the related liability. |
| OperatingLeaseLiability | 2,073 | What discounted operating-lease obligation is recognized? Do not substitute undiscounted payment schedules or omit current portions. |
| InterestPaidNet | 1,969 | How much interest cash was paid within this concept's operating classification? Verify exclusion of capitalized interest; do not call it all interest expense. |
| ComprehensiveIncomeNetOfTax | 1,866 | What comprehensive income is attributable to the parent? Preserve attribution and exclude transactions with owners. |
| AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment | 1,860 | How much depreciation/depletion/amortization is accumulated against operating physical assets? Distinguish the balance from annual expense. |
| PropertyPlantAndEquipmentGross | 1,714 | What operating physical assets are reported before accumulated depreciation/depletion/amortization? Distinguish gross carrying amount from net assets and resale inventory. |

Before admission: inspect representative primary filings and all-history conflicts,
retain source-specific scope exclusions, assess distinct search intent against the
existing 34 concepts, and run the production selector with a new immutable policy.
Do not extrapolate these counts to the remaining issuer universe or claim they
close the 800,000 actually-indexed-page gap. Hosted company delivery, editorial
coverage, retention and search-engine indexing remain separate work.
