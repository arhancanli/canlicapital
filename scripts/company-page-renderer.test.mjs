import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { renderCompanyPages } from './lib/company-page-renderer.mjs';
import { FILING_NOTES, companyFilingNotes } from './lib/company-filing-notes.mjs';
import { gunzipSync } from 'node:zlib';
import { companyReference, verifyCompanyReference } from './lib/company-reference.mjs';
import { buildCompanyAssets, applyCompanyAssets } from './lib/company-assets.mjs';
import { createCompanyHtmlHandler } from '../api/_lib/company-html.js';
const company = JSON.parse(readFileSync(new URL('../public/company-data/0000320193.json', import.meta.url)));
const source = readFileSync(new URL('../companies/0000320193/Assets.html', import.meta.url), 'utf8');
const assets = buildCompanyAssets(source, '<script type="module" src="/assets/company.js"></script><link rel="stylesheet" href="/assets/company.css">');

test('combined presentation and ordinary-share notes preserve scale, currency and limits', () => {
  for (const [fixture, cik, phrase, value] of [
    ['kronos', '0001257640', /does not establish why the measures match/, 115000000],
    ['the9', '0001296774', /per ordinary share, not per ADS/, 2273782000],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value));
    if (fixture === 'the9') {
      const eps = record.concepts.find(c => c.tag === tags[0]).observations;
      assert.ok(eps.some(r => r.end === '2023-12-31' && r.unit === 'CNY/shares' && r.val === 0.02));
      assert.ok(eps.some(r => r.end === '2025-12-31' && r.unit === 'USD/shares' && r.val === -0.03));
      assert.match(renderCompanyPages(record, { target: tags[0] })[0].html, /300 Class A ordinary shares per ADS/);
    }
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('preferred-dividend and current-period loss notes preserve historical currency holds', () => {
  for (const [fixture, cik, phrase, value] of [
    ['precigen', '0001356090', /non-cash deemed dividend/, 312980562],
    ['varonis-loss', '0001361113', /does not reinstate the separately withheld historical/, 114413076],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value));
    if (fixture === 'varonis-loss') {
      for (const tag of tags.slice(0, 2)) assert.ok(record.concepts.find(c => c.tag === tag).observations.every(r => r.unit !== 'AFN/shares'));
      assert.match(renderCompanyPages(record, { target: 'overview' })[0].html, /AFN/);
    }
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('net-loss and successor context retains operating company periods and share scale', () => {
  for (const [fixture, cik, phrase, value] of [
    ['anaptysbio', '0001370053', /not operating income or comprehensive loss/, 28758000],
    ['irhythm', '0001388658', /successor issuer after the January 2026/, 32004000],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('special warrant inclusion and period-end exclusions retain reported denominators', () => {
  for (const [fixture, cik, phrase, value] of [
    ['american-well', '0001393584', /period-end amounts, not additional weighted-average/, 16047452],
    ['iheartmedia', '0001400891', /Special Warrants are already included in both basic and diluted/, 154295000],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('dated no-dilution statement and pre-funded warrants retain review boundaries', () => {
  for (const [fixture, cik, phrase, value] of [
    ['apple-hospitality', '0001418121', /does not extend that cause to 2023 or 2024/, 237789000],
    ['kura-oncology', '0001422143', /pre-funded warrants must not be added again/, 87676000],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Blink retains revised EPS and out-of-money exclusions', () => {
  for (const [fixture, cik, phrase, value] of [
    ['blink', '0001429764', /revised loss of \$2.00 per share/, 109107002],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v18' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value));
    for (const tag of tags.slice(0, 2)) assert.equal(record.concepts.find(c => c.tag === tag).observations.find(r => r.end === '2024-12-31').val, -2);
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('preferred dividends and rounded note counts preserve the selected full denominator', () => {
  for (const [fixture, cik, phrase, value] of [
    ['safe-bulkers', '0001434754', /after preferred dividends as its EPS numerator/, 103038189],
    ['ardelyx', '0001437402', /rounded note counts do not replace the full statement values/, 241033750],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v18' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('January fiscal dates and two-class allocation retain selected periods and combined counts', () => {
  for (const [fixture, cik, phrase, value] of [
    ['mongodb', '0001441816', /January fiscal-year ends/, 81246520],
    ['workiva', '0001445305', /selected statement denominator combines both classes/, 56272517],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v18' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === (fixture === 'mongodb' ? '2026-01-31' : '2025-12-31') && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('loss dilution and converted share-class labels retain source counts', () => {
  for (const [fixture, cik, phrase, value] of [
    ['si-bone', '0001459839', /Comprehensive loss is a separate measure/, 42959856],
    ['backblaze', '0001462056', /converted one-for-one into Class A on July 6, 2023/, 56209667],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v18' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('legacy annual context preserves historical issuer and excludes transition-period substitution', () => {
  for (const [fixture, cik, phrase, value] of [
    ['china-bilingual', '0001470129', /separate eight-month 2011 column is not selected/, 30094205],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v18' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2012-08-31' && r.val === value));
    const annual = record.concepts.find(c => c.tag === tags[0]).observations.find(r => r.end === '2011-08-31');
    assert.equal(annual.start, '2010-09-01'); assert.equal(annual.val, 0.45);
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('participating shares and vested unsettled RSUs retain basic denominator treatment', () => {
  for (const [fixture, cik, phrase, value] of [
    ['kodiak', '0001468748', /comprehensive-loss figure is a separate measure/, 53208311],
    ['cloudflare', '0001477333', /include vested, unsettled RSUs/, 348421000],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v18' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Teladoc and Asana retain share units and distinct fiscal year ends', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['teladoc', '0001477449', /outstanding award counts are not additional weighted-average shares/, 176221530, '2025-12-31'],
    ['asana', '0001477720', /January fiscal dates and original counts are retained/, 236823000, '2026-01-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v18' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Adaptive and KBS preserve distinct reasons for equal basic and diluted EPS', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['adaptive-biotechnologies', '0001478320', /after noncontrolling-interest allocation/, 151721939, '2025-12-31'],
    ['kbs-reit-iii', '0001482430', /no potentially dilutive securities outstanding during the presented years/, 148516246, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v18' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('loss-context notes preserve noncontrolling allocation and explicit statement share units', () => {
  for (const [fixture, cik, phrase, value] of [
    ['roblox', '0001315098', /after noncontrolling interests as its EPS numerator/, 689612000],
    ['atyr-pharma', '0001339970', /heading inconsistency is retained here/, 92985359],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('allocation and unit context preserves preferred conversion, LLC units and unvested-share treatment', () => {
  for (const [fixture, cik, phrase, value] of [
    ['macrogenics', '0001125345', /excludes stock options and restricted stock units/, 63155096],
    ['standard-biotools', '0001162194', /induced-conversion adjustment for Series B preferred stock/, 381623000],
    ['south-dakota-soybean', '0001163609', /earnings per LLC capital unit/, 30411500],
    ['neuronetics', '0001227636', /unvested restricted stock is excluded from basic weighted-average shares/, 65951000],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('loss-allocation context preserves rounded zero and deferred-compensation inclusion', () => {
  for (const [fixture, cik, phrase, value] of [
    ['compx', '0001049606', /does not establish why the measures match/, 12321000],
    ['plug-power', '0001093691', /after noncontrolling interests/, 1146691189],
    ['agenus', '0001098972', /zero EPS does not mean break-even/, 29734000],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value));
    if (fixture === 'agenus') {
      assert.ok(record.concepts.find(c => c.tag === tags[0]).observations.some(r => r.end === '2025-12-31' && r.val === 0));
      assert.match(renderCompanyPages(record, { target: tags[0] })[0].html, /directors’ deferred-compensation plan/);
    }
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('basic denominator notes retain warrant inclusion and scale distinctions', () => {
  for (const [fixture, cik, phrase, value] of [
    ['freddie', '0001026214', /includes shares associated with Treasury/, 3234000000],
    ['franklin-street', '0001031316', /accompanying prose gives the full share counts/, 103640000],
    ['eloxx', '0001035354', /include both common shares and pre-funded warrants/, 12347495],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('issuer-specific context preserves split, dividend, narrative limitation and partnership conventions', () => {
  for (const [fixture, cik, phrase, value] of [
    ['fuelcell', '0000886128', /one-for-thirty reverse split/, 25743252],
    ['achieve', '0000949858', /inconsistent million-shares wording/, 43594652],
    ['southern-copper', '0001001838', /share tags encode scale six/, 826600000],
    ['genesis', '0001022321', /common partnership units, not corporate common stock/, 122464000],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end.startsWith('2025-') && r.val === value && r.unit === 'shares'));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('loss-context batch preserves distinct scales and excludes potential-share additions', () => {
  for (const [fixture, cik, value] of [['axogen', '0000805928', 46050266], ['heron', '0000818033', 166707000], ['westwater', '0000839470', 86023787]]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, /anti-dilutive/);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === '2025-12-31' && r.val === value && r.unit === 'shares'));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Cedar vested-share context preserves facts and distinguishes EPS from FFO', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/cedar-reviewed-source.json.gz', import.meta.url)));
  const record = companyReference(raw, { expectedCik: '0000761648', fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
  verifyCompanyReference(record, raw);
  const original = structuredClone(record.concepts);
  record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
  const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
  for (const target of [...tags, 'overview']) {
    const html = renderCompanyPages(record, { target })[0].html;
    assert.match(html, /participating-share adjustments/);
    assert.match(html, /FFO diluted share count includes items excluded from EPS/);
    assert.match(html, /cdr-20221231.htm/);
  }
  assert.deepEqual(record.concepts, original);
  const changed = structuredClone(record);
  changed.concepts.find(c => c.tag === tags[0]).observations.find(r => r.end === '2020-12-31').val = 0;
  const oldChangedNotes = companyFilingNotes(changed, tags[0]);
  assert.equal(oldChangedNotes.some(n => n.filing_url.includes('cdr-20221231')), false);
  assert.equal(oldChangedNotes.length, 1);
  assert.match(oldChangedNotes[0].text, /does not establish a reason/);
  const newerChanged = structuredClone(record);
  newerChanged.concepts.find(c => c.tag === tags[0]).observations.find(r => r.end === '2025-12-31').val = 0;
  const newerChangedNotes = companyFilingNotes(newerChanged, tags[0]);
  assert.equal(newerChangedNotes.length, 1);
  assert.match(newerChangedNotes[0].filing_url, /cdr-20221231/);
});

test('loss-share conventions preserve positive CAD loss magnitudes and historical instrument disclosure', () => {
  for (const [fixture, cik, phrase] of [
    ['blue-dolphin', '0000793306', /historical, not a claim about securities outstanding today/],
    ['nexmetals', '0000795800', /reported loss magnitudes, not profits/],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.deepEqual(record.concepts, original);
    if (fixture === 'nexmetals') {
      assert.ok(record.concepts.find(c => c.tag === tags[0]).observations.some(r => r.end === '2025-12-31' && r.val === 2.86 && r.unit === 'CAD/shares'));
      assert.match(renderCompanyPages(record, { target: tags[0] })[0].html, /twenty-for-one share consolidation/);
    }
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('combined presentations retain restatement and scale context without asserting dilution cause', () => {
  for (const [fixture, cik, phrase, expectedValue] of [
    ['nli', '0000072162', /does not establish why the measures match/, 48857000],
    ['weis', '0000105418', /EPS figures are explicitly restated/, 25685425],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) {
      const html = renderCompanyPages(record, { target })[0].html;
      assert.match(html, phrase);
      assert.match(html, /potentially dilutive securities exist/);
    }
    assert.deepEqual(record.concepts, original);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.val === expectedValue && r.unit === 'shares'));
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Celldex loss-period context preserves correctly scaled source observations', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/celldex-reviewed-source.json.gz', import.meta.url)));
  const record = companyReference(raw, { expectedCik: '0000744218', fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v17' });
  verifyCompanyReference(record, raw);
  const original = structuredClone(record.concepts);
  record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
  const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
  for (const target of [...tags, 'overview']) {
    const html = renderCompanyPages(record, { target })[0].html;
    assert.match(html, /Basic weighted-average shares exclude issued restricted stock/);
    assert.match(html, /Per-share amounts are not scaled by thousands/);
    assert.match(html, /cldx-20251231x10k.htm/);
  }
  assert.deepEqual(record.concepts, original);
  const shares = record.concepts.find(c => c.tag === tags[2]).observations;
  assert.ok(shares.some(r => r.end === '2025-12-31' && r.val === 66422000 && r.unit === 'shares'));
  const changed = structuredClone(record);
  changed.concepts.find(c => c.tag === tags[2]).observations.find(r => r.end === '2025-12-31').val = 66422;
  assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
});

test('111 ordinary-share histories explain dilution, scale and ADS distinction without changing facts', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/111-reviewed-source.json.gz', import.meta.url)));
  const record = companyReference(raw, { expectedCik: '0001738906', fetchedAt: '2026-09-19T11:20:52.392Z', selectionPolicy: 'extended-v16' });
  verifyCompanyReference(record, raw);
  const original = structuredClone(record.concepts);
  record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
  const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
  for (const target of [...tags, 'overview']) {
    const html = renderCompanyPages(record, { target })[0].html;
    assert.match(html, /anti-dilutive effect/);
    assert.match(html, /ordinary-share measures, not ADS measures/);
    assert.match(html, /convenience translation/);
    assert.match(html, /yi-20251231x20f.htm/);
  }
  assert.deepEqual(record.concepts, original);
  const eps = record.concepts.find(c => c.tag === 'EarningsPerShareBasic').observations;
  assert.ok(eps.some(r => r.end === '2025-12-31' && r.unit === 'CNY/shares' && r.val === -0.38));
  assert.ok(eps.some(r => r.end === '2025-12-31' && r.unit === 'USD/shares' && r.val === -0.05));
  assert.equal(companyFilingNotes(record, 'Assets').length, 0);
});

test('predecessor opening balance keeps its original unit and date with precise context', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/sofi-predecessor-reviewed-source.json.gz', import.meta.url)));
  const record = companyReference(raw, { expectedCik: '0001818874', fetchedAt: '2026-09-19T11:21:38.728Z', selectionPolicy: 'extended-v15' });
  verifyCompanyReference(record, raw);
  const original = structuredClone(record);
  const rows = record.concepts.find(c => c.tag === 'StockholdersEquity').observations;
  assert.equal(rows.filter(r => r.unit === 'USN').length, 1);
  assert.ok(rows.some(r => r.unit === 'USN' && r.val === 0 && r.end === '2020-07-09'));
  assert.ok(rows.some(r => r.unit === 'USD'));
  record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
  for (const target of ['StockholdersEquity', 'overview']) {
    const html = renderCompanyPages(record, { target })[0].html;
    assert.match(html, /Social Capital Hedosophia Holdings Corp. V/);
    assert.match(html, /end of July 9 is the same boundary as the start of July 10/);
    assert.match(html, /fund code distinct from USD/);
    assert.match(html, /does not explain that unit choice/);
    assert.match(html, /tm2113577d1_10ka.htm/);
  }
  assert.deepEqual(record.concepts, original.concepts);
  assert.equal(companyFilingNotes(record, 'Revenues').length, 0);
});

test('TECHCOM retains reported totals and renders the precision caveat against actual captured facts', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/techcom-reviewed-source.json.gz', import.meta.url)));
  const record = companyReference(raw, { expectedCik: '0001481443', fetchedAt: '2026-09-20T09:08:57.187Z', selectionPolicy: 'extended-v13' });
  verifyCompanyReference(record, raw);
  record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
  for (const tag of ['Liabilities', 'LiabilitiesCurrent']) {
    const row = record.concepts.find(c => c.tag === tag).observations.find(r => r.end === '2025-12-31');
    assert.equal(row.val, 308851);
    const html = renderCompanyPages(record, { target: tag })[0].html;
    assert.match(html, /sum to \$308,852/);
    assert.match(html, /does not establish their cause/);
    assert.match(html, /techcom_i10k-123125.htm/);
  }
  const overview = renderCompanyPages(record, { target: 'overview' })[0].html;
  assert.equal(overview.split('sum to $308,852').length - 1, 1);
  assert.equal(companyFilingNotes(record, 'Revenues').length, 0);
});

test('filing context requires the reviewed issuer, snapshot and all reviewed observations', () => {
  for (const note of FILING_NOTES) {
    const record = { cik: note.cik, source_sha256: note.source_sha256,
      concepts: note.observations.map(row => ({ tag: row.tag, observations: [{ ...row }] })) };
    assert.equal(companyFilingNotes(record, note.tags[0]).length, 1);
    assert.equal(companyFilingNotes({ ...record, cik: '9999999999' }, note.tags[0]).length, 0);
    assert.equal(companyFilingNotes({ ...record, source_sha256: '0'.repeat(64) }, note.tags[0]).length, 0);
    assert.equal(companyFilingNotes(record, 'Assets').length, 0);
    for (const key of ['start', 'end', 'unit', 'val', 'accn']) {
      const changed = structuredClone(record);
      changed.concepts[0].observations[0][key] = key === 'val' ? -1 : 'changed';
      assert.equal(companyFilingNotes(changed, note.tags[0]).length, 0);
    }
  }
});

test('reviewed filing context renders a source link and disappears when evidence changes', () => {
  const note = FILING_NOTES[0], record = structuredClone(company);
  Object.assign(record, { cik: note.cik, source_sha256: note.source_sha256,
    source_url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${note.cik}.json`,
    source_snapshot: `/company-data/sources/${note.source_sha256}.json.gz` });
  record.concepts = record.concepts.filter(c => !note.tags.includes(c.tag)).concat(note.observations.map(row => ({
    tag: row.tag, label: row.tag, kind: 'duration', meaning: 'Test measure',
    observations: [{ ...row, filed: '2026-02-03', form: '10-K' }],
  })));
  const html = renderCompanyPages(record, { target: note.tags[0] })[0].html;
  assert.match(html, /id="filing-context"/);
  assert.ok(html.includes(`href="${note.filing_url}"`));
  record.source_sha256 = '0'.repeat(64);
  record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
  assert.ok(!renderCompanyPages(record, { target: note.tags[0] })[0].html.includes('id="filing-context"'));
});

test('shared renderer preserves every current pilot company page byte-for-byte', () => {
  for (const name of readdirSync(new URL('../public/company-data/', import.meta.url)).filter(name => /^\d{10}\.json$/.test(name))) {
    const record = JSON.parse(readFileSync(new URL('../public/company-data/' + name, import.meta.url)));
    for (const page of renderCompanyPages(record)) assert.equal(page.html, readFileSync(new URL('../' + page.path.slice(1) + '.html', import.meta.url), 'utf8'));
  }
});
test('one history keeps its coverage, source download, canonical and developer entry points', () => {
  const [page] = renderCompanyPages(company, { target: 'Revenues' });
  assert.match(page.html, /ends more than two years before capture/);
  assert.ok(page.html.includes(company.source_snapshot));
  assert.ok(page.html.includes('href="https://canlicapital.com/companies/0000320193/Revenues"'));
  assert.match(page.html, /developers#ai-assistant/);
  assert.deepEqual(renderCompanyPages(company, { target: 'MadeUpKeyword' }), []);
});
test('asset bridge removes source-only imports and rejects stale bundles', () => {
  const html = applyCompanyAssets(renderCompanyPages(company, { target: 'overview' })[0].html, assets);
  assert.match(html, /src="\/assets\/company.js"/); assert.ok(!html.includes('src="/js/'));
  assert.throws(() => applyCompanyAssets(source + '<script type="module" src="/js/new.js"></script>', assets), /resource contract/);
});
test('issuer text cannot escape HTML or JSON-LD', () => {
  const record = { ...company, name: '</script><script>alert(1)</script>' };
  const html = renderCompanyPages(record, { target: 'overview' })[0].html;
  assert.ok(!html.includes('<script>alert(1)</script>'));
  const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.equal(data[0].creator.name, record.name);
});
async function call(handler, query) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
  await handler({ method: 'GET', query, headers: {} }, res); return res;
}
test('HTML serving distinguishes missing content from outages and stays noindex while staged', async () => {
  const handler = createCompanyHtmlHandler({ catalog: { getCompany: async cik => cik === company.cik ? company : null }, assets });
  const ok = await call(handler, { cik: company.cik, concept: 'Revenues' });
  assert.equal(ok.statusCode, 200); assert.equal(ok.headers['X-Robots-Tag'], 'noindex');
  assert.equal((await call(handler, { cik: company.cik, concept: 'NotReal' })).statusCode, 404);
  for (const concept of ['all', 'overview']) assert.equal((await call(handler, { cik: company.cik, concept })).statusCode, 404);
  assert.equal((await call(handler, { cik: '9999999999' })).statusCode, 404);
  const down = createCompanyHtmlHandler({ catalog: { getCompany: async () => { throw new Error('storage unavailable'); } }, assets });
  assert.equal((await call(down, { cik: company.cik })).statusCode, 503);
});

test('matching numbers retain distinct definitions and expose comparison links', () => {
  const record = structuredClone(company);
  const [first, second] = record.concepts;
  second.kind = first.kind;
  second.observations = first.observations.map(row => ({ ...row, filed: '2026-01-01' })).reverse();
  const html = renderCompanyPages(record, { target: first.tag })[0].html;
  assert.match(html, /This selected numerical history matches/);
  assert.ok(html.includes(`href="/companies/${record.cik}/${second.tag}"`));
  assert.match(html, /accounting definitions remain distinct/);
  assert.match(html, /filing dates and accessions may differ/);
  second.observations[0].unit = 'EUR';
  assert.ok(!renderCompanyPages(record, { target: first.tag })[0].html.includes('This selected numerical history matches'));
});

test('constant disclosures distinguish reported zeros, units and missing values', () => {
  const record = structuredClone(company);
  const concept = record.concepts[0];
  concept.observations = [2021, 2022, 2023].map(year => ({ ...concept.observations[0], end: `${year}-12-31`, unit: 'USD', val: 0 }));
  concept.observations.push({ ...concept.observations[0], unit: 'EUR', val: 5 });
  const html = renderCompanyPages(record, { target: concept.tag })[0].html;
  assert.match(html, /reported zeros, not values substituted for missing data/);
  assert.match(html, /USD<\/strong> history reports 0 at all 3 reporting ends/);
  assert.ok(!html.includes('EUR</strong> history reports'));
  concept.observations[0].val = 1;
  assert.ok(!renderCompanyPages(record, { target: concept.tag })[0].html.includes('reported zeros, not values substituted'));
});

test('overview explains an editorial scope exclusion and escapes its explanation', () => {
  const record = structuredClone(company);
  record.editorial_exclusions = [{ tag: 'Revenues', reason: 'Intersegment <sales>, not company-wide revenue', filing_url: 'https://www.sec.gov/Archives/example' }];
  const html = renderCompanyPages(record, { target: 'overview' })[0].html;
  assert.match(html, /id="editorial-scope"/);
  assert.match(html, /Intersegment &lt;sales&gt;/);
  assert.match(html, /Inspect the filing/);
});

test('Gladstone preserves preferred-stock numerator and limited dilution interpretation', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['gladstone-land', '0001495240', /not the cause of equal dilution measures/, 36506720, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('CIM and X4 preserve issuer identity and included pre-funded warrants', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['cim-real-estate-finance', '0001498547', /no potentially dilutive share equivalents/, 436824784, '2025-12-31'],
    ['x4-pharmaceuticals', '0001501697', /no second split adjustment/, 42292818, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Quanterix and Upland preserve scale and preferred-stock allocation', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['quanterix', '0001503274', /share counts in thousands with scale-three tags/, 42639000, '2025-12-31'],
    ['upland-software', '0001505155', /after preferred dividends and accretion/, 28615649, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Domo retains January fiscal dates and combined class denominator', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['domo', '0001505952', /individual class counts in the EPS note are components/, 40984000, '2026-01-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Phoenix preserves original filing mapping and ordinary-share currency context', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['phoenix', '0001509646', /without ADS conversion or currency relabeling/, 519227660, '2011-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Akebia and Fastly retain denominator methods and share scales', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['akebia', '0001517022', /counts before applying the treasury-stock method/, 257157782, '2025-12-31'],
    ['fastly', '0001517413', /if-converted method to convertible debt/, 146902000, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Inland and Alkami preserve restricted-share and convertible-note exclusions', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['inland-income', '0001528985', /7,820 in 2023, 9,717 in 2024 and 12,087 in 2025/, 36104556, '2025-12-31'],
    ['alkami', '0001529274', /in 2025, convertible notes/, 103895195, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Honest and Chemomab retain loss sign and ordinary-share context', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['honest-company', '0001530979', /separate 2023 comprehensive-loss figure/, 111209322, '2025-12-31'],
    ['chemomab', '0001534248', /positive loss amount/, 510227715, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Can-Fite and Nurix preserve split treatment and November fiscal dates', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['can-fite', '0001536196', /no second split adjustment or ADS conversion/, 1646208, '2025-12-31'],
    ['nurix', '0001549595', /included pre-funded warrants should not be added again/, 86666907, '2025-11-30'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('National Healthcare and TELA retain excluded and already-included share distinctions', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['national-healthcare', '0001561032', /not added to the selected statement denominator/, 28304000, '2025-12-31'],
    ['tela-bio', '0001561921', /they are not added again/, 46947932, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Compass and Snap preserve merger consideration and award forfeiture context', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['compass', '0001563190', /including 10.1 million minimum issuable shares/, 562153375, '2025-12-31'],
    ['snap', '0001564408', /forfeiture risk has not lapsed/, 1694598000, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Intapp and Evolus retain June fiscal dates and contingently issuable shares', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['intapp', '0001565687', /June 30, 2024, 2025 and 2026/, 79618000, '2026-06-30'],
    ['evolus', '0001570562', /already includes contingently issuable shares/, 64468913, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Guardant and C3.ai preserve note hedges and April fiscal class allocation', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['guardant-health', '0001576280', /hedges are not part of the notes themselves/, 125374000, '2025-12-31'],
    ['c3-ai', '0001577526', /April 30, 2024, 2025 and 2026/, 140513000, '2026-04-30'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Axsome and Twist retain three-year exclusions and repurchase adjustments', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['axsome', '0001579428', /three-year exclusion table supplies the 2023 context/, 49747178, '2025-12-31'],
    ['twist-bioscience', '0001581280', /basic denominator deducts shares subject to repurchase/, 59808000, '2025-09-30'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('SentinelOne and Hines retain loss participation and absent dilution context', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['sentinelone', '0001583708', /no contractual obligation to share losses/, 330111148, '2026-01-31'],
    ['hines-global-income', '0001585101', /no potentially dilutive common shares are outstanding/, 283490000, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('PROCEPT and Viridian retain loss measures and historical review scope', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['procept', '0001588978', /distinct from comprehensive loss/, 55544000, '2025-12-31'],
    ['viridian-2023', '0001590750', /does not establish the accounting treatment of later filings/, 44755475, '2023-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('American Strategic and 1stdibs retain split and exclusion context', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['american-strategic', '0001595527', /zero numerator adjustments for all three years/, 2546562, '2025-12-31'],
    ['1stdibs', '0001600641', /treasury-stock method for potential dilution/, 36096469, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v19' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Recursion retains exchangeable shares already included in its denominator', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['recursion', '0001601830', /should not be added again as potential dilution/, 447446109, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v20' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Latest Lifeward and Weave retain retrospective splits and period-end exclusions', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['lifeward', '0001607962', /does not resolve the separate currency conflicts/, 1160521, '2025-12-31'],
    ['weave', '0001609151', /outstanding securities at period-end/, 76306740, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v20' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Check-Cap and Tenable retain profitable-year and loss-period dilution context', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['check-cap', '0001610590', /instruments are out of the money/, 6232226, '2025-12-31'],
    ['tenable', '0001660280', /performance stock units/, 120124000, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v20' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('BGM and PRF retain auditor limits and distinct prefunded warrants', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['bgm', '0001779578', /did not audit the subsequent adjustment/, 113261317, '2025-09-30'],
    ['prf-technologies', '0001801834', /two warrant categories are not interchangeable/, 647973, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v20' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Emerson and Reliability retain absent instruments and limited zero-EPS presentation', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['emerson-radio', '0000032621', /no outstanding potentially dilutive instruments/, 21042652, '2026-03-31'],
    ['reliability', '0000034285', /do not mean the company broke even/, 300000000, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v20' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('Cedar retains positive common income and unestablished diluted treatment', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['cedar-2025', '0000761648', /positive common-shareholder income despite a consolidated net loss/, 13718169, '2025-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v20' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});

test('EPS-only context leaves Valhi, Iovance and Outset share holds intact', () => {
  for (const [fixture, cik, value] of [
    ['valhi', '0000059255', -2.02], ['iovance', '0001425205', -1.09], ['outset-medical', '0001484612', -5.37],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v20' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    for (const target of ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'overview']) {
      assert.match(renderCompanyPages(record, { target })[0].html, /share observations remain withheld/);
    }
    assert.ok(record.concepts.find(c => c.tag === 'EarningsPerShareBasic').observations.some(r => r.end === '2025-12-31' && r.val === value));
    assert.ok(record.editorial_exclusions.length >= 6);
    assert.equal(companyFilingNotes(record, 'WeightedAverageNumberOfSharesOutstandingBasic').length, 0);
    assert.deepEqual(record.concepts, original.concepts);
    assert.deepEqual(record.editorial_exclusions, original.editorial_exclusions);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, 'EarningsPerShareBasic').length, 0);
  }
});


test('historical ReWalk context preserves currency holds and independent newer split context', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/lifeward-reviewed-source.json.gz', import.meta.url)));
  const record = companyReference(raw, { expectedCik: '0001607962', fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v20' });
  verifyCompanyReference(record, raw);
  const original = structuredClone(record);
  record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
  const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
  for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, /six separate ILS-tagged EPS observations remain withheld/);
  assert.ok(record.concepts.find(c => c.tag === tags[0]).observations.some(r => r.end === '2021-12-31' && r.unit === 'USD/shares' && r.val === -0.27));
  assert.equal(record.editorial_exclusions.filter(r => JSON.stringify(r).includes('ILS/shares')).length, 6);
  assert.deepEqual(record.concepts, original.concepts);
  assert.deepEqual(record.editorial_exclusions, original.editorial_exclusions);
  const altered = structuredClone(record);
  altered.concepts.find(c => c.tag === tags[0]).observations.find(r => r.end === '2021-12-31' && r.unit === 'USD/shares').val = -99;
  const notes = companyFilingNotes(altered, tags[0]);
  assert.ok(notes.length > 0, 'independent newer filing context survives');
  assert.ok(!JSON.stringify(notes).includes('six separate ILS-tagged'));
  altered.source_sha256 = '0'.repeat(64);
  assert.equal(companyFilingNotes(altered, tags[0]).length, 0);
});


test('Siebert explains rounded EPS equality without releasing disputed diluted counts', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/editorial/siebert-reviewed-source.json.gz', import.meta.url)));
  const record = companyReference(raw, { expectedCik: '0000065596', fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v20' });
  verifyCompanyReference(record, raw);
  const original = structuredClone(record);
  record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
  for (const target of ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'overview']) {
    assert.match(renderCompanyPages(record, { target })[0].html, /Two diluted-share observations remain withheld/);
  }
  assert.equal(companyFilingNotes(record, 'WeightedAverageNumberOfDilutedSharesOutstanding').length, 0);
  assert.ok(record.editorial_exclusions.length >= 2);
  assert.deepEqual(record.concepts, original.concepts);
  assert.deepEqual(record.editorial_exclusions, original.editorial_exclusions);
  for (const [income, basic, diluted, expected] of [[13286000,39951510,40174680,0.33],[5121000,40362780,40677140,0.13]]) {
    assert.ok(diluted > basic);
    assert.equal(Number((income / basic).toFixed(2)), expected);
    assert.equal(Number((income / diluted).toFixed(2)), expected);
  }
  const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
  assert.equal(companyFilingNotes(changed, 'EarningsPerShareBasic').length, 0);
});


test('legacy Freddie and Rockwell context preserves warrant inclusion, scale and loss exclusions', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['freddie-2011', '0001026214', /must not be added again as dilution/, 3244896000, '2011-12-31'],
    ['rockwell-2017', '0001041024', /anti-dilutive during losses/, 51067412, '2017-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v20' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record.concepts);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});


test('INVO and Plastec retain disputed share holds and limited historical presentation', () => {
  for (const [fixture, cik, phrase, value, period] of [
    ['invo', '0001417926', /Both 2014 share counts remain withheld/, 107055085, '2013-12-31'],
    ['plastec', '0001433309', /presentation-only review/, 12938128, '2015-12-31'],
  ]) {
    const raw = gunzipSync(readFileSync(new URL(`./fixtures/editorial/${fixture}-reviewed-source.json.gz`, import.meta.url)));
    const record = companyReference(raw, { expectedCik: cik, fetchedAt: '2026-09-20T00:00:00Z', selectionPolicy: 'extended-v21' });
    verifyCompanyReference(record, raw);
    const original = structuredClone(record);
    record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
    const tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'];
    for (const target of [...tags, 'overview']) assert.match(renderCompanyPages(record, { target })[0].html, phrase);
    assert.ok(record.concepts.find(c => c.tag === tags[2]).observations.some(r => r.end === period && r.val === value));
    assert.deepEqual(record.concepts, original.concepts);
    assert.deepEqual(record.editorial_exclusions, original.editorial_exclusions);
    if (cik === '0001417926') assert.equal(record.editorial_exclusions.length, 2);
    const changed = structuredClone(record); changed.source_sha256 = '0'.repeat(64);
    assert.equal(companyFilingNotes(changed, tags[0]).length, 0);
  }
});
