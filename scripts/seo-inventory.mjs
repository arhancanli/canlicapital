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
const goal = JSON.parse(readFileSync(resolve(root, 'config/search-growth-goal.json'), 'utf8'));
const target = goal.target_indexed_pages;
const minimum = goal.minimum_indexed_pages;
if (!Number.isSafeInteger(minimum) || minimum < 1 || !Number.isSafeInteger(target) || target < minimum) throw new Error('Invalid search growth goal');
const report = {
  schema: 'canli.indexable-inventory.v1', observed_at: new Date().toISOString(),
  goal_source: 'config/search-growth-goal.json',
  minimum_indexed_pages: minimum, target_indexed_pages: target,
  target, local_sitemap_pages: unique.size, local_built_html_pages: html,
  html_meta_noindex_pages: noindex, remaining_to_target: Math.max(0, target - unique.size),
  status: unique.size >= target ? 'LOCAL_COUNT_TARGET_MET' : 'CONTENT_TARGET_NOT_MET',
  families, deployed: false, search_engine_indexed_pages: null,
  indexed_minimum_status: 'UNVERIFIED_NO_SEARCH_CONSOLE_EVIDENCE',
  remaining_indexed_pages_to_minimum: null,
  remaining_indexed_pages_to_target: null,
  local_content_gap_to_minimum: Math.max(0, minimum - unique.size),
  claim_boundary: 'Local built sitemap inventory, not evidence of deployment, search-engine indexing or million-page rendering capacity. Hosting-layer noindex is checked separately by audit-indexability.mjs. Synthetic stress-test URLs never count as content.',
};
const output = resolve(root, 'artifacts/seo/indexable-inventory.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`${report.status}: ${unique.size.toLocaleString()} local indexable pages; ${report.remaining_to_target.toLocaleString()} short of target`);
console.log(`Indexed-page goal: minimum ${minimum.toLocaleString()}, target ${target.toLocaleString()}; actual indexed count unverified`);
if (process.argv.includes('--require-target') && unique.size < target) process.exitCode = 1;
if (process.argv.includes('--require-indexed-minimum')) {
  console.error('Indexed minimum cannot pass without verified search-engine indexing evidence. Built or submitted pages do not satisfy this gate.');
  process.exitCode = 1;
}
