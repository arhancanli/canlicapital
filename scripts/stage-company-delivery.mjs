import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { reviewCandidates } from './review-company-candidates.mjs';
import { verifyCompanyReference } from './lib/company-reference.mjs';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { buildCompanyDownloadIndex } from './lib/build-company-download-index.mjs';
export function stageCompanyDelivery(input, output, pilots) {
  input = resolve(input); output = resolve(output);
  if (output === resolve('/') || input === output || input.startsWith(output + '/') || output.startsWith(input + '/')) throw new Error('Delivery and capture directories must be separate');
  const review = reviewCandidates(input);
  if (!review.complete || review.errors.length || review.exclusions.length) throw new Error('Complete reproduced capture cohort required');
  mkdirSync(resolve(output, 'objects'), { recursive: true });
  const files = [];
  const save = (path, bytes) => {
    const sha256 = catalogHash(bytes), storage = `objects/${sha256}.${path.endsWith('.gz') ? 'json.gz' : 'json'}`;
    const file = resolve(output, storage);
    if (existsSync(file)) { if (catalogHash(readFileSync(file)) !== sha256) throw new Error('Existing delivery object is corrupt'); }
    else { writeFileSync(file + '.pending', bytes); renameSync(file + '.pending', file); }
    return { path: '/' + path, storage_path: storage, sha256, bytes: bytes.length };
  };
  function publish(record, compressed, scope) {
    const original = gunzipSync(compressed, { maxOutputLength: 64 * 1024 * 1024 });
    verifyCompanyReference(record, original);
    const source = save(`company-data/sources/${record.source_sha256}.json.gz`, compressed);
    const json = Buffer.from(JSON.stringify({ ...record, source_snapshot: source.path }, null, 2) + '\n');
    const selected = save(`company-data/${record.cik}.json`, json);
    files.push({ scope, cik: record.cik, source_sha256: record.source_sha256, source, selected });
  }
  for (const candidate of review.candidates) {
    const record = JSON.parse(readFileSync(resolve(input, candidate.cik + '.record.json')));
    publish(record, readFileSync(resolve(input, record.source_sha256 + '.json.gz')), 'fresh-review');
  }
  if (pilots) for (const name of readdirSync(pilots).filter(name => /^\d{10}\.json$/.test(name)).sort()) {
    const record = JSON.parse(readFileSync(resolve(pilots, name)));
    if (!/^[a-f0-9]{64}$/.test(record.source_sha256)) throw new Error('Invalid pilot source binding');
    publish(record, readFileSync(resolve(pilots, 'sources', record.source_sha256 + '.json.gz')), 'pilot');
  }
  if (new Set(files.map(file => file.cik)).size !== files.length) throw new Error('Duplicate delivery company');
  const download_index = buildCompanyDownloadIndex(files.flatMap(item => [item.source, item.selected]), output);
  const manifest = { schema: 'canli.company-delivery.v1', publication_approved: false, download_index, files };
  writeFileSync(resolve(output, 'delivery.json.pending'), JSON.stringify(manifest, null, 2) + '\n');
  renameSync(resolve(output, 'delivery.json.pending'), resolve(output, 'delivery.json'));
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, pilots] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/stage-company-delivery.mjs CAPTURES OUTPUT [PILOT_DIRECTORY]');
  const manifest = stageCompanyDelivery(input, output, pilots);
  console.log(`Staged original/selected downloads for ${manifest.files.length} companies; not published`);
}
