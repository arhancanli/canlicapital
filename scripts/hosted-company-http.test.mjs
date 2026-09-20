import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyStagedResponse } from './lib/hosted-company-http.mjs';

const prior = { path: '/companies/0000001750', status: 200, robots: 'noindex', cache_control: 'no-store', etag: '"abc"' };
const sample = () => ({ path: prior.path, method: 'GET', status: 304, bytes: Buffer.alloc(0),
  headers: new Headers({ 'cache-control': 'no-store', etag: prior.etag }), requestETag: prior.etag, prior });
test('304 may omit robots only when bound to the verified noindex representation', () => {
  verifyStagedResponse(sample());
  for (const change of [{ prior: undefined }, { path: '/companies/other' },
    { prior: { ...prior, status: 503 } }, { prior: { ...prior, robots: 'index' } },
    { requestETag: '"different"' }, { bytes: Buffer.from('body') },
    { headers: new Headers({ 'cache-control': 'no-store', etag: '"different"' }) },
    { headers: new Headers({ 'cache-control': 'no-store', etag: prior.etag, 'x-robots-tag': 'index' }) }]) {
    assert.throws(() => verifyStagedResponse({ ...sample(), ...change }));
  }
});
test('full and error responses must directly retain noindex and no-store', () => {
  for (const status of [200, 404, 405, 503]) {
    const s = { ...sample(), status };
    assert.throws(() => verifyStagedResponse(s));
    s.headers.set('x-robots-tag', 'noindex'); verifyStagedResponse(s);
    s.headers.set('cache-control', 'public'); assert.throws(() => verifyStagedResponse(s));
  }
});

test('conditional GET matches weak and strong forms only for the same opaque tag', () => {
  const s = sample(); s.prior = { ...prior, etag: 'W/"abc"' }; s.requestETag = s.prior.etag;
  verifyStagedResponse(s);
  for (const tag of ['"different"', '*', '', 'W/abc']) {
    s.headers.set('etag', tag); assert.throws(() => verifyStagedResponse(s));
  }
});
