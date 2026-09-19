import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";

export const MAX_URLS = 50_000;
export const MAX_BYTES = 50 * 1024 * 1024;
const header = '<?xml version="1.0" encoding="UTF-8"?>\n';
const open = `${header}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
const close = '</urlset>\n';
export const escapeXml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const unescapeXml = (value) => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, key) => key[0] === '#' ? String.fromCodePoint(parseInt(key.slice(key[1] === 'x' ? 2 : 1), key[1] === 'x' ? 16 : 10)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[key]);

function sameOrigin(loc, origin) {
  const url = new URL(loc);
  if (url.origin !== origin || url.username || url.password || url.hash) throw new Error(`Invalid sitemap URL: ${loc}`);
  return url;
}

/** Stream records in deterministic source order; retain only one shard and the uniqueness set. */
export function writeSitemaps(records, { directory, origin, maxUrls = MAX_URLS, maxBytes = MAX_BYTES }) {
  origin = new URL(origin).origin;
  if (!Number.isInteger(maxUrls) || maxUrls < 1 || maxUrls > MAX_URLS || !Number.isInteger(maxBytes) || maxBytes <= Buffer.byteLength(open + close) || maxBytes > MAX_BYTES) throw new Error('Invalid sitemap limits');
  mkdirSync(directory, { recursive: true });
  const seen = new Set();
  const shards = [];
  let entries = [], bytes = Buffer.byteLength(open + close), count = 0;
  const flush = () => {
    const xml = open + entries.join('') + close;
    const name = `sitemap-pages-${createHash('sha256').update(xml).digest('hex').slice(0, 24)}.xml`;
    writeFileSync(resolve(directory, name), xml);
    shards.push({ name, urls: entries.length, bytes: Buffer.byteLength(xml) });
    if (shards.length > MAX_URLS) throw new Error('Sitemap index exceeds protocol limit');
    entries = []; bytes = Buffer.byteLength(open + close);
    return xml;
  };
  for (const record of records) {
    const url = sameOrigin(record.loc, origin);
    if (seen.has(url.href)) throw new Error(`Duplicate sitemap URL: ${record.loc}`);
    seen.add(url.href);
    if (record.lastmod && (!/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?$/.test(record.lastmod) || !Number.isFinite(Date.parse(record.lastmod)))) throw new Error(`Invalid lastmod: ${record.lastmod}`);
    const entry = `  <url>\n    <loc>${escapeXml(record.loc)}</loc>\n` +
      (record.lastmod ? `    <lastmod>${escapeXml(record.lastmod)}</lastmod>\n` : '') + '  </url>\n';
    const size = Buffer.byteLength(entry);
    if (size + Buffer.byteLength(open + close) > maxBytes) throw new Error('One sitemap entry exceeds byte limit');
    if (entries.length && (entries.length >= maxUrls || bytes + size > maxBytes)) flush();
    entries.push(entry); bytes += size; count++;
  }
  // Keep the small-site format; existing submitted /sitemap.xml remains the entry point.
  let xml;
  if (!shards.length) xml = open + entries.join('') + close;
  else {
    if (entries.length) flush();
    xml = `${header}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      shards.map(({ name }) => `  <sitemap><loc>${escapeXml(`${origin}/${name}`)}</loc></sitemap>\n`).join('') + '</sitemapindex>\n';
  }
  if (Buffer.byteLength(xml) > MAX_BYTES) throw new Error('Sitemap index exceeds byte limit');
  // Commit the index last. Content-addressed old shards remain valid for cached indexes.
  const pending = resolve(directory, 'sitemap.xml.pending');
  writeFileSync(pending, xml);
  renameSync(pending, resolve(directory, 'sitemap.xml'));
  return { urls: count, shards: shards.length || 1, bytes: shards.length ? shards.reduce((sum, shard) => sum + shard.bytes, 0) : Buffer.byteLength(xml) };
}

export function parseSitemap(xml) {
  if (Buffer.byteLength(xml) > MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsafe or oversized sitemap');
  const root = xml.match(/<(urlset|sitemapindex)\b[^>]*>/)?.[1];
  if (!root || !xml.includes(`</${root}>`)) throw new Error('Invalid sitemap document');
  const locations = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => unescapeXml(m[1]));
  if (locations.length > MAX_URLS) throw new Error('Sitemap exceeds URL limit');
  return { index: root === 'sitemapindex', locations };
}

/** Read leaf XML only, preserving compatibility with metadata audits. Never count index links as pages. */
export function readSitemapXml(directory, origin = 'https://canlicapital.com') {
  const visited = new Set();
  function visit(loc, depth = 0) {
    if (depth > 1 || visited.has(loc)) throw new Error('Nested or repeated sitemap index');
    visited.add(loc);
    const url = sameOrigin(loc, origin);
    const file = resolve(directory, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(resolve(directory) + sep) || url.search || !file.endsWith('.xml')) throw new Error('Invalid local sitemap path');
    const xml = readFileSync(file, 'utf8');
    const parsed = parseSitemap(xml);
    parsed.locations.forEach((value) => sameOrigin(value, origin));
    return parsed.index ? parsed.locations.map((child) => visit(child, depth + 1)).join('\n') : xml;
  }
  return visit(`${origin}/sitemap.xml`);
}

export function localSitemapUrls(directory, origin) {
  return [...readSitemapXml(directory, origin).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => unescapeXml(m[1]));
}

/** A provided root avoids fetching it twice in live audits; fetch only same-origin child sitemaps. */
export async function fetchSitemapUrls(rootUrl, { fetchImpl = fetch, rootXml, requestOptions = {} } = {}) {
  const origin = new URL(rootUrl).origin;
  const visited = new Set();
  async function visit(loc, xml, depth = 0) {
    sameOrigin(loc, origin);
    if (depth > 1 || visited.has(loc)) throw new Error('Nested or repeated sitemap index');
    visited.add(loc);
    if (xml === undefined) {
      const response = await fetchImpl(loc, { ...requestOptions, redirect: 'error' });
      if (!response.ok) throw new Error(`Sitemap fetch failed (${response.status}): ${loc}`);
      xml = await response.text();
    }
    const parsed = parseSitemap(xml);
    parsed.locations.forEach((value) => sameOrigin(value, origin));
    if (!parsed.index) return parsed.locations;
    const urls = [];
    for (const child of parsed.locations) urls.push(...await visit(child, undefined, depth + 1));
    return urls;
  }
  return visit(rootUrl, rootXml);
}
