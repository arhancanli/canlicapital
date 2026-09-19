import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localSitemapUrls } from './lib/sitemaps.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const urls = localSitemapUrls(resolve(root, 'dist'));
const unique = new Set(urls);
if (urls.length !== unique.size) throw new Error('Duplicate canonical URLs');
const families = {};
for (const url of urls) {
  const family = new URL(url).pathname.split('/')[1] || 'homepage';
  families[family] = (families[family] ?? 0) + 1;
}
let html = 0, noindex = 0;
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.html')) {
      html++;
      if (/<meta\s+name="robots"\s+content="[^"]*\bnoindex\b/i.test(readFileSync(path, 'utf8'))) noindex++;
    }
  }
}
walk(resolve(root, 'dist'));
const target = 1_000_000;
const report = {
  schema: 'canli.indexable-inventory.v1', observed_at: new Date().toISOString(),
  target, local_sitemap_pages: unique.size, local_built_html_pages: html,
  html_meta_noindex_pages: noindex, remaining_to_target: Math.max(0, target - unique.size),
  status: unique.size >= target ? 'LOCAL_COUNT_TARGET_MET' : 'CONTENT_TARGET_NOT_MET',
  families, deployed: false, search_engine_indexed_pages: null,
  claim_boundary: 'Local built sitemap inventory, not evidence of deployment, search-engine indexing or million-page rendering capacity. Hosting-layer noindex is checked separately by audit-indexability.mjs. Synthetic stress-test URLs never count as content.',
};
const output = resolve(root, 'artifacts/seo/indexable-inventory.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`${report.status}: ${unique.size.toLocaleString()} local indexable pages; ${report.remaining_to_target.toLocaleString()} short of target`);
if (process.argv.includes('--require-target') && unique.size < target) process.exitCode = 1;
