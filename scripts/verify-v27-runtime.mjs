// Staged-inventory verification for the eighteen-cohort v27 release: the thirteen v26
// cohorts carried unchanged plus five historical cohorts (policy extended-v23,
// captured 2026-09-23 from slices 05-09 of the historical bulk discovery), with the filing family.
//
// Checks: every v26 company is carried byte for byte (same source hash, same
// selected record); every new company comes from one of the four historical
// capture queues and is absent from v24; every staged object hashes; every
// filings document equals a fresh derivation from the delivered source bytes
// under the tracked library; the discovery URL set equals the derived set
// (directory, overviews, histories, filing indexes, filing pages); the storage
// plan covers the release, the plan and discovery bind the same release. Counts
// are derived, then reported, never typed.
//
// Usage (from the website repository root):
//   [CORPUS_LOCAL=<corpus-local directory>] node scripts/verify-v27-runtime.mjs OUTPUT.json
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { catalogHash, createCompanyCatalog } from '../api/_lib/company-catalog.js';
import { createCompanyFilingsCatalog } from '../api/_lib/company-filings-catalog.js';
import { parseSitemap } from './lib/sitemaps.mjs';
import { companyDirectoryPath } from './lib/company-directory.mjs';
import { companyFilings, filingPath, filingsIndexPath, verifyFilingsBinding } from './lib/company-filings.mjs';
import { historicalFiler } from './lib/company-coverage.mjs';
import { localFilingsReader } from './build-company-release.mjs';

const base = (process.env.CORPUS_LOCAL ?? 'artifacts/seo/corpus-local').replace(/\/?$/, '/');
const catalogDir = base + 'company-eighteen-cohort-catalog-v27';
const deliveryDir = base + 'company-eighteen-cohort-delivery-v27';
const filingsDir = base + 'company-eighteen-cohort-filings-v27';
const discoveryDir = base + 'company-eighteen-cohort-discovery-v27';
const planPath = base + 'company-eighteen-cohort-storage-plan-v27.json';
const previousDir = base + 'company-thirteen-cohort-delivery-v26';
const PREVIOUS_MANIFEST_SHA256 = '711b539b3ee39e8fa5a0104a659e4e475437e26e44468dde090c0be66bd06698';
const NEW_QUEUES = ['fifteenth-1000', 'sixteenth-1000', 'seventeenth-1000', 'eighteenth-1000', 'nineteenth-800'];
const ORIGIN = 'https://canlicapital.com';

const read = path => JSON.parse(readFileSync(path));
const manifestPath = deliveryDir + '/delivery.json';
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes);
assert.equal(catalogHash(readFileSync(previousDir + '/delivery.json')), PREVIOUS_MANIFEST_SHA256);
const previous = read(previousDir + '/delivery.json');
const old = new Map(previous.files.map(f => [f.cik, f]));
assert.equal(old.size, 10201);
assert.equal(manifest.selection_policy, 'extended-v23'); assert.equal(previous.selection_policy, 'extended-v23');
assert.equal(manifest.publication_approved, false);
assert.equal(manifest.source_deliveries.length, previous.source_deliveries.length + NEW_QUEUES.length);
const newQueue = new Map();
for (const name of NEW_QUEUES) for (const cik of read(base + name + '/ciks.json')) { assert(!newQueue.has(cik)); newQueue.set(cik, name); }
for (const cik of newQueue.keys()) assert(!old.has(cik), `queued CIK ${cik} already in v26`);

const release = read(deliveryDir + '/company-release.json');
const releaseBytes = readFileSync(`${deliveryDir}/objects/${release.release_hash}.json`);
assert.equal(catalogHash(releaseBytes), release.release_hash);
const { release_hash: releaseHash, ...releaseBody } = release;
assert.deepEqual(JSON.parse(releaseBytes), releaseBody);
assert.equal(release.publication_approved, false);
const filingsManifest = read(filingsDir + '/filings-catalog.json'), build = read(filingsDir + '/filings-build.json');
assert.equal(release.filings_root, filingsManifest.root_hash); assert.equal(release.filings, filingsManifest.filings); assert.equal(release.filing_companies, filingsManifest.companies);
assert.equal(build.root_hash, filingsManifest.root_hash); assert.equal(build.delivery_manifest_sha256, catalogHash(manifestBytes)); assert.equal(build.catalog_root, release.catalog_root);
assert.equal(build.filings_policy, 'filings-v1'); assert.equal(build.selection_policy, 'extended-v23');
assert.equal(build.library_sha256, catalogHash(readFileSync('scripts/lib/company-filings.mjs')), 'filings must have been derived with the tracked library');

function load(directory, descriptor) {
  const bytes = readFileSync(directory + '/' + descriptor.storage_path);
  assert.equal(bytes.length, descriptor.bytes); assert.equal(catalogHash(bytes), descriptor.sha256);
  return bytes;
}
const catalog = createCompanyCatalog({ rootHash: release.catalog_root, readObject: hash => readFileSync(`${catalogDir}/objects/${hash}.json`) });
const filings = createCompanyFilingsCatalog({ rootHash: release.filings_root, readObject: localFilingsReader(filingsDir) });
const expectedUrls = new Set(), seen = new Set(), without = [];
let histories = 0, carried = 0, carriedHistories = 0, filingCount = 0, filingCompanies = 0, historical = 0;
const added = Object.fromEntries(NEW_QUEUES.map(name => [name, 0]));
for (const [i, file] of manifest.files.entries()) {
  assert(!seen.has(file.cik)); seen.add(file.cik);
  const source = load(deliveryDir, file.source);
  assert.equal(catalogHash(gunzipSync(source)), file.source_sha256);
  const selected = JSON.parse(load(deliveryDir, file.selected));
  assert.equal(selected.cik, file.cik); assert.equal(selected.selection_policy, 'extended-v23');
  const company = await catalog.getCompany(file.cik);
  assert.ok(company, `company ${file.cik} is not in the catalog`);
  assert.ok(isDeepStrictEqual(selected, { ...company, source_snapshot: file.source.path }), `${file.cik} selected record differs from the catalog`);
  const before = old.get(file.cik);
  if (before) {
    assert.equal(file.source_sha256, before.source_sha256); assert.deepEqual(file.source, before.source); assert.deepEqual(file.selected, before.selected);
    carried++; carriedHistories += company.concepts.length;
  } else {
    const queue = newQueue.get(file.cik);
    assert.ok(queue, `${file.cik} is not from a historical capture queue`);
    added[queue]++;
  }
  if (historicalFiler(company)) { historical++; const entry = await catalog.entry(file.cik); assert.equal(entry.historical, true); assert.match(entry.last_filed, /^\d{4}-\d{2}-\d{2}$/); }
  expectedUrls.add(`${ORIGIN}/companies/${file.cik}`);
  for (const concept of company.concepts) { expectedUrls.add(`${ORIGIN}/companies/${file.cik}/${concept.tag}`); histories++; }
  const derived = companyFilings(gunzipSync(source, { maxOutputLength: 64 * 1024 * 1024 }).toString('utf8'), { fetchedAt: company.fetched_at, expectedCik: file.cik, selectionPolicy: 'extended-v23' });
  const stored = await filings.getFilings(file.cik);
  if (!derived.filings.length) { assert.equal(stored, null, `${file.cik} has no qualifying filing but holds a document`); without.push(file.cik); }
  else {
    assert.ok(stored, `${file.cik} has qualifying filings but no document`);
    assert.ok(isDeepStrictEqual(stored, derived), `${file.cik} stored filings differ from a fresh derivation`);
    verifyFilingsBinding(stored, company);
    expectedUrls.add(ORIGIN + filingsIndexPath(file.cik));
    for (const filing of stored.filings) { expectedUrls.add(ORIGIN + filingPath(file.cik, filing.accession)); filingCount++; }
    filingCompanies++;
  }
  if ((i + 1) % 1000 === 0) console.error(JSON.stringify({ companies: i + 1, filings: filingCount }));
}
assert.equal(carried, old.size, 'every v26 company must be carried over');
assert.equal(carriedHistories, 457906);
assert.equal(seen.size, release.companies); assert.equal(histories, release.histories);
assert.equal(filingCount, release.filings); assert.equal(filingCompanies, release.filing_companies);
assert.deepEqual(without, build.companies_without_filings);
const pages = Math.ceil(release.companies / 50);
for (let page = 1; page <= pages; page++) expectedUrls.add(ORIGIN + companyDirectoryPath(page));

// Discovery.
const discovery = read(discoveryDir + '/discovery.json');
assert.equal(discovery.release_hash, release.release_hash); assert.equal(discovery.catalog_root, release.catalog_root); assert.equal(discovery.filings_root, release.filings_root);
assert.equal(discovery.companies, release.companies); assert.equal(discovery.histories, release.histories);
assert.equal(discovery.filings, release.filings); assert.equal(discovery.filing_companies, release.filing_companies);
assert.equal(discovery.directory_pages, pages); assert.equal(discovery.publication_approved, false);
const actualUrls = new Set(), indexes = [], shards = [];
for (const f of discovery.files) {
  const bytes = readFileSync(discoveryDir + '/' + f.storage_path);
  assert.equal(bytes.length, f.bytes); assert.equal(catalogHash(bytes), f.sha256);
  const xml = bytes.toString('utf8'), parsed = parseSitemap(xml);
  if (parsed.index) { indexes.push(parsed.locations); continue; }
  for (const url of parsed.locations) { assert.ok(!actualUrls.has(url), `duplicate ${url}`); actualUrls.add(url); }
  shards.push({ name: f.name, urls: parsed.locations.length, bytes: bytes.length });
}
assert.equal(indexes.length, 1);
assert.deepEqual([...indexes[0]].sort(), shards.map(f => `${ORIGIN}/${f.name}`).sort());
assert.equal(actualUrls.size, discovery.urls);
assert.deepEqual([...actualUrls].sort(), [...expectedUrls].sort());

// Storage plan.
const plan = read(planPath);
assert.equal(plan.publication_approved, false);
assert.equal(plan.release_hash, release.release_hash); assert.equal(plan.catalog_root, release.catalog_root); assert.equal(plan.download_root, release.download_root);
assert.equal(plan.filings_root, release.filings_root); assert.equal(plan.filings, release.filings); assert.equal(plan.filing_companies, release.filing_companies);
assert.equal(plan.delivery_manifest_sha256, catalogHash(manifestBytes));
assert.equal(plan.companies, release.companies); assert.equal(plan.histories, release.histories);
assert.equal(plan.objects, plan.files.length); assert.equal(plan.bytes, plan.files.reduce((sum, f) => sum + f.bytes, 0));
const keys = new Set(plan.files.map(f => f.key)); assert.equal(keys.size, plan.files.length);
assert.ok(keys.has(`delivery/objects/${release.release_hash}.json`));
for (const f of plan.files.filter((_, i) => i % 97 === 0)) assert.equal(catalogHash(readFileSync(realpathSync(f.local_path))), f.sha256);
const previousPlan = read(base + 'company-thirteen-cohort-storage-plan-v26.json');
const previousKeys = new Set(previousPlan.files.map(f => f.key));
let carriedObjects = 0; for (const key of keys) if (previousKeys.has(key)) carriedObjects++;

const output = {
  schema: 'canli.v27-runtime-verification.v1', publication_approved: false,
  previous_manifest_sha256: PREVIOUS_MANIFEST_SHA256, selection_policy: 'extended-v23', filings_policy: 'filings-v1',
  companies: release.companies, carried_companies: carried, added_companies: added, historical_filers: historical,
  histories: release.histories, carried_histories: carriedHistories, filing_companies: release.filing_companies, filings: release.filings,
  companies_without_filings: without.length, directory_pages: pages, candidate_urls: actualUrls.size, sitemap_shards: shards,
  release_hash: release.release_hash, catalog_root: release.catalog_root, download_root: release.download_root, filings_root: release.filings_root,
  delivery_manifest_sha256: catalogHash(manifestBytes), storage_plan_sha256: catalogHash(readFileSync(planPath)),
  objects: plan.objects, bytes: plan.bytes, objects_in_v26_plan: carriedObjects, new_objects: plan.objects - carriedObjects,
  filings_build_sha256: catalogHash(readFileSync(filingsDir + '/filings-build.json')), library_sha256: build.library_sha256,
  code_sha256: catalogHash(readFileSync(new URL(import.meta.url))),
  scope: 'Every v26 company carried unchanged; every new company from a historical capture queue; every filings document re-derived and compared; discovery equals the derived URL set; the plan binds the release. Staged inventory only, not editorial admission, hosting or indexing evidence.',
};
writeFileSync(process.argv[2], JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ companies: release.companies, carried, added, historical, histories: release.histories, filings: release.filings, candidate_urls: actualUrls.size, objects: plan.objects, new_objects: plan.objects - carriedObjects, bytes: plan.bytes }));
