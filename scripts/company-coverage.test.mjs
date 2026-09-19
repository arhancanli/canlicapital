import test from 'node:test';
import assert from 'node:assert/strict';
import { companyCoverage, latestObservationsByUnit } from './lib/company-coverage.mjs';

test('coverage uses reporting intervals, separates units and flags old history', () => {
  const result = companyCoverage([{ start: '2010-01-01', end: '2010-12-31', unit: 'USD' }, { end: '2015-12-31', unit: 'EUR' }], '2026-09-19T12:00:00Z');
  assert.deepEqual(result, { first: '2010-01-01', last: '2015-12-31', units: ['EUR', 'USD'], historicalOnly: true });
});
test('two-year coverage boundary depends on full dates, not just years', () => {
  assert.equal(companyCoverage([{ end: '2024-09-19', unit: 'USD' }], '2026-09-19T12:00:00Z').historicalOnly, false);
  assert.equal(companyCoverage([{ end: '2024-09-18', unit: 'USD' }], '2026-09-19T12:00:00Z').historicalOnly, true);
});

test('latest overview preserves currencies and same-end reporting intervals', () => {
  const rows = [
    { start: '2024-01-01', end: '2024-12-31', unit: 'USD', val: 2 },
    { start: '2024-01-02', end: '2024-12-31', unit: 'USD', val: 3 },
    { end: '2023-12-31', unit: 'EUR', val: 4 },
    { end: '2023-12-31', unit: 'USD', val: 1 },
  ];
  assert.deepEqual(latestObservationsByUnit(rows).map(row => row.val), [4, 2, 3]);
  assert.equal(rows.length, 4);
});
