import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { buildCompanyCatalog } from './lib/build-company-catalog.mjs';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { validateDownloadDescriptor } from '../api/_lib/company-download-index.js';
import { verifyCompanyReference } from './lib/company-reference.mjs';
const [input, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: node scripts/build-company-catalog-from-delivery.mjs DELIVERY CATALOG');
const delivery = JSON.parse(readFileSync(resolve(input, 'delivery.json')));
function load(item) {
  validateDownloadDescriptor(item);
  const bytes = readFileSync(resolve(input, item.storage_path));
  if (bytes.length !== item.bytes || catalogHash(bytes) !== item.sha256) throw new Error('Delivery object does not match binding');
  return bytes;
}
function* records() {
  for (const item of delivery.files) {
    const record = JSON.parse(load(item.selected));
    if (record.cik !== item.cik || record.selection_policy !== delivery.selection_policy) throw new Error('Delivery policy or identity mismatch');
    verifyCompanyReference(record, gunzipSync(load(item.source), { maxOutputLength: 64 * 1024 * 1024 }));
    yield record;
  }
}
console.log(JSON.stringify(buildCompanyCatalog(records(), resolve(output)), null, 2));
