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

// Search results truncate past these. The papers already solve the title case with a
// declared short title; notes use the same convention so there is one rule on this site.
const TITLE_LIMIT = 65;        // including the " | Canli Capital" suffix
const DESCRIPTION_LIMIT = 165;
const DESCRIPTION_MINIMUM = 70;  // below this a search snippet is mostly empty
const SUFFIX = " | Canli Capital";

/**
 * The opening of the standfirst, trimmed to fit a search snippet.
 *
 * The first implementation used a global regex to split sentences. A global regex
 * is free to begin matching anywhere, so on a standfirst opening "a p-value of
 * 0.017. Publishable..." it started INSIDE the number and produced a description
 * beginning "017.". The result was the right length, well-formed, and nonsense.
 *
 * This walks forward from index 0 instead, so the description is always a genuine
 * prefix of the standfirst, and asserts exactly that at the end: the invariant
 * catches the whole class rather than the one string that exposed it.
 */
function metaDescription(slug, dek) {
  if (dek.length <= DESCRIPTION_LIMIT) return dek;

  // Sentence ends: terminal punctuation followed by a space and a capital, so a
  // decimal point inside a number is never mistaken for the end of a sentence.
  const ends = [];
  for (let i = 0; i < dek.length; i += 1) {
    if (!".!?".includes(dek[i])) continue;
    const after = dek.slice(i + 1);
    if (after === "" || /^\s+[A-Z(\u201c"]/.test(after)) ends.push(i + 1);
  }

  let out = "";
  for (const end of ends) {
    const candidate = dek.slice(0, end).trim();
    if (candidate.length > DESCRIPTION_LIMIT) break;
    out = candidate;
  }

  // A whole-sentence trim can be far too short when the second sentence is long,
  // and a 50-character description wastes the snippet. Fall back to a word
  // boundary, which never cuts mid-word.
  if (out.length < DESCRIPTION_MINIMUM) {
    let packed = "";
    for (const word of dek.split(" ")) {
      if (`${packed} ${word}`.trim().length > DESCRIPTION_LIMIT - 1) break;
      packed = `${packed} ${word}`.trim();
    }
    out = `${packed}\u2026`;
  }

  const literal = out.replace(/\u2026$/, "");
  if (!dek.startsWith(literal) || out.length < DESCRIPTION_MINIMUM) {
    throw new Error(
      `${slug}: description "${out.slice(0, 60)}..." is not a usable prefix of the standfirst ` +
      `(${out.length} chars, minimum ${DESCRIPTION_MINIMUM}). It must begin where the ` +
      "standfirst begins.",
    );
  }
  return out;
}

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

  // A note whose real name does not fit in a search result declares a short one.
  // The H1 and the Open Graph title always keep the real name; only <title> shortens.
  const shortLine = markdown.match(/^\*\*Short title:\*\*\s*(.+)$/im);
  const shortTitle = shortLine ? plain(shortLine[1]) : null;
  const documentTitle = shortTitle ?? title;
  if (documentTitle.length + SUFFIX.length > TITLE_LIMIT) {
    throw new Error(
      `${slug}: "${documentTitle}" plus "${SUFFIX}" is ` +
      `${documentTitle.length + SUFFIX.length} characters and truncates in search results ` +
      `(limit ${TITLE_LIMIT}). Declare "**Short title:** ..." in the markdown; the H1 and the ` +
      "Open Graph title keep the real name.",
    );
  }

  // A note MAY declare the artifacts it draws figures from, the same way every
  // generated page does, and audit-published-numbers then scopes its numerals to
  // those artifacts instead of the whole corpus.
  //
  // None of the current notes uses it, deliberately. That meta tag asserts the
  // COMPLETE set of sources, and an essay quotes the incident artifact, a
  // benchmark run and the source code in the same paragraph. Naming one file as
  // the complete set would be a false statement in service of a passing check,
  // which is the exact trade this whole site exists to refuse. The corpus-wide
  // fallback is the correct mode for prose; declare sources only for a note whose
  // figures genuinely all come from one artifact.
  //
  // 2026-08-28: and not even then, if the note links to another note whose TITLE
  // contains a number. A declaration scopes every numeral on the RENDERED page,
  // including the related-note links this builder appends, so a cross-link to
  // "The trade that lost 99 percent" made 99 an untraceable figure on a page
  // that never wrote it. Quote artifacts verbatim and let the corpus match.
  const sourceLine = markdown.match(/^\*\*Sources:\*\*\s*(.+)$/im);
  // NOT plain(): that strips underscores as markdown emphasis, so a declared
  // source of crypto_carry_replay_correction.json became
  // cryptocarryreplaycorrection.json and matched no artifact. A source list is
  // filenames, not prose, and the only markdown that can legitimately appear in
  // one is a link. Every entry is then checked against what is actually on disk,
  // because a source declaration that names a file which does not exist scopes
  // the page's numerals to nothing and fails every one of them.
  const sources = sourceLine
    ? sourceLine[1]
        .split(",")
        .map((entry) => entry.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*]/g, "").trim())
        .filter(Boolean)
    : [];
  for (const source of sources) {
    const candidates = [
      resolve(ROOT, "public", "glassbox", source),
      resolve(ROOT, "public", source),
    ];
    if (!candidates.some((path) => existsSync(path))) {
      throw new Error(
        `${slug}: declared source "${source}" is not a published artifact. ` +
        "A source list scopes every numeral on the page to those files, so naming one that " +
        "does not exist makes every figure on the page untraceable.",
      );
    }
  }

  const dateMatch = markdown.match(/\*\*Published (\d{4}-\d{2}-\d{2})[.,]/);
  if (!dateMatch) throw new Error(`${slug}: no "**Published YYYY-MM-DD" line`);

  // Body excludes the H1 and the standfirst; the page renders those itself.
  let bodyStart = titleLine + 1;
  while (bodyStart < lines.length && (lines[bodyStart].startsWith("> ") || lines[bodyStart].trim() === "")) {
    bodyStart += 1;
  }
  const body = lines
    .slice(bodyStart)
    .filter((line) => !/^\*\*(Short title|Sources):\*\*/i.test(line))
    .join("\n");
  const words = plain(body).split(/\s+/).filter(Boolean).length;

  return {
    slug, title, documentTitle, dek, sources,
    description: metaDescription(slug, dek),
    date: dateMatch[1], body, words,
    minutes: Math.max(1, Math.round(words / 220)),
  };
}

function pageHead({ title, socialTitle, description, route, extraJsonLd, sources }) {
  // <title> may shorten to fit a search result; the social title never does, because
  // it is the document's actual name.
  const social = socialTitle ?? title;
  return `<!doctype html>
<html lang="en" data-page="notes">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}${route}" />
<meta name="author" content="Arhan Canli" />${sources && sources.length ? `\n<meta name="canli:sources" content="${esc(sources.join(" "))}" />` : ""}
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="${esc(social)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}${route}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(social)}" />
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
  const html = `${pageHead({ title: note.documentTitle, socialTitle: note.title, description: note.description, route, extraJsonLd: jsonLd, sources: note.sources })}
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
