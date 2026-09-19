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
