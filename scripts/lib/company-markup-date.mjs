// The date the company pages' markup last changed in a way search engines should re-read
// (structured data, titles, snippets, breadcrumbs, visible sections). A company page's lastmod, in
// its JSON-LD dateModified and in the sitemap, is the later of this date and its data date, so a
// template change reaches every page's date instead of leaving 900k URLs dated to their SEC capture.
//
// company-markup-date.test.mjs fails when any file in COMPANY_MARKUP_SOURCES has a commit newer
// than this date: change a template, move the date in the same commit.
// 2026-10-06: BreadcrumbList and a visible trail on every company page (#414).
// 2026-10-07: page dates follow this markup date (this module).
export const COMPANY_MARKUP_DATE = '2026-10-07';

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
