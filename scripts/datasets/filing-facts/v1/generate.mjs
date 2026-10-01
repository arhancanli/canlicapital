import { constants, readdirSync, openSync, writeFileSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA, TEMPLATE, POLICY, LIMITS, validDate, filingUrl, questionFor, candidateId } from './contract.mjs';
import { readArchive, validateCutoff } from './source.mjs';
import { checkCandidate } from './check.mjs';
import { isEntryPoint } from './cli.mjs';

const DAY = 86400000;
function writeExclusive(path, contents) {
  // Exclusive creation refuses an existing path. Writes use the opened descriptor
  // even if the pathname changes afterward.
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try { writeFileSync(fd, contents); } finally { closeSync(fd); }
}
const increment = (map, key, amount = 1) => { map[key] = (map[key] ?? 0) + amount; };
const projection = (row, cik) => ({ value: row.val === 0 ? 0 : row.val, filed: row.filed, accn: row.accn, form: row.form, fp: row.fp, fy: row.fy, url: filingUrl(cik, row.accn) });

export function candidatesForArchive(archive, { asOf, limit = 2 }) {
  validateCutoff(asOf, archive);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be an integer from 1 to 100');
  const report = { cik: archive.company.cik, as_of: asOf, observations_us_gaap_all_units: 0, excluded_rows: {}, malformed_unit_arrays: 0, eligible_rows: 0, annual_groups: 0, rejected_groups: {}, candidate_groups_before_limit: 0, candidates_selected: 0, independently_checked: 0 };
  const groups = new Map();
  for (const [concept, body] of Object.entries(archive.facts.facts['us-gaap'] ?? {})) {
    for (const [unit, rows] of Object.entries(body?.units ?? {})) {
      if (!Array.isArray(rows)) { report.malformed_unit_arrays++; continue; }
      for (const row of rows) {
        report.observations_us_gaap_all_units++;
        let reason;
        if (unit !== 'USD') reason = 'other_unit';
        else if (!/^[A-Za-z][A-Za-z0-9]{0,199}$/.test(concept)) reason = 'invalid_concept_identifier';
        else if (!row || typeof row !== 'object' || Array.isArray(row)) reason = 'malformed_row';
        else if (!/^10-K(?:\/A)?$/.test(row.form ?? '')) reason = /^10-Q(?:\/A)?$/.test(row.form ?? '') ? 'quarterly_filing_form' : 'nonannual_filing_form';
        else if (row.fp !== 'FY') reason = 'not_fy_filing_context';
        else if (row.start === undefined) reason = 'instant_or_missing_start';
        else if (!validDate(row.start) || !validDate(row.end) || row.start > row.end) reason = 'invalid_period';
        if (reason) { increment(report.excluded_rows, reason); continue; }
        const days = Math.round((Date.parse(row.end) - Date.parse(row.start)) / DAY) + 1;
        if (days < POLICY.min_duration_days || days > POLICY.max_duration_days) {
          increment(report.excluded_rows, days > POLICY.max_duration_days ? 'long_duration' : days <= 119 ? 'quarter_or_short_duration' : 'ytd_or_partial_year_duration');
          continue;
        }
        const key = JSON.stringify([concept, row.start, row.end]);
        let group = groups.get(key);
        if (!group) groups.set(key, (group = { concept, start: row.start, end: row.end, rows: [], invalid: false }));
        if (!validDate(row.filed) || row.filed < row.end) {
          group.invalid = true; increment(report.excluded_rows, 'invalid_filing_metadata'); continue;
        }
        if (row.filed > asOf) { increment(report.excluded_rows, 'filed_after_cutoff'); continue; }
        if (typeof row.val !== 'number' || !Number.isSafeInteger(row.val)
          || typeof row.accn !== 'string' || !/^\d{10}-\d{2}-\d{6}$/.test(row.accn)
          || !Number.isSafeInteger(row.fy) || row.fy < 1900 || row.fy > 2100) {
          group.invalid = true; increment(report.excluded_rows, 'invalid_filing_metadata'); continue;
        }
        report.eligible_rows++;
        group.rows.push(row);
      }
    }
  }
  report.annual_groups = groups.size;
  const candidates = [];
  for (const group of groups.values()) {
    let reason = group.invalid ? 'invalid_filing_metadata' : null;
    const byAccession = new Map(), byDate = new Map();
    for (const row of group.rows) {
      const fact = projection(row, archive.company.cik);
      const previous = byAccession.get(row.accn);
      if (previous && JSON.stringify(previous) !== JSON.stringify(fact)) reason ??= 'accession_conflict';
      else byAccession.set(row.accn, fact);
      const dated = byDate.get(row.filed);
      if (dated !== undefined && dated !== row.val) reason ??= 'same_day_value_conflict';
      else byDate.set(row.filed, row.val);
    }
    const facts = [...byAccession.values()].sort((a, b) => a.filed.localeCompare(b.filed) || a.accn.localeCompare(b.accn));
    const earliest = facts[0], later = facts.at(-1);
    if (!earliest || earliest.filed === later.filed) reason ??= 'no_later_distinct_filed_date';
    else if (earliest.value === later.value) reason ??= new Set(facts.map((f) => f.value)).size > 1 ? 'reverted_at_cutoff' : 'unchanged_at_cutoff';
    const difference = earliest && later ? later.value - earliest.value : null;
    const percent = earliest?.value === 0 ? null : earliest && later ? 100 * (difference / Math.abs(earliest.value)) : null;
    if (earliest && later && (!Number.isSafeInteger(difference) || (percent !== null && !Number.isFinite(percent)))) reason ??= 'unsafe_or_nonfinite_arithmetic';
    if (reason) { increment(report.rejected_groups, reason); continue; }
    const item = {
      schema: SCHEMA, template: TEMPLATE, review_status: 'unreviewed_machine_candidate', policy: POLICY,
      company: archive.company, source: archive.source, as_of: asOf,
      period: { kind: 'annual_duration', taxonomy: 'us-gaap', concept: group.concept, unit: 'USD', start: group.start, end: group.end },
      earliest, later,
      answer: { earliest_value: earliest.value, later_value: later.value, difference, percent_difference: percent, percent_difference_status: earliest.value === 0 ? 'zero_earliest' : 'defined' },
      eligible_accessions: facts.length, changed_value_cause: 'not_established', human_verified: false, limitations: LIMITS,
    };
    item.question = questionFor(item); item.id = candidateId(item);
    candidates.push(item);
  }
  candidates.sort((a, b) => b.period.end.localeCompare(a.period.end) || a.period.concept.localeCompare(b.period.concept) || a.period.start.localeCompare(b.period.start));
  report.candidate_groups_before_limit = candidates.length;
  const selected = candidates.slice(0, limit);
  for (const item of selected) {
    // Reread archived bytes and independently check every output, rather than sharing
    // the generator's mutable parsed source or its group-selection implementation.
    const checked = checkCandidate(item, archive.recordPath, archive.snapshotsDir);
    if (!checked.valid) throw new Error(`Independent candidate check failed: ${checked.problems.join('; ')}`);
  }
  report.candidates_selected = selected.length;
  report.independently_checked = selected.length;
  return { candidates: selected, report };
}

export function generateCandidates(recordsDir, snapshotsDir, options) {
  const candidates = [], companies = [];
  for (const name of readdirSync(recordsDir).filter((f) => /^\d{10}\.json$/.test(f)).sort()) {
    const archive = readArchive(join(recordsDir, name), snapshotsDir);
    const result = candidatesForArchive(archive, options);
    candidates.push(...result.candidates); companies.push(result.report);
  }
  return { candidates, summary: { schema: 'canli.filing-facts-first-later-generation.v1', policy: POLICY, as_of: options.asOf, companies_seen: companies.length, candidates: candidates.length, independently_checked: candidates.length, companies, limitations: LIMITS } };
}

if (isEntryPoint(import.meta.url)) {
  try {
    const [records, snapshots, out, asOf, limit = '2', ...extra] = process.argv.slice(2);
    if (!records || !snapshots || !out || !asOf || extra.length) throw new Error('Usage: node generate.mjs RECORDS_DIR SNAPSHOTS_DIR OUT.jsonl AS_OF [LIMIT_PER_COMPANY]');
    const result = generateCandidates(records, snapshots, { asOf, limit: Number(limit) });
    writeExclusive(out, result.candidates.map((c) => JSON.stringify(c)).join('\n') + (result.candidates.length ? '\n' : ''));
    writeExclusive(out + '.summary.json', JSON.stringify(result.summary, null, 2) + '\n');
    console.log(JSON.stringify({ companies: result.summary.companies_seen, candidates: result.candidates.length, independently_checked: result.summary.independently_checked, as_of: asOf }));
  } catch (error) {
    console.error(error.code === 'EEXIST' ? 'Refusing to overwrite an existing candidate or summary file' : error.message);
    process.exitCode = 1;
  }
}
