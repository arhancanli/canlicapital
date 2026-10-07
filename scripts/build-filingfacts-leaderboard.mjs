// =============================================================================
// CANLI CAPITAL / scripts/build-filingfacts-leaderboard.mjs
// -----------------------------------------------------------------------------
// Renders /benchmarks/filingfacts: how well AI models answer questions about SEC filings on their own
// ("closed book") and with Canli Capital's MCP server reading the filings ("with MCP").
//
// Every row comes from an evidence file under public/datasets/filing-facts/v0/runs/<date>/, written by
// scripts/datasets/filing-facts/eval.mjs: the model's raw answers, the tool calls, and the scoring,
// rescorable offline with replay-evaluation.mjs. This script derives every figure the page prints
// (accuracy, its 95% Wilson interval, how often a number given was wrong, tokens) into
// leaderboard.json, and the page prints only what that file holds.
//   node scripts/build-filingfacts-leaderboard.mjs
// =============================================================================
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderProductShellFooter, renderProductShellHeader, renderProductShellStylesheet } from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const AUTHOR = "Arhan Canli";
export const RUNS_DIR = "public/datasets/filing-facts/v0/runs";
export const SUMMARY = "public/datasets/filing-facts/v0/leaderboard.json";
const ROUTE = "/benchmarks/filingfacts";
const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const pct = (x) => (x === null || x === undefined ? "n/a" : `${(x * 100).toFixed(1)}%`);
const round = (x, d = 4) => (x === null || x === undefined ? null : Number(x.toFixed(d)));

// Wilson score interval for k successes in n trials, 95%.
export function wilson(k, n, z = 1.959964) {
  if (!n) return [null, null];
  const p = k / n, d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

// One row per evidence file. Smoke runs (fewer items than the full sample) are not rows.
export function readRuns(root = ROOT) {
  const out = [];
  const base = resolve(root, RUNS_DIR);
  let dates = [];
  try { dates = readdirSync(base).sort(); } catch { return out; }
  for (const date of dates) {
    for (const file of readdirSync(join(base, date)).filter((f) => f.endsWith(".json")).sort()) {
      const evidence = JSON.parse(readFileSync(join(base, date, file), "utf8"));
      const s = evidence.summary;
      if (!s || s.items < 100) continue;
      const correct = Math.round(s.accuracy * s.items);
      const [lo, hi] = wilson(correct, s.items);
      out.push({
        model: s.model, arm: s.arm, provider: evidence.capture?.provider ?? null, date, items: s.items, correct,
        accuracy: round(s.accuracy), ci95: [round(lo), round(hi)], errors: s.errors,
        numbers_given: s.behaviour?.numbers_given ?? null, numbers_wrong: round(s.behaviour?.numbers_wrong ?? null),
        unanswerable_abstention: round(s.behaviour?.unanswerable_abstention ?? null),
        mean_tokens: s.mean_tokens, dataset_sha256: evidence.dataset?.sha256 ?? evidence.capture?.dataset_sha256 ?? null,
        evidence: `/datasets/filing-facts/v0/runs/${date}/${file}`,
      });
    }
  }
  return out;
}

// Models with both arms, ordered by accuracy with the MCP server, then closed-book accuracy.
export function leaderboard(rows) {
  const byModel = new Map();
  for (const r of rows) {
    const entry = byModel.get(r.model) ?? { model: r.model, provider: r.provider };
    entry[r.arm] = r;
    byModel.set(r.model, entry);
  }
  return [...byModel.values()].sort((a, b) => (b.mcp?.accuracy ?? -1) - (a.mcp?.accuracy ?? -1) || (b.closed?.accuracy ?? -1) - (a.closed?.accuracy ?? -1));
}

export function summary(rows, generatedAt) {
  const table = leaderboard(rows);
  const both = table.filter((t) => t.closed && t.mcp);
  return {
    schema: "canli.filingfacts-leaderboard.v1",
    generated_at: generatedAt,
    sample: { items: rows[0]?.items ?? null, per_template: rows[0] ? rows[0].items / 5 : null, templates: 5 },
    models: table.length,
    models_with_both_arms: both.length,
    rows: table,
    limits: [
      "Each row is one run of one model on a fixed stratified sample of FilingFacts v0 questions; a different sample or a rerun can move a figure within its interval.",
      "Closed-book scores measure what a model produces without the filings, not what it knows: most correct answers need a figure from one specific filing.",
      "Expected answers are computed from SEC XBRL data and rechecked by an independent program. They have not yet been verified by human experts.",
    ],
  };
}

function row(t) {
  const c = t.closed, m = t.mcp;
  const cell = (r) => (r ? `${pct(r.accuracy)} <span class="lb__ci">[${pct(r.ci95[0])}, ${pct(r.ci95[1])}]</span>` : "not yet run");
  const wrong = c && c.numbers_given ? `${pct(c.numbers_wrong)} of ${c.numbers_given}` : "n/a";
  const links = [c && `<a href="${esc(c.evidence)}">closed run</a>`, m && `<a href="${esc(m.evidence)}">MCP run</a>`].filter(Boolean).join(" · ");
  return `<tr><th scope="row">${esc(t.model)}</th><td>${cell(c)}</td><td>${cell(m)}</td><td>${wrong}</td><td>${links}</td></tr>`;
}

export function render(data) {
  const title = "FilingFacts benchmark: AI models on SEC filing questions";
  const description = "How often AI models answer questions about SEC filings correctly on their own and with an MCP server that reads the filings, from public, rescorable run records.";
  const top = data.rows.find((t) => t.closed && t.mcp);
  const lead = top
    ? `On ${data.sample.items} questions about SEC filings, ${esc(top.model)} answered ${pct(top.closed.accuracy)} correctly on its own and ${pct(top.mcp.accuracy)} with an MCP server that reads the filings.`
    : "Results are being collected.";
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "Dataset", name: title, description, url: `${ORIGIN}${ROUTE}`, license: "https://creativecommons.org/licenses/by/4.0/",
      creator: { "@type": "Person", name: AUTHOR, url: `${ORIGIN}/founder` }, dateModified: data.generated_at.slice(0, 10),
      distribution: { "@type": "DataDownload", contentUrl: `${ORIGIN}/datasets/filing-facts/v0/leaderboard.json`, encodingFormat: "application/json" } },
    { "@type": "BreadcrumbList", itemListElement: [["Canli Capital", "/"], ["Research", "/research"], ["FilingFacts benchmark", ROUTE]].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${path}` })) }] };
  const sources = ["datasets/filing-facts/v0/leaderboard.json"];
  return `<!doctype html>
<html lang="en" data-page="benchmark-filingfacts">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FilingFacts: AI models on SEC filing questions | Canli Capital</title>
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
.lb__table{width:100%;border-collapse:collapse;margin:1rem 0}
.lb__table th,.lb__table td{padding:.6rem .5rem;border-bottom:1px solid rgba(0,0,0,.12);text-align:left;vertical-align:top}
.lb__ci{display:block;font-size:.8rem;opacity:.7}
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
    <nav class="paper__crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Canli Capital</a></li><li><a href="/research">Research</a></li><li><span aria-current="page">FilingFacts benchmark</span></li></ol></nav>
    <p class="paper__eyebrow">Benchmark</p>
    <h1 class="paper__title">${esc(title)}</h1>
    <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, Canli Capital</p>
    <div class="paper__body">
      <p class="hub__standfirst">${lead}</p>
      <p>Each question asks for a figure from a company's SEC filings, a change or ratio between two of them, or
      a figure the filings do not contain. The expected answer is computed from the filings' XBRL data and
      rechecked by a separate program. "Closed book" is the model alone; "with MCP" gives it one tool,
      <a href="/mcp-servers/validation">canli-validation-mcp</a>'s company history, which reads the filings.</p>
      <div role="region" aria-label="FilingFacts leaderboard" tabindex="0"><table class="lb__table">
        <caption>Accuracy on ${data.sample.items} questions (${data.sample.per_template} per question type), with 95% intervals</caption>
        <thead><tr><th scope="col">Model</th><th scope="col">Closed book</th><th scope="col">With MCP</th><th scope="col">Closed book: numbers given that were wrong</th><th scope="col">Run records</th></tr></thead>
        <tbody>${data.rows.map(row).join("")}</tbody>
      </table></div>
      <h2>What the runs show</h2>
      <p>Without the filings, models mostly either decline or state a number, and the numbers they state are
      almost all wrong. The fourth column counts them. A tool that reads the source turns most of those into
      correct, checkable answers.</p>
      <h2>Check it yourself</h2>
      <p>Every run record holds the exact questions, the model's raw answers, every tool call and the scoring.
      <code>replay-evaluation.mjs</code> rescores a record offline. The questions are in
      <a href="/datasets/filing-facts/v0/filing-facts-v0.jsonl">filing-facts-v0.jsonl</a>, and the harness is
      <a href="https://github.com/arhancanli/canlicapital/tree/main/scripts/datasets/filing-facts">open source</a>.
      All figures on this page are in <a href="/datasets/filing-facts/v0/leaderboard.json">leaderboard.json</a>.</p>
      <h2>Limits</h2>
      <ul>${data.limits.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
    </div>
  </article>
</main>
${renderProductShellFooter()}
</body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = readRuns();
  const prior = (() => { try { return JSON.parse(readFileSync(resolve(ROOT, SUMMARY), "utf8")); } catch { return null; } })();
  const generatedAt = prior && JSON.stringify(summary(rows, prior.generated_at).rows) === JSON.stringify(prior.rows) ? prior.generated_at : new Date().toISOString().slice(0, 10);
  const data = summary(rows, generatedAt);
  mkdirSync(dirname(resolve(ROOT, SUMMARY)), { recursive: true });
  writeFileSync(resolve(ROOT, SUMMARY), JSON.stringify(data, null, 2) + "\n");
  mkdirSync(resolve(ROOT, "benchmarks"), { recursive: true });
  writeFileSync(resolve(ROOT, "benchmarks/filingfacts.html"), render(data));
  console.log(`  ${ROUTE} built: ${data.models} models, ${data.models_with_both_arms} with both arms`);
}
