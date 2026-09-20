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

test('v10 requires renewed Birdie SG&A source review while v9 remains reproducible', () => {
  const record = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
  const source = JSON.parse(gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))));
  source.cik = 1873213;
  source.facts['us-gaap'].SellingGeneralAndAdministrativeExpense = { units: { USD: [2021, 2022, 2023].map((year, i) => ({ ...row, start: `${year}-01-01`, end: `${year}-12-31`, val: 100 + i })) } };
  const raw = JSON.stringify(source), options = { fetchedAt: record.fetched_at, expectedCik: '0001873213' };
  const prior = companyReference(raw, { ...options, selectionPolicy: 'extended-v9' });
  assert.ok(prior.concepts.some(c => c.tag === 'SellingGeneralAndAdministrativeExpense'));
  verifyCompanyReference(prior, raw);
  assert.throws(() => companyReference(raw, { ...options, selectionPolicy: 'extended-v10' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  source.cik = 1873214;
  const other = companyReference(JSON.stringify(source), { ...options, expectedCik: '0001873214', selectionPolicy: 'extended-v10' });
  assert.ok(other.concepts.some(c => c.tag === 'SellingGeneralAndAdministrativeExpense'));
});

test('v11 withholds only the exact reviewed DBMM period and reproduces prior policies', async () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/dbmm-reviewed-source.json.gz', import.meta.url)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), '1d83049f899cbff9a062f8d19500599a1f079e18e925526b11f1306ca7a36021');
  const options = { fetchedAt: '2026-09-20T00:00:00Z', expectedCik: '0001127475' };
  const before = companyReference(raw, { ...options, selectionPolicy: 'extended-v10' });
  const diagnostics = {};
  const after = companyReference(raw, { ...options, selectionPolicy: 'extended-v11', diagnostics });
  const tag = 'RevenueFromContractWithCustomerExcludingAssessedTax';
  assert.equal(before.concepts.length, after.concepts.length);
  const expected = structuredClone(before.concepts);
  const target = expected.find(c => c.tag === tag);
  assert.equal(target.observations.filter(row => row.end === '2020-08-31').length, 1);
  target.observations = target.observations.filter(row => row.end !== '2020-08-31');
  assert.deepEqual(after.concepts, expected);
  assert.equal(diagnostics.editorial_observation_excluded, 1);
  assert.equal(after.editorial_exclusions.filter(row => row.observation).length, 1);
  verifyCompanyReference(before, raw); verifyCompanyReference(after, raw);
  const changed = structuredClone(after); delete changed.editorial_exclusions;
  assert.throws(() => verifyCompanyReference(changed, raw), /does not reproduce/);
  assert.throws(() => companyReference(Buffer.concat([raw, Buffer.from('\n')]), { ...options, selectionPolicy: 'extended-v11' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  assert.throws(() => companyReference(raw, { ...options, fetchedAt: '2020-09-01T00:00:00Z', selectionPolicy: 'extended-v11' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  const { renderCompanyPages } = await import('./lib/company-page-renderer.mjs');
  after.source_snapshot = `/company-data/sources/${after.source_sha256}.json.gz`;
  const metric = renderCompanyPages(after, { target: tag })[0].html;
  assert.match(metric, /Withheld reporting periods/);
  assert.match(metric, /XBRL period conflicts/);
  assert.doesNotMatch(metric.split('<h2>Selected filing history</h2>')[1].split('</table>')[0], /<th scope="row">2020-08-31<\/th>/);
  const revenue = renderCompanyPages(after, { target: 'Revenues' })[0].html;
  assert.doesNotMatch(revenue, /Withheld reporting periods/);
  assert.match(revenue, /<th scope="row">2020-08-31<\/th>/);
  assert.match(renderCompanyPages(after, { target: 'overview' })[0].html, /XBRL period conflicts/);
});

test('v12 withholds HNO operating history while preserving net loss and inherited holdbacks', async () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/hno-reviewed-source.json.gz', import.meta.url)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), '04f062ef5e20caad0e3d8bf8913f2790f3550faf496fbcc8e4266d8eb14abe28');
  const options = { fetchedAt: '2026-09-20T07:54:29.633Z', expectedCik: '0001342916' };
  const before = companyReference(raw, { ...options, selectionPolicy: 'extended-v11' });
  const after = companyReference(raw, { ...options, selectionPolicy: 'extended-v12' });
  assert.equal(before.concepts.find(c => c.tag === 'OperatingIncomeLoss').observations.length, 4);
  assert.deepEqual(after.concepts, before.concepts.filter(c => c.tag !== 'OperatingIncomeLoss'));
  assert.deepEqual(after.concepts.find(c => c.tag === 'NetIncomeLoss'), before.concepts.find(c => c.tag === 'NetIncomeLoss'));
  assert.equal(after.editorial_exclusions.filter(e => e.tag === 'OperatingIncomeLoss').length, 1);
  verifyCompanyReference(before, raw); verifyCompanyReference(after, raw);
  const changed = structuredClone(after); delete changed.editorial_exclusions;
  assert.throws(() => verifyCompanyReference(changed, raw), /does not reproduce/);
  assert.throws(() => companyReference(Buffer.concat([raw, Buffer.from('\n')]), { ...options, selectionPolicy: 'extended-v12' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  const { renderCompanyPages } = await import('./lib/company-page-renderer.mjs');
  after.source_snapshot = `/company-data/sources/${after.source_sha256}.json.gz`;
  const pages = renderCompanyPages(after);
  assert(!pages.some(p => p.path.includes('OperatingIncomeLoss')));
  assert.match(renderCompanyPages(after, { target: 'overview' })[0].html, /no calculated replacement has been substituted/);
  const dbmm = gunzipSync(readFileSync(new URL('./fixtures/editorial/dbmm-reviewed-source.json.gz', import.meta.url)));
  const dbOptions = { fetchedAt: options.fetchedAt, expectedCik: '0001127475' };
  const previous = companyReference(dbmm, { ...dbOptions, selectionPolicy: 'extended-v11' });
  const inherited = companyReference(dbmm, { ...dbOptions, selectionPolicy: 'extended-v12' });
  assert.deepEqual(inherited.concepts, previous.concepts);
  assert.deepEqual(inherited.editorial_exclusions, previous.editorial_exclusions);
  verifyCompanyReference(inherited, dbmm);
});

test('v13 withholds only disputed Atlantica liability periods and preserves prior exclusions', async () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/atlantica-reviewed-source.json.gz', import.meta.url)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), 'b6982eca52afbce436eed50540a757170b57c33a9b39cd6eb182ff42d4f267d8');
  const options = { fetchedAt: '2026-09-20T05:18:35.368Z', expectedCik: '0001062506' };
  const before = companyReference(raw, { ...options, selectionPolicy: 'extended-v12' });
  const diagnostics = {};
  const after = companyReference(raw, { ...options, selectionPolicy: 'extended-v13', diagnostics });
  const expected = structuredClone(before.concepts);
  for (const tag of ['Liabilities', 'LiabilitiesCurrent']) {
    const concept = expected.find(c => c.tag === tag);
    assert.equal(concept.observations.filter(row => row.end === '2023-12-31').length, 1);
    concept.observations = concept.observations.filter(row => row.end !== '2023-12-31');
  }
  assert.deepEqual(after.concepts, expected);
  assert.equal(diagnostics.editorial_observation_excluded, 2);
  assert.equal(after.editorial_exclusions.filter(e => e.observation).length, 2);
  verifyCompanyReference(before, raw); verifyCompanyReference(after, raw);
  const changed = structuredClone(after); changed.editorial_exclusions.pop();
  assert.throws(() => verifyCompanyReference(changed, raw), /does not reproduce/);
  assert.throws(() => companyReference(Buffer.concat([raw, Buffer.from('\n')]), { ...options, selectionPolicy: 'extended-v13' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  assert.throws(() => companyReference(raw, { ...options, fetchedAt: '2024-01-01T00:00:00Z', selectionPolicy: 'extended-v13' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  const { renderCompanyPages } = await import('./lib/company-page-renderer.mjs');
  after.source_snapshot = `/company-data/sources/${after.source_sha256}.json.gz`;
  for (const tag of ['Liabilities', 'LiabilitiesCurrent']) {
    const html = renderCompanyPages(after, { target: tag })[0].html;
    assert.match(html, /Withheld reporting periods/);
    assert.match(html, /inconsistency remains unresolved/);
    assert.doesNotMatch(html.split('<h2>Selected filing history</h2>')[1].split('</table>')[0], /<th scope="row">2023-12-31<\/th>/);
  }
  const assets = renderCompanyPages(after, { target: 'Assets' })[0].html;
  assert.match(assets, /<th scope="row">2023-12-31<\/th>/);
  assert.doesNotMatch(assets, /Withheld reporting periods/);
  for (const [fixture,cik] of [['hno','0001342916'],['dbmm','0001127475']]) {
    const source = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const opts = { fetchedAt: '2026-09-20T07:54:29.633Z', expectedCik: cik };
    const previous = companyReference(source, { ...opts, selectionPolicy: 'extended-v12' });
    const inherited = companyReference(source, { ...opts, selectionPolicy: 'extended-v13' });
    assert.deepEqual(inherited.concepts, previous.concepts);
    assert.deepEqual(inherited.editorial_exclusions, previous.editorial_exclusions);
    verifyCompanyReference(inherited, source);
  }
});

test('v14 withholds only six conflicting Varonis AFN/share observations', async () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/varonis-reviewed-source.json.gz', import.meta.url)));
  const options = { fetchedAt: '2026-09-20T07:56:08.917Z', expectedCik: '0001361113' };
  const before = companyReference(raw, { ...options, selectionPolicy: 'extended-v13' });
  const after = companyReference(raw, { ...options, selectionPolicy: 'extended-v14' });
  const expected = structuredClone(before.concepts);
  for (const tag of ['EarningsPerShareBasic', 'EarningsPerShareDiluted']) {
    const concept = expected.find(c => c.tag === tag);
    assert.equal(concept.observations.filter(r => r.unit === 'AFN/shares').length, 3);
    concept.observations = concept.observations.filter(r => r.unit !== 'AFN/shares');
    assert.ok(concept.observations.some(r => r.unit === 'USD/shares'));
  }
  assert.deepEqual(after.concepts, expected);
  assert.equal(after.editorial_exclusions.length, 6);
  verifyCompanyReference(before, raw); verifyCompanyReference(after, raw);
  assert.throws(() => companyReference(Buffer.concat([raw, Buffer.from('\n')]), { ...options, selectionPolicy: 'extended-v14' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  assert.throws(() => companyReference(raw, { ...options, fetchedAt: '2020-01-01T00:00:00Z', selectionPolicy: 'extended-v14' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  const changed = structuredClone(after); changed.editorial_exclusions.pop();
  assert.throws(() => verifyCompanyReference(changed, raw), /does not reproduce/);
  const { renderCompanyPages } = await import('./lib/company-page-renderer.mjs');
  after.source_snapshot = `/company-data/sources/${after.source_sha256}.json.gz`;
  for (const target of ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'overview']) {
    const html = renderCompanyPages(after, { target })[0].html;
    assert.match(html, /conflicting currency unit/);
    assert.match(html, /vrns-20211231.htm/);
  }
  for (const [fixture, cik] of [['atlantica', '0001062506'], ['hno', '0001342916'], ['dbmm', '0001127475']]) {
    const source = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const opts = { fetchedAt: options.fetchedAt, expectedCik: cik };
    const prior = companyReference(source, { ...opts, selectionPolicy: 'extended-v13' });
    const next = companyReference(source, { ...opts, selectionPolicy: 'extended-v14' });
    assert.deepEqual(next.concepts, prior.concepts);
    assert.deepEqual(next.editorial_exclusions, prior.editorial_exclusions);
    verifyCompanyReference(next, source);
  }
});

test('v15 preserves unrelated facts and exposes two distinct currency-context holds', async () => {
  const { EDITORIAL_OBSERVATION_EXCLUSIONS_V15 } = await import('./lib/company-editorial-v15.mjs');
  const { renderCompanyPages } = await import('./lib/company-page-renderer.mjs');
  const cases = [
    ['monolithic', '0001280452', '2026-09-20T07:48:39.145Z', /conflicting currency unit/],
    ['51talk', '0001659494', '2026-09-19T11:20:04.794Z', /disclosed currency is supported/],
  ];
  for (const [fixture, cik, fetchedAt, notice] of cases) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const options = { expectedCik: cik, fetchedAt };
    const before = companyReference(raw, { ...options, selectionPolicy: 'extended-v14' });
    const after = companyReference(raw, { ...options, selectionPolicy: 'extended-v15' });
    const decisions = EDITORIAL_OBSERVATION_EXCLUSIONS_V15.filter(d => d.cik === cik);
    assert.equal(decisions.length, 1);
    const decision = decisions[0];
    const matches = row => Object.entries(decision.observation).every(([key, value]) => row[key] === value);
    const expected = structuredClone(before.concepts);
    const concept = expected.find(c => c.tag === decision.tag);
    assert.equal(concept.observations.filter(matches).length, 1);
    concept.observations = concept.observations.filter(row => !matches(row));
    assert.ok(concept.observations.some(row => row.unit === 'USD'));
    assert.deepEqual(after.concepts, expected);
    assert.equal(after.editorial_exclusions.length, (before.editorial_exclusions?.length ?? 0) + 1);
    verifyCompanyReference(before, raw); verifyCompanyReference(after, raw);
    assert.throws(() => companyReference(Buffer.concat([raw, Buffer.from('\n')]), { ...options, selectionPolicy: 'extended-v15' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
    assert.throws(() => companyReference(raw, { ...options, fetchedAt: '2010-01-01T00:00:00Z', selectionPolicy: 'extended-v15' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
    const changed = structuredClone(after); changed.editorial_exclusions.pop();
    assert.throws(() => verifyCompanyReference(changed, raw), /does not reproduce/);
    after.source_snapshot = `/company-data/sources/${after.source_sha256}.json.gz`;
    for (const target of [decision.tag, 'overview']) {
      const html = renderCompanyPages(after, { target })[0].html;
      assert.match(html, notice);
      assert.ok(html.includes(decision.filing_url));
    }
  }
  for (const [fixture, cik] of [['varonis', '0001361113'], ['atlantica', '0001062506'], ['hno', '0001342916'], ['dbmm', '0001127475']]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const options = { expectedCik: cik, fetchedAt: '2026-09-20T07:56:08.917Z' };
    const before = companyReference(raw, { ...options, selectionPolicy: 'extended-v14' });
    const after = companyReference(raw, { ...options, selectionPolicy: 'extended-v15' });
    assert.deepEqual(after.concepts, before.concepts);
    assert.deepEqual(after.editorial_exclusions, before.editorial_exclusions);
    verifyCompanyReference(after, raw);
  }
});

test('v17 withholds only Siebert conflicting diluted denominators and preserves other facts', async () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/siebert-reviewed-source.json.gz', import.meta.url)));
  const options = { expectedCik: '0000065596', fetchedAt: '2026-09-20T00:00:00Z' };
  const before = companyReference(raw, { ...options, selectionPolicy: 'extended-v16' });
  const diagnostics = {};
  const after = companyReference(raw, { ...options, diagnostics, selectionPolicy: 'extended-v17' });
  const expected = structuredClone(before.concepts);
  const diluted = expected.find(c => c.tag === 'WeightedAverageNumberOfDilutedSharesOutstanding');
  assert.equal(diluted.observations.filter(r => r.accn === '0001213900-26-036500').length, 2);
  diluted.observations = diluted.observations.filter(r => r.accn !== '0001213900-26-036500');
  assert.deepEqual(after.concepts, expected);
  assert.equal(diagnostics.editorial_observation_excluded, 2);
  assert.equal(after.editorial_exclusions.length, 2);
  verifyCompanyReference(after, raw);
  assert.throws(() => companyReference(Buffer.concat([raw, Buffer.from('\n')]), { ...options, selectionPolicy: 'extended-v17' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  const { renderCompanyPages } = await import('./lib/company-page-renderer.mjs');
  after.source_snapshot = `/company-data/sources/${after.source_sha256}.json.gz`;
  for (const target of ['overview', diluted.tag]) {
    const html = renderCompanyPages(after, { target })[0].html;
    assert.match(html, /Note 19 reports a higher diluted total/);
    assert.match(html, /ea0281594-10k_siebert.htm/);
  }
  const oldRaw = gunzipSync(readFileSync(new URL('./fixtures/editorial/valhi-reviewed-source.json.gz', import.meta.url)));
  const oldOptions = { expectedCik: '0000059255', fetchedAt: options.fetchedAt };
  const old = companyReference(oldRaw, { ...oldOptions, selectionPolicy: 'extended-v16' });
  const next = companyReference(oldRaw, { ...oldOptions, selectionPolicy: 'extended-v17' });
  assert.deepEqual(next.concepts, old.concepts);
  assert.deepEqual(next.editorial_exclusions, old.editorial_exclusions);
});

test('v16 excludes eight Valhi scale conflicts and applies existing history-quality rules', async () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/valhi-reviewed-source.json.gz', import.meta.url)));
  const options = { expectedCik: '0000059255', fetchedAt: '2026-09-19T14:48:49.937Z' };
  const before = companyReference(raw, { ...options, selectionPolicy: 'extended-v15' });
  const diagnostics = {};
  const after = companyReference(raw, { ...options, diagnostics, selectionPolicy: 'extended-v16' });
  const tags = ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
  for (const tag of tags) {
    const rows = before.concepts.find(c => c.tag === tag).observations;
    assert.equal(rows.filter(r => r.val === 28.5).length, 4);
    assert.deepEqual(rows.filter(r => r.val !== 28.5).map(r => r.val), [28500000, 28500000, 28500000]);
  }
  assert.deepEqual(after.concepts, before.concepts.filter(c => !tags.includes(c.tag)));
  assert.equal(diagnostics.editorial_observation_excluded, 8);
  assert.equal(after.editorial_exclusions.length, 8);
  verifyCompanyReference(after, raw); verifyCompanyReference(before, raw);
  assert.throws(() => companyReference(Buffer.concat([raw, Buffer.from('\n')]), { ...options, selectionPolicy: 'extended-v16' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  const changed = structuredClone(after); changed.editorial_exclusions.pop();
  assert.throws(() => verifyCompanyReference(changed, raw), /does not reproduce/);
  const { renderCompanyPages } = await import('./lib/company-page-renderer.mjs');
  after.source_snapshot = `/company-data/sources/${after.source_sha256}.json.gz`;
  const overview = renderCompanyPages(after, { target: 'overview' })[0].html;
  assert.match(overview, /statement presents the figure in millions/);
  assert.match(overview, /remaining constant history/);
  assert.match(overview, /vhl-20241231x10k.htm/);
  assert.match(overview, /vhl-20251231x10k.htm/);
  for (const tag of tags) assert.deepEqual(renderCompanyPages(after, { target: tag }), []);
  for (const [fixture, cik] of [['monolithic', '0001280452'], ['51talk', '0001659494'], ['varonis', '0001361113']]) {
    const source = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const opts = { expectedCik: cik, fetchedAt: '2026-09-20T07:56:08.917Z' };
    const previous = companyReference(source, { ...opts, selectionPolicy: 'extended-v15' });
    const next = companyReference(source, { ...opts, selectionPolicy: 'extended-v16' });
    assert.deepEqual(next.concepts, previous.concepts);
    assert.deepEqual(next.editorial_exclusions, previous.editorial_exclusions);
  }
});

test('v18 holds six Iovance scale conflicts without altering EPS or older facts', async () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/iovance-reviewed-source.json.gz', import.meta.url)));
  const options = { expectedCik: '0001425205', fetchedAt: '2026-09-20T00:00:00Z' };
  const before = companyReference(raw, { ...options, selectionPolicy: 'extended-v17' });
  const diagnostics = {};
  const after = companyReference(raw, { ...options, diagnostics, selectionPolicy: 'extended-v18' });
  const expected = structuredClone(before.concepts);
  for (const tag of ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding']) {
    const concept = expected.find(c => c.tag === tag);
    assert.equal(concept.observations.filter(r => r.accn === '0001104659-26-018899').length, 3);
    concept.observations = concept.observations.filter(r => r.accn !== '0001104659-26-018899');
    assert.equal(concept.observations.length, 4);
  }
  assert.deepEqual(after.concepts, expected);
  assert.equal(diagnostics.editorial_observation_excluded, 6);
  assert.equal(after.editorial_exclusions.length, 6);
  verifyCompanyReference(after, raw);
  assert.throws(() => companyReference(Buffer.concat([raw, Buffer.from('\n')]), { ...options, selectionPolicy: 'extended-v18' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  const { renderCompanyPages } = await import('./lib/company-page-renderer.mjs');
  after.source_snapshot = `/company-data/sources/${after.source_sha256}.json.gz`;
  for (const target of ['overview', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding']) {
    const html = renderCompanyPages(after, { target })[0].html;
    assert.match(html, /statement labels share counts in thousands/);
    assert.match(html, /iova-20251231x10k.htm/);
  }
  const oldRaw = gunzipSync(readFileSync(new URL('./fixtures/editorial/siebert-reviewed-source.json.gz', import.meta.url)));
  const oldOptions = { expectedCik: '0000065596', fetchedAt: options.fetchedAt };
  const old = companyReference(oldRaw, { ...oldOptions, selectionPolicy: 'extended-v17' });
  const next = companyReference(oldRaw, { ...oldOptions, selectionPolicy: 'extended-v18' });
  assert.deepEqual(next.concepts, old.concepts);
  assert.deepEqual(next.editorial_exclusions, old.editorial_exclusions);
});

test('v19 holds six Outset scale conflicts without altering EPS or older facts', async () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/outset-medical-reviewed-source.json.gz', import.meta.url)));
  const options = { expectedCik: '0001484612', fetchedAt: '2026-09-20T00:00:00Z' };
  const before = companyReference(raw, { ...options, selectionPolicy: 'extended-v18' });
  const diagnostics = {};
  const after = companyReference(raw, { ...options, diagnostics, selectionPolicy: 'extended-v19' });
  const expected = structuredClone(before.concepts);
  for (const tag of ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding']) {
    const concept = expected.find(c => c.tag === tag);
    assert.equal(concept.observations.filter(r => r.accn === '0001193125-26-051278').length, 3);
    concept.observations = concept.observations.filter(r => r.accn !== '0001193125-26-051278');
    assert.ok(concept.observations.length >= 3);
  }
  assert.deepEqual(after.concepts, expected);
  assert.equal(diagnostics.editorial_observation_excluded, 6);
  assert.equal(after.editorial_exclusions.length, 6);
  verifyCompanyReference(after, raw);
  assert.throws(() => companyReference(Buffer.concat([raw, Buffer.from('\n')]), { ...options, selectionPolicy: 'extended-v19' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  const { renderCompanyPages } = await import('./lib/company-page-renderer.mjs');
  after.source_snapshot = `/company-data/sources/${after.source_sha256}.json.gz`;
  for (const target of ['overview', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding']) {
    const html = renderCompanyPages(after, { target })[0].html;
    assert.match(html, /statement labels share counts in thousands/);
    assert.match(html, /om-20251231/);
  }
  const oldRaw = gunzipSync(readFileSync(new URL('./fixtures/editorial/siebert-reviewed-source.json.gz', import.meta.url)));
  const oldOptions = { expectedCik: '0000065596', fetchedAt: options.fetchedAt };
  const old = companyReference(oldRaw, { ...oldOptions, selectionPolicy: 'extended-v18' });
  const next = companyReference(oldRaw, { ...oldOptions, selectionPolicy: 'extended-v19' });
  assert.deepEqual(next.concepts, old.concepts);
  assert.deepEqual(next.editorial_exclusions, old.editorial_exclusions);
});

test('v20 holds only six historical ReWalk ILS EPS facts and preserves USD and share counts', async () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/lifeward-reviewed-source.json.gz', import.meta.url)));
  const options = { expectedCik: '0001607962', fetchedAt: '2026-09-20T00:00:00Z' };
  const before = companyReference(raw, { ...options, selectionPolicy: 'extended-v19' });
  const diagnostics = {};
  const after = companyReference(raw, { ...options, diagnostics, selectionPolicy: 'extended-v20' });
  const expected = structuredClone(before.concepts);
  for (const tag of ['EarningsPerShareBasic', 'EarningsPerShareDiluted']) {
    const concept = expected.find(c => c.tag === tag);
    const held = r => r.accn === '0001178913-24-000730' && r.unit === 'ILS/shares';
    assert.equal(concept.observations.filter(held).length, 3);
    concept.observations = concept.observations.filter(r => !held(r));
    assert.ok(concept.observations.some(r => r.unit === 'USD/shares' && r.end === '2021-12-31' && r.val === -0.27));
  }
  assert.deepEqual(after.concepts, expected);
  assert.equal(diagnostics.editorial_observation_excluded, 6);
  assert.equal(after.editorial_exclusions.length, 6);
  verifyCompanyReference(after, raw);
  assert.throws(() => companyReference(Buffer.concat([raw, Buffer.from('\n')]), { ...options, selectionPolicy: 'extended-v20' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  const { renderCompanyPages } = await import('./lib/company-page-renderer.mjs');
  after.source_snapshot = `/company-data/sources/${after.source_sha256}.json.gz`;
  for (const target of ['overview', 'EarningsPerShareBasic', 'EarningsPerShareDiluted']) {
    const html = renderCompanyPages(after, { target })[0].html;
    assert.match(html, /historical ReWalk statement/);
    assert.match(html, /zk2431037/);
  }
  const oldRaw = gunzipSync(readFileSync(new URL('./fixtures/editorial/outset-medical-reviewed-source.json.gz', import.meta.url)));
  const oldOptions = { expectedCik: '0001484612', fetchedAt: options.fetchedAt };
  const old = companyReference(oldRaw, { ...oldOptions, selectionPolicy: 'extended-v19' });
  const next = companyReference(oldRaw, { ...oldOptions, selectionPolicy: 'extended-v20' });
  assert.deepEqual(next.concepts, old.concepts);
  assert.deepEqual(next.editorial_exclusions, old.editorial_exclusions);
});


test('v21 withholds only conflicting INVO 2014 shares and retains EPS and other periods', async () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/invo-reviewed-source.json.gz', import.meta.url)));
  const options = { expectedCik: '0001417926', fetchedAt: '2026-09-20T00:00:00Z' };
  const before = companyReference(raw, { ...options, selectionPolicy: 'extended-v20' });
  const diagnostics = {};
  const after = companyReference(raw, { ...options, diagnostics, selectionPolicy: 'extended-v21' });
  const expected = structuredClone(before.concepts);
  for (const tag of ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding']) {
    const concept = expected.find(c => c.tag === tag);
    const held = r => r.accn === '0001185185-17-000595' && r.end === '2014-12-31' && r.val === 112672160;
    assert.equal(concept.observations.filter(held).length, 1);
    concept.observations = concept.observations.filter(r => !held(r));
  }
  assert.deepEqual(after.concepts, expected);
  assert.equal(diagnostics.editorial_observation_excluded, 2);
  assert.equal(after.editorial_exclusions.length, 2);
  verifyCompanyReference(after, raw);
  assert.throws(() => companyReference(Buffer.concat([raw, Buffer.from('\n')]), { ...options, selectionPolicy: 'extended-v21' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  const { renderCompanyPages } = await import('./lib/company-page-renderer.mjs');
  after.source_snapshot = `/company-data/sources/${after.source_sha256}.json.gz`;
  for (const target of ['overview', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding']) {
    const html = renderCompanyPages(after, { target })[0].html;
    assert.match(html, /112,672,160 while the per-share note reports 112,670,160/);
    assert.match(html, /invobioscience10k123115/);
  }
  const priorRaw = gunzipSync(readFileSync(new URL('./fixtures/editorial/lifeward-reviewed-source.json.gz', import.meta.url)));
  const priorOptions = { expectedCik: '0001607962', fetchedAt: options.fetchedAt };
  const old = companyReference(priorRaw, { ...priorOptions, selectionPolicy: 'extended-v20' });
  const next = companyReference(priorRaw, { ...priorOptions, selectionPolicy: 'extended-v21' });
  assert.deepEqual(next.concepts, old.concepts);
  assert.deepEqual(next.editorial_exclusions, old.editorial_exclusions);
});


test('v22 removes only the eight older Iovance share facts and now-empty histories', async () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/iovance-reviewed-source.json.gz', import.meta.url)));
  const options = { expectedCik: '0001425205', fetchedAt: '2026-09-20T00:00:00Z' };
  const before = companyReference(raw, { ...options, selectionPolicy: 'extended-v21' });
  const after = companyReference(raw, { ...options, selectionPolicy: 'extended-v22' });
  const tags = ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
  for (const tag of tags) {
    assert.equal(before.concepts.find(c => c.tag === tag).observations.length, 4);
    assert.ok(!after.concepts.some(c => c.tag === tag));
  }
  assert.deepEqual(after.concepts, before.concepts.filter(c => !tags.includes(c.tag)));
  assert.equal(after.editorial_exclusions.length, 14);
  verifyCompanyReference(after, raw);
  assert.throws(() => companyReference(Buffer.concat([raw, Buffer.from('\n')]), { ...options, selectionPolicy: 'extended-v22' }), e => e.code === 'EDITORIAL_REVIEW_REQUIRED');
  const { renderCompanyPages } = await import('./lib/company-page-renderer.mjs');
  after.source_snapshot = `/company-data/sources/${after.source_sha256}.json.gz`;
  assert.match(renderCompanyPages(after, { target: 'overview' })[0].html, /older Iovance weighted-average share observation/);
  for (const tag of tags) assert.equal(renderCompanyPages(after, { target: tag }).length, 0);
  const oldRaw = gunzipSync(readFileSync(new URL('./fixtures/editorial/invo-reviewed-source.json.gz', import.meta.url)));
  const oldOptions = { expectedCik: '0001417926', fetchedAt: options.fetchedAt };
  const old = companyReference(oldRaw, { ...oldOptions, selectionPolicy: 'extended-v21' });
  const next = companyReference(oldRaw, { ...oldOptions, selectionPolicy: 'extended-v22' });
  assert.deepEqual(next.concepts, old.concepts);
  assert.deepEqual(next.editorial_exclusions, old.editorial_exclusions);
});
