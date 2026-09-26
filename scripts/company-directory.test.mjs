import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { directoryNavigation, FLAT_DIRECTORY_PAGES, renderCompanyDirectory } from './lib/company-directory.mjs';
import { buildCompanyAssets } from './lib/company-assets.mjs';
import { createCompanyDirectoryHandler } from '../api/_lib/company-directory-html.js';

test('bounded directory navigation reaches all 20,000 synthetic pages in four links', () => {
  const total = 20_000, reached = new Map([[1, 0]]), queue = [1];
  for (let index = 0; index < queue.length; index++) {
    const page = queue[index];
    for (const link of directoryNavigation(page, total).flatMap(group => group.links)) {
      if (!reached.has(link.first)) { reached.set(link.first, reached.get(page) + 1); queue.push(link.first); }
    }
  }
  assert.equal(reached.size, total); assert.ok(Math.max(...reached.values()) <= 4);
  for (const page of [1, 20, 21, 400, 401, 20_000, 199_999_999, 200_000_000]) {
    const groups = directoryNavigation(page, 200_000_000);
    assert.ok(groups.every(group => group.links.length <= 20));
    assert.ok(groups.flatMap(group => group.links).length <= 140);
  }
});
test('a directory of up to FLAT_DIRECTORY_PAGES pages links every page from every page', () => {
  for (const total of [1, 256, FLAT_DIRECTORY_PAGES]) {
    for (const page of [1, Math.ceil(total / 2), total]) {
      const links = directoryNavigation(page, total).flatMap(group => group.links);
      assert.deepEqual(links.map(link => link.first), Array.from({ length: total }, (_, i) => i + 1));
      assert.ok(links.every(link => link.first === link.last));
    }
  }
  assert.ok(directoryNavigation(1, FLAT_DIRECTORY_PAGES + 1).flatMap(group => group.links).length < FLAT_DIRECTORY_PAGES, 'larger directories keep the bounded hierarchy');
});
const listing = { page: 2, pages: 3, total: 101, companies: [{ cik: '0000000051', name: '<script>Issuer</script>' }] };
const source = readFileSync('companies/0000029534.html', 'utf8');
const assets = buildCompanyAssets(source, '<link rel="stylesheet" href="/assets/company.css">');
test('directory has unique range description, escaped issuer, canonical breadcrumb and bounded navigation', () => {
  const { html } = renderCompanyDirectory(listing);
  assert.ok(!html.includes('<script>Issuer</script>'));
  assert.match(html, /CIK 0000000051 to 0000000051/);
  assert.match(html, /rel="canonical" href="https:\/\/canlicapital.com\/companies\/page\/2"/);
  assert.match(html, /rel="prev" href="\/companies"/);
  assert.match(html, /rel="next" href="\/companies\/page\/3"/);
  assert.match(html, /developers#ai-assistant/);
});
test('directory HTTP handler returns genuine 404s, outages as 503, conditional responses and staged noindex', async () => {
  async function call(catalog, page = '2', method = 'GET', headers = {}) {
    const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
    await createCompanyDirectoryHandler({ catalog, assets })({ method, query: { page }, headers }, response); return response;
  }
  const catalog = { directoryPage: async page => page === 2 ? listing : null };
  const ok = await call(catalog); assert.equal(ok.statusCode, 200); assert.equal(ok.headers['X-Robots-Tag'], 'noindex');
  assert.equal((await call(catalog, '2', 'GET', { 'if-none-match': ok.headers.ETag })).statusCode, 304);
  assert.equal((await call(catalog, '2', 'HEAD')).body, undefined);
  for (const page of ['0', '02', '9999999999', 'nope', '4']) assert.equal((await call(catalog, page)).statusCode, 404);
  assert.equal((await call({ directoryPage: async () => { throw new Error('offline'); } })).statusCode, 503);
});
