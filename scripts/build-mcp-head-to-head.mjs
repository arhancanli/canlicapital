// =============================================================================
// CANLI CAPITAL / scripts/build-mcp-head-to-head.mjs
// -----------------------------------------------------------------------------
// Renders /benchmarks/finance-mcp-servers: canli-mcp against other open-source finance MCP servers
// on the same questions, with the same model, prompt, turn limit and scoring.
//
// The runs are config/mcp-head-to-head.json, copied field for field from the benchmark's result
// files in mcp-canli/bench/rivals at the commit the config names. The flagship's own facts are
// config/canli-mcp.json. This script derives every figure (accuracy, per-category scores, medians,
// paired sign tests) into public/benchmarks/finance-mcp-servers.json, and both this page and the
// homepage print only what that file holds.
//   node scripts/build-mcp-head-to-head.mjs
// =============================================================================
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderProductShellFooter, renderProductShellHeader, renderProductShellStylesheet } from "./product-shell.mjs";
import { bars, benchmarkFigures } from "./lib/mcp-flagship.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const AUTHOR = "Arhan Canli";
export const CONFIG = "config/mcp-head-to-head.json";
export const FLAGSHIP = "config/canli-mcp.json";
export const SUMMARY = "public/benchmarks/finance-mcp-servers.json";
export const PAGE = "benchmarks/finance-mcp-servers.html";
export const ROUTE = "/benchmarks/finance-mcp-servers";
// The arm the headline speaks for: canli-mcp as it stood before the benchmark prompted any fix.
export const OURS = "canli";

const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const round = (x, d = 4) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(d)));
const pct = (x) => `${Math.round(x * 100)}%`;
const integer = new Intl.NumberFormat("en-US");

export function median(values) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Two-sided exact sign test on the questions where two arms differ.
export function signTest(better, worse) {
  const n = better + worse;
  if (!n) return 1;
  const k = Math.max(better, worse);
  let tail = 0;
  for (let i = k; i <= n; i++) tail += binomial(n, i);
  return Math.min(1, (2 * tail) / 2 ** n);
}
function binomial(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

export function checkConfig(config, flagship) {
  const problems = [];
  const need = (ok, message) => { if (!ok) problems.push(message); };
  need(config?.schema === "canli.mcp-head-to-head.v1", "schema must be canli.mcp-head-to-head.v1");
  need(/^[0-9a-f]{40}$/.test(config?.source?.commit ?? ""), "source.commit must be a full commit hash");
  need(/^\d{4}-\d{2}-\d{2}$/.test(config?.captured ?? ""), "captured must be a YYYY-MM-DD date");
  const arms = new Set((config?.arms ?? []).map((a) => a.id));
  const tasks = new Set((config?.tasks ?? []).map((t) => t.id));
  const categories = new Set((config?.categories ?? []).map((c) => c.id));
  need(arms.has(OURS), `arms must include ${OURS}`);
  for (const a of config?.arms ?? []) need(/^https:\/\/\S+$/.test(a.url ?? "") && a.license && a.version, `arm ${a.id} needs a url, version and license`);
  for (const t of config?.tasks ?? []) need(categories.has(t.category) && typeof t.question === "string" && Number.isFinite(t.truth), `task ${t.id} needs a known category, a question and a numeric answer`);
  const seen = new Set();
  for (const r of config?.runs ?? []) {
    need(arms.has(r.arm) && tasks.has(r.task), `run ${r.arm}/${r.task} names an unknown arm or question`);
    need(typeof r.correct === "boolean", `run ${r.arm}/${r.task}/${r.rep} has no correct flag`);
    const key = `${r.arm}|${r.task}|${r.rep}`;
    need(!seen.has(key), `run ${key} appears twice`);
    seen.add(key);
  }
  need(Array.isArray(config?.caveats) && config.caveats.length >= 3, "the caveats must be stated");
  need(flagship?.schema === "canli.flagship-mcp.v1", "flagship schema must be canli.flagship-mcp.v1");
  const packTools = (flagship?.packs ?? []).reduce((s, p) => s + p.tools, 0);
  const ours = config?.context?.rows?.find((r) => r.arm === OURS);
  need(ours && ours.reaches === packTools, `the context row's ${ours?.reaches} tools must equal the packs' ${packTools}`);
  if (problems.length) throw new Error(`build-mcp-head-to-head: not publishable:\n- ${problems.join("\n- ")}`);
}

export function summarize(config, flagship) {
  checkConfig(config, flagship);
  const runs = config.runs;
  const perRun = config.setup.runs_per_question;
  const by = new Map();
  for (const r of runs) {
    const key = `${r.arm}|${r.task}`;
    by.set(key, [...(by.get(key) ?? []), r]);
  }
  const cell = (arm, task) => by.get(`${arm}|${task}`) ?? [];
  const complete = (arm, task) => cell(arm, task).length === perRun;
  const tally = (rs) => ({ correct: rs.filter((r) => r.correct).length, runs: rs.length });
  const taskIds = config.tasks.map((t) => t.id);
  // The questions every untuned server finished both runs of: the headline compares only these.
  const fair = config.arms.filter((a) => !a.tuned);
  const common = taskIds.filter((t) => fair.every((a) => complete(a.id, t)));

  const arms = config.arms.map((a) => {
    const rs = runs.filter((r) => r.arm === a.id);
    const all = tally(rs);
    const commonRuns = common.flatMap((t) => cell(a.id, t));
    const onCommon = tally(commonRuns);
    const commonInput = commonRuns.reduce((s, r) => s + (r.input ?? 0), 0);
    const categories = Object.fromEntries(config.categories.map((c) => {
      const t = tally(rs.filter((r) => config.tasks.find((x) => x.id === r.task).category === c.id));
      return [c.id, { ...t, accuracy: t.runs ? round(t.correct / t.runs) : null }];
    }));
    const inputs = rs.map((r) => r.input ?? 0);
    return {
      id: a.id, label: a.label, short: a.short ?? a.label, ours: a.ours, tuned: a.tuned, version: a.version, license: a.license, url: a.url,
      questions_completed: taskIds.filter((t) => complete(a.id, t)).length,
      runs: all.runs, correct: all.correct, accuracy: round(all.correct / all.runs),
      common: { ...onCommon, accuracy: round(onCommon.correct / onCommon.runs), input_tokens: commonInput,
        input_tokens_per_correct_answer: onCommon.correct ? Math.round(commonInput / onCommon.correct) : null },
      categories,
      categories_scored_zero: Object.values(categories).filter((c) => c.runs && c.correct === 0).length,
      median_input_tokens: round(median(inputs), 1),
      median_seconds: round(median(rs.map((r) => r.seconds ?? 0)), 2),
      tool_errors_per_run: round(rs.reduce((s, r) => s + (r.errors ?? 0), 0) / rs.length, 2),
      input_tokens_per_correct_answer: all.correct ? Math.round(inputs.reduce((s, v) => s + v, 0) / all.correct) : null,
    };
  });

  const share = (arm, task) => { const rs = cell(arm, task); return rs.length ? rs.filter((r) => r.correct).length / rs.length : null; };
  const paired = fair.filter((a) => a.id !== OURS).map((rival) => {
    let better = 0, worse = 0;
    for (const t of taskIds) {
      const x = share(OURS, t), y = share(rival.id, t);
      if (x === null || y === null) continue;
      if (x > y) better++;
      if (x < y) worse++;
    }
    return { ours: OURS, rival: rival.id, better, worse, p: round(signTest(better, worse), 4) };
  });

  const rivals = arms.filter((a) => !a.ours && !a.tuned).sort((a, b) => b.common.accuracy - a.common.accuracy);
  const ours = arms.find((a) => a.id === OURS);
  return {
    schema: "canli.mcp-head-to-head-summary.v1",
    status: config.status,
    captured: config.captured,
    source: config.source,
    setup: config.setup,
    caveats: config.caveats,
    categories: config.categories,
    questions_total: taskIds.length,
    questions_common: common.length,
    common_questions: common,
    headline: {
      ours: OURS,
      ours_common: ours.common,
      best_rival: rivals[0].id,
      best_rival_common: rivals[0].common,
      rivals_beaten_on_common: rivals.filter((r) => r.common.accuracy < ours.common.accuracy).length,
      rivals: rivals.length,
      rivals_with_a_zero_category: rivals.filter((r) => r.categories_scored_zero > 0).length,
    },
    arms,
    paired,
    questions: config.tasks.map((t) => ({
      id: t.id, category: t.category, question: t.question, truth: t.truth, tolerance: t.tolerance,
      by_arm: Object.fromEntries(config.arms.map((a) => [a.id, { ...tally(cell(a.id, t.id)), answers: cell(a.id, t.id).map((r) => r.value) }])),
    })),
    context: config.context,
    flagship: {
      package: flagship.package, npm_published: flagship.npm_published, license: flagship.license, node_minimum: flagship.node_minimum, source: flagship.source,
      install: flagship.install, front: flagship.front, packs: flagship.packs,
      tools: flagship.packs.reduce((s, p) => s + p.tools, 0),
      search: flagship.search, file_reference: flagship.file_reference, batch: flagship.batch, example: flagship.example,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------------------------
const CSS = `
.paper__body .h2h__table{display:table;overflow:visible;width:100%;border-collapse:collapse;margin:0;font-variant-numeric:tabular-nums}
.h2h__table th{background:transparent}
.h2h__table th a{color:#1f3fbf}
.h2h__table th,.h2h__table td{padding:.55rem .5rem;border-bottom:1px solid rgba(0,0,0,.12);text-align:left;vertical-align:top}
.h2h__table td.num,.h2h__table th.num{text-align:right}
.h2h__table tr.is-ours th,.h2h__table tr.is-ours td{font-weight:600}
.h2h__table .zero{color:#b3261e}
.h2h__note{font-size:.85rem;color:#4a5560}
.h2h__q{font-size:.9rem;white-space:normal;min-width:280px;max-width:420px}
.h2h__table td,.h2h__table th:not(.h2h__q){white-space:nowrap}
.paper__crumbs ol{list-style:none;display:flex;flex-wrap:wrap;gap:.35rem;padding:0;margin:0 0 1rem;font-size:.85rem}
.paper__crumbs li+li::before{content:"/";margin-right:.35rem;opacity:.5}`;

function formatAnswer(v) {
  if (v === null || v === undefined) return "no number";
  return Math.abs(v) >= 1000 ? integer.format(v) : String(v);
}

export function render(data) {
  const title = "Finance MCP servers, head to head";
  const description = `canli-mcp against OpenBB, EdgarTools and Yahoo Finance MCP servers on the same ${data.questions_total} finance questions, with the same model and scoring. Every run is published.`;
  const fair = data.arms.filter((a) => !a.tuned);
  const tuned = data.arms.filter((a) => a.tuned);
  const ours = data.arms.find((a) => a.id === data.headline.ours);
  const best = data.arms.find((a) => a.id === data.headline.best_rival);
  const lead = `On the ${data.questions_common} questions every server finished, ${esc(ours.label)} answered ${pct(ours.common.accuracy)} correctly (${ours.common.correct} of ${ours.common.runs} runs). The best of the other servers, ${esc(best.label)}, answered ${pct(best.common.accuracy)} (${best.common.correct} of ${best.common.runs}).`;
  const label = (id) => data.arms.find((a) => a.id === id)?.label ?? id;
  const headRow = (a) => `<tr${a.ours ? ' class="is-ours"' : ""}><th scope="row"><a href="${esc(a.url)}" rel="noreferrer">${esc(a.label)}</a><span class="h2h__note"> ${esc(a.version)}, ${esc(a.license)}</span></th><td class="num">${pct(a.common.accuracy)}</td><td class="num">${a.common.correct} of ${a.common.runs}</td></tr>`;
  const catRow = (a) => `<tr${a.ours ? ' class="is-ours"' : ""}><th scope="row">${esc(a.label)}</th>${data.categories.map((c) => {
    const x = a.categories[c.id];
    return x.runs ? `<td class="num${x.correct === 0 ? " zero" : ""}">${x.correct}/${x.runs}</td>` : `<td class="num">not run</td>`;
  }).join("")}<td class="num">${integer.format(a.median_input_tokens)}</td><td class="num">${a.median_seconds}</td></tr>`;
  const ctxRow = (r) => `<tr${r.arm === data.headline.ours ? ' class="is-ours"' : ""}><th scope="row">${esc(r.label)}</th><td class="num">${integer.format(r.tools)}</td><td class="num">${integer.format(r.reaches)}</td><td class="num">${integer.format(r.tokens)}</td><td class="num">${r.seconds}</td></tr>`;
  const qRow = (q) => `<tr><th scope="row" class="h2h__q">${esc(q.question)}<span class="h2h__note"> Answer: ${formatAnswer(q.truth)}</span></th>${data.arms.map((a) => {
    const x = q.by_arm[a.id];
    return x.runs ? `<td class="num${x.correct === 0 ? " zero" : ""}">${x.correct}/${x.runs}</td>` : `<td class="num">not run</td>`;
  }).join("")}</tr>`;
  const pairs = data.paired.map((p) => `<li>Against ${esc(label(p.rival))}, ${esc(label(p.ours))} did better on ${p.better} questions and worse on ${p.worse} (two-sided exact sign test, p = ${p.p}).</li>`).join("");
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "Dataset", name: title, description, url: `${ORIGIN}${ROUTE}`, license: "https://creativecommons.org/licenses/by/4.0/",
      creator: { "@type": "Person", name: AUTHOR, url: `${ORIGIN}/founder` }, dateModified: data.captured,
      distribution: { "@type": "DataDownload", contentUrl: `${ORIGIN}/benchmarks/finance-mcp-servers.json`, encodingFormat: "application/json" } },
    { "@type": "BreadcrumbList", itemListElement: [["Canli Capital", "/"], ["MCP servers", "/mcp-servers"], [title, ROUTE]].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${path}` })) }] };
  const sources = ["benchmarks/finance-mcp-servers.json"];
  return `<!doctype html>
<html lang="en" data-page="benchmark-finance-mcp-servers">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>canli-mcp vs OpenBB, EdgarTools and Yahoo Finance | Canli Capital</title>
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
<style>${CSS}
</style>
<script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>
</head>
<body class="paper">
<a class="paper__skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: "benchmark" })}
<main class="h2h" id="content">
  <section class="h2h-opening">
    <nav class="paper__crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Canli Capital</a></li><li><a href="/mcp-servers">MCP servers</a></li><li><span aria-current="page">${esc(title)}</span></li></ol></nav>
    <p class="h2h-eyebrow">Benchmark, ${esc(data.status)} result of <time datetime="${data.captured}">${data.captured}</time></p>
    <h1>${esc(title)}</h1>
    <p class="h2h-lead">${lead}</p>
    <p class="h2h-byline">By <span rel="author">${AUTHOR}</span>, Canli Capital</p>
    <div class="h2h-actions"><a href="#accuracy">See the results</a><a href="/benchmarks/finance-mcp-servers.json">Download every run</a></div>
  </section>
  <section class="flagship-figures" aria-label="The gap in figures"><ul>${benchmarkFigures(data).map(([value, label]) => `<li><b>${esc(value)}</b><span>${esc(label)}</span></li>`).join("")}</ul></section>
  <section class="dev-section flagship-section" id="setup"><p class="eyebrow">The setup</p><h2>Same model. Same questions. Only the server changed.</h2>
    <p class="flagship-intro">Every server got the same model (${esc(data.setup.model)}), system prompt, ${data.setup.turn_limit}-turn limit,
    ${integer.format(data.setup.result_cap_characters)}-character cap on each tool result and scoring. No server had an API key.
    Each question ran ${data.setup.runs_per_question} times per server, and the answers were computed from primary sources
    (SEC EDGAR, the US Treasury, FRED and Yahoo Finance chart data) separately from every server compared.</p></section>
  <section class="dev-section flagship-section" id="accuracy"><p class="eyebrow">Accuracy</p><h2>Correct on the questions every server finished</h2>
    ${bars(data)}
    <div class="cc-table-scroll h2h-table" role="region" aria-label="Accuracy on the shared questions" tabindex="0"><table class="h2h__table">
      <caption>Correct runs on the ${data.questions_common} shared questions, ${data.setup.runs_per_question} runs each</caption>
      <thead><tr><th scope="col">Server</th><th scope="col" class="num">Correct</th><th scope="col" class="num">Runs</th></tr></thead>
      <tbody>${fair.map(headRow).join("")}</tbody>
    </table></div>
    <ul class="h2h-pairs">${pairs}</ul></section>
  <section class="dev-section flagship-section" id="kinds"><p class="eyebrow">Coverage</p><h2>By kind of question, over every finished run</h2>
    <p class="flagship-intro">Red marks a kind of question a server never answered correctly.</p>
    <div class="cc-table-scroll h2h-table" role="region" aria-label="Correct runs by category" tabindex="0"><table class="h2h__table">
      <caption>Correct runs by category, median input tokens and median seconds per run</caption>
      <thead><tr><th scope="col">Server</th>${data.categories.map((c) => `<th scope="col" class="num">${esc(c.label)}</th>`).join("")}<th scope="col" class="num">Input tokens</th><th scope="col" class="num">Seconds</th></tr></thead>
      <tbody>${fair.map(catRow).join("")}</tbody>
    </table></div></section>
  <section class="dev-section flagship-section" id="cost"><p class="eyebrow">Cost</p><h2>What each server costs before the model asks anything</h2>
    <p class="flagship-intro">${esc(data.context.method)} Tokens are ${esc(data.context.tokenizer)}, measured ${esc(data.context.measured)}.</p>
    <div class="cc-table-scroll h2h-table" role="region" aria-label="Context each server costs" tabindex="0"><table class="h2h__table">
      <caption>Tools sent to the model, tools reachable, tokens on every request, seconds to start and list</caption>
      <thead><tr><th scope="col">Server</th><th scope="col" class="num">Tools sent</th><th scope="col" class="num">Tools reachable</th><th scope="col" class="num">Tokens</th><th scope="col" class="num">Seconds</th></tr></thead>
      <tbody>${data.context.rows.map(ctxRow).join("")}</tbody>
    </table></div></section>
  <section class="dev-section flagship-section h2h-caveats" id="caveats"><p class="eyebrow">Before quoting it</p><h2>Read this before quoting it</h2>
    <ul>${data.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></section>
  <section class="dev-section flagship-section" id="questions"><p class="eyebrow">Every question</p><h2>Every question, every server</h2>
    <p class="flagship-intro">Correct runs per question for every server, including the two tuned canli-mcp columns: ${tuned.map((a) => esc(a.label)).join(" and ")}.</p>
    <div class="cc-table-scroll h2h-table" role="region" aria-label="Correct runs per question" tabindex="0"><table class="h2h__table">
      <caption>Correct runs per question and server</caption>
      <thead><tr><th scope="col">Question</th>${data.arms.map((a) => `<th scope="col" class="num">${esc(a.label)}</th>`).join("")}</tr></thead>
      <tbody>${data.questions.map(qRow).join("")}</tbody>
    </table></div></section>
  <section class="dev-section flagship-section" id="reproduce"><p class="eyebrow">Reproduce</p><h2>Run it yourself</h2>
    <p class="flagship-intro">The harness, the questions, the code that computes each answer and every run with its tool calls are in
    <a href="${esc(data.source.repository)}/tree/${esc(data.source.commit)}/${esc(data.source.path)}">${esc(data.source.path)}</a>
    at commit <code>${esc(data.source.commit.slice(0, 8))}</code>. All figures on this page are in
    <a href="/benchmarks/finance-mcp-servers.json">finance-mcp-servers.json</a>.</p></section>
</main>
${renderProductShellFooter()}
</body>
</html>
`;
}

export function build(root = ROOT) {
  const config = JSON.parse(readFileSync(resolve(root, CONFIG), "utf8"));
  const flagship = JSON.parse(readFileSync(resolve(root, FLAGSHIP), "utf8"));
  const data = summarize(config, flagship);
  mkdirSync(dirname(resolve(root, SUMMARY)), { recursive: true });
  writeFileSync(resolve(root, SUMMARY), JSON.stringify(data, null, 1) + "\n");
  mkdirSync(dirname(resolve(root, PAGE)), { recursive: true });
  writeFileSync(resolve(root, PAGE), render(data));
  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = build();
  const ours = data.arms.find((a) => a.id === data.headline.ours);
  console.log(`  ${ROUTE} built: ${data.arms.length} servers, ${data.questions_common} shared questions, ${ours.label} ${pct(ours.common.accuracy)}`);
}
