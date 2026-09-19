import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { refreshCandidates } from './refresh-company-candidates.mjs';
import { reviewCandidates } from './review-company-candidates.mjs';
async function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), 'canli-review-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const cik = '0000029534';
  const record = JSON.parse(readFileSync(new URL('../public/company-data/' + cik + '.json', import.meta.url)));
  const raw = gunzipSync(readFileSync(new URL('../public' + record.source_snapshot, import.meta.url)));
  writeFileSync(resolve(directory, 'ciks.json'), JSON.stringify([cik]));
  await refreshCandidates({ ciks: [cik], output: directory, fetcher: async () => new Response(raw), now: () => '2026-09-19T12:00:00Z', pause: async () => {} });
  return { directory, cik };
}
function mutate(directory, file, change) { const path = resolve(directory, file); const data = JSON.parse(readFileSync(path)); change(data); writeFileSync(path, JSON.stringify(data)); }

test('review reproduces every staged value without granting publication approval', async t => {
  const { directory } = await fixture(t); const report = reviewCandidates(directory);
  assert.equal(report.complete, true); assert.equal(report.errors.length, 0);
  assert.equal(report.candidates.length, 1); assert.equal(report.candidate_pages, 7);
  assert.equal(report.publication_approved, false);
});
test('modified accounting value is rejected', async t => {
  const { directory, cik } = await fixture(t);
  mutate(directory, cik + '.record.json', data => { data.concepts[0].observations[0].val += 1; });
  assert.match(reviewCandidates(directory).errors[0].reason, /does not reproduce/);
});
test('modified capture receipt byte count is rejected', async t => {
  const { directory, cik } = await fixture(t);
  mutate(directory, cik + '.capture.json', data => { data.bytes += 1; });
  assert.match(reviewCandidates(directory).errors[0].reason, /bytes/);
});
test('modified summary cannot hide behind a valid source record', async t => {
  const { directory } = await fixture(t);
  mutate(directory, 'refresh.json', data => { data.results[0].histories += 1; });
  assert.match(reviewCandidates(directory).errors[0].reason, /Queue result/);
});
test('partial capture is reported as incomplete; duplicate results fail', async t => {
  const { directory } = await fixture(t);
  mutate(directory, 'refresh.json', data => { delete data.finished_at; });
  assert.equal(reviewCandidates(directory).complete, false);
  mutate(directory, 'refresh.json', data => { data.results.push(data.results[0]); });
  assert.throws(() => reviewCandidates(directory), /Duplicate/);
});

test('a falsely excluded eligible capture cannot disappear from the review', async t => {
  const { directory } = await fixture(t);
  mutate(directory, 'refresh.json', data => { data.results[0] = { cik: data.results[0].cik, status: 'excluded', reason: 'INSUFFICIENT_COVERAGE' }; });
  const review = reviewCandidates(directory);
  assert.match(review.errors[0].reason, /Exclusion does not reproduce/);
  assert.equal(review.exclusions.length, 0);
});

test('staging can retain source-reproduced exclusions but never HTTP failures or altered reasons', async t => {
  const { stageCompanyDelivery } = await import('./stage-company-delivery.mjs');
  const { directory, cik } = await fixture(t);
  const output = mkdtempSync(resolve(tmpdir(), 'canli-reviewed-delivery-'));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  const record = JSON.parse(readFileSync(resolve(directory, cik + '.record.json')));
  const raw = gunzipSync(readFileSync(resolve(directory, record.source_sha256 + '.json.gz')));
  const badCik = '0000000001';
  const ciks = [cik, badCik];
  writeFileSync(resolve(directory, 'ciks.json'), JSON.stringify(ciks));
  await refreshCandidates({ ciks, output: directory, fetcher: async url => new Response(url.includes(badCik) ? JSON.stringify({ cik: 1, entityName: 'Coverage fixture', facts: {} }) : raw), now: () => '2026-09-19T12:00:00Z', pause: async () => {} });
  const review = reviewCandidates(directory);
  assert.equal(review.errors.length, 0);
  assert.equal(review.exclusions[0].reason, 'INSUFFICIENT_COVERAGE');
  assert.equal(review.exclusions[0].reproduced, true);
  assert.throws(() => stageCompanyDelivery(directory, output), /Complete reproduced/);
  const manifest = stageCompanyDelivery(directory, output, undefined, { allowReviewedExclusions: true });
  assert.equal(manifest.files.length, 1);
  assert.equal(manifest.capture_review.exclusions[0].cik, badCik);
  assert.equal(manifest.capture_review.refresh_sha256, review.refresh_sha256);
  const saved = readFileSync(resolve(output, 'delivery.json'));
  mutate(directory, 'refresh.json', data => { data.results[1].reason = 'INVALID_ENTITY'; });
  assert.throws(() => stageCompanyDelivery(directory, output, undefined, { allowReviewedExclusions: true }), /Complete reproduced/);
  mutate(directory, 'refresh.json', data => { data.results[1] = { cik: badCik, status: 'http_error', http_status: 500 }; });
  assert.throws(() => stageCompanyDelivery(directory, output, undefined, { allowReviewedExclusions: true }), /Complete reproduced/);
  assert.deepEqual(readFileSync(resolve(output, 'delivery.json')), saved);
});
