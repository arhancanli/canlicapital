import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedArtifactKeys } from './lib/published-artifact-keys.mjs';

test('rolling artifacts retain their existing explicit and basename keys', () => {
  assert.deepEqual(publishedArtifactKeys('/dist/glassbox/current_book_diversification.json', '/dist'), ['current_book_diversification.json']);
  assert.deepEqual(publishedArtifactKeys('/dist/company-data/example.json', '/dist'), ['company-data/example.json', 'example.json']);
});

test('a historical publication cannot shadow a scoped current artifact', () => {
  const artifacts = new Map();
  const current = { value: 2.5 };
  const historical = { value: 1.7846 };
  for (const key of publishedArtifactKeys('/dist/glassbox/current_book_diversification.json', '/dist')) artifacts.set(key, current);
  const versioned = '/dist/publication/alphavintage/v1.0.0/current_book_diversification.json';
  for (const key of publishedArtifactKeys(versioned, '/dist')) artifacts.set(key, historical);
  assert.equal(artifacts.get('current_book_diversification.json'), current);
  assert.equal(artifacts.get('publication/alphavintage/v1.0.0/current_book_diversification.json'), historical);
});

test('separate publication versions remain individually selectable', () => {
  assert.deepEqual(publishedArtifactKeys('/dist/publication/example/v1.0.0/result.json', '/dist'), ['publication/example/v1.0.0/result.json']);
  assert.deepEqual(publishedArtifactKeys('/dist/publication/example/v2.0.0/result.json', '/dist'), ['publication/example/v2.0.0/result.json']);
});
