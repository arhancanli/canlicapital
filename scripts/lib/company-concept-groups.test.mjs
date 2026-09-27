import test from 'node:test';
import assert from 'node:assert/strict';
import { CONCEPTS } from './company-reference.mjs';
import { EXTENDED_CONCEPTS } from './company-extended-concepts.mjs';
import { EXPANDED_CONCEPTS_V23 } from './company-expanded-concepts-v23.mjs';
import { CONCEPT_GROUPS, conceptGroup, relatedConcepts, shareOfParent, RELATED_LIMIT } from './company-concept-groups.mjs';

const published = Object.keys({ ...CONCEPTS, ...EXTENDED_CONCEPTS, ...EXPANDED_CONCEPTS_V23 });
test('every published measure belongs to exactly one statement group, and the groups name no unknown measure', () => {
  const grouped = Object.values(CONCEPT_GROUPS).flat();
  assert.equal(new Set(grouped).size, grouped.length, 'no measure in two groups');
  assert.deepEqual([...grouped].sort(), [...published].sort());
});

const all = published.map(tag => ({ tag }));
test('a history links at most eight related measures: its own statement first, then an anchor from each other statement', () => {
  const related = relatedConcepts(all, { tag: 'InventoryNet' }).map(c => c.tag);
  assert.equal(related.length, RELATED_LIMIT);
  assert.ok(!related.includes('InventoryNet'));
  assert.deepEqual(related.slice(0, 6).map(conceptGroup), Array(6).fill('assets'));
  assert.deepEqual(related.slice(6), ['Liabilities', 'StockholdersEquity']);
  const income = relatedConcepts(all, { tag: 'NetIncomeLoss' }).map(c => c.tag);
  assert.deepEqual(income.slice(0, 3), ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'CostOfRevenue']);
  assert.ok(income.includes('Assets') && income.includes('Liabilities'));
});
test('measures the page may link fill the related slots before measures it cannot link', () => {
  const related = relatedConcepts(all, { tag: 'Assets' }, { linkable: tag => tag !== 'AssetsCurrent' }).map(c => c.tag);
  assert.ok(!related.includes('AssetsCurrent'));
  const few = [{ tag: 'Assets' }, { tag: 'Revenues' }, { tag: 'Goodwill' }];
  assert.deepEqual(relatedConcepts(few, { tag: 'Assets' }).map(c => c.tag).sort(), ['Goodwill', 'Revenues'], 'a small company lists everything else');
});

const row = (val, end, extra = {}) => ({ val, end, unit: 'USD', filed: '2025-10-31', ...extra });
const company = [
  { tag: 'Assets', observations: [row(400, '2025-09-27'), row(350, '2025-09-27', { filed: '2024-01-01' })] },
  { tag: 'Revenues', observations: [row(1000, '2025-09-27', { start: '2024-09-29' })] },
];
test('share of the statement total uses the same period and unit, the latest filing, and positive values only', () => {
  const cash = shareOfParent(company, { tag: 'CashAndCashEquivalentsAtCarryingValue' }, row(40, '2025-09-27'));
  assert.equal(cash.fraction, 0.1); assert.equal(cash.parent.tag, 'Assets');
  assert.equal(shareOfParent(company, { tag: 'NetIncomeLoss' }, row(250, '2025-09-27', { start: '2024-09-29' })).fraction, 0.25);
  assert.equal(shareOfParent(company, { tag: 'NetIncomeLoss' }, row(250, '2025-09-27', { start: '2025-06-29' })), null, 'a different period is not compared');
  assert.equal(shareOfParent(company, { tag: 'Goodwill' }, row(40, '2024-09-28')), null, 'no parent value at that date');
  assert.equal(shareOfParent(company, { tag: 'NetIncomeLoss' }, row(-5, '2025-09-27', { start: '2024-09-29' })), null, 'a loss is not a share');
  assert.equal(shareOfParent(company, { tag: 'Goodwill' }, { ...row(40, '2025-09-27'), unit: 'EUR' }), null, 'no currency conversion');
  assert.equal(shareOfParent(company, { tag: 'Assets' }, row(400, '2025-09-27')), null, 'the total is not a share of itself');
  assert.equal(shareOfParent(company, { tag: 'EarningsPerShareDiluted' }, row(6, '2025-09-27', { start: '2024-09-29' })), null, 'per-share measures have no statement total');
});
