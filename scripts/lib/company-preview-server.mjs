import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createCompanyCatalog } from '../../api/_lib/company-catalog.js';
import { createCompanyHtmlHandler } from '../../api/_lib/company-html.js';
import { createCompanyDownloadIndex } from '../../api/_lib/company-download-index.js';
import { createCompanyDownloadHandler } from '../../api/_lib/company-download.js';
import { renderReferenceDocument } from './company-page-renderer.mjs';
import { applyCompanyAssets } from './company-assets.mjs';
import { escapeXml as esc } from './sitemaps.mjs';

// Local QA only. Download lookup uses the bounded immutable index; directory
// boundaries still use the complete cohort list and need production discovery.
export function companyPreviewServer({ catalogDir, deliveryDir, distDir }) {
  const readJson = file => JSON.parse(readFileSync(file));
  const revision = readJson(resolve(catalogDir, 'catalog.json'));
  const delivery = readJson(resolve(deliveryDir, 'delivery.json'));
  const assets = readJson(resolve(distDir, 'company-page-assets.json'));
  const catalog = createCompanyCatalog({ rootHash: revision.root_hash, readObject: hash => readFileSync(resolve(catalogDir, `objects/${hash}.json`)) });
  const downloadIndex = createCompanyDownloadIndex({ rootHash: delivery.download_index.root_hash, readObject: hash => readFileSync(resolve(deliveryDir, `objects/${hash}.json`)) });
  const downloadHandler = createCompanyDownloadHandler({ index: downloadIndex, readDownload: item => readFileSync(resolve(deliveryDir, item.storage_path)) });
  const ciks = delivery.files.map(item => item.cik).sort();
  if (new Set(ciks).size !== ciks.length || ciks.length !== revision.companies) throw new Error('Catalog and download cohort disagree');
  const pages = Math.ceil(ciks.length / 50);
  const htmlHandler = createCompanyHtmlHandler({ catalog, assets });
  const pathFor = page => page === 1 ? '/companies' : `/companies/page/${page}`;
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
        if (directory > pages) return reply(404, 'Directory page not found');
        if (directory === 1 && path !== '/companies') { res.setHeader('Location', '/companies'); return reply(308, ''); }
        const listing = await catalog.listCompanies({ after: directory === 1 ? '' : ciks[(directory - 1) * 50 - 1], limit: 50 });
        if (listing.companies.some((item, i) => item.cik !== ciks[(directory - 1) * 50 + i])) throw new Error('Directory cohort mismatch');
        const nav = Array.from({ length: pages }, (_, i) => i + 1).map(n => n === directory ? `<span aria-current="page">${n}</span>` : `<a href="${pathFor(n)}">${n}</a>`).join(' · ');
        const page = renderReferenceDocument({ path: pathFor(directory), title: `Company filing directory: page ${directory}`, heading: `Company filings: page ${directory}`, description: 'Browse source-backed company accounting histories with original units, filing dates and downloadable records.', sources: listing.companies.map(item => `company-data/${item.cik}.json`), body: `<section><h2>Inspect company inputs</h2><p>This staged collection contains selected accounting histories, not a complete or tradable market universe. Review reporting coverage and filing availability before using these records in research.</p><ul class="company-reference__directory">${listing.companies.map(item => `<li><a href="/companies/${item.cik}">${esc(item.name)}</a><span>CIK ${item.cik}</span></li>`).join('')}</ul><nav aria-label="Company directory pages">${nav}</nav></section><section><h2>Build with the platform</h2><p><a href="/developers#quickstart">API-key quickstart</a> · <a href="/developers#ai-assistant">Connect the MCP server</a> · <a href="https://github.com/arhancanli/alphac">Inspect the engine on GitHub</a></p></section>` });
        return reply(200, applyCompanyAssets(page.html, assets), 'text/html; charset=utf-8');
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
