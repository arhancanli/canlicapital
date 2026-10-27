// The date the company pages' markup last changed in a way search engines should re-read
// (structured data, titles, snippets, breadcrumbs, visible sections). A company page's lastmod, in
// its JSON-LD dateModified and in the sitemap, is the later of this date and its data date, so a
// template change reaches every page's date instead of leaving 900k URLs dated to their SEC capture.
//
// company-markup-date.test.mjs fails when any file in COMPANY_MARKUP_SOURCES has a commit newer
// than this date: change a template, move the date in the same commit.
// 2026-10-06: BreadcrumbList and a visible trail on every company page (#414).
// 2026-10-07: page dates follow this markup date (this module).
// 2026-10-20: film-still bands (#444), titles and snippets that lead with the latest figures (#428),
// the free MCP install line and star ask (#487).
// 2026-10-25: company names in ordinary case, filing snippets and a Key figures box that lead with
// the filing's own figures, hub snippets without "Free JSON.", the plain top navigation.
// 2026-10-26: the same ordinary case in filing-index snippets and the "All ... filings" and
// "All ... financial histories" links, which still printed the SEC's all-capitals name.
export const COMPANY_MARKUP_DATE = '2026-10-26';

export const COMPANY_MARKUP_SOURCES = [
  'scripts/lib/company-page-renderer.mjs',
  'scripts/lib/company-filing-page-renderer.mjs',
  'scripts/lib/company-overview-search.mjs',
  'scripts/lib/company-history-summary.mjs',
  'scripts/lib/company-history-context.mjs',
  'scripts/lib/company-concept-groups.mjs',
  'scripts/lib/company-coverage.mjs',
  'scripts/lib/company-filing-notes.mjs',
  'scripts/lib/company-label.mjs',
];

// Later of a page's data date (YYYY-MM-DD) and the markup date.
export function companyLastmod(dataDate) {
  return dataDate && dataDate > COMPANY_MARKUP_DATE ? dataDate : COMPANY_MARKUP_DATE;
}
