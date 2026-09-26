import { renderFilingPages } from '../../scripts/lib/company-filing-page-renderer.mjs';
import { applyCompanyAssets } from '../../scripts/lib/company-assets.mjs';
import { catalogHash } from './company-catalog.js';

// Serves /companies/{cik}/filings (index) and /companies/{cik}/filings/{accession}
// from a verified filings catalog. Indexability is decided per company by the
// activation's admission predicate; everything else stays noindex and no-store,
// exactly as company-html.js does for history pages.
const ACCESSION = /^\d{10}-\d{2}-\d{6}$/;
// historyIndexable(cik, tag): the history-page admission predicate. A filing page links a concept
// to its history page only when that history is admitted; without a predicate (previews, local
// runs) every concept is linked, as before.
export function createCompanyFilingsHandler({ filings, assets, indexable = false, historyIndexable = false }) {
  if (indexable !== false && typeof indexable !== 'function') throw new Error('Filings indexing must be false or an admission predicate');
  return async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const fail = (status, message) => {
      res.statusCode = status; res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex');
      res.end(req.method === 'HEAD' ? undefined : `<!doctype html><html lang="en"><head><meta name="robots" content="noindex"><title>${message}</title></head><body><h1>${message}</h1></body></html>`);
    };
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return fail(405, 'Method not allowed'); }
    const cik = req.query?.cik, accession = req.query?.accession;
    if (typeof cik !== 'string' || !/^\d{10}$/.test(cik) || Number(cik) < 1 || (accession !== undefined && (typeof accession !== 'string' || !ACCESSION.test(accession)))) return fail(404, 'Filing page not found');
    if (!filings || !assets) return fail(404, 'Company filings not available');
    try {
      const document = await filings.getFilings(cik);
      if (!document) return fail(404, 'Filing page not found');
      const admitted = typeof indexable === 'function' ? indexable(cik) === true : false;
      const linkConcept = typeof historyIndexable === 'function' ? tag => historyIndexable(cik, tag) === true : () => true;
      const pages = renderFilingPages(document, { target: accession ?? 'index', linkConcept, robots: admitted ? 'index, follow' : 'noindex' });
      if (!pages.length) return fail(404, 'Filing page not found');
      const html = applyCompanyAssets(pages[0].html, assets);
      if (Buffer.byteLength(html) > 256 * 1024) return fail(503, 'Company filings temporarily unavailable');
      const etag = `"${catalogHash(html)}"`;
      res.setHeader('ETag', etag); res.setHeader('Cache-Control', admitted ? 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' : 'no-store');
      if (!admitted) res.setHeader('X-Robots-Tag', 'noindex');
      if (String(req.headers?.['if-none-match'] ?? '').split(',').map(value => value.trim().replace(/^W\//, '')).some(value => value === etag || value === '*')) { res.statusCode = 304; return res.end(); }
      res.statusCode = 200; res.end(req.method === 'HEAD' ? undefined : html);
    } catch { return fail(503, 'Company filings temporarily unavailable'); }
  };
}
