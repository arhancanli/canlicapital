import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
test('unversioned scripts and styles revalidate; only build assets are immutable', () => {
  const rule = config.headers.find(rule => rule.source === '/(.*)\\.(css|js)');
  const cache = rule.headers.find(header => header.key === 'Cache-Control').value;
  assert.match(cache, /must-revalidate/);
  assert.doesNotMatch(cache, /immutable/);
  const assets = config.headers.find(rule => rule.source === '/assets/(.*)\\.(css|js)');
  assert.match(assets.headers[0].value, /immutable/);
  assert.ok(config.headers.indexOf(assets) > config.headers.indexOf(rule));
});
