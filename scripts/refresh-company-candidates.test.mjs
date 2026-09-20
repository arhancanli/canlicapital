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
  const saved = readFileSync(resolve(options.output, 'refresh.json'));
  const second = await refreshCandidates({ ...options, now: () => '2026-09-20T12:00:00.000Z', fetcher: async () => { throw new Error('Network forbidden on resume'); } });
  assert.equal(second.results[0].fetched_at, first.results[0].fetched_at);
  assert.equal(second.results[0].source_sha256, record.source_sha256);
  assert.equal(second.finished_at, first.finished_at);
  assert.deepEqual(readFileSync(resolve(options.output, 'refresh.json')), saved);
});

test('source mutation cannot reuse a capture receipt', async t => {
  const options = fixture(t);
  await refreshCandidates({ ...options, fetcher: async () => new Response(raw) });
  const receipt = JSON.parse(readFileSync(resolve(options.output, cik + '.capture.json')));
  writeFileSync(resolve(options.output, receipt.sha256 + '.json.gz'), 'corrupted');
  const saved = readFileSync(resolve(options.output, 'refresh.json'));
  await assert.rejects(refreshCandidates({ ...options, fetcher: async () => { assert.fail('must not silently replace corrupt capture'); } }));
  assert.deepEqual(readFileSync(resolve(options.output, 'refresh.json')), saved);
});

for (const status of [403, 429]) test(`HTTP ${status} stops without fetching the next entity`, async t => {
  const options = fixture(t); let calls = 0;
  const result = await refreshCandidates({ ...options, ciks: [cik, '0000025232'], fetcher: async () => { calls++; return new Response('', { status }); } });
  assert.equal(calls, 1); assert.match(result.stopped, new RegExp(String(status)));
  await assert.rejects(refreshCandidates({ ...options, ciks: [cik, '0000025232'], fetcher: async () => assert.fail('access denial must not retry') }), /no automatic retry/);
});

test('resume retains failed outcomes and fetches only the untouched queue suffix', async t => {
  const options = fixture(t), ciks = [cik, '0000025232'];
  let pauses = 0;
  await assert.rejects(refreshCandidates({ ...options, ciks,
    fetcher: async () => new Response('', { status: 404 }),
    pause: async () => { if (++pauses === 1) throw new Error('Simulated interruption'); }
  }), /Simulated interruption/);
  const called = [];
  const report = await refreshCandidates({ ...options, ciks, fetcher: async url => {
    called.push(url); return new Response('', { status: 404 });
  } });
  assert.deepEqual(called, ['https://data.sec.gov/api/xbrl/companyfacts/CIK0000025232.json']);
  assert.equal(report.results.length, 2);
  assert.equal(report.results[0].http_status, 404);
});

test('changed untouched suffix is rejected before network or report mutation', async t => {
  const options = fixture(t), ciks = [cik, '0000025232'];
  await assert.rejects(refreshCandidates({ ...options, ciks,
    fetcher: async () => new Response('', { status: 404 }),
    pause: async () => { throw new Error('Simulated interruption'); }
  }));
  const saved = readFileSync(resolve(options.output, 'refresh.json'));
  await assert.rejects(refreshCandidates({ ...options, ciks: [cik, '0000000001'],
    fetcher: async () => assert.fail('changed queue must not fetch') }), /binding/);
  assert.deepEqual(readFileSync(resolve(options.output, 'refresh.json')), saved);
});

test('completed prior HTTP and transport failures are never automatically retried', async t => {
  const options = fixture(t);
  await refreshCandidates({ ...options, fetcher: async () => { throw new Error('Network timeout'); } });
  const saved = readFileSync(resolve(options.output, 'refresh.json'));
  const report = await refreshCandidates({ ...options, fetcher: async () => assert.fail('transport failure must not retry') });
  assert.equal(report.results[0].reason, 'Network timeout');
  assert.deepEqual(readFileSync(resolve(options.output, 'refresh.json')), saved);
});

test('legacy completed capture replays without changing its evidence hash', async t => {
  const options = fixture(t);
  await refreshCandidates({ ...options, fetcher: async () => new Response(raw) });
  const path = resolve(options.output, 'refresh.json');
  const legacy = JSON.parse(readFileSync(path)); delete legacy.queue_sha256;
  writeFileSync(path, JSON.stringify(legacy));
  const saved = readFileSync(path);
  await refreshCandidates({ ...options, fetcher: async () => assert.fail('legacy replay must remain offline') });
  assert.deepEqual(readFileSync(path), saved);
  delete legacy.finished_at; writeFileSync(path, JSON.stringify(legacy));
  await assert.rejects(refreshCandidates({ ...options, fetcher: async () => assert.fail('unbound partial capture must not resume') }), /binding/);
});

test('missing prior receipt cannot trigger a replacement fetch', async t => {
  const options = fixture(t);
  await refreshCandidates({ ...options, fetcher: async () => new Response(raw) });
  const saved = readFileSync(resolve(options.output, 'refresh.json'));
  rmSync(resolve(options.output, cik + '.capture.json'));
  await assert.rejects(refreshCandidates({ ...options, fetcher: async () => assert.fail('missing evidence must not refetch') }), /receipt missing/);
  assert.deepEqual(readFileSync(resolve(options.output, 'refresh.json')), saved);
});

test('offline resume detects altered staged data without overwriting it', async t => {
  const options = fixture(t);
  await refreshCandidates({ ...options, fetcher: async () => new Response(raw) });
  const path = resolve(options.output, cik + '.record.json');
  const changed = JSON.parse(readFileSync(path)); changed.concepts[0].observations[0].val += 1;
  writeFileSync(path, JSON.stringify(changed)); const saved = readFileSync(path);
  await assert.rejects(refreshCandidates({ ...options, fetcher: async () => assert.fail('must remain offline') }), /does not reproduce/);
  assert.deepEqual(readFileSync(path), saved);
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
