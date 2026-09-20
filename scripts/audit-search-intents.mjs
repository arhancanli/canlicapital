import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localSitemapUrls } from './lib/sitemaps.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://canlicapital.com';
const normalize = (query) => query.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');

export function validateIntents(intents, urls) {
  const available = new Set(urls);
  const paths = new Set(), owners = new Map();
  for (const entry of intents) {
    if (!entry.path?.startsWith('/') || entry.path.includes('?') || entry.path.includes('#') || !available.has(origin + entry.path)) throw new Error(`Intent owner is not an indexable canonical: ${entry.path}`);
    if (paths.has(entry.path)) throw new Error(`Duplicate intent owner: ${entry.path}`);
    paths.add(entry.path);
    if (!entry.intent?.trim() || !entry.queries?.length) throw new Error(`Missing intent or queries: ${entry.path}`);
    for (const query of entry.queries) {
      const key = normalize(query);
      if (!key) throw new Error('Empty query');
      if (owners.has(key)) throw new Error(`Query has duplicate owners: ${query}`);
      owners.set(key, entry.path);
    }
  }
  return { canonical_owners: paths.size, query_hypotheses: owners.size };
}

function audit() {
  const config = JSON.parse(readFileSync(resolve(root, 'config/search-intents.json')));
  const urls = localSitemapUrls(resolve(root, 'dist'));
  const intents = [...config.intents];
  for (const file of readdirSync(resolve(root, 'public/company-data')).filter(f => /^\d{10}\.json$/.test(f))) {
    const company = JSON.parse(readFileSync(resolve(root, 'public/company-data', file)));
    const path = `/companies/${company.cik}`;
    intents.push({ path, intent: `Inspect ${company.name} accounting histories and source filings`, queries: [`${company.name} financial history`], source: `/company-data/${file}` });
    for (const concept of company.concepts) intents.push({ path: `${path}/${concept.tag}`, intent: `Inspect ${company.name} ${concept.label.toLowerCase()} by reporting period and filing`, queries: [`${company.name} ${concept.label.toLowerCase()} history`], source: `/company-data/${file}`, concept: `us-gaap:${concept.tag}` });
  }
  const counts = validateIntents(intents, urls);
  const assigned = new Set(intents.map(e => origin + e.path));
  const report = {
    schema: 'canli.search-intent-audit.v1', measurement_status: config.measurement_status,
    ...counts, local_indexable_pages: urls.length,
    unassigned_canonicals: urls.filter(url => !assigned.has(url)),
    intents, claim_boundary: 'Editorial keyword ownership, not measured demand, rankings, exhaustive topic coverage or indexed-page evidence. Unassigned pages require review; no automatic keyword pages are generated.',
  };
  const output = resolve(root, 'artifacts/seo/search-intents.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Intent audit: ${counts.canonical_owners} canonical owners, ${counts.query_hypotheses} query hypotheses, ${report.unassigned_canonicals.length} unassigned pages for review`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) audit();
