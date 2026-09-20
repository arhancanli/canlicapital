import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { reconcileScope } from './lib/company-scope-ledger.mjs';

function sample() {
  const cik = '0000000001', source = 'a'.repeat(64), targetHash = 'b'.repeat(64);
  const observation = { tag: 'EarningsPerShareBasic', start: '2024-01-01', end: '2024-12-31', unit: 'USD/shares', val: 1, accn: 'filing', filed: '2025-02-01' };
  return { primary: { filings: [{ cik, checks: [{ selected: observation }] }] },
    targets: { targets: [{ cik, source_sha256: source }] }, targetHash, holds: [],
    reviews: [{ registration: { cik, report: 'review.json', decision_index: null, observations: 1,
      disposition: 'REVIEWED', state: 'REPORTED_PRESENTATION_REVIEWED_CAUSE_NOT_ESTABLISHED' },
    report: { target_sha256: targetHash, source_sha256: source, disposition: 'REVIEWED', selected_observations: [structuredClone(observation)] } }] };
}

test('explicit limited review stays limited and missing registration stays pending', () => {
  const input = sample(), result = reconcileScope(input);
  assert.equal(result.active_reviewed_observations, 1);
  assert.equal(result.presentation_only_reviewed_observations, 1);
  assert.equal(result.rows[0].evidence, 'review.json');
  input.reviews = [];
  assert.equal(reconcileScope(input).active_observations_needing_scope_review, 1);
});

test('rejects duplicate, stale, missing and misattributed review evidence', () => {
  for (const mutate of [
    x => x.reviews.push(structuredClone(x.reviews[0])),
    x => { x.reviews[0].report.source_sha256 = 'c'.repeat(64); },
    x => { x.reviews[0].report.target_sha256 = 'c'.repeat(64); },
    x => { x.reviews[0].report.disposition = 'PENDING'; },
    x => { x.reviews[0].registration.state = 'APPROVE_EVERYTHING'; },
    x => { x.reviews[0].registration.decision_index = 5; },
    x => { x.reviews[0].report.cik = '0000000002'; },
    x => { x.reviews[0].report.selected_observations[0].filed = '2025-03-01'; },
    x => { x.reviews[0].report.selected_observations[0].val = 2; },
    x => { x.primary.filings[0].checks.push(structuredClone(x.primary.filings[0].checks[0])); },
  ]) {
    const input = sample(); mutate(input); assert.throws(() => reconcileScope(input));
  }
});

test('holds cannot be overridden by a registered review and require the same source', () => {
  const input = sample();
  input.holds.push({ cik: '0000000001', tag: 'EarningsPerShareBasic', source_sha256: 'a'.repeat(64),
    observation: { val: 1, end: '2024-12-31' }, filing_url: 'https://example.com/filing' });
  assert.throws(() => reconcileScope(input), /Held observation/);
  input.reviews = [];
  assert.equal(reconcileScope(input).withdrawn_observations, 1);
  input.holds[0].source_sha256 = 'd'.repeat(64);
  assert.throws(() => reconcileScope(input), /Hold source changed/);
});

test('registered corpus changes only the six Outset hold rows and produces deterministic gzip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'canli-scope-'));
  try {
    const first = join(dir, 'first.json.gz'), second = join(dir, 'second.json.gz');
    for (const output of [first, second]) execFileSync(process.execPath, ['scripts/reconcile-basic-diluted-scope.mjs', output]);
    assert.deepEqual(readFileSync(first), readFileSync(second));
    const current = JSON.parse(gunzipSync(readFileSync(first)));
    const frozen = JSON.parse(gunzipSync(readFileSync('artifacts/seo/company-basic-diluted-registered-scope-batch19-20260921.json.gz')));
    assert.equal(current.rows.length, frozen.rows.length);
    let changed = 0;
    for (let i = 0; i < frozen.rows.length; i++) {
      const before = frozen.rows[i], after = current.rows[i];
      if (before.cik === '0001484612' && before.observation.tag.startsWith('WeightedAverage')) {
        assert.equal(before.state, 'ACCOUNTING_SCOPE_REVIEW_PENDING');
        assert.equal(after.state, 'WITHDRAWN_BY_V19_OBSERVATION_HOLD');
        assert.deepEqual({ ...after, state: before.state, evidence: before.evidence }, before);
        changed++;
      } else assert.deepEqual(after, before);
    }
    assert.equal(changed, 6);
    assert.equal(current.active_reviewed_observations, 588);
    assert.equal(current.active_observations_needing_scope_review, 568);
    assert.equal(current.presentation_only_reviewed_observations, 84);
    assert.equal(current.withdrawn_observations, 20);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
