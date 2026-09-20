import assert from 'node:assert/strict';

const key = (cik, row) => JSON.stringify([cik, row.tag, row.start ?? null, row.end, row.unit, row.val, row.accn]);

// Counts alone cannot establish closure: require the exact target observations,
// including filing metadata, and the exact previously unmatched supplement.
export function verifyBatchNumerics({ targets, capturedTargets, primary, legacy }) {
  const expected = new Map(), filings = new Set();
  for (const target of targets.targets) {
    filings.add(JSON.stringify([target.cik, target.latest_selected_accession]));
    for (const observation of target.latest_accession_observations) {
      assert.equal(observation.accn, target.latest_selected_accession);
      const row = { ...observation, tag: target.tag }, id = key(target.cik, row);
      assert(!expected.has(id), 'Duplicate target observation'); expected.set(id, row);
    }
  }
  assert.equal(expected.size, targets.observations);
  assert.equal(capturedTargets.unresolved_observation_count, 0);
  assert.deepEqual(capturedTargets.unresolved_filings, []);
  const captured = new Map(), capturedFilings = new Set();
  for (const filing of capturedTargets.filings) {
    const fid = JSON.stringify([filing.cik, filing.accession]);
    assert(!capturedFilings.has(fid), 'Duplicate captured filing'); capturedFilings.add(fid);
    for (const row of filing.observations) {
      assert.equal(row.accn, filing.accession);
      const id = key(filing.cik, row);
      assert(!captured.has(id), 'Duplicate captured observation'); captured.set(id, row);
      assert.deepEqual(row, expected.get(id), 'Captured observation differs from target');
    }
  }
  assert.deepEqual(capturedFilings, filings);
  assert.equal(captured.size, expected.size);
  assert.equal(capturedTargets.observation_count, expected.size);
  const checked = new Map(), unmatched = new Map(), checkedFilings = new Set();
  let inlineMatches = 0;
  for (const filing of primary.filings) {
    const fid = JSON.stringify([filing.cik, filing.accession]);
    assert(!checkedFilings.has(fid), 'Duplicate primary filing'); checkedFilings.add(fid);
    for (const check of filing.checks) {
      const row = check.selected, id = key(filing.cik, row);
      assert.equal(row.accn, filing.accession);
      assert(!checked.has(id), 'Duplicate primary observation'); checked.set(id, row);
      assert.deepEqual(row, expected.get(id), 'Primary observation differs from target');
      assert.equal(typeof check.matched, 'boolean');
      if (check.matched) { assert(check.matches.length > 0); inlineMatches++; }
      else unmatched.set(id, row);
    }
  }
  assert.deepEqual(checkedFilings, filings);
  assert.equal(checked.size, expected.size);
  assert.equal(primary.observations, checked.size);
  assert.equal(primary.matched_observations, inlineMatches);
  const supplement = new Set();
  for (const filing of legacy.filings) for (const check of filing.checks) {
    const row = check.selected, id = key(filing.cik, row);
    assert.equal(row.accn, filing.accession);
    assert(!supplement.has(id), 'Duplicate legacy observation'); supplement.add(id);
    assert.deepEqual(row, unmatched.get(id), 'Legacy supplement differs from unmatched partition');
    assert.equal(check.matched, true, 'Numerical closure incomplete');
    assert(check.matches.length > 0);
  }
  assert.deepEqual(supplement, new Set(unmatched.keys()));
  assert.equal(legacy.observations, supplement.size);
  assert.equal(legacy.matched_observations, supplement.size);
  assert.equal(legacy.combined_observations, expected.size);
  assert.equal(legacy.combined_matches, inlineMatches + supplement.size);
  assert.equal(legacy.combined_matches, expected.size);
  return { observations: expected.size, filings: filings.size, inline_matches: inlineMatches, legacy_matches: supplement.size };
}
