import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { companyReference, selectObservations, verifyCompanyReference } from './lib/company-reference.mjs';

const row = { start: '2023-01-01', end: '2023-12-31', filed: '2024-02-01', val: 25, accn: '0000000001-24-000001', form: '10-K' };
test('latest-filed selection separates units and periods, excludes future information and quarter flows', () => {
  const later = { ...row, filed: '2025-02-01', val: 26, accn: '0000000001-25-000001' };
  const fact = { units: { USD: [row, later, { ...later, filed: '2027-01-01', val: 999 }, { ...row, start: '2023-10-01', val: 5 }], EUR: [{ ...row, val: 20 }] } };
  const selected = selectObservations(fact, 'duration', '2026-09-19');
  assert.equal(selected.length, 2);
  assert.equal(selected.find((r) => r.unit === 'USD').val, 26);
  assert.equal(selected.find((r) => r.unit === 'EUR').val, 20);
  assert.equal(selectObservations(fact, 'duration', '2024-12-31').find((r) => r.unit === 'USD').val, 25);
});
test('conflicting same-filing facts are rejected, missing data are never filled', () => {
  assert.throws(() => selectObservations({ units: { USD: [row, { ...row, val: 99 }] } }, 'duration', '2026-09-19'), /Conflicting/);
  assert.deepEqual(selectObservations({}, 'instant', '2026-09-19'), []);
  assert.throws(() => companyReference(JSON.stringify({ cik: 1, entityName: 'Example', facts: {} }), { fetchedAt: '2026-09-19T00:00:00Z', expectedCik: 2 }), /identity/);
  assert.throws(() => companyReference(JSON.stringify({ cik: 1, entityName: 'Example', facts: {} }), { fetchedAt: '2026-09-19T00:00:00Z', expectedCik: 1 }), /Insufficient/);
});
test('publication refuses edited numbers, source hashes and removed limitations', () => {
  const record = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
  const raw = gunzipSync(readFileSync(new URL(`../public${record.source_snapshot}`, import.meta.url)));
  assert.doesNotThrow(() => verifyCompanyReference(record, raw));
  const edited = structuredClone(record);
  edited.concepts[0].observations[0].val += 1;
  assert.throws(() => verifyCompanyReference(edited, raw), /concepts/);
  assert.throws(() => verifyCompanyReference({ ...record, source_sha256: '0'.repeat(64) }, raw), /source_sha256/);
  assert.throws(() => verifyCompanyReference({ ...record, claim_boundary: '' }, raw), /claim_boundary/);
});
test('published pilot has distinct identities, substantive sourced histories, no nonfinite or future facts', () => {
  const directory = new URL('../public/company-data/', import.meta.url);
  const files = readdirSync(directory).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 5);
  const identities = new Set();
  for (const file of files) {
    const record = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
    assert.equal(record.schema, 'canli.company-reference.v1');
    assert.equal(file, `${record.cik}.json`);
    assert.ok(!identities.has(record.cik)); identities.add(record.cik);
    assert.match(record.source_sha256, /^[a-f0-9]{64}$/);
    assert.equal(record.source_snapshot, `/company-data/sources/${record.source_sha256}.json.gz`);
    const raw = gunzipSync(readFileSync(new URL(`../public${record.source_snapshot}`, import.meta.url)));
    assert.equal(createHash('sha256').update(raw).digest('hex'), record.source_sha256);
    const reproduced = companyReference(raw, { fetchedAt: record.fetched_at, expectedCik: record.cik });
    assert.deepEqual(record.concepts, reproduced.concepts);
    assert.equal(record.source_url, `https://data.sec.gov/api/xbrl/companyfacts/CIK${record.cik}.json`);
    assert.ok(record.concepts.length >= 4);
    assert.match(record.policy, /not a point-in-time backtest dataset/);
    for (const concept of record.concepts) {
      assert.ok(new Set(concept.observations.map((r) => r.end)).size >= 3);
      const periods = new Set();
      for (const observation of concept.observations) {
        assert.ok(Number.isFinite(observation.val));
        assert.ok(observation.filed <= record.fetched_at.slice(0, 10));
        assert.ok(observation.end <= observation.filed);
        const key = `${observation.unit}/${observation.start ?? ''}/${observation.end}`;
        assert.ok(!periods.has(key)); periods.add(key);
      }
    }
  }
});
