// =============================================================================
// audit-indexability.mjs
// -----------------------------------------------------------------------------
// One invariant, over every built page: what the site tells a crawler to do with
// a URL must agree with whether the site asks the crawler to visit it.
//
//   effectively indexable + self-canonical  =>  MUST be in the sitemap
//   effectively noindex                     =>  MUST NOT be in the sitemap
//
// WHY IT READS TWO LAYERS. A robots directive can arrive as an HTML meta tag or
// as an X-Robots-Tag response header, and on this site the sixteen archived
// papers use the header. A check that reads only the HTML sees sixteen pages
// that look indexable, concludes they are missing from the sitemap, and is
// confidently wrong -- which is exactly the mistake this file exists to stop
// being made twice. Effective state is computed from BOTH layers or not at all.
//
// WHY IT IS A CLASS RULE, NOT SIXTEEN ASSERTIONS. The rule it replaced named the
// publication routes specifically. A rule written against today's URLs cannot
// catch tomorrow's: the next family of pages to get a hosting-layer noindex, or
// the next generator to forget a sitemap entry, would pass it untouched.
// =============================================================================

import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const ORIGIN = "https://canlicapital.com";

const htmlFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".html")) htmlFiles.push(full);
  }
})(DIST);

const routeOf = (file) => {
  let route = "/" + relative(DIST, file).split("\\").join("/").replace(/\.html$/, "");
  if (route.endsWith("/index")) route = route.slice(0, -6) || "/";
  return route || "/";
};

const sitemapUrls = new Set(
  [...readFileSync(resolve(DIST, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1].replace(/\/$/, "")),
);

// Hosting-layer directives. Vercel's `source` is a path pattern; compile the
// subset this repo uses rather than pretending to implement the whole syntax,
// and fail loudly on a pattern shape that is not understood, because silently
// treating an unparsed rule as "no rule" is how a noindex goes unnoticed.
const WILDCARD = "\u0000";
const vercelConfig = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
const headerRules = [];
for (const entry of vercelConfig.headers ?? []) {
  const robots = (entry.headers ?? []).find((header) => header.key.toLowerCase() === "x-robots-tag");
  if (!robots) continue;
  if (!/^[A-Za-z0-9/_\-.()*:|\\]+$/.test(entry.source)) {
    throw new Error(`indexability: unsupported header source pattern ${entry.source}`);
  }
  // (.*) is a wildcard segment; an already-escaped \. stays escaped; a bare .
  // becomes a literal dot; an (a|b) alternation is valid regex as written.
  const compiled = entry.source
    .split("(.*)").join(WILDCARD)
    .replace(/(?<!\\)\./g, "\\.")
    .split(WILDCARD).join("[^?]*");
  headerRules.push({ source: entry.source, pattern: new RegExp(`^${compiled}$`), noindex: /noindex/i.test(robots.value) });
}

const failures = [];
let indexable = 0;
let noindexed = 0;

for (const file of htmlFiles) {
  const route = routeOf(file);
  const url = `${ORIGIN}${route === "/" ? "/" : route}`;
  const html = readFileSync(file, "utf8");

  const metaNoindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);
  const headerNoindex = headerRules.some((rule) => rule.noindex && rule.pattern.test(route));
  const isNoindex = metaNoindex || headerNoindex;

  const canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ?? [])[1];
  if (!canonical) {
    failures.push(`${route}: no canonical link, so its indexing intent is undeclared`);
    continue;
  }
  const selfCanonical = canonical.replace(/\/$/, "") === url.replace(/\/$/, "");
  const listed = sitemapUrls.has(url.replace(/\/$/, ""));

  if (isNoindex) {
    noindexed += 1;
    if (listed) {
      failures.push(
        `${route}: marked noindex (${metaNoindex ? "meta tag" : "X-Robots-Tag header"}) but submitted in the sitemap`,
      );
    }
  } else if (selfCanonical && !listed) {
    failures.push(`${route}: indexable and self-canonical but absent from the sitemap`);
  } else if (selfCanonical) {
    indexable += 1;
  }
}

// A guard whose corpus can silently empty out reports "clear" forever. Assert it
// actually examined the site, and that BOTH branches had something to examine --
// a run where nothing is noindex would never exercise the header path at all.
if (htmlFiles.length < 400) throw new Error(`indexability: only ${htmlFiles.length} pages scanned; the corpus collapsed`);
if (noindexed === 0) throw new Error("indexability: no noindex page found, so the header branch was never exercised");
if (indexable === 0) throw new Error("indexability: no indexable page found, so the sitemap branch was never exercised");
if (!headerRules.some((rule) => rule.noindex)) {
  throw new Error("indexability: no X-Robots-Tag noindex rule parsed from vercel.json; the header layer is unread");
}

console.log(
  `indexability: ${htmlFiles.length} pages, ${indexable} indexable and listed, ` +
  `${noindexed} noindex and withheld, ${failures.length} conflicts`,
);
if (failures.length) {
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
