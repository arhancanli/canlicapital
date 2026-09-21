import test from 'node:test';
import { createConfiguredCompanyReference } from '../api/_lib/company-reference-runtime.js';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { buildCompanyCatalog } from './lib/build-company-catalog.mjs';
import { buildCompanyDownloadIndex } from './lib/build-company-download-index.mjs';
import { buildCompanyAssets } from './lib/company-assets.mjs';
import { createCompanyReleaseLoader, createCompanyReferenceHandler } from '../api/_lib/company-release.js';

function fixture(t) {
  const dir = mkdtempSync(resolve(tmpdir(), 'canli-release-runtime-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const record = JSON.parse(readFileSync('public/company-data/0000029534.json'));
  const catalog = buildCompanyCatalog([record], dir);
  const bytes = Buffer.from(JSON.stringify(record)), hash = catalogHash(bytes);
  const item = { path: `/company-data/${record.cik}.json`, sha256: hash, storage_path: `objects/${hash}.json`, bytes: bytes.length };
  const downloads = buildCompanyDownloadIndex([item], dir);
  const release = Buffer.from(JSON.stringify({ schema: 'canli.company-release.v1', catalog_root: catalog.root_hash, download_root: downloads.root_hash, companies: 1, histories: record.concepts.length, publication_approved: true }));
  return { record, release, options: { releaseHash: catalogHash(release), readReleaseObject: async () => release, readCatalogObject: async hash => readFileSync(resolve(dir, `objects/${hash}.json`)), readDownloadIndexObject: async hash => readFileSync(resolve(dir, `objects/${hash}.json`)), readDownload: async () => bytes, assets: buildCompanyAssets(readFileSync('companies/0000029534.html', 'utf8'), '<link rel="stylesheet" href="/assets/company.css">') } };
}
test('one verified release serves HTML, directory and download; remote approval cannot turn on indexing', async t => {
  const { options, record } = fixture(t);
  const loadRelease = createCompanyReleaseLoader(options);
  const handler = createCompanyReferenceHandler({ loadRelease });
  for (const path of [`/companies/${record.cik}`, '/companies', `/company-data/${record.cik}.json`]) {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
    await handler({ method: 'GET', query: { path }, headers: {} }, res);
    assert.equal(res.statusCode, 200); assert.equal(res.headers['X-Robots-Tag'], 'noindex');
  }
  assert.equal((await loadRelease()).catalog.revision, JSON.parse((await options.readReleaseObject()).toString()).catalog_root);
});
test('concurrent loading shares validation and transient failure recovers without caching a fake empty release', async t => {
  const { options, release } = fixture(t); let reads = 0;
  const load = createCompanyReleaseLoader({ ...options, readReleaseObject: async () => { if (++reads === 1) throw new Error('offline'); return release; } });
  const failures = await Promise.allSettled([load(), load()]);
  assert.ok(failures.every(result => result.status === 'rejected')); assert.equal(reads, 1);
  const [one, two] = await Promise.all([load(), load()]); assert.equal(one, two); assert.equal(reads, 2);
});
test('corrupt release bytes and count mismatch fail rather than mixing roots', async t => {
  const { options, release } = fixture(t);
  await assert.rejects(createCompanyReleaseLoader({ ...options, readReleaseObject: async () => Buffer.from('{}') })(), /byte binding/);
  const altered = Buffer.from(JSON.stringify({ ...JSON.parse(release), companies: 2, histories: 8 }));
  await assert.rejects(createCompanyReleaseLoader({ ...options, releaseHash: catalogHash(altered), readReleaseObject: async () => altered })(), /count does not match/);
});


test('configured public wrapper uses bounded HTTP storage, compiled assets and a pinned release; missing config fails closed', async t => {
  const { options, release, record } = fixture(t);
  let requests = 0;
  const environment = () => ({ COMPANY_RELEASE_HASH: options.releaseHash, COMPANY_CATALOG_BASE_URL: 'https://store.example/catalog', COMPANY_DELIVERY_BASE_URL: 'https://store.example/delivery' });
  const handler = createConfiguredCompanyReference({ environment, readAssets: () => Buffer.from(JSON.stringify(options.assets)), fetcher: async (url, settings) => {
    assert.equal(settings.redirect, 'error'); requests++;
    const hash = url.pathname.split('/').at(-1).replace('.json', '');
    if (hash === options.releaseHash) return new Response(release);
    try { return new Response(await options.readCatalogObject(hash)); }
    catch { return new Response(await options.readDownload()); }
  } });
  const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } });
  const res = response();
  await handler({ method: 'GET', query: { path: '/companies/' + record.cik }, headers: {} }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.headers['X-Robots-Tag'], 'noindex'); assert.match(res.body, /assets\/company.css/); assert.ok(requests > 0);
  const missing = createConfiguredCompanyReference({ environment: () => ({}), loadActivation: () => ({ enabled: false }), readAssets: () => { throw new Error('Should not load assets'); } });
  const down = response(); await missing({ method: 'GET', query: { path: '/companies' } }, down);
  assert.equal(down.statusCode, 503); assert.equal(down.headers['Cache-Control'], 'no-store');
});
