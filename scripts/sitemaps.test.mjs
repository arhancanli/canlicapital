import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSitemaps, localSitemapUrls, parseSitemap, fetchSitemapUrls, MAX_BYTES } from './lib/sitemaps.mjs';
const origin = 'https://canlicapital.com';
function fixture(t) { const directory = mkdtempSync(join(tmpdir(), 'canli-sitemap-')); t.after(() => rmSync(directory, { recursive: true, force: true })); return directory; }
function* records(n) { for (let i = 0; i < n; i++) yield { loc: `${origin}/fixture/${i}`, lastmod: '2026-09-19' }; }

test('one million synthetic URLs round-trip through twenty valid shards; never published', (t) => {
  const directory = fixture(t);
  const result = writeSitemaps(records(1_000_000), { directory, origin });
  assert.equal(result.urls, 1_000_000); assert.equal(result.shards, 20);
  const index = parseSitemap(readFileSync(join(directory, 'sitemap.xml'), 'utf8'));
  assert.equal(index.index, true); assert.equal(index.locations.length, 20);
  let count = 0;
  for (const loc of index.locations) {
    const xml = readFileSync(join(directory, new URL(loc).pathname), 'utf8');
    assert.ok(Buffer.byteLength(xml) <= MAX_BYTES);
    const leaf = parseSitemap(xml); assert.equal(leaf.index, false); assert.equal(leaf.locations.length, 50_000);
    assert.equal(leaf.locations[0], `${origin}/fixture/${count}`); count += leaf.locations.length;
  }
  assert.equal(count, 1_000_000);
});

test('small sites, XML escaping, byte splitting and deterministic indexes', async (t) => {
  const directory = fixture(t);
  const rows = [{ loc: `${origin}/x?a=1&b=2` }, ...records(5)];
  writeSitemaps(rows, { directory, origin });
  assert.deepEqual(localSitemapUrls(directory), rows.map((r) => r.loc));
  writeSitemaps(rows, { directory, origin, maxBytes: 350 });
  const first = readFileSync(join(directory, 'sitemap.xml'), 'utf8');
  assert.ok(parseSitemap(first).index);
  writeSitemaps(rows, { directory, origin, maxBytes: 350 });
  assert.equal(readFileSync(join(directory, 'sitemap.xml'), 'utf8'), first);
  const urls = await fetchSitemapUrls(`${origin}/sitemap.xml`, { rootXml: first, fetchImpl: async (loc) => ({ ok: true, text: async () => readFileSync(join(directory, new URL(loc).pathname), 'utf8') }) });
  assert.deepEqual(urls, rows.map((r) => r.loc));
});

test('reject duplicate, off-origin, invalid dates and preserve prior root on failure', (t) => {
  const directory = fixture(t);
  writeSitemaps(records(1), { directory, origin });
  const before = readFileSync(join(directory, 'sitemap.xml'), 'utf8');
  for (const rows of [[...records(1), ...records(1)], [{ loc: origin + '.evil.test/a' }], [{ loc: origin + '/x', lastmod: 'yesterday' }]]) {
    assert.throws(() => writeSitemaps(rows, { directory, origin }));
    assert.equal(readFileSync(join(directory, 'sitemap.xml'), 'utf8'), before);
  }
});

test('index traversal rejects cycles, foreign origins and failed child responses', async (t) => {
  const directory = fixture(t);
  const index = (loc) => `<sitemapindex><sitemap><loc>${loc}</loc></sitemap></sitemapindex>`;
  writeFileSync(join(directory, 'sitemap.xml'), index(`${origin}/sitemap.xml`));
  assert.throws(() => localSitemapUrls(directory), /repeated/);
  await assert.rejects(fetchSitemapUrls(`${origin}/sitemap.xml`, { rootXml: index('https://evil.test/sitemap.xml') }), /Invalid sitemap URL/);
  await assert.rejects(fetchSitemapUrls(`${origin}/sitemap.xml`, { rootXml: index(`${origin}/leaf.xml`), fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
});
