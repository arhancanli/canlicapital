import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [discoveryPath, deliveryPath, queuePath, countText = '1000', priorQueuesPath] = process.argv.slice(2);
const limit = Number(countText);
if (!queuePath || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Usage: node scripts/prepare-company-batch.mjs SEC_TICKERS_JSON EXISTING_DELIVERY_JSON QUEUE_JSON [COUNT_1_TO_1000] [PINNED_PRIOR_QUEUES_JSON]');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = readFileSync(discoveryPath), deliveryBytes = readFileSync(deliveryPath);
const discovery = JSON.parse(source), delivery = JSON.parse(deliveryBytes);
if (delivery.schema !== 'canli.company-delivery.v1' || !Array.isArray(delivery.files)) throw new Error('Invalid existing cohort');
const existing = new Set(delivery.files.map(row => {
  if (typeof row.cik !== 'string' || !/^\d{10}$/.test(row.cik) || Number(row.cik) < 1) throw new Error('Invalid existing CIK');
  return row.cik;
}));
if (!discovery || Array.isArray(discovery) || typeof discovery !== 'object') throw new Error('Invalid SEC discovery object');
const discovered = [...new Set(Object.values(discovery).map(row => {
  if (!row || !Number.isSafeInteger(row.cik_str) || row.cik_str < 1 || row.cik_str > 9999999999) throw new Error('Invalid discovery CIK');
  return String(row.cik_str).padStart(10, '0');
}))].sort();
const attempted = new Set(), priorQueues = [];
if (priorQueuesPath) {
  const ledger = JSON.parse(readFileSync(priorQueuesPath));
  if (ledger.schema !== 'canli.company-prior-queues.v1' || !Array.isArray(ledger.queues) || !ledger.queues.length) throw new Error('Invalid prior queue ledger');
  for (const item of ledger.queues) {
    if (typeof item.path !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Invalid prior queue descriptor');
    const bytes = readFileSync(item.path);
    if (hash(bytes) !== item.sha256) throw new Error('Prior queue hash mismatch');
    const ciks = JSON.parse(bytes);
    if (!Array.isArray(ciks) || !ciks.length || ciks.length > 1000 || new Set(ciks).size !== ciks.length || ciks.some(cik => typeof cik !== 'string' || !/^\d{10}$/.test(cik) || Number(cik) === 0)) throw new Error('Invalid prior queue identities');
    ciks.forEach(cik => attempted.add(cik));
    priorQueues.push({ ...item, count: ciks.length });
  }
}
const remaining = discovered.filter(cik => !existing.has(cik) && !attempted.has(cik));
const queue = remaining.slice(0, limit);
if (!queue.length) throw new Error('No new candidate identifiers');
const bytes = Buffer.from(JSON.stringify(queue, null, 2) + '\n');
// A running or completed capture must never receive a silently replaced queue.
if (existsSync(queuePath)) {
  if (!readFileSync(queuePath).equals(bytes)) throw new Error('Existing queue differs; use a new batch directory');
} else writeFileSync(queuePath, bytes, { flag: 'wx' });
console.log(JSON.stringify({ discovery_sha256: hash(source), existing_delivery_sha256: hash(deliveryBytes), discovery_unique_ciks: discovered.length, existing_cohort_ciks: existing.size, discovered_existing_ciks_skipped: discovered.filter(cik => existing.has(cik)).length, prior_queues: priorQueues, prior_queue_ciks: attempted.size, discovered_prior_only_ciks_skipped: discovered.filter(cik => !existing.has(cik) && attempted.has(cik)).length, remaining_unqueued_after_batch: remaining.length - queue.length, queue_count: queue.length, queue_sha256: hash(bytes), publication_approved: false }, null, 2));
