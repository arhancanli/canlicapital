import { existsSync, lstatSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCompanyActivation } from '../api/_lib/company-activation.js';
import { parseSitemap, writeSitemaps } from './lib/sitemaps.mjs';

const ORIGIN = 'https://canlicapital.com';

// Vercel-only output step for an enabled, reviewed company activation.
//
// 1. Remove the generated pilot copies (companies/, companies.html, company-data/).
//    Vercel serves filesystem output before rewrites, so they would otherwise shadow
//    the activated release on the same URLs.
// 2. Rebuild dist/sitemap.xml as the site's page list minus every /companies URL,
//    followed by exactly the admitted company URLs. More than 50,000 URLs become a
//    sitemap index with content-addressed shards (scripts/lib/sitemaps.mjs).
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
  const expected = admission.counts.urls_admitted;
  if (companies.length !== expected) throw new Error(`Admission yields ${companies.length} company URLs; expected ${expected}`);

  const result = writeSitemaps([...site, ...companies], { directory: dist, origin: ORIGIN });
  return { removed: paths, siteUrls: site.length, removedSiteCompanyUrls: entries.length - site.length, companyUrls: companies.length, ...result };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = prepareCompanyProductionOutput(process.cwd());
  if (result) console.log(`Company activation output: ${result.siteUrls} site + ${result.companyUrls} admitted company URLs in ${result.shards} sitemap file(s)`);
}
