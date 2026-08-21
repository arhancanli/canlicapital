// =============================================================================
// CANLI CAPITAL / scripts/verify-papers.mjs
// -----------------------------------------------------------------------------
// Checks the BUILT site, not the source, because the failure this guards against
// is invisible in source: thirty-four research documents were shipped for months
// with no HTML page and no sitemap entry, and everything looked fine locally the
// whole time. Every assertion below is made against dist/.
//
// Run after `npm run build`. Exits non-zero on any failure.
// =============================================================================

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const ORIGIN = "https://canlicapital.com";

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

if (!existsSync(DIST)) {
  console.error("dist/ does not exist -- run `npm run build` first");
  process.exit(1);
}

const sources = readdirSync(resolve(ROOT, "public/research")).filter((n) => n.endsWith(".md"));
const pages = existsSync(resolve(DIST, "research"))
  ? readdirSync(resolve(DIST, "research")).filter((n) => n.endsWith(".html"))
  : [];
// Topic hubs are CollectionPage, not ScholarlyArticle, and carry a different canonical path.
// Checked SEPARATELY rather than exempted: an exemption is how a page stops being checked at all.
const hubs = existsSync(resolve(DIST, "research", "topics"))
  ? readdirSync(resolve(DIST, "research", "topics")).filter((n) => n.endsWith(".html"))
  : [];

// A guard whose inputs are empty passes silently, which is the shape of the defect itself.
check(sources.length > 0, "no research documents found in public/research");
check(pages.length > 0, "no rendered research pages found in dist/research");

// 1. Every document has a page.
for (const source of sources) {
  const slug = basename(source, ".md");
  check(
    pages.includes(`${slug}.html`),
    `${source} has no rendered page: it would be published as raw markdown, unindexable`,
  );
}

// 2. Every page carries the metadata that makes it a document rather than a file.
const sitemap = readFileSync(resolve(DIST, "sitemap.xml"), "utf8");
for (const page of pages) {
  const slug = basename(page, ".html");
  const html = readFileSync(resolve(DIST, "research", page), "utf8");
  const title = html.match(/<title>([^<]*)<\/title>/);
  const description = html.match(/<meta name="description" content="([^"]*)"/);

  check(Boolean(title && title[1].trim()), `${page} has no <title>`);
  check(
    Boolean(description && description[1].trim().length >= 60),
    `${page} has no usable meta description`,
  );
  check(
    html.includes(`<link rel="canonical" href="${ORIGIN}/research/${slug}"`),
    `${page} has no canonical URL`,
  );
  check(html.includes('"@type":"ScholarlyArticle"'), `${page} has no ScholarlyArticle schema`);
  check(
    html.includes(`"@id":"${ORIGIN}/#arhan-canli"`),
    `${page} does not attribute authorship to the Person entity`,
  );
  check(html.includes('property="og:title"'), `${page} has no Open Graph title`);

  // 3. Every page is in the sitemap. This is the specific thing that was wrong.
  check(
    sitemap.includes(`<loc>${ORIGIN}/research/${slug}</loc>`),
    `${slug} is not in sitemap.xml, so it will not be discovered`,
  );

  // 4. The stylesheet resolved. A wrong relative depth renders an unstyled page in
  //    production only, which no local check of the source would show.
  const stylesheetTags = html.match(/<link\b[^>]*>/g) || [];
  const linksBuiltStylesheet = stylesheetTags.some(
    (tag) => /rel="stylesheet"/.test(tag) && /href="\/assets\/paper-[^"]+\.css"/.test(tag),
  );
  check(
    linksBuiltStylesheet,
    `${page} does not link a built stylesheet -- it would render unstyled in production`,
  );
}

// 4b. Every topic hub is a real page: metadata, its own canonical, and in the sitemap.
check(hubs.length > 0, "no topic hubs found in dist/research/topics — the taxonomy did not build");
for (const hub of hubs) {
  const slug = basename(hub, ".html");
  const html = readFileSync(resolve(DIST, "research", "topics", hub), "utf8");
  const title = html.match(/<title>([^<]*)<\/title>/);
  const description = html.match(/<meta name="description" content="([^"]*)"/);

  check(Boolean(title && title[1].trim()), `topic ${slug} has no <title>`);
  check(
    Boolean(description && description[1].trim().length >= 60),
    `topic ${slug} has no usable meta description`,
  );
  check(
    html.includes(`<link rel="canonical" href="${ORIGIN}/research/topics/${slug}"`),
    `topic ${slug} has no canonical URL`,
  );
  check(html.includes('"@type":"CollectionPage"'), `topic ${slug} has no CollectionPage schema`);
  check(
    sitemap.includes(`<loc>${ORIGIN}/research/topics/${slug}</loc>`),
    `topic ${slug} is not in sitemap.xml, so it will not be discovered`,
  );
  // A hub whose members are not linked from it is a doorway page.
  const links = (html.match(/href="\/research\/[a-z0-9-]+"/g) || []).length;
  check(links >= 3, `topic ${slug} links only ${links} papers — a hub that thin is a doorway page`);
}

// 5. The library index the hub page renders from covers the whole corpus.
const index = JSON.parse(readFileSync(resolve(DIST, "research-index.json"), "utf8"));
check(
  index.papers.length === pages.length,
  `research-index.json lists ${index.papers.length} papers but ${pages.length} pages exist`,
);

const sitemapUrls = (sitemap.match(/<loc>/g) || []).length;
if (failures.length) {
  console.error(`\nFAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `verified ${pages.length} research pages: title, description, canonical, ScholarlyArticle, ` +
    `author entity, Open Graph, stylesheet, sitemap entry`,
);
console.log(
  `verified ${hubs.length} topic hubs: title, description, canonical, CollectionPage, ` +
    `sitemap entry, and at least three linked members`,
);
console.log(`sitemap covers ${sitemapUrls} URLs`);
