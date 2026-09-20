import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { numericalHistoryKey } from './lib/company-history-context.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const [summaryPath, deliveryDir, output] = process.argv.slice(2);
assert(output, 'Usage: SUMMARY DELIVERY NEW_REPORT');
const summaryBytes = readFileSync(summaryPath), summary = JSON.parse(summaryBytes);
const qualityBytes = readFileSync(summary.full_report.path);
assert.equal(hash(qualityBytes), summary.full_report.sha256);
const quality = JSON.parse(qualityBytes);
const manifestBytes = readFileSync(resolve(deliveryDir, 'delivery.json'));
assert.equal(hash(manifestBytes), quality.delivery_manifest_sha256);
const manifest = JSON.parse(manifestBytes);
const files = new Map(manifest.files.map(file => [file.cik, file]));
assert.equal(files.size, manifest.files.length);
const commonPairs = new Set([
  ['EarningsPerShareBasic', 'EarningsPerShareDiluted'].sort().join('|'),
  ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingBasic'].sort().join('|'),
]);
const counts = {}, cases = [];
for (const group of quality.equal_vector_groups) {
  const file = files.get(group.cik);
  assert(file);
  const raw = readFileSync(resolve(deliveryDir, file.selected.storage_path));
  assert.equal(hash(raw), file.selected.sha256);
  assert.equal(raw.length, file.selected.bytes);
  const company = JSON.parse(raw);
  assert.equal(company.cik, group.cik);
  const concepts = group.tags.map(tag => {
    const concept = company.concepts.find(c => c.tag === tag);
    assert(concept);
    assert.equal(hash(numericalHistoryKey(concept)), group.numerical_vector_sha256);
    return concept;
  });
  const zeroOnly = concepts.every(c => c.observations.every(row => row.val === 0));
  const commonPair = commonPairs.has([...group.tags].sort().join('|'));
  const category = zeroOnly ? 'zero_only_equality' : commonPair ? 'basic_diluted_nonzero_equality' : 'other_nonzero_equality';
  counts[category] = (counts[category] ?? 0) + 1;
  // Retain every group. Categories set review order, never admission or equivalence.
  cases.push({ cik: company.cik, name: company.name, tags: group.tags, category,
    numerical_vector_sha256: group.numerical_vector_sha256, selected_sha256: file.selected.sha256,
    source_sha256: company.source_sha256,
    question: commonPair ? 'Verify dilution/antidilution scope and distinct reader value.' :
      zeroOnly ? 'Verify explicit reported zeros and entity/period scope; do not infer inactivity.' :
        'Verify distinct accounting line items, entity scope and useful differences despite equal selected values.',
    observations: commonPair ? undefined : concepts.map(c => ({ tag: c.tag, observations: c.observations })),
    review_state: 'PENDING_PRIMARY_SCOPE_AND_USEFULNESS_REVIEW' });
}
assert.equal(cases.length, quality.totals.equal_vector_groups);
const report = { schema: 'canli.equal-history-review-queue.v1', publication_approved: false,
  inputs: { summary_sha256: hash(summaryBytes), quality_sha256: hash(qualityBytes),
    delivery_manifest_sha256: hash(manifestBytes) }, counts, cases,
  code_sha256: hash(readFileSync(new URL(import.meta.url))),
  scope: 'All equal-vector groups reproduced from selected records. Review categories are not source-scope findings, exclusions, semantic equivalence or publication approval. Other quality flags remain open.' };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ groups: cases.length, counts }));
