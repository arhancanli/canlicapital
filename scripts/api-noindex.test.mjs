import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The noindex rule for data files matches file extensions only, so the extensionless JSON
// endpoints (/api/v1, /api/v1/status, /api/v1/openapi, ...) and the plain-text /api 404s were
// served 200 without X-Robots-Tag (live audit, 2026-09-27). No /api URL is a page anyone should
// land on from search; each one says so in its headers, whatever its extension.
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
const matches = (source, path) => new RegExp(`^${source.replace(/\((?!\?)/g, '(?:')}$`).test(path);
const robotsFor = path => config.headers.filter(rule => matches(rule.source, path)).flatMap(rule => rule.headers).filter(h => h.key === 'X-Robots-Tag').map(h => h.value).at(-1);

test('every /api path, with or without an extension, carries X-Robots-Tag noindex', () => {
  for (const path of ['/api/v1', '/api/v1/status', '/api/v1/record', '/api/v1/sleeves', '/api/v1/research', '/api/v1/openapi', '/api/v1/chain/head', '/api/nope', '/api/v1/receipts/abc/badge.svg', '/api/v1/record.json']) {
    assert.equal(robotsFor(path), 'noindex', path);
  }
});
test('the /api rule does not reach site pages', () => {
  for (const path of ['/', '/developers', '/companies', '/companies/0000320193', '/research/null-zoo', '/apis']) assert.equal(robotsFor(path), undefined, path);
});
