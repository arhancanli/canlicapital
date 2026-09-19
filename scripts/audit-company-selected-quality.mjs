import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { validateDownloadDescriptor } from '../api/_lib/company-download-index.js';
import { verifyCompanyReference, CONCEPTS } from './lib/company-reference.mjs';
import { companyCoverage } from './lib/company-coverage.mjs';

const [directory, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: node scripts/audit-company-selected-quality.mjs DELIVERY REPORT');
const manifestBytes = readFileSync(resolve(directory, 'delivery.json'));
const manifest = JSON.parse(manifestBytes);
const seen = new Set(), flagged = [], duplicateGroups = [], concepts = new Map(), pairs = new Map();
const totals = { companies: 0, histories: 0, historical_only: 0, multiple_units: 0, partially_historical_units: 0, constant_per_unit: 0, zero_only: 0, equal_vector_groups: 0, pages_in_equal_vector_groups: 0, flagged_pages: 0 };
function load(descriptor) {
  validateDownloadDescriptor(descriptor);
  const bytes = readFileSync(resolve(directory, descriptor.storage_path));
  if (bytes.length !== descriptor.bytes || catalogHash(bytes) !== descriptor.sha256) throw new Error('Delivery object binding mismatch');
  return bytes;
}
for (const item of manifest.files) {
  if (seen.has(item.cik)) throw new Error('Duplicate company');
  seen.add(item.cik);
  const record = JSON.parse(load(item.selected));
  const raw = gunzipSync(load(item.source), { maxOutputLength: 64 * 1024 * 1024 });
  if (record.cik !== item.cik || record.selection_policy !== manifest.selection_policy || catalogHash(raw) !== item.source_sha256) throw new Error('Company/policy/source mismatch');
  verifyCompanyReference(record, raw);
  totals.companies++;
  const vectors = new Map(), rows = [];
  for (const concept of record.concepts) {
    totals.histories++;
    const coverage = companyCoverage(concept.observations, record.fetched_at);
    const units = coverage.units.map(unit => {
      const observations = concept.observations.filter(row => row.unit === unit);
      return { unit, ...companyCoverage(observations, record.fetched_at), distinct_values: new Set(observations.map(row => row.val)).size, reporting_ends: new Set(observations.map(row => row.end)).size };
    });
    const flags = [];
    if (coverage.historicalOnly) flags.push('historical_only');
    if (units.length > 1) flags.push('multiple_units');
    if (!coverage.historicalOnly && units.some(unit => unit.historicalOnly)) flags.push('partially_historical_units');
    if (units.every(unit => unit.distinct_values === 1)) flags.push('constant_per_unit');
    if (concept.observations.every(row => row.val === 0)) flags.push('zero_only');
    // Compare numerical histories independently of filing/accession differences.
    // Same data does not prove the concepts have the same economic meaning.
    const vector = concept.observations.map(row => [concept.kind, row.unit, row.start ?? '', row.end, row.val]);
    vector.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const fingerprint = catalogHash(JSON.stringify(vector));
    if (!vectors.has(fingerprint)) vectors.set(fingerprint, []);
    vectors.get(fingerprint).push(concept.tag);
    const row = { path: `/companies/${record.cik}/${concept.tag}`, cik: record.cik, tag: concept.tag, core: Object.hasOwn(CONCEPTS, concept.tag), fetched_at: record.fetched_at, first: coverage.first, last: coverage.last, flags, units };
    rows.push(row);
    const entry = concepts.get(concept.tag) ?? { tag: concept.tag, histories: 0, historical_only: 0, multiple_units: 0, partially_historical_units: 0, constant_per_unit: 0, zero_only: 0, equal_vector_pages: 0, flagged_pages: 0 };
    entry.histories++;
    for (const flag of flags) { totals[flag]++; entry[flag]++; }
    concepts.set(concept.tag, entry);
  }
  for (const [fingerprint, tags] of vectors) {
    if (tags.length < 2) continue;
    tags.sort();
    duplicateGroups.push({ cik: record.cik, tags, numerical_vector_sha256: fingerprint });
    totals.equal_vector_groups++; totals.pages_in_equal_vector_groups += tags.length;
    for (const tag of tags) { rows.find(row => row.tag === tag).flags.push('equal_numerical_vector'); concepts.get(tag).equal_vector_pages++; }
    for (let a = 0; a < tags.length; a++) for (let b = a + 1; b < tags.length; b++) {
      const key = `${tags[a]}|${tags[b]}`;
      const pair = pairs.get(key) ?? { tags: [tags[a], tags[b]], companies: 0 };
      pair.companies++; pairs.set(key, pair);
    }
  }
  for (const row of rows) if (row.flags.length) { flagged.push(row); totals.flagged_pages++; concepts.get(row.tag).flagged_pages++; }
}
const report = {
  schema: 'canli.company-selected-quality.v1', publication_approved: false,
  scope: 'Reproduced selected-record review queue, not publication decisions, live pages or indexed counts. Flags overlap. Equal numerical histories do not establish semantic equivalence; historical coverage does not establish issuer inactivity.',
  selection_policy: manifest.selection_policy ?? 'core-default', delivery_manifest_sha256: catalogHash(manifestBytes),
  rules: { historical: 'Latest reporting end is earlier than capture date minus two calendar years; independently checked for each unit.', equal_vector: 'Same company; all selected kind/unit/start/end/value tuples match after sorting. Filing date and accession are intentionally excluded.', constant: 'Every unit has one distinct numerical value across all selected observations.', unflagged: 'No flags under these narrow checks; not editorial approval or complete quality assurance.' },
  totals, concepts: [...concepts.values()].sort((a, b) => b.flagged_pages - a.flagged_pages || a.tag.localeCompare(b.tag)),
  equal_vector_pairs: [...pairs.values()].sort((a, b) => b.companies - a.companies || a.tags.join().localeCompare(b.tags.join())),
  equal_vector_groups: duplicateGroups, flagged_pages: flagged,
  code_sha256: catalogHash(readFileSync(new URL(import.meta.url))),
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...totals, pairs: report.equal_vector_pairs.slice(0, 12), publication_approved: false }, null, 2));
