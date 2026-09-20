import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { createSupabaseStorage, uploadCompanyStorage } from './upload-company-storage.mjs';

function fixture(t, count = 2) {
  const dir = mkdtempSync(join(tmpdir(), 'canli-upload-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const data = [Buffer.from('{"release":true}'), ...Array.from({ length: count - 1 }, (_, i) => gzipSync('source-' + i))];
  const files = data.map((raw, i) => {
    const sha256 = catalogHash(raw), key = `delivery/objects/${sha256}.json${i ? '.gz' : ''}`;
    const local_path = join(dir, String(i)); writeFileSync(local_path, raw);
    return { key, local_path, sha256, bytes: raw.length, content_type: i ? 'application/gzip' : 'application/json', cache_control: 'public, max-age=31536000, immutable' };
  });
  const planBytes = Buffer.from(JSON.stringify({ schema: 'canli.company-storage-plan.v1', publication_approved: false,
    release_hash: files[0].sha256, files, objects: files.length, bytes: data.reduce((n, b) => n + b.length, 0) }));
  return { files, data, planBytes, planHash: catalogHash(planBytes) };
}

function server(fixture, options = {}) {
  const objects = new Map(), calls = [], failedKeys = new Set();
  const storage = createSupabaseStorage({ projectUrl: 'https://example.supabase.co', bucket: 'company-runtime', serviceKey: 'secret-test',
    readAttempts: options.readAttempts ?? 1, retryBudget: options.retryBudget ?? 10, pause: async () => {},
    fetcher: async (url, init) => {
      calls.push({ url, ...init });
      assert.equal(init.redirect, 'error');
      const key = url.split('/company-runtime/')[1];
      if (init.method === 'POST') {
        assert.equal(init.headers['x-upsert'], 'false'); assert.equal(init.headers.apikey, 'secret-test');
        if (options.failFirstPerKey && !failedKeys.has(key)) { failedKeys.add(key); return new Response('', { status: 503 }); }
        if (options.failCreate || options.failCreateCount > 0) {
          if (options.failCreateCount > 0) options.failCreateCount--;
          return new Response('', { status: options.createStatus ?? 503 });
        }
        if (objects.has(key)) return new Response('', { status: 409 });
        objects.set(key, Buffer.from(init.body));
        if (options.loseReplyOnce) {
          options.loseReplyOnce = false;
          throw new Error('private upstream details', { cause: { code: 'ECONNRESET' } });
        }
        return new Response('{}');
      }
      assert.equal(init.headers.Authorization, undefined); assert.equal(init.headers.apikey, undefined);
      const status = options.readStatuses?.shift();
      if (status) return new Response('{}', { status });
      if (options.failRead) return new Response('{"statusCode":"403","error":"Unauthorized"}', { status: 400 });
      if (!objects.has(key)) return new Response('{"statusCode":"404","error":"not_found"}', { status: 400 });
      return new Response(objects.get(key), { headers: { 'content-type': fixture.files.find(f => f.key === key).content_type,
        'cache-control': options.cache ?? 'public, max-age=31536000, immutable',
        ...(options.encoding ? { 'content-encoding': options.encoding } : {}) } });
    } });
  return { storage, calls, objects };
}

test('creates immutable objects, verifies public bytes, and resumes by independently checking existing objects', async t => {
  const f = fixture(t), s = server(f), snapshots = [];
  const result = await uploadCompanyStorage({ ...f, storage: s.storage, record: r => snapshots.push(structuredClone(r)) });
  assert.equal(result.complete, true); assert.equal(result.files.length, 2);
  assert.equal(snapshots[0].complete, false); assert.equal(snapshots[0].files.length, 0);
  assert.equal(s.calls.filter(c => c.method === 'POST').length, 2);
  assert.deepEqual(s.objects.get(f.files[1].key), f.data[1]);
  const resumed = await uploadCompanyStorage({ ...f, storage: s.storage });
  assert.ok(resumed.files.every(f => f.action === 'verified_existing'));
  assert.equal(s.calls.filter(c => c.method === 'POST').length, 2);
  assert.ok(!JSON.stringify(result).includes('secret-test'));
});

test('lost create reply is reconciled through exact public bytes without another write', async t => {
  const f = fixture(t), s = server(f, { loseReplyOnce: true });
  const receipt = await uploadCompanyStorage({ ...f, storage: s.storage });
  assert.equal(receipt.complete, true);
  assert.equal(receipt.files[0].action, 'verified_after_create_error');
  assert.equal(receipt.write_recovery[0].reconciliation, 'verified_existing');
  assert.equal(s.calls.filter(c => c.method === 'POST').length, 2);
  assert.ok(!JSON.stringify(receipt).includes('private upstream'));
});

test('explicit second create requires a recorded absent read and remains bounded', async t => {
  const f = fixture(t), s = server(f, { failCreateCount: 1 });
  const receipt = await uploadCompanyStorage({ ...f, storage: s.storage, writeAttempts: 2, pause: async () => {} });
  assert.equal(receipt.complete, true);
  assert.equal(receipt.write_recovery[0].reconciliation, 'absent');
  assert.equal(receipt.write_recovery[0].retry_number, 1);
  assert.equal(s.calls.filter(c => c.method === 'POST').length, 3);
  const failing = server(f, { failCreate: true });
  await assert.rejects(uploadCompanyStorage({ ...f, storage: failing.storage, writeAttempts: 2, pause: async () => {} }), /create rejected/);
  assert.equal(failing.calls.filter(c => c.method === 'POST').length, 2);
});

test('create permission failure and corrupt reconciliation never cause a second write', async t => {
  const f = fixture(t), denied = server(f, { failCreate: true, createStatus: 403 });
  await assert.rejects(uploadCompanyStorage({ ...f, storage: denied.storage, writeAttempts: 2 }), /create rejected/);
  assert.equal(denied.calls.length, 2); // Initial absent read, then denied create.
  const corrupt = server(f); let writes = 0;
  corrupt.storage.create = async file => {
    writes++; corrupt.objects.set(file.key, Buffer.alloc(file.bytes));
    const error = new Error('lost reply'); error.ambiguousWrite = true; throw error;
  };
  await assert.rejects(uploadCompanyStorage({ ...f, storage: corrupt.storage, writeAttempts: 2 }), /binding mismatch/);
  assert.equal(writes, 1);
});

test('explicit read retry policy preserves failed attempts and never repeats create requests', async t => {
  const f = fixture(t), s = server(f, { readAttempts: 3, readStatuses: [502, 504] });
  const receipt = await uploadCompanyStorage({ ...f, storage: s.storage });
  assert.equal(receipt.complete, true); assert.equal(receipt.read_retries.length, 2);
  assert.deepEqual(receipt.read_retries.map(r => r.attempt), [1, 2]);
  assert.equal(s.calls.filter(c => c.method === 'POST').length, 2);
  const failed = server(f, { readAttempts: 3, failCreate: true });
  await assert.rejects(uploadCompanyStorage({ ...f, storage: failed.storage }), /create rejected/);
  assert.equal(failed.calls.filter(c => c.method === 'POST').length, 1);
});

test('read retries stop at the global budget and never retry permission or rate-limit responses', async t => {
  const f = fixture(t), s = server(f, { readAttempts: 3, retryBudget: 1, readStatuses: [502, 502, 502] });
  await assert.rejects(uploadCompanyStorage({ ...f, storage: s.storage }), /read rejected/);
  assert.equal(s.calls.length, 2);
  for (const status of [401, 403, 429]) {
    const rejected = server(f, { readAttempts: 3, readStatuses: [status] });
    await assert.rejects(uploadCompanyStorage({ ...f, storage: rejected.storage }), /read rejected/);
    assert.equal(rejected.calls.length, 1);
  }
});

test('DOM timeout errors retain safe subtype and can use an explicitly bounded read retry', async t => {
  const f = fixture(t), events = []; let calls = 0;
  const storage = createSupabaseStorage({ projectUrl: 'https://example.supabase.co', bucket: 'company-runtime',
    serviceKey: 'secret-test', readAttempts: 2, pause: async () => {}, fetcher: async () => {
      if (++calls === 1) throw new DOMException('sensitive upstream detail', 'TimeoutError');
      return new Response('{"statusCode":"404","error":"not_found"}', { status: 400 });
    } });
  assert.equal(await storage.read(f.files[0], { onRetry: event => events.push(event) }), null);
  assert.equal(calls, 2); assert.match(events[0].error, /TimeoutError/);
  assert.ok(!JSON.stringify(events).includes('sensitive'));
});

test('interrupted successful response bodies retry from zero and never accept partial bytes', async t => {
  const f = fixture(t), events = []; let calls = 0;
  const broken = () => new ReadableStream({
    start(controller) { controller.enqueue(f.data[0].subarray(0, 3)); },
    pull(controller) { controller.error(new TypeError('terminated', { cause: { code: 'ECONNRESET' } })); },
  });
  const headers = { 'content-type': f.files[0].content_type, 'cache-control': f.files[0].cache_control };
  const storage = createSupabaseStorage({ projectUrl: 'https://example.supabase.co', bucket: 'company-runtime',
    serviceKey: 'unused', readAttempts: 2, pause: async () => {}, fetcher: async () =>
      new Response(++calls === 1 ? broken() : f.data[0], { headers }) });
  assert.deepEqual(await storage.read(f.files[0], { onRetry: e => events.push(e) }), f.data[0]);
  assert.equal(calls, 2); assert.equal(events.length, 1); assert.match(events[0].error, /ECONNRESET/);
});

test('broken permission, rate-limit and ambiguous HTTP400 bodies cannot trigger retries', async t => {
  const f = fixture(t);
  for (const status of [400, 401, 403, 429]) {
    let calls = 0;
    const storage = createSupabaseStorage({ projectUrl: 'https://example.supabase.co', bucket: 'company-runtime',
      serviceKey: 'unused', readAttempts: 3, pause: async () => {}, fetcher: async () => {
        calls++;
        return new Response(new ReadableStream({ pull(c) { c.error(new TypeError('terminated', { cause: { code: 'ECONNRESET' } })); } }), { status });
      } });
    await assert.rejects(storage.read(f.files[0])); assert.equal(calls, 1);
  }
});

test('validates the entire local plan before network access', async t => {
  const f = fixture(t), s = server(f);
  await assert.rejects(uploadCompanyStorage({ ...f, planHash: '0'.repeat(64), storage: s.storage }), /plan hash/);
  writeFileSync(f.files[1].local_path, 'corrupt');
  await assert.rejects(uploadCompanyStorage({ ...f, storage: s.storage }), /Local object/);
  assert.equal(s.calls.length, 0);
});

test('rejects corrupt existing objects without overwriting and preserves incomplete progress', async t => {
  const f = fixture(t), s = server(f), snapshots = [];
  s.objects.set(f.files[1].key, Buffer.alloc(f.files[1].bytes));
  await assert.rejects(uploadCompanyStorage({ ...f, storage: s.storage, record: r => snapshots.push(structuredClone(r)) }), /binding mismatch/);
  assert.equal(s.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(snapshots.at(-1).files.length, 1); assert.equal(snapshots.at(-1).complete, false);
});

test('rejects authorization failures and transformed representations without uploading', async t => {
  const f = fixture(t), denied = server(f, { failRead: true });
  await assert.rejects(uploadCompanyStorage({ ...f, storage: denied.storage }), /read rejected/);
  assert.equal(denied.calls.length, 1);
  const encoded = server(f, { encoding: 'gzip' });
  encoded.objects.set(f.files[0].key, f.data[0]);
  await assert.rejects(uploadCompanyStorage({ ...f, storage: encoded.storage }), /representation changed/);
  assert.equal(encoded.calls.length, 1);
  const uncached = server(f, { cache: 'no-store' });
  uncached.objects.set(f.files[0].key, f.data[0]);
  await assert.rejects(uploadCompanyStorage({ ...f, storage: uncached.storage }), /representation changed/);
});

test('rejects malformed keys, duplicates and metadata before storage access', async t => {
  const f = fixture(t), s = server(f);
  for (const mutate of [p => { p.files[0].key = '../escape'; }, p => { p.files[1] = p.files[0]; },
    p => { p.files[1].content_encoding = 'gzip'; }, p => { p.files[0].bytes = 17 * 1024 * 1024; }]) {
    const plan = JSON.parse(f.planBytes); mutate(plan); const planBytes = Buffer.from(JSON.stringify(plan));
    await assert.rejects(uploadCompanyStorage({ planBytes, planHash: catalogHash(planBytes), storage: s.storage }), /Invalid storage object/);
  }
  assert.equal(s.calls.length, 0);
});

test('bounded workers settle before failure returns and retain completed in-flight evidence', async t => {
  const f = fixture(t), s = server(f), snapshots = [];
  const read = s.storage.read;
  let active = 0, peak = 0;
  s.storage.read = async file => {
    active++; peak = Math.max(peak, active);
    try {
      await new Promise(resolve => setTimeout(resolve, file.key === f.files[0].key ? 20 : 5));
      if (file.key === f.files[1].key) throw new Error('Transport failure');
      return await read(file);
    } finally { active--; }
  };
  await assert.rejects(uploadCompanyStorage({ ...f, storage: s.storage, concurrency: 2,
    record: r => snapshots.push(structuredClone(r)) }), /Transport failure/);
  assert.equal(active, 0); assert.equal(peak, 2);
  assert.equal(snapshots.at(-1).complete, false);
  assert.equal(snapshots.at(-1).files.length, 1);
  assert.equal(snapshots.at(-1).failures[0].key, f.files[1].key);
});

test('write retry budget is shared across objects and stops after ten second attempts', async t => {
  const f = fixture(t, 12), s = server(f, { failFirstPerKey: true }), snapshots = [];
  await assert.rejects(uploadCompanyStorage({ ...f, storage: s.storage, writeAttempts: 2, pause: async () => {},
    record: r => snapshots.push(structuredClone(r)) }), /create rejected/);
  const last = snapshots.at(-1);
  assert.equal(last.complete, false); assert.equal(last.files.length, 10);
  assert.equal(last.write_recovery.filter(r => r.retry_number).length, 10);
  assert.equal(s.calls.filter(c => c.method === 'POST').length, 21);
});

test('explicit larger budgets recover dispersed failures but still stop at their exact bound', async t => {
  const f = fixture(t, 13);
  const s = server(f, { failFirstPerKey: true });
  const result = await uploadCompanyStorage({ ...f, storage: s.storage, writeAttempts: 2,
    writeRetryBudget: 13, pause: async () => {} });
  assert.equal(result.files.length, 13);
  assert.equal(result.retry_policy.write.budget, 13);
  assert.equal(result.write_recovery.filter(r => r.retry_number).length, 13);
  const limited = server(f, { failFirstPerKey: true }), receipts = [];
  await assert.rejects(uploadCompanyStorage({ ...f, storage: limited.storage, writeAttempts: 2,
    writeRetryBudget: 11, pause: async () => {}, record: r => receipts.push(structuredClone(r)) }), /create rejected/);
  assert.equal(receipts.at(-1).files.length, 11);
  let calls = 0, retries = 0;
  const storage = createSupabaseStorage({ projectUrl: 'https://example.supabase.co', bucket: 'company-runtime',
    serviceKey: 'unused', readAttempts: 3, retryBudget: 11, pause: async () => {}, fetcher: async () => {
      if (++calls % 2) return new Response('', { status: 502 });
      return new Response(JSON.stringify({ statusCode: '404', error: 'not_found' }), { status: 400 });
    } });
  for (let i = 0; i < 11; i++) assert.equal(await storage.read(f.files[0], { onRetry: () => retries++ }), null);
  await assert.rejects(storage.read(f.files[0]), /read rejected/);
  assert.equal(retries, 11); assert.equal(calls, 23);
});

test('retry budgets reject invalid or unbounded values before requests', async t => {
  const f = fixture(t), s = server(f);
  for (const retryBudget of [-1, 201, 1.5, Infinity, NaN]) {
    assert.throws(() => createSupabaseStorage({ projectUrl: 'https://example.supabase.co', bucket: 'company-runtime',
      serviceKey: 'unused', retryBudget }), /bounded read retry policy/);
  }
  for (const writeRetryBudget of [-1, 51, 1.5, Infinity, NaN]) {
    await assert.rejects(uploadCompanyStorage({ ...f, storage: s.storage, writeRetryBudget }), /bounded write retry budget/);
  }
  assert.equal(s.calls.length, 0);
});
