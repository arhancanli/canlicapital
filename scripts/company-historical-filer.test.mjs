import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { createCompanyCatalog } from '../api/_lib/company-catalog.js';
import { historicalCutoff, historicalFiler, latestFiling } from './lib/company-coverage.mjs';
import { renderCompanyPages } from './lib/company-page-renderer.mjs';
import { renderFilingsIndexPage } from './lib/company-filing-page-renderer.mjs';
import { renderCompanyDirectory } from './lib/company-directory.mjs';
import { buildCompanyCatalog } from './lib/build-company-catalog.mjs';
import { companyFilings } from './lib/company-filings.mjs';

const pilot = cik => JSON.parse(readFileSync(new URL(`../public/company-data/${cik}.json`, import.meta.url)));
// A historical fixture: the same pilot record captured as if six years later, so every
// filing date sits more than two years before capture. Nothing else changes.
const later = record => ({ ...record, fetched_at: '2032-09-19T10:53:41.999Z', content_updated_at: undefined });

test('a company whose record ended more than two years before capture is a historical filer; an active one is not', () => {
  const record = pilot('0000029534');
  const latest = latestFiling(record);
  assert.match(latest.filed, /^\d{4}-\d{2}-\d{2}$/); assert.ok(latest.form);
  assert.equal(latest.filed, record.concepts.flatMap(c => c.observations.map(o => o.filed)).sort().at(-1));
  assert.equal(historicalFiler(record), false);
  assert.equal(historicalFiler(later(record)), true);
  assert.equal(historicalCutoff('2026-09-19T10:53:41.999Z'), '2024-09-19');
  assert.equal(latestFiling({ concepts: [] }), null);
  assert.throws(() => historicalCutoff('not a date'), /capture date/);
});

test('the overview and the filing index state the last filing at company level only for a historical filer', () => {
  const record = pilot('0000029534');
  const active = renderCompanyPages({ ...record, source_snapshot: `/company-data/sources/${record.source_sha256}.json.gz` }, { target: 'overview' })[0].html;
  assert.ok(!active.includes('id="historical-filer"'));
  const historical = renderCompanyPages({ ...later(record), source_snapshot: `/company-data/sources/${record.source_sha256}.json.gz` }, { target: 'overview' })[0].html;
  const latest = latestFiling(record);
  assert.ok(historical.includes(`<h2 id="historical-filer">Filing record ends ${latest.filed}</h2>`));
  assert.ok(historical.includes(`a ${latest.form} filed ${latest.filed}`) && historical.includes('captured on 2032-09-19') && historical.includes('nothing on this page describes its current status'));
  assert.ok(historical.indexOf('id="historical-filer"') < historical.indexOf('Reported financial histories'), 'the notice opens the page');
  // History pages are unchanged by the company-level rule (they carry their own coverage note).
  const history = renderCompanyPages({ ...later(record), source_snapshot: `/company-data/sources/${record.source_sha256}.json.gz` }, { target: record.concepts[0].tag })[0].html;
  assert.ok(!history.includes('id="historical-filer"'));
  // Filing index.
  const raw = gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))).toString();
  const document = companyFilings(raw, { fetchedAt: record.fetched_at, expectedCik: record.cik });
  assert.ok(!renderFilingsIndexPage(document).html.includes('id="historical-filer"'));
  const laterDocument = { ...document, fetched_at: '2032-09-19T10:53:41.999Z' };
  const index = renderFilingsIndexPage(laterDocument).html;
  assert.ok(index.includes(`Filing record ends ${document.filings[0].filed}`) && index.includes(`a ${document.filings[0].form} filed ${document.filings[0].filed}`));
});

test('the catalog marks a historical filer in its directory entry and the directory shows the last filing date', async t => {
  const dir = mkdtempSync(resolve(tmpdir(), 'canli-historical-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const active = pilot('0000029534'), historical = later(pilot('0000320193'));
  const manifest = buildCompanyCatalog([active, historical], dir);
  const catalog = createCompanyCatalog({ rootHash: manifest.root_hash, readObject: hash => readFileSync(resolve(dir, `objects/${hash}.json`)) });
  const { companies } = await catalog.directoryPage(1);
  assert.deepEqual(companies.map(c => c.cik), [active.cik, historical.cik].sort());
  const activeEntry = companies.find(c => c.cik === active.cik), historicalEntry = companies.find(c => c.cik === historical.cik);
  assert.deepEqual(Object.keys(activeEntry).sort(), ['cik', 'name']);
  assert.equal(historicalEntry.historical, true); assert.equal(historicalEntry.last_filed, latestFiling(historical).filed);
  const html = renderCompanyDirectory({ page: 1, pages: 1, total: 2, companies }).html;
  assert.ok(html.includes(`<span>filings to ${historicalEntry.last_filed}</span>`));
  assert.equal((html.match(/filings to /g) ?? []).length, 1);
  // The same records still render identically for the active company.
  assert.deepEqual(await catalog.getCompany(active.cik), active);
});
