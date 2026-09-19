import { createHash } from 'node:crypto';

export const CATALOG_LIMITS = Object.freeze({ fanout: 128, nodeBytes: 64 * 1024, recordBytes: 1024 * 1024, depth: 8, cacheBytes: 4 * 1024 * 1024 });
export const catalogHash = bytes => createHash('sha256').update(bytes).digest('hex');
const cikPattern = /^\d{10}$/;
const hashPattern = /^[a-f0-9]{64}$/;
export class CatalogError extends Error {}
const check = (condition, message) => { if (!condition) throw new CatalogError(message); };

export function validateCatalogNode(node) {
  check(node?.schema === 'canli.company-catalog-node.v1', 'Invalid catalog schema');
  check(Number.isInteger(node.level) && node.level >= 0 && node.level < CATALOG_LIMITS.depth, 'Invalid catalog level');
  check(Array.isArray(node.entries) && node.entries.length > 0 && node.entries.length <= CATALOG_LIMITS.fanout, 'Invalid catalog fanout');
  let previous = '';
  for (const entry of node.entries) {
    check(typeof entry.first === 'string' && typeof entry.last === 'string' && cikPattern.test(entry.first) && cikPattern.test(entry.last) && entry.first <= entry.last && entry.first > previous, 'Invalid or overlapping catalog range');
    check(hashPattern.test(entry.hash) && Number.isInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= (node.level ? CATALOG_LIMITS.nodeBytes : CATALOG_LIMITS.recordBytes), 'Invalid object reference');
    check(Number.isSafeInteger(entry.count) && entry.count > 0, 'Invalid record count');
    if (!node.level) {
      check(entry.first === entry.last && entry.count === 1, 'Invalid leaf record');
      check(typeof entry.name === 'string' && entry.name.trim() && Buffer.byteLength(entry.name) <= 4096, 'Invalid company directory label');
    }
    previous = entry.last;
  }
  return node;
}

// Storage is injected: local files in QA, immutable object reads in deployment.
// An unavailable or corrupt object throws; it must never be reported as a 404.
export function createCompanyCatalog({ rootHash, readObject, cacheBytes = CATALOG_LIMITS.cacheBytes }) {
  check(hashPattern.test(rootHash), 'Invalid catalog root');
  check(Number.isInteger(cacheBytes) && cacheBytes >= 0 && cacheBytes <= CATALOG_LIMITS.cacheBytes, 'Invalid cache budget');
  const cache = new Map(); let cachedBytes = 0;
  const stats = { objectReads: 0, bytesRead: 0, cacheHits: 0 };
  async function object(hash, limit, expectedBytes) {
    let bytes = cache.get(hash);
    if (bytes) { cache.delete(hash); cache.set(hash, bytes); stats.cacheHits++; }
    else {
      bytes = Buffer.from(await readObject(hash, limit));
      stats.objectReads++; stats.bytesRead += bytes.length;
      check(bytes.length <= limit, 'Catalog object exceeds byte limit');
      check(catalogHash(bytes) === hash, 'Catalog object hash mismatch');
      if (!cache.has(hash) && bytes.length <= cacheBytes) {
        while (cachedBytes + bytes.length > cacheBytes && cache.size) { const first = cache.keys().next().value; cachedBytes -= cache.get(first).length; cache.delete(first); }
        cache.set(hash, bytes); cachedBytes += bytes.length;
      }
    }
    check(bytes.length <= limit && (expectedBytes === undefined || bytes.length === expectedBytes), 'Catalog object size mismatch');
    return JSON.parse(bytes.toString('utf8'));
  }
  async function readNode(hash, parent, expectedLevel) {
    const node = validateCatalogNode(await object(hash, CATALOG_LIMITS.nodeBytes, parent?.bytes));
    if (parent) check(node.level === expectedLevel && node.entries[0].first === parent.first && node.entries.at(-1).last === parent.last && node.entries.reduce((n, entry) => n + entry.count, 0) === parent.count, 'Catalog child does not match parent range');
    return node;
  }
  return {
    revision: rootHash,
    async listCompanies({ after = '', limit = 50 } = {}) {
      check(after === '' || (typeof after === 'string' && cikPattern.test(after)), 'Invalid directory cursor');
      check(Number.isInteger(limit) && limit >= 1 && limit <= 50, 'Directory limit must be 1–50');
      const found = [];
      async function visit(hash, parent, expectedLevel, depth) {
        check(depth < CATALOG_LIMITS.depth, 'Directory depth exceeds limit');
        const node = await readNode(hash, parent, expectedLevel);
        for (const entry of node.entries) {
          if (entry.last <= after) continue;
          if (node.level) await visit(entry.hash, entry, node.level - 1, depth + 1);
          else found.push({ cik: entry.first, name: entry.name });
          if (found.length > limit) break;
        }
      }
      await visit(rootHash, undefined, undefined, 0);
      return { revision: rootHash, companies: found.slice(0, limit), next: found.length > limit ? found[limit - 1].cik : null };
    },
    stats: () => ({ ...stats, cachedBytes, cachedObjects: cache.size }),
    async getCompany(cik) {
      check(typeof cik === 'string' && cikPattern.test(cik) && Number(cik) > 0, 'Invalid company CIK');
      let hash = rootHash, parent, expectedLevel;
      for (let depth = 0; depth < CATALOG_LIMITS.depth; depth++) {
        const node = await readNode(hash, parent, expectedLevel);
        const entry = node.entries.find(item => item.first <= cik && item.last >= cik);
        if (!entry) return null;
        if (!node.level) {
          const record = await object(entry.hash, CATALOG_LIMITS.recordBytes, entry.bytes);
          check(record?.schema === 'canli.company-reference.v1' && record.cik === cik, 'Catalog record identity mismatch');
          return record;
        }
        parent = entry; expectedLevel = node.level - 1; hash = entry.hash;
      }
      throw new CatalogError('Catalog depth exceeds limit');
    },
  };
}
