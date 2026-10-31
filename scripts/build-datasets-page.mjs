#!/usr/bin/env node
// /datasets/filing-facts, the landing page the site's "Financial datasets" link points at: every
// released version of FilingFacts with its files, hashes and question types, read from the
// released files themselves so the page cannot drift from them. Dataset markup, so dataset search
// can find it.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderProductShellFooter, renderProductShellHeader, renderProductShellStylesheet } from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const ROUTE = "/datasets/filing-facts";
const AUTHOR = "Arhan Canli";
const LICENSE = "https://creativecommons.org/licenses/by/4.0/";
const MODIFIED = "2026-10-23";

export const RELEASES = Object.freeze([
  { label: "v1, all", version: "1", file: "v1/filing-facts-v1-all.jsonl", released: "2026-10-07", about: "v0's question types plus restatements: what a company first reported for a period, against what it reports now." },
  { label: "v1, fresh", version: "1", file: "v1/filing-facts-v1-fresh.jsonl", released: "2026-10-07", about: "Only facts filed after 2026-04-01, for testing models on filings newer than their training data." },
  { label: "v0", version: "0", file: "v0/filing-facts-v0.jsonl", released: "2026-09-26", about: "The first release. The published benchmark runs use this set." },
]);

const TYPES = Object.freeze({
  lookup: "One value as reported in a named filing.",
  change: "The percent change of one figure between two years or balance dates.",
  ratio: "A ratio of two figures for the same period, such as a margin.",
  net_assets: "Total assets minus total liabilities at one date.",
  restatement: "The value first reported for a year, which the company may have changed since.",
  unanswerable: "A period the XBRL filings do not cover. The right answer is to say so.",
});

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const int = (n) => n.toLocaleString("en-US");
const dir = (file) => resolve(ROOT, "public/datasets/filing-facts", file);

export function readRelease(release) {
  const raw = readFileSync(dir(release.file));
  const items = raw.toString("utf8").trim().split("\n").map((line) => JSON.parse(line));
  const types = {};
  for (const item of items) types[item.template] = (types[item.template] || 0) + 1;
  const unknown = Object.keys(types).filter((type) => !TYPES[type]);
  if (unknown.length) throw new Error(`datasets page: no description for question type(s) ${unknown.join(", ")}`);
  return {
    ...release,
    items,
    types,
    companies: new Set(items.map((item) => item.company.cik)).size,
    sha256: createHash("sha256").update(raw).digest("hex"),
    megabytes: statSync(dir(release.file)).size / 1e6,
    url: `/datasets/filing-facts/${release.file}`,
  };
}

const sampleOf = ([, fresh]) => fresh.items.find((item) => item.template === "change") || fresh.items[0];

// Every figure on the page, for anyone who wants them as data and for the published-numbers audit.
export function summary(releases) {
  const sample = sampleOf(releases);
  return {
    schema: "canli.filing-facts-releases.v1",
    license: LICENSE,
    modified: MODIFIED,
    releases: releases.map(({ label, version, released, url, sha256, megabytes, companies, types, items }) => ({
      label, version, released, url, sha256, megabytes: Number(megabytes.toFixed(1)), companies, questions: items.length, types,
    })),
    sample: { id: sample.id, question: sample.question, answer: sample.answer, facts: sample.facts },
    errata: { release: "v1", items_to_score_out: 15, url: "/datasets/filing-facts/v1/ERRATA.md" },
  };
}

export function render(releases) {
  const [all] = releases;
  const title = "FilingFacts: an open dataset of SEC filing questions for AI";
  const description = `${int(all.items.length)} questions on ${int(all.companies)} companies with answers computed from SEC XBRL filings, for testing whether AI models get finance numbers right. Free under CC BY 4.0.`;
  const sample = sampleOf(releases);
  const typeRows = Object.keys(TYPES).map((type) => `<tr><th scope="row">${esc(type.replace("_", " "))}</th><td>${esc(TYPES[type])}</td>${releases.map((r) => `<td>${r.types[type] ? int(r.types[type]) : "None"}</td>`).join("")}</tr>`).join("");
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "Dataset", name: "FilingFacts", alternateName: "FilingFacts SEC filing questions", description, url: `${ORIGIN}${ROUTE}`, sameAs: `${ORIGIN}/benchmarks/filingfacts`, license: LICENSE, isAccessibleForFree: true, version: "1",
      creator: { "@type": "Person", name: AUTHOR, url: `${ORIGIN}/founder` }, dateModified: MODIFIED,
      keywords: ["SEC filings", "XBRL", "financial benchmark", "LLM evaluation", "finance question answering", "restatements"],
      distribution: releases.map((r) => ({ "@type": "DataDownload", name: r.label, contentUrl: `${ORIGIN}${r.url}`, encodingFormat: "application/jsonl" })) },
    { "@type": "BreadcrumbList", itemListElement: [["Canli Capital", "/"], ["Research", "/research"], ["FilingFacts dataset", ROUTE]].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${path}` })) },
  ] };
  const sources = ["datasets/filing-facts/index.json"];
  return `<!doctype html>
<html lang="en" data-page="dataset-filingfacts">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FilingFacts: open dataset of SEC filing questions | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}${ROUTE}" />
<meta name="author" content="${AUTHOR}" />
<meta name="canli:sources" content="${esc(sources.join(" "))}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}${ROUTE}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/css/paper.css" />
${renderProductShellStylesheet()}
<style>
.ds__wrap{overflow-x:auto;margin:1rem 0}
.ds__table{width:100%;border-collapse:collapse}
.ds__table th,.ds__table td{padding:.6rem .5rem;border-bottom:1px solid rgba(0,0,0,.12);text-align:left;vertical-align:top}
.ds__hash{display:block;font-size:.75rem;opacity:.7;overflow-wrap:anywhere}
.ds__code{overflow-x:auto;padding:1rem;background:rgba(0,0,0,.05);border-radius:.5rem;font-size:.85rem}
.paper__crumbs ol{list-style:none;display:flex;flex-wrap:wrap;gap:.35rem;padding:0;margin:0 0 1rem;font-size:.85rem}
.paper__crumbs li+li::before{content:"/";margin-right:.35rem;opacity:.5}
</style>
<script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "research" })}
<main class="paper__main" id="content">
  <article class="paper__article">
    <nav class="paper__crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Canli Capital</a></li><li><a href="/research">Research</a></li><li><span aria-current="page">FilingFacts dataset</span></li></ol></nav>
    <p class="paper__eyebrow">Dataset</p>
    <h1 class="paper__title">FilingFacts: an open dataset of SEC filing questions for AI</h1>
    <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, Canli Capital. Free under <a href="${LICENSE}">CC BY 4.0</a>.</p>
    <div class="paper__body">
      <p class="hub__standfirst">${esc(description)}</p>
      <h2>Download</h2>
      <div class="ds__wrap" role="region" aria-label="FilingFacts releases" tabindex="0"><table class="ds__table">
        <caption>Each release is one JSON Lines file, with one question on each line</caption>
        <thead><tr><th scope="col">Release</th><th scope="col">Questions</th><th scope="col">Companies</th><th scope="col">What it is</th><th scope="col">File and SHA256</th></tr></thead>
        <tbody>${releases.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${int(r.items.length)}</td><td>${int(r.companies)}</td><td>${esc(r.about)}</td><td><a href="${esc(r.url)}">${esc(r.file.split("/")[1])}</a> (${r.megabytes.toFixed(1)} MB)<code class="ds__hash">${r.sha256}</code></td></tr>`).join("")}</tbody>
      </table></div>
      <h2>Question types</h2>
      <div class="ds__wrap" role="region" aria-label="Question types in each release" tabindex="0"><table class="ds__table">
        <caption>Number of questions of each type in each release</caption>
        <thead><tr><th scope="col">Type</th><th scope="col">What it asks</th>${releases.map((r) => `<th scope="col">${esc(r.label)}</th>`).join("")}</tr></thead>
        <tbody>${typeRows}</tbody>
      </table></div>
      <h2>One question from the fresh set</h2>
      <p>${esc(sample.question)}</p>
      <p><strong>Answer:</strong> ${esc(sample.answer.value)}${sample.answer.unit ? ` ${esc(sample.answer.unit)}` : ""}.</p>
      <div class="ds__wrap" role="region" aria-label="The filing facts behind this answer" tabindex="0"><table class="ds__table">
        <caption>The filing facts behind this answer</caption>
        <thead><tr><th scope="col">Figure</th><th scope="col">Period end</th><th scope="col">Value</th><th scope="col">Filed</th><th scope="col">Accession number</th></tr></thead>
        <tbody>${sample.facts.map((fact) => `<tr><th scope="row">${esc(fact.concept)}</th><td>${esc(fact.end)}</td><td>${esc(fact.val)}</td><td>${esc(fact.filed)}</td><td>${esc(fact.accn)}</td></tr>`).join("")}</tbody>
      </table></div>
      <p>Every answer names the filing facts it comes from, down to the accession number, so you can check any item at the SEC.</p>
      <h2>Load it</h2>
      <pre class="ds__code"><code>curl -O ${ORIGIN}${all.url}
shasum -a 256 ${esc(all.file.split("/")[1])}

python3 -c "
import json
items = [json.loads(line) for line in open('${esc(all.file.split("/")[1])}')]
print(len(items), items[0]['question'])"</code></pre>
      <h2>Results and tools</h2>
      <ul>
        <li><a href="/benchmarks/filingfacts">The FilingFacts benchmark</a> scores AI models on the v0 questions, with and without a tool that reads the filings.</li>
        <li><a href="/mcp-servers">canli-mcp</a> gives a model the filings themselves, so it can answer from the source.</li>
        <li><a href="https://github.com/arhancanli/canlicapital/tree/main/scripts/datasets/filing-facts">The generator and scoring harness</a> are open source.</li>
        <li><a href="/research/filing-facts-v0">The v0 dataset card</a> has its method in full, and <a href="/research/citations/filing-facts-v0.bib">a citation</a>.</li>
      </ul>
      <h2>Limits</h2>
      <ul>
        <li>Answers are computed from the companies' XBRL data and rechecked by a separate program. No expert has reviewed them yet; <a href="/annotate">you can help check them</a>.</li>
        <li>XBRL can differ from the filing's text, and a company can tag a figure wrongly. A computed answer inherits that.</li>
        <li>15 restatement items in v1 ask for a year's figure but cite a shorter period. <a href="/datasets/filing-facts/v1/ERRATA.md">The errata</a> lists them; score them out.</li>
      </ul>
    </div>
  </article>
</main>
${renderProductShellFooter()}
</body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const releases = RELEASES.map(readRelease);
  mkdirSync(resolve(ROOT, "datasets"), { recursive: true });
  writeFileSync(resolve(ROOT, "public/datasets/filing-facts/index.json"), `${JSON.stringify(summary(releases), null, 1)}\n`);
  writeFileSync(resolve(ROOT, "datasets/filing-facts.html"), render(releases));
  console.log(`  ${ROUTE} built: ${releases.map((r) => `${r.label} ${r.items.length}`).join(", ")}`);
}
