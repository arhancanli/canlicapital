// Staged-inventory verification for the nine-cohort v25 release: the v24 delivery
// (policy extended-v23, 6,391 companies, manifest bytes unchanged) plus a filings
// catalog (policy filings-v1).
//
// Checks: the delivery manifest bytes are the v24 bytes; the release binds the
// v24 catalog and download roots plus the filings root; every staged filings
// document equals a fresh derivation from the delivered source bytes under the
// tracked library and matches its company record; companies without filings
// hold no document; the discovery URL set is the v24 URL set plus one index per
// company with filings and one URL per filing; the storage plan is the v24 plan
// plus exactly the filings objects and the new release object; release,
// discovery and plan agree.
//
// Usage (from the website repository root):
//   [CORPUS_LOCAL=<corpus-local directory>] node scripts/verify-v25-runtime.mjs OUTPUT.json
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { catalogHash, createCompanyCatalog } from '../api/_lib/company-catalog.js';
import { createCompanyFilingsCatalog } from '../api/_lib/company-filings-catalog.js';
import { parseSitemap } from './lib/sitemaps.mjs';
import { companyDirectoryPath } from './lib/company-directory.mjs';
import { companyFilings, filingPath, filingsIndexPath, verifyFilingsBinding } from './lib/company-filings.mjs';
import { localFilingsReader } from './build-company-release.mjs';

// The staged data lives outside the tracked tree; CORPUS_LOCAL points at it when the
// verifier runs from another checkout of the same code.
const base = (process.env.CORPUS_LOCAL ?? 'artifacts/seo/corpus-local').replace(/\/?$/, '/');
const catalogDir = base + 'company-nine-cohort-catalog-v24';
const deliveryDir = base + 'company-nine-cohort-delivery-v24';
const filingsDir = base + 'company-nine-cohort-filings-v25';
const discoveryDir = base + 'company-nine-cohort-discovery-v25';
const planPath = base + 'company-nine-cohort-storage-plan-v25.json';
const previousDiscoveryDir = base + 'company-nine-cohort-discovery-v24';
const previousPlanPath = base + 'company-nine-cohort-storage-plan-v24.json';
const previousPointerPath = base + 'retained/company-nine-cohort-release-v24-pointer.json';
const V24_MANIFEST_SHA256 = 'c1471479c58572ab1193e1aba80ee4e4716de5c70c4a122dc3fc983eba5c9d3b';
const V24_RELEASE_HASH = '19fd560ed5f20431046ff136ddf9d4eb1c08de47e68d4f226f2829d1eab49888';
const V24_PLAN_SHA256 = 'dd846dffca8d0b2887c3edc3e7895f912707466d2eac5f913aae5242df8db130';
const ORIGIN = 'https://canlicapital.com';
const FILING_URL = /^https:\/\/canlicapital\.com\/companies\/\d{10}\/filings(?:\/\d{10}-\d{2}-\d{6})?$/;

const read = path => JSON.parse(readFileSync(path));
const manifestBytes = readFileSync(deliveryDir + '/delivery.json');
assert.equal(catalogHash(manifestBytes), V24_MANIFEST_SHA256, 'the v25 release must use the v24 delivery bytes');
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.selection_policy, 'extended-v23'); assert.equal(manifest.files.length, 6391);
const previousRelease = read(previousPointerPath);
assert.equal(previousRelease.release_hash, V24_RELEASE_HASH);
const release = read(deliveryDir + '/company-release.json');
const releaseBytes = readFileSync(`${deliveryDir}/objects/${release.release_hash}.json`);
assert.equal(catalogHash(releaseBytes), release.release_hash);
const { release_hash: releaseHash, ...releaseBody } = release;
assert.deepEqual(JSON.parse(releaseBytes), releaseBody);
assert.equal(release.catalog_root, previousRelease.catalog_root); assert.equal(release.download_root, previousRelease.download_root);
assert.equal(release.companies, previousRelease.companies); assert.equal(release.histories, previousRelease.histories);
assert.equal(release.publication_approved, false);
const filingsManifest = read(filingsDir + '/filings-catalog.json'), build = read(filingsDir + '/filings-build.json');
assert.equal(filingsManifest.schema, 'canli.company-filings-catalog.v1'); assert.equal(filingsManifest.publication_approved, false);
assert.equal(release.filings_root, filingsManifest.root_hash); assert.equal(release.filings, filingsManifest.filings); assert.equal(release.filing_companies, filingsManifest.companies);
assert.equal(build.schema, 'canli.company-filings-build.v1'); assert.equal(build.root_hash, filingsManifest.root_hash);
assert.equal(build.delivery_manifest_sha256, V24_MANIFEST_SHA256); assert.equal(build.catalog_root, release.catalog_root);
assert.equal(build.filings_policy, 'filings-v1'); assert.equal(build.selection_policy, 'extended-v23');
assert.equal(build.companies_with_filings + build.companies_without_filings.length, manifest.files.length);
assert.equal(build.library_sha256, catalogHash(readFileSync('scripts/lib/company-filings.mjs')), 'filings must have been derived with the tracked library');

// Every staged filings document is a fresh derivation of the delivered source bytes.
const catalog = createCompanyCatalog({ rootHash: release.catalog_root, readObject: hash => readFileSync(`${catalogDir}/objects/${hash}.json`) });
const filings = createCompanyFilingsCatalog({ rootHash: release.filings_root, readObject: localFilingsReader(filingsDir) });
function load(descriptor) {
  const bytes = readFileSync(deliveryDir + '/' + descriptor.storage_path);
  assert.equal(bytes.length, descriptor.bytes); assert.equal(catalogHash(bytes), descriptor.sha256);
  return bytes;
}
const expectedUrls = new Set(), without = [];
let filingCount = 0, filingCompanies = 0, histories = 0, thin = 0, withheld = 0;
for (const [i, file] of manifest.files.entries()) {
  const company = await catalog.getCompany(file.cik);
  assert.ok(company, `company ${file.cik} is not in the catalog`); assert.equal(company.source_sha256, file.source_sha256);
  expectedUrls.add(`${ORIGIN}/companies/${file.cik}`);
  for (const concept of company.concepts) { expectedUrls.add(`${ORIGIN}/companies/${file.cik}/${concept.tag}`); histories++; }
  const raw = gunzipSync(load(file.source), { maxOutputLength: 64 * 1024 * 1024 });
  assert.equal(catalogHash(raw), file.source_sha256);
  const derived = companyFilings(raw.toString('utf8'), { fetchedAt: company.fetched_at, expectedCik: file.cik, selectionPolicy: 'extended-v23' });
  thin += derived.summary.thin_filings; withheld += derived.summary.withheld_filings;
  const stored = await filings.getFilings(file.cik);
  if (!derived.filings.length) { assert.equal(stored, null, `${file.cik} has no qualifying filing but holds a document`); without.push(file.cik); continue; }
  assert.ok(stored, `${file.cik} has qualifying filings but no document`);
  assert.ok(isDeepStrictEqual(stored, derived), `${file.cik} stored filings differ from a fresh derivation`);
  verifyFilingsBinding(stored, company);
  assert.deepEqual(await filings.filingSummary(file.cik), { filings: stored.filings.length });
  expectedUrls.add(ORIGIN + filingsIndexPath(file.cik));
  for (const filing of stored.filings) { expectedUrls.add(ORIGIN + filingPath(file.cik, filing.accession)); filingCount++; }
  filingCompanies++;
  if ((i + 1) % 500 === 0) console.error(JSON.stringify({ companies: i + 1, filings: filingCount }));
}
assert.equal(histories, release.histories); assert.equal(filingCount, release.filings); assert.equal(filingCompanies, release.filing_companies);
assert.deepEqual(without, build.companies_without_filings);
assert.equal(thin, build.thin_filings); assert.equal(withheld, build.withheld_filings);
assert.equal(await filings.filingSummary('9999999999'), null);
for (let page = 1; page <= Math.ceil(release.companies / 50); page++) expectedUrls.add(ORIGIN + companyDirectoryPath(page));

// Discovery: the v24 URL set plus exactly the filing URLs, one index listing every shard.
function sitemapUrls(directory, discovery) {
  const urls = new Set(), indexes = [], shards = [];
  for (const f of discovery.files) {
    const bytes = readFileSync(directory + '/' + f.storage_path);
    assert.equal(bytes.length, f.bytes); assert.equal(catalogHash(bytes), f.sha256);
    const xml = bytes.toString('utf8'), parsed = parseSitemap(xml);
    if (parsed.index) { indexes.push(parsed.locations); continue; }
    for (const url of parsed.locations) { assert.ok(!urls.has(url), `duplicate ${url}`); urls.add(url); }
    shards.push({ name: f.name, urls: parsed.locations.length, bytes: bytes.length });
  }
  assert.equal(indexes.length, 1);
  assert.deepEqual([...indexes[0]].sort(), shards.map(f => `${ORIGIN}/${f.name}`).sort());
  return { urls, shards };
}
const discovery = read(discoveryDir + '/discovery.json'), previousDiscovery = read(previousDiscoveryDir + '/discovery.json');
assert.equal(previousDiscovery.release_hash, V24_RELEASE_HASH);
assert.equal(discovery.schema, 'canli.company-discovery.v1'); assert.equal(discovery.publication_approved, false);
assert.equal(discovery.release_hash, release.release_hash); assert.equal(discovery.catalog_root, release.catalog_root); assert.equal(discovery.filings_root, release.filings_root);
assert.equal(discovery.companies, release.companies); assert.equal(discovery.histories, release.histories);
assert.equal(discovery.filings, release.filings); assert.equal(discovery.filing_companies, release.filing_companies);
assert.equal(discovery.directory_pages, Math.ceil(release.companies / 50));
assert.equal(discovery.urls, previousDiscovery.urls + release.filings + release.filing_companies);
const { urls: actualUrls, shards } = sitemapUrls(discoveryDir, discovery);
const previousUrls = sitemapUrls(previousDiscoveryDir, previousDiscovery).urls;
assert.equal(actualUrls.size, discovery.urls);
assert.deepEqual([...actualUrls].sort(), [...expectedUrls].sort());
for (const url of previousUrls) assert.ok(actualUrls.has(url), `v24 URL missing: ${url}`);
let added = 0;
for (const url of actualUrls) if (!previousUrls.has(url)) { assert.match(url, FILING_URL); added++; }
assert.equal(added, release.filings + release.filing_companies);

// Storage plan: the v24 plan plus the filings objects and the new release object.
const plan = read(planPath), previousPlan = read(previousPlanPath);
assert.equal(catalogHash(readFileSync(previousPlanPath)), V24_PLAN_SHA256); assert.equal(previousPlan.release_hash, V24_RELEASE_HASH);
assert.equal(plan.schema, 'canli.company-storage-plan.v1'); assert.equal(plan.publication_approved, false);
assert.equal(plan.release_hash, release.release_hash); assert.equal(plan.catalog_root, release.catalog_root); assert.equal(plan.download_root, release.download_root);
assert.equal(plan.filings_root, release.filings_root); assert.equal(plan.filings, release.filings); assert.equal(plan.filing_companies, release.filing_companies);
assert.equal(plan.delivery_manifest_sha256, V24_MANIFEST_SHA256);
assert.equal(plan.companies, release.companies); assert.equal(plan.histories, release.histories);
assert.equal(plan.objects, plan.files.length); assert.equal(plan.bytes, plan.files.reduce((sum, f) => sum + f.bytes, 0));
const planKeys = new Map(plan.files.map(f => [f.key, f]));
assert.equal(planKeys.size, plan.files.length);
const previousReleaseKey = `delivery/objects/${V24_RELEASE_HASH}.json`;
for (const f of previousPlan.files) {
  if (f.key === previousReleaseKey) { assert.ok(!planKeys.has(f.key), 'the v24 release object is not part of the v25 plan'); continue; }
  const current = planKeys.get(f.key);
  assert.ok(current, `v24 object missing from the v25 plan: ${f.key}`);
  assert.equal(current.sha256, f.sha256); assert.equal(current.bytes, f.bytes); assert.equal(current.content_type, f.content_type);
}
const previousKeys = new Set(previousPlan.files.map(f => f.key));
let addedNodes = 0, addedLeaves = 0, addedBytes = 0, addedRelease = 0;
for (const f of plan.files) {
  if (previousKeys.has(f.key)) continue;
  assert.equal(catalogHash(readFileSync(f.local_path)), f.sha256);
  if (f.key === `delivery/objects/${release.release_hash}.json`) { addedRelease++; continue; }
  assert.ok(f.key.startsWith('catalog/objects/'), `unexpected new object ${f.key}`);
  assert.ok(realpathSync(f.local_path).startsWith(realpathSync(filingsDir) + '/objects/'), `new object not from the filings catalog: ${f.key}`);
  if (f.key.endsWith('.json.gz')) { assert.equal(f.content_type, 'application/gzip'); addedLeaves++; } else { assert.equal(f.content_type, 'application/json'); addedNodes++; }
  addedBytes += f.bytes;
}
assert.equal(addedRelease, 1); assert.equal(addedLeaves, filingsManifest.companies); assert.equal(addedNodes, filingsManifest.index_nodes);
assert.equal(addedBytes, filingsManifest.object_bytes);
assert.equal(plan.objects, previousPlan.objects + addedLeaves + addedNodes);

const output = {
  schema: 'canli.v25-runtime-verification.v1', publication_approved: false,
  previous_release_hash: V24_RELEASE_HASH, delivery_manifest_sha256: V24_MANIFEST_SHA256, previous_plan_sha256: V24_PLAN_SHA256,
  selection_policy: 'extended-v23', filings_policy: 'filings-v1',
  companies: release.companies, histories: release.histories, filing_companies: release.filing_companies, filings: release.filings,
  companies_without_filings: without, thin_filings: thin, withheld_filings: withheld,
  directory_pages: discovery.directory_pages, candidate_urls: actualUrls.size, added_urls: added, sitemap_shards: shards,
  release_hash: release.release_hash, catalog_root: release.catalog_root, download_root: release.download_root, filings_root: release.filings_root,
  filings_catalog: { index_levels: filingsManifest.index_levels, index_nodes: filingsManifest.index_nodes, object_bytes: filingsManifest.object_bytes, inflated_bytes: filingsManifest.inflated_bytes },
  storage_plan_sha256: catalogHash(readFileSync(planPath)), objects: plan.objects, bytes: plan.bytes, added_objects: addedLeaves + addedNodes + addedRelease, added_bytes: addedBytes,
  filings_build_sha256: catalogHash(readFileSync(filingsDir + '/filings-build.json')), library_sha256: build.library_sha256,
  code_sha256: catalogHash(readFileSync(new URL(import.meta.url))),
  scope: 'Same delivery bytes as v24; every filings document re-derived from the delivered source and compared byte-for-byte; discovery equals the v24 URL set plus the filing family; the plan equals the v24 plan plus the filings objects. Staged inventory only, not editorial admission, hosting or indexing evidence.',
};
writeFileSync(process.argv[2], JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ companies: release.companies, histories: release.histories, filing_companies: release.filing_companies, filings: release.filings, candidate_urls: actualUrls.size, objects: plan.objects, bytes: plan.bytes, added_bytes: addedBytes }));
