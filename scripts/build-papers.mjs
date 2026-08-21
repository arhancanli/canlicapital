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

// =============================================================================
// TAXONOMY
// -----------------------------------------------------------------------------
// Eighty documents served as a flat alphabetical list is eighty orphans. A reader
// looking for "crypto funding carry research" has no route in, and neither does a
// crawler: there is nothing linking related work together, so nothing signals what
// this body of work is ABOUT.
//
// These clusters are DERIVED from the corpus, not invented for it — the vocabulary
// below was built by counting what the titles and descriptions actually say, and
// every hub carries the real descriptions of its members rather than a keyword
// list. A hub with nothing on it but links is a doorway page, deserves to be
// treated as one, and would undo the rest of this.
// =============================================================================

const KINDS = [
  { slug: "killed-candidates", label: "Killed candidates", match: (s) => s.startsWith("kill-"),
    blurb: "Every strategy that failed, published in full with the numbers it died on. Almost nobody publishes these, which is exactly why they are here: a kill log is a table, a paper is the reasoning another researcher can use." },
  { slug: "literature-reviews", label: "Literature reviews", match: (s) => s.startsWith("literature-"),
    blurb: "What the published evidence actually supports for each mechanism, with citations, and where our reading of it stops." },
  { slug: "feasibility-protocols", label: "Feasibility protocols", match: (s) => s.endsWith("-feasibility"),
    blurb: "Whether a mechanism can be tested at all — point-in-time data lineage, execution realism and document coverage — decided before any return data is opened." },
  { slug: "pre-registrations", label: "Pre-registrations", match: (s) => s.startsWith("prereg-"),
    blurb: "Locked specifications committed before measurement: universe, signal, horizon, costs and the pass/fail criteria, fixed in writing so the result cannot be chosen after the fact." },
  { slug: "corrections", label: "Corrections", match: (s) => s.includes("correction"),
    blurb: "Published figures we withdrew, and why. A correction that is part of the record is worth more than a number that was never wrong in public." },
  { slug: "engineering-foundations", label: "Engineering foundations", match: () => true,
    blurb: "The machinery underneath the research: execution realism, borrow and financing replay, corporate-action lifecycle, and the quality contracts that gate what gets published." },
];

const SUBJECTS = [
  { slug: "equities", label: "Equities", pattern: /equit|stock|momentum|earnings|10-k|filing|sec |issuer/i,
    blurb: "Cross-sectional equity research: momentum construction, quality and value replication on a survivorship-free universe, and the filing-derived signals tested against it." },
  { slug: "crypto", label: "Crypto", pattern: /crypto|perp|funding|bitcoin|btc|stablecoin|binance/i,
    blurb: "Perpetual-futures funding carry, basis, venue structure and stablecoin dislocation — the sleeve family where this book has the longest live record." },
  { slug: "options-and-volatility", label: "Options and volatility", pattern: /option|volatilit|dispersion|variance|gamma/i,
    blurb: "Variance risk premium, index-versus-constituent dispersion and dealer positioning: mechanisms that are well documented and expensive to implement honestly." },
  { slug: "rates-and-treasuries", label: "Rates and treasuries", pattern: /rates|treasury|fomc|yield|auction|swap/i,
    blurb: "Auction concession, pre-FOMC drift, swap-spread dislocation and curve carry — including the identities that turned out not to be observable as pre-registered." },
  { slug: "credit", label: "Credit", pattern: /credit|bond|etf nav|fallen angel|municipal/i,
    blurb: "Bond-ETF NAV dislocation, fallen-angel flow and credit-equity relative value, and the licensed-data boundaries that gate them." },
  { slug: "commodities", label: "Commodities", pattern: /commodit|petroleum|natural gas|oil|inventory|eia/i,
    blurb: "Inventory surprise, storage and weather: official point-in-time vintages, first-release capture, and what happens to a seasonal signal net of cost." },
  { slug: "event-driven", label: "Event-driven", pattern: /merger|spin-?off|tender|arbitrage|13d|repurchase|reconstitution/i,
    blurb: "Merger arbitrage, spin-off dislocation, tender offers and activist escalation — mechanisms whose feasibility turns on what regulatory filings actually contain." },
  { slug: "macro-surprise", label: "Macro surprise", pattern: /cpi|inflation|macro|surprise|payroll/i,
    blurb: "Point-in-time macro releases traded as cross-sectional spreads, and the vintage discipline that makes the surprise real rather than hindsight." },
  { slug: "execution-and-market-structure", label: "Execution and market structure", pattern: /execution|borrow|financing|corporate action|market status|fill|slippage/i,
    blurb: "Borrow availability and fees, financing, corporate actions, market-status replay and fill modelling — the costs that decide whether a paper edge survives contact." },
];

function classify(slug, title, description) {
  const kind = KINDS.find((k) => k.match(slug));
  const text = `${title} ${description}`;
  const subjects = SUBJECTS.filter((s) => s.pattern.test(text));
  return { kind, subjects };
}

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

  // Find sentence ENDS and slice from position zero, rather than matching sentence pieces and
  // gluing them. Two bugs came out of the matching approach, both visible only in a rendered
  // page: a decimal point read as a sentence ending truncated "net Sharpe -0.5926" to
  // "net Sharpe -0.", and once that was fixed the pieces no longer tiled the string, so a
  // description could START mid-number ("84. A construction-fitting artifact..."). Slicing from
  // zero cannot do either.
  let cut = -1;
  for (let i = 0; i < Math.min(text.length, DESCRIPTION_MAX); i += 1) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    const next = text[i + 1];
    // A period followed by a digit is a decimal point, not a sentence ending.
    if (next !== undefined && !/\s/.test(next)) continue;
    cut = i + 1;
  }
  if (cut >= 70) return text.slice(0, cut).trim();

  const clipped = text.slice(0, DESCRIPTION_MAX - 1);
  return `${clipped.slice(0, clipped.lastIndexOf(" ")).trimEnd()}\u2026`;
}

// A title is truncated in results around 65 characters, and the site name is the least
// informative part of it. Drop the suffix rather than the subject when they do not both fit.
const TITLE_MAX = 65;
const SUFFIX = ` \u2014 ${PUBLISHER}`;

function fitTitle(title) {
  return title.length + SUFFIX.length <= TITLE_MAX ? `${title}${SUFFIX}` : title;
}

function pageHtml({ title, description, slug, body, sourceFile, related = "" }) {
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
    ${related}
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

function relatedSection(paper, papers) {
  const { kind, subjects } = paper.taxonomy;
  const siblings = papers
    .filter((other) => other.slug !== paper.slug)
    .map((other) => ({
      other,
      shared: other.taxonomy.subjects.filter((s) => subjects.some((t) => t.slug === s.slug)).length,
    }))
    .filter((row) => row.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.other.title.localeCompare(b.other.title))
    .slice(0, 6);

  if (!kind && !subjects.length && !siblings.length) return "";

  const hubs = [
    ...(kind ? [{ href: `/research/topics/${kind.slug}`, label: kind.label }] : []),
    ...subjects.map((s) => ({ href: `/research/topics/${s.slug}`, label: s.label })),
  ];

  return `<nav class="paper__related" aria-label="Related research">
      ${hubs.length ? `<p class="paper__related-kicker">Filed under</p>
      <p class="paper__links">${hubs
        .map((h) => `<a href="${h.href}">${escapeHtml(h.label)}</a>`)
        .join('<span aria-hidden="true"> / </span>')}</p>` : ""}
      ${siblings.length ? `<p class="paper__related-kicker">Related work</p>
      <ul class="paper__related-list">${siblings
        .map(
          ({ other }) =>
            `<li><a href="/research/${other.slug}">${escapeHtml(other.title)}</a></li>`,
        )
        .join("")}</ul>` : ""}
    </nav>`;
}

function hubHtml(hub, members) {
  const url = `${ORIGIN}/research/topics/${hub.slug}`;
  const description = `${hub.blurb} ${members.length} published document${
    members.length === 1 ? "" : "s"
  }.`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${hub.label} — ${PUBLISHER} research`,
    description: hub.blurb,
    url,
    inLanguage: "en",
    isPartOf: { "@type": "Periodical", name: "Canli Capital Research", url: `${ORIGIN}/research` },
    author: { "@type": "Person", "@id": `${ORIGIN}/#arhan-canli`, name: AUTHOR },
    publisher: { "@type": "Organization", "@id": `${ORIGIN}/#organization`, name: PUBLISHER },
    hasPart: members.map((m) => ({
      "@type": "ScholarlyArticle",
      headline: m.title,
      url: `${ORIGIN}/research/${m.slug}`,
    })),
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(fitTitle(`${hub.label} research`))}</title>
<meta name="description" content="${escapeHtml(fitDescription(description))}" />
<link rel="canonical" href="${url}" />
<meta name="author" content="${AUTHOR}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${PUBLISHER}" />
<meta property="og:title" content="${escapeHtml(hub.label)} research" />
<meta property="og:description" content="${escapeHtml(fitDescription(description))}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(hub.label)} research" />
<meta name="twitter:description" content="${escapeHtml(fitDescription(description))}" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wdth,wght@75..100,400..700&family=Newsreader:opsz,wght@6..72,300..600&display=swap" />
<link rel="stylesheet" href="../../css/paper.css" />
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
    <h1 class="paper__title">${escapeHtml(hub.label)}</h1>
    <p class="paper__byline">${members.length} published document${
      members.length === 1 ? "" : "s"
    } &middot; ${PUBLISHER} research, by ${AUTHOR}</p>
    <div class="paper__body">
      <p>${escapeHtml(hub.blurb)}</p>
      <ul class="research-library research-library--hub">
        ${members
          .map(
            (m) =>
              `<li class="research-library__item"><a class="research-library__link" href="/research/${m.slug}"><span class="research-library__title">${escapeHtml(
                m.title,
              )}</span><span class="research-library__desc">${escapeHtml(m.description)}</span></a></li>`,
          )
          .join("")}
      </ul>
    </div>
    <footer class="paper__footer">
      <p class="paper__links"><a href="/research">All research</a><span aria-hidden="true"> / </span><a href="/open">Inspect the underlying artifacts</a></p>
      <p class="paper__boundary">Published as evidence, not as a claim about future performance.</p>
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

  // TWO PASSES. Classify the whole corpus first, because a paper's related-work list is a
  // function of every other paper — writing pages as they are read would give the first document
  // no siblings and the last one all of them.
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
    papers.push({
      ...meta,
      sourceFile: file,
      markdown,
      taxonomy: classify(slug, meta.title, meta.description),
    });
  }

  for (const paper of papers) {
    const body = marked.parse(paper.markdown.replace(/^#\s+.*\n/, ""));
    writeFileSync(
      resolve(OUT_DIR, `${paper.slug}.html`),
      pageHtml({ ...paper, body, related: relatedSection(paper, papers) }),
    );
  }

  const hubs = [];
  mkdirSync(resolve(OUT_DIR, "topics"), { recursive: true });
  for (const hub of [...KINDS, ...SUBJECTS]) {
    const members = papers
      .filter((paper) =>
        KINDS.includes(hub)
          ? paper.taxonomy.kind === hub
          : paper.taxonomy.subjects.some((s) => s.slug === hub.slug),
      )
      .sort((a, b) => a.title.localeCompare(b.title));
    // A hub with fewer than three members is a page that exists to hold links, which is the one
    // thing this must not become.
    if (members.length < 3) continue;
    writeFileSync(resolve(OUT_DIR, "topics", `${hub.slug}.html`), hubHtml(hub, members));
    hubs.push({ ...hub, count: members.length });
  }

  writeFileSync(
    resolve(ROOT, "public/research-index.json"),
    `${JSON.stringify(
      {
        generated_by: "scripts/build-papers.mjs",
        count: papers.length,
        topics: hubs.map((hub) => ({
          slug: hub.slug,
          label: hub.label,
          count: hub.count,
          path: `/research/topics/${hub.slug}`,
          blurb: hub.blurb,
        })),
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
    ...hubs.map((hub) => ({
      loc: `${ORIGIN}/research/topics/${hub.slug}`,
      priority: "0.8",
      changefreq: "weekly",
    })),
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
  console.log(`rendered ${hubs.length} topic hubs -> research/topics/*.html`);
  for (const hub of hubs) console.log(`    ${hub.label.padEnd(32)} ${hub.count}`);
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
