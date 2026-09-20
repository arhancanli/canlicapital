// Measure unused source concepts for taxonomy review; never admit or render them.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { CONCEPTS, selectObservations, CompanyReferenceError } from './lib/company-reference.mjs';
import { EXTENDED_CONCEPTS } from './lib/company-extended-concepts.mjs';
const [output, ...directories] = process.argv.slice(2);
if (!output || !directories.length) throw new Error('Usage: node scripts/inventory-company-concept-coverage.mjs REPORT DELIVERY...');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const supported = new Set(Object.keys({ ...CONCEPTS, ...EXTENDED_CONCEPTS }));
const allowedUnits = new Set(['USD', 'shares', 'USD/shares', 'pure']);
const seen = new Set(), concepts = new Map(), bindings = [], sourceBindings = [];
function readBound(directory, descriptor) {
  const bytes = readFileSync(resolve(directory, descriptor.storage_path));
  assert.equal(bytes.length, descriptor.bytes); assert.equal(sha(bytes), descriptor.sha256);
  return bytes;
}
for (const directory of directories) {
  const path = resolve(directory, 'delivery.json'), bytes = readFileSync(path), manifest = JSON.parse(bytes);
  assert.equal(manifest.schema, 'canli.company-delivery.v1');
  bindings.push({ path, sha256: sha(bytes), selection_policy: manifest.selection_policy, companies: manifest.files.length });
  for (const item of manifest.files) {
    assert.ok(!seen.has(item.cik), 'Overlapping delivery company'); seen.add(item.cik);
    const selected = JSON.parse(readBound(directory, item.selected));
    const raw = gunzipSync(readBound(directory, item.source), { maxOutputLength: 64 * 1024 * 1024 });
    assert.equal(sha(raw), selected.source_sha256); assert.equal(selected.cik, item.cik);
    const source = JSON.parse(raw); assert.equal(Number(item.cik), source.cik);
    sourceBindings.push({ cik: item.cik, source_sha256: sha(raw), fetched_at: selected.fetched_at });
    const asOf = selected.fetched_at.slice(0, 10);
    for (const [tag, fact] of Object.entries(source.facts?.['us-gaap'] ?? {})) {
      if (supported.has(tag) || !/^[A-Za-z][A-Za-z0-9]{0,99}$/.test(tag)) continue;
      if (!concepts.has(tag)) concepts.set(tag, { tag, labels: new Set(), source_companies: 0,
        companies_with_structural_history: 0, current_history_companies: 0,
        period_kind_companies: { instant: 0, duration: 0 }, unit_companies: {},
        selector_error_companies: 0, examples: [] });
      const entry = concepts.get(tag); entry.source_companies++;
      if (typeof fact?.label === 'string' && entry.labels.size < 5) entry.labels.add(fact.label);
      const qualifying = [], errors = new Set();
      for (const kind of ['instant', 'duration']) {
        let rows;
        try { rows = selectObservations(fact, kind, asOf); }
        catch (error) {
          if (!(error instanceof CompanyReferenceError)) throw error;
          errors.add(error.code); continue;
        }
        const groups = new Map();
        for (const row of rows) {
          if (!allowedUnits.has(row.unit)) continue;
          if (!groups.has(row.unit)) groups.set(row.unit, []);
          groups.get(row.unit).push(row);
        }
        for (const [unit, observations] of groups) {
          if (new Set(observations.map(row => row.end)).size < 3 || new Set(observations.map(row => row.val)).size < 2) continue;
          qualifying.push({ kind, unit, observations });
        }
      }
      if (errors.size) entry.selector_error_companies++;
      // A conflicting/malformed concept never contributes to the coverage count.
      if (errors.size || !qualifying.length) continue;
      entry.companies_with_structural_history++;
      for (const kind of new Set(qualifying.map(group => group.kind))) entry.period_kind_companies[kind]++;
      for (const unit of new Set(qualifying.map(group => group.unit))) entry.unit_companies[unit] = (entry.unit_companies[unit] ?? 0) + 1;
      const latest = qualifying.flatMap(group => group.observations.map(row => row.end)).sort().at(-1);
      if (Date.parse(asOf) - Date.parse(latest) <= 2 * 366 * 86400000) entry.current_history_companies++;
      if (entry.examples.length < 5) entry.examples.push({ cik: item.cik, source_sha256: selected.source_sha256,
        latest_reporting_end: latest, groups: qualifying.map(group => ({ kind: group.kind, unit: group.unit,
          reporting_ends: new Set(group.observations.map(row => row.end)).size })) });
    }
    if (seen.size % 250 === 0) process.stderr.write(`Inventoried ${seen.size} source snapshots\n`);
  }
}
const inventory = [...concepts.values()].map(row => ({ ...row, labels: [...row.labels].sort() }))
  .sort((a, b) => b.companies_with_structural_history - a.companies_with_structural_history || a.tag.localeCompare(b.tag));
const report = { schema: 'canli.company-concept-coverage-inventory.v1', publication_approved: false,
  source_companies: seen.size, existing_concepts_excluded: [...supported].sort(), bindings, source_bindings: sourceBindings,
  rules: { annual_form_selector: true, minimum_reporting_ends_per_unit: 3, minimum_distinct_values_per_unit: 2,
    measured_units: [...allowedUnits], future_observations_excluded: true, concept_kind: 'Both instant and annual-duration probes; taxonomy period type is NOT independently verified.',
    errors: 'Any selector conflict/malformed fact removes that company/concept from structural coverage.' },
  concepts: inventory, scope: 'Structural inventory of unused us-gaap tags in exact captured snapshots. Counts are company/concept coverage, not admitted pages, unique search intents, semantic correctness, forecast coverage or indexing. Alternative accounting tags can overlap; definitions, source scope and usefulness require review before any policy change.',
  code_sha256: sha(readFileSync(new URL(import.meta.url))),
  selector_sha256: sha(readFileSync(new URL('./lib/company-reference.mjs', import.meta.url))) };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ companies: report.source_companies, unused_tags_seen: inventory.length,
  tags_with_history: inventory.filter(row => row.companies_with_structural_history).length,
  top: inventory.slice(0, 15).map(({tag, companies_with_structural_history, current_history_companies}) => ({tag, companies_with_structural_history, current_history_companies})) }));
