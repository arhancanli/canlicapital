# Concept expansion proposal (drafted September 22, 2026)

Status: implemented as policy extended-v23 (PR #180) with 38 of the 39 concepts;
the net-change-in-cash concept's 113-character name exceeds the 100-character slug
bound shared by the page, API, MCP and sitemap contracts and was excluded. Numbers come from the SEC bulk companyfacts
inventory of September 19 (`artifacts/seo/sec-companyfacts-capacity-20260919.json`)
and count active filers that report each concept in a 10-K, 10-Q, 20-F or 40-F.
They are capacity, not admitted pages or indexing.

## Why

The company reference publishes 34 concepts per company. With every active filer
that has usable data now staged (v23: 6,391 companies, 157,113 histories, 132,876
indexable URLs), the next largest source of useful, source-bound pages is more
concepts for the same companies. Each new concept adds one history page per
company that reports it, rendered by the existing renderer with the same
provenance, units and reader notes.

## Selection rule

A concept qualifies when it is a statement-level amount a reader would look up
(money, shares or per-share), has a single clear meaning under US GAAP, is reported
by at least 2,400 active filers, and is not one of:

- accounting identities that duplicate published values (LiabilitiesAndStockholdersEquity);
- capital-structure parameters with no history value (par value, shares authorized);
- schedule rows split by future year (lease payments due in year two, three, four…);
- rates and reconciliation percentages (effective tax rate, statutory-rate items),
  which need a pure unit the current unit rules do not admit;
- counts of segments, options or awards.

## Curated concepts (39)

| Statement | Concept | Unit | Period | Active filers |
| --- | --- | --- | --- | ---: |
| Balance sheet | CommonStockSharesOutstanding | shares | instant | 5,447 |
| Balance sheet | CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents | money | instant | 5,944 |
| Balance sheet | AdditionalPaidInCapital | money | instant | 4,365 |
| Balance sheet | AccumulatedOtherComprehensiveIncomeLossNetOfTax | money | instant | 4,455 |
| Balance sheet | StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest | money | instant | 2,578 |
| Balance sheet | OperatingLeaseRightOfUseAsset | money | instant | 5,262 |
| Balance sheet | OperatingLeaseLiability | money | instant | 5,060 |
| Balance sheet | LongTermDebt | money | instant | 2,792 |
| Balance sheet | PropertyPlantAndEquipmentGross | money | instant | 4,162 |
| Balance sheet | AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment | money | instant | 4,563 |
| Balance sheet | IntangibleAssetsNetExcludingGoodwill | money | instant | 2,901 |
| Balance sheet | OtherAssetsNoncurrent | money | instant | 3,776 |
| Balance sheet | OtherLiabilitiesNoncurrent | money | instant | 3,057 |
| Balance sheet | AccruedLiabilitiesCurrent | money | instant | 3,217 |
| Balance sheet | PrepaidExpenseAndOtherAssetsCurrent | money | instant | 3,341 |
| Balance sheet | ContractWithCustomerLiabilityCurrent | money | instant | 2,439 |
| Balance sheet | DeferredTaxAssetsNet | money | instant | 3,794 |
| Balance sheet | DeferredIncomeTaxLiabilitiesNet | money | instant | 2,380 |
| Income statement | IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest | money | duration | 5,439 |
| Income statement | ProfitLoss | money | duration | 3,872 |
| Income statement | ComprehensiveIncomeNetOfTax | money | duration | 4,488 |
| Income statement | NetIncomeLossAvailableToCommonStockholdersBasic | money | duration | 2,768 |
| Income statement | GeneralAndAdministrativeExpense | money | duration | 4,046 |
| Income statement | Depreciation | money | duration | 4,200 |
| Income statement | DepreciationDepletionAndAmortization | money | duration | 3,429 |
| Income statement | AmortizationOfIntangibleAssets | money | duration | 3,540 |
| Income statement | InterestExpenseNonoperating | money | duration | 2,633 |
| Income statement | OtherNonoperatingIncomeExpense | money | duration | 3,842 |
| Income statement | NonoperatingIncomeExpense | money | duration | 3,261 |
| Income statement | CurrentIncomeTaxExpenseBenefit | money | duration | 3,825 |
| Income statement | DeferredIncomeTaxExpenseBenefit | money | duration | 4,262 |
| Cash flow | InterestPaidNet | money | duration | 5,120 |
| Cash flow | IncomeTaxesPaidNet | money | duration | 4,496 |
| Cash flow | ProceedsFromIssuanceOfCommonStock | money | duration | 3,130 |
| Cash flow | OperatingLeasePayments | money | duration | 3,874 |
| Cash flow | IncreaseDecreaseInAccountsReceivable | money | duration | 3,911 |
| Cash flow | IncreaseDecreaseInInventories | money | duration | 2,943 |
| Cash flow | IncreaseDecreaseInAccountsPayable | money | duration | 3,027 |
| Cash flow | CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect | money | duration | 5,507 |

Total: 151,146 histories among active filers. At v23's flagged share (19.4%)
about 122,000 would be indexable under the clean-set rule, taking the company
reference from 132,876 to roughly 255,000 indexable URLs. Historical filers in the
release add more histories but those are withheld as historical-only.

## Implementation path (reuses the existing machinery)

1. Add the 39 entries to `scripts/lib/company-extended-concepts.mjs` with label,
   kind, unit kind and a meaning sentence in the existing style, each with a
   sentence saying what the value does not establish.
2. Verify every entry's period type and item type against the SHA-bound 2026 FASB
   taxonomy (`scripts/verify-company-concept-taxonomy.py`, TAXONOMY_BINDING) and
   extend `typed-concept-coverage` tests. Reject any concept whose declared period
   disagrees with the taxonomy.
3. Introduce selection policy `extended-v23` that includes the new concepts and
   inherits every v3 to v22 editorial hold unchanged. Add it to the accepted policy
   list; keep `extended-v22` frozen for reproduction.
4. Re-select all ten cohorts from their retained bytes under `extended-v23` and
   prove the transition: every existing history unchanged byte for byte, only
   additions. Write a transition script in the pattern of
   `review-five-cohort-v22-transition.mjs`.
5. Re-stage, combine, catalog, release, discovery, storage plan; run the selected
   quality audit; extend the admission builder's concept mask (it allows up to 52
   concepts per company today; 34 + 39 = 73 needs the mask widened or split).
6. Local HTTP audit, upload of the new objects, hosted readiness, browser audit,
   then an activation PR.

Rough scale: about 122,000 new indexable pages, one release cycle (a day of
pipeline time plus review), and roughly 1 GB of additional storage objects.

## Not proposed

Percent and ratio concepts (tax rates, discount rates) until a pure-unit rule is
designed and reviewed; year-by-year schedules; per-segment or per-award data;
any concept whose meaning depends on presentation choices that differ by filer.
