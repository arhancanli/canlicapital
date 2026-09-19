import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCompanyCatalog } from './lib/build-company-catalog.mjs';
import { createCompanyCatalog, catalogHash, CATALOG_LIMITS } from '../api/_lib/company-catalog.js';
import { createHttpCatalogReader } from '../api/_lib/company-catalog-http.js';
import { createCompanyHandler } from '../api/v1/companies/[cik].js';
const synthetic = n => ({ schema: 'canli.company-reference.v1', cik: String(n).padStart(10, '0'), name: `Synthetic test ${n}` });
function fixture(t, count = 20) {
  const directory = mkdtempSync(resolve(tmpdir(), 'canli-catalog-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const records = Array.from({ length: count }, (_, n) => synthetic(n * 2 + 2));
  const manifest = buildCompanyCatalog(records, directory, { fanout: 3 });
  const readObject = async hash => readFileSync(resolve(directory, 'objects', hash + '.json'));
  return { directory, manifest, records, readObject };
}
test('range tree returns all records, boundary/gap misses and bounded cached reads', async t => {
  const { manifest, records, readObject } = fixture(t);
  const catalog = createCompanyCatalog({ rootHash: manifest.root_hash, readObject, cacheBytes: 1024 });
  for (const record of records) assert.deepEqual(await catalog.getCompany(record.cik), record);
  for (const cik of ['0000000001', '0000000003', '9999999999']) assert.equal(await catalog.getCompany(cik), null);
  const cold = createCompanyCatalog({ rootHash: manifest.root_hash, readObject });
  await cold.getCompany(records[0].cik);
  assert.equal(cold.stats().objectReads, manifest.index_levels + 1);
  const before = cold.stats().objectReads;
  await cold.getCompany(records[0].cik);
  assert.equal(cold.stats().objectReads, before);
  assert.ok(catalog.stats().cachedBytes <= 1024);
});
test('failed build preserves the prior activation pointer', t => {
  const { directory, manifest } = fixture(t);
  assert.throws(() => buildCompanyCatalog([synthetic(1), synthetic(1)], directory), /duplicate/);
  assert.equal(JSON.parse(readFileSync(resolve(directory, 'catalog.json'))).root_hash, manifest.root_hash);
});
test('corruption throws rather than becoming a missing company', async t => {
  const { directory, manifest, readObject } = fixture(t);
  writeFileSync(resolve(directory, 'objects', manifest.root_hash + '.json'), '{}');
  const catalog = createCompanyCatalog({ rootHash: manifest.root_hash, readObject });
  await assert.rejects(catalog.getCompany('0000000002'), /hash mismatch/);
});
test('hash-valid overlapping ranges are invalid, and invalid identities do not read storage', async () => {
  const entry = { name: 'Synthetic test', first: '0000000002', last: '0000000002', count: 1, hash: 'a'.repeat(64), bytes: 20 };
  const bytes = Buffer.from(JSON.stringify({ schema: 'canli.company-catalog-node.v1', level: 0, entries: [entry, entry] }));
  let reads = 0;
  const catalog = createCompanyCatalog({ rootHash: catalogHash(bytes), readObject: async () => { reads++; return bytes; } });
  await assert.rejects(catalog.getCompany('../etc/passwd'), /CIK/); assert.equal(reads, 0);
  await assert.rejects(catalog.getCompany('0000000002'), /overlapping/);
});
test('HTTP storage reader bounds streaming bytes and treats object 404 as unavailable', async () => {
  const hash = 'a'.repeat(64);
  const over = createHttpCatalogReader({ baseUrl: 'https://storage.example/catalog/', fetcher: async () => new Response('too many bytes') });
  await assert.rejects(over(hash, 4), /byte limit/);
  const missing = createHttpCatalogReader({ baseUrl: 'https://storage.example/', fetcher: async () => new Response('', { status: 404 }) });
  await assert.rejects(missing(hash, 100), /unavailable/);
  assert.throws(() => createHttpCatalogReader({ baseUrl: 'https://user:secret@storage.example/' }), /fixed HTTPS/);
});
async function request(handler, { method = 'GET', cik = '0000000002', headers = {} } = {}) {
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } };
  await handler({ method, query: { cik }, headers }, response); return response;
}
test('endpoint distinguishes success, ETag/HEAD, real misses, outages and unsupported methods', async t => {
  const { manifest, readObject } = fixture(t);
  const handler = createCompanyHandler({ catalog: createCompanyCatalog({ rootHash: manifest.root_hash, readObject }) });
  const ok = await request(handler); assert.equal(ok.statusCode, 200); assert.equal(JSON.parse(ok.body).cik, '0000000002');
  const unchanged = await request(handler, { headers: { 'if-none-match': `W/${ok.headers.ETag}` } }); assert.equal(unchanged.statusCode, 304); assert.equal(unchanged.body, undefined);
  assert.equal((await request(handler, { method: 'HEAD' })).body, undefined);
  assert.equal((await request(handler, { cik: '0000000003' })).statusCode, 404);
  assert.equal((await request(handler, { method: 'POST' })).statusCode, 405);
  const down = await request(createCompanyHandler({ catalog: { getCompany: async () => { throw new Error('storage down'); } } }));
  assert.equal(down.statusCode, 503); assert.equal(down.headers['Cache-Control'], 'no-store');
});

test('concurrent cold reads retain an accurate bounded cache', async t => {
  const { manifest, readObject } = fixture(t);
  const catalog = createCompanyCatalog({ rootHash: manifest.root_hash, readObject });
  await Promise.all(Array.from({ length: 20 }, () => catalog.getCompany('0000000002')));
  const before = catalog.stats();
  assert.equal(before.cachedObjects, manifest.index_levels + 1);
  assert.ok(before.cachedBytes <= CATALOG_LIMITS.cacheBytes);
  await catalog.getCompany('0000000002');
  assert.equal(catalog.stats().objectReads, before.objectReads);
  assert.equal(catalog.stats().cachedBytes, before.cachedBytes);
});

test('directory cursors cover every entity once without reading financial records', async t => {
  const { manifest, records, readObject } = fixture(t, 80);
  let recordReads = 0;
  const catalog = createCompanyCatalog({ rootHash: manifest.root_hash, readObject: async hash => {
    const bytes = await readObject(hash);
    if (JSON.parse(bytes).schema === 'canli.company-reference.v1') recordReads++;
    return bytes;
  } });
  let after = '', found = [];
  do { const page = await catalog.listCompanies({ after, limit: 7 }); found.push(...page.companies); after = page.next; } while (after);
  assert.deepEqual(found, records.map(({ cik, name }) => ({ cik, name })));
  assert.equal(recordReads, 0);
  await assert.rejects(catalog.listCompanies({ limit: 51 }), /limit/);
});
test('long Unicode issuer names split nodes by bytes without truncation', t => {
  const { directory } = fixture(t, 1);
  const records = Array.from({ length: 128 }, (_, n) => ({ ...synthetic(n + 1), name: '界'.repeat(1000) + n }));
  const manifest = buildCompanyCatalog(records, directory);
  assert.ok(manifest.index_nodes > 2);
});

test('directory HTTP contract rejects oversized pages and changed revisions', async t => {
  const { createCompanyDirectoryHandler } = await import('../api/v1/companies/index.js');
  const { manifest, readObject } = fixture(t);
  const handler = createCompanyDirectoryHandler({ catalog: createCompanyCatalog({ rootHash: manifest.root_hash, readObject }) });
  const call = async query => {
    const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
    await handler({ method: 'GET', query, headers: {} }, response); return response;
  };
  const first = await call({ limit: '3' }); assert.equal(first.statusCode, 200);
  const page = JSON.parse(first.body); assert.equal(page.companies.length, 3); assert.equal(page.next, '0000000006');
  assert.equal((await call({ limit: '51' })).statusCode, 400);
  assert.equal((await call({ revision: 'old' })).statusCode, 409);
  assert.equal((await call({ after: page.next, revision: page.revision })).statusCode, 200);
});

test('single-writer lock prevents a competing build from moving the pointer', t => {
  const { directory, manifest } = fixture(t);
  writeFileSync(resolve(directory, '.catalog-build.lock'), 'test-held-lock');
  assert.throws(() => buildCompanyCatalog([synthetic(1)], directory), /EEXIST/);
  assert.equal(JSON.parse(readFileSync(resolve(directory, 'catalog.json'))).root_hash, manifest.root_hash);
});
test('public read endpoint supports browser CORS preflight without touching storage', async () => {
  const response = await request(createCompanyHandler({ catalog: { getCompany: async () => assert.fail('preflight does not read data') } }), { method: 'OPTIONS' });
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
  assert.equal(response.headers['Access-Control-Allow-Headers'], 'If-None-Match');
});
