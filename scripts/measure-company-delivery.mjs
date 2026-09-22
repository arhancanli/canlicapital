import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSitemap } from './lib/sitemaps.mjs';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { companyPreviewServer } from './lib/company-preview-server.mjs';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { verifyCompanyReference } from './lib/company-reference.mjs';
import { referenceCrawlGraph } from './lib/reference-crawl-graph.mjs';
import { filingPath, filingsIndexPath } from './lib/company-filings.mjs';
const [catalogDir, deliveryDir, distDir, output, discoveryDir, filingsDir] = process.argv.slice(2);
if (!output) throw new Error('Usage: node scripts/measure-company-delivery.mjs CATALOG DELIVERY DIST REPORT [DISCOVERY] [FILINGS]');
const codeHashes = () => Object.fromEntries(['scripts/measure-company-delivery.mjs', 'scripts/lib/reference-crawl-graph.mjs', 'scripts/lib/company-preview-server.mjs', 'scripts/lib/company-page-renderer.mjs', 'scripts/lib/company-filing-notes.mjs', 'api/_lib/company-release.js', 'scripts/lib/company-reference.mjs', 'api/_lib/company-html.js', 'api/_lib/company-download-index.js', 'api/_lib/company-download.js', 'scripts/lib/build-company-download-index.mjs', 'api/_lib/company-directory-html.js', 'scripts/lib/company-directory.mjs', 'api/_lib/company-catalog.js', 'api/_lib/company-filings-catalog.js', 'api/_lib/company-filings-html.js', 'scripts/lib/company-filings.mjs', 'scripts/lib/company-filing-page-renderer.mjs'].map(path => [path, catalogHash(readFileSync(path))]));
const initialCode = codeHashes();
const app = await companyPreviewServer({ catalogDir, deliveryDir, distDir, discoveryDir, filingsDir: filingsDir || undefined });
app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
const base = `http://127.0.0.1:${app.server.address().port}`;
const report = { schema: 'canli.company-delivery-measurement.v1', publication_approved: false, environment: 'local Node HTTP, sequential; no cloud-load or indexing claim', companies: 0, histories: 0, filingIndexes: 0, filings: 0, directories: 0, downloads: 0, maxHtmlBytes: 0, failures: [] };
const durations = [];
const assets = new Set();
const served = new Set();
const graph = referenceCrawlGraph();
async function page(path) {
  const start = performance.now(), response = await fetch(base + path), html = await response.text();
  durations.push(performance.now() - start);
  assert.equal(response.status, 200, path); assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  assert.ok(html.includes(`rel="canonical" href="https://canlicapital.com${path}"`));
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.ok(!html.includes('/css/paper.css'));
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)) assets.add(Buffer.from(match[1]).toString());
  report.maxHtmlBytes = Math.max(report.maxHtmlBytes, Buffer.byteLength(html));
  assert.ok(Buffer.byteLength(html) <= 256 * 1024);
  served.add("https://canlicapital.com" + path);
  graph.recordPage(path, [...html.matchAll(/href="(\/companies(?:\/[^"#?]*)?)"/g)].map(match => match[1]));
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
    let overview;
    for (const tag of [null, ...record.concepts.map(concept => concept.tag)]) {
      const path = `/companies/${item.cik}${tag ? '/' + tag : ''}`, html = await page(path);
      assert.ok(html.includes(item.source.path)); assert.ok(html.includes(item.selected.path));
      assert.ok(html.includes('/developers#quickstart')); assert.ok(html.includes('/developers#ai-assistant')); assert.ok(html.includes('github.com/arhancanli/alphac'));
      const structured = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      assert.equal(structured[0]['@type'], 'Dataset'); assert.equal(structured[0].creator.name, record.name);
      if (tag) report.histories++; else { report.companies++; overview = html; }
    }
    // Filing pages: every page of the company's filings document, reached from the overview.
    const document = app.filingsCatalog ? await app.filingsCatalog.getFilings(item.cik) : null;
    assert.equal(overview.includes(`href="${filingsIndexPath(item.cik)}"`), Boolean(document), `overview filing link ${item.cik}`);
    if (document) {
      assert.equal(document.source_sha256, item.source_sha256);
      const index = await page(filingsIndexPath(item.cik));
      for (const filing of document.filings) {
        assert.ok(index.includes(`href="${filingPath(item.cik, filing.accession)}"`));
        const html = await page(filingPath(item.cik, filing.accession));
        assert.ok(html.includes(filing.sec_index_url)); assert.ok(html.includes(`href="/companies/${item.cik}/${filing.concepts[0].tag}"`));
        report.filings++;
      }
      report.filingIndexes++;
    } else assert.equal((await fetch(base + filingsIndexPath(item.cik))).status, 404);
    if (report.companies % 100 === 0) console.log(JSON.stringify({ companies: report.companies, histories: report.histories, heapUsed: process.memoryUsage().heapUsed, crawlGraph: graph.stats() }));
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
  const reachability = graph.reachableFrom('/companies');
  assert.equal(reachability.pages, served.size, 'Orphan reference page');
  report.maxClicksFromCompanyDirectory = reachability.maxDepth;
  report.crawlGraph = graph.stats();
  if (app.filingsCatalog) {
    assert.equal(report.filings, app.release.filings); assert.equal(report.filingIndexes, app.release.filing_companies);
    report.filingsRoot = app.release.filings_root; report.filingsCatalog = app.filingsCatalog.stats();
  }
  report.referencePages = report.companies + report.histories + report.filingIndexes + report.filings + report.directories;
  report.assets = assets.size; report.catalog = app.catalog.stats();
  report.downloadIndex = app.downloadIndex.stats();
  report.downloadRoot = app.delivery.download_index.root_hash;
  report.catalogRoot = app.catalog.revision;
  durations.sort((a, b) => a - b); report.localHtmlMedianMs = durations[Math.floor(durations.length / 2)]; report.localHtmlP95Ms = durations[Math.floor(durations.length * .95)];
} catch (error) { report.failures.push(error.stack); process.exitCode = 1; }
finally { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); }
report.code = initialCode;
if (JSON.stringify(codeHashes()) !== JSON.stringify(initialCode)) { report.failures.push('Code changed during measurement'); process.exitCode = 1; }
writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
