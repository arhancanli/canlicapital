import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTHOR_SAME_AS } from './lib/author-identity.mjs';

// Both pages that define the author's Person node carry the same checked profile list.
const personNodes = file => [...readFileSync(file, 'utf8').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap(([, json]) => { const data = JSON.parse(json); return [data, ...(data['@graph'] ?? []), data.mainEntity].filter(Boolean); })
  .filter(node => node['@type'] === 'Person' && node['@id'] === 'https://canlicapital.com/#arhan-canli');

test('the home page and /founder give the author the same sameAs profiles', () => {
  for (const file of ['index.html', 'founder.html']) {
    const nodes = personNodes(file);
    assert.ok(nodes.length >= 1, `${file} defines the Person node`);
    for (const node of nodes) assert.deepEqual(node.sameAs, [...AUTHOR_SAME_AS], file);
  }
  assert.match(readFileSync('scripts/build-founder.mjs', 'utf8'), /sameAs: \[\.\.\.AUTHOR_SAME_AS\]/, 'the /founder generator reads the shared list');
  assert.ok(AUTHOR_SAME_AS.every(url => /^https:\/\/[a-z.]+\/\S+$/.test(url)) && new Set(AUTHOR_SAME_AS).size === AUTHOR_SAME_AS.length);
});
