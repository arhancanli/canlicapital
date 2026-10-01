import { createHash } from 'node:crypto';
import { constants, openSync, fstatSync, readFileSync, closeSync } from 'node:fs';
import { basename, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { validDate } from './contract.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const object = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
function boundedFile(path, maximum) {
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maximum) throw new Error('Source must be a bounded regular file');
    const bytes = readFileSync(fd);
    if (bytes.length > maximum) throw new Error('Source exceeds the byte limit');
    return bytes;
  } finally { closeSync(fd); }
}

// This verifies the archived bytes against their selected-record lineage. It does not
// authenticate SEC authorship or time-attest caller-supplied record metadata.
export function readArchive(recordPath, snapshotsDir) {
  const recordBytes = boundedFile(recordPath, 16 * 1024 * 1024);
  const record = JSON.parse(recordBytes);
  if (!object(record) || record.schema !== 'canli.company-reference.v1'
    || typeof record.cik !== 'string' || !/^\d{10}$/.test(record.cik) || Number(record.cik) < 1
    || basename(recordPath) !== record.cik + '.json'
    || typeof record.name !== 'string' || !record.name.trim()
    || !/^[a-f0-9]{64}$/.test(record.source_sha256 ?? '')
    || record.source_url !== `https://data.sec.gov/api/xbrl/companyfacts/CIK${record.cik}.json`
    || typeof record.fetched_at !== 'string' || !validDate(record.fetched_at.slice(0, 10))
    || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(record.fetched_at)
    || !Number.isFinite(Date.parse(record.fetched_at))) throw new Error('Invalid archived record identity or lineage');
  const snapshotPath = join(snapshotsDir, record.source_sha256 + '.json.gz');
  const gzip = boundedFile(snapshotPath, 16 * 1024 * 1024);
  const raw = gunzipSync(gzip, { maxOutputLength: 64 * 1024 * 1024 });
  if (hash(raw) !== record.source_sha256) throw new Error('Archived snapshot SHA-256 mismatch');
  const facts = JSON.parse(raw);
  const cik = typeof facts?.cik === 'string' && /^\d{1,10}$/.test(facts.cik) ? Number(facts.cik) : facts?.cik;
  if (!object(facts) || !Number.isSafeInteger(cik) || cik !== Number(record.cik)
    || facts.entityName !== record.name || !object(facts.facts)) throw new Error('Archived snapshot company identity mismatch');
  return {
    recordPath, snapshotsDir, facts,
    company: { cik: record.cik, name: record.name },
    source: {
      record_sha256: hash(recordBytes), snapshot_sha256: record.source_sha256,
      snapshot_path: `/company-data/sources/${record.source_sha256}.json.gz`,
      record_path: `/company-data/${record.cik}.json`,
      sec_url: record.source_url, captured_at: record.fetched_at,
    },
  };
}
export function validateCutoff(asOf, archive) {
  if (!validDate(asOf) || asOf > archive.source.captured_at.slice(0, 10)) throw new Error('as_of must be a real date no later than the archived capture date');
}
