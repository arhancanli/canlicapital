import { readFileSync, writeFileSync, renameSync, readdirSync, mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCompanyCatalog, catalogHash } from '../api/_lib/company-catalog.js';
import { FILINGS_LEAF } from '../api/_lib/company-filings-catalog.js';
import { writeAsyncSitemaps } from './lib/sitemaps.mjs';
import { companyDirectoryPath } from './lib/company-directory.mjs';
import { filingPath, filingsIndexPath, verifyFilingsBinding } from './lib/company-filings.mjs';
import { localFilingsReader } from './build-company-release.mjs';

export async function buildCompanyDiscovery(catalogDir, deliveryDir, output, filingsDir) {
  const pointer = JSON.parse(readFileSync(resolve(deliveryDir, 'company-release.json')));
  if (!/^[a-f0-9]{64}$/.test(pointer.release_hash)) throw new Error('Invalid release hash');
  const releaseBytes = readFileSync(resolve(deliveryDir, 'objects', pointer.release_hash + '.json'));
  if (catalogHash(releaseBytes) !== pointer.release_hash) throw new Error('Corrupt immutable release');
  const release = JSON.parse(releaseBytes);
  if (release.schema !== 'canli.company-release.v1') throw new Error('Invalid release schema');
  const catalog = createCompanyCatalog({ rootHash: release.catalog_root, readObject: hash => readFileSync(resolve(catalogDir, `objects/${hash}.json`)) });
  const first = await catalog.directoryPage(1);
  if (first.total !== release.companies) throw new Error('Release catalog count mismatch');
  // A release that binds filings lists one index page plus one page per filing
  // for every company holding a filings document; a release without filings
  // must not be given a filings directory.
  if (Boolean(release.filings_root) !== Boolean(filingsDir)) throw new Error(release.filings_root ? 'Release binds filings; a filings directory is required' : 'Release binds no filings');
  const filingsCatalog = filingsDir ? createCompanyCatalog({ rootHash: release.filings_root, readObject: localFilingsReader(filingsDir), leaf: FILINGS_LEAF }) : null;
  let filings = 0, filingCompanies = 0;
  mkdirSync(output, { recursive: true });
  const lock = resolve(output, '.discovery-build.lock'), fd = openSync(lock, 'wx');
  try {
    // Each release uses its own subtree. The small discovery pointer is switched
    // only after sitemap generation and every count check has succeeded.
    const relative = `releases/${pointer.release_hash}`;
    const directory = resolve(output, relative); mkdirSync(directory, { recursive: true });
    let companies = 0, histories = 0;
    async function* routes() {
      for (let page = 1; page <= first.pages; page++) {
        const listing = page === 1 ? first : await catalog.directoryPage(page);
        // Directory lastmod omitted: capture dates do not establish when a
        // membership/navigation template changed.
        yield { loc: 'https://canlicapital.com' + companyDirectoryPath(page) };
        for (const item of listing.companies) {
          const company = await catalog.getCompany(item.cik);
          const lastmod = company.fetched_at.slice(0, 10);
          yield { loc: `https://canlicapital.com/companies/${company.cik}`, lastmod };
          for (const concept of company.concepts) {
            if (!/^[A-Za-z][A-Za-z0-9]{0,99}$/.test(concept.tag)) throw new Error('Invalid discovery concept');
            yield { loc: `https://canlicapital.com/companies/${company.cik}/${concept.tag}`, lastmod }; histories++;
          }
          companies++;
          const document = filingsCatalog ? await filingsCatalog.getCompany(company.cik) : null;
          if (document) {
            verifyFilingsBinding(document, company);
            // Filing pages are views over the same capture, so they share its lastmod.
            yield { loc: 'https://canlicapital.com' + filingsIndexPath(company.cik), lastmod };
            for (const filing of document.filings) { yield { loc: 'https://canlicapital.com' + filingPath(company.cik, filing.accession), lastmod }; filings++; }
            filingCompanies++;
          }
        }
      }
      if (companies !== release.companies || histories !== release.histories) throw new Error('Discovery counts do not match release');
      if (filingsCatalog && (filings !== release.filings || filingCompanies !== release.filing_companies)) throw new Error('Discovery filing counts do not match release');
    }
    const summary = await writeAsyncSitemaps(routes(), { directory, origin: 'https://canlicapital.com' });
    const files = readdirSync(directory).filter(name => /^sitemap(?:-pages-[a-f0-9]{24})?\.xml$/.test(name)).sort().map(name => {
      const bytes = readFileSync(resolve(directory, name)); return { name, storage_path: relative + '/' + name, sha256: catalogHash(bytes), bytes: bytes.length };
    });
    const result = { schema: 'canli.company-discovery.v1', release_hash: pointer.release_hash, catalog_root: release.catalog_root, companies, histories,
      ...(filingsCatalog ? { filings_root: release.filings_root, filings, filing_companies: filingCompanies } : {}), directory_pages: first.pages, ...summary, files, publication_approved: false };
    writeFileSync(resolve(output, 'discovery.json.pending'), JSON.stringify(result, null, 2) + '\n');
    renameSync(resolve(output, 'discovery.json.pending'), resolve(output, 'discovery.json'));
    return result;
  } finally { closeSync(fd); unlinkSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [catalog, delivery, output, filings] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node scripts/build-company-discovery.mjs CATALOG DELIVERY OUTPUT [FILINGS]');
  console.log(JSON.stringify(await buildCompanyDiscovery(resolve(catalog), resolve(delivery), resolve(output), filings && resolve(filings)), null, 2));
}
