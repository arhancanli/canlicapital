import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync, gzipSync } from 'node:zlib';
import { catalogHash, createCompanyCatalog, DEFAULT_LEAF } from '../api/_lib/company-catalog.js';
import { createHttpCatalogReader } from '../api/_lib/company-catalog-http.js';
import { FILINGS_LIMITS, createCompanyFilingsCatalog, decodeFilingsDocument } from '../api/_lib/company-filings-catalog.js';
import { buildCompanyCatalog } from './lib/build-company-catalog.mjs';
import { buildCompanyFilingsCatalog } from './lib/build-company-filings-catalog.mjs';
import { companyFilings } from './lib/company-filings.mjs';

const PILOTS = readdirSync(new URL('../public/company-data', import.meta.url)).filter(name => /^\d{10}\.json$/.test(name)).map(name => name.slice(0, 10)).sort();
function pilotDocument(cik) {
  const record = JSON.parse(readFileSync(new URL(`../public/company-data/${cik}.json`, import.meta.url)));
  const raw = gunzipSync(readFileSync(new URL(`../public/company-data/sources/${record.source_sha256}.json.gz`, import.meta.url))).toString();
  return { record, document: companyFilings(raw, { fetchedAt: record.fetched_at, expectedCik: record.cik }) };
}
function temp(t) { const dir = mkdtempSync(resolve(tmpdir(), 'canli-filings-catalog-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
const localReader = (dir, extension = '.json') => async (hash, limit) => { const bytes = readFileSync(resolve(dir, 'objects', hash + extension)); if (bytes.length > limit) throw new Error('over limit'); return bytes; };

test('the company catalog is byte-identical with the generalized reader defaults', async t => {
  const dir = temp(t);
  const records = PILOTS.map(cik => JSON.parse(readFileSync(new URL(`../public/company-data/${cik}.json`, import.meta.url))));
  const manifest = buildCompanyCatalog(records, dir);
  assert.equal(DEFAULT_LEAF.schema, 'canli.company-reference.v1');
  const catalog = createCompanyCatalog({ rootHash: manifest.root_hash, readObject: localReader(dir) });
  for (const record of records) assert.deepEqual(await catalog.getCompany(record.cik), record);
  assert.equal(await catalog.getCompany('9999999999'), null);
  assert.equal((await catalog.directoryPage(1)).total, records.length);
  assert.throws(() => createCompanyCatalog({ rootHash: manifest.root_hash, readObject: localReader(dir), leaf: { schema: 'x' } }), /leaf contract/);
});

test('a filings catalog stores one compressed document per company and reads it back through the runtime decoder', async t => {
  const dir = temp(t);
  const documents = PILOTS.map(cik => pilotDocument(cik).document);
  const manifest = buildCompanyFilingsCatalog(documents, dir);
  assert.equal(manifest.schema, 'canli.company-filings-catalog.v1');
  assert.equal(manifest.companies, documents.length);
  assert.equal(manifest.filings, documents.reduce((n, d) => n + d.filings.length, 0));
  assert.ok(manifest.object_bytes < manifest.inflated_bytes / 4, 'compression should be substantial');
  const objects = readdirSync(resolve(dir, 'objects'));
  assert.equal(objects.filter(name => name.endsWith('.json.gz')).length, documents.length);
  assert.ok(objects.some(name => name.endsWith('.json') && !name.endsWith('.json.gz')), 'index nodes are plain JSON');
  const catalog = createCompanyFilingsCatalog({ rootHash: manifest.root_hash, readObject: (hash, limit, kind) => localReader(dir, kind === 'leaf' ? '.json.gz' : '.json')(hash, limit) });
  for (const document of documents) {
    const read = await catalog.getFilings(document.cik);
    assert.deepEqual(read, document);
  }
  assert.equal(await catalog.getFilings('9999999999'), null);
  // Rebuilding is deterministic and reuses existing objects.
  const again = buildCompanyFilingsCatalog(documents, dir);
  assert.equal(again.root_hash, manifest.root_hash);
});

test('the filings decoder bounds inflation and rejects foreign or corrupt documents', () => {
  const { document } = pilotDocument(PILOTS[0]);
  const bytes = gzipSync(Buffer.from(JSON.stringify(document)));
  assert.equal(decodeFilingsDocument(bytes).cik, document.cik);
  const bomb = gzipSync(Buffer.alloc(FILINGS_LIMITS.inflatedBytes + 1, 0x20));
  assert.throws(() => decodeFilingsDocument(bomb), /inflate within its byte limit/);
  assert.throws(() => decodeFilingsDocument(gzipSync(Buffer.from(JSON.stringify({ ...document, schema: 'other' })))), /Invalid filings document/);
  assert.throws(() => decodeFilingsDocument(Buffer.from('not gzip')), /inflate within its byte limit/);
});

test('the builder rejects empty, duplicate, thin-less and malformed inputs', t => {
  const dir = temp(t);
  const { document } = pilotDocument(PILOTS[0]);
  assert.throws(() => buildCompanyFilingsCatalog([], dir), /empty/);
  assert.throws(() => buildCompanyFilingsCatalog([document, document], dir), /duplicate/);
  assert.throws(() => buildCompanyFilingsCatalog([{ ...document, filings: [] }], dir), /at least one filing/);
  assert.throws(() => buildCompanyFilingsCatalog([{ ...document, schema: 'x' }], dir), /Invalid or duplicate/);
});

test('a corrupt compressed object fails the hash check before it is decoded', async t => {
  const dir = temp(t);
  const { document } = pilotDocument(PILOTS[0]);
  const manifest = buildCompanyFilingsCatalog([document], dir);
  const leafName = readdirSync(resolve(dir, 'objects')).find(name => name.endsWith('.json.gz'));
  writeFileSync(resolve(dir, 'objects', leafName), gzipSync(Buffer.from(JSON.stringify({ ...document, name: 'tampered' }))));
  const catalog = createCompanyFilingsCatalog({ rootHash: manifest.root_hash, readObject: (hash, limit, kind) => localReader(dir, kind === 'leaf' ? '.json.gz' : '.json')(hash, limit) });
  await assert.rejects(catalog.getFilings(document.cik), /hash mismatch|size mismatch/);
});

test('the HTTP reader names compressed objects with the gzip extension and refuses others', async () => {
  const seen = [];
  const fetcher = async url => { seen.push(String(url)); return new Response(Buffer.from('{}'), { status: 200, headers: { 'content-length': '2' } }); };
  const filings = createHttpCatalogReader({ baseUrl: 'https://s.example/catalog/', fetcher, leafExtension: '.json.gz' });
  await filings('a'.repeat(64), 1024, 'leaf'); await filings('c'.repeat(64), 1024, 'node'); await filings('d'.repeat(64), 1024);
  await createHttpCatalogReader({ baseUrl: 'https://s.example/catalog/', fetcher })('b'.repeat(64), 1024, 'leaf');
  assert.deepEqual(seen, [`https://s.example/catalog/objects/${'a'.repeat(64)}.json.gz`, `https://s.example/catalog/objects/${'c'.repeat(64)}.json`, `https://s.example/catalog/objects/${'d'.repeat(64)}.json`, `https://s.example/catalog/objects/${'b'.repeat(64)}.json`]);
  assert.throws(() => createHttpCatalogReader({ baseUrl: 'https://s.example/catalog/', fetcher, extension: '.txt' }), /Unsupported/);
});
