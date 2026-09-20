// Preserve the v10 review ledger while accounting for the exact v11 holdback.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {EDITORIAL_OBSERVATION_EXCLUSIONS_V11 as decisions} from './lib/company-editorial-v11.mjs';
const sha = raw => createHash('sha256').update(raw).digest('hex');
const base = 'artifacts/seo/';
const inputs = {};
function read(path) {
  const raw = readFileSync(path);
  inputs[path] = sha(raw);
  return JSON.parse(raw);
}
const prior = read(base + 'company-priority-scope-coverage-v3-20260920.json');
for (const [name, expected] of Object.entries(prior.input_sha256)) {
  assert.equal(sha(readFileSync(base + name)), expected);
}
const audit = read(base + 'company-five-cohort-v11-discovery-audit-20260920.json');
const directory = base + 'corpus-local/company-five-cohort-delivery-v11/';
const manifest = read(directory + 'delivery.json');
assert.equal(inputs[directory + 'delivery.json'], audit.delivery_manifest_sha256);
assert.equal(manifest.selection_policy, 'extended-v11');
assert.equal(decisions.length, 1);
const withdrawn = [];
const removed = new Set();
for (const decision of decisions) {
  const matches = item => item.cik === decision.cik && item.selected.tag === decision.tag &&
    Object.entries(decision.observation).every(([k,v]) => item.selected[k] === v);
  const candidates = prior.pending.filter(matches);
  assert.equal(candidates.length, 1);
  assert.equal(prior.reviewed.filter(matches).length, 0);
  const descriptor = manifest.files.find(f => f.cik === decision.cik);
  const raw = readFileSync(directory + descriptor.selected.storage_path);
  assert.equal(sha(raw), descriptor.selected.sha256);
  assert.equal(raw.length, descriptor.selected.bytes);
  const record = JSON.parse(raw);
  assert.equal(record.source_sha256, decision.source_sha256);
  assert.equal(record.concepts.find(c => c.tag === decision.tag).observations.filter(row =>
    Object.entries(decision.observation).every(([k,v]) => row[k] === v)).length, 0);
  assert(record.editorial_exclusions.some(e => e.tag === decision.tag &&
    JSON.stringify(e.observation) === JSON.stringify(decision.observation) && e.reason === decision.reason));
  removed.add(candidates[0]);
  withdrawn.push({...candidates[0], reason: decision.reason, filing_url: decision.filing_url,
    source_sha256: decision.source_sha256, credited_as_reviewed: false});
}
const pending = prior.pending.filter(item => !removed.has(item));
const activeReviewed = prior.reviewed.filter(item => !item.withdrawn_in_v10);
assert.equal(activeReviewed.length, 166);
assert.equal(pending.length, 440);
assert.equal(activeReviewed.length + pending.length + prior.withdrawn_v10_observations + withdrawn.length, 610);
const result = {schema:'canli.priority-scope-v11.v1', publication_approved:false,
  input_sha256:inputs, code_sha256:sha(readFileSync(new URL(import.meta.url))),
  original_priority_observations:610, observations_with_retained_scope_review:prior.observations_with_retained_scope_review,
  withdrawn_v10_observations:prior.withdrawn_v10_observations, additionally_withdrawn_v11_observations:withdrawn.length,
  active_reviewed_observations:activeReviewed.length, active_observations_needing_scope_review:pending.length,
  withdrawn_without_review_credit:withdrawn, pending,
  scope:'Versioned accounting only. The disputed period is withheld, not resolved or credited as reviewed. Prior review evidence and withdrawals remain in the bound v3 ledger. Excludes basic/diluted groups and other corpus flags; no admission or publication claim.'};
writeFileSync(process.argv[2] ?? base+'company-priority-scope-v11-20260920.json', JSON.stringify(result,null,2)+'\n', {flag:'wx'});
console.log(JSON.stringify({active_reviewed:activeReviewed.length,pending:pending.length,withdrawn:4}));
