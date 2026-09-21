// Staged-inventory verification for the ten-cohort v23 release.
//
// v23 = the five v22 cohorts, unchanged, plus cohorts six to nine captured on
// 2026-09-21 and the tenth cohort re-derived from retained v22-era captures
// (digit-string CIKs; see COMPANY_EDITORIAL_POLICY.md). This checks that every v22 company is carried over byte for byte
// (same source hash, same selected fetched_at), that every new company comes
// from one of the four new capture queues, that every staged object hashes,
// and that the discovery sitemap leaves, release and storage plan describe the
// same set. Counts are derived, then reported, never typed.
//
// Usage (from the website repository root):
//   node scripts/verify-v23-runtime.mjs OUTPUT.json
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { parseSitemap } from './lib/sitemaps.mjs';
import { companyDirectoryPath } from './lib/company-directory.mjs';

const base = 'artifacts/seo/corpus-local/';
const deliveryDir = base + 'company-ten-cohort-delivery-v23';
const discoveryDir = base + 'company-ten-cohort-discovery-v23';
const planPath = base + 'company-ten-cohort-storage-plan-v23.json';
const previousDir = base + 'company-five-cohort-delivery-v22';
const PREVIOUS_MANIFEST_SHA256 = '16a18cdc8d0bb19e6363599a0b491a8bb9e06aeebadb9c33b5e34f69e9110271';
const NEW_QUEUES = ['sixth-1000-r2', 'seventh-1000-r2', 'eighth-1000-r2', 'ninth-793-r2', 'tenth-89'];

const read = path => JSON.parse(readFileSync(path));
const manifestPath = deliveryDir + '/delivery.json';
const manifest = read(manifestPath);
assert.equal(catalogHash(readFileSync(previousDir + '/delivery.json')), PREVIOUS_MANIFEST_SHA256);
const previous = read(previousDir + '/delivery.json');
const old = new Map(previous.files.map(f => [f.cik, f]));
assert.equal(old.size, 3323);
assert.equal(manifest.selection_policy, previous.selection_policy);
assert.equal(manifest.publication_approved, false);
assert.equal(manifest.source_deliveries.length, 10);
const newQueue = new Map();
for (const name of NEW_QUEUES) for (const cik of read(base + name + '/ciks.json')) { assert(!newQueue.has(cik)); newQueue.set(cik, name); }
for (const cik of newQueue.keys()) assert(!old.has(cik), `queued CIK ${cik} already in v22`);
const tenthOrigin = read(base + 'tenth-89/origin.json');
assert.equal(tenthOrigin.schema, 'canli.company-reattempt-queue.v1');
assert.deepEqual(tenthOrigin.sources.map(row => row.cik).sort(), read(base + 'tenth-89/ciks.json'));

function load(directory, descriptor) {
  const bytes = readFileSync(directory + '/' + descriptor.storage_path);
  assert.equal(bytes.length, descriptor.bytes);
  assert.equal(catalogHash(bytes), descriptor.sha256);
  return bytes;
}
const expectedUrls = new Set(), seen = new Set();
let histories = 0, carried = 0;
const added = Object.fromEntries(NEW_QUEUES.map(name => [name, 0]));
for (const file of manifest.files) {
  assert(!seen.has(file.cik)); seen.add(file.cik);
  const before = old.get(file.cik);
  const source = load(deliveryDir, file.source);
  assert.equal(catalogHash(gunzipSync(source)), file.source_sha256);
  const selected = JSON.parse(load(deliveryDir, file.selected));
  assert.equal(selected.cik, file.cik);
  assert.equal(selected.selection_policy, manifest.selection_policy);
  if (before) {
    assert.equal(file.source_sha256, before.source_sha256);
    assert.deepEqual(file.source, before.source);
    const previousSelected = JSON.parse(load(previousDir, before.selected));
    assert.equal(selected.fetched_at, previousSelected.fetched_at);
    assert.equal(catalogHash(JSON.stringify(selected.concepts)), catalogHash(JSON.stringify(previousSelected.concepts)));
    carried++;
  } else {
    const queue = newQueue.get(file.cik);
    assert(queue, `company ${file.cik} is in neither v22 nor a new queue`);
    added[queue]++;
  }
  expectedUrls.add(`https://canlicapital.com/companies/${file.cik}`);
  for (const c of selected.concepts) { expectedUrls.add(`https://canlicapital.com/companies/${file.cik}/${c.tag}`); histories++; }
}
assert.equal(carried, 3323, 'every v22 company must be carried over');
const companies = manifest.files.length;
const release = read(deliveryDir + '/company-release.json');
assert.equal(release.companies, companies); assert.equal(release.histories, histories);
assert.equal(release.publication_approved, false);
const discovery = read(discoveryDir + '/discovery.json');
assert.equal(discovery.release_hash, release.release_hash);
assert.equal(discovery.catalog_root, release.catalog_root);
assert.equal(discovery.companies, companies); assert.equal(discovery.histories, histories);
assert.equal(discovery.publication_approved, false);
assert.equal(discovery.directory_pages, Math.ceil(companies / 50));
for (let page = 1; page <= discovery.directory_pages; page++) expectedUrls.add('https://canlicapital.com' + companyDirectoryPath(page));
const actualUrls = new Set(), shards = [], indexes = [];
for (const f of discovery.files) {
  const xml = load(discoveryDir, f).toString('utf8');
  const parsed = parseSitemap(xml);
  if (parsed.index) { indexes.push(parsed.locations); continue; }
  for (const url of parsed.locations) { assert(!actualUrls.has(url)); actualUrls.add(url); }
  shards.push({ name: f.name, urls: parsed.locations.length, bytes: Buffer.byteLength(xml) });
}
assert.equal(indexes.length, 1);
assert.deepEqual([...indexes[0]].sort(), shards.map(f => 'https://canlicapital.com/' + f.name).sort());
assert.deepEqual([...actualUrls].sort(), [...expectedUrls].sort());
const plan = read(planPath);
assert.equal(plan.publication_approved, false);
assert.equal(plan.release_hash, release.release_hash);
assert.equal(plan.catalog_root, release.catalog_root);
assert.equal(plan.download_root, release.download_root);
assert.equal(plan.delivery_manifest_sha256, catalogHash(readFileSync(manifestPath)));
assert.equal(plan.companies, companies); assert.equal(plan.histories, histories);
assert.equal(plan.objects, plan.files.length);
assert.equal(plan.bytes, plan.files.reduce((sum, f) => sum + f.bytes, 0));
const output = {
  schema: 'canli.v23-runtime-verification.v1', publication_approved: false,
  previous_manifest_sha256: PREVIOUS_MANIFEST_SHA256, carried_companies: carried, added_companies: added,
  companies, histories, directory_pages: discovery.directory_pages, candidate_urls: actualUrls.size, sitemap_shards: shards,
  release_hash: release.release_hash, catalog_root: release.catalog_root, download_root: release.download_root,
  delivery_manifest_sha256: catalogHash(readFileSync(manifestPath)), storage_plan_sha256: catalogHash(readFileSync(planPath)),
  objects: plan.objects, bytes: plan.bytes, code_sha256: catalogHash(readFileSync(new URL(import.meta.url))),
  scope: 'Every v22 company carried over with identical source and selection; every new company from a pinned new queue; every staged object hashed; sitemap leaves match every selected history, overview and directory exactly; release and storage plan agree. Staged inventory only, not editorial admission, hosting or indexing evidence.',
};
writeFileSync(process.argv[2], JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ companies, histories, carried, added, candidate_urls: actualUrls.size, objects: plan.objects, bytes: plan.bytes }));
