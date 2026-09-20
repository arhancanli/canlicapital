import assert from 'node:assert/strict';

export function verifyStagedResponse({ path, method, status, headers, bytes, requestETag, prior }) {
  assert.equal(headers.get('cache-control'), 'no-store');
  const robots = headers.get('x-robots-tag');
  if (status !== 304) { assert.match(robots ?? '', /\bnoindex\b/); return; }
  // RFC9111 sections3.2/4.3.4: a 304 updates the matching representation's
  // supplied fields; omitted fields do not erase its verified metadata.
  // https://www.rfc-editor.org/rfc/rfc9111.html#section-4.3.4
  assert.equal(method, 'GET'); assert.equal(bytes.length, 0);
  assert.ok(prior && prior.status === 200 && prior.path === path);
  assert.match(prior.robots ?? '', /\bnoindex\b/);
  assert.equal(prior.cache_control, 'no-store');
  assert.ok(prior.etag); assert.equal(requestETag, prior.etag);
  // If-None-Match uses weak comparison (RFC9110 section13.1.2). The edge
  // can weaken a compressed 200 ETag while the bodyless304 keeps it strong.
  const opaque = tag => {
    assert.match(tag ?? '', /^(?:W\/)?"[^"\r\n]*"$/);
    return tag.replace(/^W\//, '');
  };
  assert.equal(opaque(headers.get('etag')), opaque(prior.etag));
  if (robots !== null) assert.match(robots, /\bnoindex\b/);
}
