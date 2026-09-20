import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { createCompanyDownloadIndex } from '../api/_lib/company-download-index.js';
import { refreshCandidates } from './refresh-company-candidates.mjs';
import { captureNotFound } from './capture-company-not-found.mjs';
import { stageCompanyDelivery } from './stage-company-delivery.mjs';
import { combineCompanyDeliveries } from './combine-company-deliveries.mjs';
import { buildCompanyCatalog } from './lib/build-company-catalog.mjs';
import { buildCompanyDownloadIndex } from './lib/build-company-download-index.mjs';
import { buildCompanyRelease } from './build-company-release.mjs';

const read = path => JSON.parse(readFileSync(path));
const pin = directory => ({ directory, manifest_sha256: catalogHash(readFileSync(resolve(directory, 'delivery.json'))) });
async function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'canli-combine-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const inputs = [];
  for (const [i, cik] of ['0000029534', '0000320193'].entries()) {
    const publicRecord = read(`public/company-data/${cik}.json`);
    const raw = gunzipSync(readFileSync('public' + publicRecord.source_snapshot));
    const captures = resolve(root, `captures-${i}`), delivery = resolve(root, `delivery-${i}`);
    const ciks = i === 0 ? [cik, '0000000002'] : [cik];
    await refreshCandidates({ ciks, output: captures, now: () => '2026-09-19T12:00:00Z', pause: async () => {},
      fetcher: async url => new Response(raw, { status: url.includes(cik) ? 200 : 404 }) });
    writeFileSync(resolve(captures, 'ciks.json'), JSON.stringify(ciks));
    await captureNotFound(captures, { now: () => '2026-09-19T13:00:00Z', pause: async () => {},
      fetcher: async () => new Response('Not found', { status: 404 }) });
    stageCompanyDelivery(captures, delivery, undefined, { selectionPolicy: 'extended-v1', allowReviewedExclusions: true });
    inputs.push(pin(delivery));
  }
  return { root, inputs, output: resolve(root, 'combined') };
}

test('combined delivery replays sources, preserves pinned cohort/exclusion evidence and binds a new release', async t => {
  const { root, inputs, output } = await fixture(t);
  const snapshots = inputs.map(input => readFileSync(resolve(input.directory, 'delivery.json')));
  const combined = await combineCompanyDeliveries(inputs, output);
  assert.equal(combined.files.length, 2);
  assert.equal(combined.download_index.downloads, 4);
  assert.equal(combined.publication_approved, false);
  assert.equal(combined.source_deliveries[0].capture_review.exclusions[0].status, 'source_not_found');
  assert.equal(combined.source_deliveries[0].capture_review.exclusions[0].receipt.status, 404);
  for (const [i, source] of combined.source_deliveries.entries()) {
    assert.deepEqual(readFileSync(resolve(output, source.storage_path)), snapshots[i]);
    assert.deepEqual(readFileSync(resolve(inputs[i].directory, 'delivery.json')), snapshots[i]);
    assert.equal(source.manifest_sha256, inputs[i].manifest_sha256);
    const archived = read(resolve(output, source.storage_path));
    const originalIndex = createCompanyDownloadIndex({ rootHash: archived.download_index.root_hash,
      readObject: hash => readFileSync(resolve(output, 'objects', hash + '.json')) });
    for (const file of archived.files) {
      assert.deepEqual(await originalIndex.find(file.source.path), file.source);
      assert.deepEqual(await originalIndex.find(file.selected.path), file.selected);
    }
  }
  const catalog = resolve(root, 'catalog');
  buildCompanyCatalog(combined.files.map(item => read(resolve(output, item.selected.storage_path))), catalog);
  const release = await buildCompanyRelease(catalog, output);
  assert.equal(release.companies, 2);
  assert.equal(release.download_root, combined.download_index.root_hash);
  assert.equal(release.publication_approved, false);
});

test('bad pins and corrupt source objects cannot replace the prior combined pointer', async t => {
  const { inputs, output } = await fixture(t);
  await combineCompanyDeliveries(inputs, output);
  const prior = readFileSync(resolve(output, 'delivery.json'));
  await assert.rejects(combineCompanyDeliveries([{ ...inputs[0], manifest_sha256: '0'.repeat(64) }, inputs[1]], output), /pin mismatch/);
  const source = read(resolve(inputs[1].directory, 'delivery.json')).files[0].source;
  writeFileSync(resolve(inputs[1].directory, source.storage_path), 'corrupt');
  await assert.rejects(combineCompanyDeliveries(inputs, output), /object corruption/);
  assert.deepEqual(readFileSync(resolve(output, 'delivery.json')), prior);
});

test('duplicate companies and mixed policies cannot replace the prior combined pointer', async t => {
  const { root, inputs, output } = await fixture(t);
  await combineCompanyDeliveries(inputs, output);
  const prior = readFileSync(resolve(output, 'delivery.json'));
  const duplicate = resolve(root, 'duplicate'); cpSync(inputs[0].directory, duplicate, { recursive: true });
  await assert.rejects(combineCompanyDeliveries([inputs[0], pin(duplicate)], output), /duplicate combined company/);
  const path = resolve(inputs[1].directory, 'delivery.json'), manifest = read(path);
  manifest.selection_policy = 'different-policy'; writeFileSync(path, JSON.stringify(manifest));
  await assert.rejects(combineCompanyDeliveries([inputs[0], pin(inputs[1].directory)], output), /different selection policies/);
  assert.deepEqual(readFileSync(resolve(output, 'delivery.json')), prior);
});

test('rehashing a forged selected value and rebuilding its download index cannot bypass source replay', async t => {
  const { inputs, output } = await fixture(t);
  await combineCompanyDeliveries(inputs, output);
  const prior = readFileSync(resolve(output, 'delivery.json'));
  const directory = inputs[1].directory, manifestPath = resolve(directory, 'delivery.json'), manifest = read(manifestPath);
  const file = manifest.files[0], record = read(resolve(directory, file.selected.storage_path));
  record.concepts[0].observations[0].val += 17;
  const bytes = Buffer.from(JSON.stringify(record));
  file.selected.sha256 = catalogHash(bytes); file.selected.bytes = bytes.length;
  file.selected.storage_path = `objects/${file.selected.sha256}.json`;
  writeFileSync(resolve(directory, file.selected.storage_path), bytes);
  manifest.download_index = buildCompanyDownloadIndex(manifest.files.flatMap(item => [item.source, item.selected]), directory);
  writeFileSync(manifestPath, JSON.stringify(manifest));
  await assert.rejects(combineCompanyDeliveries([inputs[0], pin(directory)], output), /reproduc|source|selected/i);
  assert.deepEqual(readFileSync(resolve(output, 'delivery.json')), prior);
});

test('combiner refuses overlapping directories and concurrent writer lock', async t => {
  const { inputs, output } = await fixture(t);
  await assert.rejects(combineCompanyDeliveries(inputs, inputs[0].directory), /must be separate/);
  await combineCompanyDeliveries(inputs, output);
  const prior = readFileSync(resolve(output, 'delivery.json'));
  writeFileSync(resolve(output, '.combine.lock'), 'another writer');
  await assert.rejects(combineCompanyDeliveries(inputs, output), /EEXIST/);
  assert.deepEqual(readFileSync(resolve(output, 'delivery.json')), prior);
});
