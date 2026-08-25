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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const ORIGIN = "https://canlicapital.com";

// Seobility measures title width in pixels (580 max) and description in pixels (1000 max).
// Character counts are the portable proxy: ~60 and ~155 are the conventional equivalents.
const TITLE_MAX_CHARS = 65;
const TITLE_MIN_CHARS = 20;
const DESC_MIN_CHARS = 70;
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
  const page = "/" + relative(DIST, file).replace(/\.html$/, "").replace(/^index$/, "");

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
    note(page, "warning", `description is only ${desc.length} chars (<${DESC_MIN_CHARS})`);
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
  if (authors.length !== 1)
    note(page, "error", `expected exactly one author meta tag, found ${authors.length}`);
  else if (authors[0][1] !== "Arhan Canli")
    note(page, "error", `author metadata is ${JSON.stringify(authors[0][1])}, not Arhan Canli`);
  if (!/property="og:title"/i.test(html)) note(page, "warning", "no Open Graph title");

  for (const img of html.matchAll(/<img\b([^>]*)>/gi)) {
    if (!/\balt=/i.test(img[1])) note(page, "error", "an <img> has no alt attribute");
  }
  return { page, title, desc, canonical };
}

if (!existsSync(DIST)) {
  console.error("dist/ does not exist — run `npm run build` first");
  process.exit(1);
}

const files = htmlFiles(DIST);
if (files.length === 0) {
  console.error("no HTML in dist/ — this audit would pass vacuously");
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
