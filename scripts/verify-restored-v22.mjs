// Run from the isolated archive workspace using its saved selector and inputs.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { verifyCompanyReference } from './lib/company-reference.mjs';
import { buildCompanyDiscovery } from './build-company-discovery.mjs';

const base = 'artifacts/seo/corpus-local/';
const delivery = base + 'company-five-cohort-delivery-v22';
const catalog = base + 'company-five-cohort-catalog-v22';
const discovery = base + 'company-five-cohort-discovery-v22';
const manifest = JSON.parse(readFileSync(delivery + '/delivery.json'));
assert.equal(manifest.selection_policy, 'extended-v22');
const seen = new Set();
let histories = 0;
function readObject(descriptor) {
  const bytes = readFileSync(join(delivery, descriptor.storage_path));
  assert.equal(bytes.length, descriptor.bytes);
  assert.equal(catalogHash(bytes), descriptor.sha256);
  return bytes;
}
for (const entry of manifest.files) {
  assert(!seen.has(entry.cik)); seen.add(entry.cik);
  const record = JSON.parse(readObject(entry.selected));
  assert.equal(record.cik, entry.cik);
  assert.equal(record.selection_policy, 'extended-v22');
  assert.equal(record.source_snapshot, entry.source.path);
  assert.equal(record.source_sha256, entry.source_sha256);
  const original = gunzipSync(readObject(entry.source));
  assert.equal(catalogHash(original), entry.source_sha256);
  verifyCompanyReference(record, original);
  histories += record.concepts.length;
  if (seen.size % 500 === 0) console.log(JSON.stringify({ restoredCompanies: seen.size, histories }));
}
assert.equal(seen.size, 3323);
assert.equal(histories, 87342);
const temporary = mkdtempSync(join(tmpdir(), 'canli-v22-discovery-replay-'));
try {
  await buildCompanyDiscovery(catalog, delivery, temporary);
  const expected = readFileSync(discovery + '/discovery.json');
  assert.deepEqual(readFileSync(join(temporary, 'discovery.json')), expected);
  const descriptors = JSON.parse(expected).files;
  for (const descriptor of descriptors) {
    const bytes = readFileSync(join(temporary, descriptor.storage_path));
    assert.equal(bytes.length, descriptor.bytes);
    assert.equal(catalogHash(bytes), descriptor.sha256);
    assert.deepEqual(bytes, readFileSync(join(discovery, descriptor.storage_path)));
  }
  writeFileSync(process.argv[2], JSON.stringify({
    companiesReproduced: seen.size, historiesReproduced: histories,
    discoveryFilesByteIdentical: descriptors.length,
    selectedRecordsReproducedFromOriginalSnapshots: true,
  }, null, 2) + '\n', { flag: 'wx' });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
