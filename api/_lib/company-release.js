import { createCompanyCatalog, catalogHash } from './company-catalog.js';
import { createCompanyDownloadIndex } from './company-download-index.js';
import { createCompanyHtmlHandler } from './company-html.js';
import { createCompanyDirectoryHandler } from './company-directory-html.js';
import { createCompanyDownloadHandler } from './company-download.js';
import { createCompanyFilingsCatalog } from './company-filings-catalog.js';
import { createCompanyFilingsHandler } from './company-filings-html.js';

const hashPattern = /^[a-f0-9]{64}$/;
export async function loadCompanyRelease({ releaseHash, readReleaseObject, readCatalogObject, readDownloadIndexObject, readDownload, readFilingsObject, assets, indexable = false, directoryIndexable = false, filingsIndexable = false }) {
  if (!hashPattern.test(releaseHash)) throw new Error('Invalid company release hash');
  const bytes = Buffer.from(await readReleaseObject(releaseHash, 4096));
  if (bytes.length > 4096 || catalogHash(bytes) !== releaseHash) throw new Error('Company release byte binding failed');
  const release = JSON.parse(bytes);
  if (release?.schema !== 'canli.company-release.v1' || !hashPattern.test(release.catalog_root) || !hashPattern.test(release.download_root) || !Number.isSafeInteger(release.companies) || release.companies < 1 || release.companies > 9_999_999_999 || !Number.isSafeInteger(release.histories) || release.histories < release.companies * 4 || typeof release.publication_approved !== 'boolean') throw new Error('Invalid company release schema');
  if (release.filings_root !== undefined && (!hashPattern.test(release.filings_root) || !Number.isSafeInteger(release.filings) || release.filings < 1)) throw new Error('Invalid company release filings binding');
  const catalog = createCompanyCatalog({ rootHash: release.catalog_root, readObject: readCatalogObject });
  const downloads = createCompanyDownloadIndex({ rootHash: release.download_root, readObject: readDownloadIndexObject });
  const first = await catalog.directoryPage(1);
  if (first.total !== release.companies) throw new Error('Company release count does not match catalog');
  // Indexing is decided only by the caller from the bundled, reviewed activation
  // (see company-activation.js). The release object's publication_approved field
  // is never consulted, so storage contents cannot enable indexing remotely.
  if (indexable !== false && typeof indexable !== 'function') throw new Error('Company indexing must be false or an admission predicate');
  // Filings are optional per release: a release without filings_root serves 404s
  // on filing paths and its overviews link to no filing index. Objects live
  // beside the catalog under the same base.
  if (filingsIndexable !== false && typeof filingsIndexable !== 'function') throw new Error('Filings indexing must be false or an admission predicate');
  const filingsCatalog = release.filings_root && readFilingsObject ? createCompanyFilingsCatalog({ rootHash: release.filings_root, readObject: readFilingsObject }) : null;
  const filings = createCompanyFilingsHandler({ filings: filingsCatalog, assets, indexable: filingsCatalog ? filingsIndexable : false });
  const company = createCompanyHtmlHandler({ catalog, assets, indexable, filings: filingsCatalog });
  const directory = createCompanyDirectoryHandler({ catalog, assets, indexable: directoryIndexable === true });
  const download = createCompanyDownloadHandler({ index: downloads, readDownload });
  return { releaseHash, release, catalog, downloads, company, directory, download, filings, filingsCatalog };
}

// One loader per configured release. Concurrent requests share initial validation;
// failure clears only that promise so a temporary outage can recover on retry.
export function createCompanyReleaseLoader(options) {
  let pending;
  return () => {
    if (!pending) pending = loadCompanyRelease(options).catch(error => { pending = undefined; throw error; });
    return pending;
  };
}

export function createCompanyReferenceHandler({ loadRelease }) {
  return async (req, res) => {
    const fail = (status, message) => { res.statusCode = status; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex'); res.end(req.method === 'HEAD' ? undefined : message); };
    const path = req.query?.path;
    if (typeof path !== 'string' || path.length > 200) return fail(404, 'Company reference not found');
    const filing = path.match(/^\/companies\/(\d{10})\/filings(?:\/(\d{10}-\d{2}-\d{6}))?$/);
    const entity = filing ? null : path.match(/^\/companies\/(\d{10})(?:\/([A-Za-z][A-Za-z0-9]{0,99}))?$/);
    const page = path === '/companies' ? '1' : path.match(/^\/companies\/page\/([1-9]\d{0,8})$/)?.[1];
    const source = /^\/company-data\/(?:\d{10}\.json|sources\/[a-f0-9]{64}\.json\.gz)$/.test(path);
    if (!entity && !page && !source && !filing) return fail(404, 'Company reference not found');
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return fail(405, 'Method not allowed'); }
    if (path === '/companies/page/1') { res.statusCode = 308; res.setHeader('Location', '/companies'); res.setHeader('Cache-Control', 'no-store'); return res.end(); }
    try {
      const release = await loadRelease();
      if (filing) return await release.filings({ method: req.method, headers: req.headers, query: { cik: filing[1], ...(filing[2] ? { accession: filing[2] } : {}) } }, res);
      if (entity) return await release.company({ method: req.method, headers: req.headers, query: { cik: entity[1], ...(entity[2] ? { concept: entity[2] } : {}) } }, res);
      if (page) return await release.directory({ method: req.method, headers: req.headers, query: { page } }, res);
      return await release.download({ method: req.method, headers: req.headers, query: { path } }, res);
    } catch { return fail(503, 'Company reference temporarily unavailable'); }
  };
}
