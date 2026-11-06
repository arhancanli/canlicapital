// A company page's date, in its JSON-LD dateModified and in the sitemap, is the date its data last changed
// (content_updated_at, else the SEC capture date). Search engines read lastmod only while it tracks real changes.
//
// Until 6 November 2026 it was the later of that and a template date moved with every template change, which a test
// enforced: six sitewide dates in a month (6, 7, 20, 25 and 26 October, 6 November) told Google that some 900,000
// pages had all changed when only their layout had. Search Console then showed impressions falling from 1,403 on
// 27 October to 183 on 28 October, with the re-crawled company pages, Apple's included, marked "Crawled - currently
// not indexed". Template history lives in git, not in page dates.
//
// COMPANY_MARKUP_DATE is only the date of a page that has no data date.
export const COMPANY_MARKUP_DATE = '2026-11-06';

// A page's data date (YYYY-MM-DD), or the fallback when it has none.
export function companyLastmod(dataDate) {
  return dataDate || COMPANY_MARKUP_DATE;
}
