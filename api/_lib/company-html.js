import { renderCompanyPages } from '../../scripts/lib/company-page-renderer.mjs';
import { applyCompanyAssets } from '../../scripts/lib/company-assets.mjs';
import { catalogHash } from './company-catalog.js';

// The deployment wrapper provides a reviewed catalog, bundled asset manifest and an
// optional admission predicate from the explicit activation. Anything the predicate
// does not admit (and all staged/local HTML) stays noindex by response header.
export function createCompanyHtmlHandler({ catalog, assets, indexable = false, filings = null, now = () => performance.now() }) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const fail = (status, message) => {
      res.statusCode = status; res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex');
      res.end(req.method === 'HEAD' ? undefined : `<!doctype html><html lang="en"><head><meta name="robots" content="noindex"><title>${message}</title></head><body><h1>${message}</h1></body></html>`);
    };
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return fail(405, 'Method not allowed'); }
    const cik = req.query?.cik, concept = req.query?.concept;
    if (typeof cik !== 'string' || !/^\d{10}$/.test(cik) || Number(cik) < 1 || (concept !== undefined && (typeof concept !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,99}$/.test(concept)))) return fail(404, 'Company page not found');
    if (!catalog || !assets) return fail(503, 'Company reference temporarily unavailable');
    try {
      // The record and, on an overview, the filing summary (the overview links to the filing index
      // when this release holds filings for the company) come from two independent catalogs. They
      // are read together, so a cold page waits for the slower read rather than for both in turn.
      // A missing company stays a 404 whatever the filings read does.
      const started = now();
      const [recordRead, summaryRead] = await Promise.allSettled([catalog.getCompany(cik), concept === undefined && filings ? filings.filingSummary(cik) : null]);
      if (recordRead.status === 'rejected') throw recordRead.reason;
      const record = recordRead.value;
      if (!record) return fail(404, 'Company page not found');
      if (concept !== undefined && !record.concepts.some(item => item.tag === concept)) return fail(404, 'Financial history not found');
      if (summaryRead.status === 'rejected') throw summaryRead.reason;
      const summary = summaryRead.value;
      const read = now();
      const pages = renderCompanyPages({ ...record, source_snapshot: `/company-data/sources/${record.source_sha256}.json.gz` }, { target: concept ?? 'overview', filings: summary });
      if (!pages.length) return fail(404, 'Financial history not found');
      const html = applyCompanyAssets(pages[0].html, assets);
      // Read by company-release.js into Server-Timing: storage reads and rendering, separately.
      res.canliTiming = { storageMs: read - started, renderMs: now() - read };
      if (Buffer.byteLength(html) > 256 * 1024) return fail(503, 'Company reference temporarily unavailable');
      const etag = `"${catalogHash(html)}"`;
      const admitted = typeof indexable === 'function' ? indexable(cik, concept) === true : indexable === true;
      res.setHeader('ETag', etag); res.setHeader('Cache-Control', admitted ? 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' : 'no-store');
      if (!admitted) res.setHeader('X-Robots-Tag', 'noindex');
      if (String(req.headers?.['if-none-match'] ?? '').split(',').map(value => value.trim().replace(/^W\//, '')).some(value => value === etag || value === '*')) { res.statusCode = 304; return res.end(); }
      res.statusCode = 200; res.end(req.method === 'HEAD' ? undefined : html);
    } catch { return fail(503, 'Company reference temporarily unavailable'); }
  };
}
