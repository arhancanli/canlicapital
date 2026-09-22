import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { validateDownloadDescriptor } from '../api/_lib/company-download-index.js';
import { buildCompanyFilingsCatalog } from './lib/build-company-filings-catalog.mjs';
import { FILINGS_POLICY, companyFilings, conceptDefinitions, verifyFilingsBinding } from './lib/company-filings.mjs';

// Derive one filings document per delivered company from the retained source
// bytes and store the documents as a filings catalog beside the company catalog.
// The selector runs again on the same bytes, so every document is bound to the
// selected record the delivery already holds; a company whose filings are all
// thin or withheld gets no document and its filing paths answer 404. Building
// grants no publication and configures no host.
export function buildCompanyFilings(catalogDir, deliveryDir, output, { log = () => {} } = {}) {
  const catalogManifest = JSON.parse(readFileSync(resolve(catalogDir, 'catalog.json')));
  const manifestBytes = readFileSync(resolve(deliveryDir, 'delivery.json'));
  const delivery = JSON.parse(manifestBytes);
  if (delivery.schema !== 'canli.company-delivery.v1' || !Array.isArray(delivery.files)) throw new Error('Invalid delivery manifest');
  const selectionPolicy = delivery.selection_policy;
  conceptDefinitions(selectionPolicy); // rejects a delivery whose policy has no filing definitions
  const ciks = new Set(delivery.files.map(item => item.cik));
  if (ciks.size !== delivery.files.length || ciks.size !== catalogManifest.companies) throw new Error('Filings cohort mismatch');
  const load = descriptor => {
    validateDownloadDescriptor(descriptor);
    const bytes = readFileSync(resolve(deliveryDir, descriptor.storage_path));
    if (bytes.length !== descriptor.bytes || catalogHash(bytes) !== descriptor.sha256) throw new Error('Delivery object corruption');
    return bytes;
  };
  const totals = { companies: 0, filings: 0, thin_filings: 0, withheld_filings: 0, accessions_seen: 0, diagnostics: {} };
  const without = [];
  function* documents() {
    for (const item of delivery.files) {
      if (item.source.path !== `/company-data/sources/${item.source_sha256}.json.gz` || item.selected.path !== `/company-data/${item.cik}.json`) throw new Error('Delivery download paths do not match the company');
      const selected = JSON.parse(load(item.selected));
      const raw = gunzipSync(load(item.source), { maxOutputLength: 64 * 1024 * 1024 });
      if (catalogHash(raw) !== item.source_sha256) throw new Error('Source snapshot does not match its recorded hash');
      const document = companyFilings(raw.toString('utf8'), { fetchedAt: selected.fetched_at, expectedCik: item.cik, selectionPolicy });
      totals.companies++; totals.filings += document.filings.length;
      totals.thin_filings += document.summary.thin_filings; totals.withheld_filings += document.summary.withheld_filings; totals.accessions_seen += document.summary.accessions_seen;
      for (const [key, value] of Object.entries(document.summary.diagnostics)) totals.diagnostics[key] = (totals.diagnostics[key] ?? 0) + value;
      if (totals.companies % 100 === 0) log({ companies: totals.companies, filings: totals.filings, without: without.length });
      if (!document.filings.length) { without.push(item.cik); continue; }
      verifyFilingsBinding(document, selected);
      yield document;
    }
  }
  const manifest = buildCompanyFilingsCatalog(documents(), output);
  if (manifest.companies !== totals.companies - without.length || manifest.filings !== totals.filings) throw new Error('Filings catalog counts do not match the derivation');
  const build = {
    schema: 'canli.company-filings-build.v1', publication_approved: false,
    filings_policy: FILINGS_POLICY, selection_policy: selectionPolicy,
    catalog_root: catalogManifest.root_hash, delivery_manifest_sha256: catalogHash(manifestBytes), root_hash: manifest.root_hash,
    companies_delivered: totals.companies, companies_with_filings: manifest.companies, companies_without_filings: without,
    filings: manifest.filings, thin_filings: totals.thin_filings, withheld_filings: totals.withheld_filings, accessions_seen: totals.accessions_seen, diagnostics: totals.diagnostics,
    index_levels: manifest.index_levels, index_nodes: manifest.index_nodes, object_bytes: manifest.object_bytes, inflated_bytes: manifest.inflated_bytes,
    code_sha256: catalogHash(readFileSync(new URL(import.meta.url))),
    library_sha256: catalogHash(readFileSync(new URL('./lib/company-filings.mjs', import.meta.url))),
  };
  writeFileSync(resolve(output, 'filings-build.json.pending'), JSON.stringify(build, null, 2) + '\n');
  renameSync(resolve(output, 'filings-build.json.pending'), resolve(output, 'filings-build.json'));
  return build;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [catalog, delivery, output] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node scripts/build-company-filings.mjs CATALOG DELIVERY OUTPUT');
  const build = buildCompanyFilings(resolve(catalog), resolve(delivery), resolve(output), { log: progress => console.log(JSON.stringify(progress)) });
  const { companies_without_filings: without, diagnostics, ...summary } = build;
  console.log(JSON.stringify({ ...summary, companies_without_filings: without.length }, null, 2));
}
