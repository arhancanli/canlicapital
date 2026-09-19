import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createCompanyCatalog, catalogHash } from '../../api/_lib/company-catalog.js';
import { createCompanyHtmlHandler } from '../../api/_lib/company-html.js';
import { createCompanyDownloadIndex } from '../../api/_lib/company-download-index.js';
import { createCompanyDownloadHandler } from '../../api/_lib/company-download.js';
import { createCompanyDirectoryHandler } from '../../api/_lib/company-directory-html.js';

// Local QA host. Directory and download requests use bounded catalog/index
// lookups. The full delivery manifest is retained only for the measurement caller.
export function companyPreviewServer({ catalogDir, deliveryDir, distDir, discoveryDir }) {
  const readJson = file => JSON.parse(readFileSync(file));
  const revision = readJson(resolve(catalogDir, 'catalog.json'));
  const delivery = readJson(resolve(deliveryDir, 'delivery.json'));
  const discovery = discoveryDir ? readJson(resolve(discoveryDir, 'discovery.json')) : null;
  if (discovery && (discovery.catalog_root !== revision.root_hash || discovery.files.length > 1000)) throw new Error('Discovery revision mismatch or oversized file manifest');
  const assets = readJson(resolve(distDir, 'company-page-assets.json'));
  const catalog = createCompanyCatalog({ rootHash: revision.root_hash, readObject: hash => readFileSync(resolve(catalogDir, `objects/${hash}.json`)) });
  const downloadIndex = createCompanyDownloadIndex({ rootHash: delivery.download_index.root_hash, readObject: hash => readFileSync(resolve(deliveryDir, `objects/${hash}.json`)) });
  const downloadHandler = createCompanyDownloadHandler({ index: downloadIndex, readDownload: item => readFileSync(resolve(deliveryDir, item.storage_path)) });
  const pages = Math.ceil(revision.companies / 50);
  const htmlHandler = createCompanyHtmlHandler({ catalog, assets });
  const directoryHandler = createCompanyDirectoryHandler({ catalog, assets });
  const server = createServer(async (req, res) => {
    const reply = (status, body, type = 'text/plain; charset=utf-8') => {
      res.statusCode = status; res.setHeader('Content-Type', type); res.end(req.method === 'HEAD' ? undefined : body);
    };
    res.setHeader('X-Robots-Tag', 'noindex'); res.setHeader('Cache-Control', 'no-store');
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return reply(405, 'Method not allowed'); }
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      const entity = path.match(/^\/companies\/(\d{10})(?:\/([A-Za-z][A-Za-z0-9]{0,99}))?$/);
      if (entity) { req.query = { cik: entity[1], ...(entity[2] ? { concept: entity[2] } : {}) }; return await htmlHandler(req, res); }
      const directory = path === '/companies' ? 1 : Number(path.match(/^\/companies\/page\/([1-9]\d*)$/)?.[1]);
      if (directory) {
        if (directory === 1 && path !== '/companies') { res.setHeader('Location', '/companies'); return reply(308, ''); }
        req.query = { page: String(directory) }; return await directoryHandler(req, res);
      }
      if (discovery && (path === '/company-sitemap.xml' || /^\/sitemap-pages-[a-f0-9]{24}\.xml$/.test(path))) {
        const name = path === '/company-sitemap.xml' ? 'sitemap.xml' : path.slice(1);
        const item = discovery.files.find(file => file.name === name);
        if (!item) return reply(404, 'Sitemap not found');
        if (!/^releases\/[a-f0-9]{64}\/sitemap(?:-pages-[a-f0-9]{24})?\.xml$/.test(item.storage_path) || item.bytes > 50 * 1024 * 1024) throw new Error('Invalid sitemap descriptor');
        const bytes = readFileSync(resolve(discoveryDir, item.storage_path));
        if (bytes.length !== item.bytes || catalogHash(bytes) !== item.sha256) throw new Error('Corrupt discovery sitemap');
        return reply(200, bytes, 'application/xml; charset=utf-8');
      }
      if (path.startsWith('/company-data/')) { req.query = { path }; return await downloadHandler(req, res); }
      if (/^\/assets\/[A-Za-z0-9_.-]+$/.test(path)) {
        let bytes; try { bytes = readFileSync(resolve(distDir, path.slice(1))); } catch (error) { if (error.code === 'ENOENT') return reply(404, 'Asset not found'); throw error; }
        const types = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
        return reply(200, bytes, types[extname(path)] ?? 'application/octet-stream');
      }
      return reply(404, 'Page not found');
    } catch { return reply(503, 'Company reference temporarily unavailable'); }
  });
  return { server, catalog, delivery, downloadIndex, directoryPages: pages };
}
