// =============================================================================
// CANLI CAPITAL / scripts/audit-onpage.mjs
// -----------------------------------------------------------------------------
// Site-wide on-page SEO audit, run against dist/ after a build.
//
// WHY. An external tool audited the homepage and returned a 78% on-page score with
// two real defects. The homepage is one of eighty-six URLs. A one-page report is a
// spot check; this is the gate, and it runs on every page every build so a
// regression is caught where it happens rather than the next time someone
// remembers to paste a URL into a checker.
//
// It deliberately checks only things that are OBJECTIVELY verifiable from the HTML:
// presence, uniqueness, length, self-consistency. It does not score prose.
// =============================================================================

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { jsonLdProblems } from "./lib/jsonld-rules.mjs";
import { checksummedFiles, imageDimensions, readMeta } from "./lib/social-meta.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const ORIGIN = "https://canlicapital.com";

// Seobility measures title width in pixels (580 max) and description in pixels (1000 max).
// Character counts are the portable proxy: ~60 and ~155 are the conventional equivalents.
const TITLE_MAX_CHARS = 65;
const TITLE_MIN_CHARS = 20;
// Bing Webmaster Tools flags descriptions as too short and recommends 150 to 160 characters; every
// generator now aims there through scripts/lib/descriptions.mjs. An indexable page below 120 fails.
const DESC_MIN_CHARS = 120;
const DESC_MAX_CHARS = 165;

// Measure what a search engine sees, not what the file contains. An apostrophe stored as &#39;
// is five characters on disk and ONE in a result, so measuring the raw attribute reported a
// 158-character description as 166 and invented a defect that was not there. A checker that
// cries wolf trains its reader to ignore it.
const decodeEntities = (text) =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const problems = [];
const FROZEN = existsSync(DIST) ? checksummedFiles(DIST) : new Set();
const imageSizes = new Map();
function imageSize(url) {
  if (!imageSizes.has(url)) {
    let size = null;
    try { size = imageDimensions(readFileSync(join(DIST, decodeURIComponent(new URL(url).pathname)))); } catch { size = null; }
    imageSizes.set(url, size);
  }
  return imageSizes.get(url);
}
const note = (page, severity, message) => problems.push({ page, severity, message });

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "assets") continue;
      out.push(...htmlFiles(full));
    } else if (entry.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

const stripTags = (html) =>
  html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "is", "are", "was",
  "were", "be", "been", "it", "its", "as", "at", "by", "from", "that", "this", "with", "not",
  "no", "so", "if", "we", "our", "you", "your", "they", "their", "he", "she", "his", "her",
]);

function audit(file) {
  const html = readFileSync(file, "utf8");
  const relativePath = relative(DIST, file).replaceAll("\\", "/");
  const page = relativePath === "index.html"
    ? "/"
    : `/${relativePath.endsWith("/index.html") ? relativePath.slice(0, -"/index.html".length) : relativePath.replace(/\.html$/, "")}`;

  const title = decodeEntities(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
  if (!title) note(page, "error", "no <title>");
  else if (title.length > TITLE_MAX_CHARS)
    note(page, "error", `title is ${title.length} chars, truncated in results (>${TITLE_MAX_CHARS}). ` +
      `A paper whose real name is longer declares "**Short title:** …" in its markdown; the H1 and ` +
      `the Open Graph title keep the real name.`);
  else if (title.length < TITLE_MIN_CHARS)
    note(page, "warning", `title is only ${title.length} chars`);

  const desc = decodeEntities(
    html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1]?.trim() ?? "",
  );
  if (!desc) note(page, "error", "no meta description");
  else if (desc.length < DESC_MIN_CHARS)
    note(page, /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html) ? "warning" : "error", `description is only ${desc.length} chars (<${DESC_MIN_CHARS})`);
  else if (desc.length > DESC_MAX_CHARS)
    note(page, "warning", `description is ${desc.length} chars, likely truncated (>${DESC_MAX_CHARS})`);

  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i)?.[1];
  if (!canonical) note(page, "error", "no canonical link");
  else if (!canonical.startsWith(ORIGIN))
    note(page, "error", `canonical points off-origin: ${canonical}`);

  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  );
  if (h1s.length === 0) note(page, "error", "no <h1>");
  else if (h1s.length > 1) note(page, "error", `${h1s.length} <h1> elements; there must be exactly one`);

  // The defect the external audit found: an H1 whose vocabulary appears nowhere in the body, so
  // the heading promises something the page never discusses.
  if (h1s.length === 1) {
    const body = stripTags(html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi, " "));
    const words = h1s[0]
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    const missing = words.filter((w) => !body.includes(w));
    if (words.length && missing.length === words.length)
      note(page, "warning", `no word from the H1 appears in the body: ${JSON.stringify(words)}`);
  }

  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] - levels[i - 1] > 1) {
      note(page, "warning", `heading level jumps h${levels[i - 1]} -> h${levels[i]}`);
      break;
    }
  }

  if (!/<html[^>]*\blang=/i.test(html)) note(page, "error", "no lang attribute on <html>");
  if (!/name="viewport"/i.test(html)) note(page, "error", "no viewport meta");
  const authors = [...html.matchAll(/<meta\s+name="author"\s+content="([^"]*)"/gi)];
  const pendingTechnicalAuthorship = html.includes(
    "Draft; exact-text approval pending",
  );
  if (authors.length !== 1)
    note(page, "error", `expected exactly one author meta tag, found ${authors.length}`);
  else if (
    authors[0][1] !== "Arhan Canli" &&
    !(pendingTechnicalAuthorship && authors[0][1] === "Canli Capital")
  )
    note(page, "error", `author metadata is ${JSON.stringify(authors[0][1])}, not Arhan Canli`);
  // Social cards, as the Open Graph, X, LinkedIn, Slack and Discord preview debuggers read them.
  // scripts/stamp-social-meta.mjs completes the tags after the build; a gap here is a page it
  // could not complete (an image of unknown size, or one without alt text).
  const meta = readMeta(html);
  const first = (key) => meta[key]?.[0];
  // An archival file under a published SHA256SUMS keeps its bytes; its bundle page carries the card.
  if (!FROZEN.has(file)) for (const key of ["og:title", "og:description", "og:type", "og:url", "og:site_name", "og:image", "og:image:width", "og:image:height", "og:image:alt", "twitter:card", "twitter:image:alt"]) {
    if (!first(key)) note(page, "error", `no ${key} (link previews read it)`);
  }
  if (first("og:url") && canonical && first("og:url") !== canonical) note(page, "error", `og:url ${first("og:url")} differs from the canonical ${canonical}`);
  if (first("twitter:card") && first("twitter:card") !== "summary_large_image") note(page, "warning", `twitter:card is ${first("twitter:card")}, not summary_large_image`);
  const ogImage = first("og:image");
  if (ogImage && !ogImage.startsWith(`${ORIGIN}/`)) note(page, "error", `og:image is not an absolute URL on this site: ${ogImage}`);
  else if (ogImage) {
    const size = imageSize(ogImage);
    if (!size) note(page, "error", `og:image ${ogImage} is not a PNG or JPEG in dist/`);
    else {
      if (size.width < 1200 || size.height < 630) note(page, "error", `og:image is ${size.width}x${size.height}, below the 1200x630 the previews use`);
      if (first("og:image:width") && (Number(first("og:image:width")) !== size.width || Number(first("og:image:height")) !== size.height)) note(page, "error", `og:image declares ${first("og:image:width")}x${first("og:image:height")} but the file is ${size.width}x${size.height}`);
    }
  }

  for (const img of html.matchAll(/<img\b([^>]*)>/gi)) {
    if (!/\balt=/i.test(img[1])) note(page, "error", "an <img> has no alt attribute");
  }
  for (const message of jsonLdProblems(html)) note(page, "error", message);
  return { page, title, desc, canonical };
}

if (!existsSync(DIST)) {
  console.error("dist/ does not exist. Run `npm run build` first.");
  process.exit(1);
}

const files = htmlFiles(DIST);
if (files.length === 0) {
  console.error("No HTML exists in dist/. This audit would pass vacuously.");
  process.exit(1);
}

const pages = files.map(audit);

// Duplicate titles and descriptions across the site: invisible on any single-page report, and the
// reason a large content library can rank for nothing.
for (const [field, label] of [["title", "title"], ["desc", "description"]]) {
  const seen = new Map();
  for (const p of pages) {
    if (!p[field]) continue;
    seen.set(p[field], [...(seen.get(p[field]) || []), p.page]);
  }
  for (const [value, where] of seen) {
    if (where.length > 1)
      note(where.join(", "), "error", `duplicate ${label}: ${JSON.stringify(value.slice(0, 60))}`);
  }
}

const errors = problems.filter((p) => p.severity === "error");
const warnings = problems.filter((p) => p.severity === "warning");

console.log(`audited ${pages.length} pages`);
for (const p of [...errors, ...warnings]) {
  console.log(`  [${p.severity}] ${p.page}: ${p.message}`);
}
console.log(`\n${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length > 0 ? 1 : 0);
