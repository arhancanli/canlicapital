import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { EDITORIAL_OBSERVATION_EXCLUSIONS_V17 } from './lib/company-editorial-v17.mjs';

const base = 'artifacts/seo/';
const hash = raw => createHash('sha256').update(raw).digest('hex');
const inputs = {};
function read(name) {
  const raw = readFileSync(base + name); inputs[name] = hash(raw); return JSON.parse(raw);
}
const primary = read('corpus-local/company-basic-diluted-batch1-primary-review-20260920.json');
const numerical = read('company-basic-diluted-batch1-legacy-review-v2-20260920.json');
const targets = read('company-basic-diluted-capture-batch1-targets-20260920.json');
const reviewed = read('company-111-dilution-context-20260920.json');
const celldex = read('company-celldex-dilution-context-20260920.json');
assert.equal(celldex.disposition, 'TWELVE_OBSERVATIONS_SCOPE_REVIEWED_WITH_LOSS_PERIOD_CONTEXT');
assert.equal(celldex.target_sha256, inputs['company-basic-diluted-capture-batch1-targets-20260920.json']);
const combined = read('company-combined-share-presentations-20260920.json');
assert.equal(combined.target_sha256, inputs['company-basic-diluted-capture-batch1-targets-20260920.json']);
const lossShares = read('company-loss-share-presentations-20260920.json');
assert.equal(lossShares.target_sha256, inputs['company-basic-diluted-capture-batch1-targets-20260920.json']);
const cedar = read('company-cedar-participating-shares-20260920.json');
assert.equal(cedar.target_sha256, inputs['company-basic-diluted-capture-batch1-targets-20260920.json']);
const siebert = read('company-siebert-dilution-context-20260920.json');
assert.equal(siebert.disposition, 'TWO_SELECTED_DILUTED_SHARE_OBSERVATIONS_REQUIRE_HOLD');
assert.equal(siebert.target_sha256, inputs['company-basic-diluted-capture-batch1-targets-20260920.json']);
assert.equal(numerical.primary_review_sha256, inputs['corpus-local/company-basic-diluted-batch1-primary-review-20260920.json']);
assert.equal(numerical.combined_observations, 1176); assert.equal(numerical.combined_matches, 1176);
assert.equal(reviewed.target_sha256, inputs['company-basic-diluted-capture-batch1-targets-20260920.json']);
assert.equal(reviewed.disposition, 'FOURTEEN_OBSERVATIONS_SCOPE_REVIEWED_WITH_ORDINARY_SHARE_CONTEXT');
const key = (cik, row) => JSON.stringify([cik, row.tag, row.start ?? null, row.end, row.unit, row.val, row.accn]);
const sources = new Map();
for (const t of targets.targets) {
  if (sources.has(t.cik)) assert.equal(sources.get(t.cik), t.source_sha256);
  sources.set(t.cik, t.source_sha256);
}
assert.equal(sources.get('0001738906'), reviewed.source_sha256);
assert.equal(sources.get('0000744218'), celldex.source_sha256);
assert.equal(sources.get('0000065596'), siebert.source_sha256);
const scope = new Map(reviewed.selected_observations.map(row => [key('0001738906', row), row]));
assert.equal(scope.size, 14);
for (const row of celldex.selected_observations) scope.set(key('0000744218', row), row);
assert.equal(scope.size, 26);
const presentation = new Set();
for (const decision of combined.decisions) {
  assert.equal(decision.disposition, 'TWELVE_OBSERVATIONS_REVIEWED_FOR_REPORTED_PRESENTATION');
  assert.equal(sources.get(decision.cik), decision.source_sha256);
  for (const row of decision.selected_observations) {
    const id = key(decision.cik, row); assert(!scope.has(id));
    scope.set(id, row); presentation.add(id);
  }
}
assert.equal(presentation.size, 24); assert.equal(scope.size, 50);
const lossContext = new Set();
for (const d of lossShares.decisions) {
  assert.equal(d.disposition, 'EIGHT_OBSERVATIONS_REVIEWED_WITH_LOSS_SHARE_CONTEXT');
  assert.equal(sources.get(d.cik), d.source_sha256);
  for (const row of d.selected_observations) {
    const id = key(d.cik, row); assert(!scope.has(id));
    scope.set(id, row); lossContext.add(id);
  }
}
assert.equal(lossContext.size, 16); assert.equal(scope.size, 66);
assert.equal(cedar.disposition, 'EIGHT_OBSERVATIONS_REVIEWED_WITH_VESTED_SHARE_CONTEXT');
assert.equal(sources.get('0000761648'), cedar.source_sha256);
const cedarContext = new Set();
for (const row of cedar.selected_observations) {
  const id = key('0000761648', row); assert(!scope.has(id));
  scope.set(id, row); cedarContext.add(id);
}
assert.equal(cedarContext.size, 8); assert.equal(scope.size, 74);
const seen = new Set(), rows = [];
let activeReviewed = 0, pending = 0, withdrawn = 0;
for (const filing of primary.filings) {
  for (const check of filing.checks) {
    const observation = check.selected, id = key(filing.cik, observation);
    assert(!seen.has(id)); seen.add(id);
    const holds = EDITORIAL_OBSERVATION_EXCLUSIONS_V17.filter(d => d.cik === filing.cik && d.tag === observation.tag && Object.entries(d.observation).every(([k, v]) => observation[k] === v));
    assert(holds.length <= 1);
    let state = 'ACCOUNTING_SCOPE_REVIEW_PENDING', evidence = null;
    if (holds.length) {
      assert.equal(holds[0].source_sha256, sources.get(filing.cik));
      assert(!scope.has(id)); state = 'WITHDRAWN_BY_V17_OBSERVATION_HOLD'; evidence = holds[0].filing_url; withdrawn++;
    } else if (scope.has(id)) {
      assert.deepEqual(observation, scope.get(id));
      state = 'SCOPE_REVIEWED_WITH_SOURCE_CONTEXT'; evidence = filing.cik === '0000744218' ? 'company-celldex-dilution-context-20260920.json' : 'company-111-dilution-context-20260920.json'; activeReviewed++;
      if (cedarContext.has(id)) evidence = 'company-cedar-participating-shares-20260920.json';
      if (lossContext.has(id)) evidence = 'company-loss-share-presentations-20260920.json';
      if (presentation.has(id)) { state = 'REPORTED_PRESENTATION_REVIEWED_CAUSE_NOT_ESTABLISHED'; evidence = 'company-combined-share-presentations-20260920.json'; }
    } else pending++;
    rows.push({ cik: filing.cik, observation, state, evidence });
  }
}
assert.equal(seen.size, 1176);
assert([...scope.keys()].every(k => seen.has(k)));
assert.equal(activeReviewed, 74); assert.equal(withdrawn, 8); assert.equal(pending, 1094);
const result = {
  schema: 'canli.basic-diluted-batch1-scope.v6', publication_approved: false,
  input_sha256: inputs, code_sha256: hash(readFileSync(new URL(import.meta.url))),
  policy_sha256: hash(readFileSync(new URL('./lib/company-editorial-v17.mjs', import.meta.url))),
  original_observations: 1176, presentation_only_reviewed_observations: 24, active_reviewed_observations: activeReviewed,
  active_observations_needing_scope_review: pending, withdrawn_observations: withdrawn,
  rows,
  scope: 'Exact batch1 partition only. Eight Cedar2020/2021 observations reviewed for vested-share allocation and distinction from FFO denominators. Sixteen Blue Dolphin/NexMetals observations reviewed for historical securities disclosure, loss-sign convention and share-consolidation context. Twenty-four additional NLI/Weis observations reviewed only for reported combined presentation, units, periods and restatement context; the reason for equality remains unestablished. Fourteen 111, Inc. and twelve Celldex observations reviewed for the stated accounting context, six Valhi and two Siebert rows held by v17, all other observations pending. Other Valhi holds and the separate baseline are outside this batch. Numerical closure does not grant scope approval; no whole-history, issuer, corpus or production admission.',
};
writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ reviewed: activeReviewed, pending, withdrawn, total: seen.size }));
