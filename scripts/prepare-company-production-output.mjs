import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCompanyActivation, loadCompanyFilingAdmission } from '../api/_lib/company-activation.js';
import { MAX_BYTES, MAX_URLS, escapeXml, parseSitemap } from './lib/sitemaps.mjs';

const ORIGIN = 'https://canlicapital.com';

// Vercel-only output step for an enabled, reviewed company activation.
//
// 1. Remove the generated pilot copies (companies/, companies.html, company-data/).
//    Vercel serves filesystem output before rewrites, so they would otherwise shadow
//    the activated release on the same URLs.
// 2. Rebuild dist/sitemap.xml as a sitemap index with STABLE child names:
//    sitemap-site.xml (the site's pages minus every /companies URL) and
//    sitemap-companies-N.xml (exactly the admitted company URLs, 50,000 per file).
//    Content-addressed names changed whenever a site page's lastmod changed, so an
//    hourly deploy could remove a child that a crawler had just read in the index.
//
// Local and CI builds (no VERCEL_ENV) keep the static pilot output, so the existing
// static-site audits still cover what they were written for. Preview builds run the
// same transformation as production so it can be inspected before release; their
// responses stay noindex at runtime.
export function prepareCompanyProductionOutput(root, { environment = process.env, activation = loadCompanyActivation({ root }) } = {}) {
  if (!activation.enabled || !['production', 'preview'].includes(environment.VERCEL_ENV)) return null;
  root = realpathSync(root);
  const dist = resolve(root, 'dist');
  if (lstatSync(dist).isSymbolicLink() || realpathSync(dist) !== dist || !existsSync(resolve(dist, 'index.html')) || !existsSync(resolve(dist, 'company-page-assets.json'))) throw new Error('Expected completed local dist build');

  const sitemapPath = resolve(dist, 'sitemap.xml');
  const xml = readFileSync(sitemapPath, 'utf8');
  const parsed = parseSitemap(xml);
  if (parsed.index) throw new Error('Site sitemap is already an index; refusing to rebuild it twice');
  const entries = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?[\s\S]*?<\/url>/g)].map(([, loc, lastmod]) => ({ loc, lastmod }));
  if (entries.length !== parsed.locations.length) throw new Error('Could not read every site sitemap entry');
  const isCompany = loc => { const path = new URL(loc).pathname; return path === '/companies' || path.startsWith('/companies/') || path.startsWith('/company-data/'); };
  const site = entries.filter(entry => !isCompany(entry.loc));

  const paths = ['companies', 'companies.html', 'company-data'].map(name => resolve(dist, name));
  for (const path of paths) if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('Unexpected symlink in company output');
  for (const path of paths) rmSync(path, { force: true, recursive: true });

  const { admission } = activation;
  const companies = [];
  for (let page = 1; page <= admission.counts.directory_pages; page++) companies.push({ loc: `${ORIGIN}${page === 1 ? '/companies' : `/companies/page/${page}`}`, lastmod: admission.directory_lastmod });
  for (const { path, lastmod } of activation.admittedPaths()) companies.push({ loc: `${ORIGIN}${path}`, lastmod });
  // Filing pages of admitted companies, from the pinned sidecar; withheld companies contribute none.
  const filingAdmission = loadCompanyFilingAdmission(activation, { root });
  if (filingAdmission) {
    let indexes = 0, filings = 0;
    for (const [cik, accessions] of filingAdmission.companies) {
      if (!activation.isAdmitted(cik)) continue;
      const { lastmod } = admission.companies[cik];
      companies.push({ loc: `${ORIGIN}/companies/${cik}/filings`, lastmod }); indexes++;
      for (const accession of accessions) { companies.push({ loc: `${ORIGIN}/companies/${cik}/filings/${accession}`, lastmod }); filings++; }
    }
    if (indexes !== admission.filings.filing_indexes_admitted || filings !== admission.filings.filings_admitted) throw new Error(`Filing admission yields ${indexes} indexes/${filings} filings; admission counts ${admission.filings.filing_indexes_admitted}/${admission.filings.filings_admitted}`);
  }
  const expected = admission.counts.urls_admitted;
  if (companies.length !== expected) throw new Error(`Admission yields ${companies.length} company URLs; expected ${expected}`);

  const result = writeStableSitemaps(dist, [['sitemap-site.xml', site], ...chunk(companies, MAX_URLS).map((part, i) => [`sitemap-companies-${i + 1}.xml`, part])]);
  return { removed: paths, siteUrls: site.length, removedSiteCompanyUrls: entries.length - site.length, companyUrls: companies.length, ...result };
}

const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

function writeStableSitemaps(dist, files) {
  const header = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const seen = new Set();
  const newest = new Map();
  let urls = 0, bytes = 0;
  for (const [name, entries] of files) {
    if (!entries.length) throw new Error(`Refusing to write empty ${name}`);
    const body = entries.map(({ loc, lastmod }) => {
      const url = new URL(loc);
      if (url.origin !== ORIGIN || url.hash || url.username) throw new Error(`Invalid sitemap URL: ${loc}`);
      if (seen.has(url.href)) throw new Error(`Duplicate sitemap URL: ${loc}`);
      seen.add(url.href);
      if (lastmod && (!/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?$/.test(lastmod) || !Number.isFinite(Date.parse(lastmod)))) throw new Error(`Invalid lastmod: ${lastmod}`);
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n${lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>\n` : ''}  </url>\n`;
    }).join('');
    const xml = `${header}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}</urlset>\n`;
    if (entries.length > MAX_URLS || Buffer.byteLength(xml) > MAX_BYTES) throw new Error(`${name} exceeds sitemap limits`);
    writeFileSync(resolve(dist, name), xml);
    urls += entries.length; bytes += Buffer.byteLength(xml);
    // The index dates each child by its newest page date, so Google can tell which child changed
    // without re-reading all of them. Dates compare as ISO strings (validated above).
    const dates = entries.map(({ lastmod }) => lastmod).filter(Boolean);
    if (dates.length) newest.set(name, dates.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)));
  }
  const index = `${header}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    files.map(([name]) => `  <sitemap><loc>${ORIGIN}/${name}</loc>${newest.has(name) ? `<lastmod>${escapeXml(newest.get(name))}</lastmod>` : ''}</sitemap>\n`).join('') + '</sitemapindex>\n';
  // Commit the index last so it never points at a child that has not been written.
  writeFileSync(resolve(dist, 'sitemap.xml.pending'), index);
  renameSync(resolve(dist, 'sitemap.xml.pending'), resolve(dist, 'sitemap.xml'));
  return { urls, shards: files.length, files: files.map(([name]) => name), bytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = prepareCompanyProductionOutput(process.cwd());
  if (result) console.log(`Company activation output: ${result.siteUrls} site + ${result.companyUrls} admitted company URLs in ${result.shards} sitemap file(s)`);
}
