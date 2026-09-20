// Expand the deferred equality groups into an exact, current-policy review queue.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { numericalHistoryKey } from './lib/company-history-context.mjs';
import { companyReference, verifyCompanyReference } from './lib/company-reference.mjs';

const hash = raw => createHash('sha256').update(raw).digest('hex');
const [queuePath, deliveryDir, output] = process.argv.slice(2);
assert(output, 'Usage: ORIGINAL_QUEUE V9_DELIVERY NEW_OUTPUT');
const queueRaw = readFileSync(queuePath), queue = JSON.parse(queueRaw);
const manifestRaw = readFileSync(resolve(deliveryDir, 'delivery.json'));
assert.equal(hash(manifestRaw), queue.inputs.delivery_manifest_sha256);
const manifest = JSON.parse(manifestRaw);
const files = new Map(manifest.files.map(f => [f.cik, f]));
assert.equal(files.size, manifest.files.length);
const cache = new Map(), cases = [], counts = {}, units = {};
function load(descriptor) {
  const raw = readFileSync(resolve(deliveryDir, descriptor.storage_path));
  assert.equal(raw.length, descriptor.bytes);
  assert.equal(hash(raw), descriptor.sha256);
  return raw;
}
for (const original of queue.cases.filter(c => c.category === 'basic_diluted_nonzero_equality')) {
  const file = files.get(original.cik);
  assert(file);
  assert.equal(file.selected.sha256, original.selected_sha256);
  assert.equal(file.source_sha256, original.source_sha256);
  if (!cache.has(original.cik)) {
    const before = JSON.parse(load(file.selected));
    const raw = gunzipSync(load(file.source), { maxOutputLength: 64 * 1024 * 1024 });
    assert.equal(hash(raw), file.source_sha256);
    verifyCompanyReference(before, raw);
    const current = companyReference(raw, { fetchedAt: before.fetched_at, expectedCik: before.cik, selectionPolicy: 'extended-v13' });
    verifyCompanyReference(current, raw);
    cache.set(original.cik, { before, current });
  }
  const { before, current } = cache.get(original.cik);
  const observations = original.tags.map(tag => {
    const oldConcept = before.concepts.find(c => c.tag === tag);
    const nextConcept = current.concepts.find(c => c.tag === tag);
    assert.deepEqual(nextConcept, oldConcept, 'Deferred concept changed under current policy');
    assert.equal(hash(numericalHistoryKey(nextConcept)), original.numerical_vector_sha256);
    for (const row of nextConcept.observations) units[row.unit] = (units[row.unit] ?? 0) + 1;
    return { tag, observations: nextConcept.observations };
  });
  const pair = [...original.tags].sort().join('|');
  counts[pair] = (counts[pair] ?? 0) + 1;
  cases.push({ ...original, observations });
}
assert.equal(cases.length, queue.counts.basic_diluted_nonzero_equality);
const report = { schema: 'canli.basic-diluted-review-queue.v1', publication_approved: false,
  original_queue_sha256: hash(queueRaw), delivery_manifest_sha256: hash(manifestRaw),
  code_sha256: hash(readFileSync(new URL(import.meta.url))), selection_policy: 'extended-v13',
  groups: cases.length, companies: cache.size, pairs: counts, observation_units: units, cases,
  scope: 'Exact deferred basic/diluted groups expanded from verified captures. Every selected concept is unchanged under v13. Numerical equality alone is not dilution context, distinct reader value or publication admission.' };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ groups: report.groups, companies: report.companies, pairs: counts, observation_units: units }));
