import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { refreshCandidates } from './refresh-company-candidates.mjs';
import { stageCompanyDelivery } from './stage-company-delivery.mjs';
import { combineCompanyDeliveries } from './combine-company-deliveries.mjs';
import { buildCompanyCatalog } from './lib/build-company-catalog.mjs';
import { buildCompanyRelease } from './build-company-release.mjs';
import { prepareCompanyStorage } from './prepare-company-storage.mjs';
const read = path => JSON.parse(readFileSync(path));
async function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'canli-storage-plan-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const inputs = [];
  for (const [i, cik] of ['0000029534', '0000320193'].entries()) {
    const record = read(`public/company-data/${cik}.json`);
    const raw = gunzipSync(readFileSync('public' + record.source_snapshot));
    const input = resolve(root, `captures-${i}`), directory = resolve(root, `delivery-${i}`);
    await refreshCandidates({ ciks: [cik], output: input, now: () => '2026-09-19T12:00:00Z', pause: async () => {}, fetcher: async () => new Response(raw) });
    writeFileSync(resolve(input, 'ciks.json'), JSON.stringify([cik]));
    stageCompanyDelivery(input, directory);
    inputs.push({ directory, manifest_sha256: catalogHash(readFileSync(resolve(directory, 'delivery.json'))) });
  }
  const delivery = resolve(root, 'delivery'), catalog = resolve(root, 'catalog');
  const manifest = await combineCompanyDeliveries(inputs, delivery);
  buildCompanyCatalog(manifest.files.map(item => read(resolve(delivery, item.selected.storage_path))), catalog);
  const release = await buildCompanyRelease(catalog, delivery);
  return { delivery, catalog, manifest, release };
}

test('storage plan contains reachable runtime/provenance objects, excludes orphans and preserves gzip bytes', async t => {
  const { delivery, catalog, manifest, release } = await fixture(t);
  const orphan = Buffer.from('unreferenced');
  const orphanPath = `objects/${catalogHash(orphan)}.json`;
  writeFileSync(resolve(delivery, orphanPath), orphan);
  const plan = await prepareCompanyStorage(catalog, delivery);
  assert.equal(plan.companies, 2);
  assert.equal(plan.release_hash, release.release_hash);
  assert.equal(plan.publication_approved, false);
  assert.equal(plan.objects, plan.files.length);
  assert.equal(plan.bytes, plan.files.reduce((sum, item) => sum + item.bytes, 0));
  assert.ok(!plan.files.some(item => item.key === `delivery/${orphanPath}`));
  for (const item of plan.files) assert.equal(catalogHash(readFileSync(item.local_path)), item.sha256);
  for (const source of manifest.source_deliveries) {
    assert.ok(plan.files.some(item => item.key === `delivery/${source.storage_path}`));
    const archived = read(resolve(delivery, source.storage_path));
    assert.ok(plan.files.some(item => item.key === `delivery/objects/${archived.download_index.root_hash}.json`));
  }
  for (const file of manifest.files) {
    const stored = plan.files.find(item => item.key === `delivery/${file.source.storage_path}`);
    assert.equal(stored.content_type, 'application/gzip');
    assert.equal(stored.sha256, file.source.sha256);
    assert.ok(!('content_encoding' in stored));
  }
});

test('storage planning rejects corrupt original bytes and leaves the release pointer unchanged', async t => {
  const { delivery, catalog, manifest } = await fixture(t);
  const prior = readFileSync(resolve(delivery, 'company-release.json'));
  writeFileSync(resolve(delivery, manifest.files[0].source.storage_path), 'corrupt');
  await assert.rejects(prepareCompanyStorage(catalog, delivery), /binding mismatch/);
  assert.deepEqual(readFileSync(resolve(delivery, 'company-release.json')), prior);
});

test('storage planning rejects altered release pointers and missing archived evidence', async t => {
  const { delivery, catalog, manifest } = await fixture(t);
  const pointerPath = resolve(delivery, 'company-release.json'), prior = readFileSync(pointerPath), pointer = JSON.parse(prior);
  pointer.histories += 1; writeFileSync(pointerPath, JSON.stringify(pointer));
  await assert.rejects(prepareCompanyStorage(catalog, delivery), /release inputs/);
  writeFileSync(pointerPath, prior);
  rmSync(resolve(delivery, manifest.source_deliveries[0].storage_path));
  await assert.rejects(prepareCompanyStorage(catalog, delivery), /ENOENT/);
});
