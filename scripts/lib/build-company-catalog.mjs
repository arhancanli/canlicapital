import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATALOG_LIMITS, catalogHash, validateCatalogNode } from '../../api/_lib/company-catalog.js';

// Only compact references accumulate; each full company record is processed alone.
// The activation pointer is written last, after all immutable objects are present.
export function buildCompanyCatalog(records, directory, options = {}) {
  mkdirSync(directory, { recursive: true });
  const lock = resolve(directory, '.catalog-build.lock');
  const descriptor = openSync(lock, 'wx');
  try { return build(records, directory, options); }
  finally { closeSync(descriptor); unlinkSync(lock); }
}
function build(records, directory, { fanout = CATALOG_LIMITS.fanout } = {}) {
  if (!Number.isInteger(fanout) || fanout < 2 || fanout > CATALOG_LIMITS.fanout) throw new Error('Invalid catalog fanout');
  mkdirSync(resolve(directory, 'objects'), { recursive: true });
  const entries = []; const seen = new Set(); let objectBytes = 0, nodes = 0;
  function save(value, limit) {
    const bytes = Buffer.from(JSON.stringify(value) + '\n');
    if (bytes.length > limit) throw new Error('Object exceeds catalog byte budget');
    const hash = catalogHash(bytes), file = resolve(directory, 'objects', hash + '.json');
    if (existsSync(file)) {
      if (catalogHash(readFileSync(file)) !== hash) throw new Error('Existing catalog object is corrupt');
    } else { writeFileSync(file + '.pending', bytes); renameSync(file + '.pending', file); }
    objectBytes += bytes.length;
    return { hash, bytes: bytes.length };
  }
  for (const record of records) {
    if (record?.schema !== 'canli.company-reference.v1' || !/^\d{10}$/.test(record.cik) || Number(record.cik) < 1 || seen.has(record.cik)) throw new Error('Invalid or duplicate catalog company');
    seen.add(record.cik);
    if (typeof record.name !== 'string' || !record.name.trim() || Buffer.byteLength(record.name) > 4096) throw new Error('Invalid company directory label');
    entries.push({ first: record.cik, last: record.cik, name: record.name, count: 1, ...save(record, CATALOG_LIMITS.recordBytes) });
  }
  if (!entries.length) throw new Error('Cannot build an empty catalog');
  entries.sort((a, b) => a.first.localeCompare(b.first));
  let current = entries, level = 0;
  while (true) {
    if (level >= CATALOG_LIMITS.depth) throw new Error('Catalog exceeds maximum depth');
    const parents = [];
    for (let offset = 0; offset < current.length;) {
      const children = [];
      while (offset < current.length && children.length < fanout) {
        const candidate = [...children, current[offset]];
        if (Buffer.byteLength(JSON.stringify({ schema: 'canli.company-catalog-node.v1', level, entries: candidate }) + '\n') > CATALOG_LIMITS.nodeBytes) break;
        children.push(current[offset++]);
      }
      if (!children.length) throw new Error('One directory entry exceeds the node budget');
      const node = validateCatalogNode({ schema: 'canli.company-catalog-node.v1', level, entries: children });
      parents.push({ first: children[0].first, last: children.at(-1).last, count: children.reduce((n, child) => n + child.count, 0), ...save(node, CATALOG_LIMITS.nodeBytes) }); nodes++;
    }
    if (parents.length === 1) {
      const manifest = { schema: 'canli.company-catalog.v1', root_hash: parents[0].hash, companies: entries.length, index_levels: level + 1, index_nodes: nodes, object_bytes: objectBytes, publication_approved: false };
      writeFileSync(resolve(directory, 'catalog.json.pending'), JSON.stringify(manifest, null, 2) + '\n');
      renameSync(resolve(directory, 'catalog.json.pending'), resolve(directory, 'catalog.json'));
      return manifest;
    }
    current = parents; level++;
  }
}
