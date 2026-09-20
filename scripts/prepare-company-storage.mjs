import { readFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { createCompanyCatalog, catalogHash } from '../api/_lib/company-catalog.js';
import { createCompanyDownloadIndex, validateDownloadDescriptor } from '../api/_lib/company-download-index.js';
import { verifyCompanyReference } from './lib/company-reference.mjs';

// Collect only reachable immutable objects. The plan performs no network writes
// and is not a substitute for editorial approval or capture-evidence backup.
export async function prepareCompanyStorage(catalogDir, deliveryDir) {
  const entries = new Map();
  function collect(namespace, path, hash, expectedBytes) {
    if (!/^objects\/[a-f0-9]{64}\.json(?:\.gz)?$/.test(path)) throw new Error('Invalid storage object path');
    const source = resolve(namespace === 'catalog' ? catalogDir : deliveryDir, path);
    if (statSync(source).size > 16 * 1024 * 1024) throw new Error('Storage object exceeds byte bound');
    const bytes = readFileSync(source);
    if (catalogHash(bytes) !== hash || (expectedBytes !== undefined && bytes.length !== expectedBytes)) throw new Error('Storage object binding mismatch');
    const key = `${namespace}/${path}`;
    const entry = { key, local_path: source, sha256: hash, bytes: bytes.length,
      content_type: path.endsWith('.gz') ? 'application/gzip' : 'application/json',
      cache_control: 'public, max-age=31536000, immutable' };
    if (entries.has(key) && !isDeepStrictEqual(entries.get(key), entry)) throw new Error('Conflicting storage object');
    entries.set(key, entry);
    return bytes;
  }
  const catalogPointer = JSON.parse(readFileSync(resolve(catalogDir, 'catalog.json')));
  const manifestBytes = readFileSync(resolve(deliveryDir, 'delivery.json'));
  const manifest = JSON.parse(manifestBytes);
  const pointer = JSON.parse(readFileSync(resolve(deliveryDir, 'company-release.json')));
  const release = JSON.parse(collect('delivery', `objects/${pointer.release_hash}.json`, pointer.release_hash));
  const { release_hash, ...pointerBody } = pointer;
  if (!isDeepStrictEqual(release, pointerBody) || release.schema !== 'canli.company-release.v1' ||
      release.publication_approved !== false || release.catalog_root !== catalogPointer.root_hash ||
      release.download_root !== manifest.download_index.root_hash) throw new Error('Mixed or invalid storage release inputs');
  const catalog = createCompanyCatalog({ rootHash: release.catalog_root,
    readObject: hash => collect('catalog', `objects/${hash}.json`, hash) });
  const index = createCompanyDownloadIndex({ rootHash: release.download_root,
    readObject: hash => collect('delivery', `objects/${hash}.json`, hash) });
  const seen = new Set(); let histories = 0;
  for (const item of manifest.files) {
    if (seen.has(item.cik)) throw new Error('Duplicate delivery company');
    seen.add(item.cik);
    const company = await catalog.getCompany(item.cik);
    if (!company || company.selection_policy !== manifest.selection_policy || company.source_sha256 !== item.source_sha256) throw new Error('Storage company identity mismatch');
    async function load(descriptor) {
      validateDownloadDescriptor(descriptor);
      if (!isDeepStrictEqual(await index.find(descriptor.path), descriptor)) throw new Error('Storage download mapping mismatch');
      return collect('delivery', descriptor.storage_path, descriptor.sha256, descriptor.bytes);
    }
    const selected = JSON.parse(await load(item.selected));
    if (item.source.path !== `/company-data/sources/${company.source_sha256}.json.gz` ||
        item.selected.path !== `/company-data/${company.cik}.json` ||
        !isDeepStrictEqual(selected, { ...company, source_snapshot: item.source.path })) throw new Error('Storage selected record mismatch');
    verifyCompanyReference(company, gunzipSync(await load(item.source), { maxOutputLength: 64 * 1024 * 1024 }));
    histories += company.concepts.length;
  }
  const first = await catalog.directoryPage(1);
  if (seen.size !== release.companies || histories !== release.histories || first.total !== release.companies) throw new Error('Storage release counts mismatch');
  for (const source of manifest.source_deliveries ?? []) {
    if (source.storage_path !== `objects/${source.manifest_sha256}.json`) throw new Error('Invalid archived manifest path');
    const archived = JSON.parse(collect('delivery', source.storage_path, source.manifest_sha256, source.bytes));
    if (archived.schema !== 'canli.company-delivery.v1' || archived.source_deliveries) throw new Error('Invalid original cohort archive');
    const originalIndex = createCompanyDownloadIndex({ rootHash: archived.download_index.root_hash,
      readObject: hash => collect('delivery', `objects/${hash}.json`, hash) });
    for (const item of archived.files) {
      if (!seen.has(item.cik)) throw new Error('Archived company is absent from combined release');
      for (const descriptor of [item.source, item.selected]) {
        validateDownloadDescriptor(descriptor);
        if (!isDeepStrictEqual(await originalIndex.find(descriptor.path), descriptor) ||
            !isDeepStrictEqual(await index.find(descriptor.path), descriptor)) throw new Error('Archived download mapping mismatch');
        collect('delivery', descriptor.storage_path, descriptor.sha256, descriptor.bytes);
      }
    }
  }
  const files = [...entries.values()].sort((a, b) => a.key.localeCompare(b.key));
  return { schema: 'canli.company-storage-plan.v1', publication_approved: false, release_hash,
    catalog_root: release.catalog_root, download_root: release.download_root,
    delivery_manifest_sha256: catalogHash(manifestBytes), companies: seen.size, histories,
    objects: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), files,
    scope: 'Verified runtime objects plus archived cohort manifests/indexes. Excludes original capture queues/HTTP-exclusion bodies, which require separate evidence backup; no upload, deployment or editorial approval.',
    requirements: ['Use fixed HTTPS catalog/ and delivery/ bases under a dedicated object prefix.',
      'Upload immutable keys without overwrite; verify existing and uploaded object bytes against SHA-256.',
      'Serve gzip snapshots as application/gzip without Content-Encoding transformation.',
      'Do not activate the release until remote retrieval and hosted preview verification pass.'],
    code_sha256: catalogHash(readFileSync(new URL(import.meta.url))) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [catalog, delivery, output] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node scripts/prepare-company-storage.mjs CATALOG DELIVERY REPORT');
  const plan = await prepareCompanyStorage(catalog, delivery);
  writeFileSync(output + '.pending', JSON.stringify(plan, null, 2) + '\n'); renameSync(output + '.pending', output);
  console.log(JSON.stringify({ objects: plan.objects, bytes: plan.bytes, companies: plan.companies, histories: plan.histories, release_hash: plan.release_hash, uploaded: false }));
}
