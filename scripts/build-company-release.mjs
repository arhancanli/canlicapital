import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { createCompanyCatalog, catalogHash } from '../api/_lib/company-catalog.js';
import { createCompanyDownloadIndex } from '../api/_lib/company-download-index.js';
import { verifyCompanyReference } from './lib/company-reference.mjs';

// Validate the complete staged revision, then write one small pointer binding
// catalog and download roots. This does not grant publication or configure a host.
export async function buildCompanyRelease(catalogDir, deliveryDir) {
  const catalogManifest = JSON.parse(readFileSync(resolve(catalogDir, 'catalog.json')));
  const delivery = JSON.parse(readFileSync(resolve(deliveryDir, 'delivery.json')));
  const catalog = createCompanyCatalog({ rootHash: catalogManifest.root_hash, readObject: hash => readFileSync(resolve(catalogDir, `objects/${hash}.json`)) });
  const index = createCompanyDownloadIndex({ rootHash: delivery.download_index.root_hash, readObject: hash => readFileSync(resolve(deliveryDir, `objects/${hash}.json`)) });
  const delivered = new Map(delivery.files.map(item => [item.cik, item]));
  if (delivered.size !== delivery.files.length || delivered.size !== catalogManifest.companies) throw new Error('Release cohort mismatch');
  const load = async path => {
    const item = await index.find(path); if (!item) throw new Error('Release download missing');
    const bytes = readFileSync(resolve(deliveryDir, item.storage_path));
    if (bytes.length !== item.bytes || catalogHash(bytes) !== item.sha256) throw new Error('Release download corruption');
    return bytes;
  };
  let after = '', companies = 0, histories = 0;
  do {
    const page = await catalog.listCompanies({ after, limit: 50 });
    for (const entry of page.companies) {
      const company = await catalog.getCompany(entry.cik), mapping = delivered.get(entry.cik);
      if (!mapping || mapping.source_sha256 !== company.source_sha256) throw new Error('Release source identity mismatch');
      const sourcePath = `/company-data/sources/${company.source_sha256}.json.gz`;
      const selected = JSON.parse(await load(`/company-data/${entry.cik}.json`));
      if (!isDeepStrictEqual(selected, { ...company, source_snapshot: sourcePath })) throw new Error('Release selected record mismatch');
      verifyCompanyReference(company, gunzipSync(await load(sourcePath), { maxOutputLength: 64 * 1024 * 1024 }));
      companies++; histories += company.concepts.length;
    }
    after = page.next;
  } while (after);
  if (companies !== delivered.size) throw new Error('Release catalog count mismatch');
  const release = { schema: 'canli.company-release.v1', catalog_root: catalog.revision, download_root: delivery.download_index.root_hash, companies, histories, publication_approved: false };
  const bytes = Buffer.from(JSON.stringify(release, null, 2) + '\n'), hash = catalogHash(bytes);
  const object = resolve(deliveryDir, 'objects', hash + '.json');
  if (existsSync(object)) { if (catalogHash(readFileSync(object)) !== hash) throw new Error('Existing release object is corrupt'); }
  else { writeFileSync(object + '.pending', bytes); renameSync(object + '.pending', object); }
  const pointer = { ...release, release_hash: hash };
  writeFileSync(resolve(deliveryDir, 'company-release.json.pending'), JSON.stringify(pointer, null, 2) + '\n');
  renameSync(resolve(deliveryDir, 'company-release.json.pending'), resolve(deliveryDir, 'company-release.json'));
  return pointer;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [catalog, delivery] = process.argv.slice(2);
  if (!catalog || !delivery) throw new Error('Usage: node scripts/build-company-release.mjs CATALOG DELIVERY');
  console.log(JSON.stringify(await buildCompanyRelease(resolve(catalog), resolve(delivery)), null, 2));
}
