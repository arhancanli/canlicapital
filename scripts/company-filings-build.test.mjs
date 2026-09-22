import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { gunzipSync, gzipSync } from 'node:zlib';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { createCompanyFilingsCatalog } from '../api/_lib/company-filings-catalog.js';
import { loadCompanyFilingAdmission, parseCompanyAdmission } from '../api/_lib/company-activation.js';
import { refreshCandidates } from './refresh-company-candidates.mjs';
import { stageCompanyDelivery } from './stage-company-delivery.mjs';
import { combineCompanyDeliveries } from './combine-company-deliveries.mjs';
import { buildCompanyCatalog } from './lib/build-company-catalog.mjs';
import { buildCompanyFilingsCatalog } from './lib/build-company-filings-catalog.mjs';
import { buildCompanyAssets } from './lib/company-assets.mjs';
import { companyPreviewServer } from './lib/company-preview-server.mjs';
import { parseSitemap } from './lib/sitemaps.mjs';
import { filingPath, filingsIndexPath } from './lib/company-filings.mjs';
import { buildCompanyFilings } from './build-company-filings.mjs';
import { buildCompanyRelease, localFilingsReader } from './build-company-release.mjs';
import { buildCompanyDiscovery } from './build-company-discovery.mjs';
import { prepareCompanyStorage } from './prepare-company-storage.mjs';
import { buildCompanyAdmission } from './build-company-admission.mjs';
import { prepareCompanyProductionOutput } from './prepare-company-production-output.mjs';

const ORIGIN = 'https://canlicapital.com';
const CIKS = ['0000029534', '0000320193'];
const read = path => JSON.parse(readFileSync(path));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Two pilot captures staged under extended-v23 and combined, as the real cohorts are.
async function staged(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'canli-filings-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const inputs = [];
  for (const [i, cik] of CIKS.entries()) {
    const record = read(`public/company-data/${cik}.json`);
    const raw = gunzipSync(readFileSync('public' + record.source_snapshot));
    const input = resolve(root, `captures-${i}`), directory = resolve(root, `delivery-${i}`);
    await refreshCandidates({ ciks: [cik], output: input, now: () => '2026-09-19T12:00:00Z', pause: async () => {}, fetcher: async () => new Response(raw) });
    writeFileSync(resolve(input, 'ciks.json'), JSON.stringify([cik]));
    stageCompanyDelivery(input, directory, undefined, { selectionPolicy: 'extended-v23' });
    inputs.push({ directory, manifest_sha256: catalogHash(readFileSync(resolve(directory, 'delivery.json'))) });
  }
  const delivery = resolve(root, 'delivery'), catalog = resolve(root, 'catalog'), filings = resolve(root, 'filings'), discovery = resolve(root, 'discovery');
  const manifest = await combineCompanyDeliveries(inputs, delivery);
  buildCompanyCatalog(manifest.files.map(item => read(resolve(delivery, item.selected.storage_path))), catalog);
  return { root, delivery, catalog, filings, discovery, manifest };
}
const documentsOf = async (filings, rootHash) => { const catalog = createCompanyFilingsCatalog({ rootHash, readObject: localFilingsReader(filings) }); return Promise.all(CIKS.map(cik => catalog.getFilings(cik))); };
const sitemapUrls = (discoveryDir, discovery) => discovery.files.map(f => parseSitemap(readFileSync(resolve(discoveryDir, f.storage_path), 'utf8'))).filter(parsed => !parsed.index).flatMap(parsed => parsed.locations);

test('filings are derived from the delivery, bound into the release, listed by discovery, planned for storage and served by the preview', async t => {
  const { root, delivery, catalog, filings, discovery: discoveryDir } = await staged(t);
  const build = buildCompanyFilings(catalog, delivery, filings);
  assert.equal(build.schema, 'canli.company-filings-build.v1'); assert.equal(build.publication_approved, false);
  assert.equal(build.selection_policy, 'extended-v23'); assert.equal(build.filings_policy, 'filings-v1');
  assert.equal(build.companies_delivered, 2); assert.equal(build.companies_with_filings, 2); assert.deepEqual(build.companies_without_filings, []);
  assert.ok(build.filings > 2); assert.equal(build.withheld_filings, 0);
  assert.equal(read(resolve(filings, 'filings-catalog.json')).root_hash, build.root_hash);
  assert.deepEqual(read(resolve(filings, 'filings-build.json')), build);
  const [first, second] = await documentsOf(filings, build.root_hash);
  assert.equal(first.filings.length + second.filings.length, build.filings);

  // Without the filings directory the release binds no filings; with it, the root and counts are bound.
  const plain = await buildCompanyRelease(catalog, delivery);
  assert.equal(plain.filings_root, undefined); assert.equal(plain.filings, undefined);
  const release = await buildCompanyRelease(catalog, delivery, filings);
  assert.equal(release.filings_root, build.root_hash); assert.equal(release.filings, build.filings); assert.equal(release.filing_companies, 2);
  assert.notEqual(release.release_hash, plain.release_hash);
  assert.equal(catalogHash(readFileSync(resolve(delivery, 'objects', release.release_hash + '.json'))), release.release_hash);

  // Discovery must be given the filings directory exactly when the release binds filings.
  await assert.rejects(buildCompanyDiscovery(catalog, delivery, discoveryDir), /filings directory is required/);
  const discovery = await buildCompanyDiscovery(catalog, delivery, discoveryDir, filings);
  assert.equal(discovery.filings_root, build.root_hash); assert.equal(discovery.filings, build.filings); assert.equal(discovery.filing_companies, 2);
  assert.equal(discovery.urls, 1 + 2 + release.histories + 2 + build.filings);
  const urls = new Set(sitemapUrls(discoveryDir, discovery));
  assert.equal(urls.size, discovery.urls);
  for (const [cik, document] of [[CIKS[0], first], [CIKS[1], second]]) {
    assert.ok(urls.has(ORIGIN + filingsIndexPath(cik)));
    for (const filing of document.filings) assert.ok(urls.has(ORIGIN + filingPath(cik, filing.accession)), filing.accession);
  }

  // The storage plan carries filings nodes and gzip leaves under the catalog namespace.
  await assert.rejects(prepareCompanyStorage(catalog, delivery), /filings directory is required/);
  const plan = await prepareCompanyStorage(catalog, delivery, filings);
  assert.equal(plan.filings_root, build.root_hash); assert.equal(plan.filings, build.filings); assert.equal(plan.filing_companies, 2);
  const leaves = plan.files.filter(item => item.key.startsWith('catalog/objects/') && item.key.endsWith('.json.gz'));
  assert.equal(leaves.length, 2);
  for (const leaf of leaves) { assert.equal(leaf.content_type, 'application/gzip'); assert.equal(catalogHash(readFileSync(leaf.local_path)), leaf.sha256); assert.ok(leaf.local_path.startsWith(filings)); }
  assert.ok(plan.files.some(item => item.key === `catalog/objects/${build.root_hash}.json`));
  assert.ok(!plan.files.some(item => item.key.startsWith('filings/')));
  // A plan for the release without filings holds none of them.
  await buildCompanyRelease(catalog, delivery);
  await assert.rejects(prepareCompanyStorage(catalog, delivery, filings), /binds no filings/);
  assert.ok(!(await prepareCompanyStorage(catalog, delivery)).files.some(item => item.key.endsWith('.json.gz') && item.key.startsWith('catalog/')));
  await buildCompanyRelease(catalog, delivery, filings);

  // The local preview serves filing pages from the same release, noindex.
  writeFileSync(resolve(root, 'company-page-assets.json'), JSON.stringify(buildCompanyAssets(readFileSync('companies/0000029534.html', 'utf8'), '<link rel="stylesheet" href="/assets/company.css">')));
  await assert.rejects(companyPreviewServer({ catalogDir: catalog, deliveryDir: delivery, distDir: root }), /filings directory is required/);
  const { server } = await companyPreviewServer({ catalogDir: catalog, deliveryDir: delivery, distDir: root, filingsDir: filings });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base + filingPath(CIKS[0], first.filings[0].accession));
  assert.equal(page.status, 200); assert.equal(page.headers.get('x-robots-tag'), 'noindex');
  assert.ok((await page.text()).includes(first.filings[0].sec_index_url));
  assert.equal((await fetch(base + filingsIndexPath(CIKS[1]))).status, 200);
  assert.equal((await fetch(base + filingPath(CIKS[0], '0000000000-00-000000'))).status, 404);
  assert.equal((await fetch(base + `/companies/${CIKS[0]}`)).status, 200);
});

test('the release refuses a filings document that names another capture, and the build refuses corrupt sources', async t => {
  const { delivery, catalog, filings } = await staged(t);
  const build = buildCompanyFilings(catalog, delivery, filings);
  const [first, second] = await documentsOf(filings, build.root_hash);
  const forged = resolve(filings, '..', 'forged');
  buildCompanyFilingsCatalog([{ ...first, source_sha256: 'a'.repeat(64) }, second], forged);
  await assert.rejects(buildCompanyRelease(catalog, delivery, forged), /source_sha256 does not match/);
  const partial = resolve(filings, '..', 'partial');
  const manifest = buildCompanyFilingsCatalog([second], partial);
  writeFileSync(resolve(partial, 'filings-catalog.json'), JSON.stringify({ ...manifest, companies: 2 }));
  await assert.rejects(buildCompanyRelease(catalog, delivery, partial), /count mismatch/);
  const foreign = resolve(filings, '..', 'foreign');
  buildCompanyFilingsCatalog([{ ...second, cik: '0000000009', filings: second.filings }], foreign);
  await assert.rejects(buildCompanyRelease(catalog, delivery, foreign), /does not match the release cohort/);
  const release = await buildCompanyRelease(catalog, delivery, filings);
  assert.equal(release.filings_root, build.root_hash);
  // A hand-written release pointer cannot list more filings than the catalog holds or bind a forged catalog.
  const pointer = readFileSync(resolve(delivery, 'company-release.json'));
  const repoint = body => { const bytes = Buffer.from(JSON.stringify(body)), hash = catalogHash(bytes); writeFileSync(resolve(delivery, 'objects', hash + '.json'), bytes); writeFileSync(resolve(delivery, 'company-release.json'), JSON.stringify({ ...body, release_hash: hash })); };
  const { release_hash: _, ...body } = release;
  repoint({ ...body, filings: release.filings + 1 });
  await assert.rejects(buildCompanyDiscovery(catalog, delivery, resolve(filings, '..', 'discovery'), filings), /filing counts do not match/);
  await assert.rejects(prepareCompanyStorage(catalog, delivery, filings), /filing counts mismatch/);
  repoint({ ...body, filings_root: read(resolve(forged, 'filings-catalog.json')).root_hash });
  await assert.rejects(buildCompanyDiscovery(catalog, delivery, resolve(filings, '..', 'discovery'), forged), /source_sha256 does not match/);
  await assert.rejects(prepareCompanyStorage(catalog, delivery, forged), /source_sha256 does not match/);
  writeFileSync(resolve(delivery, 'company-release.json'), pointer);
  writeFileSync(resolve(delivery, read(resolve(delivery, 'delivery.json')).files[0].source.storage_path), 'corrupt');
  assert.throws(() => buildCompanyFilings(catalog, delivery, resolve(filings, '..', 'again')), /corruption/);
});

test('admission counts filing pages with their company and the production sitemap lists them for admitted companies only', async t => {
  const { root, delivery, catalog, filings, discovery: discoveryDir } = await staged(t);
  const build = buildCompanyFilings(catalog, delivery, filings);
  const release = await buildCompanyRelease(catalog, delivery, filings);
  const discovery = await buildCompanyDiscovery(catalog, delivery, discoveryDir, filings);
  const shards = discovery.files.map(f => readFileSync(resolve(discoveryDir, f.storage_path), 'utf8')).filter(xml => !parseSitemap(xml).index);
  const quality = { schema: 'canli.company-selected-quality.v1', selection_policy: 'extended-v23', totals: { companies: 2, histories: release.histories, flagged_pages: 0 }, flagged_pages: [] };
  const scopes = [{ label: 'ledger', ledger: { rows: [{ cik: CIKS[1], state: 'ACCOUNTING_SCOPE_REVIEW_PENDING' }] } }];
  const filingsPath = 'config/company-filing-admission-test.json.gz';
  assert.throws(() => buildCompanyAdmission({ release, discovery, shards, quality, scopes }), /filing admission path is required/);
  assert.throws(() => buildCompanyAdmission({ release, discovery, shards, quality, scopes, filingsPath: 'artifacts/x.json.gz' }), /tracked config/);
  const { admission, filingAdmission } = buildCompanyAdmission({ release, discovery, shards, quality, scopes, filingsPath });
  const [first, second] = await documentsOf(filings, build.root_hash);
  const accessions = document => document.filings.map(filing => filing.accession).sort();
  assert.deepEqual(admission.filings, { path: filingsPath, sha256: sha256(filingAdmission.bytes), bytes: filingAdmission.bytes.length, filings_root: build.root_hash,
    filing_indexes_admitted: 1, filings_admitted: first.filings.length, filing_indexes_withheld_company: 1, filings_withheld_company: second.filings.length });
  const { counts } = admission;
  assert.equal(counts.filings_admitted, first.filings.length); assert.equal(counts.filings_withheld_company, second.filings.length);
  assert.equal(counts.urls_admitted, counts.overviews_admitted + counts.histories_admitted + counts.directory_pages + counts.filing_indexes_admitted + counts.filings_admitted);
  assert.deepEqual(filingAdmission.document, { schema: 'canli.company-filing-admission.v1', release_hash: release.release_hash, filings_root: build.root_hash, filing_companies: 2, filings: build.filings,
    counts: { filing_indexes_admitted: 1, filings_admitted: first.filings.length, filing_indexes_withheld_company: 1, filings_withheld_company: second.filings.length },
    companies: { [CIKS[0]]: accessions(first), [CIKS[1]]: accessions(second) } });
  assert.deepEqual(JSON.parse(gunzipSync(filingAdmission.bytes)), filingAdmission.document);
  assert.ok(admission.decision.rules.some(rule => rule.includes('filing')));

  // Production output: the sidecar yields filing URLs for the admitted company and none for the withheld one.
  mkdirSync(resolve(root, 'dist'), { recursive: true }); mkdirSync(resolve(root, 'config'), { recursive: true });
  const siteSitemap = () => writeFileSync(resolve(root, 'dist/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${ORIGIN}/</loc>\n    <lastmod>2026-09-01</lastmod>\n  </url>\n</urlset>\n`);
  for (const name of ['index.html', 'company-page-assets.json']) writeFileSync(resolve(root, 'dist', name), 'x');
  siteSitemap();
  writeFileSync(resolve(root, filingsPath), filingAdmission.bytes);
  const bytes = Buffer.from(JSON.stringify(admission));
  const activation = { enabled: true, ...parseCompanyAdmission(bytes, { releaseHash: release.release_hash, sha256: sha256(bytes) }) };
  assert.equal(loadCompanyFilingAdmission(activation, { root }).companies.get(CIKS[1]).length, second.filings.length);
  const result = prepareCompanyProductionOutput(root, { environment: { VERCEL_ENV: 'production' }, activation });
  assert.equal(result.companyUrls, counts.urls_admitted);
  const urls = new Set(parseSitemap(readFileSync(resolve(root, 'dist/sitemap-companies-1.xml'), 'utf8')).locations);
  assert.equal(urls.size, counts.urls_admitted);
  assert.ok(urls.has(ORIGIN + filingsIndexPath(CIKS[0])));
  for (const filing of first.filings) assert.ok(urls.has(ORIGIN + filingPath(CIKS[0], filing.accession)));
  assert.ok(!urls.has(ORIGIN + filingsIndexPath(CIKS[1])));
  for (const filing of second.filings) assert.ok(!urls.has(ORIGIN + filingPath(CIKS[1], filing.accession)));
  assert.ok(!urls.has(ORIGIN + `/companies/${CIKS[1]}`));

  // A sidecar that differs from its pin, or a pin outside config/*.json.gz, is refused.
  siteSitemap();
  writeFileSync(resolve(root, filingsPath), gzipSync(Buffer.from(JSON.stringify({ ...filingAdmission.document, companies: { [CIKS[0]]: accessions(first).slice(0, 1) } }))));
  assert.throws(() => prepareCompanyProductionOutput(root, { environment: { VERCEL_ENV: 'production' }, activation }), /does not match its pin/);
  const badPin = Buffer.from(JSON.stringify({ ...admission, filings: { ...admission.filings, path: 'config/company-filing-admission-test.json' } }));
  assert.throws(() => parseCompanyAdmission(badPin, { releaseHash: release.release_hash, sha256: sha256(badPin) }), /filings pin/);
  // Without the sidecar pin, the same admission yields no filing URLs and its counts no longer close.
  siteSitemap();
  const { filings: _, ...unpinned } = admission;
  const unpinnedBytes = Buffer.from(JSON.stringify(unpinned));
  assert.throws(() => prepareCompanyProductionOutput(root, { environment: { VERCEL_ENV: 'production' }, activation: { enabled: true, ...parseCompanyAdmission(unpinnedBytes, { releaseHash: release.release_hash, sha256: sha256(unpinnedBytes) }) } }), /expected/);
});
