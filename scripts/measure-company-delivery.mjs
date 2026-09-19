import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSitemap } from './lib/sitemaps.mjs';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { companyPreviewServer } from './lib/company-preview-server.mjs';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { verifyCompanyReference } from './lib/company-reference.mjs';
const [catalogDir, deliveryDir, distDir, output, discoveryDir] = process.argv.slice(2);
if (!output) throw new Error('Usage: node scripts/measure-company-delivery.mjs CATALOG DELIVERY DIST REPORT [DISCOVERY]');
const app = await companyPreviewServer({ catalogDir, deliveryDir, distDir, discoveryDir });
app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
const base = `http://127.0.0.1:${app.server.address().port}`;
const report = { schema: 'canli.company-delivery-measurement.v1', publication_approved: false, environment: 'local Node HTTP, sequential; no cloud-load or indexing claim', companies: 0, histories: 0, directories: 0, downloads: 0, maxHtmlBytes: 0, failures: [] };
const durations = [];
const assets = new Set();
const served = new Set();
const edges = new Map();
async function page(path) {
  const start = performance.now(), response = await fetch(base + path), html = await response.text();
  durations.push(performance.now() - start);
  assert.equal(response.status, 200, path); assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  assert.ok(html.includes(`rel="canonical" href="https://canlicapital.com${path}"`));
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.ok(!html.includes('/css/paper.css'));
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)) assets.add(match[1]);
  report.maxHtmlBytes = Math.max(report.maxHtmlBytes, Buffer.byteLength(html));
  assert.ok(Buffer.byteLength(html) <= 256 * 1024);
  served.add("https://canlicapital.com" + path);
  edges.set(path, [...html.matchAll(/href="(\/companies(?:\/[^"#?]*)?)"/g)].map(match => match[1]));
  return html;
}
try {
  for (const item of app.delivery.files) {
    const selected = await fetch(base + item.selected.path); assert.equal(selected.status, 200);
    const selectedBytes = Buffer.from(await selected.arrayBuffer()); assert.equal(catalogHash(selectedBytes), item.selected.sha256);
    const record = JSON.parse(selectedBytes);
    const source = await fetch(base + item.source.path); assert.equal(source.status, 200); assert.equal(source.headers.get('content-type'), 'application/gzip');
    const compressed = Buffer.from(await source.arrayBuffer()); assert.equal(catalogHash(compressed), item.source.sha256);
    const original = gunzipSync(compressed); assert.equal(catalogHash(original), item.source_sha256);
    verifyCompanyReference(record, original); report.downloads += 2;
    for (const tag of [null, ...record.concepts.map(concept => concept.tag)]) {
      const path = `/companies/${item.cik}${tag ? '/' + tag : ''}`, html = await page(path);
      assert.ok(html.includes(item.source.path)); assert.ok(html.includes(item.selected.path));
      assert.ok(html.includes('/developers#quickstart')); assert.ok(html.includes('/developers#ai-assistant')); assert.ok(html.includes('github.com/arhancanli/alphac'));
      const structured = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      assert.equal(structured[0]['@type'], 'Dataset'); assert.equal(structured[0].creator.name, record.name);
      if (tag) report.histories++; else report.companies++;
    }
  }
  const found = new Set();
  for (let i = 1; i <= app.directoryPages; i++) {
    const html = await page(i === 1 ? '/companies' : `/companies/page/${i}`);
    const companies = [...html.matchAll(/href="\/companies\/(\d{10})"/g)].map(match => match[1]);
    assert.ok(companies.length > 0 && companies.length <= 50);
    for (const cik of companies) { assert.ok(!found.has(cik)); found.add(cik); }
    report.directories++;
  }
  assert.equal(found.size, app.delivery.files.length);
  for (const path of assets) assert.equal((await fetch(base + path)).status, 200, path);
  for (const path of ['/companies/9999999999', '/companies/0000029534/NoSuchConcept', '/companies/page/99999', '/company-data/missing.json', '/assets/missing.js']) assert.equal((await fetch(base + path)).status, 404, path);
  const first = '/companies/' + app.delivery.files[0].cik;
  const response = await fetch(base + first);
  assert.equal((await fetch(base + first, { headers: { 'If-None-Match': response.headers.get('etag') } })).status, 304);
  const head = await fetch(base + first, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  if (discoveryDir) {
    const root = await fetch(base + '/company-sitemap.xml'); assert.equal(root.status, 200);
    const parsed = parseSitemap(await root.text());
    const urls = [];
    if (parsed.index) for (const loc of parsed.locations) {
      const response = await fetch(base + new URL(loc).pathname); assert.equal(response.status, 200);
      const child = parseSitemap(await response.text()); assert.equal(child.index, false); urls.push(...child.locations);
    } else urls.push(...parsed.locations);
    assert.equal(new Set(urls).size, urls.length);
    assert.deepEqual([...urls].sort(), [...served].sort());
    report.sitemapHttpUrls = urls.length;
  }
  const depth = new Map([['/companies', 0]]), queue = ['/companies'];
  for (let i = 0; i < queue.length; i++) for (const child of edges.get(queue[i]) ?? []) {
    if (edges.has(child) && !depth.has(child)) { depth.set(child, depth.get(queue[i]) + 1); queue.push(child); }
  }
  assert.equal(depth.size, served.size, 'Orphan reference page');
  report.maxClicksFromCompanyDirectory = Math.max(...depth.values());
  report.referencePages = report.companies + report.histories + report.directories;
  report.assets = assets.size; report.catalog = app.catalog.stats();
  report.downloadIndex = app.downloadIndex.stats();
  report.downloadRoot = app.delivery.download_index.root_hash;
  report.catalogRoot = app.catalog.revision;
  durations.sort((a, b) => a - b); report.localHtmlMedianMs = durations[Math.floor(durations.length / 2)]; report.localHtmlP95Ms = durations[Math.floor(durations.length * .95)];
} catch (error) { report.failures.push(error.stack); process.exitCode = 1; }
finally { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); }
report.code = Object.fromEntries(['scripts/measure-company-delivery.mjs', 'scripts/lib/company-preview-server.mjs', 'scripts/lib/company-page-renderer.mjs', 'api/_lib/company-html.js', 'api/_lib/company-download-index.js', 'api/_lib/company-download.js', 'scripts/lib/build-company-download-index.mjs', 'api/_lib/company-directory-html.js', 'scripts/lib/company-directory.mjs', 'api/_lib/company-catalog.js'].map(path => [path, catalogHash(readFileSync(path))]));
writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
