import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { companyCoverage } from './lib/company-coverage.mjs';
import { companyReference, CompanyReferenceError } from './lib/company-reference.mjs';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));

// Independently replay the selector from captured bytes. This report is a review
// aid, not editorial approval, a publishing instruction, or an indexed-page count.
export function reviewCandidates(directory) {
  const queue = read(resolve(directory, 'ciks.json'));
  const progressBytes = readFileSync(resolve(directory, 'refresh.json'));
  const progress = JSON.parse(progressBytes);
  if (progress.schema !== 'canli.company-refresh.v1' || !Array.isArray(queue) || queue.some(cik => typeof cik !== 'string' || !/^\d{10}$/.test(cik)) || new Set(queue).size !== queue.length || progress.requested !== queue.length) throw new Error('Invalid review queue');
  const seen = new Set();
  const report = { schema: 'canli.company-candidate-review.v1', reviewed_at: new Date().toISOString(), refresh_sha256: sha256(progressBytes), queue_sha256: sha256(readFileSync(resolve(directory, 'ciks.json'))), selector_sha256: sha256(readFileSync(new URL('./lib/company-reference.mjs', import.meta.url))), complete: Boolean(progress.finished_at) && !progress.stopped && progress.results.length === queue.length, publication_approved: false, candidates: [], exclusions: [], errors: [] };
  function capture(cik) {
      const receipt = read(resolve(directory, cik + '.capture.json'));
      if (receipt.schema !== 'canli.sec-capture.v1' || receipt.cik !== cik || !/^[a-f0-9]{64}$/.test(receipt.sha256) || receipt.url !== `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`) throw new Error('Invalid capture identity');
      const raw = gunzipSync(readFileSync(resolve(directory, receipt.sha256 + '.json.gz')), { maxOutputLength: 64 * 1024 * 1024 });
      if (sha256(raw) !== receipt.sha256 || raw.length !== receipt.bytes) throw new Error('Original capture bytes do not match receipt');
      return { receipt, raw };
  }
  for (const result of progress.results) {
    const cik = result.cik;
    if (!queue.includes(cik) || seen.has(cik)) throw new Error('Duplicate or unrequested result');
    seen.add(cik);
    if (result.status !== 'eligible_for_review') {
      if (result.status !== 'excluded') { report.exclusions.push(result); continue; }
      try {
        const { receipt, raw } = capture(cik);
        let rejected;
        try { companyReference(raw, { fetchedAt: receipt.fetched_at, expectedCik: cik }); }
        catch (error) { rejected = error; }
        if (!(rejected instanceof CompanyReferenceError) || rejected.code !== result.reason) throw new Error('Exclusion does not reproduce from source');
        report.exclusions.push({ ...result, reproduced: true, source_sha256: receipt.sha256, fetched_at: receipt.fetched_at });
      } catch (error) { report.errors.push({ cik, reason: error.message }); }
      continue;
    }
    try {
      const { receipt, raw } = capture(cik);
      const diagnostics = {};
      const reproduced = companyReference(raw, { fetchedAt: receipt.fetched_at, expectedCik: cik, diagnostics });
      const staged = read(resolve(directory, cik + '.record.json'));
      if (!isDeepStrictEqual(staged, reproduced)) throw new Error('Staged record does not reproduce');
      if (result.source_sha256 !== receipt.sha256 || result.fetched_at !== receipt.fetched_at || result.histories !== staged.concepts.length || result.name !== staged.name) throw new Error('Queue result does not match captured record');
      const histories = staged.concepts.map(concept => {
        const ends = concept.observations.map(row => row.end).sort();
        const coverage = companyCoverage(concept.observations, receipt.fetched_at);
        const units = coverage.units;
        const flags = [];
        if (units.length > 1) flags.push('multiple_units');
        if (coverage.historicalOnly) flags.push('historical_coverage_only');
        return { tag: concept.tag, observations: concept.observations.length, reporting_dates: new Set(ends).size, first_period: ends[0], last_period: ends.at(-1), units, flags };
      });
      report.candidates.push({ cik, name: staged.name, source_sha256: receipt.sha256, record_sha256: sha256(readFileSync(resolve(directory, cik + '.record.json'))), fetched_at: receipt.fetched_at, histories, excluded_observation_counts: diagnostics });
    } catch (error) { report.errors.push({ cik, reason: error.message }); }
  }
  report.candidate_pages = report.candidates.reduce((count, candidate) => count + 1 + candidate.histories.length, 0);
  report.flagged_histories = report.candidates.flatMap(candidate => candidate.histories).filter(history => history.flags.length).length;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, output] = process.argv.slice(2);
  if (!directory || !output) throw new Error('Usage: node scripts/review-company-candidates.mjs STAGING_DIRECTORY REPORT.json');
  const report = reviewCandidates(resolve(directory));
  writeFileSync(output + '.pending', JSON.stringify(report, null, 2) + '\n'); renameSync(output + '.pending', output);
  console.log(JSON.stringify({ complete: report.complete, companies: report.candidates.length, candidate_pages: report.candidate_pages, flagged_histories: report.flagged_histories, errors: report.errors.length }));
  if (report.errors.length) process.exitCode = 1;
}
