import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createRevokeHandler } from './revoke.js';
import { hashKey } from '../../_lib/auth.js';
const key = 'ck_live_test_only_key';
async function call(store, { method = 'POST', body = '', authorization = `Bearer ${key}` } = {}) {
  const req = Readable.from([Buffer.from(body)]); req.method = method; req.headers = { authorization };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body); } };
  await createRevokeHandler({ store })(req, res); return res;
}
test('revocation targets only the bearer hash and returns no raw key', async () => {
  const hashes = [];
  const res = await call({ revokeKey: async hash => { hashes.push(hash); return { revoked: true, revoked_at: '2026-09-20T00:00:00Z' }; } });
  assert.deepEqual(hashes, [hashKey(key)]);
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.revoked, true);
  assert.ok(!JSON.stringify(res.body).includes(key));
  assert.match(res.body.data.note, /admitted before revocation may finish/);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('missing key, extra targets, malformed or oversized bodies never reach storage', async () => {
  const store = { revokeKey: () => { throw new Error('must not reach store'); } };
  for (const [options, status] of [[{ authorization: '' },401],[{ method: 'GET' },405],[{ body: '{' },400],[{ body: '{"key":"another"}' },422],[{ body: ' '.repeat(1025) },413]]) {
    assert.equal((await call(store, options)).statusCode, status);
  }
});
test('unknown keys and unavailable storage never claim successful revocation', async () => {
  const unknown = await call({ revokeKey: async () => ({ revoked: false }) }); assert.equal(unknown.statusCode,401);
  const down = await call({ revokeKey: async () => { throw new Error(key); } }); assert.equal(down.statusCode,503);
  assert.ok(!JSON.stringify(down.body).includes(key)); assert.equal(down.body.data.revoked, undefined);
});
