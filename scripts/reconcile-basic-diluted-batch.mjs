import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { reconcileScope } from './lib/company-scope-ledger.mjs';
import { verifyBatchNumerics } from './lib/company-batch-numerics.mjs';
import { EDITORIAL_OBSERVATION_EXCLUSIONS_V22 } from './lib/company-editorial-v22.mjs';

const hash = raw => createHash('sha256').update(raw).digest('hex');
const [registryPath, output] = process.argv.slice(2);
assert(registryPath && output, 'Usage: REGISTRY NEW_OUTPUT.json.gz');
const registryRaw = readFileSync(registryPath), registry = JSON.parse(registryRaw);
assert.equal(registry.schema, 'canli.batch-scope-review-registry.v1');
const inputs = {};
function read(descriptor) {
  assert.match(descriptor.path, /^artifacts\/seo\/company-[a-z0-9-]+\.json(?:\.gz)?$/);
  const stored = readFileSync(descriptor.path);
  assert.equal(hash(stored), descriptor.sha256, 'Pinned input changed');
  const raw = descriptor.path.endsWith('.gz') ? gunzipSync(stored) : stored;
  inputs[descriptor.path] = { stored_sha256: hash(stored), json_sha256: hash(raw) };
  return JSON.parse(raw);
}
const data = Object.fromEntries(Object.entries(registry.inputs).map(([name, descriptor]) => [name, read(descriptor)]));
const jsonHash = name => inputs[registry.inputs[name].path].json_sha256;
assert.equal(data.capture.input_sha256, jsonHash('targets'));
assert(data.capture.complete && !data.capture.error && !data.capture.stopped_on_access_response);
assert.equal(data.capturedTargets.targets_sha256, jsonHash('targets'));
assert.equal(data.capturedTargets.capture_sha256, jsonHash('capture'));
assert.equal(data.primary.targets_sha256, jsonHash('capturedTargets'));
assert.equal(data.legacyInput.primary_review_sha256, jsonHash('primary'));
assert.equal(data.legacyInput.capture_report_sha256, jsonHash('capture'));
assert.equal(data.legacyCapture.comparison_sha256, jsonHash('legacyInput'));
assert.equal(data.legacyCapture.capture_sha256, jsonHash('capture'));
assert(data.legacyCapture.complete && !data.legacyCapture.error && !data.legacyCapture.access_stop);
assert.equal(data.legacy.primary_review_sha256, jsonHash('primary'));
assert.equal(data.legacy.acquisition_input_sha256, jsonHash('legacyInput'));
assert.equal(data.legacy.capture_sha256, jsonHash('legacyCapture'));
const numerical = verifyBatchNumerics(data);
assert.equal(numerical.observations, registry.expected_observations);
assert.equal(numerical.filings, registry.expected_filings);
const reviews = registry.reviews.map(registration => {
  assert.match(registration.report, /^company-[a-z0-9-]+\.json$/);
  const report = read({ path: 'artifacts/seo/' + registration.report, sha256: registration.sha256 });
  const decision = registration.decision_index === null ? report : report.decisions?.[registration.decision_index];
  assert(decision && typeof decision.disposition === 'string');
  assert(!/PENDING|REQUIRES?_HOLD/.test(decision.disposition), 'Unresolved report cannot approve observations');
  return { registration, report };
});
const ledger = reconcileScope({ primary: data.primary, targets: data.targets,
  targetHash: jsonHash('targets'), reviews, holds: EDITORIAL_OBSERVATION_EXCLUSIONS_V22 });
const result = { schema: 'canli.registered-batch-scope.v1', publication_approved: false,
  registry_sha256: hash(registryRaw), input_sha256: inputs, numerical,
  code_sha256: Object.fromEntries([
    'scripts/reconcile-basic-diluted-batch.mjs', 'scripts/lib/company-batch-numerics.mjs',
    'scripts/lib/company-scope-ledger.mjs', 'scripts/lib/company-editorial-v22.mjs',
  ].map(path => [path, hash(readFileSync(path))])), ...ledger,
  scope: 'Exact target and numerical partitions verified; only registered source-context decisions advance review states. Pending reports cannot approve observations. No whole-history, issuer, corpus, production or indexing approval.' };
writeFileSync(output, gzipSync(Buffer.from(JSON.stringify(result, null, 2) + '\n')), { flag: 'wx' });
console.log(JSON.stringify({ ...ledger, rows: undefined }));
