import { renderCompanyPages } from '../../scripts/lib/company-page-renderer.mjs';
import { applyCompanyAssets } from '../../scripts/lib/company-assets.mjs';
import { catalogHash } from './company-catalog.js';

// The deployment wrapper provides a reviewed catalog, bundled asset manifest and an
// optional admission predicate from the explicit activation. Anything the predicate
// does not admit (and all staged/local HTML) stays noindex by response header.
// filingsIndexable(cik): the filing-page admission predicate. With it, a page links a cited
// accession to this site's filing page only when that page exists and is admitted.
export function createCompanyHtmlHandler({ catalog, assets, indexable = false, filings = null, filingsIndexable = false, now = () => performance.now() }) {
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
      // The record and the company's filings document come from two independent catalogs. The
      // filings document says which accessions have a filing page on this site, so a history can
      // cite them here instead of on sec.gov, and the overview can list the latest filings. The two
      // are read together, so a cold page waits for the slower read rather than for both in turn.
      // A missing company stays a 404 whatever the filings read does.
      const started = now();
      const [recordRead, summaryRead] = await Promise.allSettled([catalog.getCompany(cik), filings ? filings.getFilings(cik) : null]);
      if (recordRead.status === 'rejected') throw recordRead.reason;
      const record = recordRead.value;
      if (!record) return fail(404, 'Company page not found');
      if (concept !== undefined && !record.concepts.some(item => item.tag === concept)) return fail(404, 'Financial history not found');
      // An overview without its filings is a 503, never a page missing its filing link. A history
      // page only uses the filings to cite this site's filing pages, so without them it cites
      // sec.gov, as it did before filings existed.
      if (summaryRead.status === 'rejected' && concept === undefined) throw summaryRead.reason;
      const document = summaryRead.status === 'fulfilled' ? summaryRead.value : null;
      if (document && document.cik !== cik) throw new Error('Filings document does not match the company');
      const summary = document?.filings.length ? { filings: document.filings.length } : null;
      // Previews and local runs (no predicate) link every filing page the release holds.
      const filingPagesLinkable = typeof filingsIndexable === 'function' ? filingsIndexable(cik) === true : true;
      const filingPages = document && filingPagesLinkable ? new Set(document.filings.map(f => f.accession)) : new Set();
      const filingLink = accession => (filingPages.has(accession) ? `/companies/${cik}/filings/${accession}` : null);
      const latestFilings = document && filingPagesLinkable ? [...document.filings].sort((a, b) => (a.filed === b.filed ? b.accession.localeCompare(a.accession) : b.filed.localeCompare(a.filed))).slice(0, 5).map(f => ({ accession: f.accession, form: f.form, filed: f.filed })) : [];
      const read = now();
      const admitted = typeof indexable === 'function' ? indexable(cik, concept) === true : indexable === true;
      // In production a page links only histories the admission lets Google index; previews and
      // local runs (no predicate) link every history the record holds, as before.
      const linkConcept = typeof indexable === 'function' ? tag => indexable(cik, tag) === true : () => true;
      const pages = renderCompanyPages({ ...record, source_snapshot: `/company-data/sources/${record.source_sha256}.json.gz` }, { target: concept ?? 'overview', filings: summary, linkConcept, filingLink, latestFilings, robots: admitted ? 'index, follow' : 'noindex' });
      if (!pages.length) return fail(404, 'Financial history not found');
      const html = applyCompanyAssets(pages[0].html, assets);
      // Read by company-release.js into Server-Timing: storage reads and rendering, separately.
      res.canliTiming = { storageMs: read - started, renderMs: now() - read };
      if (Buffer.byteLength(html) > 256 * 1024) return fail(503, 'Company reference temporarily unavailable');
      const etag = `"${catalogHash(html)}"`;
      res.setHeader('ETag', etag); res.setHeader('Cache-Control', admitted ? 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' : 'no-store');
      if (!admitted) res.setHeader('X-Robots-Tag', 'noindex');
      if (String(req.headers?.['if-none-match'] ?? '').split(',').map(value => value.trim().replace(/^W\//, '')).some(value => value === etag || value === '*')) { res.statusCode = 304; return res.end(); }
      res.statusCode = 200; res.end(req.method === 'HEAD' ? undefined : html);
    } catch { return fail(503, 'Company reference temporarily unavailable'); }
  };
}
