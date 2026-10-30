#!/usr/bin/env node
// /privacy: what the site, the hosted servers and the local packages collect, send and keep. It covers
// what directories ask a policy to cover: collection, use and storage, third parties, retention and
// contact. It must stay true to mcp/SECURITY.md and to each pack's statement in canli://privacy.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderProductShellFooter, renderProductShellHeader, renderProductShellStylesheet } from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const ROUTE = "/privacy";
const ISSUES = "https://github.com/arhancanli/canli-mcp/issues";
const TITLE = "Privacy policy";
const DESCRIPTION = "What canlicapital.com, the hosted MCP servers and the canli-mcp package collect, send to others and keep, and for how long.";

export function render() {
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "@id": `${ORIGIN}${ROUTE}`, url: `${ORIGIN}${ROUTE}`, name: TITLE, description: DESCRIPTION },
    { "@type": "BreadcrumbList", itemListElement: [["Canli Capital", "/"], [TITLE, ROUTE]].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${path}` })) },
  ] };
  return `<!doctype html>
<html lang="en" data-page="privacy">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Privacy policy | Canli Capital</title>
<meta name="description" content="${DESCRIPTION}" />
<link rel="canonical" href="${ORIGIN}${ROUTE}" />
<meta name="author" content="Arhan Canli" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="${TITLE}" />
<meta property="og:description" content="${DESCRIPTION}" />
<meta property="og:url" content="${ORIGIN}${ROUTE}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/css/paper.css" />
${renderProductShellStylesheet()}
<script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "developers" })}
<main class="paper__main" id="content">
  <article class="paper__article">
    <p class="paper__eyebrow">Policy</p>
    <h1 class="paper__title">Privacy policy</h1>
    <div class="paper__body">
      <p class="hub__standfirst">The short version: the tools ask for no account and no personal details, there is no telemetry, and your own files, returns and prices stay on your machine when you run the local server.</p>
      <h2>The canli-mcp package, run on your machine</h2>
      <ul>
        <li><strong>Collection:</strong> Canli Capital receives no telemetry, analytics or crash reports from the package.</li>
        <li><strong>What leaves your machine:</strong> a data tool sends the company, series, symbol or search words you asked about to the source of that data. These are public bodies such as the SEC, the Treasury and central banks, other public sources such as Yahoo Finance and Cboe, and canlicapital.com for the point-in-time fundamentals and the research record. Calculation tools send nothing. Your files, returns and prices are not sent.</li>
        <li><strong>What stays on your disk:</strong> a cache of public data in <code>~/.cache/canli-fundamentals</code>, trial ledgers and any paper order log in <code>~/.canli</code>, and an audit log only if you turn one on. Delete those folders to remove them.</li>
        <li><strong>Paper trading:</strong> only if you set your own Alpaca paper keys, and then only to Alpaca. The keys stay in your environment.</li>
      </ul>
      <h2>The hosted MCP servers</h2>
      <p>These are <code>canlicapital.com/mcp</code>, <code>/mcp/canli</code>, <code>/mcp/fundamentals</code> and <code>/mcp/research</code>.</p>
      <ul>
        <li><strong>Collection:</strong> each request carries the tool and the arguments you or your AI client sent. Do not send private data to a hosted server. Your address is used to limit requests per minute, in memory in the function that answers.</li>
        <li><strong>Use and storage:</strong> a request is answered and then dropped. Our code does not write tool arguments or results to any store and keeps nothing between requests. The exception is hosted validation, below.</li>
        <li><strong>Hosted validation:</strong> for an API key it stores a SHA-256 hash of the key, its optional label, its creation, last-use and revocation times and the site that requested it, plus a daily call count. For key issuance it stores a daily count per client, where the client is the request address hashed with a secret salt. For each receipt it stores the endpoint, a SHA-256 hash of your input, the verdict and a timestamp, not the input itself. In the package's local mode, none of this happens.</li>
        <li><strong>Conversations:</strong> the servers see only the calls your client sends, not your chat, memory or files.</li>
      </ul>
      <h2>This website</h2>
      <p>The site has no analytics, advertising or tracking scripts and asks for no account. The waitlist form, where one is offered, stores the email address you enter so that we can write to you about what you signed up for.</p>
      <h2>Third parties</h2>
      <p>We do not sell or share personal data. The site and hosted servers run on Vercel, whose platform keeps its own standard request logs (method, path, status and time) under its own retention. API-key records are held in Supabase. When a hosted tool reads a public source, that source sees the request coming from our server, not from you.</p>
      <h2>Retention</h2>
      <p>Hosted tool calls are not retained by our code. API-key and receipt records are kept while the service runs, so that receipts can be checked later. Revoke a key to stop its use, or ask us to delete its record.</p>
      <h2>Children</h2>
      <p>The tools are for developers and researchers and are not directed at children. They ask for no personal details.</p>
      <h2>Contact</h2>
      <p>Open an issue at <a href="${ISSUES}">github.com/arhancanli/canli-mcp/issues</a>. Do not put private details in a public issue; say that you need a private channel and we will arrange one.</p>
      <p>Changes to this policy are published here and in the site's <a href="https://github.com/arhancanli/canlicapital">public repository</a>, with its history.</p>
    </div>
  </article>
</main>
${renderProductShellFooter()}
</body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(resolve(ROOT, "privacy.html"), render());
  console.log(`  ${ROUTE} built`);
}
