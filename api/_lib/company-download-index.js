import { catalogHash } from './company-catalog.js';
export const DOWNLOAD_LIMITS = Object.freeze({ nodeBytes: 64 * 1024, cacheBytes: 256 * 1024, objectBytes: 16 * 1024 * 1024 });
const hashPattern = /^[a-f0-9]{64}$/;
export const downloadPath = path => typeof path === 'string' && /^\/company-data\/(?:\d{10}\.json|sources\/[a-f0-9]{64}\.json\.gz)$/.test(path);
const check = (ok, message) => { if (!ok) throw new Error(message); };
export function validateDownloadDescriptor(item) {
  check(item && downloadPath(item.path) && hashPattern.test(item.sha256), 'Invalid download identity');
  check(item.storage_path === `objects/${item.sha256}.json${item.path.endsWith('.gz') ? '.gz' : ''}`, 'Invalid download storage path');
  check(Number.isSafeInteger(item.bytes) && item.bytes > 0 && item.bytes <= DOWNLOAD_LIMITS.objectBytes, 'Invalid download byte bound');
  return item;
}
export function validateDownloadNode(node, prefix) {
  check(node?.schema === 'canli.company-download-node.v1' && node.prefix === prefix && /^[a-f0-9]{0,64}$/.test(prefix), 'Invalid download node prefix');
  check(Array.isArray(node.entries) !== Array.isArray(node.children), 'Ambiguous download node');
  if (node.entries) {
    check(node.entries.length > 0 && node.entries.length <= 128, 'Invalid download leaf size');
    let previous = '';
    for (const item of node.entries) {
      validateDownloadDescriptor(item);
      const key = catalogHash(item.path);
      check(key.startsWith(prefix) && key > previous, 'Invalid download leaf ordering'); previous = key;
    }
  } else {
    check(prefix.length < 64 && node.children.length > 0 && node.children.length <= 16, 'Invalid download branch');
    let previous = '';
    for (const child of node.children) {
      check(/^[a-f0-9]$/.test(child.digit) && child.digit > previous && hashPattern.test(child.hash) && Number.isInteger(child.bytes) && child.bytes > 0 && child.bytes <= DOWNLOAD_LIMITS.nodeBytes, 'Invalid download child'); previous = child.digit;
    }
  }
  return node;
}
export function createCompanyDownloadIndex({ rootHash, readObject }) {
  check(hashPattern.test(rootHash), 'Invalid download root');
  const cache = new Map(); let cachedBytes = 0;
  const stats = { objectReads: 0, bytesRead: 0, maxReadBytes: 0 };
  return {
    stats: () => ({ ...stats, cachedBytes }),
    async find(path) {
      if (!downloadPath(path)) return null;
      const key = catalogHash(path); let hash = rootHash, prefix = '', expectedBytes;
      for (let depth = 0; depth <= 64; depth++) {
        let bytes = cache.get(hash);
        if (bytes) { cache.delete(hash); cache.set(hash, bytes); }
        else {
          bytes = Buffer.from(await readObject(hash, DOWNLOAD_LIMITS.nodeBytes));
          check(bytes.length <= DOWNLOAD_LIMITS.nodeBytes && catalogHash(bytes) === hash, 'Corrupt download index object');
          stats.objectReads++; stats.bytesRead += bytes.length; stats.maxReadBytes = Math.max(stats.maxReadBytes, bytes.length);
          if (!cache.has(hash)) {
            while (cache.size && cachedBytes + bytes.length > DOWNLOAD_LIMITS.cacheBytes) { const first = cache.keys().next().value; cachedBytes -= cache.get(first).length; cache.delete(first); }
            cache.set(hash, bytes); cachedBytes += bytes.length;
          }
        }
        check(expectedBytes === undefined || expectedBytes === bytes.length, 'Download child size mismatch');
        const node = validateDownloadNode(JSON.parse(bytes), prefix);
        if (node.entries) return node.entries.find(item => item.path === path) ?? null;
        const child = node.children.find(item => item.digit === key[depth]);
        if (!child) return null;
        prefix += child.digit; hash = child.hash; expectedBytes = child.bytes;
      }
      throw new Error('Download index exceeds key depth');
    },
  };
}
