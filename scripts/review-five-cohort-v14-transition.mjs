import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {EDITORIAL_EXCLUSIONS_V12} from './lib/company-editorial-v12.mjs';
import {EDITORIAL_OBSERVATION_EXCLUSIONS_V14} from './lib/company-editorial-v14.mjs';
const hash = raw => createHash('sha256').update(raw).digest('hex');
const root = 'artifacts/seo/corpus-local/';
const oldDirectory = root + 'company-five-cohort-delivery-v11';
const beforeRaw = readFileSync(oldDirectory + '/delivery.json');
assert.equal(hash(beforeRaw), '8900d4d3bcb0dec7b1356cddb3481bd69736a2832e95b6255ef4085152de4576');
const originals = new Map(JSON.parse(beforeRaw).files.map(f => [f.cik, f]));
const whole = EDITORIAL_EXCLUSIONS_V12.filter(d => d.cik === '0001342916');
const periods = EDITORIAL_OBSERVATION_EXCLUSIONS_V14.filter(d => ['0001062506', '0001361113'].includes(d.cik));
assert.equal(whole.length, 1); assert.equal(periods.length, 8);
const cohorts = ['first', 'next-1000', 'third-1000', 'fourth-1000', 'fifth-1000'];
const seen = new Set(), inputs = [], changes = [];
let previousHistories = 0, currentHistories = 0, removedObservations = 0;
function record(directory, file) {
  const raw = readFileSync(directory + '/' + file.selected.storage_path);
  assert.equal(hash(raw), file.selected.sha256); assert.equal(raw.length, file.selected.bytes);
  return JSON.parse(raw);
}
for (const cohort of cohorts) {
  const directory = root + cohort + '-delivery-v14';
  const raw = readFileSync(directory + '/delivery.json'), manifest = JSON.parse(raw);
  assert.equal(manifest.selection_policy, 'extended-v14');
  inputs.push({directory, manifest_sha256: hash(raw)});
  for (const file of manifest.files) {
    assert(!seen.has(file.cik)); seen.add(file.cik);
    const oldFile = originals.get(file.cik); assert(oldFile);
    assert.deepEqual(file.source, oldFile.source); assert.equal(file.source_sha256, oldFile.source_sha256);
    const before = record(oldDirectory, oldFile), after = record(directory, file);
    const expected = structuredClone(before); expected.selection_policy = 'extended-v14';
    previousHistories += before.concepts.length; currentHistories += after.concepts.length;
    for (const d of whole.filter(d => d.cik === file.cik)) {
      assert.equal(file.source_sha256, d.source_sha256);
      const concept = expected.concepts.find(c => c.tag === d.tag); assert(concept);
      assert.equal(concept.observations.length, 4);
      expected.concepts = expected.concepts.filter(c => c.tag !== d.tag);
      expected.editorial_exclusions = [...(expected.editorial_exclusions ?? []), {tag:d.tag, reason:d.reason, filing_url:d.filing_url}];
      changes.push({cik:file.cik, tag:d.tag, removed_histories:1, removed_observations:concept.observations.length});
      removedObservations += concept.observations.length;
    }
    for (const d of periods.filter(d => d.cik === file.cik)) {
      assert.equal(file.source_sha256, d.source_sha256);
      const concept = expected.concepts.find(c => c.tag === d.tag); assert(concept);
      const matches = row => Object.entries(d.observation).every(([k,v]) => row[k] === v);
      assert.equal(concept.observations.filter(matches).length, 1);
      concept.observations = concept.observations.filter(row => !matches(row));
      expected.editorial_exclusions = [...(expected.editorial_exclusions ?? []), {tag:d.tag, observation:{...d.observation}, reason:d.reason, filing_url:d.filing_url}];
      changes.push({cik:file.cik, tag:d.tag, removed_histories:0, removed_observations:1, observation:d.observation});
      removedObservations++;
    }
    assert.deepEqual(after, expected, 'Unexpected selected-record change for ' + file.cik);
  }
}
assert.equal(seen.size, originals.size); assert.equal(seen.size, 3323);
assert.equal(changes.length, 9); assert.equal(removedObservations, 12);
assert.equal(previousHistories, 87347); assert.equal(currentHistories, 87346);
const result = {schema:'canli.five-cohort-v14-transition.v1', publication_approved:false,
  previous_manifest_sha256:hash(beforeRaw), code_sha256:hash(readFileSync(new URL(import.meta.url))), inputs,
  companies:seen.size, previous_histories:previousHistories, current_histories:currentHistories,
  removed_observations:removedObservations, changes,
  scope:'Exact comparison of every selected record and source descriptor against v11. Only policy metadata, HNO whole-history hold, Atlantica/Varonis exact observation holds and their notices differ. No combined release, production or indexing claim.'};
writeFileSync(process.argv[2] ?? 'artifacts/seo/company-five-cohort-v14-transition-20260920.json', JSON.stringify(result,null,2)+'\n', {flag:'wx'});
console.log(JSON.stringify({companies:seen.size, histories:currentHistories, removed_observations:removedObservations}));
