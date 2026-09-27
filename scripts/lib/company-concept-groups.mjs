import { compactAmount, percent } from './company-history-summary.mjs';

// Where each published measure sits in the financial statements, and what follows from it for a
// history page: the handful of measures worth reading next, and the measure's size against the
// statement total it belongs to.
//
// Every history page used to list all of the company's other histories (60 or more links), so
// the pages of one company shared most of their text and links. A page now lists up to eight:
// measures from its own statement first, in reading order, then one anchor from each other
// statement. The full list stays one link away on the company overview.

export const CONCEPT_GROUPS = Object.freeze({
  assets: ['Assets', 'AssetsCurrent', 'CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'AccountsReceivableNetCurrent', 'InventoryNet', 'PrepaidExpenseAndOtherAssetsCurrent', 'PropertyPlantAndEquipmentNet', 'PropertyPlantAndEquipmentGross', 'AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment', 'Goodwill', 'IntangibleAssetsNetExcludingGoodwill', 'FiniteLivedIntangibleAssetsNet', 'OperatingLeaseRightOfUseAsset', 'DeferredTaxAssetsNet', 'OtherAssetsNoncurrent'],
  liabilities: ['Liabilities', 'LiabilitiesCurrent', 'AccountsPayableCurrent', 'AccruedLiabilitiesCurrent', 'ContractWithCustomerLiabilityCurrent', 'LongTermDebt', 'OperatingLeaseLiability', 'DeferredIncomeTaxLiabilitiesNet', 'OtherLiabilitiesNoncurrent'],
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'RetainedEarningsAccumulatedDeficit', 'AdditionalPaidInCapital', 'AccumulatedOtherComprehensiveIncomeLossNetOfTax'],
  income: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'CostOfRevenue', 'GrossProfit', 'OperatingExpenses', 'SellingGeneralAndAdministrativeExpense', 'GeneralAndAdministrativeExpense', 'ResearchAndDevelopmentExpense', 'OperatingIncomeLoss', 'InterestExpense', 'InterestExpenseNonoperating', 'OtherNonoperatingIncomeExpense', 'NonoperatingIncomeExpense', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeTaxExpenseBenefit', 'CurrentIncomeTaxExpenseBenefit', 'DeferredIncomeTaxExpenseBenefit', 'NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ComprehensiveIncomeNetOfTax', 'DepreciationDepletionAndAmortization', 'Depreciation', 'AmortizationOfIntangibleAssets', 'ShareBasedCompensation'],
  cashflow: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInInvestingActivities', 'NetCashProvidedByUsedInFinancingActivities', 'PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsForRepurchaseOfCommonStock', 'ProceedsFromIssuanceOfCommonStock', 'InterestPaidNet', 'IncomeTaxesPaidNet', 'OperatingLeasePayments', 'IncreaseDecreaseInAccountsReceivable', 'IncreaseDecreaseInInventories', 'IncreaseDecreaseInAccountsPayable'],
  shares: ['EarningsPerShareDiluted', 'EarningsPerShareBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingBasic', 'CommonStockSharesOutstanding'],
});

const GROUP_OF = new Map(Object.entries(CONCEPT_GROUPS).flatMap(([group, tags]) => tags.map((tag, rank) => [tag, { group, rank }])));
export const conceptGroup = tag => GROUP_OF.get(tag)?.group ?? null;

// The measure a reader most likely wants from each other statement.
const ANCHORS = Object.freeze({ assets: ['Assets'], liabilities: ['Liabilities'], equity: ['StockholdersEquity'], income: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'NetIncomeLoss'], cashflow: ['NetCashProvidedByUsedInOperatingActivities'], shares: ['EarningsPerShareDiluted'] });
export const RELATED_LIMIT = 8;
const SAME_GROUP_LIMIT = 6;

// linkable(tag): whether the page may link that history. Linked measures fill the slots first,
// so a page never spends its related list on names it cannot link.
export function relatedConcepts(concepts, concept, { linkable = () => true, limit = RELATED_LIMIT } = {}) {
  const others = concepts.filter(other => other.tag !== concept.tag);
  const rank = other => [linkable(other.tag) ? 0 : 1, GROUP_OF.get(other.tag)?.rank ?? Infinity, other.tag];
  const byRank = (a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]); };
  const group = conceptGroup(concept.tag);
  const picked = others.filter(other => group && conceptGroup(other.tag) === group).sort(byRank).slice(0, SAME_GROUP_LIMIT);
  for (const [otherGroup, tags] of Object.entries(ANCHORS)) {
    if (otherGroup === group || picked.length >= limit) continue;
    const anchor = tags.map(tag => others.find(other => other.tag === tag)).find(other => other && linkable(other.tag)) ?? tags.map(tag => others.find(other => other.tag === tag)).find(Boolean);
    if (anchor && !picked.includes(anchor)) picked.push(anchor);
  }
  for (const other of [...others].sort(byRank)) {
    if (picked.length >= limit) break;
    if (!picked.includes(other)) picked.push(other);
  }
  return picked.slice(0, limit);
}

// The statement total a measure is read against: balance-sheet money against total assets at the
// same date, income and cash-flow money against revenue for the same period.
const PARENTS = Object.freeze({ assets: ['Assets'], liabilities: ['Assets'], equity: ['Assets'], income: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'], cashflow: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'] });

// latest: the summary's latest observation of this measure. Returns null unless the parent reports
// the same period (same end, and same start for a flow) in the same unit, and both are positive.
export function shareOfParent(concepts, concept, latest) {
  const group = conceptGroup(concept.tag);
  const parents = PARENTS[group];
  if (!parents || parents.includes(concept.tag) || !latest || !(latest.val > 0) || latest.unit !== 'USD') return null;
  for (const tag of parents) {
    const parent = concepts.find(other => other.tag === tag);
    const rows = (parent?.observations ?? []).filter(row => row.unit === latest.unit && row.end === latest.end && (row.start ?? null) === (latest.start ?? null) && Number.isFinite(row.val));
    const row = rows.sort((a, b) => b.filed.localeCompare(a.filed))[0];
    if (row && row.val > 0) return { parent, row, fraction: latest.val / row.val };
  }
  return null;
}

// The sentence the history page prints, shared with audit-published-numbers.mjs, which reruns it
// on the page's source to trace every figure it contains.
export function shareSentence(concepts, concept, summary) {
  const share = summary ? shareOfParent(concepts, concept, summary.latest) : null;
  if (!share) return null;
  return concept.kind === 'duration'
    ? `That was ${percent(share.fraction)} of revenue (${compactAmount(share.row.val, share.row.unit)}) for the same year.`
    : `That was ${percent(share.fraction)} of total assets (${compactAmount(share.row.val, share.row.unit)}) at the same date.`;
}
