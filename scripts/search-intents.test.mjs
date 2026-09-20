import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIntents } from './audit-search-intents.mjs';
const urls = ['https://canlicapital.com/one', 'https://canlicapital.com/two'];
const one = { path: '/one', intent: 'Useful answer', queries: ['First query'] };
test('a canonical owns its synonyms without creating more pages', () => {
  assert.deepEqual(validateIntents([{ ...one, queries: ['First query', 'Related question'] }], urls), { canonical_owners: 1, query_hypotheses: 2 });
});
test('normalized competing queries and duplicate canonical owners fail', () => {
  assert.throws(() => validateIntents([one, { ...one, path: '/two', queries: [' FIRST  QUERY '] }], urls), /duplicate owners/);
  assert.throws(() => validateIntents([one, { ...one, queries: ['Another'] }], urls), /Duplicate intent/);
});
test('unpublished, query-string and empty intents cannot count as coverage', () => {
  for (const entry of [{ ...one, path: '/missing' }, { ...one, path: '/one?q=x' }, { ...one, intent: '' }, { ...one, queries: [] }]) {
    assert.throws(() => validateIntents([entry], urls));
  }
});
