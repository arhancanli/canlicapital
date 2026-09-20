import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { verifyStagedResponse } from './lib/hosted-company-http.mjs';

// Audits the explicit staging wrapper. Clean canonical routing is a separate gate.
const [originText, manifestPath, manifestHash, output, mode = 'ready', routing = 'explicit'] = process.argv.slice(2);
if (!output || !['ready', 'unavailable'].includes(mode) || !['explicit', 'clean'].includes(routing)) throw new Error('Usage: node scripts/audit-hosted-company-staging.mjs HTTPS_ORIGIN DELIVERY_MANIFEST SHA256 NEW_REPORT [ready|unavailable] [explicit|clean]');
const origin = new URL(originText);
assert.equal(origin.protocol, 'https:'); assert.equal(origin.pathname, '/');
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash);
assert.ok(!existsSync(output), 'Preserve existing reports');
const rawManifest = readFileSync(manifestPath);
assert.equal(catalogHash(rawManifest), manifestHash);
const manifest = JSON.parse(rawManifest);
assert.equal(manifest.schema, 'canli.company-delivery.v1');
assert.ok(manifest.files.length > 0);
const report = { schema: 'canli.hosted-company-staging-audit.v1', origin: origin.origin,
  manifest_sha256: manifestHash, mode, routing, publication_approved: false, complete: false,
  checks: [], failures: [], code_sha256: catalogHash(readFileSync(new URL(import.meta.url))),
  http_contract_sha256: catalogHash(readFileSync(new URL('./lib/hosted-company-http.mjs', import.meta.url))),
  scope: 'Representative noindex staging sample in the recorded routing mode. Not production activation, complete corpus HTTP verification, indexing evidence or a cloud-load benchmark.' };
const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
save();
const verifiedRepresentations = new Map();
async function check(path, method, status, inspect = () => {}, headers = {}) {
  const url = new URL(routing === 'clean' ? path : '/api/v1/company-reference', origin);
  if (routing === 'explicit') url.searchParams.set('path', path);
  const start = performance.now();
  try {
    const response = await fetch(url, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(70000) });
    const chunks = []; let length = 0;
    for await (const chunk of response.body ?? []) {
      length += chunk.length; assert.ok(length <= 16 * 1024 * 1024, 'Oversized HTTP response'); chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    const result = { path, method, status: response.status, bytes: length,
      elapsed_ms: Math.round(performance.now() - start), sha256: catalogHash(bytes),
      robots: response.headers.get('x-robots-tag'), cache_control: response.headers.get('cache-control'), etag: response.headers.get('etag') };
    report.checks.push(result);
    assert.equal(response.status, status, `${method} ${path}`);
    const prior = verifiedRepresentations.get(path);
    verifyStagedResponse({ path, method, status: response.status, headers: response.headers,
      bytes, requestETag: headers['If-None-Match'], prior });
    if (response.status === 304) result.validation_of = { path: prior.path, etag: prior.etag, sha256: prior.sha256, robots: prior.robots };
    await inspect(response, bytes);
    if (method === 'GET' && response.status === 200) verifiedRepresentations.set(path, result);
    save(); return response;
  } catch (error) {
    report.failures.push({ path, method, error: error.message }); save(); return null;
  }
}

await check(routing === 'clean' ? '/companies/not-a-company-route' : '/not-a-company-route', 'GET', 404);
await check('/companies', 'POST', 405, response => assert.equal(response.headers.get('allow'), 'GET, HEAD'));
if (mode === 'unavailable') {
  for (const method of ['GET', 'HEAD']) await check('/companies', method, 503, (response, bytes) => {
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (method === 'HEAD') assert.equal(bytes.length, 0);
    else assert.equal(bytes.toString(), 'Company reference temporarily unavailable');
  });
} else {
  await check('/companies', 'GET', 200, (response, bytes) => {
    const links = [...bytes.toString().matchAll(/href="\/companies\/(\d{10})"/g)].map(m => m[1]);
    assert.deepEqual([...new Set(links)], manifest.files.slice(0, 50).map(item => item.cik), 'Directory must match the pinned release, not static pilots');
  });
  await check('/companies/9999999999', 'GET', 404);
  await check('/company-data/9999999999.json', 'GET', 404);
  const indices = [...new Set([0, Math.floor(manifest.files.length / 2), manifest.files.length - 1])];
  for (const i of indices) {
    const item = manifest.files[i]; let record;
    await check(item.selected.path, 'GET', 200, (response, bytes) => {
      assert.equal(catalogHash(bytes), item.selected.sha256); assert.equal(bytes.length, item.selected.bytes);
      record = JSON.parse(bytes); assert.equal(record.cik, item.cik);
    });
    await check(item.source.path, 'GET', 200, (response, bytes) => {
      assert.equal(catalogHash(bytes), item.source.sha256); assert.equal(bytes.length, item.source.bytes);
      assert.equal(response.headers.get('content-type'), 'application/gzip');
      assert.ok(!response.headers.get('content-encoding'));
    });
    const path = '/companies/' + item.cik;
    const htmlCheck = canonical => async (response, bytes) => {
      const html = bytes.toString();
      assert.ok(html.includes(`rel="canonical" href="https://canlicapital.com${canonical}"`));
      assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
      assert.ok(html.includes(item.selected.path) && html.includes(item.source.path));
      assert.ok(html.includes('/developers#quickstart'));
      assert.ok(html.includes('github.com/arhancanli/alphac'));
      const assetPaths = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map(m => m[1]))];
      assert.ok(assetPaths.length > 0);
      for (const asset of assetPaths) {
        const assetResponse = await fetch(new URL(asset, origin), { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15000) });
        assert.equal(assetResponse.status, 200, asset);
      }
    };
    const response = await check(path, 'GET', 200, htmlCheck(path));
    await check(path, 'HEAD', 200, (r, bytes) => assert.equal(bytes.length, 0));
    if (response?.headers.get('etag')) await check(path, 'GET', 304, () => {}, { 'If-None-Match': response.headers.get('etag') });
    if (record?.concepts.length) {
      const history = path + '/' + record.concepts[0].tag;
      await check(history, 'GET', 200, htmlCheck(history));
    }
  }
}
report.complete = true; report.passed = report.failures.length === 0; save();
console.log(JSON.stringify({ checks: report.checks.length, failures: report.failures.length, passed: report.passed, mode }));
if (!report.passed) process.exitCode = 1;
