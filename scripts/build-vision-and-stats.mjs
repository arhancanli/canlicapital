// =============================================================================
// CANLI CAPITAL / scripts/build-vision-and-stats.mjs
// -----------------------------------------------------------------------------
// Renders /vision (what Canli Capital is building: five branches and the flagship funds they feed, each
// with what exists today and what is next, and the road to 2028) and /stats (how much the open MCP servers are used, from
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

function head({ route, title, description, schema, sources = [] }) {
  return `<!doctype html>
<html lang="en" data-page="${route.slice(1)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}${route}" />
<meta name="author" content="${AUTHOR}" />
${sources.length ? `<meta name="canli:sources" content="${esc(sources.join(" "))}" />\n` : ""}<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
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
.paper__crumbs ol{list-style:none;display:flex;flex-wrap:wrap;gap:.35rem;padding:0;margin:0 0 1rem;font-size:.85rem}
.paper__crumbs li+li::before{content:"/";margin-right:.35rem;opacity:.5}
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

// Home, then each parent, then the page itself; the same list feeds the JSON-LD and the visible trail.
const breadcrumbList = (trail) => ({ "@type": "BreadcrumbList", itemListElement: trail.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${path}` })) });
const breadcrumbNav = (trail) => `<nav class="paper__crumbs" aria-label="Breadcrumb"><ol>${trail.map(([name, path], i) => `<li>${i === trail.length - 1 ? `<span aria-current="page">${esc(name)}</span>` : `<a href="${esc(path)}">${esc(name)}</a>`}</li>`).join("")}</ol></nav>`;
const VISION_TRAIL = [["Canli Capital", "/"], ["Vision", "/vision"]];
const STATS_TRAIL = [["Canli Capital", "/"], ["MCP servers", "/mcp-servers"], ["MCP server downloads", "/stats"]];

const ORGANIZATION = {
  "@type": "Organization", "@id": `${ORIGIN}/#organization`, name: PUBLISHER, url: ORIGIN,
  logo: { "@type": "ImageObject", url: `${ORIGIN}/brand-mark.svg` },
  founder: { "@type": "Person", name: AUTHOR, url: `${ORIGIN}/founder` },
  sameAs: ["https://github.com/arhancanli/canlicapital", "https://www.npmjs.com/package/canli-validation-mcp"],
};

// The five branches and the destination they feed (owner, 2026-10-15 and 2026-10-20), as the homepage
// film's vision chapter lists them: what each is for, what exists today and what comes next. Today's
// figures are read from published files; a goal stays labelled as a goal.
const PARTS = [
  { id: "mcp", n: "01", name: "MCP servers and API", status: ["live", "Live"],
    goal: "The best finance tools for AI agents: primary-source data and quant tools behind one MCP server, for as few tokens as possible, proved on someone else's test.",
    today: (f) => [
      `canli-mcp puts ${f.tools} tools behind ${f.front}: SEC filings, fundamentals, Treasury and FRED data, prices, quant analytics, backtest validation and paper trading, in ${f.tokens} tokens of context.`,
      `${f.onNpm} servers of the family are on npm, three of them also hosted at canlicapital.com/mcp.`,
      `In the open benchmark, canli-mcp answered ${f.ours} of the questions every server finished; the best of the other open servers, ${f.best}.`],
    next: "The independent test on public expert questions (Vals.ai's finance set and FinanceBench) against the strongest open servers, then canli-mcp 1.0, more servers in the family and a paid tier for developers.",
    links: [["/mcp-servers", "canli-mcp and the servers"], ["/benchmarks/finance-mcp-servers", "The benchmark"]] },
  { id: "data", n: "02", name: "Data and annotation", status: ["next", "Started"],
    goal: "Financial datasets to train and test AI models, computed from public filings and checked by qualified people. The aim is the best expert annotation in finance.",
    today: (f) => [
      `FilingFacts asks AI models questions about what companies reported to the SEC. On their own, ${f.closedModel} answered ${f.closed} correctly; with a Canli MCP server reading the filings, ${f.mcp}.`,
      "Every answer is recomputed by an independent checker and cites its filing. No item is called human-verified until two people have checked it."],
    next: "The first double-labelled expert gold set, a paid network of qualified annotators, and benchmark results for more models.",
    links: [["/benchmarks/filingfacts", "FilingFacts results"], ["/annotate", "Help check the dataset"]] },
  { id: "library", n: "03", name: "The sleeve library", status: ["next", "Started"],
    goal: "A library where developers and their agents build, train and test millions of strategy sleeves, with honest statistics on every result. Failed experiments are kept and used, and developers get their own testing servers later.",
    today: () => [
      "canli-quant-mcp ships a library of strategy sleeves with backtests and multiple-testing corrections, so a search over many sleeves is judged as a search.",
      "Every trial ALPHAC runs is counted and published, including the ones that fail."],
    next: "Version 1 of the training environment, open to developers, growing from today's library toward millions of sleeves.",
    links: [["/mcp-servers", "The quant server"], ["/trials", "Every trial"]] },
  { id: "alphac", n: "04", name: "ALPHAC, the breadth engine", status: ["next", "Paper only"],
    goal: "One book built from hundreds of thousands of sleeves. What matters most is how little they move together: the number of independent bets, not the number of sleeves, sets the ceiling, so a sleeve may be weak as long as it is weakly correlated with the rest and clears its own costs. The target is a Sharpe ratio far beyond 2, claimed only on a forward record after costs.",
    today: () => [
      "ALPHAC, the open-source engine, keeps its paper-traded record, its trial accounting and its retracted figures in public.",
      "Its research found that many sleeves built on the same few ideas add almost nothing, so the work now is new, uncorrelated families: new markets, horizons and kinds of data."],
    next: "Ideas admitted as whole families on their correlation to the book, more asset classes, and a forward record long enough to tell skill from luck.",
    links: [["/record", "The paper record"], ["/research", "Research"]] },
  { id: "breakthroughs", n: "05", name: "The breakthroughs lab", status: ["next", "Started"],
    goal: "New mathematics and statistics for quant research: tests that tell a real edge from luck, published openly so anyone can check them.",
    today: () => [
      "The validators (deflated Sharpe, probability of backtest overfitting, minimum track record, the haircut Sharpe and White's Reality Check) are checked against their papers. They measure overfitting risk; they cannot remove it.",
      "Studies of strategies with no edge at all decide which tests the servers run, and the methods ship with their code."],
    next: "Papers for peer review, and new tests built for the way AI agents now search through strategies.",
    links: [["/research", "Research"], ["/tools", "The calculators"]] },
  { id: "funds", n: "06", name: "The flagship funds", status: ["next", "Paper only"],
    goal: "The destination all five branches feed: funds run from the US, open to investors worldwide under US rules, trading the best of everything above.",
    today: () => [
      "A public paper-traded record, not funded, with every position, decision and broker reconciliation published.",
      "canli-paper-trading-mcp places Alpaca paper orders behind pre-trade checks and a kill switch."],
    next: "Real capital only after licensing, a legal entity and a forward record that justifies it. Nothing here is investment advice or an offer.",
    links: [["/record", "The paper record"], ["/progress", "Corrections"]] },
];

// The road, in the owner's order (tools first, the funds later). Goals, not dates already met.
const ROAD = [
  ["Now to mid-2027", "Tools developers pay for", "The best finance MCP servers, proved on independent tests; the first paid developer tier; the sleeve library opening to developers; ALPHAC adding new, uncorrelated families with a year of forward record."],
  ["2027", "The research platform", "The training environment and testing servers, the expert annotation network, and ALPHAC across asset classes with far more independent bets."],
  ["2028", "Groundwork for the funds", "The US company, counsel and compliance, and a real-money track record through the legal path, before any fund opens."],
];

const pct = (x) => `${Math.round(x * 100)}%`;

export function visionFigures({ h2h, stats, leaderboard }) {
  const ours = h2h.arms.find((a) => a.id === h2h.headline.ours);
  const best = h2h.arms.find((a) => a.id === h2h.headline.best_rival);
  const ctx = h2h.context.rows.find((r) => r.arm === ours.id);
  const row = leaderboard.rows.find((r) => r.mcp && r.model === "gpt-5-mini") ?? leaderboard.rows.find((r) => r.mcp);
  const npm = stats.npm?.rows ?? [];
  return { tools: number(h2h.flagship.tools), front: h2h.flagship.front.length, tokens: number(ctx.tokens), onNpm: npm.length,
    ours: pct(ours.common.accuracy), best: pct(best.common.accuracy), closedModel: row.model, closed: pct(row.closed.accuracy), mcp: pct(row.mcp.accuracy),
    month: stats.npm?.downloads_last_month_all_packages ?? null };
}

export function renderVision({ h2h, stats, leaderboard }) {
  const route = "/vision";
  const title = "What Canli Capital is building";
  const description = "Canli Capital is building the research platform for quants and AI agents in finance, in the open, in five branches (MCP servers, data and annotation, a sleeve library, the ALPHAC engine and a breakthroughs lab) feeding flagship funds from the US.";
  const f = visionFigures({ h2h, stats, leaderboard });
  const schema = { "@context": "https://schema.org", "@graph": [ORGANIZATION,
    { "@type": "AboutPage", name: title, description, url: `${ORIGIN}${route}`, about: { "@id": `${ORIGIN}/#organization` } }, breadcrumbList(VISION_TRAIL)] };
  const strip = [[f.tools, "finance tools behind one MCP server"], [String(f.onNpm), "servers of the family on npm"], ...(f.month === null ? [] : [[number(f.month), "npm downloads in the last 30 days"]]), [f.ours, `correct in the open benchmark; the best of the others, ${f.best}`], [f.mcp, `of FilingFacts questions right for ${f.closedModel} with a Canli MCP server, against ${f.closed} on its own`]];
  const parts = PARTS.map((p) => `
  <section class="vision-part" data-part="${p.id}" aria-labelledby="part-${p.id}">
    <p class="vision-part__n">${p.n}</p>
    <div class="vision-part__head"><h2 id="part-${p.id}">${esc(p.name)}</h2><em class="vision-chip vision-chip--${p.status[0]}">${esc(p.status[1])}</em></div>
    <p class="vision-part__goal">${esc(p.goal)}</p>
    <div class="vision-part__cols"><div><h3>Today</h3><ul>${p.today(f).map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div><div><h3>Next</h3><p>${esc(p.next)}</p></div></div>
    <p class="vision-part__links">${p.links.map(([href, text]) => `<a href="${esc(href)}">${esc(text)}</a>`).join("")}</p>
  </section>`).join("");
  return `${head({ route, title, description, schema, sources: ["benchmarks/finance-mcp-servers.json", "stats/adoption.json", "datasets/filing-facts/v0/leaderboard.json"] }).replace('<main class="paper__main" id="content">\n  <article class="paper__article">', '<main class="vision" id="content">')}
  <section class="vision-opening">
    ${breadcrumbNav(VISION_TRAIL)}
    <p class="vision-eyebrow">The vision</p>
    <h1>Picture the market at dawn, every agent working from checked numbers</h1>
    <p class="vision-lead">AI agents will research, test and trade at machine speed. The goal is to build the biggest research platform in finance and quant for them and for the people who direct them, in the open, in five branches: the tools they use, the data they learn from, a library of strategies to build on, an engine that combines them and new methods that keep them honest. Flagship funds from the US are where the best of it is meant to trade.</p>
    <div class="vision-actions"><a href="#parts">The five branches</a><a href="/mcp-servers">Start with canli-mcp</a></div>
  </section>
  <section class="flagship-figures" aria-label="Where it stands today"><ul>${strip.map(([value, label]) => `<li><b>${esc(value)}</b><span>${esc(label)}</span></li>`).join("")}</ul></section>
  <section class="vision-intro dev-section flagship-section" id="parts"><p class="eyebrow">Five branches, one destination</p><h2>What it stands on</h2><p class="flagship-intro">Financial software was built for people at terminals. More and more of the work is now done by AI agents. Each branch feeds the others: developers come for the tools and data and build in the library, the most different strategies feed ALPHAC, the methods keep every result honest, and the funds' record brings more developers. Everything is open source and published as it is built, including the tests that fail; each branch says what exists today and what comes next, and a goal stays a goal until it is built and measured.</p></section>
  <div class="vision-parts">${parts}
  </div>
  <section class="dev-section flagship-section vision-road" aria-labelledby="road-h"><p class="eyebrow">The road</p><h2 id="road-h">Tools first, the funds later</h2><ol class="vision-road__steps">${ROAD.map(([when, name, what]) => `<li><p class="vision-part__n">${esc(when)}</p><h3>${esc(name)}</h3><p>${esc(what)}</p></li>`).join("")}</ol><p class="flagship-intro">Every target here is a target until it is built and measured, and a Sharpe ratio counts only on a forward record after real costs.</p></section>
  <section class="dev-section flagship-section vision-follow"><p class="eyebrow">Follow and use it</p><h2>Build on it</h2><p class="vision-part__links"><a href="/mcp-servers">Install canli-mcp</a><a href="/developers">Developer guide</a><a href="/stats">Usage</a><a href="https://github.com/arhancanli/canlicapital">Source on GitHub</a><a href="/founder">The founder</a></p></section>
</main>
${renderProductShellFooter()}
</body>
</html>
`;
}

export function renderStats(stats) {
  const route = "/stats";
  const rows = stats.npm.rows ?? [];
  const month = stats.npm.downloads_last_month_all_packages ?? rows.reduce((sum, row) => sum + (row.downloads_last_month ?? 0), 0);
  const title = "Canli Capital MCP server downloads and usage";
  const description = `Downloads of Canli Capital's open MCP servers from npm, per package, for the last 7 and 30 days and since first publish, updated with each site build.`;
  const schema = { "@context": "https://schema.org", "@graph": [ORGANIZATION,
    { "@type": "Dataset", name: title, description, url: `${ORIGIN}${route}`, creator: { "@id": `${ORIGIN}/#organization` },
      license: "https://creativecommons.org/licenses/by/4.0/", dateModified: stats.npm.fetched_at?.slice(0, 10),
      distribution: { "@type": "DataDownload", contentUrl: `${ORIGIN}/stats/adoption.json`, encodingFormat: "application/json" } }, breadcrumbList(STATS_TRAIL)] };
  const table = rows.length ? `<div role="region" aria-label="npm downloads per package" tabindex="0"><table class="stats__table">
      <caption>npm downloads per package, as of ${esc(stats.npm.fetched_at.replace("T", " ").replace("Z", " UTC"))}${stats.npm.stale ? " (the last successful read; npm was unreachable at the latest build)" : ""}</caption>
      <thead><tr><th scope="col">Package</th><th scope="col">Latest</th><th scope="col" class="stats__num">Last 7 days</th><th scope="col" class="stats__num">Last 30 days</th><th scope="col" class="stats__num">Since first publish</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><th scope="row"><a href="${esc(r.npm_url)}">${esc(r.name)}</a></th><td>${esc(r.latest_version)} (${esc(r.latest_published)})</td>${r.downloads_total === null ? `<td class="stats__num" colspan="3">npm has not started counting yet</td>` : `<td class="stats__num">${number(r.downloads_last_week)}</td><td class="stats__num">${number(r.downloads_last_month)}</td><td class="stats__num">${number(r.downloads_total)}</td>`}</tr>`).join("")}</tbody>
    </table></div>` : `<p>npm could not be read for this build.</p>`;
  return `${head({ route, title, description, schema, sources: ["stats/adoption.json"] })}
    ${breadcrumbNav(STATS_TRAIL)}
    <h1 class="paper__title">MCP server downloads</h1>
    <p class="paper__byline">By <span rel="author">${AUTHOR}</span>, ${PUBLISHER}</p>
    <div class="paper__body">
      <p class="hub__standfirst">Canli Capital's MCP servers were downloaded ${number(month)} times from npm in the last 30 days.
      The table below is read from npm's public download counts each time the site is built.</p>
      ${table}
      <p class="stats__note">npm counts every download, including automated ones (CI runs, mirrors and bots), so these
      numbers measure package downloads. They do not establish distinct users or installations.
      The raw numbers, with the time each was read, are in <a href="/stats/adoption.json">adoption.json</a>.</p>
      <h2>Use them</h2>
      <p><a href="/mcp-servers">Install an MCP server</a> · <a href="/developers#quickstart">Get a free API key</a> ·
      <a href="https://github.com/arhancanli/canlicapital">Star the source on GitHub</a> · <a href="/vision">What we are building</a></p>
    </div>
${foot}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (path) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
  writeFileSync(resolve(ROOT, "vision.html"), renderVision({ h2h: read("public/benchmarks/finance-mcp-servers.json"), stats: read(STATS), leaderboard: read("public/datasets/filing-facts/v0/leaderboard.json") }));
  writeFileSync(resolve(ROOT, "stats.html"), renderStats(JSON.parse(readFileSync(resolve(ROOT, STATS), "utf8"))));
  console.log("  /vision and /stats built");
}
