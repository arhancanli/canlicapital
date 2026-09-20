import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { parseSitemap } from './lib/sitemaps.mjs';
import { companyDirectoryPath } from './lib/company-directory.mjs';

const base = 'artifacts/seo/corpus-local/';
const deliveryDir = base + 'company-five-cohort-delivery-v22';
const discoveryDir = base + 'company-five-cohort-discovery-v22';
const read = path => JSON.parse(readFileSync(path));
const manifestPath = deliveryDir + '/delivery.json';
const manifest = read(manifestPath);
const oldPath = base + 'company-five-cohort-delivery-v14/delivery.json';
assert.equal(catalogHash(readFileSync(oldPath)), '7f2540f7d8393615efff856479b41b5994aac1d258d0e4de1d116ca616c76472');
const previous = read(oldPath);
const old = new Map(previous.files.map(f => [f.cik, f]));
assert.equal(old.size, 3323);
assert.equal(manifest.selection_policy, 'extended-v22');
assert.equal(manifest.publication_approved, false);
assert.equal(manifest.source_deliveries.length, 5);
assert.equal(manifest.files.length, 3323);
const expectedUrls = new Set(), seen = new Set();
let histories = 0;
function load(directory, descriptor) {
  const bytes = readFileSync(directory + '/' + descriptor.storage_path);
  assert.equal(bytes.length, descriptor.bytes);
  assert.equal(catalogHash(bytes), descriptor.sha256);
  return bytes;
}
for (const file of manifest.files) {
  assert(!seen.has(file.cik)); seen.add(file.cik);
  const before = old.get(file.cik); assert(before);
  assert.equal(file.source_sha256, before.source_sha256);
  assert.deepEqual(file.source, before.source);
  const source = load(deliveryDir, file.source);
  assert.equal(catalogHash(gunzipSync(source)), file.source_sha256);
  const selected = JSON.parse(load(deliveryDir, file.selected));
  const previousSelected = JSON.parse(load(base + 'company-five-cohort-delivery-v14', before.selected));
  assert.equal(selected.fetched_at, previousSelected.fetched_at);
  assert.equal(selected.cik, file.cik);
  assert.equal(selected.selection_policy, 'extended-v22');
  expectedUrls.add(`https://canlicapital.com/companies/${file.cik}`);
  for (const c of selected.concepts) {
    expectedUrls.add(`https://canlicapital.com/companies/${file.cik}/${c.tag}`); histories++;
  }
}
assert.equal(histories, 87342);
const release = read(deliveryDir + '/company-release.json');
assert.equal(release.companies, 3323); assert.equal(release.histories, histories);
assert.equal(release.publication_approved, false);
const discovery = read(discoveryDir + '/discovery.json');
assert.equal(discovery.release_hash, release.release_hash);
assert.equal(discovery.catalog_root, release.catalog_root);
assert.equal(discovery.companies, 3323); assert.equal(discovery.histories, histories);
assert.equal(discovery.directory_pages, 67); assert.equal(discovery.publication_approved, false);
for (let page = 1; page <= 67; page++) expectedUrls.add('https://canlicapital.com' + companyDirectoryPath(page));
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
assert.equal(actualUrls.size, 90732);
const planPath = base + 'company-five-cohort-storage-plan-v22.json';
const plan = read(planPath);
assert.equal(plan.publication_approved, false);
assert.equal(plan.release_hash, release.release_hash);
assert.equal(plan.catalog_root, release.catalog_root);
assert.equal(plan.download_root, release.download_root);
assert.equal(plan.delivery_manifest_sha256, catalogHash(readFileSync(manifestPath)));
assert.equal(plan.companies, 3323); assert.equal(plan.histories, histories);
assert.equal(plan.objects, plan.files.length);
assert.equal(plan.bytes, plan.files.reduce((sum, f) => sum + f.bytes, 0));
const output = {
  schema: 'canli.v22-runtime-verification.v1', publication_approved: false,
  companies: 3323, histories, directory_pages: 67, candidate_urls: actualUrls.size, sitemap_shards: shards,
  release_hash: release.release_hash, catalog_root: release.catalog_root, download_root: release.download_root,
  delivery_manifest_sha256: catalogHash(readFileSync(manifestPath)), storage_plan_sha256: catalogHash(readFileSync(planPath)),
  objects: plan.objects, bytes: plan.bytes, code_sha256: catalogHash(readFileSync(new URL(import.meta.url))),
  scope: 'Exact frozen-source cohort and capture dates preserved. Every staged source/selected object hashed; sitemap leaf URLs match every selected history, overview and directory exactly. Release and storage plan roots/counts agree. This is staged inventory, not full editorial admission, HTTP serving, hosting or indexing evidence.',
};
writeFileSync(process.argv[2], JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(output));
