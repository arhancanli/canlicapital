// =============================================================================
// CANLI CAPITAL / scripts/build-measurements.mjs
// -----------------------------------------------------------------------------
// Render every published measurement in research.json as a page a reader can
// reach by clicking.
//
// WHY. Twenty-one read-only artifacts were being copied to /glassbox/*.json and
// embedded in research.json, and NOTHING rendered them. Several are the
// corrections and the nulls — the part of this record that is actually hard to
// fake and the reason to believe any of the rest — and the only way to reach one
// was to guess a JSON URL. Unlinked JSON is invisible to a reader and worth
// nothing to a crawler.
//
// TWO RULES, both learned from this repo's own defects:
//
//   1. THE LIST IS DERIVED, NEVER WRITTEN. Pages are generated from what
//      research.json CONTAINS — any object carrying a canli schema or a claim
//      boundary. A hand-maintained list is exactly how this site came to publish
//      a six-URL sitemap for thirty-four documents: the list stops being updated
//      long before anyone notices the pages are missing. The next artifact the
//      exporter adds gets a page with no site edit at all.
//
//   2. THE PAGE IS BUILT, NOT FETCHED. Rendering these client-side would put the
//      evidence back out of reach of the thing that ranks it. The HTML carries
//      the numbers.
//
// It reuses the research paper shell (css/paper.css) rather than inventing a
// second design system for the same kind of document.
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderProductShellFooter,
  renderProductShellHeader,
  renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESEARCH_JSON = resolve(ROOT, "public/glassbox/research.json");
const OUT_DIR = resolve(ROOT, "measurements");
const ORIGIN = "https://canlicapital.com";
const AUTHOR = "Arhan Canli";
const PUBLISHER = "Canli Capital";
const TITLE_SUFFIX = " / Canli Capital";
const DESCRIPTION_MAX = 165;

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** Slice from position zero to a sentence end. Never match sentence pieces and glue them. */
function fitDescription(text) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= DESCRIPTION_MAX) return clean;
  let cut = -1;
  for (let i = 0; i < Math.min(clean.length, DESCRIPTION_MAX); i += 1) {
    const ch = clean[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    const next = clean[i + 1];
    // A period followed by a non-space is a decimal point, not a sentence ending.
    if (next !== undefined && !/\s/.test(next)) continue;
    cut = i + 1;
  }
  if (cut >= 70) return clean.slice(0, cut).trim();
  const clipped = clean.slice(0, DESCRIPTION_MAX - 1);
  return `${clipped.slice(0, clipped.lastIndexOf(" ")).trimEnd()}…`;
}

/** "atlas_reachability_screen" -> "Atlas reachability screen"; "a.b" -> "A / b". */
function humanise(path) {
  return path
    .split(".")
    .map((part) => part.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()))
    .join(" / ");
}

const slugify = (path) => path.replace(/[._]/g, "-").toLowerCase();

// ---------------------------------------------------------------------------
// DISCOVERY. An artifact is anything carrying this engine's schema stamp or a
// claim boundary, at the top level of research.json or one level inside it.
// ---------------------------------------------------------------------------
const isArtifact = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  ("claim_boundary" in value ||
    (typeof value.schema === "string" && value.schema.startsWith("canli.")));

function discover(research) {
  const found = [];
  for (const [key, value] of Object.entries(research)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    if (isArtifact(value)) {
      found.push({ path: key, data: value });
      continue;
    }
    for (const [childKey, childValue] of Object.entries(value)) {
      if (isArtifact(childValue)) found.push({ path: `${key}.${childKey}`, data: childValue });
    }
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

// ---------------------------------------------------------------------------
// RENDERING. Generic, because the whole point is that a new artifact needs no
// code. Long strings read as prose, scalars as a definition list, uniform lists
// as tables, and anything deeper than the page can carry links to the raw JSON
// rather than being flattened into noise.
// ---------------------------------------------------------------------------
const MAX_DEPTH = 3;
const PROSE_MIN = 80;

const isScalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);

function formatScalar(value) {
  if (value === null) return "&mdash;";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return escapeHtml(String(value));
    return escapeHtml(Math.abs(value) < 0.001 ? value.toExponential(3) : value.toFixed(6));
  }
  return escapeHtml(value);
}

function renderScalarList(entries) {
  const rows = entries
    .map(
      ([key, value]) =>
        `<div class="measure__row"><dt>${escapeHtml(humanise(key))}</dt>` +
        `<dd>${formatScalar(value)}</dd></div>`,
    )
    .join("\n");
  return `<dl class="measure__facts">\n${rows}\n</dl>`;
}

function renderTable(key, rows) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const head = columns.map((c) => `<th scope="col">${escapeHtml(humanise(c))}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => `<td>${isScalar(row[c]) ? formatScalar(row[c]) : "&mdash;"}</td>`)
          .join("")}</tr>`,
    )
    .join("\n");
  return (
    `<figure class="measure__tablewrap"><figcaption>${escapeHtml(humanise(key))}</figcaption>` +
    `<table class="measure__table"><thead><tr>${head}</tr></thead><tbody>\n${body}\n` +
    `</tbody></table></figure>`
  );
}

function renderValue(key, value, depth, rawUrl) {
  if (isScalar(value)) {
    if (typeof value === "string" && value.length >= PROSE_MIN) {
      return `<p class="measure__prose"><strong>${escapeHtml(humanise(key))}.</strong> ${escapeHtml(value)}</p>`;
    }
    return renderScalarList([[key, value]]);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (value.every(isScalar)) {
      const items = value.map((v) => `<li>${formatScalar(v)}</li>`).join("");
      return (
        `<p class="measure__label">${escapeHtml(humanise(key))}</p>` +
        `<ul class="measure__list">${items}</ul>`
      );
    }
    if (value.every((v) => v !== null && typeof v === "object" && !Array.isArray(v))) {
      const flat = value.filter((row) => Object.values(row).every(isScalar));
      if (flat.length === value.length) return renderTable(key, value);
    }
    return (
      `<p class="measure__label">${escapeHtml(humanise(key))}</p>` +
      `<p class="measure__deep">Nested beyond what this page renders. ` +
      `<a href="${rawUrl}">Read it in the artifact</a>.</p>`
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return "";
  if (depth >= MAX_DEPTH) {
    return (
      `<p class="measure__label">${escapeHtml(humanise(key))}</p>` +
      `<p class="measure__deep">${entries.length} further fields. ` +
      `<a href="${rawUrl}">Read them in the artifact</a>.</p>`
    );
  }
  const heading = depth === 1 ? "h3" : "h4";
  return (
    `<section class="measure__sub"><${heading}>${escapeHtml(humanise(key))}</${heading}>\n` +
    renderBody(value, depth + 1, rawUrl) +
    `\n</section>`
  );
}

function renderBody(data, depth, rawUrl) {
  // The claim boundary is rendered once, above, as the first thing a reader sees. Repeating it
  // in the field list would bury it among the numbers it is supposed to qualify.
  const entries = Object.entries(data).filter(([key]) => key !== "claim_boundary");
  // Short scalars gather into one definition list; everything else — long prose, objects,
  // arrays — renders in place, in the artifact's own order.
  const isShortScalar = (v) => isScalar(v) && !(typeof v === "string" && v.length >= PROSE_MIN);
  const scalars = entries.filter(([, v]) => isShortScalar(v));
  const rest = entries.filter(([, v]) => !isShortScalar(v));
  const parts = [];
  if (scalars.length) parts.push(renderScalarList(scalars));
  for (const [key, value] of rest) {
    const html = renderValue(key, value, depth, rawUrl);
    if (html) parts.push(html);
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// PAGE SHELL. The research paper shell, unchanged, so this is one design system.
// ---------------------------------------------------------------------------
function shell({
  title,
  description,
  url,
  cssPath,
  breadcrumb,
  h1,
  lead,
  main,
  jsonLd,
  sources,
  metaAuthor = AUTHOR,
  byline = `By <span rel="author">${AUTHOR}</span>, ${PUBLISHER}`,
}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${url}" />
<meta name="author" content="${escapeHtml(metaAuthor)}" />${sources ? `\n<meta name="canli:sources" content="${sources}" />` : ""}
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${PUBLISHER}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wdth,wght@75..100,400..700&family=Newsreader:opsz,wght@6..72,300..600&display=optional" />
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wdth,wght@75..100,400..700&family=Newsreader:opsz,wght@6..72,300..600&display=optional" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wdth,wght@75..100,400..700&family=Newsreader:opsz,wght@6..72,300..600&display=optional" /></noscript>
<link rel="stylesheet" href="${cssPath}" />
${renderProductShellStylesheet()}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "measurements" })}
<main class="paper__main" id="content">
  <article class="paper__article">
    <p class="paper__eyebrow">${breadcrumb}</p>
    <h1 class="paper__title">${escapeHtml(h1)}</h1>
    <p class="paper__byline">${byline}</p>
    <div class="paper__body">
${lead}
${main}
    </div>
  </article>
</main>
${renderProductShellFooter()}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// BUILD
// ---------------------------------------------------------------------------
function boundaryOf(data) {
  for (const key of ["claim_boundary", "what_is_measured", "purpose", "headline", "note"]) {
    const value = data[key];
    if (typeof value === "string" && value.length >= 70) return value;
  }
  return null;
}

/** The published file behind a bundle key, VERIFIED to exist rather than guessed from the key.
 *
 *  Candidates are tried most-specific first. If none is on disk the build fails: a measurement
 *  page whose "check it yourself" link 404s is worse than one that does not offer the link, and
 *  four of them shipped that way until the number-trace guard was scoped to declared sources and
 *  the missing files turned up as untraceable numbers.
 */
function rawArtifactUrl(path, research) {
  const segments = path.split(".");
  // The producer declares any key whose filename it cannot predict. Guessing first and declaring
  // second is how four of these links came to 404.
  const declared = (research.published_as || {})[path];
  const candidates = [
    ...(declared ? [declared.replace(/\.json$/, "")] : []),
    path.replace(/\./g, "_"),
    segments[segments.length - 1],
    segments[0],
  ];
  for (const candidate of candidates) {
    if (existsSync(resolve(ROOT, "public/glassbox", `${candidate}.json`))) {
      return `/glassbox/${candidate}.json`;
    }
  }
  throw new Error(
    `no published artifact found for bundle key "${path}" — tried ${candidates.join(", ")}. ` +
      `Either the exporter publishes it under a name the key does not predict, or it is in the ` +
      `bundle and not on disk. A page that tells a reader to check a file must link one that is ` +
      `there.`,
  );
}


function main() {
  if (!existsSync(RESEARCH_JSON)) {
    console.error(`missing ${RESEARCH_JSON} — the exporter has not run`);
    process.exit(1);
  }
  const research = JSON.parse(readFileSync(RESEARCH_JSON, "utf8"));
  const artifacts = discover(research);
  if (artifacts.length === 0) {
    console.error("discovered ZERO artifacts — the rule matched nothing and would build an empty index");
    process.exit(1);
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // TITLES THAT FIT, BY RULE. A nested artifact humanises to "Parent / child", which for the
  // repurchase feasibility audits ran to 75-79 characters and failed the on-page gate. Where the
  // full path is too long, the leaf alone is used — unless another artifact's leaf humanises the
  // same way, in which case the full path is kept and the length is the lesser problem. Computed
  // over the whole set so uniqueness is a property of the run, not an assumption.
  const TITLE_BUDGET = 49; // 65 minus " / Canli Capital"
  const leafCounts = new Map();
  for (const { path } of artifacts) {
    const leaf = humanise(path.split(".").pop());
    leafCounts.set(leaf, (leafCounts.get(leaf) || 0) + 1);
  }
  const displayName = (path) => {
    const full = humanise(path);
    if (full.length <= TITLE_BUDGET) return full;
    const leaf = humanise(path.split(".").pop());
    return leafCounts.get(leaf) === 1 ? leaf : full;
  };

  const cards = [];
  for (const { path, data } of artifacts) {
    const name = displayName(path);
    const slug = slugify(path);
    const url = `${ORIGIN}/measurements/${slug}`;
    const rawUrl = rawArtifactUrl(path, research);
    const boundary = boundaryOf(data);
    const description = fitDescription(
      boundary ??
        `${name}: a read-only artifact regenerated from the engine run that produced it, ` +
          `published so the figure and its limits can be checked together.`,
    );
    const technicalAuthorshipPending = data.technical_authorship_approved === false;
    const metaAuthor = technicalAuthorshipPending ? PUBLISHER : AUTHOR;
    const byline = technicalAuthorshipPending
      ? `Project owner <span>${escapeHtml(data.project_owner ?? AUTHOR)}</span> · ` +
        `AI-assisted technical draft; exact-text approval pending`
      : `By <span rel="author">${AUTHOR}</span>, ${PUBLISHER}`;
    const creator = technicalAuthorshipPending
      ? { "@type": "Organization", name: PUBLISHER, url: `${ORIGIN}/` }
      : { "@type": "Person", name: AUTHOR };

    const lead = [
      `<p class="measure__lead">${escapeHtml(name)} is one of ${artifacts.length} measurements this`,
      `engine publishes in full. It is regenerated from a real run rather than transcribed, and it`,
      `is shown here with its own claim boundary so the number and its limits arrive together.</p>`,
      boundary
        ? `<aside class="measure__boundary"><h2>What this measurement does and does not claim</h2>` +
          `<p>${escapeHtml(boundary)}</p></aside>`
        : `<aside class="measure__boundary"><h2>What this measurement does and does not claim</h2>` +
          `<p>This artifact carries no separate claim-boundary field. Read it as a record of what ` +
          `was measured, not as a claim about future performance.</p></aside>`,
    ].join("\n");

    const body = `<section class="measure__section"><h2>The measurement</h2>\n${renderBody(data, 1, rawUrl)}\n</section>
<section class="measure__section"><h2>Check it yourself</h2>
<p>Every figure above is read from <a href="${rawUrl}"><code>${escapeHtml(rawUrl)}</code></a>, the
artifact the engine wrote. Nothing on this page is typed by hand: the page is generated from that
file, so a figure that moves in the artifact moves here and a figure that is not in the artifact
cannot appear here at all.</p>
<p><a href="/measurements">All ${artifacts.length} measurements</a> &middot;
<a href="/open">The glass box</a> &middot;
<a href="/research">The research library</a></p>
</section>`;

    writeFileSync(
      resolve(OUT_DIR, `${slug}.html`),
      shell({
        title: `${name}${TITLE_SUFFIX}`,
        description,
        url,
        cssPath: "../css/paper.css",
        sources: rawUrl.replace("/glassbox/", ""),
        breadcrumb: `<a href="/measurements">Measurements</a>`,
        h1: name,
        lead,
        main: body,
        metaAuthor,
        byline,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Dataset",
          name,
          description,
          url,
          creator,
          ...(technicalAuthorshipPending
            ? {
                contributor: {
                  "@type": "Person",
                  name: data.project_owner ?? AUTHOR,
                  roleName: "Project owner",
                },
              }
            : {}),
          publisher: { "@type": "Organization", name: PUBLISHER, url: `${ORIGIN}/` },
          isAccessibleForFree: true,
          distribution: {
            "@type": "DataDownload",
            encodingFormat: "application/json",
            contentUrl: `${ORIGIN}${rawUrl}`,
          },
        },
      }),
    );

    cards.push(
      `<li class="measure__card"><h3><a href="/measurements/${slug}">${escapeHtml(name)}</a></h3>` +
        `<p>${escapeHtml(fitDescription(boundary ?? description))}</p></li>`,
    );
  }

  const indexDescription = fitDescription(
    `Every measurement this engine publishes, ${artifacts.length} of them, each rendered from the ` +
      `artifact it was written to rather than retyped, and each shown with its own claim boundary.`,
  );

  writeFileSync(
    resolve(ROOT, "measurements.html"),
    shell({
      title: `Every measurement, in full${TITLE_SUFFIX}`,
      description: indexDescription,
      url: `${ORIGIN}/measurements`,
      cssPath: "./css/paper.css",
      breadcrumb: `<a href="/research">Research</a>`,
      h1: "Every measurement, in full",
      lead: `<p class="measure__lead">This engine writes ${artifacts.length} read-only artifacts and
publishes all of them. Several are corrections against our own earlier numbers and several are
nulls — results that closed a line of enquiry rather than opening one. Those are the entries worth
reading first, because a record that only contains its wins is not a record.</p>
<p class="measure__lead">Each page below is generated from the artifact itself. No figure on any of
them is typed by hand, so a number that moves in the engine moves here, and a number that exists
nowhere in an artifact cannot appear at all.</p>`,
      main: `<section class="measure__section"><h2>The measurements</h2>
<ul class="measure__cards">
${cards.join("\n")}
</ul>
</section>
<section class="measure__section"><h2>Where these come from</h2>
<p>Each is regenerated by the engine that produced the result and copied verbatim to
<a href="/open">the glass box</a>, where a downloadable verifier re-checks every content hash and
signature against the published bundle. The written-up versions live in
<a href="/research">the research library</a>.</p>
</section>`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Every measurement, in full",
        description: indexDescription,
        url: `${ORIGIN}/measurements`,
        isPartOf: { "@type": "WebSite", name: PUBLISHER, url: `${ORIGIN}/` },
        hasPart: artifacts.map(({ path }) => ({
          "@type": "Dataset",
          name: humanise(path),
          url: `${ORIGIN}/measurements/${slugify(path)}`,
        })),
      },
    }),
  );

  console.log(`rendered ${artifacts.length} measurement pages -> measurements/*.html`);
  for (const { path } of artifacts) console.log(`    ${path}`);
}

main();
