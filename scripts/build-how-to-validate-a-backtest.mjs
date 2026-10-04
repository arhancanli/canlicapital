// =============================================================================
// CANLI CAPITAL / scripts/build-how-to-validate-a-backtest.mjs
// -----------------------------------------------------------------------------
// Renders /how-to-validate-a-backtest: a plain step-by-step walk-through of this
// site's own instruments, in the order a reader would actually use them.
//
// WHY A DEDICATED PAGE. The query "how to validate a backtest" was previously
// answered only inside one FAQ row on /methodology and one section of /tools.
// Neither page's <title> or H1 names the query, so neither can rank for it.
// This page exists to own that query, not to replace either of those pages.
//
// TWO RULES kept deliberately narrow, because this page is a map, not a claim:
//   1. NO NUMBERS. Every count on this site (trial identities, kill totals,
//      thresholds) lives on the page that measures it. Typing one here would be
//      a second, driftable copy of a number that already has a home.
//   2. NO VERDICT ON WHAT A GOOD RESULT IS. This page says what to check and in
//      what order. What counts as passing is a question for the reader's own
//      research programme, not something this page decides for them.
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
const AUTHOR = "Arhan Canli";
const PUBLISHER = "Canli Capital";
const ROUTE = "/how-to-validate-a-backtest";

const esc = (v) =>
  String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

// Each step names one instrument this site already publishes, in the order a
// reader would use them: what a search cost (trials, deflation, overfitting),
// what execution and diversification cost, then how to keep the result honest.
// `api` is omitted, never invented, where no validation API route exists yet.
const STEPS = [
  {
    title: "Count every version you tried",
    text: "A good Sharpe ratio means little until you know how many versions of the strategy were tried to find it. Write down every variant, parameter set and idea you tested, including the ones you dropped.",
    calculator: { href: "/tools/trial-accounting", label: "Trial accounting explorer" },
    api: { href: "/api/v1/trials/summary", label: "Trials summary endpoint" },
  },
  {
    title: "Shrink the Sharpe for that count",
    text: "The more versions you try, the better the best one looks by luck alone. The deflated Sharpe ratio corrects for that: it is the chance your Sharpe beats the best that luck would give across that many tries.",
    calculator: { href: "/tools/deflated-sharpe", label: "Deflated Sharpe ratio calculator" },
    api: { href: "/developers#api-deflated-sharpe", label: "Deflated Sharpe validation route" },
  },
  {
    title: "Check the winner on unseen data",
    text: "Split the history into pieces, pick the best version on some of them, and see how it ranks on the rest. If the winner often lands in the bottom half, the backtest is probably overfit.",
    calculator: { href: "/tools/backtest-overfitting", label: "Probability of backtest overfitting calculator" },
    api: { href: "/developers#api-overfitting", label: "Overfitting validation route" },
  },
  {
    title: "Price in realistic trading costs",
    text: "Run the same strategy again with slower fills, wider spreads and market impact. A backtest that always trades at the midpoint is pricing trades nobody could place.",
    calculator: { href: "/tools/execution", label: "Execution assumptions cost calculator" },
    api: null,
  },
  {
    title: "See what it adds to a portfolio",
    text: "A strategy that moves with the ones you already run adds less than its own Sharpe suggests. Check what it adds once its correlation with them is counted.",
    calculator: { href: "/tools/breadth", label: "Portfolio breadth calculator" },
    api: { href: "/developers#api-breadth", label: "Breadth validation route" },
  },
  {
    title: "Keep a receipt",
    text: "Each check through the API returns a signed receipt that names the exact code it ran. Keep it, so anyone can recheck the result later instead of trusting a screenshot.",
    calculator: { href: "/tools/evidence-chain", label: "Signed evidence chain verifier" },
    api: { href: "/developers#validation", label: "How the validation API issues a receipt" },
  },
];

const description =
  "Six checks for a trading backtest: count every trial, deflate Sharpe, test unseen data, account for costs, measure breadth and retain a signed receipt.";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to validate a backtest",
  description,
  url: `${ORIGIN}${ROUTE}`,
  author: { "@id": `${ORIGIN}/#arhan-canli` },
  publisher: { "@type": "Organization", "@id": `${ORIGIN}/#organization`, name: PUBLISHER },
  step: STEPS.map((step) => ({
    "@type": "HowToStep",
    name: step.title,
    text: step.text,
    url: `${ORIGIN}${step.calculator.href}`,
  })),
};

const breadcrumbs = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Canli Capital", item: ORIGIN },
    { "@type": "ListItem", position: 2, name: "Methodology", item: `${ORIGIN}/methodology` },
    { "@type": "ListItem", position: 3, name: "How to validate a backtest", item: `${ORIGIN}${ROUTE}` },
  ],
};

const stepHtml = (step, index) => `<li class="howto__step" id="step-${index + 1}">
      <h2>${esc(step.title)}</h2>
      <p>${esc(step.text)}</p>
      <p class="howto__links">
        <a href="${step.calculator.href}">${esc(step.calculator.label)}</a>${
  step.api
    ? `<span aria-hidden="true"> / </span><a href="${step.api.href}">${esc(step.api.label)}</a>`
    : `<span aria-hidden="true"> / </span><span class="howto__no-api">No validation API route publishes this step yet</span>`
}
      </p>
    </li>`;

const html = `<!doctype html>
<html lang="en" data-page="how-to-validate-a-backtest">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>How to validate a backtest | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}${ROUTE}" />
<meta name="author" content="${AUTHOR}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${PUBLISHER}" />
<meta property="og:title" content="How to validate a backtest" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}${ROUTE}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="How to validate a backtest" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wdth,wght@75..100,400..700&family=Newsreader:opsz,wght@6..72,300..600&display=optional" />
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wdth,wght@75..100,400..700&family=Newsreader:opsz,wght@6..72,300..600&display=optional" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wdth,wght@75..100,400..700&family=Newsreader:opsz,wght@6..72,300..600&display=optional" /></noscript>
<link rel="stylesheet" href="./css/paper.css" />
${renderProductShellStylesheet()}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbs)}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "methodology" })}
<main class="paper__main" id="content">
  <article class="paper__article">
    <p class="paper__eyebrow"><a href="/methodology">Methodology</a></p>
    <h1 class="paper__title">How to validate a backtest</h1>
    <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, ${PUBLISHER}</p>
    <div class="paper__body">
      <p class="hub__standfirst">Six checks, in the order to run them. Each has a free calculator, and
      most also run through the API or from an AI assistant, so the same check works in a browser,
      in your code or in a chat.</p>
      <ol class="howto__steps">
${STEPS.map(stepHtml).join("\n")}
      </ol>
      <p>Short on time? From an AI assistant, <code>audit_backtest</code> runs the first three checks
      in one call, and <code>backtest_strategy</code> tests a rule over a whole grid of settings and
      counts every version for you. <a href="/mcp-servers/validation">See the validation MCP server.</a></p>
      <section class="verify__level" id="boundary">
        <h2>What this page does not establish</h2>
        <p>None of these checks proves a strategy will make money, and none is a forecast. Each one
        describes your search and your returns exactly as you sent them. A strategy can pass every
        step and still fail on bad data, costs the calculators do not model, or plain bad luck. This
        page tells you what to check and in what order, not what a good number looks like.</p>
      </section>
      <section class="verify__level" id="elsewhere">
        <h2>Where to go next</h2>
        <p><a href="/tools">Every calculator, in one place</a> &middot;
        <a href="/developers">The validation API quickstart</a> &middot;
        <a href="/methodology">Methodology</a> &middot;
        <a href="/verify">How to check the published record itself</a></p>
      </section>
    </div>
  </article>
</main>
${renderProductShellFooter()}
</body>
</html>
`;

writeFileSync(resolve(ROOT, "how-to-validate-a-backtest.html"), html);
console.log(`  ${ROUTE} built; ${STEPS.length} steps`);
