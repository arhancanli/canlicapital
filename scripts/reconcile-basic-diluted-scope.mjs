import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { reconcileScope } from './lib/company-scope-ledger.mjs';
import { EDITORIAL_OBSERVATION_EXCLUSIONS_V18 } from './lib/company-editorial-v18.mjs';

const hash = raw => createHash('sha256').update(raw).digest('hex');
const inputHashes = {};
function read(path, compressed = false) {
  const bytes = readFileSync(path), raw = compressed ? gunzipSync(bytes) : bytes;
  inputHashes[path] = { stored_sha256: hash(bytes), json_sha256: hash(raw) };
  return JSON.parse(raw);
}
const base = 'artifacts/seo/';
const registry = read('config/company-basic-diluted-batch1-reviews.json');
assert.equal(registry.schema, 'canli.scope-review-registry.v1');
const primaryPath = base + 'company-basic-diluted-batch1-primary-review-20260920.json.gz';
const primary = read(primaryPath, true);
const targetPath = base + 'company-basic-diluted-capture-batch1-targets-20260920.json';
const targets = read(targetPath);
const numerical = read(base + 'company-basic-diluted-batch1-legacy-review-v2-20260920.json');
assert.equal(numerical.primary_review_sha256, inputHashes[primaryPath].json_sha256);
assert.equal(numerical.combined_observations, 1176); assert.equal(numerical.combined_matches, 1176);
const cache = new Map();
const reviews = registry.reviews.map(registration => {
  assert.match(registration.report, /^company-[a-z0-9-]+\.json$/);
  if (!cache.has(registration.report)) cache.set(registration.report, read(base + registration.report));
  assert.equal(inputHashes[base + registration.report].json_sha256, registration.sha256, 'Registered report changed');
  return { registration, report: cache.get(registration.report) };
});
const ledger = reconcileScope({ primary, targets, targetHash: inputHashes[targetPath].json_sha256,
  reviews, holds: EDITORIAL_OBSERVATION_EXCLUSIONS_V18 });
assert.equal(ledger.original_observations, 1176);
const result = { schema: 'canli.registered-basic-diluted-scope.v1', publication_approved: false,
  input_sha256: inputHashes, code_sha256: hash(readFileSync(new URL(import.meta.url))),
  reconciler_sha256: hash(readFileSync(new URL('./lib/company-scope-ledger.mjs', import.meta.url))),
  policy_sha256: hash(readFileSync(new URL('./lib/company-editorial-v18.mjs', import.meta.url))),
  ...ledger,
  scope: 'Only registered exact observations receive the stated review status. Presentation-only reviews do not establish dilution cause. Pending and held observations remain explicit. No whole-history, issuer, corpus, production or indexing approval.' };
writeFileSync(process.argv[2], gzipSync(Buffer.from(JSON.stringify(result, null, 2) + '\n')), { flag: 'wx' });
console.log(JSON.stringify({ ...ledger, rows: undefined }));
