// CDN lifetimes for company responses.
//
// Every deployment starts with an empty CDN cache (Vercel keys the cache on the deployment URL),
// and a company release only changes in a new deployment, so no cached page can be staler than the
// deployment serving it. A long lifetime therefore costs no freshness and saves renders: crawlers
// revisit the ~900k company URLs every day or two, and each render is a function invocation plus
// storage reads.
export const PAGE_CACHE = 'public, max-age=0, s-maxage=604800, stale-while-revalidate=2592000';

// A company, filing or page that is absent from the release stays absent until the next release,
// so a 404 or 410 is cached too; anything else (405, 503) is never stored.
const MISSING_CACHE = 'public, max-age=0, s-maxage=86400';
export const errorCache = status => (status === 404 || status === 410 ? MISSING_CACHE : 'no-store');
