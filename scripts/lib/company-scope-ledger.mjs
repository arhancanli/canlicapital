import assert from 'node:assert/strict';

const key = (cik, row) => JSON.stringify([cik, row.tag, row.start ?? null, row.end, row.unit, row.val, row.accn]);
const states = new Set(['SCOPE_REVIEWED_WITH_SOURCE_CONTEXT', 'REPORTED_PRESENTATION_REVIEWED_CAUSE_NOT_ESTABLISHED']);

// Only explicitly registered, source-bound decisions can advance pending rows.
export function reconcileScope({ primary, targets, targetHash, reviews, holds }) {
  const sources = new Map();
  for (const target of targets.targets) {
    assert.match(target.source_sha256, /^[a-f0-9]{64}$/);
    if (sources.has(target.cik)) assert.equal(sources.get(target.cik), target.source_sha256);
    sources.set(target.cik, target.source_sha256);
  }
  const reviewed = new Map();
  for (const { registration, report } of reviews) {
    assert(states.has(registration.state), 'Unsupported review state');
    assert.equal(report.target_sha256, targetHash, 'Review targets changed');
    const decision = registration.decision_index === null ? report : report.decisions?.[registration.decision_index];
    assert(decision, 'Missing registered decision');
    if (decision.cik !== undefined) assert.equal(decision.cik, registration.cik);
    assert.equal(decision.source_sha256, sources.get(registration.cik), 'Review source changed');
    assert.equal(decision.disposition, registration.disposition, 'Review disposition changed');
    assert(Number.isSafeInteger(registration.observations) && registration.observations > 0);
    assert.equal(decision.selected_observations.length, registration.observations);
    for (const observation of decision.selected_observations) {
      const id = key(registration.cik, observation);
      assert(!reviewed.has(id), 'Duplicate reviewed observation');
      reviewed.set(id, { observation, state: registration.state, evidence: registration.report });
    }
  }
  const seen = new Set(), used = new Set(), rows = [];
  let activeReviewed = 0, presentationOnly = 0, pending = 0, withdrawn = 0;
  for (const filing of primary.filings) {
    assert(sources.has(filing.cik), 'Unknown issuer');
    for (const check of filing.checks) {
      const observation = check.selected, id = key(filing.cik, observation);
      assert(!seen.has(id), 'Duplicate primary observation'); seen.add(id);
      const matches = holds.filter(d => d.cik === filing.cik && d.tag === observation.tag && Object.entries(d.observation).every(([k, v]) => observation[k] === v));
      assert(matches.length <= 1, 'Conflicting holds');
      const decision = reviewed.get(id);
      let state = 'ACCOUNTING_SCOPE_REVIEW_PENDING', evidence = null;
      if (matches.length) {
        assert.equal(matches[0].source_sha256, sources.get(filing.cik), 'Hold source changed');
        assert(!decision, 'Held observation cannot be approved');
        state = matches[0].scope_state ?? 'WITHDRAWN_BY_V17_OBSERVATION_HOLD';
        assert(['WITHDRAWN_BY_V17_OBSERVATION_HOLD', 'WITHDRAWN_BY_V18_OBSERVATION_HOLD'].includes(state), 'Unsupported hold state');
        evidence = matches[0].filing_url; withdrawn++;
      } else if (decision) {
        assert.deepEqual(observation, decision.observation, 'Reviewed metadata differs');
        used.add(id); ({ state, evidence } = decision); activeReviewed++;
        if (state === 'REPORTED_PRESENTATION_REVIEWED_CAUSE_NOT_ESTABLISHED') presentationOnly++;
      } else pending++;
      rows.push({ cik: filing.cik, observation, state, evidence });
    }
  }
  assert.equal(used.size, reviewed.size, 'Reviewed observation absent from batch');
  return { original_observations: rows.length, presentation_only_reviewed_observations: presentationOnly,
    active_reviewed_observations: activeReviewed, active_observations_needing_scope_review: pending,
    withdrawn_observations: withdrawn, rows };
}
