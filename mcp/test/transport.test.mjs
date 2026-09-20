import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createSession, toolServiceStatus, toolGetKey } from '../src/server.mjs';

async function backend(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('API failures are MCP errors while complete envelopes remain unchanged', async () => {
  for (const [status, envelope, failed] of [
    [401, { error: { code: 'unauthorized' }, limits: ['retain me'] }, true],
    [429, { error: { code: 'quota_exhausted' } }, true],
    [503, { data: { store_reachable: false } }, true],
    [200, { error: { code: 'invalid_input' } }, true],
    [200, { data: { valid: false }, limits: ['negative verdict is a valid result'] }, false],
  ]) {
    const session = createSession({ fetchImpl: async () => ({ status, text: async () => JSON.stringify(envelope) }) });
    const result = await toolServiceStatus(session);
    assert.equal(Boolean(result.isError), failed);
    assert.deepEqual(JSON.parse(result.content[0].text), envelope);
  }
});

test('failed key issuance cannot install a key in the session', async () => {
  const session = createSession({ envKey: '', fetchImpl: async () => ({ status: 500, text: async () => JSON.stringify({ data: { key: 'untrusted' } }) }) });
  assert.equal((await toolGetKey(session, {})).isError, true);
  assert.equal(session.key, undefined);
});

test('deadline covers a stalled response body and sends no retry', async t => {
  let requests = 0;
  const base = await backend(t, (_req, res) => { requests++; res.writeHead(200); res.write('{'); });
  const session = createSession({ base, timeoutMs: 100 });
  await assert.rejects(toolServiceStatus(session), /exceeded the request deadline/);
  assert.equal(requests, 1);
});

test('redirects are rejected before another endpoint receives credentials', async t => {
  let redirectedRequests = 0;
  const base = await backend(t, (req, res) => {
    if (req.url === '/destination') { redirectedRequests++; res.end('{}'); }
    else { res.writeHead(307, { Location: '/destination' }); res.end(); }
  });
  await assert.rejects(toolServiceStatus(createSession({ base, envKey: 'test-only-secret' })), /could not be reached or read/);
  assert.equal(redirectedRequests, 0);
});

test('non-JSON and network error messages cannot reflect a response secret', async () => {
  const secret = 'test-only-secret';
  for (const fetchImpl of [
    async () => ({ status: 502, text: async () => `<html>${secret}</html>` }),
    async () => { throw new Error(`connection failed: ${secret}`); },
  ]) {
    await assert.rejects(toolServiceStatus(createSession({ envKey: secret, fetchImpl })), error => {
      assert.ok(!error.message.includes(secret));
      return true;
    });
  }
});
