import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { createCompanyDownloadHandler } from '../api/_lib/company-download.js';

function response() {
  const headers = {};
  return { headers, statusCode: 0, setHeader(k, v) { headers[k.toLowerCase()] = v; }, end() { this.ended = true; } };
}
const bytes = Buffer.from('{"schema":"canli.company-reference.v1"}');
const descriptor = { path: '/company-data/0000320193.json', bytes: bytes.length, sha256: catalogHash(bytes) };

test('a verified company download is edge-cached like an admitted company page', async () => {
  const handler = createCompanyDownloadHandler({ index: { find: async () => descriptor }, readDownload: async () => bytes });
  const res = response();
  await handler({ method: 'GET', query: { path: descriptor.path } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  assert.equal(res.headers['x-robots-tag'], 'noindex');
});

test('a missing, corrupt or unavailable download is never cached', async () => {
  for (const [index, readDownload, status] of [
    [{ find: async () => null }, async () => bytes, 404],
    [{ find: async () => descriptor }, async () => Buffer.from('tampered'), 503],
    [null, null, 503],
  ]) {
    const res = response();
    await createCompanyDownloadHandler({ index, readDownload })({ method: 'GET', query: { path: descriptor.path } }, res);
    assert.equal(res.statusCode, status);
    assert.equal(res.headers['cache-control'], 'no-store');
  }
});
