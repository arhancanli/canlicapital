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
  // History pages keep working beside filing pages.
  assert.equal((await get(handler, `/companies/${document.cik}`)).statusCode, 200);
  assert.equal((await get(handler, `/companies/${document.cik}/Assets`)).statusCode, 200);
});

test('filing pages become indexable only through the company-level admission predicate', async t => {
  const { documents, options } = fixture(t);
  const admitted = documents[0].cik;
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader({ ...options, filingsIndexable: cik => cik === admitted }) });
  const yes = await get(handler, filingPath(admitted, documents[0].filings[0].accession));
  assert.equal(yes.statusCode, 200); assert.equal(yes.headers['X-Robots-Tag'], undefined); assert.match(yes.headers['Cache-Control'], /s-maxage=300/);
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
  assert.equal((await get(handler, `/companies/${documents[0].cik}`)).statusCode, 200);
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
