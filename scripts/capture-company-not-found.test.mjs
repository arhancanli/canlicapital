import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { captureNotFound } from './capture-company-not-found.mjs';
import { reviewCandidates } from './review-company-candidates.mjs';
const cik = '0000000001';
function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), 'canli-not-found-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(resolve(directory, 'ciks.json'), JSON.stringify([cik]));
  writeFileSync(resolve(directory, 'refresh.json'), JSON.stringify({ schema: 'canli.company-refresh.v1', requested: 1, finished_at: '2026-09-19T12:00:00Z', stopped: null, results: [{ cik, status: 'http_error', http_status: 404 }] }));
  return directory;
}
const options = { now: () => '2026-09-19T13:00:00Z', pause: async () => {} };
test('confirmed 404 is bound to its original batch and captured body; resume does not refetch', async t => {
  const directory = fixture(t); let calls = 0;
  const receipts = await captureNotFound(directory, { ...options, fetcher: async () => { calls++; return new Response('Not found', { status: 404 }); } });
  assert.equal(receipts.length, 1);
  const review = reviewCandidates(directory);
  assert.equal(review.exclusions[0].status, 'source_not_found');
  assert.equal(review.exclusions[0].response_verified, true);
  assert.equal(review.publication_approved, false);
  await captureNotFound(directory, { ...options, fetcher: async () => { throw new Error('Unexpected refetch'); } });
  assert.equal(calls, 1);
  writeFileSync(resolve(directory, receipts[0].body_sha256 + '.http-body'), 'tampered');
  assert.match(reviewCandidates(directory).errors[0].reason, /body mismatch/);
});
test('partial capture and stale batch bindings cannot authorize exclusions', async t => {
  const directory = fixture(t);
  await captureNotFound(directory, { ...options, fetcher: async () => new Response('', { status: 404 }) });
  const path = resolve(directory, 'refresh.json'), refresh = JSON.parse(readFileSync(path));
  refresh.extra = 'changed'; writeFileSync(path, JSON.stringify(refresh));
  assert.match(reviewCandidates(directory).errors[0].reason, /stale/);
  delete refresh.finished_at; writeFileSync(path, JSON.stringify(refresh));
  await assert.rejects(captureNotFound(directory, { ...options, fetcher: async () => { throw new Error('Must not request'); } }), /complete original/);
});
for (const status of [200, 403, 429, 500]) test(`HTTP ${status} stops confirmation without producing a not-found receipt`, async t => {
  const directory = fixture(t); let calls = 0;
  await assert.rejects(captureNotFound(directory, { ...options, fetcher: async () => { calls++; return new Response('Other response', { status }); } }), new RegExp(`HTTP ${status}`));
  assert.equal(calls, 1);
  assert.equal(existsSync(resolve(directory, cik + '.not-found.json')), false);
  assert.equal(reviewCandidates(directory).exclusions[0].status, 'http_error');
});
