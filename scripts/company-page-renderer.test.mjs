import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { renderCompanyPages } from './lib/company-page-renderer.mjs';
import { buildCompanyAssets, applyCompanyAssets } from './lib/company-assets.mjs';
import { createCompanyHtmlHandler } from '../api/_lib/company-html.js';
const company = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
const source = readFileSync(new URL('../companies/0000320193/Assets.html', import.meta.url), 'utf8');
const assets = buildCompanyAssets(source, '<script type="module" src="/assets/company.js"></script><link rel="stylesheet" href="/assets/company.css">');

test('shared renderer preserves every current pilot company page byte-for-byte', () => {
  for (const name of readdirSync(new URL('../public/company-data/', import.meta.url)).filter(name => /^\d{10}\.json$/.test(name))) {
    const record = JSON.parse(readFileSync(new URL('../public/company-data/' + name, import.meta.url)));
    for (const page of renderCompanyPages(record)) assert.equal(page.html, readFileSync(new URL('../' + page.path.slice(1) + '.html', import.meta.url), 'utf8'));
  }
});
test('one history keeps its coverage, source download, canonical and developer entry points', () => {
  const [page] = renderCompanyPages(company, { target: 'Revenues' });
  assert.match(page.html, /ends more than two years before capture/);
  assert.ok(page.html.includes(company.source_snapshot));
  assert.ok(page.html.includes('href="https://canlicapital.com/companies/0000320193/Revenues"'));
  assert.match(page.html, /developers#ai-assistant/);
  assert.deepEqual(renderCompanyPages(company, { target: 'MadeUpKeyword' }), []);
});
test('asset bridge removes source-only imports and rejects stale bundles', () => {
  const html = applyCompanyAssets(renderCompanyPages(company, { target: 'overview' })[0].html, assets);
  assert.match(html, /src="\/assets\/company.js"/); assert.ok(!html.includes('src="/js/'));
  assert.throws(() => applyCompanyAssets(source + '<script type="module" src="/js/new.js"></script>', assets), /resource contract/);
});
test('issuer text cannot escape HTML or JSON-LD', () => {
  const record = { ...company, name: '</script><script>alert(1)</script>' };
  const html = renderCompanyPages(record, { target: 'overview' })[0].html;
  assert.ok(!html.includes('<script>alert(1)</script>'));
  const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.equal(data[0].creator.name, record.name);
});
async function call(handler, query) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
  await handler({ method: 'GET', query, headers: {} }, res); return res;
}
test('HTML serving distinguishes missing content from outages and stays noindex while staged', async () => {
  const handler = createCompanyHtmlHandler({ catalog: { getCompany: async cik => cik === company.cik ? company : null }, assets });
  const ok = await call(handler, { cik: company.cik, concept: 'Revenues' });
  assert.equal(ok.statusCode, 200); assert.equal(ok.headers['X-Robots-Tag'], 'noindex');
  assert.equal((await call(handler, { cik: company.cik, concept: 'NotReal' })).statusCode, 404);
  for (const concept of ['all', 'overview']) assert.equal((await call(handler, { cik: company.cik, concept })).statusCode, 404);
  assert.equal((await call(handler, { cik: '9999999999' })).statusCode, 404);
  const down = createCompanyHtmlHandler({ catalog: { getCompany: async () => { throw new Error('storage unavailable'); } }, assets });
  assert.equal((await call(down, { cik: company.cik })).statusCode, 503);
});
