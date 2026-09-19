import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [discoveryPath, deliveryPath, queuePath, countText = '1000'] = process.argv.slice(2);
const limit = Number(countText);
if (!queuePath || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Usage: node scripts/prepare-company-batch.mjs SEC_TICKERS_JSON EXISTING_DELIVERY_JSON QUEUE_JSON [COUNT_1_TO_1000]');
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
const queue = discovered.filter(cik => !existing.has(cik)).slice(0, limit);
if (!queue.length) throw new Error('No new candidate identifiers');
const bytes = Buffer.from(JSON.stringify(queue, null, 2) + '\n');
// A running or completed capture must never receive a silently replaced queue.
if (existsSync(queuePath)) {
  if (!readFileSync(queuePath).equals(bytes)) throw new Error('Existing queue differs; use a new batch directory');
} else writeFileSync(queuePath, bytes, { flag: 'wx' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
console.log(JSON.stringify({ discovery_sha256: hash(source), existing_delivery_sha256: hash(deliveryBytes), discovery_unique_ciks: discovered.length, existing_cohort_ciks: existing.size, discovered_existing_ciks_skipped: discovered.filter(cik => existing.has(cik)).length, queue_count: queue.length, queue_sha256: hash(bytes), publication_approved: false }, null, 2));
