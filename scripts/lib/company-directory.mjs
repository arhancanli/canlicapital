import { renderReferenceDocument } from './company-page-renderer.mjs';
import { escapeXml as esc } from './sitemaps.mjs';
export const companyDirectoryPath = page => page === 1 ? '/companies' : `/companies/page/${page}`;

// Each actual directory page doubles as the entry point for its containing
// ranges. Twenty links per level keep navigation bounded without thin hub pages.
// Up to FLAT_DIRECTORY_PAGES pages, every page links every page instead: with 256 pages the
// hierarchy left the last directory pages three links below /companies and their companies five
// to six clicks from the homepage, where a crawler with little demand for the site rarely goes.
// One flat list puts every directory page one link from any other.
export const FLAT_DIRECTORY_PAGES = 400;
export function directoryNavigation(page, pages) {
  if (!Number.isSafeInteger(pages) || pages < 1 || pages > 200_000_000 || !Number.isSafeInteger(page) || page < 1 || page > pages) throw new Error('Invalid directory navigation range');
  if (pages <= FLAT_DIRECTORY_PAGES) {
    const links = [];
    for (let first = 1; first <= pages; first += 1) links.push({ first, last: first, path: companyDirectoryPath(first) });
    return [{ start: 1, end: pages, links }];
  }
  const groups = [];
  let span = 1;
  while (span * 20 < pages) span *= 20;
  for (; span >= 1; span /= 20) {
    const start = Math.floor((page - 1) / (span * 20)) * span * 20 + 1;
    const end = Math.min(pages, start + span * 20 - 1);
    const links = [];
    for (let first = start; first <= end; first += span) {
      links.push({ first, last: Math.min(end, first + span - 1), path: companyDirectoryPath(first) });
    }
    groups.push({ start, end, links });
  }
  return groups;
}
export function renderCompanyDirectory(listing) {
  const { page, pages, companies } = listing;
  const groups = directoryNavigation(page, pages);
  const nav = groups.map(group => `<nav aria-label="Directory pages ${group.start} to ${group.end}"><p>Pages ${group.start} to ${group.end}</p>${group.links.map(link => {
    const label = link.first === link.last ? `Page ${link.first}` : `Pages ${link.first} to ${link.last}`;
    return link.first === page && link.first === link.last ? `<span aria-current="page">${label}</span>` : `<a href="${link.path}">${label}</a>`;
  }).join(' · ')}</nav>`).join('');
  const adjacent = `<nav aria-label="Previous and next company directory pages">${page > 1 ? `<a rel="prev" href="${companyDirectoryPath(page - 1)}">Previous page</a>` : ''}${page > 1 && page < pages ? ' · ' : ''}${page < pages ? `<a rel="next" href="${companyDirectoryPath(page + 1)}">Next page</a>` : ''}</nav>`;
  const range = companies.length ? `CIK ${companies[0].cik} to ${companies.at(-1).cik}` : '';
  return renderReferenceDocument({ path: companyDirectoryPath(page), title: `Company filing directory: page ${page}`, heading: `Company filings: page ${page}`, description: `Browse company accounting histories for ${range}, with original units, filing dates and downloadable records.`, sources: companies.map(item => `company-data/${item.cik}.json`), body: `<section><h2>Inspect company inputs</h2><p>This collection contains selected accounting histories, not a complete or tradable market universe. Review reporting coverage and filing availability before using these records in research.</p><ul class="company-reference__directory">${companies.map(item => `<li><a href="/companies/${item.cik}">${esc(item.name)}</a><span>CIK ${item.cik}</span>${item.historical ? `<span>filings to ${esc(item.last_filed)}</span>` : ''}</li>`).join('')}</ul>${adjacent}${nav}</section><section><h2>Build with the platform</h2><p><a href="/developers#quickstart">API-key quickstart</a> · <a href="/developers#ai-assistant">Connect the MCP server</a> · <a href="https://github.com/arhancanli/alphac">Inspect the engine on GitHub</a></p></section>` });
}
