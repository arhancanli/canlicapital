// =============================================================================
// CANLI CAPITAL / scripts/build-papers.mjs
// -----------------------------------------------------------------------------
// Renders every research document in public/research/*.md into a real, indexable
// HTML page at /research/<slug>, and rebuilds sitemap.xml from what exists on disk.
//
// WHY THIS EXISTS. The documents were already written -- 33 of them, cited,
// specific, the genuine output of the programme -- and they were served as raw
// .md. A raw markdown file has no <title>, no meta description, no canonical, no
// structured data and no author. Search engines could not read them as documents,
// and the sitemap listed six URLs, none of which was a paper. The largest
// discoverability problem on this site was never a shortage of content; it was
// that the content had no HTML to be found in.
//
// Two rules this script keeps:
//   1. It never invents metadata. Title and description are taken FROM the
//      document. A document that carries neither is REPORTED, not guessed at --
//      a fabricated description is worse than a missing one, because it makes a
//      false promise about a page whose whole value is being checkable.
//   2. The sitemap is derived from generated files, never hand-maintained. The
//      hand-maintained one is how six URLs came to stand for thirty-nine.
// =============================================================================

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = resolve(ROOT, "public/research");
const OUT_DIR = resolve(ROOT, "research");
const ORIGIN = "https://canlicapital.com";
const AUTHOR = "Arhan Canli";
const PUBLISHER = "Canli Capital";

const STATIC_ROUTES = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/systems", priority: "0.8", changefreq: "weekly" },
  { path: "/performance", priority: "0.8", changefreq: "weekly" },
  { path: "/progress", priority: "0.8", changefreq: "weekly" },
  { path: "/research", priority: "0.9", changefreq: "weekly" },
  { path: "/open", priority: "0.8", changefreq: "weekly" },
];

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** Strip markdown emphasis/links/code so a heading or paragraph reads as plain prose. */
function toPlainText(markdown) {
  return markdown
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull the title and description out of the document itself.
 *
 * The description is the first real PROSE paragraph. These documents open with a
 * metadata block of bold key/value lines ("**Reviewed:** ..."), which describes the
 * document rather than its finding and would make every search result look alike.
 */
function extractMeta(markdown, slug) {
  const lines = markdown.split("\n");
  const headingIndex = lines.findIndex((line) => /^#\s+/.test(line));
  const title = headingIndex >= 0 ? toPlainText(lines[headingIndex].replace(/^#\s+/, "")) : null;

  let description = null;
  const afterHeading = headingIndex >= 0 ? lines.slice(headingIndex + 1).join("\n") : markdown;
  for (const block of afterHeading.split(/\n\s*\n/)) {
    const text = block.trim();
    if (!text) continue;
    if (/^#{1,6}\s/.test(text)) continue;                      // heading
    if (/^[-*+]\s|^\d+\.\s|^>|^\||^```|^\|/.test(text)) continue; // list, quote, table, code
    if (/^\*\*[^*]+:\*\*/.test(text)) continue;                // the metadata block
    const plain = toPlainText(text);
    if (plain.length < 60) continue;
    if (plain.endsWith(":")) continue;
    description = fitDescription(plain);
    break;
  }
  return { title, description, slug };
}

const DESCRIPTION_MAX = 158;

/** Trim to something that survives a search result: whole sentences first, whole words second. */
function fitDescription(text) {
  if (text.length <= DESCRIPTION_MAX) return text;
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  let built = "";
  for (const sentence of sentences) {
    if ((built + sentence).trim().length > DESCRIPTION_MAX) break;
    built += sentence;
  }
  built = built.trim();
  if (built.length >= 70) return built;
  const cut = text.slice(0, DESCRIPTION_MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}\u2026`;
}

// A title is truncated in results around 65 characters, and the site name is the least
// informative part of it. Drop the suffix rather than the subject when they do not both fit.
const TITLE_MAX = 65;
const SUFFIX = ` \u2014 ${PUBLISHER}`;

function fitTitle(title) {
  return title.length + SUFFIX.length <= TITLE_MAX ? `${title}${SUFFIX}` : title;
}

function pageHtml({ title, description, slug, body, sourceFile }) {
  const url = `${ORIGIN}/research/${slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ScholarlyArticle",
    headline: title,
    description,
    url,
    inLanguage: "en",
    isAccessibleForFree: true,
    author: {
      "@type": "Person",
      "@id": `${ORIGIN}/#arhan-canli`,
      name: AUTHOR,
      jobTitle: "Founder and Quantitative Researcher",
      url: `${ORIGIN}/`,
      sameAs: ["https://github.com/arhancanli"],
      affiliation: {
        "@type": "Organization",
        "@id": `${ORIGIN}/#organization`,
        name: PUBLISHER,
        url: `${ORIGIN}/`,
      },
    },
    publisher: {
      "@type": "Organization",
      "@id": `${ORIGIN}/#organization`,
      name: PUBLISHER,
      url: `${ORIGIN}/`,
      logo: { "@type": "ImageObject", url: `${ORIGIN}/brand-mark.svg` },
    },
    isPartOf: { "@type": "Periodical", name: "Canli Capital Research", url: `${ORIGIN}/research` },
    encodingFormat: "text/html",
    associatedMedia: {
      "@type": "MediaObject",
      contentUrl: `${ORIGIN}/research/${sourceFile}`,
      encodingFormat: "text/markdown",
    },
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(fitTitle(title))}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${url}" />
<meta name="author" content="${AUTHOR}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${PUBLISHER}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta property="article:author" content="${AUTHOR}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wdth,wght@75..100,400..700&family=Newsreader:opsz,wght@6..72,300..600&display=swap" />
<link rel="stylesheet" href="../css/paper.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
<header class="paper__masthead">
  <a class="paper__brand" href="/">${PUBLISHER}</a>
  <nav class="paper__nav" aria-label="Primary">
    <a href="/systems">Systems</a>
    <a href="/performance">Evidence</a>
    <a href="/research">Research</a>
    <a href="/open">Glass box</a>
  </nav>
</header>
<main class="paper__main" id="content">
  <article class="paper__article">
    <p class="paper__eyebrow"><a href="/research">Research</a></p>
    <h1 class="paper__title">${escapeHtml(title)}</h1>
    <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, ${PUBLISHER}</p>
    <div class="paper__body">
${body}
    </div>
    <footer class="paper__footer">
      <p class="paper__links">
        <a href="/research/${sourceFile}">Read the unrendered source</a>
        <span aria-hidden="true"> / </span>
        <a href="/open">Inspect the underlying artifacts</a>
        <span aria-hidden="true"> / </span>
        <a href="/research">All research</a>
      </p>
      <p class="paper__boundary">
        Published as evidence, not as a claim about future performance. The figures quoted here
        are reproducible from the artifacts linked above.
      </p>
    </footer>
  </article>
</main>
</body>
</html>
`;
}

function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`no research source directory at ${SOURCE_DIR}`);
    return 1;
  }
  const files = readdirSync(SOURCE_DIR).filter((name) => name.endsWith(".md")).sort();
  if (files.length === 0) {
    console.error("no research documents found; refusing to publish an empty index");
    return 1;
  }

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  marked.use({ gfm: true, breaks: false });

  const papers = [];
  const incomplete = [];
  for (const file of files) {
    const slug = basename(file, ".md");
    const markdown = readFileSync(resolve(SOURCE_DIR, file), "utf8");
    const meta = extractMeta(markdown, slug);
    if (!meta.title || !meta.description) {
      incomplete.push({ file, title: Boolean(meta.title), description: Boolean(meta.description) });
      continue;
    }
    const body = marked.parse(markdown.replace(/^#\s+.*\n/, ""));
    writeFileSync(resolve(OUT_DIR, `${slug}.html`), pageHtml({ ...meta, body, sourceFile: file }));
    papers.push({ ...meta, sourceFile: file });
  }

  writeFileSync(
    resolve(ROOT, "public/research-index.json"),
    `${JSON.stringify(
      {
        generated_by: "scripts/build-papers.mjs",
        count: papers.length,
        papers: papers.map(({ slug, title, description, sourceFile }) => ({
          slug,
          title,
          description,
          path: `/research/${slug}`,
          source_path: `/research/${sourceFile}`,
        })),
      },
      null,
      2,
    )}\n`,
  );

  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...STATIC_ROUTES.map((route) => ({ ...route, loc: `${ORIGIN}${route.path}` })),
    ...papers.map((paper) => ({
      loc: `${ORIGIN}/research/${paper.slug}`,
      priority: "0.7",
      changefreq: "monthly",
    })),
  ];
  writeFileSync(
    resolve(ROOT, "public/sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) =>
      `  <url>\n    <loc>${url.loc}</loc>\n    <lastmod>${today}</lastmod>\n` +
      `    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`,
  )
  .join("\n")}
</urlset>
`,
  );

  console.log(`rendered ${papers.length} research pages -> research/*.html`);
  console.log(`sitemap: ${urls.length} URLs`);
  if (incomplete.length) {
    console.log("\nSkipped for missing metadata (NOT invented):");
    for (const item of incomplete) {
      console.log(`  ${item.file}  title=${item.title} description=${item.description}`);
    }
  }
  return 0;
}

process.exit(main());
