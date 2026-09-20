import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, openSync, closeSync, unlinkSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { createCompanyDownloadIndex, validateDownloadDescriptor } from '../api/_lib/company-download-index.js';
import { verifyCompanyReference } from './lib/company-reference.mjs';
import { buildCompanyDownloadIndex } from './lib/build-company-download-index.mjs';

// Pins must come from the operator's independently reviewed cohorts. Hash binding
// preserves their evidence; it does not establish editorial or publication approval.
export async function combineCompanyDeliveries(inputs, output) {
  if (!Array.isArray(inputs) || inputs.length < 2) throw new Error('At least two pinned source deliveries required');
  output = resolve(output);
  if (output === resolve('/')) throw new Error('Invalid combined delivery directory');
  mkdirSync(output, { recursive: true });
  output = realpathSync(output);
  const snapshots = inputs.map(input => {
    if (!/^[a-f0-9]{64}$/.test(input.manifest_sha256)) throw new Error('Source delivery manifest pin required');
    const directory = realpathSync(resolve(input.directory));
    if (directory === output || directory.startsWith(output + '/') || output.startsWith(directory + '/')) throw new Error('Input and combined delivery directories must be separate');
    const bytes = readFileSync(resolve(directory, 'delivery.json'));
    if (catalogHash(bytes) !== input.manifest_sha256) throw new Error('Source delivery manifest pin mismatch');
    const manifest = JSON.parse(bytes);
    if (manifest.schema !== 'canli.company-delivery.v1' || manifest.publication_approved !== false || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Invalid staged source delivery');
    if (manifest.source_deliveries) throw new Error('Use original cohort inputs rather than recursively combined deliveries');
    return { directory, bytes, manifest, hash: input.manifest_sha256 };
  });
  if (new Set(snapshots.map(row => row.directory)).size !== snapshots.length) throw new Error('Duplicate input delivery');
  const policy = snapshots[0].manifest.selection_policy;
  if (snapshots.some(row => row.manifest.selection_policy !== policy)) throw new Error('Cannot combine different selection policies');
  const lock = resolve(output, '.combine.lock'), fd = openSync(lock, 'wx');
  try {
    mkdirSync(resolve(output, 'objects'), { recursive: true });
    const files = [], seen = new Set(), source_deliveries = [];
    function save(storage, bytes) {
      const path = resolve(output, storage);
      if (existsSync(path)) {
        if (!readFileSync(path).equals(bytes)) throw new Error('Existing combined object is corrupt');
      } else {
        writeFileSync(path + '.pending', bytes); renameSync(path + '.pending', path);
      }
    }
    for (const snapshot of snapshots) {
      const { directory, manifest, bytes, hash } = snapshot;
      const index = createCompanyDownloadIndex({ rootHash: manifest.download_index?.root_hash,
        readObject: hash => {
          const data = readFileSync(resolve(directory, 'objects', hash + '.json'));
          if (catalogHash(data) !== hash) throw new Error('Source download index corruption');
          save(`objects/${hash}.json`, data);
          return data;
        } });
      async function load(descriptor) {
        validateDownloadDescriptor(descriptor);
        if (!isDeepStrictEqual(await index.find(descriptor.path), descriptor)) throw new Error('Source download index binding mismatch');
        const data = readFileSync(resolve(directory, descriptor.storage_path));
        if (data.length !== descriptor.bytes || catalogHash(data) !== descriptor.sha256) throw new Error('Source delivery object corruption');
        return data;
      }
      for (const item of manifest.files) {
        if (!/^\d{10}$/.test(item.cik) || seen.has(item.cik)) throw new Error('Invalid or duplicate combined company');
        seen.add(item.cik);
        const selectedBytes = await load(item.selected), sourceBytes = await load(item.source);
        const record = JSON.parse(selectedBytes);
        if (record.cik !== item.cik || record.selection_policy !== policy || record.source_sha256 !== item.source_sha256 ||
            item.selected.path !== `/company-data/${item.cik}.json` ||
            item.source.path !== `/company-data/sources/${item.source_sha256}.json.gz` || record.source_snapshot !== item.source.path) throw new Error('Source company identity or policy mismatch');
        verifyCompanyReference(record, gunzipSync(sourceBytes, { maxOutputLength: 64 * 1024 * 1024 }));
        save(item.selected.storage_path, selectedBytes); save(item.source.storage_path, sourceBytes);
        files.push(item);
      }
      // Archive exact manifests, including exclusions and queue/refresh bindings.
      const storage_path = `objects/${hash}.json`;
      save(storage_path, bytes);
      source_deliveries.push({ manifest_sha256: hash, storage_path, bytes: bytes.length, companies: manifest.files.length,
        ...(manifest.capture_review ? { capture_review: manifest.capture_review } : {}) });
    }
    files.sort((a, b) => a.cik.localeCompare(b.cik));
    const download_index = buildCompanyDownloadIndex(files.flatMap(item => [item.source, item.selected]), output);
    for (const snapshot of snapshots) {
      if (!readFileSync(resolve(snapshot.directory, 'delivery.json')).equals(snapshot.bytes)) throw new Error('Input delivery changed during combination');
    }
    const manifest = { schema: 'canli.company-delivery.v1', publication_approved: false,
      ...(policy ? { selection_policy: policy } : {}), source_deliveries, download_index, files };
    writeFileSync(resolve(output, 'delivery.json.pending'), JSON.stringify(manifest, null, 2) + '\n');
    renameSync(resolve(output, 'delivery.json.pending'), resolve(output, 'delivery.json'));
    return manifest;
  } finally { closeSync(fd); unlinkSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [inputFile, output] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node scripts/combine-company-deliveries.mjs PINNED_INPUTS.json OUTPUT');
  const result = await combineCompanyDeliveries(JSON.parse(readFileSync(inputFile)), output);
  console.log(JSON.stringify({ companies: result.files.length, cohorts: result.source_deliveries.length,
    download_root: result.download_index.root_hash, publication_approved: false }, null, 2));
}
