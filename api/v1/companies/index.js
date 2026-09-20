import { catalogHash } from '../../_lib/company-catalog.js';
import { configuredCompanyCatalog } from '../../_lib/company-catalog-runtime.js';
export function createCompanyDirectoryHandler({ catalog }) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'If-None-Match');
    res.setHeader('Access-Control-Expose-Headers', 'ETag');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.setHeader('Cache-Control', 'no-store'); return res.end(); }
    const send = (status, body, cache = 'no-store') => { res.statusCode = status; res.setHeader('Cache-Control', cache); res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body) + '\n'); };
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD, OPTIONS'); return send(405, { error: 'method_not_allowed' }); }
    const after = req.query?.after ?? '', limitText = req.query?.limit ?? '50';
    if (typeof after !== 'string' || (after && !/^\d{10}$/.test(after)) || typeof limitText !== 'string' || !/^[1-9]\d?$/.test(limitText) || Number(limitText) > 50) return send(400, { error: 'invalid_directory_parameters' });
    if (!catalog) return send(503, { error: 'company_catalog_unavailable' });
    if (req.query?.revision !== undefined && req.query.revision !== catalog.revision) return send(409, { error: 'catalog_revision_changed', revision: catalog.revision });
    try {
      const page = await catalog.listCompanies({ after, limit: Number(limitText) });
      const body = JSON.stringify(page) + '\n', etag = `"${catalogHash(body)}"`;
      res.setHeader('ETag', etag); res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
      const supplied = String(req.headers?.['if-none-match'] ?? '').split(',').map(value => value.trim().replace(/^W\//, ''));
      if (supplied.includes(etag) || supplied.includes('*')) { res.statusCode = 304; return res.end(); }
      res.statusCode = 200; res.end(req.method === 'HEAD' ? undefined : body);
    } catch { return send(503, { error: 'company_catalog_unavailable' }); }
  };
}
export default async function companyDirectory(req, res) {
  return createCompanyDirectoryHandler({ catalog: configuredCompanyCatalog() })(req, res);
}
