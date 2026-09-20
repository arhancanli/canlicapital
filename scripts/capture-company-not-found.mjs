import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const utc = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|\+00:00)$/.test(value) && Number.isFinite(Date.parse(value));
const urlFor = cik => `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
export function readNotFoundReceipt(directory, cik, { refreshHash, queueHash, finishedAt }) {
  const bytes = readFileSync(resolve(directory, cik + '.not-found.json'));
  const receipt = JSON.parse(bytes);
  if (receipt.schema !== 'canli.sec-not-found.v1' || receipt.cik !== cik || receipt.url !== urlFor(cik) || receipt.status !== 404 || receipt.refresh_sha256 !== refreshHash || receipt.queue_sha256 !== queueHash || !utc(receipt.captured_at) || !utc(finishedAt) || Date.parse(receipt.captured_at) < Date.parse(finishedAt) || !/^[a-f0-9]{64}$/.test(receipt.body_sha256) || !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 0 || receipt.bytes > 1024 * 1024) throw new Error('Invalid or stale not-found receipt');
  const body = readFileSync(resolve(directory, receipt.body_sha256 + '.http-body'));
  if (body.length !== receipt.bytes || hash(body) !== receipt.body_sha256) throw new Error('Not-found response body mismatch');
  return { ...receipt, receipt_sha256: hash(bytes) };
}
export async function captureNotFound(directory, { fetcher = fetch, now = () => new Date().toISOString(), pause = ms => new Promise(done => setTimeout(done, ms)) } = {}) {
  directory = resolve(directory);
  const refreshBytes = readFileSync(resolve(directory, 'refresh.json')), queueBytes = readFileSync(resolve(directory, 'ciks.json'));
  const refresh = JSON.parse(refreshBytes), queue = JSON.parse(queueBytes);
  if (refresh.schema !== 'canli.company-refresh.v1' || !utc(refresh.finished_at) || refresh.stopped || !Array.isArray(queue) || queue.some(cik => typeof cik !== 'string' || !/^\d{10}$/.test(cik) || Number(cik) < 1) || new Set(queue).size !== queue.length || refresh.requested !== queue.length || refresh.results.length !== queue.length || new Set(refresh.results.map(row => row.cik)).size !== queue.length || refresh.results.some(row => !queue.includes(row.cik))) throw new Error('A complete original capture queue is required');
  const binding = { refreshHash: hash(refreshBytes), queueHash: hash(queueBytes), finishedAt: refresh.finished_at };
  const captured = [];
  for (const row of refresh.results.filter(row => row.status === 'http_error' && row.http_status === 404)) {
    const path = resolve(directory, row.cik + '.not-found.json');
    if (!existsSync(path)) {
      const response = await fetcher(urlFor(row.cik), { headers: { 'User-Agent': 'CanliCapital research reference canlicapital.com', Accept: 'application/json' }, signal: AbortSignal.timeout(30000), redirect: 'error' });
      if (response.status !== 404) throw new Error(`Not-found confirmation returned HTTP ${response.status}; stop without automatic retry or exclusion`);
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 1024 * 1024) throw new Error('Not-found response exceeds size limit'); chunks.push(chunk); }
      const body = Buffer.concat(chunks), bodyHash = hash(body), capturedAt = now();
      if (!utc(capturedAt) || Date.parse(capturedAt) < Date.parse(refresh.finished_at)) throw new Error('Invalid not-found capture time');
      const bodyPath = resolve(directory, bodyHash + '.http-body');
      if (existsSync(bodyPath)) { if (!readFileSync(bodyPath).equals(body)) throw new Error('Stored not-found body is corrupt'); }
      else writeFileSync(bodyPath, body, { flag: 'wx' });
      const receipt = { schema: 'canli.sec-not-found.v1', cik: row.cik, url: urlFor(row.cik), status: 404, captured_at: capturedAt, body_sha256: bodyHash, bytes, refresh_sha256: binding.refreshHash, queue_sha256: binding.queueHash, claim_boundary: 'Endpoint returned 404 at this time; not proof of permanent absence, issuer inactivity or filing ineligibility.' };
      writeFileSync(path + '.pending', JSON.stringify(receipt, null, 2) + '\n'); renameSync(path + '.pending', path);
      await pause(1000);
    }
    captured.push(readNotFoundReceipt(directory, row.cik, binding));
  }
  return captured;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/capture-company-not-found.mjs COMPLETED_CAPTURE_DIRECTORY');
  console.log(JSON.stringify(await captureNotFound(process.argv[2]), null, 2));
}
