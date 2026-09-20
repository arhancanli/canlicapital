import { renderCompanyDirectory } from '../../scripts/lib/company-directory.mjs';
import { applyCompanyAssets } from '../../scripts/lib/company-assets.mjs';
import { catalogHash } from './company-catalog.js';
export function createCompanyDirectoryHandler({ catalog, assets, indexable = false }) {
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
      const html = applyCompanyAssets(renderCompanyDirectory(listing).html, assets);
      if (Buffer.byteLength(html) > 256 * 1024) throw new Error('Directory exceeds HTML budget');
      const etag = `"${catalogHash(html)}"`;
      res.setHeader('ETag', etag); res.setHeader('Cache-Control', indexable ? 'public, max-age=0, s-maxage=300' : 'no-store');
      if (!indexable) res.setHeader('X-Robots-Tag', 'noindex');
      if (String(req.headers?.['if-none-match'] ?? '').split(',').map(value => value.trim().replace(/^W\//, '')).some(value => value === etag || value === '*')) { res.statusCode = 304; return res.end(); }
      res.statusCode = 200; res.end(req.method === 'HEAD' ? undefined : html);
    } catch { return fail(503, 'Company directory temporarily unavailable'); }
  };
}
