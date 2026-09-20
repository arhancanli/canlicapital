import { catalogHash } from '../../_lib/company-catalog.js';
import { configuredCompanyCatalog } from '../../_lib/company-catalog-runtime.js';

export function createCompanyHandler({ catalog }) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'If-None-Match');
    res.setHeader('Access-Control-Expose-Headers', 'ETag');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.setHeader('Cache-Control', 'no-store'); return res.end(); }
    const send = (status, body, cache = 'no-store') => {
      res.statusCode = status; res.setHeader('Cache-Control', cache);
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body) + '\n');
    };
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD, OPTIONS'); return send(405, { error: 'method_not_allowed' }); }
    const cik = req.query?.cik;
    if (typeof cik !== 'string' || !/^\d{10}$/.test(cik) || Number(cik) < 1) return send(400, { error: 'invalid_company_cik' });
    if (!catalog) return send(503, { error: 'company_catalog_unavailable' });
    try {
      const company = await catalog.getCompany(cik);
      if (!company) return send(404, { error: 'company_not_found' }, 'public, max-age=0, s-maxage=60');
      const body = JSON.stringify(company) + '\n';
      const etag = `"${catalogHash(body)}"`;
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=60');
      const supplied = String(req.headers?.['if-none-match'] ?? '').split(',').map(value => value.trim().replace(/^W\//, ''));
      if (supplied.includes(etag) || supplied.includes('*')) { res.statusCode = 304; return res.end(); }
      res.statusCode = 200; res.end(req.method === 'HEAD' ? undefined : body);
    } catch { return send(503, { error: 'company_catalog_unavailable' }); }
  };
}

export default async function companyEndpoint(req, res) {
  return createCompanyHandler({ catalog: configuredCompanyCatalog() })(req, res);
}
