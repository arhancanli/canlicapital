import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadCompanyActivation, parseCompanyAdmission, resolveCompanyRuntime } from '../api/_lib/company-activation.js';
import { fetchStorage } from '../api/_lib/company-catalog-http.js';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { createCompanyReleaseLoader, createCompanyReferenceHandler } from '../api/_lib/company-release.js';
import { buildCompanyCatalog } from './lib/build-company-catalog.mjs';
import { buildCompanyDownloadIndex } from './lib/build-company-download-index.mjs';
import { buildCompanyAssets } from './lib/company-assets.mjs';
import { COMPANY_ROUTES } from './lib/company-preview-config.mjs';
import { parseSitemap } from './lib/sitemaps.mjs';
import { prepareCompanyProductionOutput } from './prepare-company-production-output.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const RELEASE = '4a5d9160bfa85ba10cea83467c64402629321e5445fe0dd9990571bf43b36ce2';

test('committed activation pins the v22 release, public storage and the owner-approved clean-set admission', () => {
  const raw = JSON.parse(readFileSync('config/company-production-activation.json'));
  assert.equal(raw.enabled, true);
  assert.equal(sha256(readFileSync(raw.admission.path)), raw.admission.sha256);
  const activation = loadCompanyActivation();
  assert.equal(activation.releaseHash, RELEASE);
  assert.match(activation.catalogBase, /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/company-reference-staging\/catalog\/$/);
  assert.match(activation.deliveryBase, /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/company-reference-staging\/delivery\/$/);
  const { counts, excluded_companies: excluded } = activation.admission;
  assert.deepEqual(counts, { overviews_admitted: 6376, histories_admitted: 126372, histories_withheld_flagged: 30342, histories_withheld_company: 399, overviews_withheld_company: 15, directory_pages: 128, urls_admitted: 132876 });
  assert.equal(counts.histories_admitted + counts.histories_withheld_flagged + counts.histories_withheld_company, activation.admission.histories_in_release);
  assert.equal(Object.keys(excluded).length, 15);
  const paths = [...activation.admittedPaths()];
  assert.equal(paths.length, counts.overviews_admitted + counts.histories_admitted);
  assert.equal(new Set(paths.map(entry => entry.path)).size, paths.length);
  // A pending-review company is withheld whole; a flagged history is withheld; its company overview is not.
  assert.equal(activation.isAdmitted('0001296774'), false);
  assert.equal(activation.isAdmitted('0001296774', 'Revenues'), false);
  assert.equal(activation.isAdmitted('0000001750', 'InterestExpense'), false);
  assert.equal(activation.isAdmitted('0000001750'), true);
  assert.equal(activation.isAdmitted('9999999999'), false);
  assert.equal(activation.isAdmitted('0000001750', 'NotAConcept'), false);
  for (const { path } of paths.slice(0, 500)) {
    const [, , cik, tag] = path.split('/');
    assert.equal(activation.isAdmitted(cik, tag), true, path);
  }
});

function admissionBytes(overrides = {}) {
  return Buffer.from(JSON.stringify({
    schema: 'canli.company-admission.v1', release_hash: RELEASE, companies_in_release: 2,
    concepts: ['Assets', 'Revenues'], directory_lastmod: '2026-09-20',
    counts: { overviews_admitted: 1, histories_admitted: 1, directory_pages: 1, urls_admitted: 3 },
    companies: { '0000000001': { lastmod: '2026-09-20', available: '3', admitted: '1', overview: true }, '0000000002': { lastmod: '2026-09-19', available: '3', admitted: '0', overview: false } },
    ...overrides,
  }));
}

test('admission parsing rejects tampering, release mismatch and impossible masks', () => {
  const bytes = admissionBytes();
  const parsed = parseCompanyAdmission(bytes, { releaseHash: RELEASE, sha256: sha256(bytes) });
  assert.equal(parsed.isAdmitted('0000000001'), true);
  assert.equal(parsed.isAdmitted('0000000001', 'Assets'), true);
  assert.equal(parsed.isAdmitted('0000000001', 'Revenues'), false);
  assert.equal(parsed.isAdmitted('0000000002'), false);
  assert.deepEqual([...parsed.admittedPaths()].map(entry => entry.path), ['/companies/0000000001', '/companies/0000000001/Assets']);
  assert.throws(() => parseCompanyAdmission(bytes, { releaseHash: RELEASE, sha256: '0'.repeat(64) }), /hash does not match/);
  assert.throws(() => parseCompanyAdmission(bytes, { releaseHash: 'f'.repeat(64), sha256: sha256(bytes) }), /does not bind/);
  const beyond = admissionBytes({ companies: { '0000000001': { lastmod: '2026-09-20', available: '1', admitted: '3', overview: true }, '0000000002': { lastmod: '2026-09-19', available: '3', admitted: '0', overview: false } } });
  assert.throws(() => parseCompanyAdmission(beyond, { releaseHash: RELEASE, sha256: sha256(beyond) }), /exceeds its available/);
  const leaky = admissionBytes({ companies: { '0000000001': { lastmod: '2026-09-20', available: '3', admitted: '1', overview: true }, '0000000002': { lastmod: '2026-09-19', available: '3', admitted: '2', overview: false } } });
  assert.throws(() => parseCompanyAdmission(leaky, { releaseHash: RELEASE, sha256: sha256(leaky) }), /Withheld company/);
  const short = admissionBytes({ companies_in_release: 3 });
  assert.throws(() => parseCompanyAdmission(short, { releaseHash: RELEASE, sha256: sha256(short) }), /count does not match/);
});

test('activation file is the only switch: disabled or missing activation serves nothing; env pins never index', () => {
  const files = { 'config/company-production-activation.json': Buffer.from(JSON.stringify({ schema: 'canli.company-production-activation.v1', enabled: false })) };
  assert.deepEqual(loadCompanyActivation({ readFile: path => files[path] }), { enabled: false });
  assert.deepEqual(loadCompanyActivation({ readFile: () => { throw new Error('missing'); } }), { enabled: false });
  const activation = { enabled: true, releaseHash: RELEASE, catalogBase: 'https://s.example/catalog/', deliveryBase: 'https://s.example/delivery/', isAdmitted: () => true };
  const pinned = resolveCompanyRuntime({ VERCEL_ENV: 'production', COMPANY_RELEASE_HASH: 'a'.repeat(64), COMPANY_CATALOG_BASE_URL: 'https://x/c/', COMPANY_DELIVERY_BASE_URL: 'https://x/d/' }, activation);
  assert.equal(pinned.releaseHash, 'a'.repeat(64)); assert.equal(pinned.indexable, false); assert.equal(pinned.directoryIndexable, false);
  for (const VERCEL_ENV of [undefined, 'preview', 'development']) {
    const runtime = resolveCompanyRuntime({ VERCEL_ENV }, activation);
    assert.equal(runtime.releaseHash, RELEASE); assert.equal(runtime.indexable, false); assert.equal(runtime.directoryIndexable, false);
  }
  const production = resolveCompanyRuntime({ VERCEL_ENV: 'production' }, activation);
  assert.equal(typeof production.indexable, 'function'); assert.equal(production.directoryIndexable, true);
  assert.equal(resolveCompanyRuntime({ VERCEL_ENV: 'production' }, { enabled: false }).releaseHash, undefined);
});

function releaseFixture(t) {
  const dir = mkdtempSync(resolve(tmpdir(), 'canli-activation-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const record = JSON.parse(readFileSync('public/company-data/0000029534.json'));
  const catalog = buildCompanyCatalog([record], dir);
  const bytes = Buffer.from(JSON.stringify(record)), hash = catalogHash(bytes);
  const downloads = buildCompanyDownloadIndex([{ path: `/company-data/${record.cik}.json`, sha256: hash, storage_path: `objects/${hash}.json`, bytes: bytes.length }], dir);
  const release = Buffer.from(JSON.stringify({ schema: 'canli.company-release.v1', catalog_root: catalog.root_hash, download_root: downloads.root_hash, companies: 1, histories: record.concepts.length, publication_approved: true }));
  const read = async h => readFileSync(resolve(dir, `objects/${h}.json`));
  return { record, options: { releaseHash: catalogHash(release), readReleaseObject: async () => release, readCatalogObject: read, readDownloadIndexObject: read, readDownload: async () => bytes, assets: buildCompanyAssets(readFileSync('companies/0000029534.html', 'utf8'), '<link rel="stylesheet" href="/assets/company.css">') } };
}
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } });

test('admitted pages are indexable and cacheable; withheld pages and downloads stay noindex on the same release', async t => {
  const { record, options } = releaseFixture(t);
  const [admittedTag, withheldTag] = record.concepts.map(item => item.tag);
  const indexable = (cik, concept) => cik === record.cik && (concept === undefined || concept === admittedTag);
  const handler = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader({ ...options, indexable, directoryIndexable: true }) });
  const get = async path => { const res = response(); await handler({ method: 'GET', query: { path }, headers: {} }, res); return res; };
  for (const path of [`/companies/${record.cik}`, `/companies/${record.cik}/${admittedTag}`, '/companies']) {
    const res = await get(path);
    assert.equal(res.statusCode, 200, path); assert.equal(res.headers['X-Robots-Tag'], undefined, path); assert.match(res.headers['Cache-Control'], /s-maxage=300/, path);
  }
  for (const path of [`/companies/${record.cik}/${withheldTag}`, `/company-data/${record.cik}.json`]) {
    const res = await get(path);
    assert.equal(res.statusCode, 200, path); assert.equal(res.headers['X-Robots-Tag'], 'noindex', path); assert.equal(res.headers['Cache-Control'], 'no-store', path);
  }
  // publication_approved in the release object alone never enables indexing.
  const plain = createCompanyReferenceHandler({ loadRelease: createCompanyReleaseLoader(options) });
  const res = response(); await plain({ method: 'GET', query: { path: `/companies/${record.cik}` }, headers: {} }, res);
  assert.equal(res.headers['X-Robots-Tag'], 'noindex');
  await assert.rejects(createCompanyReleaseLoader({ ...options, indexable: true })(), /admission predicate/);
});

test('storage reads retry once on network errors, 429 and 5xx but never on 404', async () => {
  const run = async outcomes => { let calls = 0; const fetcher = async () => { const next = outcomes[calls++]; if (next instanceof Error) throw next; return new Response('x', { status: next }); }; try { return { status: (await fetchStorage(fetcher, 'https://s.example/a', {})).status, calls }; } catch (error) { return { error: error.message, calls }; } };
  assert.deepEqual(await run([503, 200]), { status: 200, calls: 2 });
  assert.deepEqual(await run([429, 200]), { status: 200, calls: 2 });
  assert.deepEqual(await run([new Error('reset'), 200]), { status: 200, calls: 2 });
  assert.deepEqual(await run([404]), { status: 404, calls: 1 });
  assert.deepEqual(await run([503, 503]), { status: 503, calls: 2 });
  assert.deepEqual(await run([new Error('a'), new Error('b')]), { error: 'b', calls: 2 });
});

function distFixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'canli-production-output-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(resolve(root, 'dist/companies/0000000001'), { recursive: true }); mkdirSync(resolve(root, 'dist/company-data'));
  for (const name of ['index.html', 'company-page-assets.json', 'companies.html', 'developers.html']) writeFileSync(resolve(root, 'dist', name), 'x');
  writeFileSync(resolve(root, 'dist/sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ['/', '/developers', '/companies', '/companies/0000000002/Assets'].map(path => `  <url>\n    <loc>https://canlicapital.com${path}</loc>\n    <lastmod>2026-09-01</lastmod>\n  </url>\n`).join('') + '</urlset>\n');
  const bytes = admissionBytes();
  return { root, activation: { enabled: true, ...parseCompanyAdmission(bytes, { releaseHash: RELEASE, sha256: sha256(bytes) }) } };
}

test('production output removes shadowing pilot copies and lists exactly the admitted company URLs', t => {
  const { root, activation } = distFixture(t);
  for (const VERCEL_ENV of [undefined, 'development']) {
    assert.equal(prepareCompanyProductionOutput(root, { environment: { VERCEL_ENV }, activation }), null);
    assert.ok(existsSync(resolve(root, 'dist/companies.html')));
  }
  assert.equal(prepareCompanyProductionOutput(root, { environment: { VERCEL_ENV: 'production' }, activation: { enabled: false } }), null);
  const result = prepareCompanyProductionOutput(root, { environment: { VERCEL_ENV: 'production' }, activation });
  for (const name of ['companies', 'companies.html', 'company-data']) assert.ok(!existsSync(resolve(root, 'dist', name)), name);
  for (const name of ['index.html', 'developers.html', 'company-page-assets.json']) assert.ok(existsSync(resolve(root, 'dist', name)), name);
  const index = parseSitemap(readFileSync(resolve(root, 'dist/sitemap.xml'), 'utf8'));
  assert.equal(index.index, true);
  assert.deepEqual(index.locations, ['https://canlicapital.com/sitemap-site.xml', 'https://canlicapital.com/sitemap-companies-1.xml']);
  const read = name => parseSitemap(readFileSync(resolve(root, 'dist', name), 'utf8')).locations;
  assert.deepEqual(read('sitemap-site.xml'), ['/', '/developers'].map(path => `https://canlicapital.com${path}`));
  assert.deepEqual(read('sitemap-companies-1.xml'), ['/companies', '/companies/0000000001', '/companies/0000000001/Assets'].map(path => `https://canlicapital.com${path}`));
  assert.equal(result.removedSiteCompanyUrls, 2); assert.equal(result.companyUrls, 3);
  assert.throws(() => prepareCompanyProductionOutput(root, { environment: { VERCEL_ENV: 'preview' }, activation }), /already an index/);
  const fresh = distFixture(t);
  assert.throws(() => prepareCompanyProductionOutput(fresh.root, { environment: { VERCEL_ENV: 'preview' }, activation: { ...fresh.activation, admission: { ...fresh.activation.admission, counts: { ...fresh.activation.admission.counts, urls_admitted: 4 } } } }), /expected 4/);
});

test('the real admission becomes a sitemap index whose shards list every admitted URL once', t => {
  const { root } = distFixture(t);
  const activation = loadCompanyActivation();
  const result = prepareCompanyProductionOutput(root, { environment: { VERCEL_ENV: 'preview' }, activation });
  const index = parseSitemap(readFileSync(resolve(root, 'dist/sitemap.xml'), 'utf8'));
  assert.equal(index.index, true); assert.equal(index.locations.length, result.shards); assert.ok(result.shards >= 2);
  const urls = index.locations.flatMap(loc => parseSitemap(readFileSync(resolve(root, 'dist', new URL(loc).pathname.slice(1)), 'utf8')).locations);
  assert.equal(urls.length, 2 + 132876); assert.equal(new Set(urls).size, urls.length);
  assert.ok(!urls.includes('https://canlicapital.com/companies/0000000002/Assets'));
  assert.ok(!urls.some(url => url.includes('/companies/0001296774')));
  assert.deepEqual(index.locations, ['sitemap-site.xml', 'sitemap-companies-1.xml', 'sitemap-companies-2.xml', 'sitemap-companies-3.xml'].map(name => `https://canlicapital.com/${name}`));
  assert.deepEqual(readdirSync(resolve(root, 'dist')).filter(name => name.startsWith('sitemap')).sort(), ['sitemap-companies-1.xml', 'sitemap-companies-2.xml', 'sitemap-companies-3.xml', 'sitemap-site.xml', 'sitemap.xml']);
});

test('sitemap child names and company files stay identical when site lastmods change between deploys', t => {
  const activation = loadCompanyActivation();
  const build = lastmod => {
    const { root } = distFixture(t);
    writeFileSync(resolve(root, 'dist/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://canlicapital.com/performance</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>\n</urlset>\n`);
    prepareCompanyProductionOutput(root, { environment: { VERCEL_ENV: 'production' }, activation });
    const read = name => readFileSync(resolve(root, 'dist', name), 'utf8');
    return { index: read('sitemap.xml'), site: read('sitemap-site.xml'), c1: read('sitemap-companies-1.xml'), c2: read('sitemap-companies-2.xml'), c3: read('sitemap-companies-3.xml') };
  };
  const first = build('2026-09-20'), second = build('2026-09-21');
  assert.equal(first.index, second.index);
  assert.equal(first.c1, second.c1); assert.equal(first.c2, second.c2); assert.equal(first.c3, second.c3);
  assert.notEqual(first.site, second.site);
});

test('production config routes company paths to the function first and bundles the activation files', () => {
  const config = JSON.parse(readFileSync('vercel.json'));
  assert.deepEqual(config.rewrites.slice(0, 3), COMPANY_ROUTES);
  const include = config.functions['api/v1/company-reference.js'].includeFiles;
  const activation = JSON.parse(readFileSync('config/company-production-activation.json'));
  for (const file of ['dist/company-page-assets.json', 'config/company-production-activation.json', activation.admission.path]) assert.ok(include.includes(file), file);
  assert.ok(!config.headers.some(rule => rule.source.startsWith('/companies') && rule.headers.some(h => h.key === 'X-Robots-Tag')), 'production must not force noindex on company paths');
  assert.match(JSON.parse(readFileSync('package.json')).scripts.postbuild, /prepare-company-production-output\.mjs/);
});

test('admission builder withholds pending-review companies and flagged histories and closes the partition', async () => {
  const { buildCompanyAdmission } = await import('./build-company-admission.mjs');
  const url = (path, lastmod) => `<url><loc>https://canlicapital.com${path}</loc><lastmod>${lastmod}</lastmod></url>`;
  const shard = '<urlset>' + [
    url('/companies/0000000001', '2026-09-20'), url('/companies/0000000001/Assets', '2026-09-20'), url('/companies/0000000001/Revenues', '2026-09-20'),
    url('/companies/0000000002', '2026-09-19'), url('/companies/0000000002/Assets', '2026-09-19'), url('/companies/0000000002/Revenues', '2026-09-19'),
  ].join('') + '</urlset>';
  const release = { schema: 'canli.company-release.v1', release_hash: RELEASE, catalog_root: 'c'.repeat(64), download_root: 'd'.repeat(64), companies: 2, histories: 4 };
  const discovery = { schema: 'canli.company-discovery.v1', release_hash: RELEASE, catalog_root: 'c'.repeat(64), directory_pages: 1 };
  const quality = { schema: 'canli.company-selected-quality.v1', selection_policy: 'extended-v22', totals: { companies: 2, histories: 4, flagged_pages: 1 }, flagged_pages: [{ path: '/companies/0000000001/Revenues', cik: '0000000001', tag: 'Revenues', flags: ['historical_only'] }] };
  const scopes = [{ label: 'ledger', ledger: { rows: [{ cik: '0000000002', state: 'ACCOUNTING_SCOPE_REVIEW_PENDING' }, { cik: '0000000001', state: 'SCOPE_REVIEWED_WITH_SOURCE_CONTEXT' }, { cik: '0000000009', state: 'ACCOUNTING_SCOPE_REVIEW_PENDING' }] } }];
  const admission = buildCompanyAdmission({ release, discovery, shards: [shard], quality, scopes });
  assert.deepEqual(admission.counts, { overviews_admitted: 1, histories_admitted: 1, histories_withheld_flagged: 1, histories_withheld_company: 2, overviews_withheld_company: 1, directory_pages: 1, urls_admitted: 3 });
  assert.deepEqual(Object.keys(admission.excluded_companies), ['0000000002']);
  const bytes = Buffer.from(JSON.stringify(admission));
  const parsed = parseCompanyAdmission(bytes, { releaseHash: RELEASE, sha256: sha256(bytes) });
  assert.deepEqual([...parsed.admittedPaths()].map(entry => entry.path), ['/companies/0000000001', '/companies/0000000001/Assets']);
  assert.throws(() => buildCompanyAdmission({ release: { ...release, histories: 5 }, discovery, shards: [shard], quality: { ...quality, totals: { ...quality.totals, histories: 5 } }, scopes }), /release has 2\/5/);
  assert.throws(() => buildCompanyAdmission({ release, discovery, shards: [shard], quality: { ...quality, flagged_pages: [{ ...quality.flagged_pages[0], path: '/companies/0000000001/Cash', tag: 'Cash' }] }, scopes }), /not in the release/);
});
