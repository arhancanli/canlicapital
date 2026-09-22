// Staged-inventory verification for the nine-cohort v24 release (policy extended-v23).
//
// v24 = the same 6,391 companies as v23, re-selected under extended-v23 from the
// same retained source bytes. The five original cohorts were re-derived in *-r2
// directories under the current selector, which absorbs the tenth-89 companies.
// Checks: identical company set and source bytes as v23; every v23 selected
// concept present unchanged in the v24 selection; only expanded concepts added;
// every staged object hashed; sitemap leaves exact; release and plan agree.
//
// Usage (from the website repository root):
//   node scripts/verify-v24-runtime.mjs OUTPUT.json
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { parseSitemap } from './lib/sitemaps.mjs';
import { companyDirectoryPath } from './lib/company-directory.mjs';
import { EXPANDED_CONCEPTS_V23 } from './lib/company-expanded-concepts-v23.mjs';

const base = 'artifacts/seo/corpus-local/';
const deliveryDir = base + 'company-nine-cohort-delivery-v24';
const discoveryDir = base + 'company-nine-cohort-discovery-v24';
const planPath = base + 'company-nine-cohort-storage-plan-v24.json';
const previousDir = base + 'company-ten-cohort-delivery-v23';
const PREVIOUS_MANIFEST_SHA256 = '8ba9484eaa2ea708c87dc894d8a8de26ce14c1329dd122d07e73423f2cc976ec';

const read = path => JSON.parse(readFileSync(path));
const manifestPath = deliveryDir + '/delivery.json';
const manifest = read(manifestPath);
assert.equal(catalogHash(readFileSync(previousDir + '/delivery.json')), PREVIOUS_MANIFEST_SHA256);
const previous = read(previousDir + '/delivery.json');
const old = new Map(previous.files.map(f => [f.cik, f]));
assert.equal(old.size, 6391);
assert.equal(manifest.selection_policy, 'extended-v23');
assert.equal(previous.selection_policy, 'extended-v22');
assert.equal(manifest.publication_approved, false);
assert.equal(manifest.source_deliveries.length, 9);
assert.equal(manifest.files.length, old.size, 'v24 must hold exactly the v23 company set');

function load(directory, descriptor) {
  const bytes = readFileSync(directory + '/' + descriptor.storage_path);
  assert.equal(bytes.length, descriptor.bytes);
  assert.equal(catalogHash(bytes), descriptor.sha256);
  return bytes;
}
const expectedUrls = new Set(), seen = new Set();
let histories = 0, carriedHistories = 0, addedHistories = 0;
const added = Object.fromEntries(Object.keys(EXPANDED_CONCEPTS_V23).map(tag => [tag, 0]));
for (const file of manifest.files) {
  assert(!seen.has(file.cik)); seen.add(file.cik);
  const before = old.get(file.cik);
  assert(before, `company ${file.cik} is not in v23`);
  assert.equal(file.source_sha256, before.source_sha256);
  assert.deepEqual(file.source, before.source);
  const source = load(deliveryDir, file.source);
  assert.equal(catalogHash(gunzipSync(source)), file.source_sha256);
  const selected = JSON.parse(load(deliveryDir, file.selected));
  const previousSelected = JSON.parse(load(previousDir, before.selected));
  assert.equal(selected.cik, file.cik);
  assert.equal(selected.selection_policy, 'extended-v23');
  assert.equal(selected.fetched_at, previousSelected.fetched_at);
  assert.equal(selected.source_snapshot, previousSelected.source_snapshot);
  const byTag = new Map(selected.concepts.map(concept => [concept.tag, concept]));
  for (const concept of previousSelected.concepts) {
    assert.ok(isDeepStrictEqual(byTag.get(concept.tag), concept), `${file.cik}/${concept.tag} changed`);
    carriedHistories++;
  }
  const previousTags = new Set(previousSelected.concepts.map(concept => concept.tag));
  for (const concept of selected.concepts) {
    if (previousTags.has(concept.tag)) continue;
    assert.ok(Object.hasOwn(EXPANDED_CONCEPTS_V23, concept.tag), `${file.cik}/${concept.tag} is not an expanded concept`);
    added[concept.tag]++; addedHistories++;
  }
  const strip = record => { const { concepts, selection_policy, source_snapshot, editorial_exclusions, ...rest } = record; return rest; };
  assert.ok(isDeepStrictEqual(strip(selected), strip(previousSelected)), `${file.cik} metadata changed`);
  assert.ok(isDeepStrictEqual(selected.editorial_exclusions ?? null, previousSelected.editorial_exclusions ?? null), `${file.cik} editorial exclusions changed`);
  expectedUrls.add(`https://canlicapital.com/companies/${file.cik}`);
  for (const c of selected.concepts) { expectedUrls.add(`https://canlicapital.com/companies/${file.cik}/${c.tag}`); histories++; }
}
assert.equal(carriedHistories, 157113, 'every v23 history must be carried over unchanged');
assert.equal(histories, carriedHistories + addedHistories);
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
  schema: 'canli.v24-runtime-verification.v1', publication_approved: false,
  previous_manifest_sha256: PREVIOUS_MANIFEST_SHA256, from_policy: 'extended-v22', to_policy: 'extended-v23',
  companies, histories, carried_histories: carriedHistories, added_histories: addedHistories, added_by_concept: added,
  directory_pages: discovery.directory_pages, candidate_urls: actualUrls.size, sitemap_shards: shards,
  release_hash: release.release_hash, catalog_root: release.catalog_root, download_root: release.download_root,
  delivery_manifest_sha256: catalogHash(readFileSync(manifestPath)), storage_plan_sha256: catalogHash(readFileSync(planPath)),
  objects: plan.objects, bytes: plan.bytes, code_sha256: catalogHash(readFileSync(new URL(import.meta.url))),
  scope: 'Same company set and source bytes as v23; every v23 history carried unchanged; only expanded-concept histories added; every staged object hashed; sitemap leaves exact; release and plan agree. Staged inventory only, not editorial admission, hosting or indexing evidence.',
};
writeFileSync(process.argv[2], JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ companies, histories, carriedHistories, addedHistories, candidate_urls: actualUrls.size, objects: plan.objects, bytes: plan.bytes }));
