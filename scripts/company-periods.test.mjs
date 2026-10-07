import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { companyPeriods, fiscalCalendar, priorPeriod, MIN_MEASURES } from './lib/company-periods.mjs';

const dir = new URL('../public/company-data/sources/', import.meta.url);
const snapshots = Object.fromEntries(readdirSync(dir).map(f => {
  const d = JSON.parse(gunzipSync(readFileSync(new URL(f, dir))));
  return [d.entityName, d];
}));
const period = (name, key) => companyPeriods(snapshots[name]).find(p => p.key === key);

test('reported results match the companies\' filings', () => {
  // Values as filed (Apple 10-Q 2025-08-01 and 10-K 2025-10-31; Microsoft 10-K 2025-07-30; NVIDIA 10-K 2025-02-26).
  const apple = period('Apple Inc.', 'fy2025-q3');
  assert.equal(apple.end, '2025-06-28');
  assert.equal(apple.measures.revenue.val, 94036000000);
  assert.equal(apple.measures.eps_diluted.val, 1.57);
  assert.equal(apple.form, '10-Q');
  assert.equal(period('Apple Inc.', 'fy2025').measures.revenue.val, 416161000000);
  assert.equal(period('MICROSOFT CORPORATION', 'fy2025').measures.revenue.val, 281724000000);
  assert.equal(period('NVIDIA CORP', 'fy2025').end, '2025-01-26');
  assert.equal(period('NVIDIA CORP', 'fy2025').measures.eps_diluted.val, 2.94);
});

test('fiscal years are named the way each company names them', () => {
  // Dollar General's fiscal 2025 ends in January 2026; NVIDIA's fiscal 2025 ends in January 2025.
  assert.equal(fiscalCalendar(snapshots['DOLLAR GENERAL CORP'].facts['us-gaap']).offset, -1);
  assert.equal(fiscalCalendar(snapshots['NVIDIA CORP'].facts['us-gaap']).offset, 0);
});

test('every period has a unique key, its own dates and enough measures', () => {
  for (const [name, d] of Object.entries(snapshots)) {
    const ps = companyPeriods(d);
    assert.ok(ps.length > 0, name);
    assert.equal(new Set(ps.map(p => p.key)).size, ps.length, `${name} has duplicate period keys`);
    for (const p of ps) {
      assert.ok(Object.keys(p.measures).length >= MIN_MEASURES, `${name} ${p.key}`);
      assert.ok(p.start < p.end && /^\d{4}-\d{2}-\d{2}$/.test(p.end));
      for (const m of Object.values(p.measures)) assert.ok(Number.isFinite(m.val) && m.accn && m.filed);
    }
  }
});

test('the prior-year period is the same quarter one fiscal year earlier', () => {
  const ps = companyPeriods(snapshots['Apple Inc.']);
  const prior = priorPeriod(ps, ps.find(p => p.key === 'fy2025-q3'));
  assert.equal(prior.key, 'fy2024-q3');
  assert.equal(prior.end, '2024-06-29');
});
