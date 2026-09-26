import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { createCompanyReleaseLoader, createCompanyReferenceHandler } from '../api/_lib/company-release.js';
import { createConfiguredCompanyReference } from '../api/_lib/company-reference-runtime.js';
import { resolveCompanyRuntime } from '../api/_lib/company-activation.js';
import { buildCompanyCatalog } from './lib/build-company-catalog.mjs';
import { buildCompanyFilingsCatalog } from './lib/build-company-filings-catalog.mjs';
import { buildCompanyDownloadIndex } from './lib/build-company-download-index.mjs';
import { buildCompanyAssets } from './lib/company-assets.mjs';
import { companyFilings, filingPath, filingsIndexPath } from './lib/company-filings.mjs';

const PILOTS = readdirSync(new URL('../public/company-data', import.meta.url)).filter(name => /^\d{10}\.json$/.test(name)).map(name => name.slice(0, 10)).sort().slice(0, 3);
function fixture(t, { withFilings = true } = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), 'canli-filings-routes-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const records = PILOTS.map(cik => JSON.parse(readFileSync(new URL(`../public/company-data/${cik}.json`, import.meta.url))));
  const documents = records.map(record => companyFilings(gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))).toString(), { fetchedAt: record.fetched_at, expectedCik: record.cik }));
  const catalog = buildCompanyCatalog(records, dir);
  const filingsCatalog = buildCompanyFilingsCatalog(documents, resolve(dir, 'filings'));
  const bytes = Buffer.from(JSON.stringify(records[0])), hash = catalogHash(bytes);
  const downloads = buildCompanyDownloadIndex([{ path: `/company-data/${records[0].cik}.json`, sha256: hash, storage_path: `objects/${hash}.json`, bytes: bytes.length }], dir);
  const release = Buffer.from(JSON.stringify({ schema: 'canli.company-release.v1', catalog_root: catalog.root_hash, download_root: downloads.root_hash, companies: records.length, histories: records.reduce((n, r) => n + r.concepts.length, 0), publication_approved: false, ...(withFilings ? { filings_root: filingsCatalog.root_hash, filings: filingsCatalog.filings } : {}) }));
  const read = base => async (hash, limit, kind) => { const name = resolve(base, 'objects', hash + (kind === 'leaf' && base.endsWith('filings') ? '.json.gz' : '.json')); const b = readFileSync(name); if (b.length > limit) throw new Error('over'); return b; };
  return { records, documents, release, options: { releaseHash: catalogHash(release), readReleaseObject: async () => release, readCatalogObject: read(dir), readDownloadIndexObject: read(dir), readDownload: async () => bytes, readFilingsObject: read(resolve(dir, 'filings')), assets: buildCompanyAssets(readFileSync('companies/0000029534.html', 'utf8'), '<link rel="stylesheet" href="/assets/company.css">') } };
}
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } });
async function get(handler, path, headers = {}) { const res = response(); await handler({ method: 'GET', query: { path }, headers }, res); return res; }

test('filing index and accession pages are served from the release, noindex by default, 404 for unknown filings', async t => {
  const { documents, options } = fixture(t);
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader(options) });
  const document = documents[0];
  const index = await get(handler, filingsIndexPath(document.cik));
  assert.equal(index.statusCode, 200); assert.equal(index.headers['X-Robots-Tag'], 'noindex'); assert.equal(index.headers['Cache-Control'], 'no-store');
  assert.match(index.body, /assets\/company.css/); assert.ok(index.body.includes(filingPath(document.cik, document.filings[0].accession)));
  const page = await get(handler, filingPath(document.cik, document.filings[0].accession));
  assert.equal(page.statusCode, 200); assert.ok(page.body.includes(document.filings[0].sec_index_url));
  const again = await get(handler, filingPath(document.cik, document.filings[0].accession), { 'if-none-match': page.headers.ETag });
  assert.equal(again.statusCode, 304);
  assert.equal((await get(handler, filingPath(document.cik, '0000000000-00-000000'))).statusCode, 404);
  assert.equal((await get(handler, filingsIndexPath('9999999999'))).statusCode, 404);
  assert.equal((await get(handler, `/companies/${document.cik}/filings/not-an-accession`)).statusCode, 404);
  // History pages keep working beside filing pages; the overview links to the filing index with its count.
  const overview = await get(handler, `/companies/${document.cik}`);
  assert.equal(overview.statusCode, 200);
  assert.ok(overview.body.includes(`href="${filingsIndexPath(document.cik)}">${document.filings.length} `), 'overview links to the filing index');
  assert.equal((await get(handler, `/companies/${document.cik}/Assets`)).statusCode, 200);
  assert.ok(!(await get(handler, `/companies/${document.cik}/Assets`)).body.includes(`href="${filingsIndexPath(document.cik)}"`));
});

test('filing pages become indexable only through the company-level admission predicate', async t => {
  const { documents, options } = fixture(t);
  const admitted = documents[0].cik;
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader({ ...options, filingsIndexable: cik => cik === admitted }) });
  const yes = await get(handler, filingPath(admitted, documents[0].filings[0].accession));
  assert.equal(yes.statusCode, 200); assert.equal(yes.headers['X-Robots-Tag'], undefined); assert.match(yes.headers['Cache-Control'], /s-maxage=3600/);
  const no = await get(handler, filingsIndexPath(documents[1].cik));
  assert.equal(no.statusCode, 200); assert.equal(no.headers['X-Robots-Tag'], 'noindex');
  await assert.rejects(createCompanyReleaseLoader({ ...options, filingsIndexable: true })(), /admission predicate/);
  const runtime = resolveCompanyRuntime({ VERCEL_ENV: 'production' }, { enabled: true, releaseHash: 'a'.repeat(64), catalogBase: 'https://s.example/c/', deliveryBase: 'https://s.example/d/', isAdmitted: (cik, concept) => concept === undefined && cik === admitted });
  assert.equal(runtime.filingsIndexable(admitted), true); assert.equal(runtime.filingsIndexable(documents[1].cik), false);
  assert.equal(resolveCompanyRuntime({ VERCEL_ENV: 'preview' }, { enabled: true, releaseHash: 'a'.repeat(64), catalogBase: 'https://s.example/c/', deliveryBase: 'https://s.example/d/', isAdmitted: () => true }).filingsIndexable, false);
});

test('a release without filings answers 404 on filing paths and a corrupt filings object answers 503', async t => {
  const { documents, options } = fixture(t, { withFilings: false });
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader(options) });
  const res = await get(handler, filingsIndexPath(documents[0].cik));
  assert.equal(res.statusCode, 404); assert.equal(res.headers['X-Robots-Tag'], 'noindex');
  const overview = await get(handler, `/companies/${documents[0].cik}`);
  assert.equal(overview.statusCode, 200);
  assert.ok(!overview.body.includes(`href="${filingsIndexPath(documents[0].cik)}"`), 'no filing link without filings');
  const broken = fixture(t);
  const corrupt = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader({ ...broken.options, readFilingsObject: async (hash, limit, kind) => kind === 'leaf' ? Buffer.from('garbage') : broken.options.readFilingsObject(hash, limit, kind) }) });
  const bad = await get(corrupt, filingsIndexPath(broken.documents[0].cik));
  assert.equal(bad.statusCode, 503); assert.equal(bad.headers['Cache-Control'], 'no-store');
  const invalid = Buffer.from(JSON.stringify({ ...JSON.parse(broken.release), filings_root: 'zz' }));
  await assert.rejects(createCompanyReleaseLoader({ ...broken.options, releaseHash: catalogHash(invalid), readReleaseObject: async () => invalid })(), /filings binding/);
});

test('the configured wrapper names filings leaves with the gzip extension under the catalog base', async t => {
  const { documents, options } = fixture(t);
  const urls = [];
  const environment = () => ({ COMPANY_RELEASE_HASH: options.releaseHash, COMPANY_CATALOG_BASE_URL: 'https://store.example/catalog', COMPANY_DELIVERY_BASE_URL: 'https://store.example/delivery' });
  const handler = createConfiguredCompanyReference({ environment, readAssets: () => Buffer.from(JSON.stringify(options.assets)), fetcher: async (url) => {
    urls.push(String(url));
    const name = String(url).split('/').at(-1); const hash = name.replace(/\.json(\.gz)?$/, ''); const gz = name.endsWith('.json.gz');
    if (hash === options.releaseHash) return new Response(await options.readReleaseObject());
    try { return new Response(gz ? await options.readFilingsObject(hash, 1 << 24, 'leaf') : await options.readCatalogObject(hash, 1 << 24, 'node')); }
    catch { try { return new Response(await options.readFilingsObject(hash, 1 << 24, 'node')); } catch { return new Response('missing', { status: 404 }); } }
  } });
  const res = await get(handler, filingsIndexPath(documents[0].cik));
  assert.equal(res.statusCode, 200); assert.equal(res.headers['X-Robots-Tag'], 'noindex');
  assert.ok(urls.some(url => url.startsWith('https://store.example/catalog/objects/') && url.endsWith('.json.gz')), 'filings leaf fetched as .json.gz under the catalog base');
});

test('an overview reads the company record and the filing summary together, not one after the other', async t => {
  const { records, options } = fixture(t);
  const events = [];
  const slowLeaf = async (hash, limit, kind) => {
    if (kind === 'leaf') { events.push('record:start'); await new Promise(r => setTimeout(r, 40)); events.push('record:end'); }
    return options.readCatalogObject(hash, limit, kind);
  };
  const filingsRead = async (hash, limit, kind) => { events.push('filings:start'); return options.readFilingsObject(hash, limit, kind); };
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader({ ...options, readCatalogObject: slowLeaf, readFilingsObject: filingsRead }) });
  const page = await get(handler, `/companies/${records[0].cik}`);
  assert.equal(page.statusCode, 200);
  assert.ok(events.includes('filings:start'), 'the overview consulted the filings catalog');
  assert.ok(events.indexOf('filings:start') < events.indexOf('record:end'), `filings read began before the record read finished: ${events.join(', ')}`);
  // The timing header counts the filings catalog's reads and splits storage from rendering.
  assert.match(page.headers['Server-Timing'], /storage;dur=\d+(\.\d)?, render;dur=\d+(\.\d)?, reads;desc="(\d+)"/);
  const reads = Number(/reads;desc="(\d+)"/.exec(page.headers['Server-Timing'])[1]);
  assert.ok(reads >= 2, `the record and at least one filings object were read from storage, header says ${reads}`);
});

test('a company missing from the catalog is a 404 even when the filings catalog fails', async t => {
  const { options } = fixture(t);
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader({ ...options, readFilingsObject: async () => { throw new Error('filings storage down'); } }) });
  assert.equal((await get(handler, '/companies/9999999999')).statusCode, 404);
});

test('a present company whose filings read fails is a 503, never a page without its filing link', async t => {
  const { records, options } = fixture(t);
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader({ ...options, readFilingsObject: async () => { throw new Error('filings storage down'); } }) });
  const page = await get(handler, `/companies/${records[0].cik}`);
  assert.equal(page.statusCode, 503);
  assert.equal((await get(handler, `/companies/${records[0].cik}/Assets`)).statusCode, 200, 'a history page needs no filings read');
});

// Production passes admission predicates. A page may link only histories the admission lets Google
// index, and its HTML robots directive must match its X-Robots-Tag.
const historyHrefs = (html, cik) => [...html.matchAll(new RegExp(`href="/companies/${cik}/([A-Za-z][A-Za-z0-9]*)"`, 'g'))].map(m => m[1]).filter(tag => tag !== 'filings');
const metaRobots = html => /<meta name="robots" content="([^"]+)"/.exec(html)?.[1];

test('in production a filing page links only admitted histories and names the rest as text', async t => {
  const { documents, options } = fixture(t);
  const document = documents[0];
  const filing = document.filings.find(f => f.concepts.length >= 3);
  const allowed = new Set(filing.concepts.slice(0, 2).map(c => c.tag));
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader({ ...options, indexable: (cik, tag) => tag === undefined || allowed.has(tag), filingsIndexable: () => true }) });
  const page = await get(handler, filingPath(document.cik, filing.accession));
  assert.equal(page.statusCode, 200);
  const linked = historyHrefs(page.body, document.cik);
  assert.ok(linked.length >= 1);
  assert.ok(linked.every(tag => allowed.has(tag)), `only admitted histories are linked: ${linked}`);
  const excluded = filing.concepts.find(c => !allowed.has(c.tag));
  assert.ok(page.body.includes(`<h3 id="c-${excluded.tag}">`) && !page.body.includes(`href="/companies/${document.cik}/${excluded.tag}"`), 'a withheld history is named as text');
  assert.equal(metaRobots(page.body), 'index, follow');
  assert.equal(page.headers['X-Robots-Tag'], undefined);
});

test('a page the server marks noindex says noindex in its HTML too', async t => {
  const { records, documents, options } = fixture(t);
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader({ ...options, indexable: () => false, filingsIndexable: () => false }) });
  for (const path of [`/companies/${records[0].cik}`, filingPath(documents[0].cik, documents[0].filings[0].accession)]) {
    const page = await get(handler, path);
    assert.equal(page.headers['X-Robots-Tag'], 'noindex', path);
    assert.equal(metaRobots(page.body), 'noindex', path);
  }
});

test('in production an overview and a concept page link only admitted histories', async t => {
  const { records, options } = fixture(t);
  const record = records[0];
  const allowed = new Set(record.concepts.slice(0, 3).map(c => c.tag));
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader({ ...options, indexable: (cik, tag) => tag === undefined || allowed.has(tag), filingsIndexable: () => true }) });
  for (const path of [`/companies/${record.cik}`, `/companies/${record.cik}/${[...allowed][0]}`]) {
    const page = await get(handler, path);
    assert.equal(page.statusCode, 200, path);
    const linked = historyHrefs(page.body, record.cik);
    assert.ok(linked.length >= 1, path);
    assert.ok(linked.every(tag => allowed.has(tag)), `${path} links only admitted histories: ${linked}`);
  }
});

test('previews and local runs, which have no admission predicate, still link every history', async t => {
  const { records, documents, options } = fixture(t);
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader(options) });
  const overview = await get(handler, `/companies/${records[0].cik}`);
  assert.deepEqual(new Set(historyHrefs(overview.body, records[0].cik)), new Set(records[0].concepts.map(c => c.tag)));
  const filing = documents[0].filings[0];
  const page = await get(handler, filingPath(documents[0].cik, filing.accession));
  assert.deepEqual(new Set(historyHrefs(page.body, documents[0].cik)), new Set(filing.concepts.map(c => c.tag)));
});

test('a filing page links its company\'s previous and next filings by filing date', async t => {
  const { documents, options } = fixture(t);
  const document = documents.find(d => d.filings.length >= 3) ?? documents[0];
  const byDate = [...document.filings].sort((a, b) => (a.filed === b.filed ? a.accession.localeCompare(b.accession) : a.filed.localeCompare(b.filed)));
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader(options) });
  const middle = await get(handler, filingPath(document.cik, byDate[1].accession));
  assert.ok(middle.body.includes(`href="${filingPath(document.cik, byDate[0].accession)}" rel="prev"`), 'previous');
  assert.ok(middle.body.includes(`href="${filingPath(document.cik, byDate[2].accession)}" rel="next"`), 'next');
  const first = await get(handler, filingPath(document.cik, byDate[0].accession));
  assert.ok(!first.body.includes('rel="prev"'), 'the earliest filing has no previous link');
});

const internalFilingHrefs = (html, cik) => [...html.matchAll(new RegExp(`href="/companies/${cik}/filings/(\\d{10}-\\d{2}-\\d{6})"`, 'g'))].map(m => m[1]);

test('a history page cites this site\'s filing page for each accession that has one, with sec.gov as the second link', async t => {
  const { records, documents, options } = fixture(t);
  const record = records[0], document = documents.find(d => d.cik === records[0].cik);
  const pages = new Set(document.filings.map(f => f.accession));
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader(options) });
  const concept = record.concepts.find(c => c.observations.some(o => pages.has(o.accn)));
  const page = await get(handler, `/companies/${record.cik}/${concept.tag}`);
  assert.equal(page.statusCode, 200);
  const cited = new Set(internalFilingHrefs(page.body, record.cik));
  const expected = new Set(concept.observations.map(o => o.accn).filter(a => pages.has(a)));
  assert.ok(expected.size >= 1);
  for (const a of expected) assert.ok(cited.has(a), `accession ${a} cites the internal filing page`);
  for (const a of cited) assert.ok(pages.has(a), `an internal filing link points at an existing filing page: ${a}`);
  assert.ok(page.body.includes('rel="noreferrer">SEC</a>'), 'the sec.gov source stays as a second link');
  const missing = concept.observations.find(o => !pages.has(o.accn));
  if (missing) assert.ok(!cited.has(missing.accn), 'an accession without a filing page cites sec.gov only');
});

test('an overview lists its five latest filings, newest first, as internal links', async t => {
  const { records, documents, options } = fixture(t);
  const document = documents.find(d => d.cik === records[0].cik);
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader(options) });
  const page = await get(handler, `/companies/${records[0].cik}`);
  const list = /<ul class="company-reference__latest-filings">([\s\S]*?)<\/ul>/.exec(page.body)?.[1] ?? '';
  const listed = internalFilingHrefs(list, records[0].cik);
  const newest = [...document.filings].sort((a, b) => (a.filed === b.filed ? b.accession.localeCompare(a.accession) : b.filed.localeCompare(a.filed))).slice(0, 5).map(f => f.accession);
  assert.deepEqual(listed, newest);
});

test('in production, filing pages that are not admitted are neither cited nor listed', async t => {
  const { records, options } = fixture(t);
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader({ ...options, indexable: () => true, filingsIndexable: () => false }) });
  const record = records[0];
  for (const path of [`/companies/${record.cik}`, `/companies/${record.cik}/${record.concepts[0].tag}`]) {
    const page = await get(handler, path);
    assert.deepEqual(internalFilingHrefs(page.body, record.cik), [], path);
  }
});

test('with filings storage down a history page still serves, citing sec.gov only', async t => {
  const { records, options } = fixture(t);
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader({ ...options, readFilingsObject: async () => { throw new Error('down'); } }) });
  const page = await get(handler, `/companies/${records[0].cik}/${records[0].concepts[0].tag}`);
  assert.equal(page.statusCode, 200);
  assert.deepEqual(internalFilingHrefs(page.body, records[0].cik), []);
});
