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
