import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { companyReference } from './lib/company-reference.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ciks = process.argv.slice(2);
if (!ciks.length || ciks.some((cik) => !/^\d{1,10}$/.test(cik))) throw new Error('Usage: node scripts/import-company-reference.mjs CIK [CIK ...]');
const directory = resolve(root, 'public/company-data');
mkdirSync(directory, { recursive: true });
// Sequential and slower than SEC's limit. Bulk expansion should use SEC's nightly bulk archive.
for (const input of ciks) {
  const cik = input.padStart(10, '0');
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const response = await fetch(url, { headers: { 'User-Agent': 'CanliCapital research reference canlicapital.com', Accept: 'application/json' }, signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) throw new Error(`SEC ${response.status}: ${url}`);
  const raw = await response.text();
  const record = companyReference(raw, { fetchedAt: new Date().toISOString(), expectedCik: cik });
  const archive = resolve(root, 'artifacts/seo/sec-source');
  mkdirSync(archive, { recursive: true });
  writeFileSync(resolve(archive, `${record.source_sha256}.json`), raw);
  const snapshots = resolve(directory, 'sources');
  mkdirSync(snapshots, { recursive: true });
  writeFileSync(resolve(snapshots, `${record.source_sha256}.json.gz`), gzipSync(raw));
  record.source_snapshot = `/company-data/sources/${record.source_sha256}.json.gz`;
  const file = resolve(directory, `${cik}.json`);
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const unchanged = previous && previous.name === record.name && JSON.stringify(previous.concepts) === JSON.stringify(record.concepts);
  record.content_updated_at = unchanged ? (previous.content_updated_at ?? previous.fetched_at) : record.fetched_at;
  writeFileSync(file + '.pending', JSON.stringify(record, null, 2) + '\n');
  renameSync(file + '.pending', file);
  console.log(`${cik}: ${record.name}, ${record.concepts.length} sourced financial histories`);
  await new Promise((done) => setTimeout(done, 250));
}
