import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { CATALOG_LIMITS, catalogHash, validateCatalogNode } from '../../api/_lib/company-catalog.js';
import { FILINGS_LIMITS, FILINGS_SCHEMA, decodeFilingsDocument } from '../../api/_lib/company-filings-catalog.js';

// Builds a filings catalog beside a company catalog: the same node schema and
// limits, but each leaf object is one company's canli.company-filings.v1 document,
// gzip-compressed, stored as objects/{sha256 of the compressed bytes}.json.gz.
// Documents are processed one at a time; only compact references accumulate.
export function buildCompanyFilingsCatalog(documents, directory, options = {}) {
  mkdirSync(directory, { recursive: true });
  const lock = resolve(directory, '.filings-catalog-build.lock');
  const descriptor = openSync(lock, 'wx');
  try { return build(documents, directory, options); }
  finally { closeSync(descriptor); unlinkSync(lock); }
}

function build(documents, directory, { fanout = CATALOG_LIMITS.fanout } = {}) {
  if (!Number.isInteger(fanout) || fanout < 2 || fanout > CATALOG_LIMITS.fanout) throw new Error('Invalid catalog fanout');
  mkdirSync(resolve(directory, 'objects'), { recursive: true });
  const entries = []; const seen = new Set();
  let objectBytes = 0, inflatedBytes = 0, filings = 0, nodes = 0;
  function save(bytes, extension, limit) {
    if (bytes.length > limit) throw new Error('Object exceeds catalog byte budget');
    const hash = catalogHash(bytes), file = resolve(directory, 'objects', hash + extension);
    if (existsSync(file)) {
      if (catalogHash(readFileSync(file)) !== hash) throw new Error('Existing catalog object is corrupt');
    } else { writeFileSync(file + '.pending', bytes); renameSync(file + '.pending', file); }
    objectBytes += bytes.length;
    return { hash, bytes: bytes.length };
  }
  for (const document of documents) {
    if (document?.schema !== FILINGS_SCHEMA || !/^\d{10}$/.test(document.cik) || Number(document.cik) < 1 || seen.has(document.cik)) throw new Error('Invalid or duplicate filings company');
    if (!Array.isArray(document.filings) || !document.filings.length) throw new Error('A filings document must hold at least one filing');
    seen.add(document.cik);
    if (typeof document.name !== 'string' || !document.name.trim() || Buffer.byteLength(document.name) > 4096) throw new Error('Invalid company directory label');
    const inflated = Buffer.from(JSON.stringify(document) + '\n');
    if (inflated.length > FILINGS_LIMITS.inflatedBytes) throw new Error('Filings document exceeds the inflated byte limit');
    const compressed = gzipSync(inflated, { level: 9 });
    // Round trip through the runtime decoder before the object is referenced.
    const decoded = decodeFilingsDocument(compressed);
    if (decoded.cik !== document.cik || decoded.filings.length !== document.filings.length) throw new Error('Filings document does not round-trip');
    inflatedBytes += inflated.length; filings += document.filings.length;
    entries.push({ first: document.cik, last: document.cik, name: document.name, count: 1, filings: document.filings.length, inflated_bytes: inflated.length, ...save(compressed, '.json.gz', FILINGS_LIMITS.compressedBytes) });
  }
  if (!entries.length) throw new Error('Cannot build an empty filings catalog');
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
      parents.push({ first: children[0].first, last: children.at(-1).last, count: children.reduce((n, child) => n + child.count, 0), ...save(Buffer.from(JSON.stringify(node) + '\n'), '.json', CATALOG_LIMITS.nodeBytes) }); nodes++;
    }
    if (parents.length === 1) {
      const manifest = { schema: 'canli.company-filings-catalog.v1', root_hash: parents[0].hash, companies: entries.length, filings, index_levels: level + 1, index_nodes: nodes, object_bytes: objectBytes, inflated_bytes: inflatedBytes, publication_approved: false };
      writeFileSync(resolve(directory, 'filings-catalog.json.pending'), JSON.stringify(manifest, null, 2) + '\n');
      renameSync(resolve(directory, 'filings-catalog.json.pending'), resolve(directory, 'filings-catalog.json'));
      return manifest;
    }
    current = parents; level++;
  }
}
