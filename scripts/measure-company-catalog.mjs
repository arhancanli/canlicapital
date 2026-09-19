import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createCompanyCatalog, catalogHash } from '../api/_lib/company-catalog.js';
import { createCompanyHandler } from '../api/v1/companies/[cik].js';
import { createCompanyDirectoryHandler } from '../api/v1/companies/index.js';
const [directory, sources, output] = process.argv.slice(2);
if (!directory || !sources || !output) throw new Error('Usage: node scripts/measure-company-catalog.mjs CATALOG_DIRECTORY CAPTURE_DIRECTORY REPORT.json');
const manifest = JSON.parse(readFileSync(resolve(directory, 'catalog.json')));
const ciks = JSON.parse(readFileSync(resolve(sources, 'ciks.json'))).sort();
let largestRead = 0;
const catalog = createCompanyCatalog({ rootHash: manifest.root_hash, readObject: async (hash, limit) => {
  const path = resolve(directory, 'objects', hash + '.json');
  assert.ok(statSync(path).size <= limit); const bytes = readFileSync(path);
  largestRead = Math.max(largestRead, bytes.length); return bytes;
} });
const company = createCompanyHandler({ catalog }), listing = createCompanyDirectoryHandler({ catalog });
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  req.query = Object.fromEntries(url.searchParams);
  if (url.pathname === '/api/v1/companies') void listing(req, res);
  else { req.query.cik = url.pathname.split('/').at(-1); void company(req, res); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const times = []; let firstTag;
  for (const cik of ciks) {
    const start = performance.now();
    const response = await fetch(`${base}/api/v1/companies/${cik}`);
    assert.equal(response.status, 200);
    const record = await response.json(); times.push(performance.now() - start);
    assert.deepEqual(record, JSON.parse(readFileSync(resolve(sources, cik + '.record.json'))));
    if (!firstTag) firstTag = response.headers.get('etag');
  }
  assert.equal((await fetch(`${base}/api/v1/companies/${ciks[0]}`, { headers: { 'If-None-Match': firstTag } })).status, 304);
  const head = await fetch(`${base}/api/v1/companies/${ciks[0]}`, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.ok(!ciks.includes('0000000001'));
  assert.equal((await fetch(`${base}/api/v1/companies/0000000001`)).status, 404);
  const beforeDirectory = catalog.stats(); let after = '', listed = [], pages = 0;
  do {
    const params = new URLSearchParams({ after, limit: '50', revision: manifest.root_hash });
    const response = await fetch(`${base}/api/v1/companies?${params}`);
    assert.equal(response.status, 200); const page = await response.json();
    listed.push(...page.companies.map(row => row.cik)); after = page.next; pages++;
  } while (after);
  assert.deepEqual(listed, ciks);
  const sorted = [...times].sort((a, b) => a - b);
  const report = { schema: 'canli.company-catalog-measurement.v1', measured_at: new Date().toISOString(), scope: 'Local Node HTTP server and filesystem, sequential requests, warm OS cache; not cloud latency, field performance, load capacity or indexing evidence', manifest, records_reproduced_over_http: times.length, directory_pages: pages, largest_object_read: largestRead, catalog_stats: catalog.stats(), directory_additional_object_reads: catalog.stats().objectReads - beforeDirectory.objectReads, milliseconds: { first_request: times[0], median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1) }, code_sha256: Object.fromEntries(['api/_lib/company-catalog.js', 'api/_lib/company-catalog-http.js', 'api/v1/companies/[cik].js', 'api/v1/companies/index.js'].map(path => [path, catalogHash(readFileSync(path))])) };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
} finally { await new Promise(done => server.close(done)); }
