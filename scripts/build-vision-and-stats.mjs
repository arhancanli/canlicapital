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
import { liveContext } from "./lib/mcp-flagship.mjs";
import { OUT as STATS } from "./build-adoption-stats.mjs";
import { clearDocument, crumbs, proof, receipt } from "./lib/clear-page.mjs";

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
    goal: "Finance tools for AI agents: primary-source data and quant tools behind one MCP server, for as few tokens as possible, measured on tests other people wrote.",
    today: (f) => [
      `canli-mcp puts ${f.tools} tools behind ${f.front}: SEC filings, fundamentals, Treasury and FRED data, prices, quant analytics, backtest validation and paper trading, in ${f.tokens} tokens of context.`,
      `${f.onNpm} servers of the family are on npm, and canli-mcp and three of them are also hosted at canlicapital.com/mcp.`,
      `In the open benchmark, canli-mcp answered ${f.ours} of the questions every server finished; the best of the other open servers, ${f.best}.`],
    next: "The independent test on public expert questions (Vals.ai's finance set and FinanceBench) against the strongest open servers, then canli-mcp's first major version, more servers in the family and a paid tier for developers.",
    links: [["/mcp-servers", "canli-mcp and the servers"], ["/benchmarks/finance-mcp-servers", "The benchmark"]] },
  { id: "data", n: "02", name: "Data and annotation", status: ["next", "Started"],
    goal: "Financial datasets to train and test AI models, computed from public filings and checked by qualified people. The aim is expert annotation that experts in finance trust.",
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
    goal: "The destination all five branches feed: funds run from the US, under US rules, once licensing, a legal entity and a forward record allow it.",
    today: () => [
      "A public paper-traded record, not funded, with every position, decision and broker reconciliation published.",
      "canli-paper-trading-mcp places Alpaca paper orders behind pre-trade checks and a kill switch."],
    next: "Real capital only after licensing, a legal entity and a forward record that justifies it. Nothing here is investment advice or an offer.",
    links: [["/record", "The paper record"], ["/progress", "Corrections"]] },
];

// canli-mcp's next releases (owner, 6 Nov: live data, "a lab with millions of strategies and sleeves that will power
// the tools", "our own finance models for all people", features nobody has; docs/goal/MCP_NEXT_20261106.md). Each is
// labelled with what exists; nothing here is live until it is.
export const NEXT = [
  ["Live data you connect", "Building, November 2026", "Prices that update by themselves in your assistant: crypto from the exchanges' public feeds with no key, stocks through your own data key. On your own computer, under each provider's terms."],
  ["Tests for forecasts and crashes", "Building, November 2026", "Whether one forecast really beats another, and thousands of synthetic crashes built from free daily data, to test a strategy against markets that have not happened yet."],
  ["Your data stays yours", "Building, November 2026", "Run the maths on data you already pay for, on your own machine. Nothing is stored or sent."],
  ["The Lab: a million strategies", "Planned, December 2026", "A library of a million strategies built from free data, every one counted. Ask whether your strategy is new, how it compares with the closest of the million, and whether it survives the luck of the search."],
  ["Canli models for everyone", "Planned, from December 2026", "Open models anyone can use: factors, default risk, a nowcast of the economy, the range a company's own filings imply for its value, and the odds of an earnings surprise. Each is judged only on a public record that starts the day it launches, and none is advice."],
  ["Checks no tool does yet", "Planned", "Whether a strategy is original, a reader that finds look-ahead and overfitting in a backtest, an alert when a company you follow restates or changes auditor, and the chain from any number back to the line it came from."],
];

// The next months, then the long road (owner's order: tools first, the funds later). Goals, not dates already met.
export const NEAR = [
  ["November 2026", "Live data and new tests in canli-mcp", "Live prices you connect, the forecast test and the crash generator, and your own data kept on your machine."],
  ["December 2026", "The Lab, Canli Books and the challenge", "The first release of Canli Books, the Lab's library of strategies, Canli Report's first check, and the pilot season of the challenge."],
  ["Early 2027", "Canli Close and the first models", "Bank reconciliation and month-end close on Canli Books, and Canli models with their first months of public record."],
  ["Spring 2027", "Canli Audit", "Journal-entry tests, Benford's law and restatement risk for auditors and audit committees."],
];
export const ROAD = [
  ["Mid-2027", "Tools developers pay for", "Finance MCP servers measured on independent tests; the first paid developer tier; the sleeve library opening to developers; ALPHAC adding new, uncorrelated families with a year of forward record."],
  ["2027", "The research platform", "The training environment and testing servers, the expert annotation network, and ALPHAC across asset classes with far more independent bets."],
  ["2028", "Groundwork for the funds", "The US company, counsel and compliance, and a real-money track record through the legal path, before any fund opens."],
];

const pct = (x) => `${Math.round(x * 100)}%`;

export function visionFigures({ h2h, stats, leaderboard }) {
  const ours = h2h.arms.find((a) => a.id === h2h.headline.ours);
  const best = h2h.arms.find((a) => a.id === h2h.headline.best_rival);
  const ctx = liveContext(h2h);
  const row = leaderboard.rows.find((r) => r.mcp && r.model === "gpt-5-mini") ?? leaderboard.rows.find((r) => r.mcp);
  const npm = stats.npm?.rows ?? [];
  return { tools: number(h2h.flagship.tools), front: h2h.flagship.front.length, tokens: number(ctx.tokens), onNpm: npm.length,
    ours: pct(ours.common.accuracy), best: pct(best.common.accuracy), closedModel: row.model, closed: pct(row.closed.accuracy), mcp: pct(row.mcp.accuracy),
    month: stats.npm?.downloads_last_month_all_packages ?? null };
}

// The product lines (owner's plan, 2026-11-03: docs/goal/COMPANIES_PLAN_20261103.md). Each starts as a product line under
// the Canli Capital name and becomes its own company once it has paying customers; its status says what exists.
export const LINES = [
  ["Canli Markets", "live", "Live", "What this site is today: the claim checker, company data, canli-mcp and the research."],
  ["Canli Data", "live", "Live", "Open datasets built from public filings, such as FilingFacts, to test and train AI models."],
  ["Canli Research and the Lab", "live", "Live", "Research that keeps its failures, and a library of strategy sleeves developers can build on."],
  ["Canli Books", "dev", "In development", "An open-source ledger that AI agents and apps can keep books in: every entry balances, a posted entry never changes and every balance traces to its entries. The first release is planned for December 2026."],
  ["Canli Report", "plan", "Planned, from December 2026", "A free check of a filing's tagged numbers before it goes in, built on the errors found in real filings; later, the tagged statements themselves."],
  ["Canli Close", "plan", "Planned, early 2027", "Bank reconciliation and month-end close on Canli Books, with QuickBooks and Xero imports."],
  ["Canli Audit", "plan", "Planned, spring 2027", "Analytics for auditors and audit committees: journal-entry tests, Benford's law and restatement risk. Analytics only; audit opinions need licensed auditors."],
  ["Canli Treasury and Planning", "plan", "Planned, mid-2027", "Cash forecasts, budgets and scenarios straight from the books."],
  ["ALPHAC", "paper", "Paper only", "The open-source engine that combines many weakly related strategies. A public paper record, not funded."],
  ["The funds", "later", "Later", "Funds run from the US, only after licensing, a legal entity and a forward record that justifies them."],
];
export const NEVER = ["Investment advice, or telling anyone what to buy or sell.", "Holding or moving anyone's money.", "Audit opinions or tax advice.", "Filing on anyone's behalf.", "Keeping a company's books on our servers before hosting has had its security work."];

export function renderVision({ h2h, stats, leaderboard, fresh }) {
  const route = "/vision";
  const title = "What Canli Capital is building";
  const description = "Canli Capital builds free tools that check financial numbers against their source: canli-mcp and the claim checker today, tools for companies and funds later.";
  const f = visionFigures({ h2h, stats, leaderboard });
  const week = fresh.weeks[0], tooled = week.runs.find((r) => r.with);
  const schema = [ORGANIZATION, { "@context": "https://schema.org", "@type": "AboutPage", name: title, description, url: `${ORIGIN}${route}`, about: { "@id": `${ORIGIN}/#organization` } }];
  const trail = VISION_TRAIL.map(([name, href]) => [name === "Canli Capital" ? "Home" : name, href]);
  const chip = (tone, text) => `<span class="cl-status cl-status--${tone}">${esc(text)}</span>`;
  const body = `<section class="cl-hero">
<div>
${crumbs(trail)}
<p class="cl-kicker">The vision</p>
<h1>Every financial number, with its source.</h1>
<p class="cl-lede">Canli Capital builds free, open tools that read the numbers companies publish and check them, for people deciding about their money and for the AI assistants that now help them. It starts with checking. It grows into tools for the companies that make the numbers, and later into funds.</p>
<div class="cl-actions"><a class="cl-button" href="#lines">See every product line</a><a class="cl-quiet" href="/mcp-servers">Start with canli-mcp</a></div>
</div>
${receipt({
    head: "Where it stands",
    question: "What exists, what is being built and what is still a plan",
    rows: [["Live", "Checker, company data, canli-mcp"], ["In development", "Canli Books"], ["Planned", "Report, Close, Audit, Planning"], ["Later", "Funds, after licensing"]],
    stamp: "Plans labelled as plans", right: true,
    caption: "Every figure on this page is read from a published file; a goal stays labelled as a goal.",
  })}
</section>
${proof([
    [f.tools, "finance tools in canli-mcp, free and open source"],
    [String(f.onNpm), "servers of the family on npm"],
    ...(f.month === null ? [] : [[number(f.month), "npm downloads in the last 30 days"]]),
    [`${tooled.correct} of ${tooled.questions}`, "questions about last week's filings answered right with canli-mcp"],
  ], "Where it stands today")}
<section class="cl-section" id="who"><p class="cl-eyebrow">Who it is for</p><h2>Three kinds of people, one rule: show the source</h2>
<ul class="cl-grid">
<li class="cl-card"><h3>People deciding about their money</h3><p>Check a number you heard against what the company filed, read a company's figures in plain words, and learn to read the reports yourself. Free, and never advice.</p><a class="cl-more" href="/">Check a number</a></li>
<li class="cl-card"><h3>People building with AI</h3><p>canli-mcp gives AI assistants SEC filings, market and economic data and ${esc(f.tools)} finance tools, each answer naming its source.</p><a class="cl-more" href="/mcp-servers">Add canli-mcp</a></li>
<li class="cl-card"><h3>Researchers and quants</h3><p>Tests that tell skill from luck, open datasets, and every trial published, including the ones that failed.</p><a class="cl-more" href="/research">The research</a></li>
</ul></section>
<div class="cl-band"><section class="cl-section" id="lines"><p class="cl-eyebrow">The product lines</p><h2>From the numbers investors read to the books companies keep</h2>
<p class="cl-intro">Each starts as a product line under the Canli Capital name and becomes its own company once it has paying customers. The label on each says what exists today.</p>
<ul class="cl-grid">${LINES.map(([name, tone, status, text]) => `<li class="cl-card">${chip(tone, status)}<h3>${esc(name)}</h3><p>${esc(text)}</p></li>`).join("")}</ul></section></div>
<section class="cl-section" id="fit"><p class="cl-eyebrow">How they fit</p><h2>One engine underneath</h2>
<p class="cl-intro">Every number keeps its source and every check is recorded, in each product. A figure recorded in Books is closed in Close, filed through Report, tested by Audit, planned in Planning and read by investors in Markets, so each new product starts mostly built.</p></section>
<div class="cl-band"><section class="cl-section" id="next"><p class="cl-eyebrow">The next releases</p><h2>canli-mcp next: live data, a lab of a million strategies, our own models</h2>
<p class="cl-intro">Planned in this order. Each ships tested, names its sources, and stays labelled as building or planned until it is live.</p>
<ul class="cl-grid">${NEXT.map(([name, status, text]) => `<li class="cl-card">${chip(/^Building/.test(status) ? "dev" : "plan", status)}<h3>${esc(name)}</h3><p>${esc(text)}</p></li>`).join("")}</ul></section></div>
<section class="cl-section" id="branches"><p class="cl-eyebrow">The research side</p><h2>Five branches, one destination</h2>
<p class="cl-intro">What each part is for, what exists today and what comes next.</p>
<ul class="cl-grid">${PARTS.map((p) => `<li class="cl-card">${chip(p.status[0] === "live" ? "live" : "plan", p.status[1])}<h3>${esc(p.name)}</h3><p>${esc(p.goal)}</p><p><strong>Today.</strong> ${p.today(f).map(esc).join(" ")}</p><p><strong>Next.</strong> ${esc(p.next)}</p><a class="cl-more" href="${esc(p.links[0][0])}">${esc(p.links[0][1])}</a></li>`).join("")}</ul></section>
<div class="cl-band"><section class="cl-section" id="challenge"><p class="cl-eyebrow">For students and investors</p><h2>A challenge judged on data nobody has seen</h2>
<p class="cl-intro">A public challenge where strategies run on data held back from everyone, with every entry's luck counted, and professors invited as judges. The pilot season is planned for December 2026; the rules come before it opens.</p></section></div>
<section class="cl-section" id="road"><p class="cl-eyebrow">The road</p><h2>The next months, then the long road</h2>
<p class="cl-intro">Goals with the month they are aimed at. A date that slips is shown as slipped, not quietly moved.</p>
<ol class="cl-steps">${[...NEAR, ...ROAD].map(([when, name, what]) => `<li><p class="cl-count">${esc(when)}</p><h3>${esc(name)}</h3><p>${esc(what)}</p></li>`).join("")}</ol></section>
<section class="cl-section" id="never"><p class="cl-eyebrow">Lines we do not cross</p><h2>What Canli Capital will not do</h2>
<ul class="cl-never">${NEVER.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
<p class="cl-note">Targets stay targets until they are measured. Nothing here is investment advice or an offer. <a href="/progress">Corrections</a> · <a href="/founder">Who builds it</a> · <a href="/stats">Usage</a></p></section>`;
  return clearDocument({ route, title, description, body, active: "vision", page: "vision", trail, structured: schema, sources: "benchmarks/finance-mcp-servers.json stats/adoption.json datasets/filing-facts/v0/leaderboard.json benchmarks/fresh-filings.json" });
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
  writeFileSync(resolve(ROOT, "vision.html"), renderVision({ h2h: read("public/benchmarks/finance-mcp-servers.json"), stats: read(STATS), leaderboard: read("public/datasets/filing-facts/v0/leaderboard.json"), fresh: read("public/benchmarks/fresh-filings.json") }));
  writeFileSync(resolve(ROOT, "stats.html"), renderStats(JSON.parse(readFileSync(resolve(ROOT, STATS), "utf8"))));
  console.log("  /vision and /stats built");
}
