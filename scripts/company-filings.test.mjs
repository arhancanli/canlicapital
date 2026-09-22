import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { CONCEPTS, companyReference } from './lib/company-reference.mjs';
import { EXTENDED_CONCEPTS } from './lib/company-extended-concepts.mjs';
import { EXPANDED_CONCEPTS_V23 } from './lib/company-expanded-concepts-v23.mjs';
import { FILING_FORMS, MIN_FILING_CONCEPTS, companyFilings, conceptDefinitions, filingPath, filingsFromSource, filingsHash, filingsIndexPath, secFilingIndexUrl } from './lib/company-filings.mjs';

function pilot(cik) {
  const record = JSON.parse(readFileSync(new URL(`../public/company-data/${cik}.json`, import.meta.url)));
  const raw = gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))).toString();
  return { record, raw };
}

test('filings for a pilot company are complete, consistent with the selector and deterministic', () => {
  const { record, raw } = pilot('0000320193');
  const document = companyFilings(raw, { fetchedAt: record.fetched_at, expectedCik: record.cik });
  assert.equal(document.schema, 'canli.company-filings.v1');
  assert.equal(document.cik, record.cik); assert.equal(document.name, record.name);
  assert.equal(document.source_sha256, record.source_sha256);
  assert.equal(document.selection_policy, 'extended-v23'); assert.equal(document.filings_policy, 'filings-v1');
  assert.ok(document.filings.length >= 40, `expected dozens of filings, got ${document.filings.length}`);
  const accessions = document.filings.map(f => f.accession);
  assert.equal(new Set(accessions).size, accessions.length);
  for (const filing of document.filings) {
    assert.ok(FILING_FORMS.includes(filing.form), filing.form);
    assert.equal(filing.amendment, filing.form.endsWith('/A'));
    assert.ok(filing.concept_count >= MIN_FILING_CONCEPTS);
    assert.equal(filing.concept_count, filing.concepts.length);
    assert.equal(filing.fact_count, filing.concepts.reduce((n, c) => n + c.facts.length, 0));
    assert.equal(filing.sec_index_url, secFilingIndexUrl(record.cik, filing.accession));
    for (const concept of filing.concepts) {
      assert.ok(concept.facts.length > 0);
      for (const fact of concept.facts) {
        assert.ok(fact.end <= filing.filed);
        if (concept.kind === 'duration') { assert.ok(fact.start <= fact.end); assert.ok(fact.days >= 1); } else assert.equal(fact.start, undefined);
      }
    }
  }
  // Filed order, newest first; the latest 10-K is Apple's FY2025 annual report.
  const filed = document.filings.map(f => f.filed);
  assert.deepEqual(filed, [...filed].sort().reverse());
  const tenK = document.filings.filter(f => f.form === '10-K');
  assert.ok(tenK.length >= 5);
  assert.ok(tenK[0].concepts.some(c => c.tag === 'Assets'));
  assert.ok(tenK[0].concepts.some(c => c.facts.some(f => f.days && f.days >= 300 && f.days <= 400)), 'a 10-K carries an annual duration');
  assert.ok(document.filings.some(f => f.form === '10-Q' && ['Q1', 'Q2', 'Q3'].includes(f.fiscal_period)));
  // Selector agreement: every concept on a filing page is a published concept, and
  // a value the selector chose for a period appears on the filing it came from.
  const definitions = conceptDefinitions('extended-v23');
  for (const filing of document.filings) for (const concept of filing.concepts) assert.ok(Object.hasOwn(definitions, concept.tag));
  const selected = companyReference(raw, { fetchedAt: record.fetched_at, expectedCik: record.cik, selectionPolicy: 'extended-v23' });
  const byAccession = new Map(document.filings.map(f => [f.accession, f]));
  let checked = 0;
  for (const concept of selected.concepts) for (const row of concept.observations) {
    const filing = byAccession.get(row.accn);
    if (!filing) continue; // thin or withheld filings carry no page
    const page = filing.concepts.find(c => c.tag === concept.tag);
    assert.ok(page && page.facts.some(f => f.end === row.end && (f.start ?? undefined) === (row.start ?? undefined) && f.val === row.val && f.unit === row.unit), `${concept.tag} ${row.accn} ${row.end} missing from its filing page`);
    checked++;
  }
  assert.ok(checked > 100);
  assert.equal(filingsHash(document), filingsHash(companyFilings(raw, { fetchedAt: record.fetched_at, expectedCik: record.cik })));
  assert.equal(filingPath(record.cik, tenK[0].accession), `/companies/${record.cik}/filings/${tenK[0].accession}`);
  assert.equal(filingsIndexPath(record.cik), `/companies/${record.cik}/filings`);
  assert.equal(secFilingIndexUrl('0000320193', '0000320193-25-000079'), 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/');
});

function synthetic({ rows, extraConcepts = [] }) {
  const facts = {};
  const add = (tag, unit, row) => { facts[tag] ??= { units: {} }; facts[tag].units[unit] ??= []; facts[tag].units[unit].push(row); };
  for (const [tag, unit, row] of rows) add(tag, unit, row);
  for (const tag of extraConcepts) for (let i = 0; i < 3; i++) add(tag, 'USD', { end: `202${i}-12-31`, val: 100 + i, accn: '0000000001-24-000001', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-03-01', start: `202${i}-01-01` });
  return { cik: 1, entityName: 'Synthetic Co', facts: { 'us-gaap': facts } };
}
const instantTags = ['Assets', 'Liabilities', 'StockholdersEquity', 'CashAndCashEquivalentsAtCarryingValue', 'AssetsCurrent', 'LiabilitiesCurrent', 'AccountsPayableCurrent', 'Goodwill'];
const record = { cik: '0000000001', editorial_exclusions: [] };
const definitions = conceptDefinitions('extended-v23');
const instantRows = (accn, extra = {}) => instantTags.map(tag => [tag, 'USD', { end: '2023-12-31', val: 10, accn, fy: 2023, fp: 'FY', form: '10-K', filed: '2024-03-01', ...extra }]);

test('a filing needs at least eight published concepts; thinner filings are counted, not built', () => {
  const eight = filingsFromSource(synthetic({ rows: instantRows('0000000001-24-000001') }), record, definitions, '2026-09-19');
  assert.equal(eight.filings.length, 1); assert.equal(eight.filings[0].concept_count, 8); assert.equal(eight.summary.thin_filings, 0);
  const seven = filingsFromSource(synthetic({ rows: instantRows('0000000001-24-000001').slice(0, 7) }), record, definitions, '2026-09-19');
  assert.equal(seven.filings.length, 0); assert.equal(seven.summary.thin_filings, 1); assert.equal(seven.summary.accessions_seen, 1);
});

test('conflicting or inconsistent filings are withheld with a reason; identical duplicates are deduplicated', () => {
  const conflicting = synthetic({ rows: [...instantRows('0000000001-24-000001'), ['Assets', 'USD', { end: '2023-12-31', val: 11, accn: '0000000001-24-000001', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-03-01' }]] });
  const out = filingsFromSource(conflicting, record, definitions, '2026-09-19');
  assert.equal(out.filings.length, 0); assert.deepEqual(out.withheld.map(w => w.reason), ['CONFLICTING_FACTS']);
  const duplicate = synthetic({ rows: [...instantRows('0000000001-24-000001'), ['Assets', 'USD', { end: '2023-12-31', val: 10, accn: '0000000001-24-000001', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-03-01' }]] });
  const deduped = filingsFromSource(duplicate, record, definitions, '2026-09-19');
  assert.equal(deduped.filings.length, 1); assert.equal(deduped.filings[0].fact_count, 8); assert.equal(deduped.summary.diagnostics.duplicate_fact, 1);
  const inconsistent = synthetic({ rows: [...instantRows('0000000001-24-000001'), ['Goodwill', 'USD', { end: '2022-12-31', val: 9, accn: '0000000001-24-000001', fy: 2023, fp: 'FY', form: '10-K/A', filed: '2024-03-01' }]] });
  const held = filingsFromSource(inconsistent, record, definitions, '2026-09-19');
  assert.deepEqual(held.withheld.map(w => w.reason), ['INCONSISTENT_FILING_METADATA']);
});

test('editorial holds from the selector record are honoured on filing pages', () => {
  const source = synthetic({ rows: [...instantRows('0000000001-24-000001'), ['Revenues', 'USD', { start: '2023-01-01', end: '2023-12-31', val: 500, accn: '0000000001-24-000001', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-03-01' }], ['Revenues', 'USD', { start: '2022-01-01', end: '2022-12-31', val: 400, accn: '0000000001-24-000001', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-03-01' }]] });
  const open = filingsFromSource(source, record, definitions, '2026-09-19');
  assert.equal(open.filings[0].concepts.find(c => c.tag === 'Revenues').facts.length, 2);
  const scopeHeld = filingsFromSource(source, { ...record, editorial_exclusions: [{ tag: 'Revenues', reason: 'intersegment', filing_url: 'x' }] }, definitions, '2026-09-19');
  assert.ok(!scopeHeld.filings[0].concepts.some(c => c.tag === 'Revenues')); assert.equal(scopeHeld.summary.diagnostics.scope_held, 1);
  const rowHeld = filingsFromSource(source, { ...record, editorial_exclusions: [{ tag: 'Revenues', observation: { start: '2022-01-01', end: '2022-12-31', val: 400 }, reason: 'restated', filing_url: 'x' }] }, definitions, '2026-09-19');
  assert.deepEqual(rowHeld.filings[0].concepts.find(c => c.tag === 'Revenues').facts.map(f => f.val), [500]); assert.equal(rowHeld.summary.diagnostics.observation_held, 1);
});

test('only accepted forms, compatible units, valid and non-future rows reach a filing', () => {
  const rows = [...instantRows('0000000001-24-000001'),
    ['Assets', 'USD', { end: '2023-06-30', val: 1, accn: '0000000001-23-000009', fy: 2023, fp: 'Q2', form: '8-K', filed: '2023-08-01' }],
    ['Assets', 'EUR', { end: '2023-12-31', val: 1, accn: '0000000001-24-000001', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-03-01' }],
    ['Assets', 'shares', { end: '2023-12-31', val: 1, accn: '0000000001-24-000001', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-03-01' }],
    ['Assets', 'USD', { end: '2027-12-31', val: 1, accn: '0000000001-24-000001', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-03-01' }],
    ['Assets', 'USD', { end: '2023-12-31', val: 'x', accn: '0000000001-24-000001', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-03-01' }]];
  const out = filingsFromSource(synthetic({ rows }), record, definitions, '2026-09-19');
  assert.equal(out.filings.length, 1); assert.equal(out.summary.accessions_seen, 1);
  const assets = out.filings[0].concepts.find(c => c.tag === 'Assets');
  assert.deepEqual(assets.facts.map(f => [f.unit, f.end]), [['EUR', '2023-12-31'], ['USD', '2023-12-31']]);
  assert.equal(out.summary.diagnostics.other_form, 1); assert.equal(out.summary.diagnostics.incompatible_unit, 1);
  assert.equal(out.summary.diagnostics.invalid_observation, 2);
});

test('companies the selector rejects have no filings, and the concept universe matches the policy', () => {
  assert.throws(() => companyFilings(JSON.stringify({ cik: 1, entityName: 'Thin', facts: {} }), { fetchedAt: '2026-09-19T00:00:00Z', expectedCik: '0000000001' }), /Insufficient/);
  assert.equal(Object.keys(conceptDefinitions('extended-v23')).length, Object.keys(CONCEPTS).length + Object.keys(EXTENDED_CONCEPTS).length + Object.keys(EXPANDED_CONCEPTS_V23).length);
  assert.equal(Object.keys(conceptDefinitions('extended-v22')).length, Object.keys(CONCEPTS).length + Object.keys(EXTENDED_CONCEPTS).length);
  assert.throws(() => conceptDefinitions('extended-v3'), /extended-v22 and extended-v23 only/);
});
