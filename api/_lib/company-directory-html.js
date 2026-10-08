import { renderCompanyDirectory } from '../../scripts/lib/company-directory.mjs';
import { applyCompanyAssets } from '../../scripts/lib/company-assets.mjs';
import { catalogHash } from './company-catalog.js';
// filings: the filings catalog; filingsIndexable(cik): the filing-page admission predicate. With
// both, each row links the company's filing index, read from the filings index entry alone (no
// filing document). Previews and local runs (no predicate) link every filing index the release holds.
export function createCompanyDirectoryHandler({ catalog, assets, indexable = false, filings = null, filingsIndexable = false }) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const fail = (status, message) => { res.statusCode = status; res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex'); res.end(req.method === 'HEAD' ? undefined : `<!doctype html><html lang="en"><head><title>${message}</title><meta name="robots" content="noindex"></head><body><h1>${message}</h1></body></html>`); };
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return fail(405, 'Method not allowed'); }
    const pageText = req.query?.page ?? '1';
    if (typeof pageText !== 'string' || !/^[1-9]\d{0,8}$/.test(pageText)) return fail(404, 'Directory page not found');
    if (!catalog || !assets) return fail(503, 'Company directory temporarily unavailable');
    try {
      const listing = await catalog.directoryPage(Number(pageText));
      if (!listing) return fail(404, 'Directory page not found');
      // A failed filings read is a 503, never a page that silently drops its filing links.
      const linkable = cik => (typeof filingsIndexable === 'function' ? filingsIndexable(cik) === true : true);
      const counts = filings ? await Promise.all(listing.companies.map(item => (linkable(item.cik) ? filings.filingSummary(item.cik) : null))) : [];
      const companies = listing.companies.map((item, index) => (counts[index] ? { ...item, filings: counts[index].filings } : item));
      const html = applyCompanyAssets(renderCompanyDirectory({ ...listing, companies }).html, assets);
      if (Buffer.byteLength(html) > 256 * 1024) throw new Error('Directory exceeds HTML budget');
      const etag = `"${catalogHash(html)}"`;
      res.setHeader('ETag', etag); res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');
      if (!indexable) res.setHeader('X-Robots-Tag', 'noindex');
      if (String(req.headers?.['if-none-match'] ?? '').split(',').map(value => value.trim().replace(/^W\//, '')).some(value => value === etag || value === '*')) { res.statusCode = 304; return res.end(); }
      res.statusCode = 200; res.end(req.method === 'HEAD' ? undefined : html);
    } catch { return fail(503, 'Company directory temporarily unavailable'); }
  };
}
