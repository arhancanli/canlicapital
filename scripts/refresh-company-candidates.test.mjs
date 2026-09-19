import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { refreshCandidates } from './refresh-company-candidates.mjs';
const cik = '0000029534';
const record = JSON.parse(readFileSync(new URL('../public/company-data/' + cik + '.json', import.meta.url)));
const raw = gunzipSync(readFileSync(new URL('../public' + record.source_snapshot, import.meta.url)));
const fixture = t => { const output = mkdtempSync(resolve(tmpdir(), 'canli-refresh-')); t.after(() => rmSync(output, { recursive: true, force: true })); return { ciks: [cik], output, now: () => '2026-09-19T12:00:00.000Z', pause: async () => {} }; };

test('staged source reproduces, resumes offline and never invents a new capture date', async t => {
  const options = fixture(t);
  let calls = 0;
  const first = await refreshCandidates({ ...options, fetcher: async () => { calls++; return new Response(raw); } });
  assert.equal(calls, 1);
  assert.equal(first.results[0].status, 'eligible_for_review');
  assert.equal(first.publication_approved, false);
  const second = await refreshCandidates({ ...options, now: () => '2026-09-20T12:00:00.000Z', fetcher: async () => { throw new Error('Network forbidden on resume'); } });
  assert.equal(second.results[0].fetched_at, first.results[0].fetched_at);
  assert.equal(second.results[0].source_sha256, record.source_sha256);
});

test('source mutation cannot reuse a capture receipt', async t => {
  const options = fixture(t);
  await refreshCandidates({ ...options, fetcher: async () => new Response(raw) });
  const receipt = JSON.parse(readFileSync(resolve(options.output, cik + '.capture.json')));
  writeFileSync(resolve(options.output, receipt.sha256 + '.json.gz'), 'corrupted');
  const result = await refreshCandidates({ ...options, fetcher: async () => { assert.fail('must not silently replace corrupt capture'); } });
  assert.equal(result.results[0].status, 'error');
});

for (const status of [403, 429]) test(`HTTP ${status} stops without fetching the next entity`, async t => {
  const options = fixture(t); let calls = 0;
  const result = await refreshCandidates({ ...options, ciks: [cik, '0000025232'], fetcher: async () => { calls++; return new Response('', { status }); } });
  assert.equal(calls, 1); assert.match(result.stopped, new RegExp(String(status)));
});

test('wrong company identity is preserved as excluded, never eligible', async t => {
  const result = await refreshCandidates({ ...fixture(t), ciks: ['0000025232'], fetcher: async () => new Response(raw) });
  assert.equal(result.results[0].status, 'excluded');
  assert.equal(result.results[0].reason, 'INVALID_ENTITY');
});

test('duplicate and malformed queue identities fail before a request', async t => {
  const options = fixture(t);
  await assert.rejects(refreshCandidates({ ...options, ciks: [cik, cik] }), /unique/);
  await assert.rejects(refreshCandidates({ ...options, ciks: ['../outside'] }), /unique/);
});
