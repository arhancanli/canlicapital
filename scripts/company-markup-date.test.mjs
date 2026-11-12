import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPANY_MARKUP_DATE, companyLastmod } from './lib/company-markup-date.mjs';

test('a page date is its data date, so a template change does not re-date every company page', () => {
  assert.equal(companyLastmod('2026-09-20'), '2026-09-20');
  assert.equal(companyLastmod('2099-01-01'), '2099-01-01');
  assert.equal(companyLastmod(undefined), COMPANY_MARKUP_DATE);
});
