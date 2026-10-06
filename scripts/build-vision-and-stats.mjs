// =============================================================================
// CANLI CAPITAL / scripts/build-vision-and-stats.mjs
// -----------------------------------------------------------------------------
// Renders /vision (what Canli Capital is building: the four pillars, each with what exists today
// and what is next) and /stats (how much the open MCP servers are used, from
// public/stats/adoption.json, which scripts/build-adoption-stats.mjs writes).
//
// The vision states goals as goals. Anything not yet measured or built is labelled as next or as a
// target; nothing here claims a speed, a saving or a return that has not been measured.
// =============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderProductShellFooter, renderProductShellHeader, renderProductShellStylesheet } from "./product-shell.mjs";
import { OUT as STATS } from "./build-adoption-stats.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const AUTHOR = "Arhan Canli";
const PUBLISHER = "Canli Capital";
const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const number = (n) => new Intl.NumberFormat("en-US").format(n);

function head({ route, title, description, schema }) {
  return `<!doctype html>
<html lang="en" data-page="${route.slice(1)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}${route}" />
<meta name="author" content="${AUTHOR}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${PUBLISHER}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}${route}" />
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
.pillar{border-top:1px solid rgba(0,0,0,.14);padding:1.5rem 0 .5rem}
.pillar__label{font-family:"IBM Plex Mono",monospace;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;opacity:.7;margin:0}
.pillar h2{margin:.35rem 0 .75rem}
.pillar dl{display:grid;grid-template-columns:minmax(7rem,9rem) 1fr;gap:.5rem 1rem;margin:0}
.pillar dt{font-weight:600}
.pillar dd{margin:0}
.stats__table{width:100%;border-collapse:collapse;margin:1rem 0}
.stats__table th,.stats__table td{padding:.6rem .5rem;border-bottom:1px solid rgba(0,0,0,.12);text-align:left;vertical-align:top}
.stats__num{text-align:right;font-variant-numeric:tabular-nums}
.stats__note{font-size:.9rem;opacity:.8}
@media (max-width:640px){.pillar dl{grid-template-columns:1fr}.stats__table{font-size:.9rem}}
</style>
<script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "research" })}
<main class="paper__main" id="content">
  <article class="paper__article">`;
}

const foot = `  </article>
</main>
${renderProductShellFooter()}
</body>
</html>
`;

const ORGANIZATION = {
  "@type": "Organization", "@id": `${ORIGIN}/#organization`, name: PUBLISHER, url: ORIGIN,
  founder: { "@type": "Person", name: AUTHOR, url: `${ORIGIN}/founder` },
  sameAs: ["https://github.com/arhancanli/canlicapital", "https://www.npmjs.com/package/canli-validation-mcp"],
};

const PILLARS = [
  { label: "Pillar 1", name: "Financial context for AI agents",
    goal: "The most useful and most token-efficient MCP servers and APIs in finance: an agent asks a financial question and gets a compact, sourced answer it can check.",
    today: [["MCP servers", "canli-validation-mcp, canli-fundamentals-mcp and canli-research-mcp, open source on npm and the MCP Registry, local or hosted at canlicapital.com/mcp."],
      ["API", "A free key and validation API that returns content-hashed, signed receipts."]],
    next: "More servers in the family (backtesting, portfolio), smaller tool lists and published token and latency benchmarks for each server.",
    links: [["/mcp-servers", "MCP servers"], ["/developers", "Get a free API key"]] },
  { label: "Pillar 2", name: "A glass-box quantitative engine",
    goal: "A backtesting and live-tracking engine whose every test, failure and correction is public, so a result can be checked instead of trusted.",
    today: [["ALPHAC", "The open-source engine, with its paper-traded record, trial accounting and retracted figures kept visible."],
      ["Validators", "Deflated Sharpe, probability of backtest overfitting (CSCV), minimum track record and backtest length, the haircut Sharpe and White's Reality Check, checked against their papers. They measure overfitting risk; they cannot remove it."]],
    next: "More asset classes and more economically distinct strategies, each admitted only on forward evidence.",
    links: [["/research", "Research"], ["/tools", "All tools"], ["https://github.com/arhancanli/alphac", "ALPHAC on GitHub"]] },
  { label: "Pillar 3", name: "A financial-reasoning data refinery",
    goal: "Datasets for training and testing AI on finance, where every answer is computed from public filings and checked by qualified people.",
    today: [["FilingFacts v0", "Questions generated from SEC XBRL data, each answer recomputed by an independent checker and citing its filing."],
      ["Annotation", "Guidelines, a gold packet and agreement scoring are ready. No item is called human-verified until two people have checked it."]],
    next: "A public benchmark with results for several AI models, and the first double-labelled expert gold set.",
    links: [["/research/filing-facts-v0", "FilingFacts v0"], ["/annotate", "Help check the dataset"]] },
  { label: "Pillar 4", name: "Agent-run execution",
    goal: "Strategies that pass the engine's tests, run by agents through real brokers, with every order journaled and verifiable.",
    today: [["Paper trading", "A public paper-traded record (not funded) and an execution MCP in development with paper trading by default."]],
    next: "Real capital only after licensing, a legal entity and a forward record that justifies it. Nothing here is investment advice or an offer.",
    links: [["/progress", "The live paper record"]] },
];

export function renderVision() {
  const route = "/vision";
  const title = "What Canli Capital is building";
  const description = "Canli Capital is building open infrastructure for AI agents in finance: MCP servers, a glass-box quant engine, verified financial datasets and agent-run execution.";
  const schema = { "@context": "https://schema.org", "@graph": [ORGANIZATION,
    { "@type": "AboutPage", name: title, description, url: `${ORIGIN}${route}`, about: { "@id": `${ORIGIN}/#organization` } }] };
  const pillars = PILLARS.map((p) => `
    <section class="pillar" aria-labelledby="${esc(p.label.replace(" ", "-").toLowerCase())}">
      <p class="pillar__label">${esc(p.label)}</p>
      <h2 id="${esc(p.label.replace(" ", "-").toLowerCase())}">${esc(p.name)}</h2>
      <p>${esc(p.goal)}</p>
      <dl>${p.today.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}<dt>Next</dt><dd>${esc(p.next)}</dd></dl>
      <p>${p.links.map(([href, text]) => `<a href="${esc(href)}">${esc(text)}</a>`).join(" · ")}</p>
    </section>`).join("");
  return `${head({ route, title, description, schema })}
    <p class="paper__eyebrow">The vision</p>
    <h1 class="paper__title">${esc(title)}</h1>
    <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, ${PUBLISHER}</p>
    <div class="paper__body">
      <p class="hub__standfirst">Financial software was built for people at terminals. More and more of the
      work is now done by AI agents. Canli Capital is building the open infrastructure they need: data and
      tests they can check, tools they can call, and a record that keeps its mistakes.</p>
      <p>Everything is open source and published as it is built, including the tests that fail. Each pillar
      below says what exists today and what comes next; a goal stays a goal until it is built and measured.</p>
      ${pillars}
      <section class="pillar">
        <h2>How to follow and use it</h2>
        <p><a href="/stats">Usage stats</a> · <a href="https://github.com/arhancanli/canlicapital">Source on GitHub</a> ·
        <a href="/developers">Developers</a> · <a href="/founder">Founder</a></p>
      </section>
    </div>
${foot}`;
}

export function renderStats(stats) {
  const route = "/stats";
  const rows = stats.npm.rows ?? [];
  const month = rows.reduce((sum, row) => sum + row.downloads_last_month, 0);
  const title = "Canli Capital MCP server downloads and usage";
  const description = `Downloads of Canli Capital's open MCP servers from npm, per package, for the last 7 and 30 days and since first publish, updated with each site build.`;
  const schema = { "@context": "https://schema.org", "@graph": [ORGANIZATION,
    { "@type": "Dataset", name: title, description, url: `${ORIGIN}${route}`, creator: { "@id": `${ORIGIN}/#organization` },
      license: "https://creativecommons.org/licenses/by/4.0/", dateModified: stats.npm.fetched_at?.slice(0, 10),
      distribution: { "@type": "DataDownload", contentUrl: `${ORIGIN}/stats/adoption.json`, encodingFormat: "application/json" } }] };
  const table = rows.length ? `<div role="region" aria-label="npm downloads per package" tabindex="0"><table class="stats__table">
      <caption>npm downloads per package, as of ${esc(stats.npm.fetched_at.replace("T", " ").replace("Z", " UTC"))}${stats.npm.stale ? " (the last successful read; npm was unreachable at the latest build)" : ""}</caption>
      <thead><tr><th scope="col">Package</th><th scope="col">Latest</th><th scope="col" class="stats__num">Last 7 days</th><th scope="col" class="stats__num">Last 30 days</th><th scope="col" class="stats__num">Since first publish</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><th scope="row"><a href="${esc(r.npm_url)}">${esc(r.name)}</a></th><td>${esc(r.latest_version)} (${esc(r.latest_published)})</td><td class="stats__num">${number(r.downloads_last_week)}</td><td class="stats__num">${number(r.downloads_last_month)}</td><td class="stats__num">${number(r.downloads_total)}</td></tr>`).join("")}</tbody>
    </table></div>` : `<p>npm could not be read for this build.</p>`;
  return `${head({ route, title, description, schema })}
    <p class="paper__eyebrow"><a href="/mcp-servers">MCP servers</a></p>
    <h1 class="paper__title">MCP server downloads</h1>
    <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, ${PUBLISHER}</p>
    <div class="paper__body">
      <p class="hub__standfirst">Canli Capital's MCP servers were downloaded ${number(month)} times from npm in the last 30 days.
      The table below is read from npm's public download counts each time the site is built.</p>
      ${table}
      <p class="stats__note">npm counts every download, including automated ones (CI runs, mirrors and bots), so these
      numbers are an upper bound on the number of people using the servers, not a count of users.
      The raw numbers, with the time each was read, are in <a href="/stats/adoption.json">adoption.json</a>.</p>
      <h2>Use them</h2>
      <p><a href="/mcp-servers">Install an MCP server</a> · <a href="/developers#quickstart">Get a free API key</a> ·
      <a href="https://github.com/arhancanli/canlicapital">Star the source on GitHub</a> · <a href="/vision">What we are building</a></p>
    </div>
${foot}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(resolve(ROOT, "vision.html"), renderVision());
  writeFileSync(resolve(ROOT, "stats.html"), renderStats(JSON.parse(readFileSync(resolve(ROOT, STATS), "utf8"))));
  console.log("  /vision and /stats built");
}
