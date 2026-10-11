import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_CACHE, errorCache } from '../api/_lib/company-cache.js';

test('company pages are cached for the life of a deployment, missing pages for a day, failures never', () => {
  assert.match(PAGE_CACHE, /^public, max-age=0, s-maxage=604800, stale-while-revalidate=2592000$/);
  assert.equal(errorCache(404), 'public, max-age=0, s-maxage=86400');
  assert.equal(errorCache(410), 'public, max-age=0, s-maxage=86400');
  for (const status of [400, 405, 500, 502, 503]) assert.equal(errorCache(status), 'no-store', String(status));
});
