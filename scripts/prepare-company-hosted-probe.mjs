import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createCompanyCatalog, catalogHash } from '../api/_lib/company-catalog.js';
import { createCompanyDownloadIndex } from '../api/_lib/company-download-index.js';
import { validateStoragePlan } from './upload-company-storage.mjs';

// A small dependency closure for the existing first/middle/last hosted audit.
// Upload completion for this plan never means the whole release is available.
const [planPath, planHash, manifestPath, manifestHash, output] = process.argv.slice(2);
assert.ok(output, 'Usage: prepare-company-hosted-probe.mjs PLAN SHA MANIFEST SHA NEW_PLAN');
const plan = validateStoragePlan(readFileSync(planPath), planHash);
const raw = readFileSync(manifestPath);
assert.equal(catalogHash(raw), manifestHash);
assert.equal(plan.delivery_manifest_sha256, manifestHash);
const manifest = JSON.parse(raw);
assert.equal(manifest.files.length, plan.companies);
const all = new Map(plan.files.map(f => [f.key, f])), selected = new Map();
function collect(key) {
  const file = all.get(key);
  assert.ok(file, 'Probe object absent from full validated plan');
  const bytes = readFileSync(file.local_path);
  assert.equal(bytes.length, file.bytes); assert.equal(catalogHash(bytes), file.sha256);
  selected.set(key, file); return bytes;
}
const release = JSON.parse(collect(`delivery/objects/${plan.release_hash}.json`));
assert.equal(release.catalog_root, plan.catalog_root);
assert.equal(release.download_root, plan.download_root);
const catalog = createCompanyCatalog({ rootHash: release.catalog_root,
  readObject: hash => collect(`catalog/objects/${hash}.json`) });
const downloads = createCompanyDownloadIndex({ rootHash: release.download_root,
  readObject: hash => collect(`delivery/objects/${hash}.json`) });
assert.equal((await catalog.directoryPage(1)).total, plan.companies);
assert.equal(await catalog.getCompany('9999999999'), null);
assert.equal(await downloads.find('/company-data/9999999999.json'), null);
const ids = [];
for (const i of [...new Set([0, Math.floor(manifest.files.length / 2), manifest.files.length - 1])]) {
  const item = manifest.files[i], record = await catalog.getCompany(item.cik);
  assert.equal(record.cik, item.cik); ids.push(item.cik);
  for (const descriptor of [item.selected, item.source]) {
    assert.deepEqual(await downloads.find(descriptor.path), descriptor);
    collect('delivery/' + descriptor.storage_path);
  }
}
const files = [...selected.values()];
const probe = { schema: plan.schema, publication_approved: false,
  release_hash: plan.release_hash, full_plan_sha256: planHash,
  sampled_company_ids: ids, files, objects: files.length,
  bytes: files.reduce((n, f) => n + f.bytes, 0),
  scope: 'Partial runtime dependency closure for first/middle/last hosted checks and first directory only. NOT a complete release transfer, editorial approval or production activation.',
  code_sha256: catalogHash(readFileSync(new URL(import.meta.url))) };
const bytes = Buffer.from(JSON.stringify(probe, null, 2) + '\n');
validateStoragePlan(bytes, catalogHash(bytes));
writeFileSync(output, bytes, { flag: 'wx' });
console.log(JSON.stringify({ objects: probe.objects, bytes: probe.bytes, sha256: catalogHash(bytes), sampled_company_ids: ids }));
