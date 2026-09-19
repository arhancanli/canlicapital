import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reviewCandidates } from './review-company-candidates.mjs';
import { buildCompanyCatalog } from './lib/build-company-catalog.mjs';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/build-staged-company-catalog.mjs CAPTURE_DIRECTORY OUTPUT_DIRECTORY');
const review = reviewCandidates(resolve(input));
if (!review.complete || review.errors.length || review.exclusions.length) throw new Error('A complete, reproduced cohort is required before catalog staging');
function* records() {
  for (const company of review.candidates) yield JSON.parse(readFileSync(resolve(input, company.cik + '.record.json'), 'utf8'));
}
console.log(JSON.stringify(buildCompanyCatalog(records(), resolve(output)), null, 2));
