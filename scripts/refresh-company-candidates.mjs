import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { companyReference, CompanyReferenceError } from './lib/company-reference.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const atomic = (path, data) => { writeFileSync(path + '.pending', data); renameSync(path + '.pending', path); };
class CaptureHttpError extends Error {
  constructor(status) { super(`SEC HTTP ${status}`); this.status = status; }
}

// A bounded review queue, never a publisher. A resumed capture keeps its original
// retrieval time and must still reproduce from the archived bytes.
export async function refreshCandidates({ ciks, output, fetcher = fetch, now = () => new Date().toISOString(), pause = ms => new Promise(done => setTimeout(done, ms)) }) {
  if (!Array.isArray(ciks) || !ciks.length || ciks.length > 1000 || ciks.some(cik => typeof cik !== 'string' || !/^\d{10}$/.test(cik) || Number(cik) === 0) || new Set(ciks).size !== ciks.length) throw new Error('Expected 1–1000 unique ten-digit CIKs');
  mkdirSync(output, { recursive: true });
  const reportPath = resolve(output, 'refresh.json');
  const queueHash = digest(JSON.stringify(ciks));
  const prior = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  if (prior) {
    if (prior.schema !== 'canli.company-refresh.v1' || prior.requested !== ciks.length || !Array.isArray(prior.results)
        || prior.results.length > ciks.length || prior.results.some((row, i) => row.cik !== ciks[i]
          || !['eligible_for_review', 'excluded', 'http_error', 'error'].includes(row.status))) throw new Error('Prior capture queue does not match');
    if (prior.queue_sha256 ? prior.queue_sha256 !== queueHash : !prior.finished_at || prior.results.length !== ciks.length) {
      throw new Error('Prior capture queue binding missing or changed; inspect before resuming');
    }
    if (prior.stopped || prior.results.some(row => row.status === 'http_error' && [403, 429].includes(row.http_status))) {
      throw new Error('Prior capture stopped on access response; no automatic retry');
    }
    if (prior.finished_at && prior.results.length !== ciks.length) throw new Error('Completed prior capture has missing results');
  }
  const priorRows = new Map((prior?.results ?? []).map(row => [row.cik, row]));
  const report = prior ? { ...prior, results: [] } : { schema: 'canli.company-refresh.v1', queue_sha256: queueHash, started_at: now(), requested: ciks.length, publication_approved: false, results: [], stopped: null };
  // Completed reports may already bind downstream receipts. Offline verification
  // must not rewrite their timestamps, hashes or original acquisition outcomes.
  const save = () => {
    if (!prior?.finished_at && report.results.length >= (prior?.results.length ?? 0)) {
      atomic(reportPath, JSON.stringify(report, null, 2) + '\n');
    }
  };
  for (const cik of ciks) {
    const previous = priorRows.get(cik);
    if (previous && ['http_error', 'error'].includes(previous.status)) {
      report.results.push(previous); save(); continue;
    }
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const receiptPath = resolve(output, cik + '.capture.json');
    try {
      let receipt, raw;
      if (existsSync(receiptPath)) {
        receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
        if (receipt.schema !== 'canli.sec-capture.v1' || receipt.cik !== cik || receipt.url !== url || !/^[a-f0-9]{64}$/.test(receipt.sha256)) throw new Error('Invalid capture receipt');
        raw = gunzipSync(readFileSync(resolve(output, receipt.sha256 + '.json.gz')), { maxOutputLength: 64 * 1024 * 1024 }).toString('utf8');
        if (digest(raw) !== receipt.sha256 || Buffer.byteLength(raw) !== receipt.bytes) throw new Error('Captured source hash or length mismatch');
      } else {
        if (previous) throw new Error('Prior capture receipt missing; no implicit reacquisition');
        const response = await fetcher(url, { headers: { 'User-Agent': 'CanliCapital research reference canlicapital.com', Accept: 'application/json' }, signal: AbortSignal.timeout(30_000), redirect: 'error' });
        if (!response.ok) throw new CaptureHttpError(response.status);
        // Stream with a hard size cap; no unbounded response.text() allocation.
        const chunks = []; let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > 64 * 1024 * 1024) throw new Error('Source exceeds 64 MiB limit');
          chunks.push(chunk);
        }
        const source = Buffer.concat(chunks);
        raw = new TextDecoder('utf-8', { fatal: true }).decode(source);
        const sha256 = digest(source);
        receipt = { schema: 'canli.sec-capture.v1', cik, url, sha256, fetched_at: now(), bytes: source.length };
        atomic(resolve(output, sha256 + '.json.gz'), gzipSync(source));
        atomic(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
      }
      const record = companyReference(raw, { fetchedAt: receipt.fetched_at, expectedCik: cik });
      if (record.source_sha256 !== receipt.sha256) throw new Error('Selector source hash mismatch');
      const result = { cik, status: 'eligible_for_review', name: record.name, histories: record.concepts.length, source_sha256: receipt.sha256, fetched_at: receipt.fetched_at };
      if (previous) {
        if (!isDeepStrictEqual(result, previous) || !isDeepStrictEqual(record, JSON.parse(readFileSync(resolve(output, cik + '.record.json'), 'utf8')))) throw new Error('Prior capture result does not reproduce');
      } else atomic(resolve(output, cik + '.record.json'), JSON.stringify(record, null, 2) + '\n');
      report.results.push(result);
    } catch (error) {
      if (error instanceof CaptureHttpError) {
        report.results.push({ cik, status: 'http_error', http_status: error.status });
        if ([403, 429].includes(error.status)) { report.stopped = `SEC HTTP ${error.status}; no automatic retry`; break; }
      } else {
        const result = { cik, status: error instanceof CompanyReferenceError ? 'excluded' : 'error', reason: error.code ?? error.message };
        if (previous && !isDeepStrictEqual(result, previous)) throw error;
        report.results.push(result);
      }
      // Invalid/corrupt receipts are kept for inspection. Never erase or backdate.
    }
    save(); if (!previous) await pause(1000);
  }
  report.finished_at = prior?.finished_at ?? now(); save(); return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/refresh-company-candidates.mjs CIKS.json STAGING_DIRECTORY');
  const report = await refreshCandidates({ ciks: JSON.parse(readFileSync(input, 'utf8')), output: resolve(output) });
  console.log(JSON.stringify({ requested: report.requested, processed: report.results.length, eligible: report.results.filter(row => row.status === 'eligible_for_review').length, stopped: report.stopped }));
  if (report.stopped || report.results.some(row => row.status === 'error')) process.exitCode = 1;
}
