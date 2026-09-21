import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyBatchNumerics } from './lib/company-batch-numerics.mjs';

const config = JSON.parse(readFileSync('config/company-basic-diluted-batch2-reviews.json'));
const original = Object.fromEntries(Object.entries(config.inputs).map(([key, { path }]) => {
  const raw = readFileSync(path);
  return [key, JSON.parse(path.endsWith('.gz') ? gunzipSync(raw) : raw)];
}));

test('real batch has exact 744 inline plus 56 legacy observations', () => {
  assert.deepEqual(verifyBatchNumerics(original), { observations: 800, filings: 100, inline_matches: 744, legacy_matches: 56 });
});

test('rejects altered metadata, duplicates, missing facts and false numerical closure', () => {
  for (const mutate of [
    x => { x.primary.filings[0].checks[0].selected.filed = '2026-01-01'; },
    x => { x.primary.filings[0].checks[0].selected.val += 1; },
    x => { x.primary.filings[0].checks.pop(); x.primary.observations--; },
    x => x.primary.filings.push(structuredClone(x.primary.filings[0])),
    x => { x.legacy.filings[0].checks[0].matched = false; },
    x => { x.legacy.filings[0].checks[0].matches = []; },
    x => x.legacy.filings[0].checks.push(structuredClone(x.legacy.filings[0].checks[0])),
    x => { x.capturedTargets.filings[0].observations[0].filed = '2026-01-01'; },
    x => { x.capturedTargets.unresolved_observation_count = 1; },
    x => { x.legacy.combined_matches = 799; },
  ]) {
    const data = structuredClone(original); mutate(data);
    assert.throws(() => verifyBatchNumerics(data));
  }
});

test('ledger is deterministic and pending evidence cannot be registered as reviewed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'canli-batch-scope-'));
  const run = (registry, output) => execFileSync(process.execPath,
    ['scripts/reconcile-basic-diluted-batch.mjs', registry, output], { stdio: 'pipe' });
  try {
    const first = join(directory, 'first.gz'), second = join(directory, 'second.gz');
    const baseline = join(directory, 'baseline.json');
    writeFileSync(baseline, JSON.stringify({ ...config, reviews: [] }));
    run(baseline, first);
    run(baseline, second);
    assert.deepEqual(readFileSync(first), readFileSync(second));
    const ledger = JSON.parse(gunzipSync(readFileSync(first)));
    assert.equal(ledger.original_observations, 800);
    assert.equal(ledger.active_reviewed_observations, 0);
    assert.equal(ledger.active_observations_needing_scope_review, 800);
    const registry = { ...structuredClone(config), reviews: [] };
    const invalid = join(directory, 'invalid.json');
    for (const [report, cik] of [
      ['company-theriva-filing-discrepancies-20260921.json', '0000894158'],
      ['company-community-numerator-discrepancy-20260921.json', '0001084551'],
      ['company-morgan-unit-discrepancy-20260921.json', '0001162283'],
      ['company-wright-unit-discrepancy-20260921.json', '0001279715'],
      ['company-stereotaxis-unit-discrepancy-20260921.json', '0001289340'],
      ['company-femasys-warrant-date-discrepancy-20260921.json', '0001339005'],
      ['company-digital-ally-denominator-discrepancy-20260921.json', '0001342958'],
      ['company-myomo-warrant-date-discrepancy-20260921.json', '0001369290'],
      ['company-fuwei-hidden-eps-pending-20260921.json', '0001381074'],
      ['company-raphael-eps-sign-discrepancy-20260921.json', '0001415397'],
    ]) {
      registry.reviews = [{ report, sha256: createHash('sha256').update(readFileSync('artifacts/seo/' + report)).digest('hex'),
        cik, decision_index: null, observations: 8,
        disposition: 'ACCOUNTING_SCOPE_REVIEW_PENDING', state: 'SCOPE_REVIEWED_WITH_SOURCE_CONTEXT' }];
      writeFileSync(invalid, JSON.stringify(registry));
      assert.throws(() => run(invalid, join(directory, 'invalid.gz')), error => /Unresolved report cannot approve/.test(error.stderr.toString()), report);
    }
    registry.reviews = []; registry.inputs.primary.sha256 = '0'.repeat(64);
    writeFileSync(invalid, JSON.stringify(registry));
    assert.throws(() => run(invalid, join(directory, 'invalid.gz')), error => /Pinned input changed/.test(error.stderr.toString()));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
