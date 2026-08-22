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

// ---------------------------------------------------------------------------
// 6. MEASUREMENT PAGES. The same defect class as the papers, on a different
//    corpus: twenty-one artifacts were published as raw JSON that nothing
//    rendered and nothing linked. The check runs against the SAME discovery rule
//    the builder uses, applied here to the SHIPPED research.json, so a page that
//    stops being generated fails here rather than going quietly missing.
// ---------------------------------------------------------------------------
const isArtifact = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  ("claim_boundary" in value ||
    (typeof value.schema === "string" && value.schema.startsWith("canli.")));

const discoverArtifacts = (research) => {
  const found = [];
  for (const [key, value] of Object.entries(research)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    if (isArtifact(value)) {
      found.push(key);
      continue;
    }
    for (const [childKey, childValue] of Object.entries(value)) {
      if (isArtifact(childValue)) found.push(`${key}.${childKey}`);
    }
  }
  return found.sort();
};

const research = JSON.parse(readFileSync(resolve(DIST, "glassbox/research.json"), "utf8"));
const artifacts = discoverArtifacts(research);
const measurementPages = existsSync(resolve(DIST, "measurements"))
  ? readdirSync(resolve(DIST, "measurements")).filter((n) => n.endsWith(".html"))
  : [];

// A floor, for the same reason the papers have one: an empty corpus makes every assertion below
// pass without checking anything, which is the exact shape of the bug being guarded.
check(
  artifacts.length >= 12,
  `discovery found only ${artifacts.length} artifacts in research.json — the rule has stopped ` +
    `matching and every check below would pass vacuously`,
);
check(
  measurementPages.length === artifacts.length,
  `${artifacts.length} artifacts in research.json but ${measurementPages.length} measurement pages`,
);

const measurementIndex = resolve(DIST, "measurements.html");
check(existsSync(measurementIndex), "no /measurements index page was built");
const indexHtml = existsSync(measurementIndex) ? readFileSync(measurementIndex, "utf8") : "";

for (const path of artifacts) {
  const slug = path.replace(/[._]/g, "-").toLowerCase();
  const file = resolve(DIST, "measurements", `${slug}.html`);
  check(existsSync(file), `artifact ${path} has no page at /measurements/${slug}`);
  if (!existsSync(file)) continue;
  const html = readFileSync(file, "utf8");
  check(
    html.includes(`<link rel="canonical" href="${ORIGIN}/measurements/${slug}"`),
    `measurement ${slug} has no self-canonical`,
  );
  check(/"@type":"Dataset"/.test(html), `measurement ${slug} is not marked up as a Dataset`);
  // The whole reason these pages exist: a number without its limits is the failure this record
  // is built to avoid, so the boundary block is not optional.
  check(
    html.includes("What this measurement does and does not claim"),
    `measurement ${slug} renders no claim boundary`,
  );
  check(
    sitemap.includes(`<loc>${ORIGIN}/measurements/${slug}</loc>`),
    `measurement ${slug} is not in the sitemap`,
  );
  // Two clicks from /research: the index links every page, and /research links the index.
  check(
    indexHtml.includes(`href="/measurements/${slug}"`),
    `measurement ${slug} is not linked from the /measurements index — it is an orphan`,
  );
}

check(
  sitemap.includes(`<loc>${ORIGIN}/measurements</loc>`),
  "the /measurements index is not in the sitemap",
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
console.log(
  `verified ${measurementPages.length} measurement pages: one per artifact discovered in ` +
    `research.json, each with a self-canonical, Dataset markup, a rendered claim boundary, ` +
    `a sitemap entry, and a link from the index`,
);
console.log(`sitemap covers ${sitemapUrls} URLs`);
