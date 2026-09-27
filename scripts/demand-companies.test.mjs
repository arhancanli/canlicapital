import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectDemandCompanies, demandCompanies, DEMAND_COMPANIES_LIMIT } from './lib/demand-companies.mjs';
import { renderProductShellFooter } from './product-shell.mjs';

const capture = (companies) => ({ schema: 'canli.search-demand-companies.v1', captured: '2026-09-27', companies });
const entry = (cik, impressions, name = `Company ${cik}`) => ({ cik, name, impressions });

test('companies rank by impressions, only admitted overviews are linked, and the list is bounded', () => {
  const admission = { companies: { '0000000001': { overview: true }, '0000000002': { overview: false }, '0000000003': { overview: true } } };
  const picked = selectDemandCompanies(capture([entry('0000000003', 5), entry('0000000002', 50), entry('0000000001', 9), entry('0000000004', 99)]), admission);
  assert.deepEqual(picked.companies.map(c => c.cik), ['0000000001', '0000000003'], 'withheld and unknown companies drop out');
  assert.equal(picked.companies[0].href, '/companies/0000000001');
  const many = capture(Array.from({ length: 30 }, (_, i) => entry(String(i + 1).padStart(10, '0'), 100 - i)));
  const all = { companies: Object.fromEntries(many.companies.map(c => [c.cik, { overview: true }])) };
  assert.equal(selectDemandCompanies(many, all).companies.length, DEMAND_COMPANIES_LIMIT);
  assert.deepEqual(selectDemandCompanies(capture([entry('0000000001', 9)]), null).companies, [], 'no activation links nothing');
});

test('an invalid capture fails the build instead of rendering a partial list', () => {
  assert.throws(() => selectDemandCompanies({ ...capture([]), schema: 'other' }, {}), /Invalid search demand capture/);
  assert.throws(() => selectDemandCompanies(capture([entry('0000000001', 0)]), {}), /Invalid search demand entry/);
  assert.throws(() => selectDemandCompanies(capture([entry('123', 3)]), {}), /Invalid search demand entry/);
  assert.throws(() => selectDemandCompanies(capture([entry('0000000001', 3), entry('0000000001', 4)]), {}), /Duplicate/);
});

test('the committed capture links admitted companies, and the home, research and developer pages carry exactly that list', () => {
  const { companies } = demandCompanies();
  assert.equal(companies.length, DEMAND_COMPANIES_LIMIT);
  const activation = JSON.parse(readFileSync('config/company-production-activation.json', 'utf8'));
  const admission = JSON.parse(readFileSync(activation.admission.path, 'utf8'));
  for (const company of companies) assert.equal(admission.companies[company.cik]?.overview, true, company.cik);
  const nav = renderProductShellFooter({ companies }).match(/ {4}<nav aria-label="Company records searched most">[\s\S]*?<\/nav>\n/)[0];
  for (const page of ['index.html', 'research.html', 'developers.html']) {
    const html = readFileSync(page, 'utf8');
    assert.equal(html.split(nav).length, 2, `${page} carries the generated list once`);
  }
  for (const page of ['systems.html', 'open.html', 'progress.html', 'performance.html']) assert.ok(!readFileSync(page, 'utf8').includes('Company records searched most'), page);
  assert.ok(!renderProductShellFooter().includes('Company records searched most'), 'other pages keep their footer');
});

test('footer landmarks stay unique with the company list', () => {
  const labels = [...renderProductShellFooter({ companies: demandCompanies().companies }).matchAll(/aria-label="([^"]*)"/g)].map(m => m[1]);
  assert.equal(new Set(labels).size, labels.length);
});
