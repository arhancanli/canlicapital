import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { CONCEPTS, selectObservations } from './lib/company-reference.mjs';
const [deliveryDir, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: node scripts/audit-company-concept-breadth.mjs DELIVERY REPORT');
const manifestBytes = readFileSync(resolve(deliveryDir, 'delivery.json'));
const delivery = JSON.parse(manifestBytes), concepts = new Map(), companies = [];
let rejectedKinds = 0;
for (const item of delivery.files) {
  const compressed = readFileSync(resolve(deliveryDir, item.source.storage_path));
  if (catalogHash(compressed) !== item.source.sha256) throw new Error('Source gzip hash mismatch');
  const raw = gunzipSync(compressed, { maxOutputLength: 64 * 1024 * 1024 });
  if (catalogHash(raw) !== item.source_sha256) throw new Error('Original SEC hash mismatch');
  const selectedBytes = readFileSync(resolve(deliveryDir, item.selected.storage_path));
  if (catalogHash(selectedBytes) !== item.selected.sha256) throw new Error('Selected record hash mismatch');
  const record = JSON.parse(selectedBytes), source = JSON.parse(raw);
  if (String(source.cik).padStart(10, '0') !== item.cik || record.cik !== item.cik) throw new Error('Company identity mismatch');
  let count = 0, additional = 0, duplicateVectors = 0, zeroOnly = 0, constantValues = 0;
  const fingerprints = new Set();
  for (const [tag, fact] of Object.entries(source.facts?.['us-gaap'] ?? {})) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,99}$/.test(tag)) continue;
    const kinds = [], units = new Set(), vector = [], values = new Map();
    for (const kind of ['instant', 'duration']) {
      try {
        const rows = selectObservations(fact, kind, record.fetched_at.slice(0, 10));
        if (new Set(rows.map(row => row.end)).size >= 3) { kinds.push(kind); rows.forEach(row => {
          units.add(row.unit); vector.push([kind, row.unit, row.start ?? '', row.end, row.val, row.filed, row.accn]);
          if (!values.has(row.unit)) values.set(row.unit, new Set()); values.get(row.unit).add(row.val);
        }); }
      } catch { rejectedKinds++; }
    }
    if (!kinds.length) continue;
    const fingerprint = catalogHash(JSON.stringify(vector));
    const duplicate = fingerprints.has(fingerprint); fingerprints.add(fingerprint);
    const zero = vector.every(row => row[4] === 0);
    const constant = [...values.values()].every(values => values.size === 1);
    duplicateVectors += duplicate; zeroOnly += zero; constantValues += constant;
    const entry = concepts.get(tag) ?? { tag, source_label: fact.label ?? null, companies: 0, instant: 0, duration: 0, mixed_kind: 0, units: new Set(), zero_only: 0, constant_per_unit: 0, currently_selected: Object.hasOwn(CONCEPTS, tag) };
    entry.companies++; entry.zero_only += zero; entry.constant_per_unit += constant; entry.instant += kinds.includes('instant'); entry.duration += kinds.includes('duration'); entry.mixed_kind += kinds.length === 2;
    units.forEach(unit => entry.units.add(unit)); concepts.set(tag, entry);
    count++; additional += !entry.currently_selected;
  }
  companies.push({ cik: item.cik, observed_history_concepts: count, outside_current_selection: additional, duplicate_observation_vectors: duplicateVectors, zero_only_histories: zeroOnly, constant_per_unit_histories: constantValues });
}
const ranked = [...concepts.values()].map(item => ({ ...item, units: [...item.units].sort() })).sort((a, b) => b.companies - a.companies || a.tag.localeCompare(b.tag));
const report = { schema: 'canli.company-concept-breadth.v1', publication_approved: false, scope: 'Read-only source opportunity inventory. Three reporting ends under existing annual selection rules; observation shape is not authoritative taxonomy period-type classification. No new pages approved, generated, deployed or indexed.', delivery_manifest_sha256: catalogHash(manifestBytes), companies: companies.length, distinct_concepts: ranked.length, company_concept_histories: companies.reduce((sum, item) => sum + item.observed_history_concepts, 0), outside_current_selection: companies.reduce((sum, item) => sum + item.outside_current_selection, 0), duplicate_observation_vectors: companies.reduce((sum, item) => sum + item.duplicate_observation_vectors, 0), zero_only_histories: companies.reduce((sum, item) => sum + item.zero_only_histories, 0), constant_per_unit_histories: companies.reduce((sum, item) => sum + item.constant_per_unit_histories, 0), rejected_kind_selections: rejectedKinds, per_company: companies, concepts: ranked, code_sha256: catalogHash(readFileSync(new URL(import.meta.url))) };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ companies: report.companies, distinct_concepts: report.distinct_concepts, company_concept_histories: report.company_concept_histories, outside_current_selection: report.outside_current_selection, duplicate_observation_vectors: report.duplicate_observation_vectors, zero_only_histories: report.zero_only_histories, constant_per_unit_histories: report.constant_per_unit_histories, rejected_kind_selections: rejectedKinds, additional_top_20: ranked.filter(item => !item.currently_selected).slice(0, 20), publication_approved: false }, null, 2));
