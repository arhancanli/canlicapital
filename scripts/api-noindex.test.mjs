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

// Live batch verification on 2026-10-01 found the JSONL dataset and its
// extensionless checksum manifest served without a noindex header. These raw
// downloads remain crawlable evidence; their HTML dataset card owns the intent.
for (const name of ['filing-facts-v0.jsonl', 'SHA256SUMS', 'ff-eval-closed.json', 'ff-eval-mcp.json', 'gold-packet-v0.json']) {
  test(`published FilingFacts download ${name} carries noindex`, () => {
    const path = `/datasets/filing-facts/v0/${name}`;
    assert.equal(robotsFor(path), 'noindex', path);
  });
}

test('JSONL downloads and dataset checksum manifests stay covered in later versions', () => {
  for (const path of ['/datasets/filing-facts/v1/items.jsonl', '/datasets/filing-facts/v1/SHA256SUMS', '/datasets/another-dataset/v2/SHA256SUMS', '/research/evidence.jsonl']) {
    assert.equal(robotsFor(path), 'noindex', path);
  }
});

test('raw download rules do not exclude canonical developer, MCP, dataset or company pages', () => {
  for (const path of ['/', '/developers', '/mcp-servers', '/mcp-servers/validation', '/mcp-servers/fundamentals', '/mcp-servers/research', '/research/filing-facts-v0', '/research/filing-facts-v0.html', '/companies/0000320193', '/companies/0000320193/Assets', '/datasets', '/datasets/filing-facts/v1', '/datasets/filing-facts/v1/card.html']) {
    assert.equal(robotsFor(path), undefined, path);
  }
});

test('the checksum rule matches only complete dataset manifest paths', () => {
  for (const path of ['/SHA256SUMS', '/research/SHA256SUMS', '/datasets/filing-facts/v0/SHA256SUMS.html', '/datasets/filing-facts/v0/SHA256SUMS-extra', '/datasets/filing-facts/v0/SHA256SUMS/card', '/datasets-extra/filing-facts/v0/SHA256SUMS']) {
    assert.equal(robotsFor(path), undefined, path);
  }
});
