// =============================================================================
// CANLI CAPITAL / scripts/build-annotate.mjs
// -----------------------------------------------------------------------------
// Renders /annotate: a volunteer checks FilingFacts gold-packet items against the SEC filings they
// cite, in the browser, and posts the labels on the public review task. This is the first step of
// the annotation network (docs/goal/PILLAR3.md): no account, no backend, nothing leaves the
// browser until the volunteer posts it. The packet size is read from the packet, not typed.
// =============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderProductShellFooter, renderProductShellHeader, renderProductShellStylesheet } from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const AUTHOR = "Arhan Canli";
const PUBLISHER = "Canli Capital";
const ROUTE = "/annotate";
export const PACKET = "public/datasets/filing-facts/v0/gold-packet-v0.json";
export const REVIEW_TASK = "https://github.com/arhancanli/canlicapital/issues/299";
const GUIDELINES = "https://github.com/arhancanli/canlicapital/blob/main/scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md";

const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function render() {
  const packet = JSON.parse(readFileSync(resolve(ROOT, PACKET), "utf8"));
  const items = packet.labels.length;
  const title = "Check financial questions against SEC filings";
  const description = `Help verify the FilingFacts dataset: check ${items} questions against the SEC filings they cite, in your browser, and get credited for the labels you post.`;
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Canli Capital", item: ORIGIN },
      { "@type": "ListItem", position: 2, name: "FilingFacts v0", item: `${ORIGIN}/research/filing-facts-v0` },
      { "@type": "ListItem", position: 3, name: title, item: `${ORIGIN}${ROUTE}` },
    ],
  };
  return `<!doctype html>
<html lang="en" data-page="annotate">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}${ROUTE}" />
<meta name="author" content="${AUTHOR}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${PUBLISHER}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}${ROUTE}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="stylesheet" href="./css/paper.css" />
${renderProductShellStylesheet()}
<style>
.annotate__item{border:1px solid rgba(0,0,0,.14);border-radius:8px;padding:1.25rem 1.5rem;margin:1rem 0}
.annotate__item h2{font-size:1.15rem;line-height:1.45;margin:.4rem 0 1rem}
.annotate__meta,.annotate__progress{font-family:"IBM Plex Mono",monospace;font-size:.8rem;letter-spacing:.02em;opacity:.75}
.annotate__judgement{border:0;padding:0;margin:1rem 0}
.annotate__judgement legend{font-weight:600;margin-bottom:.35rem}
.annotate__judgement label{margin-right:1.25rem;white-space:nowrap}
.annotate__item textarea,.annotate__send input{width:100%;font:inherit;padding:.5rem;margin:.35rem 0 .75rem;box-sizing:border-box}
.annotate__nav button,.annotate__send button{font:inherit;padding:.45rem 1rem;margin-right:.5rem;cursor:pointer}
.annotate__warn{color:#9a3412}
</style>
<script type="application/ld+json">${JSON.stringify(breadcrumbs)}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "research" })}
<main class="paper__main" id="content">
  <article class="paper__article">
    <p class="paper__eyebrow"><a href="/research/filing-facts-v0">FilingFacts v0</a></p>
    <h1 class="paper__title">${esc(title)}</h1>
    <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, ${PUBLISHER}</p>
    <div class="paper__body">
      <p class="hub__standfirst">Every FilingFacts answer was computed from a company's SEC data by a
      program. None has yet been checked by a person against the filing itself. This page walks you
      through the ${items} questions of the gold packet, one at a time; each takes a few minutes.</p>
      <h2>How it works</h2>
      <ol>
        <li>Read the question and its stated answer, then open the SEC filing it cites.</li>
        <li>Judge three things: is the question clear, does the answer match what the filing reports,
        and is the citation the right filing. Say what you found when the answer is no.</li>
        <li>Download your labels, or copy them, and post them on
        <a href="${REVIEW_TASK}">the public review task</a>. With your consent, annotators are named
        on the dataset card.</li>
      </ol>
      <p>The filing is the only source: do not use a search engine, a data vendor or an AI model to
      decide an answer. The full rules are in <a href="${GUIDELINES}">the annotation guidelines</a>.</p>
      <div id="annotate-app" aria-live="polite"><p>Loading the questions...</p></div>
      <noscript><p>This page needs JavaScript. The packet is also a plain file you can fill in by hand:
      <a href="/datasets/filing-facts/v0/gold-packet-v0.json">gold-packet-v0.json</a>.</p></noscript>
      <section class="verify__level" id="privacy">
        <h2>What this page stores</h2>
        <p>Your answers stay in this browser, so you can stop and come back. Nothing is sent anywhere
        until you post your labels yourself.</p>
      </section>
      <section class="verify__level" id="boundary">
        <h2>What a label does and does not establish</h2>
        <p>A label is one person's reading of one filing. An item enters the gold set only when two
        independent annotators agree or a third person adjudicates their disagreement, using the
        published agreement script.</p>
      </section>
    </div>
  </article>
</main>
${renderProductShellFooter()}
<script type="module" src="/js/annotate.js"></script>
</body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(resolve(ROOT, "annotate.html"), render());
  console.log(`  ${ROUTE} built`);
}
