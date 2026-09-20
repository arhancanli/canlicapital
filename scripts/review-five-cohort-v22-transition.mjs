import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { companyReference, verifyCompanyReference } from './lib/company-reference.mjs';
import { EDITORIAL_OBSERVATION_EXCLUSIONS_V22 } from './lib/company-editorial-v22.mjs';

const hash = raw => createHash('sha256').update(raw).digest('hex');
const directory = 'artifacts/seo/corpus-local/company-five-cohort-delivery-v14';
const manifestRaw = readFileSync(`${directory}/delivery.json`);
assert.equal(hash(manifestRaw), '7f2540f7d8393615efff856479b41b5994aac1d258d0e4de1d116ca616c76472');
const manifest = JSON.parse(manifestRaw);
const decisions = EDITORIAL_OBSERVATION_EXCLUSIONS_V22.filter(d => ['0001280452', '0001659494', '0000059255', '0000065596', '0001425205', '0001484612', '0001607962', '0001417926'].includes(d.cik));
assert.equal(decisions.length, 40);
let companies = 0, histories = 0;
const changes = [], seen = new Set();
function read(descriptor) {
  const raw = readFileSync(`${directory}/${descriptor.storage_path}`);
  assert.equal(hash(raw), descriptor.sha256); assert.equal(raw.length, descriptor.bytes);
  return raw;
}
for (const file of manifest.files) {
  assert(!seen.has(file.cik)); seen.add(file.cik);
  const before = JSON.parse(read(file.selected));
  const source = gunzipSync(read(file.source));
  assert.equal(hash(source), file.source_sha256);
  verifyCompanyReference(before, source);
  const after = companyReference(source, { expectedCik: file.cik, fetchedAt: before.fetched_at, selectionPolicy: 'extended-v22' });
  // source_snapshot is added by delivery staging, not by the selector.
  if (before.source_snapshot !== undefined) after.source_snapshot = before.source_snapshot;
  const expected = structuredClone(before); expected.selection_policy = 'extended-v22';
  for (const decision of decisions.filter(d => d.cik === file.cik).sort((a, b) => before.concepts.findIndex(c => c.tag === a.tag) - before.concepts.findIndex(c => c.tag === b.tag))) {
    assert.equal(file.source_sha256, decision.source_sha256);
    const concept = expected.concepts.find(c => c.tag === decision.tag);
    assert(concept);
    const matches = row => Object.entries(decision.observation).every(([k, v]) => row[k] === v);
    assert.equal(concept.observations.filter(matches).length, 1);
    concept.observations = concept.observations.filter(row => !matches(row));
    expected.editorial_exclusions = [...(expected.editorial_exclusions ?? []), {
      tag: decision.tag, observation: { ...decision.observation }, reason: decision.reason, filing_url: decision.filing_url,
    }];
    changes.push({ cik: file.cik, tag: decision.tag, observation: decision.observation, removed_observations: 1 });
  }
  if (file.cik === '0000059255') {
    for (const tag of ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding']) {
      const concept = expected.concepts.find(c => c.tag === tag);
      assert.equal(concept.observations.length, 3);
      assert.deepEqual(concept.observations.map(row => row.end), ['2021-12-31', '2020-12-31', '2019-12-31']);
      assert(concept.observations.every(row => row.unit === 'shares' && row.val === 28500000));
      expected.concepts = expected.concepts.filter(c => c.tag !== tag);
    }
  }
  if (file.cik === '0001425205') {
    for (const tag of ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding']) {
      assert.equal(expected.concepts.find(c => c.tag === tag).observations.length, 0);
      expected.concepts = expected.concepts.filter(c => c.tag !== tag);
    }
  }
  try { assert.deepEqual(after, expected); } catch (error) {
    throw new Error(`Unexpected change for ${file.cik}: ${error.message.slice(0, 1800)}`);
  }
  verifyCompanyReference(after, source);
  companies++; histories += after.concepts.length;
}
assert.equal(companies, 3323); assert.equal(histories, 87342); assert.equal(changes.length, 40);
const result = {
  schema: 'canli.five-cohort-v22-transition.v1', publication_approved: false,
  previous_manifest_sha256: hash(manifestRaw), code_sha256: hash(readFileSync(new URL(import.meta.url))),
  selector_sha256: hash(readFileSync(new URL('./lib/company-reference.mjs', import.meta.url))),
  policy_sha256: hash(readFileSync(new URL('./lib/company-editorial-v22.mjs', import.meta.url))),
  companies, histories, explicit_observation_holds: 40, residual_constant_observations_omitted: 6, removed_histories: 4, changes,
  scope: 'Every v14 company source and selected record verified, then reselected under v22. Exact differences are policy metadata, forty held observations and their notices, and two Valhi share histories omitted because their remaining three observations are constant, and two Iovance histories omitted because every observation is withheld. Original source bytes remain unchanged. No new delivery/catalog/discovery build, hosted transfer, production or indexing claim.',
};
writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ companies, histories, explicit_observation_holds: 40, removed_histories: 4 }));
