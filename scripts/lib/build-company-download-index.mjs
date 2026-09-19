import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalogHash } from '../../api/_lib/company-catalog.js';
import { DOWNLOAD_LIMITS, validateDownloadDescriptor, validateDownloadNode } from '../../api/_lib/company-download-index.js';

// Staging retains compact descriptors, not source response bytes. The runtime
// reads a bounded path through the hash trie; build memory still grows with count.
export function buildCompanyDownloadIndex(descriptors, directory) {
  mkdirSync(resolve(directory, 'objects'), { recursive: true });
  const entries = [...descriptors].map(item => ({ key: catalogHash(validateDownloadDescriptor(item).path), value: item })).sort((a, b) => a.key.localeCompare(b.key));
  if (!entries.length || new Set(entries.map(item => item.key)).size !== entries.length) throw new Error('Empty or duplicate download index');
  let nodes = 0, bytesWritten = 0, maxDepth = 0;
  function visit(items, prefix) {
    let node = { schema: 'canli.company-download-node.v1', prefix, entries: items.map(item => item.value) };
    if (items.length > 128 || Buffer.byteLength(JSON.stringify(node) + '\n') > DOWNLOAD_LIMITS.nodeBytes) {
      if (prefix.length === 64) throw new Error('Download descriptor exceeds node bound');
      const groups = new Map();
      for (const item of items) { const digit = item.key[prefix.length]; if (!groups.has(digit)) groups.set(digit, []); groups.get(digit).push(item); }
      node = { schema: node.schema, prefix, children: [...groups].map(([digit, group]) => ({ digit, ...visit(group, prefix + digit) })) };
    }
    validateDownloadNode(node, prefix);
    const bytes = Buffer.from(JSON.stringify(node) + '\n');
    if (bytes.length > DOWNLOAD_LIMITS.nodeBytes) throw new Error('Download index node exceeds bound');
    const hash = catalogHash(bytes), file = resolve(directory, 'objects', hash + '.json');
    if (existsSync(file)) { if (catalogHash(readFileSync(file)) !== hash) throw new Error('Existing download index object is corrupt'); }
    else { writeFileSync(file + '.pending', bytes); renameSync(file + '.pending', file); }
    nodes++; bytesWritten += bytes.length; maxDepth = Math.max(maxDepth, prefix.length + 1);
    return { hash, bytes: bytes.length };
  }
  const root = visit(entries, '');
  return { root_hash: root.hash, downloads: entries.length, nodes, index_bytes: bytesWritten, max_depth: maxDepth };
}
