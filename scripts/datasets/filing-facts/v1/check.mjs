import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { SCHEMA, TEMPLATE, POLICY, LIMITS, validDate, filingUrl, questionFor, candidateId } from './contract.mjs';
import { readArchive, validateCutoff } from './source.mjs';
import { isEntryPoint } from './cli.mjs';

// Independently select raw observations and recompute answers. This module never
// imports the generator, its period groups or its arithmetic/selection functions.
export function checkCandidate(item, recordPath, snapshotsDir) {
  const problems = [];
  try {
    if (!item || typeof item !== 'object' || Array.isArray(item) || item.schema !== SCHEMA
      || item.template !== TEMPLATE || !isDeepStrictEqual(item.policy, POLICY)) throw new Error('Unsupported candidate schema/template/policy');
    const archive = readArchive(recordPath, snapshotsDir);
    validateCutoff(item.as_of, archive);
    if (!isDeepStrictEqual(item.company, archive.company) || !isDeepStrictEqual(item.source, archive.source)) throw new Error('Candidate source lineage does not match archived bytes');
    const p = item.period;
    if (!p || p.kind !== 'annual_duration' || p.taxonomy !== 'us-gaap' || p.unit !== 'USD'
      || typeof p.concept !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,199}$/.test(p.concept)
      || !validDate(p.start) || !validDate(p.end)) throw new Error('Invalid exact-period identity');
    const days = (new Date(p.end) - new Date(p.start)) / 86400000 + 1;
    if (days < 335 || days > 395) throw new Error('Candidate is not an eligible annual-duration interval');
    const rows = archive.facts.facts['us-gaap']?.[p.concept]?.units?.USD;
    if (!Array.isArray(rows)) throw new Error('Candidate source concept/unit is missing');
    const observations = [];
    for (const r of rows) {
      if (!r || typeof r !== 'object' || r.start !== p.start || r.end !== p.end
        || (r.form !== '10-K' && r.form !== '10-K/A') || r.fp !== 'FY') continue;
      if (!validDate(r.filed) || r.filed < r.end) throw new Error('Ambiguous or invalid source filing date');
      if (r.filed > item.as_of) continue;
      if (!Number.isSafeInteger(r.val) || typeof r.accn !== 'string' || !/^\d{10}-\d{2}-\d{6}$/.test(r.accn)
        || !Number.isSafeInteger(r.fy) || r.fy < 1900 || r.fy > 2100) throw new Error('Invalid source value/accession/fiscal metadata');
      observations.push({ value: r.val === 0 ? 0 : r.val, filed: r.filed, accn: r.accn, form: r.form, fp: r.fp, fy: r.fy, url: filingUrl(archive.company.cik, r.accn) });
    }
    const unique = [];
    for (const observation of observations) {
      const sameAccession = unique.find((u) => u.accn === observation.accn);
      if (sameAccession) {
        if (!isDeepStrictEqual(sameAccession, observation)) throw new Error('Conflicting observations for one accession');
      } else unique.push(observation);
    }
    for (const a of unique) {
      if (unique.some((b) => a.filed === b.filed && a.value !== b.value)) throw new Error('Same-day values cannot be ordered from date-only metadata');
    }
    if (!unique.length) throw new Error('No eligible source observations through cutoff');
    const dates = unique.map((o) => o.filed).sort();
    const firstDate = dates[0], lastDate = dates.at(-1);
    if (firstDate === lastDate) throw new Error('No later distinct filed date');
    const onDate = (date) => unique.filter((o) => o.filed === date).sort((a, b) => a.accn < b.accn ? -1 : a.accn > b.accn ? 1 : 0);
    const earliest = onDate(firstDate)[0], later = onDate(lastDate).at(-1);
    if (earliest.value === later.value) throw new Error('Unchanged or reverted endpoint pair is not a changed-value candidate');
    const difference = later.value - earliest.value;
    const percentage = earliest.value === 0 ? null : (later.value - earliest.value) / Math.abs(earliest.value) * 100;
    if (!Number.isSafeInteger(difference) || (percentage !== null && !Number.isFinite(percentage))) throw new Error('Answer arithmetic is unsafe or nonfinite');
    const expected = {
      schema: SCHEMA, template: TEMPLATE, review_status: 'unreviewed_machine_candidate', policy: POLICY,
      company: archive.company, source: archive.source, as_of: item.as_of,
      period: { kind: 'annual_duration', taxonomy: 'us-gaap', concept: p.concept, unit: 'USD', start: p.start, end: p.end },
      earliest, later,
      answer: { earliest_value: earliest.value, later_value: later.value, difference, percent_difference: percentage, percent_difference_status: earliest.value === 0 ? 'zero_earliest' : 'defined' },
      eligible_accessions: unique.length, changed_value_cause: 'not_established', human_verified: false, limitations: LIMITS,
    };
    expected.question = questionFor(expected); expected.id = candidateId(expected);
    if (!isDeepStrictEqual(item, expected)) throw new Error('Candidate fields, question, answer, limits or content ID do not reproduce');
  } catch (error) { problems.push(error.message); }
  return { valid: problems.length === 0, problems };
}

export function checkCandidates(items, recordsDir, snapshotsDir) {
  if (!Array.isArray(items)) throw new Error('Expected a candidate array');
  const seen = new Set();
  const results = items.map((item) => {
    if (!item || typeof item.company?.cik !== 'string' || !/^\d{10}$/.test(item.company.cik)) return { id: item?.id ?? null, valid: false, problems: ['Invalid candidate company identity'] };
    if (seen.has(item.id)) return { id: item.id, valid: false, problems: ['Duplicate candidate ID'] };
    seen.add(item.id);
    return { id: item.id, ...checkCandidate(item, join(recordsDir, item.company.cik + '.json'), snapshotsDir) };
  });
  return { schema: 'canli.filing-facts-first-later-check.v1', candidates: items.length, passed: results.filter((r) => r.valid).length, failed: results.filter((r) => !r.valid).length, results };
}

if (isEntryPoint(import.meta.url)) {
  try {
    const [input, records, snapshots, ...extra] = process.argv.slice(2);
    if (!input || !records || !snapshots || extra.length) throw new Error('Usage: node check.mjs CANDIDATES.jsonl RECORDS_DIR SNAPSHOTS_DIR');
    const bytes = readFileSync(input);
    if (bytes.length > 16 * 1024 * 1024) throw new Error('Candidate input exceeds 16 MiB');
    const items = bytes.toString('utf8').split('\n').filter((s) => s.trim()).map((s) => JSON.parse(s));
    const result = checkCandidates(items, records, snapshots);
    console.log(JSON.stringify(result, null, 2));
    if (result.failed) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
