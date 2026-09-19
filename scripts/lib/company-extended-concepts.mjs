// Versioned editorial definitions. Existing core-v1 records never use this map.
// Period/type declarations checked against the SHA-bound 2026 FASB taxonomy.
const entries = [
 ['NetCashProvidedByUsedInFinancingActivities','Financing cash flow','duration','money','Net cash from financing activities, including borrowing, repayments and transactions with owners. A positive amount does not establish operating profitability.'],
 ['NetCashProvidedByUsedInInvestingActivities','Investing cash flow','duration','money','Net cash from investing activities, including asset purchases, disposals and investment transactions. This differs from capital expenditure payments alone.'],
 ['RetainedEarningsAccumulatedDeficit','Retained earnings or deficit','instant','money','Accumulated undistributed earnings or deficit at the reporting date. This balance is not cash available for distribution.'],
 ['WeightedAverageNumberOfSharesOutstandingBasic','Basic weighted-average shares','duration','shares','Time-weighted shares used for basic earnings per share. This denominator differs from shares outstanding at a single reporting date.'],
 ['WeightedAverageNumberOfDilutedSharesOutstanding','Diluted weighted-average shares','duration','shares','Weighted-average shares used for diluted earnings per share. Potential shares are included under the applicable dilution rules, not simply added to outstanding shares.'],
 ['EarningsPerShareBasic','Basic earnings per share','duration','per-share','Reported earnings or loss per basic common share or unit. Inspect attribution, share classes and restatements before comparing periods. This is not a market return.'],
 ['EarningsPerShareDiluted','Diluted earnings per share','duration','per-share','Reported earnings or loss per share under dilution rules. Antidilutive instruments may be excluded. A diluted value can equal the basic value without implying no potential dilution.'],
 ['IncomeTaxExpenseBenefit','Income tax expense or benefit','duration','money','Current and deferred income tax expense or benefit for continuing operations. This accounting expense differs from cash taxes paid.'],
 ['PropertyPlantAndEquipmentNet','Net property, plant and equipment','instant','money','Carrying amount of property, plant and equipment after accumulated depreciation, depletion and amortization. It is not replacement cost or market value.'],
 ['ShareBasedCompensation','Share-based compensation expense','duration','money','Reported noncash expense for share-based payment arrangements. Noncash treatment does not mean the awards have no economic cost to shareholders.'],
 ['OperatingIncomeLoss','Operating income or loss','duration','money','Operating revenue less operating expenses for the reporting period. It excludes items outside the reported operating result and is not free cash flow.'],
 ['AssetsCurrent','Current assets','instant','money','Assets classified as current under the normal operating cycle or one-year boundary. Not all current assets can be converted immediately into cash.'],
 ['InterestExpense','Interest expense','duration','money','Borrowing costs recognized as interest expense. This is distinct from cash interest paid and may not include every capitalized borrowing cost.'],
 ['LiabilitiesCurrent','Current liabilities','instant','money','Obligations classified as current under the operating-cycle or one-year boundary. The balance includes more than short-term borrowing.'],
 ['AccountsPayableCurrent','Current accounts payable','instant','money','Current amounts owed to suppliers for goods and services received. This is one component of current liabilities, not all accrued obligations.'],
 ['Goodwill','Goodwill carrying amount','instant','money','Recognized goodwill remaining after accumulated impairment. It arises from business combinations and does not measure the current value of the company’s brand.'],
 ['FiniteLivedIntangibleAssetsNet','Net finite-lived intangible assets','instant','money','Finite-lived intangible assets after amortization. This excludes goodwill and should not be combined with indefinite-lived intangible assets without checking scope.'],
 ['AccountsReceivableNetCurrent','Net current accounts receivable','instant','money','Current customer receivables after the allowance for credit loss. The balance is not cash collected or a guarantee of collection.'],
 ['PaymentsForRepurchaseOfCommonStock','Common-stock repurchase payments','duration','money','Cash paid to reacquire common stock during the period. This is not an authorization limit or a direct measure of the net change in share count.'],
 ['OperatingExpenses','Operating expenses','duration','money','Recurring operating costs under this accounting concept, generally excluding production costs included in cost of sales. Check filing presentation before combining expense subtotals.'],
 ['InventoryNet','Net inventory','instant','money','Inventory carrying amount after applicable valuation and LIFO reserves. It does not establish realizable selling proceeds or inventory turnover without other inputs.'],
 ['GrossProfit','Gross profit','duration','money','Revenue less the costs directly attributed to the goods or services sold. It precedes other operating expenses and is not net income.'],
 ['CostOfRevenue','Cost of revenue','duration','money','Costs attributed to goods produced and sold and services provided during the period. This is not the sum of every operating expense.'],
 ['SellingGeneralAndAdministrativeExpense','Selling, general and administrative expense','duration','money','Selling and general administrative costs reported under this concept. It is an expense category, not a substitute for total operating expenses.'],
 ['ResearchAndDevelopmentExpense','Research and development expense','duration','money','Research and development costs recognized as expense. Capitalization policies and acquired projects can make this differ from total cash invested in development.'],
];
export const EXTENDED_CONCEPTS = Object.freeze(Object.fromEntries(entries.map(([tag,label,kind,unitKind,meaning]) => [tag, Object.freeze({ label, kind, unitKind, meaning })])));
export const EXTENDED_POLICY = 'extended-v1';
export const TAXONOMY_BINDING = Object.freeze({ url: 'https://xbrl.fasb.org/us-gaap/2026/elts/us-gaap-2026.xsd', sha256: '5df2d5054b8a37ef1a00bbbad621317833e7c2cb65a421a283128efbd707da7e' });
export function compatibleUnit(unit, kind) {
  return kind === 'shares' ? unit === 'shares' : kind === 'per-share' ? /^[A-Z]{3}\/shares$/.test(unit) : /^[A-Z]{3}$/.test(unit);
}
