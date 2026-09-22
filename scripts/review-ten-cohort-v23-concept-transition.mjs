// Transition proof for selection policy extended-v23 (expanded concepts).
//
// For every company in the pinned ten-cohort v23 delivery (policy extended-v22),
// re-select from the retained source bytes under extended-v22 and extended-v23.
// Requires: the extended-v22 re-selection reproduces the staged selected record
// byte for byte; every extended-v22 concept appears unchanged in the extended-v23
// record; extended-v23 differs only by added concepts from the expanded map.
// Reports the additions per concept. Counts are derived, never typed.
//
// Usage (from the website repository root):
//   node scripts/review-ten-cohort-v23-concept-transition.mjs OUTPUT.json
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { catalogHash } from '../api/_lib/company-catalog.js';
import { companyReference } from './lib/company-reference.mjs';
import { EXPANDED_CONCEPTS_V23 } from './lib/company-expanded-concepts-v23.mjs';

const base = 'artifacts/seo/corpus-local/';
const deliveryDir = base + 'company-ten-cohort-delivery-v23';
const MANIFEST_SHA256 = '8ba9484eaa2ea708c87dc894d8a8de26ce14c1329dd122d07e73423f2cc976ec';
const manifestBytes = readFileSync(deliveryDir + '/delivery.json');
assert.equal(catalogHash(manifestBytes), MANIFEST_SHA256);
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.selection_policy, 'extended-v22');

const added = Object.fromEntries(Object.keys(EXPANDED_CONCEPTS_V23).map(tag => [tag, 0]));
let companies = 0, unchangedHistories = 0, addedHistories = 0, companiesWithAdditions = 0;
const perCompany = [];
for (const file of manifest.files) {
  const compressed = readFileSync(deliveryDir + '/' + file.source.storage_path);
  assert.equal(catalogHash(compressed), file.source.sha256);
  const raw = gunzipSync(compressed, { maxOutputLength: 64 * 1024 * 1024 }).toString('utf8');
  assert.equal(catalogHash(raw), file.source_sha256);
  const stagedBytes = readFileSync(deliveryDir + '/' + file.selected.storage_path);
  assert.equal(catalogHash(stagedBytes), file.selected.sha256);
  const staged = JSON.parse(stagedBytes);
  const options = { fetchedAt: staged.fetched_at, expectedCik: file.cik };
  const v22 = companyReference(raw, { ...options, selectionPolicy: 'extended-v22' });
  // The staged record carries source_snapshot; everything else must reproduce exactly.
  const { source_snapshot, ...stagedRecord } = staged;
  assert.ok(isDeepStrictEqual(stagedRecord, v22), `extended-v22 does not reproduce the staged record for ${file.cik}`);
  const v23 = companyReference(raw, { ...options, selectionPolicy: 'extended-v23' });
  assert.equal(v23.selection_policy, 'extended-v23');
  const v23ByTag = new Map(v23.concepts.map(concept => [concept.tag, concept]));
  for (const concept of v22.concepts) {
    assert.ok(isDeepStrictEqual(v23ByTag.get(concept.tag), concept), `${file.cik}/${concept.tag} changed under extended-v23`);
    unchangedHistories++;
  }
  const v22Tags = new Set(v22.concepts.map(concept => concept.tag));
  let additions = 0;
  for (const concept of v23.concepts) {
    if (v22Tags.has(concept.tag)) continue;
    assert.ok(Object.hasOwn(EXPANDED_CONCEPTS_V23, concept.tag), `${file.cik}/${concept.tag} added but not an expanded concept`);
    added[concept.tag]++; additions++; addedHistories++;
  }
  assert.equal(v23.concepts.length, v22.concepts.length + additions);
  // Everything outside concepts must be identical apart from the policy name.
  const strip = record => { const { concepts, selection_policy, editorial_exclusions, ...rest } = record; return rest; };
  assert.ok(isDeepStrictEqual(strip(v22), strip(v23)), `${file.cik} record metadata changed under extended-v23`);
  assert.ok(isDeepStrictEqual(v22.editorial_exclusions ?? null, v23.editorial_exclusions ?? null), `${file.cik} editorial exclusions changed under extended-v23`);
  companies++; if (additions) companiesWithAdditions++;
  perCompany.push({ cik: file.cik, v22: v22.concepts.length, v23: v23.concepts.length, added: additions });
}
const output = {
  schema: 'canli.ten-cohort-v23-concept-transition.v1', publication_approved: false,
  delivery_manifest_sha256: MANIFEST_SHA256, from_policy: 'extended-v22', to_policy: 'extended-v23',
  companies, companies_with_additions: companiesWithAdditions, unchanged_histories: unchangedHistories, added_histories: addedHistories,
  added_by_concept: added, per_company: perCompany,
  code_sha256: catalogHash(readFileSync(new URL(import.meta.url))),
  expanded_definitions_sha256: catalogHash(JSON.stringify(EXPANDED_CONCEPTS_V23)),
  scope: 'Every extended-v22 selected record reproduces byte for byte from retained bytes and is an unchanged subset of its extended-v23 selection; extended-v23 differs only by added expanded-concept histories. Re-selection proof only, not staging, release, hosting or indexing.',
};
writeFileSync(process.argv[2], JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ companies, companiesWithAdditions, unchangedHistories, addedHistories, top: Object.entries(added).sort((a, b) => b[1] - a[1]).slice(0, 5) }));
