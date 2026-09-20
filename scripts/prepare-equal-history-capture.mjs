import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const [input, output] = process.argv.slice(2);
assert(output, 'Usage: RETAINED_TARGETS NEW_CAPTURE_TARGETS');
const raw = readFileSync(input), source = JSON.parse(raw);
assert.equal(source.schema, 'canli.equal-history-retained-targets.v1');
const targets = source.missing_filings.flatMap(filing => {
  assert.match(filing.cik, /^\d{10}$/);
  assert.match(filing.accession, /^\d{10}-\d{2}-\d{6}$/);
  return [...new Set(filing.observations.map(row => row.tag))].sort().map(tag => {
    const observations = filing.observations.filter(row => row.tag === tag);
    assert(observations.every(row => row.accn === filing.accession));
    return { cik: filing.cik, name: filing.name, tag,
      latest_selected_accession: filing.accession, latest_accession_observations: observations };
  });
});
// Prioritize the unusual payable/property pair; retain the entire missing queue.
targets.sort((a, b) => Number(b.cik === '0001816554') - Number(a.cik === '0001816554') ||
  a.cik.localeCompare(b.cik) || a.latest_selected_accession.localeCompare(b.latest_selected_accession) || a.tag.localeCompare(b.tag));
assert.equal(targets.reduce((n, t) => n + t.latest_accession_observations.length, 0), source.missing_observation_count);
const report = { schema: 'canli.equal-history-capture-targets.v1', publication_approved: false,
  retained_targets_sha256: createHash('sha256').update(raw).digest('hex'), targets,
  scope: 'Missing selected historical accessions only. Legacy capture field latest_selected_accession identifies the exact target filing, not the company’s latest filing. Existing capture pacing and access-stop rules apply. No admission.' };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ targets: targets.length, filings: source.missing_filings.length, observations: source.missing_observation_count }));
