import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitCommitDate } from './lastmod.mjs';
import { COMPANY_MARKUP_DATE, COMPANY_MARKUP_SOURCES, companyLastmod } from './lib/company-markup-date.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('the company markup date is not older than any company template commit', () => {
  for (const file of COMPANY_MARKUP_SOURCES) {
    assert.ok(existsSync(resolve(ROOT, file)), `${file} is listed but missing`);
    const date = gitCommitDate(ROOT, file);
    if (date) assert.ok(date <= COMPANY_MARKUP_DATE, `${file} changed on ${date}; move COMPANY_MARKUP_DATE (now ${COMPANY_MARKUP_DATE}) in the same commit`);
  }
});

test('a page date is the later of its data date and the markup date', () => {
  assert.equal(companyLastmod('2026-09-20'), COMPANY_MARKUP_DATE);
  assert.equal(companyLastmod('2099-01-01'), '2099-01-01');
  assert.equal(companyLastmod(undefined), COMPANY_MARKUP_DATE);
});
