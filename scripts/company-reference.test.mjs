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

test('malformed dates and impossible filing chronology cannot enter a published history', () => {
  const diagnostics = {};
  const selected = selectObservations({ units: { USD: [
    row, { ...row, end: '2023-99-99' }, { ...row, end: '2023-02-30' },
    { ...row, filed: '2022-12-01' }, null,
  ] } }, 'duration', '2026-09-19', diagnostics);
  assert.equal(selected.length, 1);
  assert.equal(diagnostics.invalid_observation, 4);
});
test('same-filing conflicts are rejected even when a newer filing appears between them', () => {
  const amended = { ...row, val: 26, filed: '2025-02-01', accn: '0000000001-25-000001' };
  for (const observations of [[row, amended, { ...row, val: 99 }], [amended, row, { ...row, val: 99 }]]) {
    assert.throws(() => selectObservations({ units: { USD: observations } }, 'duration', '2026-09-19'), /Conflicting/);
  }
});
test('malformed fact collections and invalid entity identities fail closed', () => {
  for (const units of [null, [], { USD: {} }]) {
    assert.throws(() => selectObservations({ units }, 'instant', '2026-09-19'), /units|array/);
  }
  for (const cik of [0, -1, 10000000000]) {
    assert.throws(() => companyReference(JSON.stringify({ cik, entityName: 'Invalid' }), { fetchedAt: '2026-09-19T00:00:00Z', expectedCik: cik }), /identity/);
  }
});


test('unknown or malformed capture times cannot be promoted from the candidate catalog', () => {
  const record = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
  const raw = gunzipSync(readFileSync(new URL(`../public${record.source_snapshot}`, import.meta.url)));
  for (const fetched_at of [null, '2026-09-19', '2026-09-19invalid', '2026-09-19T25:00:00Z']) {
    assert.throws(() => verifyCompanyReference({ ...record, fetched_at }, raw), /capture timestamp/);
  }
});

test('extended policy is explicit and reproduces without changing legacy selection', () => {
  const record = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
  const raw = gunzipSync(readFileSync(new URL('../public' + record.source_snapshot, import.meta.url)));
  const legacy = companyReference(raw, { fetchedAt: record.fetched_at, expectedCik: record.cik });
  const extended = companyReference(raw, { fetchedAt: record.fetched_at, expectedCik: record.cik, selectionPolicy: 'extended-v1' });
  assert.equal(legacy.selection_policy, undefined);
  assert.deepEqual(legacy.concepts, record.concepts);
  assert.ok(extended.concepts.length > legacy.concepts.length);
  verifyCompanyReference(extended, raw); verifyCompanyReference(record, raw);
  assert.throws(() => verifyCompanyReference({ ...extended, selection_policy: undefined }, raw), /does not reproduce/);
  assert.throws(() => companyReference(raw, { fetchedAt: record.fetched_at, expectedCik: record.cik, selectionPolicy: 'unknown' }), /Unknown/);
});
test('new concepts require compatible units and a varying three-period history within one unit', () => {
  const record = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
  const source = JSON.parse(gunzipSync(readFileSync(new URL('../public' + record.source_snapshot, import.meta.url))));
  const rows = [2020, 2021, 2022].map((year, i) => ({ ...row, start: `${year}-01-01`, end: `${year}-12-31`, filed: `${year + 1}-02-01`, val: i + 1 }));
  source.facts['us-gaap'].EarningsPerShareBasic = { units: { USD: rows, 'USD/shares': rows } };
  source.facts['us-gaap'].ResearchAndDevelopmentExpense = { units: { USD: rows.map(row => ({ ...row, val: 0 })) } };
  const diagnostics = {};
  const result = companyReference(JSON.stringify(source), { fetchedAt: record.fetched_at, expectedCik: record.cik, selectionPolicy: 'extended-v1', diagnostics });
  const eps = result.concepts.find(concept => concept.tag === 'EarningsPerShareBasic');
  assert.deepEqual([...new Set(eps.observations.map(row => row.unit))], ['USD/shares']);
  assert.ok(!result.concepts.some(concept => concept.tag === 'ResearchAndDevelopmentExpense'));
  assert.ok(diagnostics.incompatible_unit >= 3);
  assert.ok(diagnostics.insufficient_varying_history >= 1);
});

test('versioned extended definitions retain their reviewed byte binding', async () => {
  const { EXTENDED_CONCEPTS } = await import('./lib/company-extended-concepts.mjs');
  const review = JSON.parse(readFileSync(new URL('../artifacts/seo/company-extended-taxonomy-review.json', import.meta.url)));
  assert.equal(createHash('sha256').update(JSON.stringify(EXTENDED_CONCEPTS)).digest('hex'), review.definitions_sha256, 'Create a new policy version for definition changes and retain the prior policy');
});

test('editorial policy preserves legitimate zero series and rejects changed evidence for known scope errors', () => {
  const record = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
  const raw = gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))).toString();
  const source = JSON.parse(raw);
  source.facts['us-gaap'].Revenues = { units: { USD: [2021, 2022, 2023].map(year => ({ ...row, start: `${year}-01-01`, end: `${year}-12-31`, val: 0 })) } };
  const result = companyReference(JSON.stringify(source), { fetchedAt: record.fetched_at, expectedCik: record.cik, selectionPolicy: 'extended-v2' });
  assert.ok(result.concepts.some(c => c.tag === 'Revenues' && c.observations.every(o => o.val === 0)));
  const tampered = structuredClone(result); tampered.editorial_exclusions = [{ tag: 'Revenues', reason: 'unreviewed' }];
  assert.throws(() => verifyCompanyReference(tampered, JSON.stringify(source)), /editorial_exclusions/);
  for (const cik of ['0000030625', '0000811830', '0001030469']) {
    source.cik = Number(cik);
    assert.throws(() => companyReference(JSON.stringify(source), { fetchedAt: record.fetched_at, expectedCik: cik, selectionPolicy: 'extended-v2' }), error => error.code === 'EDITORIAL_REVIEW_REQUIRED');
  }
});

test('v3 scopes new exclusions without changing the frozen v2 policy', () => {
  const record = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
  const source = JSON.parse(gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))));
  source.facts['us-gaap'].Revenues = { units: { USD: [2021, 2022, 2023].map(year => ({ ...row, start: `${year}-01-01`, end: `${year}-12-31`, val: 0 })) } };
  for (const cik of ['0000818479', '0001227654', '0000724445', '0001068689', '0000315545']) {
    source.cik = Number(cik);
    const raw = JSON.stringify(source);
    assert.doesNotThrow(() => companyReference(raw, { fetchedAt: record.fetched_at, expectedCik: cik, selectionPolicy: 'extended-v2' }));
    assert.throws(() => companyReference(raw, { fetchedAt: record.fetched_at, expectedCik: cik, selectionPolicy: 'extended-v3' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  }
});

test('v4 holds changed Liberty source without altering v3 selection', () => {
  const record = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
  const source = JSON.parse(gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))));
  source.cik = 1172178;
  source.facts['us-gaap'].PaymentsToAcquirePropertyPlantAndEquipment = { units: { USD: [2021, 2022, 2023].map(year => ({ ...row, start: `${year}-01-01`, end: `${year}-12-31`, val: 500 })) } };
  const raw = JSON.stringify(source), options = { fetchedAt: record.fetched_at, expectedCik: '0001172178' };
  const previous = companyReference(raw, { ...options, selectionPolicy: 'extended-v3' });
  assert.ok(previous.concepts.some(c => c.tag === 'PaymentsToAcquirePropertyPlantAndEquipment'));
  verifyCompanyReference(previous, raw);
  assert.throws(() => companyReference(raw, { ...options, selectionPolicy: 'extended-v4' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
});

test('v5 scope holds require new evidence without changing v4 policy', () => {
  const record = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
  const source = JSON.parse(gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))));
  source.facts['us-gaap'].Revenues = { units: { USD: [2021, 2022, 2023].map(year => ({ ...row, start: `${year}-01-01`, end: `${year}-12-31`, val: 0 })) } };
  for (const cik of ['0001121795', '0001258602', '0001320461']) {
    source.cik = Number(cik);
    const raw = JSON.stringify(source), options = { fetchedAt: record.fetched_at, expectedCik: cik };
    const previous = companyReference(raw, { ...options, selectionPolicy: 'extended-v4' });
    verifyCompanyReference(previous, raw);
    assert.throws(() => companyReference(raw, { ...options, selectionPolicy: 'extended-v5' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  }
});

test('v6 requires source-bound NOVAGOLD scope evidence and preserves v5', () => {
  const record = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
  const source = JSON.parse(gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))));
  source.cik = 1173420;
  source.facts['us-gaap'].Revenues = { units: { USD: [2021, 2022, 2023].map(year => ({ ...row, start: `${year}-01-01`, end: `${year}-12-31`, val: 0 })) } };
  const raw = JSON.stringify(source), options = { fetchedAt: record.fetched_at, expectedCik: '0001173420' };
  verifyCompanyReference(companyReference(raw, { ...options, selectionPolicy: 'extended-v5' }), raw);
  assert.throws(() => companyReference(raw, { ...options, selectionPolicy: 'extended-v6' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
});


test('v7 requires source-bound Livento scope evidence and preserves v6', () => {
  const record = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
  const source = JSON.parse(gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))));
  source.cik = 1593549;
  source.facts['us-gaap'].Revenues = { units: { USD: [2021, 2022, 2023].map(year => ({ ...row, start: `${year}-01-01`, end: `${year}-12-31`, val: 2000000 })) } };
  const raw = JSON.stringify(source), options = { fetchedAt: record.fetched_at, expectedCik: '0001593549' };
  verifyCompanyReference(companyReference(raw, { ...options, selectionPolicy: 'extended-v6' }), raw);
  assert.throws(() => companyReference(raw, { ...options, selectionPolicy: 'extended-v7' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
});


test('v8 requires new source reviews for narrower zero-revenue claims and preserves v7', () => {
  const record = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
  const source = JSON.parse(gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))));
  for (const [cik, tag] of [['0001551182', 'Revenues'], ['0001477845', 'RevenueFromContractWithCustomerExcludingAssessedTax'], ['0001598646', 'RevenueFromContractWithCustomerExcludingAssessedTax']]) {
    source.cik = Number(cik);
    source.facts['us-gaap'][tag] = { units: { USD: [2021, 2022, 2023].map(year => ({ ...row, start: `${year}-01-01`, end: `${year}-12-31`, val: 0 })) } };
    const raw = JSON.stringify(source), options = { fetchedAt: record.fetched_at, expectedCik: cik };
    verifyCompanyReference(companyReference(raw, { ...options, selectionPolicy: 'extended-v7' }), raw);
    assert.throws(() => companyReference(raw, { ...options, selectionPolicy: 'extended-v8' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  }
});


test('v9 requires renewed evidence for Nika revenue and preserves prior policy reproduction', () => {
  const record = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
  const source = JSON.parse(gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))));
  source.cik = 1145604;
  source.facts['us-gaap'].Revenues = { units: { USD: [2021, 2022, 2023].map(year => ({ ...row, start: `${year}-01-01`, end: `${year}-12-31`, val: 0 })) } };
  const raw = JSON.stringify(source), options = { fetchedAt: record.fetched_at, expectedCik: '0001145604' };
  verifyCompanyReference(companyReference(raw, { ...options, selectionPolicy: 'extended-v8' }), raw);
  assert.throws(() => companyReference(raw, { ...options, selectionPolicy: 'extended-v9' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
});
