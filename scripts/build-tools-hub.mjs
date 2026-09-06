// =============================================================================
// build-tools-hub.mjs  ->  /tools
// -----------------------------------------------------------------------------
// Publishes the index of every browser calculator on this site. Each one
// previously lived only in the footer's "Run it yourself" list and a handful
// of cross-links, so there was no page a search result or a reader could land
// on to see the whole set. This is that page: the query-language title from
// each tool's own generator, and one sentence, so the list reads the same way
// the tools now name themselves.
//
// The catalogue is a plain array rather than a filesystem scan, for the same
// reason STATIC_ROUTES in build-papers.mjs is hand-listed: seven tools is a
// small, deliberate set, and a page that silently stopped listing a real
// calculator would be a worse defect than a page that occasionally needs one
// line added when an eighth ships.
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderProductShellFooter,
  renderProductShellHeader,
  renderProductShellStylesheet,
} from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const OUT = resolve(ROOT, "tools.html");

const esc = (v) =>
  String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

// title: the query-language name each tool now renders as its own <h1>.
// house: the original name, kept visible as a subtitle where one exists.
// sentence: what it computes, in one sentence, matching the tool's own meta description.
const TOOLS = [
  {
    slug: "deflated-sharpe",
    title: "Deflated Sharpe ratio calculator (PSR and DSR)",
    house: "Deflated Sharpe calculator",
    sentence: "Calculates the Probabilistic and Deflated Sharpe Ratio, exposing trial count, dispersion, sample length and non-normal return assumptions.",
  },
  {
    slug: "backtest-overfitting",
    title: "Probability of backtest overfitting calculator",
    house: null,
    sentence: "Runs Combinatorially Symmetric Cross-Validation on your own matrix of variant returns, the same core the validation API imports.",
  },
  {
    slug: "selection-risk",
    title: "Backtest selection risk simulator",
    house: "Selection Risk Lab",
    sentence: "Searches a series with provably no edge and deflates your best result once the search is counted against it.",
  },
  {
    slug: "execution",
    title: "Execution assumptions cost calculator",
    house: "Execution Reality Lab",
    sentence: "Prices one strategy under six fill, delay and impact assumptions, and measures which are costs and which are re-timings.",
  },
  {
    slug: "breadth",
    title: "Portfolio breadth calculator",
    house: "Breadth Lab",
    sentence: "Computes how much a book of N sleeves is worth, and the correlation ceiling that no amount of breadth can pass.",
  },
  {
    slug: "trial-accounting",
    title: "Trial accounting explorer",
    house: "Trial accounting",
    sentence: "Reconstructs the public search denominator: every hypothesis identity, legacy and prospective, that a deflated Sharpe here is corrected against.",
  },
  {
    slug: "evidence-chain",
    title: "Signed evidence chain verifier",
    house: "Evidence chain",
    sentence: "Recomputes the signed, append-only hash chain behind this record in your browser, so you do not have to trust the website that shows it to you.",
  },
];

const description =
  "Every browser calculator this project publishes: deflated Sharpe, overfitting, selection risk, " +
  "execution cost and portfolio breadth, free and source-bound.";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Backtest validation calculators",
  description,
  url: `${ORIGIN}/tools`,
  author: { "@id": `${ORIGIN}/#arhan-canli` },
  mainEntity: {
    "@type": "ItemList",
    numberOfItems: TOOLS.length,
    itemListElement: TOOLS.map((tool, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${ORIGIN}/tools/${tool.slug}`,
      name: tool.title,
    })),
  },
};

const card = (tool) => `<article class="tools-card">
        <h2><a href="/tools/${tool.slug}">${esc(tool.title)}</a></h2>
        ${tool.house ? `<p class="tools-card__house">${esc(tool.house)}</p>` : ""}
        <p>${esc(tool.sentence)}</p>
      </article>`;

const html = `<!doctype html>
<html lang="en" data-page="tools">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Backtest validation calculators | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}/tools" />
<meta name="author" content="Arhan Canli" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="Backtest validation calculators" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}/tools" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Backtest validation calculators" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/lab.css" />
<link rel="stylesheet" href="/css/tools-hub.css" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="lab-page tools-hub-page">
<a class="lab-skip" href="#tools-list">Skip to the calculators</a>
${renderProductShellHeader({ active: "" })}
<main>
  <section class="lab-hero" aria-labelledby="tools-title">
    <p class="lab-kicker"><span>Open research instruments</span><span>${TOOLS.length} calculators</span></p>
    <h1 id="tools-title">Every calculator, in one place.</h1>
    <p class="lab-lead">Each of these runs entirely in your browser, is free, requires no account,
      and is built from the same source-bound arithmetic this project's own published record is
      held to. Most started life under a house name; each now names itself for what it computes,
      and keeps the house name as a subtitle where one exists.</p>
  </section>

  <section class="tools-grid" id="tools-list" aria-label="All calculators">
    ${TOOLS.map(card).join("\n    ")}
  </section>

  <section class="lab-notes" aria-labelledby="tools-notes-title">
    <h2 id="tools-notes-title">How to validate a backtest with these</h2>
    <div class="lab-notes__grid">
      <article><h3>1. Check the search, not just the result</h3><p>A single Sharpe ratio says
        nothing about how many variants produced it. Run
        <a href="/tools/deflated-sharpe">the deflated Sharpe calculator</a> against your trial count,
        then check whether your in-sample winner actually predicts anything out of sample with
        <a href="/tools/backtest-overfitting">the overfitting calculator</a>.</p></article>
      <article><h3>2. Watch selection risk happen</h3><p>
        <a href="/tools/selection-risk">The selection risk simulator</a> lets you search a series
        that provably has no edge, so you can see a good-looking number turn into what it actually
        is before it happens to your own research.</p></article>
      <article><h3>3. Price execution honestly</h3><p>
        <a href="/tools/execution">The execution cost calculator</a> separates costs, which reduce a
        result on every series, from re-timings, which only hurt on average.</p></article>
      <article><h3>4. Know the ceiling on diversification</h3><p>
        <a href="/tools/breadth">The portfolio breadth calculator</a> shows the correlation ceiling
        that no amount of added breadth can pass.</p></article>
    </div>
    <p class="lab-source">The same validation runs through a free keyed API: see
      <a href="/developers">the API quickstart</a> for the deflated-Sharpe, overfitting and breadth
      routes. None of these tools writes to any ledger, artifact or published record; every input
      stays in your browser.</p>
  </section>
</main>
${renderProductShellFooter()}
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`  /tools built; ${TOOLS.length} calculators indexed`);
