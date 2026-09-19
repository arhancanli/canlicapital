import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { verifyCompanyReference } from './lib/company-reference.mjs';
import { resolve } from 'node:path';
import { reviewCandidates } from './review-company-candidates.mjs';
import { buildCompanyCatalog } from './lib/build-company-catalog.mjs';
const [input, output, pilots] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/build-staged-company-catalog.mjs CAPTURE_DIRECTORY OUTPUT_DIRECTORY [PILOT_DIRECTORY]');
const review = reviewCandidates(resolve(input));
if (!review.complete || review.errors.length || review.exclusions.length) throw new Error('A complete, reproduced cohort is required before catalog staging');
function* records() {
  for (const company of review.candidates) yield JSON.parse(readFileSync(resolve(input, company.cik + '.record.json'), 'utf8'));
  if (pilots) for (const name of readdirSync(pilots).filter(name => /^\d{10}\.json$/.test(name)).sort()) {
    const record = JSON.parse(readFileSync(resolve(pilots, name)));
    if (!/^[a-f0-9]{64}$/.test(record.source_sha256)) throw new Error('Invalid pilot source binding');
    verifyCompanyReference(record, gunzipSync(readFileSync(resolve(pilots, 'sources', record.source_sha256 + '.json.gz')), { maxOutputLength: 64 * 1024 * 1024 }));
    yield record;
  }
}
console.log(JSON.stringify(buildCompanyCatalog(records(), resolve(output)), null, 2));
