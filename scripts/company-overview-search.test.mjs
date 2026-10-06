import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { overviewDescription, overviewHeadlines, overviewTitle } from './lib/company-overview-search.mjs';
import { renderCompanyPages } from './lib/company-page-renderer.mjs';
import { DESCRIPTION_MAX } from './lib/descriptions.mjs';

const apple = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
const row = (end, val, filed = end) => ({ start: `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`, end, val, unit: 'USD', filed, form: '10-K', accn: '0000000000-00-000000' });
const concept = (tag, rows) => ({ tag, label: tag, kind: 'duration', observations: rows });

test('the revenue tag with the latest period wins over an older one', () => {
  const [revenue] = overviewHeadlines(apple.concepts, apple.fetched_at);
  assert.equal(revenue.word, 'Revenue');
  assert.equal(revenue.concept.tag, 'RevenueFromContractWithCustomerExcludingAssessedTax');
  assert.ok(revenue.summary.latest.end > '2018-09-29');
});

test('a headline whose latest period is more than two years before capture is not named', () => {
  const concepts = [concept('Revenues', [row('2009-12-31', 5), row('2010-12-31', 6)]), concept('NetIncomeLoss', [row('2025-12-31', 1)])];
  assert.deepEqual(overviewHeadlines(concepts, '2026-09-19T00:00:00Z').map(item => item.word), ['Net Income']);
  assert.equal(overviewTitle('ACME (ACM)', concepts, '2026-09-19T00:00:00Z'), 'ACME (ACM): Net Income & SEC Financials');
  assert.doesNotMatch(overviewDescription('ACME', concepts, 2, '2026-09-19T00:00:00Z'), /revenue/i);
});

test('without a current headline measure the title and description stay generic', () => {
  const concepts = [concept('Liabilities', [row('2025-12-31', 1)])];
  assert.equal(overviewTitle('ACME', concepts, '2026-09-19T00:00:00Z'), 'ACME: SEC financial data');
  assert.match(overviewDescription('ACME', concepts, 1, '2026-09-19T00:00:00Z'), /^Explore ACME financial histories/);
});

test('the overview snippet leads with the latest revenue and its period, whole and within the ceiling', () => {
  const html = renderCompanyPages({ ...apple, source_snapshot: `/company-data/sources/${apple.source_sha256}.json.gz` }, { target: 'overview' })[0].html;
  assert.match(html, /<title>Apple \(AAPL\): Revenue, Net Income &amp; SEC Financials<\/title>/);
  const description = html.match(/name="description" content="([^"]*)"/)[1];
  assert.match(description, /^Apple revenue: \$\d+(\.\d)? billion for the year ending \d{4}-\d{2}-\d{2}/);
  assert.ok(description.length <= DESCRIPTION_MAX);
  assert.doesNotMatch(description, /…$/);
});
