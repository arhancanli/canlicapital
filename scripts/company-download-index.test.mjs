import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { DOWNLOAD_LIMITS, createCompanyDownloadIndex, validateDownloadNode } from '../api/_lib/company-download-index.js';
import { createCompanyDownloadHandler, createHttpDownloadReader } from '../api/_lib/company-download.js';
import { buildCompanyDownloadIndex } from './lib/build-company-download-index.mjs';
const bytes = Buffer.from('{}\n'), hash = catalogHash(bytes);
const descriptor = cik => ({ path: `/company-data/${String(cik).padStart(10, '0')}.json`, storage_path: `objects/${hash}.json`, sha256: hash, bytes: bytes.length });

test('bounded download index resolves every path concurrently with real misses and bounded cache', async t => {
  const directory = mkdtempSync(resolve(tmpdir(), 'canli-download-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const items = Array.from({ length: 1500 }, (_, i) => descriptor(i + 1));
  const built = buildCompanyDownloadIndex(items, directory);
  assert.ok(built.max_depth > 1);
  const index = createCompanyDownloadIndex({ rootHash: built.root_hash, readObject: async (hash, limit) => {
    const bytes = readFileSync(resolve(directory, `objects/${hash}.json`)); assert.ok(bytes.length <= limit); return bytes;
  } });
  for (let offset = 0; offset < items.length; offset += 50) {
    const group = items.slice(offset, offset + 50);
    assert.deepEqual(await Promise.all(group.map(item => index.find(item.path))), group);
  }
  assert.equal(await index.find(descriptor(9999).path), null);
  assert.equal(await index.find('/company-data/../../private'), null);
  assert.ok(index.stats().cachedBytes <= DOWNLOAD_LIMITS.cacheBytes);
  assert.throws(() => buildCompanyDownloadIndex([items[0], items[0]], directory), /duplicate/);
});
test('corrupt storage and invalid path-prefix bindings fail closed', async () => {
  const index = createCompanyDownloadIndex({ rootHash: 'a'.repeat(64), readObject: async () => Buffer.from('{}') });
  await assert.rejects(index.find(descriptor(1).path), /Corrupt/);
  const item = descriptor(1), prefix = catalogHash(item.path)[0] === 'a' ? 'b' : 'a';
  assert.throws(() => validateDownloadNode({ schema: 'canli.company-download-node.v1', prefix, entries: [item] }, prefix), /ordering/);
});
test('HTTP download reader bounds response bytes and verifies exact compressed or selected object hashes', async () => {
  const item = descriptor(1);
  const reader = createHttpDownloadReader({ baseUrl: 'https://storage.example/revision', fetcher: async (url, options) => {
    assert.equal(url.pathname, '/revision/' + item.storage_path); assert.equal(options.redirect, 'error'); return new Response(bytes);
  } });
  assert.deepEqual(await reader(item), bytes);
  const corrupted = createHttpDownloadReader({ baseUrl: 'https://storage.example', fetcher: async () => new Response('bad') });
  await assert.rejects(corrupted(item), /binding/);
  const oversized = createHttpDownloadReader({ baseUrl: 'https://storage.example', fetcher: async () => new Response('too long') });
  await assert.rejects(oversized(item), /byte limit/);
  assert.throws(() => createHttpDownloadReader({ baseUrl: 'http://storage.example' }), /HTTPS/);
});
test('download endpoint preserves source bytes and distinguishes absence from source/index outage', async () => {
  async function call(index, readDownload = async () => bytes, method = 'GET') {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
    await createCompanyDownloadHandler({ index, readDownload })({ method, query: { path: descriptor(1).path } }, res); return res;
  }
  const available = { find: async () => descriptor(1) };
  const ok = await call(available); assert.equal(ok.statusCode, 200); assert.deepEqual(ok.body, bytes); assert.equal(ok.headers['X-Robots-Tag'], 'noindex');
  const head = await call(available, undefined, 'HEAD'); assert.equal(head.statusCode, 200); assert.equal(head.body, undefined);
  assert.equal((await call({ find: async () => null })).statusCode, 404);
  assert.equal((await call({ find: async () => { throw new Error('outage'); } })).statusCode, 503);
  assert.equal((await call(available, async () => Buffer.from('bad'))).statusCode, 503);
});
