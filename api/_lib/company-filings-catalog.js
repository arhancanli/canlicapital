import { gunzipSync } from 'node:zlib';
import { CATALOG_LIMITS, CatalogError, createCompanyCatalog } from './company-catalog.js';

// A filings catalog is a company catalog whose leaf objects are gzip-compressed
// canli.company-filings.v1 documents (one per company) instead of company records.
// Compressed objects are bounded like records; inflation is bounded separately so
// a crafted object cannot expand without limit.
export const FILINGS_LIMITS = Object.freeze({ compressedBytes: CATALOG_LIMITS.recordBytes, inflatedBytes: 4 * 1024 * 1024 });
export const FILINGS_SCHEMA = 'canli.company-filings.v1';

export function decodeFilingsDocument(bytes) {
  let inflated;
  try { inflated = gunzipSync(bytes, { maxOutputLength: FILINGS_LIMITS.inflatedBytes }); }
  catch { throw new CatalogError('Filings document does not inflate within its byte limit'); }
  const document = JSON.parse(inflated.toString('utf8'));
  if (document?.schema !== FILINGS_SCHEMA || !Array.isArray(document.filings) || !/^\d{10}$/.test(document.cik)) throw new CatalogError('Invalid filings document');
  return document;
}

export const FILINGS_LEAF = Object.freeze({ schema: FILINGS_SCHEMA, limit: FILINGS_LIMITS.compressedBytes, decode: decodeFilingsDocument });

export function createCompanyFilingsCatalog({ rootHash, readObject, cacheBytes }) {
  const catalog = createCompanyCatalog({ rootHash, readObject, cacheBytes, leaf: FILINGS_LEAF });
  return {
    revision: rootHash,
    stats: catalog.stats,
    getFilings: cik => catalog.getCompany(cik),
    // Whether the company has filing pages and how many, from the index entry
    // alone: the overview links to the filing index without reading the document.
    async filingSummary(cik) {
      const entry = await catalog.entry(cik);
      if (!entry) return null;
      if (!Number.isSafeInteger(entry.filings) || entry.filings < 1) throw new CatalogError('Filings entry without a filing count');
      return { filings: entry.filings };
    },
  };
}
