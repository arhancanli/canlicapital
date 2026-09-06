// Build current presentation routes around checksum-bound archival publications.
// The source paper.html files are read and hashed, never edited.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderProductShellFooter,
  renderProductShellHeader,
  renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_ROOT = resolve(ROOT, "public/publication");
const OUTPUT_ROOT = resolve(ROOT, "publication");
const MANIFEST = resolve(ROOT, "artifacts/qa/publication-wrapper-manifest.json");
const ORIGIN = "https://canlicapital.com";
const NAMED_EM_DASH = `&${"mdash"};`;
const NUMERIC_EM_DASH = `&#${"8212"};`;

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const presentationCopy = (value) => String(value || "")
  .replaceAll("\u2014", ":")
  .replaceAll(NAMED_EM_DASH, ":")
  .replaceAll(NUMERIC_EM_DASH, ":");

function findPapers(dir) {
  const papers = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) papers.push(...findPapers(full));
    else if (entry === "paper.html") papers.push(full);
  }
  return papers.sort();
}

// Schema.org and Google Scholar both want the same facts, and both of them are
// already sitting in paper.json and bundle_manifest.json. Until now neither file
// reached the HTML: the wrapper published a 363-word stub whose ScholarlyArticle
// carried a name and a URL, while a full abstract, author affiliation, CRediT
// roles, publication date and four checksummed encodings sat unused one directory
// away. Nothing here is authored -- every value is read from the bundle, so the
// structured data cannot drift away from the archive it describes.
function structuredData({ title, wrapperRoute, originalRoute, baseRoute, description, paper, bundle }) {
  const assets = bundle?.archival_assets ?? {};
  const encoding = [];
  const addEncoding = (asset, route, type) => {
    if (!asset?.sha256) return;
    encoding.push({
      "@type": "MediaObject",
      contentUrl: `${ORIGIN}${route}`,
      encodingFormat: type,
      sha256: asset.sha256,
    });
  };
  addEncoding(assets.html, originalRoute, "text/html");
  addEncoding(assets.pdf, `${baseRoute}/paper.pdf`, "application/pdf");
  addEncoding(assets.latex, `${baseRoute}/paper.tex`, "application/x-tex");

  const authors = (paper.authors ?? []).map((author) => ({
    "@type": "Person",
    name: author.full_name,
    url: `${ORIGIN}/founder`,
    ...(author.affiliation ? { affiliation: { "@type": "Organization", name: author.affiliation } } : {}),
  }));

  const article = {
    "@type": "ScholarlyArticle",
    "@id": `${ORIGIN}${originalRoute}`,
    name: title,
    headline: title,
    url: `${ORIGIN}${originalRoute}`,
    ...(paper.abstract ? { abstract: presentationCopy(paper.abstract) } : {}),
    ...(paper.date ? { datePublished: paper.date } : {}),
    ...(paper.language ? { inLanguage: paper.language } : {}),
    ...(paper.version ? { version: String(paper.version) } : {}),
    ...(authors.length ? { author: authors } : {}),
    // A preprint that says so in its metadata cannot be mistaken for a reviewed
    // one by a machine reading the page, which is the entire point of publishing
    // the review state as data rather than as a sentence someone might skim past.
    creativeWorkStatus: paper.peer_reviewed === true ? "Peer reviewed" : "Preprint, not peer reviewed",
    publisher: { "@type": "Organization", name: "Canli Capital", url: ORIGIN },
    isPartOf: { "@type": "Periodical", name: "Canli Capital working papers", url: `${ORIGIN}/research` },
    ...(encoding.length ? { encoding } : {}),
    ...(paper.claim_boundary ? { disambiguatingDescription: presentationCopy(paper.claim_boundary) } : {}),
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: title,
        url: `${ORIGIN}${wrapperRoute}`,
        description,
        author: { "@type": "Person", name: "Arhan Canli", url: `${ORIGIN}/founder` },
        mainEntity: { "@id": `${ORIGIN}${originalRoute}` },
      },
      article,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Canli Capital", item: ORIGIN },
          { "@type": "ListItem", position: 2, name: "Research", item: `${ORIGIN}/research` },
          { "@type": "ListItem", position: 3, name: title, item: `${ORIGIN}${wrapperRoute}` },
        ],
      },
    ],
  };
}

// Google Scholar does not read JSON-LD. It reads these tags and nothing else, so a
// research site that publishes only schema.org is invisible to the one index whose
// readers are most likely to check the arithmetic.
function scholarMeta({ title, wrapperRoute, baseRoute, paper }) {
  const tags = [
    ["citation_title", title],
    ["citation_publication_date", paper.date ?? ""],
    ["citation_language", paper.language ?? "en"],
    ["citation_technical_report_institution", "Canli Capital"],
    ["citation_abstract_html_url", `${ORIGIN}${wrapperRoute}`],
    ["citation_pdf_url", `${ORIGIN}${baseRoute}/paper.pdf`],
  ].filter(([, value]) => value);
  for (const author of paper.authors ?? []) tags.push(["citation_author", author.full_name]);
  return tags
    .map(([name, value]) => `  <meta name="${name}" content="${escapeHtml(value)}" />`)
    .join("\n");
}

function wrapperHtml({ title, archiveLabel, wrapperRoute, originalRoute, baseRoute, paper, bundle }) {
  const reviewState = paper.peer_reviewed === true ? "Peer reviewed" : "Not peer reviewed";
  const capitalState = paper.capital_kind === "FUNDED" ? "Funded evidence declared in source" : "Paper and simulation evidence";
  const boundary = presentationCopy(
    paper.claim_boundary ||
    "This archived working paper is public research. It does not establish future performance, independent validation or investment suitability.",
  );
  const browserTitle = `${archiveLabel} publication archive / Canli Capital`;
  const description = `Current navigation and provenance for the byte-preserved ${archiveLabel} working paper and its reproducibility bundle.`;
  const jsonLd = structuredData({ title, wrapperRoute, originalRoute, baseRoute, description, paper, bundle });
  const abstract = presentationCopy(paper.abstract || "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(browserTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="author" content="Arhan Canli" />
${scholarMeta({ title, wrapperRoute, baseRoute, paper })}
  <meta name="theme-color" content="#06111b" />
  <link rel="canonical" href="${ORIGIN}${wrapperRoute}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Canli Capital" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${ORIGIN}${wrapperRoute}" />
  <meta property="og:image" content="${ORIGIN}/og.png" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
  <link rel="stylesheet" href="/css/publication-wrapper.css" />
  ${renderProductShellStylesheet()}
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="publication-wrapper-page">
  <a class="publication-skip" href="#content">Skip to content</a>
  ${renderProductShellHeader({ active: "research" })}
  <main id="content" tabindex="-1">
    <section class="publication-hero" aria-labelledby="publication-title">
      <p class="publication-eyebrow">Immutable publication bundle</p>
      <h1 id="publication-title">${escapeHtml(title)}</h1>
      <p class="publication-lead">${escapeHtml(title)} remains an archived Canli Capital working paper. This current presentation layer adds navigation while the original HTML, PDF, source, citation and checksums remain in the preserved bundle.</p>
      <p class="publication-author">By <a href="/founder">Arhan Canli</a>, Canli Capital</p>
      <div class="publication-actions"><a class="publication-action publication-action--primary" href="${originalRoute}">Read immutable paper <span aria-hidden="true">↗</span></a><a class="publication-action" href="${baseRoute}/paper.pdf">Open PDF</a></div>
    </section>
    <section class="publication-state" aria-label="Publication state">
      <article><span>Archive state</span><strong>Byte-preserved</strong><small>The original paper is not rewritten by this wrapper.</small></article>
      <article><span>Review state</span><strong>${escapeHtml(reviewState)}</strong><small>No external acceptance is implied.</small></article>
      <article><span>Capital boundary</span><strong>${escapeHtml(capitalState)}</strong><small>Read the paper for its exact evidence boundary.</small></article>
      <article><span>Named author</span><strong>Arhan Canli</strong><small>Founder and quantitative researcher.</small></article>
    </section>
    ${abstract ? `<section class="publication-abstract" aria-labelledby="publication-abstract-title">
      <p class="publication-eyebrow">Abstract</p>
      <h2 id="publication-abstract-title">What this paper argues</h2>
      <p>${escapeHtml(abstract)}</p>
      <p class="publication-abstract__note">This abstract is read from the archived bundle's metadata, not rewritten here. The full paper is <a href="${originalRoute}">byte-preserved</a>.</p>
    </section>` : ""}
    <section class="publication-grid">
      <article class="publication-boundary"><p class="publication-eyebrow">Claim boundary</p><h2>What this publication can support</h2><p>${escapeHtml(boundary)}</p></article>
      <article class="publication-files"><p class="publication-eyebrow">Bundle files</p><h2>Inspect the archive directly</h2><nav aria-label="Publication bundle files"><a href="${originalRoute}">Archived HTML</a><a href="${baseRoute}/paper.pdf">PDF paper</a><a href="${baseRoute}/paper.tex">TeX source</a><a href="${baseRoute}/CITATION.cff">Citation metadata</a><a href="${baseRoute}/SHA256SUMS">Checksums</a><a href="${baseRoute}/reproduction.json">Reproduction record</a></nav></article>
    </section>
    <section class="publication-preservation"><p class="publication-eyebrow">Why a wrapper exists</p><h2>The presentation can improve without rewriting history.</h2><p>The archived document keeps the typography and exact bytes released with its bundle. This route adds current navigation and institutional context around it. Corrections remain additive, and the direct archive link stays visible.</p><a href="${baseRoute}/CORRECTIONS.md">Read the correction record <span aria-hidden="true">↗</span></a></section>
  </main>
  ${renderProductShellFooter()}
</body>
</html>
`;
}

function main() {
  const records = [];
  for (const paperPath of findPapers(ARCHIVE_ROOT)) {
    const archiveDirectory = dirname(paperPath);
    const relativeDirectory = relative(ARCHIVE_ROOT, archiveDirectory).replaceAll("\\", "/");
    const metadataPath = resolve(archiveDirectory, "paper.json");
    if (!existsSync(metadataPath)) throw new Error(`${paperPath} has no paper.json metadata twin`);
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    const title = presentationCopy(metadata.title);
    if (!title) throw new Error(`${metadataPath} has no title`);
    const output = resolve(OUTPUT_ROOT, `${relativeDirectory}.html`);
    const staleDirectoryIndex = resolve(OUTPUT_ROOT, relativeDirectory, "index.html");
    const wrapperRoute = `/publication/${relativeDirectory}`;
    const family = relativeDirectory.split("/")[0];
    const archiveLabel = family.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    const baseRoute = wrapperRoute;
    const originalRoute = `${baseRoute}/paper`;
    const originalBytes = readFileSync(paperPath);
    const bundlePath = resolve(archiveDirectory, "bundle_manifest.json");
    const bundle = existsSync(bundlePath) ? JSON.parse(readFileSync(bundlePath, "utf8")) : null;
    // The manifest pins the archive's bytes. If it disagrees with what is on disk,
    // publishing its hashes as structured data would put a wrong checksum on a page
    // that exists to be checkable, which is worse than publishing none.
    const declared = bundle?.archival_assets?.html?.sha256;
    const actual = createHash("sha256").update(originalBytes).digest("hex");
    if (declared && declared !== actual) {
      throw new Error(`${paperPath}: bundle manifest declares ${declared} but the file hashes to ${actual}`);
    }
    if (existsSync(staleDirectoryIndex)) rmSync(staleDirectoryIndex);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, wrapperHtml({ title, archiveLabel, wrapperRoute, originalRoute, baseRoute, paper: metadata, bundle }), "utf8");
    records.push({
      title,
      wrapper_route: wrapperRoute,
      original_route: originalRoute,
      original_sha256: createHash("sha256").update(originalBytes).digest("hex"),
      source: relative(ROOT, paperPath).replaceAll("\\", "/"),
      wrapper: relative(ROOT, output).replaceAll("\\", "/"),
    });
  }
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, `${JSON.stringify({
    schema: "canli.publication-wrapper-manifest.v1",
    count: records.length,
    preservation_boundary: "The wrapper builder reads and hashes archival paper files but never writes them. Each wrapper links to its original and source bundle.",
    records,
  }, null, 2)}\n`, "utf8");
  console.log(`rendered ${records.length} current-shell wrappers around immutable publication bundles`);
}

main();
