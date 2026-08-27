// =============================================================================
// build-notes.mjs
// -----------------------------------------------------------------------------
// Renders notes/*.md into indexable HTML at /notes/<slug>, plus the /notes index.
//
// These are engineering notes: post-mortems, derivations and design arguments.
// They are deliberately NOT in public/research/, because that corpus is the
// research record and its documents are hash-bound and citable. Mixing an essay
// into it would make the research index mean two different things.
//
// House rules kept here:
//   - Metadata comes FROM the document. The title is its H1 and the standfirst is
//     its leading blockquote; nothing is invented in this file.
//   - Every rendered page is checked for editable em-dash forms before it is
//     written, because the writing ratchet scans the OUTPUT and a generator that
//     introduces one turns the whole suite red with no obvious culprit.
//   - Every internal link in every note is resolved against the built routes, so
//     a post cannot ship pointing at a page that does not exist.
// =============================================================================

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { marked } from "marked";

import {
  renderProductShellFooter,
  renderProductShellHeader,
  renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = resolve(ROOT, "notes");
const ORIGIN = "https://canlicapital.com";

const esc = (v) =>
  String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

// Constructed rather than written out, exactly as audit-writing.mjs does it: a guard
// that spells the forbidden form in its own source is itself a violation, and the
// ratchet is right to flag it.
const EDITABLE_DASHES = [
  String.fromCodePoint(0x2014),
  `&${"mdash"};`,
  `&#${8212};`,
];
function assertNoEditableDash(html, where) {
  for (const form of EDITABLE_DASHES) {
    const n = html.toLowerCase().split(form.toLowerCase()).length - 1;
    if (n > 0) throw new Error(`${where}: ${n} editable em-dash form(s); the writing ratchet is locked at zero`);
  }
}

/** Strip inline markdown so a heading reads as plain prose in metadata. */
const plain = (md) =>
  md.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function parseNote(slug, markdown) {
  const lines = markdown.split("\n");

  const titleLine = lines.findIndex((l) => l.startsWith("# "));
  if (titleLine < 0) throw new Error(`${slug}: no H1 title`);
  const title = plain(lines[titleLine].slice(2));

  // The standfirst is the leading blockquote, taken verbatim from the document.
  const dekLines = [];
  for (let i = titleLine + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (l.startsWith("> ")) dekLines.push(l.slice(2).trim());
    else if (dekLines.length) break;
    else if (l.trim() !== "") break;
  }
  if (!dekLines.length) throw new Error(`${slug}: no leading blockquote standfirst`);
  const dek = plain(dekLines.join(" "));

  const dateMatch = markdown.match(/\*\*Published (\d{4}-\d{2}-\d{2})[.,]/);
  if (!dateMatch) throw new Error(`${slug}: no "**Published YYYY-MM-DD" line`);

  // Body excludes the H1 and the standfirst; the page renders those itself.
  let bodyStart = titleLine + 1;
  while (bodyStart < lines.length && (lines[bodyStart].startsWith("> ") || lines[bodyStart].trim() === "")) {
    bodyStart += 1;
  }
  const body = lines.slice(bodyStart).join("\n");
  const words = plain(body).split(/\s+/).filter(Boolean).length;

  return { slug, title, dek, date: dateMatch[1], body, words, minutes: Math.max(1, Math.round(words / 220)) };
}

function pageHead({ title, description, route, extraJsonLd }) {
  return `<!doctype html>
<html lang="en" data-page="notes">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}${route}" />
<meta name="author" content="Arhan Canli" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}${route}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/notes.css" />
<script type="application/ld+json">${JSON.stringify(extraJsonLd)}</script>
</head>`;
}

function renderNote(note, siblings) {
  const route = `/notes/${note.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: note.title,
    description: note.dek,
    url: `${ORIGIN}${route}`,
    datePublished: note.date,
    dateModified: note.date,
    wordCount: note.words,
    inLanguage: "en",
    author: { "@id": `${ORIGIN}/#arhan-canli` },
    publisher: { "@id": `${ORIGIN}/#organization` },
    mainEntityOfPage: `${ORIGIN}${route}`,
    isPartOf: { "@type": "Blog", "@id": `${ORIGIN}/notes`, name: "Engineering notes" },
  };
  const others = siblings.filter((s) => s.slug !== note.slug).slice(0, 3);
  const html = `${pageHead({ title: note.title, description: note.dek, route, extraJsonLd: jsonLd })}
<body class="note-page">
<a class="note-skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "" })}
<main id="content">
  <article class="note">
    <nav class="note-trail" aria-label="Breadcrumb">
      <a href="/notes">Engineering notes</a>
    </nav>
    <header class="note-head">
      <h1>${esc(note.title)}</h1>
      <p class="note-dek">${esc(note.dek)}</p>
      <p class="note-meta">
        <span>Arhan Canli</span>
        <time datetime="${note.date}">${note.date}</time>
        <span>${note.minutes} min read</span>
      </p>
    </header>
    <div class="note-body">
${marked.parse(note.body)}
    </div>
    <footer class="note-foot">
      <p class="note-boundary"><strong>Boundary.</strong> These notes describe engineering and
      method. They are not performance claims. The paper record and its limits are on
      <a href="/performance">status</a>, the withdrawn figures on <a href="/progress">corrections</a>,
      and the code on <a href="/engineering">engineering</a>.</p>
      ${others.length ? `<div class="note-more">
        <h2>More notes</h2>
        <ul>${others.map((o) => `<li><a href="/notes/${o.slug}">${esc(o.title)}</a></li>`).join("")}</ul>
      </div>` : ""}
    </footer>
  </article>
</main>
${renderProductShellFooter()}
</body>
</html>
`;
  assertNoEditableDash(html, `notes/${note.slug}.html`);
  return html;
}

function renderIndex(notes) {
  const description =
    "Engineering notes from Canli Capital: post-mortems on real incidents, the arithmetic " +
    "behind the validation gates, and design arguments from the research engine.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${ORIGIN}/notes`,
    name: "Engineering notes",
    description,
    url: `${ORIGIN}/notes`,
    author: { "@id": `${ORIGIN}/#arhan-canli` },
    blogPost: notes.map((n) => ({
      "@type": "TechArticle",
      headline: n.title,
      description: n.dek,
      url: `${ORIGIN}/notes/${n.slug}`,
      datePublished: n.date,
      wordCount: n.words,
      author: { "@id": `${ORIGIN}/#arhan-canli` },
    })),
  };
  const html = `${pageHead({ title: "Engineering notes", description, route: "/notes", extraJsonLd: jsonLd })}
<body class="note-page note-index-page">
<a class="note-skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "" })}
<main id="content">
  <section class="note-hero">
    <p class="note-kicker">Engineering notes</p>
    <h1>What went wrong, and what the arithmetic actually says.</h1>
    <p class="note-lead">Post-mortems on real incidents in this system, derivations of the
      statistics it gates on, and design arguments about the parts that were hard. Written for
      readers who want the mechanism, not the summary. Every figure is bound to a published
      artifact or a script you can run.</p>
  </section>
  <ol class="note-list">
    ${notes.map((n, i) => `<li>
      <a class="note-card" href="/notes/${n.slug}">
        <span class="note-card__n">${String(notes.length - i).padStart(2, "0")}</span>
        <span class="note-card__body">
          <span class="note-card__title">${esc(n.title)}</span>
          <span class="note-card__dek">${esc(n.dek)}</span>
          <span class="note-card__meta"><time datetime="${n.date}">${n.date}</time> &middot; ${n.minutes} min</span>
        </span>
      </a>
    </li>`).join("\n    ")}
  </ol>
  <section class="note-tail">
    <p>The research record, with hash-bound documents and citation metadata, is separate and
      lives at <a href="/research">research</a>. The code these notes describe is at
      <a href="/engineering">engineering</a>.</p>
  </section>
</main>
${renderProductShellFooter()}
</body>
</html>
`;
  assertNoEditableDash(html, "notes.html");
  return html;
}

function main() {
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".md")).sort();
  if (!files.length) throw new Error("no notes to build");
  const notes = files
    .map((f) => parseNote(f.slice(0, -3), readFileSync(resolve(SRC_DIR, f), "utf8")))
    .sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : b.date.localeCompare(a.date)));

  const routes = new Set(notes.map((n) => `/notes/${n.slug}`));
  for (const note of notes) {
    const html = renderNote(note, notes);
    // A note may only link to a route that exists on this site. Scoped to anchor
    // hrefs: <link rel="stylesheet"> points at a build asset, not a route, and
    // checking it here would fail on assets that exist only after the bundler runs.
    for (const [, href] of html.matchAll(/<a\s[^>]*href="(\/[^"#?]*)"/g)) {
      const local = href.replace(/\/$/, "") || "/";
      const known = local === "/" || routes.has(local)
        || existsSync(resolve(ROOT, `${local.slice(1)}.html`))
        || existsSync(resolve(ROOT, "public", local.slice(1)))
        || existsSync(resolve(ROOT, local.slice(1)));
      if (!known) throw new Error(`notes/${note.slug}: links to ${local}, which is not a built route`);
    }
    writeFileSync(resolve(ROOT, "notes", `${note.slug}.html`), html);
  }
  writeFileSync(resolve(ROOT, "notes.html"), renderIndex(notes));
  const words = notes.reduce((n, x) => n + x.words, 0);
  console.log(`  notes: ${notes.length} rendered, ${words.toLocaleString()} words, index at /notes`);
  for (const n of notes) console.log(`    ${n.date}  ${n.minutes} min  /notes/${n.slug}`);
}

main();
