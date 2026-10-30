// Hosted pages describe released contracts; the local paper guide pins private source separately.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import * as validation from '../mcp-released/validation/src/server.mjs';
import * as fundamentals from '../mcp-released/fundamentals/src/server.mjs';
import * as research from '../mcp-released/research/src/server.mjs';
import { renderProductShellFooter, renderProductShellHeader, renderProductShellStylesheet } from './product-shell.mjs';
import { fitDescription } from './lib/descriptions.mjs';
import { sourceDate } from './lib/page-sources.mjs';
import { EXECUTION_ROUTE, executionSource, executionSourceHref } from './lib/execution-workflow.mjs';
import { installButtons, renderFlagship } from './lib/mcp-flagship.mjs';
import { ANSWERS_ROUTE, answerFile, answerRoute, callsOf, checkAnswers, compactJson, firstTable, resultsOf, tableHtml, toolsNamed, toolsOf, withTools } from './lib/mcp-answers.mjs';
import { HOW_ROUTE, howBody, INSTALL_ROUTE, installBody, installClients, navOf, TOOLS_ROUTE, toolsBody } from './lib/mcp-catalog.mjs';
import { TIERS } from '../api/_lib/tiers.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://canlicapital.com';
export const MCP_ROUTE = '/mcp-servers';
const MODULES = { validation, fundamentals, research };
const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const read = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const integer = new Intl.NumberFormat('en-US');
const jsonLd = data => JSON.stringify(data).replaceAll('<', '\\u003c');

export function releasedCatalog() {
  const releases = read('config/mcp-hosted-releases.json').servers;
  const config = read('config/mcp-discovery.json');
  if (config.schema !== 'canli.mcp-discovery.v1' || new Set(config.servers.map(s => s.id)).size !== config.servers.length || config.servers.length !== Object.keys(releases).length) throw new Error('MCP discovery must cover each distinct hosted release exactly once');
  return config.servers.map(server => {
    const release = releases[server.id];
    if (!release || !MODULES[server.id]) throw new Error(`Unknown hosted MCP: ${server.id}`);
    const pkg = read(`mcp-released/${server.id}/package.json`);
    const manifest = read(`mcp-released/${server.id}/RELEASE.json`);
    if (pkg.name !== release.package || pkg.version !== release.version || manifest.commit !== release.commit) throw new Error(`Released MCP metadata disagrees: ${server.id}`);
    const tools = [];
    const module = MODULES[server.id];
    // The public validation endpoint runs under a shared or caller key. Its registration
    // hides get_key, unlike an unkeyed local session. No credential is needed to derive it.
    const session = module.createSession(server.id === 'validation' ? { hosted: { keySource: 'shared' } } : {});
    module.registerTools({ registerTool: (name, metadata) => tools.push({ name, title: metadata.title, description: metadata.description, schema: metadata.inputSchema }) }, session);
    if (!tools.length || new Set(tools.map(t => t.name)).size !== tools.length) throw new Error(`Empty or repeated MCP tools: ${server.id}`);
    const exampleTool = tools.find(tool => tool.name === server.example?.name);
    if (!exampleTool) throw new Error(`MCP example names an unavailable tool: ${server.id}`);
    const schema = exampleTool.schema?._zod ? exampleTool.schema : z.object(exampleTool.schema);
    schema.parse(server.example.arguments);
    const route = `${MCP_ROUTE}/${server.id}`;
    const endpoint = server.id === 'validation' ? '/mcp' : `/mcp/${server.id}`;
    return { ...server, ...release, route, endpoint, tools };
  });
}

function breadcrumbs(route, label) {
  const parts = [['Home', '/'], ['Finance MCP servers', MCP_ROUTE]];
  if (route.startsWith(`${ANSWERS_ROUTE}/`)) parts.push(['Questions it answers', ANSWERS_ROUTE]);
  if (route !== MCP_ROUTE) parts.push([label, route]);
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: parts.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: ORIGIN + path })) };
}
function document({ route, title, description, structured, body, sources = 'mcp_discovery.json', scripts = [] }) {
  const modified = sourceDate(ROOT, route);
  const page = { '@context': 'https://schema.org', '@type': route === MCP_ROUTE ? 'CollectionPage' : 'WebPage', '@id': ORIGIN + route, url: ORIGIN + route, name: title, description, ...(modified ? { dateModified: modified } : {}), publisher: { '@id': ORIGIN + '/#organization' } };
  return `<!doctype html>
<html lang="en" data-page="mcp-discovery"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="${esc(sources)}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<link rel="canonical" href="${ORIGIN}${route}" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}${route}" /><meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" /><meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preload" as="font" href="/fonts/chakra-petch/ChakraPetch-Bold.woff2" type="font/woff2" crossorigin />
<link rel="preload" as="font" href="/fonts/inter/InterVariable.woff2" type="font/woff2" crossorigin />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/developers.css" /><link rel="stylesheet" href="/css/mcp-pages.css" />
<script type="application/ld+json">${jsonLd([page, breadcrumbs(route, title), ...structured])}</script>
</head><body class="dev-page">
<a class="dev-skip skip-link" href="#content">Skip to content</a>
${renderProductShellHeader({ active: 'mcp-servers' })}
<main id="content" tabindex="-1">${body}</main>
${renderProductShellFooter()}
<script type="module" src="/js/main.js"></script>
${scripts.map((src) => `<script type="module" src="${esc(src)}"></script>\n`).join('')}</body></html>\n`;
}
const links = entries => entries.map(({ path, label }) => `<li><a href="${esc(path)}">${esc(label)}</a></li>`).join('\n');
const sourceHref = s => `https://github.com/arhancanli/canlicapital/tree/${s.commit}/${s.dir}`;
const nav = (route, servers) => `<nav class="mcp-breadcrumbs" aria-label="MCP navigation"><a href="${MCP_ROUTE}"${route === MCP_ROUTE ? ' aria-current="page"' : ''}>All MCP servers</a>${servers.map(s => `<a href="${s.route}"${route === s.route ? ' aria-current="page"' : ''}>${esc(s.id)}</a>`).join('')}<a href="${EXECUTION_ROUTE}"${route === EXECUTION_ROUTE ? ' aria-current="page"' : ''}>Local paper workflow</a></nav>`;

export function executionPage(source, servers) {
  const title = 'Paper trading MCP workflow and signed journals';
  const description = 'Plan supplied paper orders, check limits and costs, and verify signed local journals with the private Canli Execution MCP source. No broker connection.';
  const sourceLink = path => executionSourceHref(source, path);
  const launch = { command: 'node', args: ['/absolute/canlicapital/mcp-execution/src/server.mjs'], env: { CANLI_HOME: '/absolute/private-paper-home' } };
  const validationLaunch = { command: 'node', args: ['/absolute/canlicapital/mcp/src/server.mjs'], env: { CANLI_LOCAL: '1' } };
  const validationInput = { record_file: '/absolute/private/export-bundle.json', journal_file: '/absolute/private-paper-home/journal.jsonl' };
  const software = { '@context': 'https://schema.org', '@type': 'SoftwareSourceCode', '@id': `${ORIGIN}${EXECUTION_ROUTE}#source`, name: source.package, description: 'Private, Unreleased local paper-planning and signed-journal source. No broker integration.', codeRepository: `https://github.com/arhancanli/canlicapital/tree/${source.source_commit}/mcp-execution`, programmingLanguage: 'JavaScript', license: 'https://opensource.org/licenses/MIT', author: { '@id': ORIGIN + '/#arhan-canli' } };
  const body = `<section class="dev-hero">${nav(EXECUTION_ROUTE, servers)}
<p class="dev-kicker">Canli Execution / Local repository source / Unreleased</p>
<h1>Paper trading with local MCP tools</h1><p class="dev-lead">Turn your stated budget and limits into proposed orders, check their costs, then keep a signed local record of the paper statements you supply.</p>
<div class="dev-actions"><a class="dev-button dev-button--primary" href="#workflow">Follow the paper workflow</a><a class="dev-button" href="${sourceLink('mcp-execution/src/server.mjs')}" rel="noreferrer">Read the pinned source</a></div>
<p class="dev-hero-note">${source.default_tools.length} local tools. The package is private and Unreleased. This source connects to no broker and places no orders.</p></section>
<nav class="dev-page-index" aria-label="Paper workflow sections"><a href="#workflow">Workflow</a><a href="#setup">Local setup</a><a href="#example">Run the example</a><a href="#tools">Tools</a><a href="#validation">Validate the export</a><a href="#receipts">Receipts and recovery</a><a href="#limits">Evidence limits</a></nav>
<section class="dev-section" id="workflow"><h2>From a proposal to verifiable paper evidence</h2><ol class="mcp-workflow">
<li><strong>Supply the scenario.</strong> State equity, current positions, prices, lot sizes, risk budget and limits. Supply any spreads, liquidity and fee schedule used by the checks. The server fetches no market data for this workflow.</li>
<li><strong>Size the proposed position.</strong> Call <code>size_position</code> with your budget and caps. Read the binding cap, resulting orders and any stated drawdown state. Sizing does not submit an order or run the kill-switch check.</li>
<li><strong>Check every proposed order.</strong> Call <code>check_orders</code> with your market state and limits. Inspect every rejection and <code>checks_skipped</code>, as well as costs that could not be modelled. Your client must stop a rejected or incomplete scenario; the tool does not automatically govern later calls.</li>
<li><strong>Record only supplied statements.</strong> Explicitly enable local journal writes, initialize a signed account with its opening cash and positions, then append supported decisions, checks, paper fills and complete valuations. Fills, prices and fees come from your scenario. A refused proposal creates no fabricated fill.</li>
<li><strong>Verify and recompute.</strong> Use <code>journal</code> with <code>verify</code> to check the full signed chain. Export a supported account/window to recompute returns, turnover, costs and drawdown. Missing fees, incomplete valuations or unresolved reconciliation refuse export.</li>
<li><strong>Bind the evidence to its source.</strong> Start the repository validation stdio server with <code>CANLI_LOCAL=1</code>. Send the complete export bundle via <code>record_file</code> and the original <code>journal_file</code> to <code>validate_paper_evidence</code>. Inspect <code>bindings.checked</code> and <code>all_match</code>. A valid shape without the journal leaves source facts unchecked.</li>
</ol><p>The <a href="${sourceLink('standards/trade-journal/EXPORT.md')}" rel="noreferrer">signed account and export profile</a> defines the required payloads, explicit fees, supported events and sequence-window semantics. The <a href="/standards/paper-evidence">paper evidence standard</a> describes what a record must disclose.</p></section>
<section class="dev-section" id="setup"><h2>Prepare a local MCP session</h2>
<p>Use the <a href="https://github.com/arhancanli/canlicapital/tree/${source.source_commit}/mcp-execution" rel="noreferrer">reviewed repository checkout</a> and its locked execution dependencies. Launch <code>mcp-execution/src/server.mjs</code> through your stdio MCP client. Configure an existing, owned <code>0700</code> home on a supported local POSIX filesystem. Writes additionally need an owned, regular, non-symlink <code>0600</code> Ed25519 PEM file named <code>journal.key</code>, with no extra hard link. Read <a href="${sourceLink('mcp-execution/JOURNAL_STORAGE.md')}" rel="noreferrer">the storage setup</a> before preparing that key.</p>
<pre class="dev-code" role="group" tabindex="0" aria-label="Local stdio client launch settings"><code>${esc(JSON.stringify(launch, null, 2))}</code></pre>
<p>Replace both absolute paths with your local checkout and prepared home. These are client launch settings. Send tool arguments through MCP. Keep signing material out of tool arguments.</p>
<p>Default mode offers <code>head</code>, <code>verify</code> and <code>export</code>; an export may create a private artifact. To enable <code>initialize</code> and <code>append</code> on the existing <code>journal</code> tool, explicitly add <code>CANLI_EXEC_JOURNAL_WRITE=1</code> to the client launch environment. Read <a href="${sourceLink('mcp-execution/JOURNAL_STORAGE.md')}#opt-in-local-mcp-adapter" rel="noreferrer">the local setup and recovery contract</a> before enabling writes. The execution package remains private and Unreleased.</p>
</section>
<section class="dev-section" id="example"><h2>Run the bounded synthetic example</h2>
<p>From the pinned repository root, install the execution package's locked development dependencies and run the delivered example against a fresh, prepared home:</p>
<pre class="dev-code" role="group" tabindex="0" aria-label="Read-only paper-journal example command"><code>npm ci --prefix mcp-execution
node mcp-execution/examples/paper-journal.mjs --home /absolute/private/example-home</code></pre>
<p>This default makes only sizing and order-check calls. When they pass, it returns <code>writes_disabled</code>; it needs no key and creates no journal. After preparing the private signing key, explicitly add <code>--write</code> to the example command to record the supplied scenario.</p>
<p>The fixture opens a flat USD10,000 account, proposes ten <code>SYNTH</code> units from a stated 10% budget at USD100, and supplies a fill at USD100.25, an explicit USD1 fee and a USD101 mark. Those are synthetic statements, not market observations. Your limits or kill switch can cause the example to stop.</p>
<p>A successful write run makes at most ${source.example.max_tool_calls} tool calls. Its nominal stdio window is 30 seconds, reserving five seconds for one close attempt; timers and trusted synchronous work are cooperative. It prints one bounded receipt with the original requests, acknowledged prefix and any pending operation. A process interruption can prevent receipt output, so preserve the local journal and any pending lock for manual review. A normal rerun stops on an existing journal; this example does not automatically recover or resubmit.</p>
<p>Read the <a href="${sourceLink('mcp-execution/EXAMPLES.md')}" rel="noreferrer">complete example and stopping contract</a>, inspect the <a href="${sourceLink(source.example.path)}" rel="noreferrer">pinned runner</a>, or <a href="${sourceLink('mcp-execution/test/paper-journal-example.test.mjs')}" rel="noreferrer">review the finite fault and roundtrip cases</a> before extending the scenario.</p></section>
<section class="dev-section" id="tools"><h2>The four local tools and their inputs</h2><div class="mcp-table"><table class="dev-table" tabindex="0"><caption>Private Canli Execution source at ${source.source_commit.slice(0, 12)}</caption><thead><tr><th scope="col">Tool</th><th scope="col">Use and input limits</th></tr></thead><tbody>
<tr><th scope="row"><code>size_position</code></th><td>Lot-rounded sizing under supplied budgets and caps. It reads the limits file; calls can tighten those limits. <a href="${sourceLink('mcp-execution/src/size-position.mjs')}" rel="noreferrer">Sizing schema and calculation</a>.</td></tr>
<tr><th scope="row"><code>check_orders</code></th><td>Supplied orders, costs, market state, limits and kill switch. Missing checks stay listed; missing commissions stay unmodelled. <a href="${sourceLink('mcp-execution/src/check-orders.mjs')}" rel="noreferrer">Order-check schema and results</a>.</td></tr>
<tr><th scope="row"><code>measure_shortfall</code></th><td>Decompose supplied fills into delay, execution, unfilled opportunity and stated fees. Missing fees leave total cost unknown. <a href="${sourceLink('mcp-execution/src/measure-shortfall.mjs')}" rel="noreferrer">Shortfall schema and calculation</a>.</td></tr>
<tr><th scope="row"><code>journal</code></th><td>Head inspection, full-chain verification and account export. Explicit opt-in adds local initialize/append. <a href="${sourceLink('mcp-execution/src/journal.mjs')}" rel="noreferrer">Read/export schema</a> and <a href="${sourceLink('mcp-execution/src/journal-write.mjs')}" rel="noreferrer">opt-in write schema</a>.</td></tr>
</tbody></table></div><p>The hosted <a href="/mcp-servers/validation">backtest validation server</a>, <a href="/mcp-servers/fundamentals">SEC fundamentals server</a> and <a href="/mcp-servers/research">research server</a> have separate release pins. The local source validation step above is not added to their hosted or npm contracts by this guide.</p></section>
<section class="dev-section" id="validation"><h2>Validate the complete export against its journal</h2>
<p>Install the repository validation package's locked dependencies with <code>npm ci --prefix mcp</code>, then configure a separate local stdio session:</p>
<pre class="dev-code" role="group" tabindex="0" aria-label="Local validation stdio launch settings"><code>${esc(JSON.stringify(validationLaunch, null, 2))}</code></pre>
<p>Keep a private JSON file containing the full export bundle, including its record, signature and financial companions. Send these placeholder paths to <code>validate_paper_evidence</code>, replacing them with that file and the original source journal:</p>
<pre class="dev-code" role="group" tabindex="0" aria-label="Source-bound paper evidence tool arguments"><code>${esc(JSON.stringify(validationInput, null, 2))}</code></pre>
<p><code>CANLI_LOCAL=1</code> is required for files and signatures; they stay on your machine. <code>record_file</code> preserves full-bundle companion checks, while <code>journal_file</code> enables signed-source reconstruction. Inspect <code>conformance_valid</code>, <code>bindings.checked</code>, <code>bindings.all_match</code> and the final <code>valid</code> result. Without the source journal, structural conformance leaves source facts and signatures unchecked.</p>
<p>The <a href="${sourceLink('mcp/src/journal-evidence.mjs')}" rel="noreferrer">local verifier</a> and <a href="${sourceLink('mcp/src/schemas.mjs')}" rel="noreferrer">tool input schema</a> define these repository-only arguments. This source workflow provides no hosted file upload.</p></section>
<section class="dev-section" id="receipts"><h2>Read the receipt and stop on uncertainty</h2>
<p>A successful local write returns operation, request, entry and journal-prefix bindings. Keep its <code>operation_id</code>, <code>request_sha256</code>, <code>entry_head</code>, <code>entry_seq</code>, <code>journal_prefix_sha256</code> and <code>journal_prefix_bytes</code>. A prefix binds the journal through that operation; later appends can change the current head.</p>
<p><code>JOURNAL_STORE_BUSY</code>, <code>JOURNAL_STORE_REFUSED</code> and <code>JOURNAL_STORE_UNCERTAIN</code> are errors with no success receipt. Stop the client workflow and preserve the original request and files for manual review. Do not delete a pending lock based on its age or PID, and do not automatically resubmit. An uncertain write may have left partial or complete files.</p>
<p>An exact retry preserves the original operation ID, timestamp, kind, payload and expected head, including after later appends. Changed contents or a changed expected head conflict. The storage API has no automatic recovery command. <code>head</code> alone does not verify signatures; use <code>verify</code> for integrity.</p>
</section>
<section class="dev-section" id="limits"><h2>What this workflow can establish</h2>
<p>Signatures and replay bind the statements supplied by the key holder. They do not authenticate broker fills, prove an independent timestamp, exclude another journal, establish profitability or qualify capital deployment. The local filesystem contract observes replacements and requests persistence; software checks do not establish power-loss safety or exclude every change between checks by the same OS user.</p>
<p>Market inputs, fees, complete valuations and declared trial counts remain the caller's evidence. Unknown values stay unknown. A statistical or accounting check is not investment advice or a venue quote. Fresh token and latency measurements and the substantial execution release gates remain open.</p>
<p>Source pin: <a href="https://github.com/arhancanli/canlicapital/tree/${source.source_commit}/mcp-execution" rel="noreferrer">commit ${source.source_commit.slice(0, 12)}</a>. The <a href="/glassbox/execution_workflow_source.json">machine-readable source record</a> binds the documented schemas, storage contract and local validation surface. These are reviewed source links, not deployment or indexing evidence.</p>
<ul class="mcp-related">${links([{ path: '/developers#mcp-execution', label: 'Developer setup and repository entry' }, { path: '/tools/execution', label: 'Execution-assumptions cost calculator' }, { path: '/research/topics/execution-and-market-structure', label: 'Execution and market-structure research' }, { path: MCP_ROUTE, label: 'Released finance MCP servers' }])}</ul></section>`;
  return document({ route: EXECUTION_ROUTE, title, description, structured: [software], body, sources: 'execution_workflow_source.json' });
}

export function serverPage(s, servers) {
  const name = s.package;
  const endpoint = ORIGIN + s.endpoint;
  const description = fitDescription(s.summary, [s.purpose]);
  const app = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', '@id': `${ORIGIN}${s.route}#software`, name, description: s.summary, url: ORIGIN + s.route, applicationCategory: 'DeveloperApplication', operatingSystem: 'MCP client supporting Streamable HTTP', softwareVersion: s.version, codeRepository: sourceHref(s), license: 'https://opensource.org/licenses/MIT', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: { '@id': ORIGIN + '/#arhan-canli' } };
  const body = `<section class="dev-hero">${nav(s.route, servers)}
<p class="dev-kicker">${esc(name)} / Hosted ${esc(s.version)}</p>
<h1>${esc(s.heading)}</h1><p class="dev-lead">${esc(s.summary)}</p>
<div class="dev-actions"><a class="dev-button dev-button--primary" href="#connect">Connect this server</a><a class="dev-button" href="${sourceHref(s)}" rel="noreferrer">Read the released source</a></div>
<p class="dev-hero-note">${s.tools.length} tools in the hosted release. MIT source. Hosted and npm versions are distributed separately.</p></section>
<nav class="dev-page-index" aria-label="Page sections"><a href="#purpose">When to use it</a><a href="#connect">Connect</a><a href="#workflow">Workflow</a><a href="#tools">Tools</a><a href="#limits">Evidence limits</a></nav>
<section class="dev-section" id="purpose"><h2>When to use this server</h2><p>${esc(s.purpose)}</p></section>
<section class="dev-section" id="connect"><h2>Connect the hosted server</h2>
<p>Paste this URL into a client that supports MCP over Streamable HTTP:</p><pre class="dev-code" tabindex="0" aria-label="Hosted MCP endpoint"><code>${endpoint}</code></pre>
<p>For Claude Code, register the same endpoint:</p><pre class="dev-code" tabindex="0" aria-label="Claude Code install command"><code>${esc(`claude mcp add --transport http canli-${s.id} ${endpoint}`)}</code></pre>
<p>The tool list below describes hosted version ${esc(s.version)}. The <a href="https://www.npmjs.com/package/${name}" rel="noreferrer">${esc(name)} npm package</a> can have a different version; check its published version and README before using a local install. <a href="/developers#ai-assistant">The developer setup guide</a> covers clients, API keys and local validation.</p>
</section>
<section class="dev-section" id="workflow"><h2>A useful first workflow</h2><ol class="mcp-workflow">${s.workflow.map(step => `<li>${esc(step)}</li>`).join('')}</ol>
<h3>Example tool arguments</h3><p>${esc(s.example_note)}</p><pre class="dev-code" tabindex="0" aria-label="${esc(s.example.name)} example"><code>${esc(JSON.stringify(s.example, null, 2))}</code></pre>
<p>This is a tool name and arguments for your MCP client, not an HTTP request to paste into the endpoint.</p></section>
<section class="dev-section" id="tools"><h2>Tools in the hosted release</h2><div class="mcp-table"><table class="dev-table" tabindex="0"><caption>${esc(name)} ${esc(s.version)} tool reference</caption><thead><tr><th scope="col">Tool</th><th scope="col">Purpose and input scope</th></tr></thead><tbody>${s.tools.map(tool => `<tr><th scope="row"><code>${esc(tool.name)}</code></th><td>${esc(tool.description)}</td></tr>`).join('')}</tbody></table></div></section>
<section class="dev-section" id="limits"><h2>Evidence limits</h2><p>${esc(s.limits)}</p><p>Source for this tool list: <a href="${sourceHref(s)}" rel="noreferrer">released commit ${s.commit.slice(0, 12)}</a> and the <a href="/glassbox/mcp_discovery.json">machine-readable discovery record</a>. The page follows the same release pin as the hosted handler. Future package work is described in the repository and is not added here until the hosted release changes.</p></section>
<section class="dev-section"><h2>Continue with the underlying evidence</h2><ul class="mcp-related">${links(s.related)}</ul><p><a href="${MCP_ROUTE}">Compare the finance MCP servers</a> or <a href="/developers">use the developer API and open repositories</a>.</p></section>`;
  return document({ route: s.route, title: s.title, description, structured: [app], body });
}

// The question pages: config/mcp-answers.json and their recordings (scripts/lib/mcp-answers.mjs).
const toolIndex = () => new Map(read('mcp-canli/src/index.json').tools.map(([name, pack, , title, description]) => [name, { name, pack, title, description }]));
export function loadAnswers() {
  const config = read('config/mcp-answers.json');
  const recorded = new Map();
  for (const a of config.answers) { try { recorded.set(a.slug, read(`public/${answerFile(a)}`)); } catch { /* checkAnswers names it */ } }
  const tools = toolIndex();
  checkAnswers(config, recorded, [...tools.keys()]);
  return config.answers.map((a) => ({ ...a, route: answerRoute(a), recorded: recorded.get(a.slug) }));
}
const answersNav = (route) => `<nav class="mcp-breadcrumbs" aria-label="MCP navigation"><a href="${MCP_ROUTE}">canli-mcp</a><a href="${ANSWERS_ROUTE}"${route === ANSWERS_ROUTE ? ' aria-current="page"' : ''}>Questions it answers</a></nav>`;
// Clips of the views (scripts/record-mcp-videos.mjs): offered only where one was recorded.
const recordedVideos = () => { try { return read('public/videos/canli-mcp/index.json').videos; } catch { return {}; } };
const VIDEO_BASE = '/videos/canli-mcp/';
export function videoObject(v, clip, route) {
  return { '@context': 'https://schema.org', '@type': 'VideoObject', '@id': `${ORIGIN}${route}#video-${v.id}`, name: `canli-mcp: ${v.label}`, description: `${v.does} Recorded from canli-mcp's interactive view in an MCP Apps host.`, thumbnailUrl: `${ORIGIN}${VIDEO_BASE}${clip.poster}`, contentUrl: `${ORIGIN}${VIDEO_BASE}${clip.file}`, uploadDate: `${clip.recorded}T00:00:00+04:00`, duration: `PT${clip.seconds}S`, width: clip.width, height: clip.height, publisher: { '@id': ORIGIN + '/#organization' } };
}
export const videoTag = (v, clip) => `<figure class="mcp-video"><video controls muted playsinline preload="none" poster="${VIDEO_BASE}${esc(clip.poster)}" width="${clip.width}" height="${clip.height}" aria-label="${esc(`canli-mcp: ${v.label}`)}"><source src="${VIDEO_BASE}${esc(clip.file)}" type="video/webm"></video><figcaption>${esc(v.label)}</figcaption></figure>`;

const demoView = (views, id, clip) => {
  const v = views.find((x) => x.id === id);
  if (!v) return '';
  return `<section class="dev-section" id="view"><h2>The same answer as a view</h2><p>In a host that draws MCP Apps, <code>view: true</code> shows the person the whole result and gives the model a summary. ${clip ? 'Watch it, then try it: below the clip is' : 'This is'} canli-mcp's real view, playing a recording.</p>${clip ? videoTag(v, clip) : ''}<div class="mcp-demo" data-mcp-demo><div class="mcp-demo__tabs" role="tablist" aria-label="Views"><button type="button" role="tab" data-demo="${esc(v.id)}" data-prompt="${esc(v.prompt)}" aria-selected="true">${esc(v.label)}</button></div><div class="mcp-demo__frame" role="tabpanel" aria-label="The view"><p class="mcp-demo__loading">The view loads here.</p></div><p class="mcp-demo__facts" aria-live="polite"></p><p class="mcp-demo__said" aria-live="polite" hidden></p></div></section>`;
};

export function answerPage(a, all, { flagship, tools = toolIndex(), videos = recordedVideos() }) {
  const names = [...tools.keys()];
  const r = a.recorded;
  const used = [...new Set([...toolsOf(a.call), ...toolsNamed(a.answer, names)])];
  const results = resultsOf(r);
  const shown = results.map(({ name, result }, i) => {
    const t = firstTable(result);
    const label = results.length > 1 ? `${name}, call ${i + 1}` : name;
    return `${t ? tableHtml(t, `What ${label} returned`) : ''}<details class="mcp-answer__json"${t ? '' : ' open'}><summary>The result ${esc(label)} sent back${t ? ', in full form' : ''}</summary><pre class="dev-code" tabindex="0"><code>${esc(compactJson(result))}</code></pre></details>`;
  }).join('');
  const related = (a.related ?? []).map((slug) => all.find((x) => x.slug === slug)).filter(Boolean);
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', '@id': `${ORIGIN}${a.route}#faq`, mainEntity: [{ '@type': 'Question', name: a.question, acceptedAnswer: { '@type': 'Answer', text: a.answer } }], about: { '@id': `${ORIGIN}${MCP_ROUTE}#canli-mcp` } };
  const body = `<section class="dev-hero">${answersNav(a.route)}<p class="dev-kicker">canli-mcp / ${esc(a.short)}</p><h1>${esc(a.question)}</h1><p class="dev-lead">${withTools(a.answer, names)}</p>
${installButtons(flagship, 'dev-actions')}<p class="dev-hero-note">Free and MIT-licensed. No account and no API key. Or run <code>${esc(flagship.install.claude_code)}</code> in Claude Code.</p></section>
<section class="dev-section" id="ask"><h2>Ask it</h2><blockquote class="mcp-answer__ask"><p>${esc(a.ask)}</p></blockquote><p>The agent finds the tool through canli-mcp's <code>find_tool</code> and runs it through <code>run_tool</code>. This is the call:</p><pre class="dev-code" tabindex="0" aria-label="The run_tool input"><code>${esc(JSON.stringify(a.call, null, 2))}</code></pre></section>
<section class="dev-section" id="result"><h2>What came back</h2><p>Recorded from canli-mcp ${esc(r.version)} on ${esc(r.recorded.slice(0, 10))}, with no API key set. The model read ${integer.format(r.model_chars)} characters.</p>${shown}<p class="flagship-note">Prices, filings and statistics are as the sources published them on that day; run the call again for today's. Nothing here is investment advice.</p></section>
${demoView(flagship.views ?? [], a.demo, videos[a.demo])}
<section class="dev-section" id="tools"><h2>The tools behind the answer</h2><div class="mcp-table"><table class="dev-table" tabindex="0"><caption>From canli-mcp's tool index</caption><thead><tr><th scope="col">Tool</th><th scope="col">Pack</th><th scope="col">What it does</th></tr></thead><tbody>${used.map((n) => tools.get(n)).filter(Boolean).map((t) => `<tr><th scope="row"><code>${esc(t.name)}</code></th><td>${esc(t.pack)}</td><td>${esc(t.description)}</td></tr>`).join('')}</tbody></table></div></section>
<section class="dev-section" id="install"><h2>Add canli-mcp</h2><figure class="flagship-cmd"><figcaption>Claude Code</figcaption><pre tabindex="0"><code>${esc(flagship.install.claude_code)}</code></pre></figure><figure class="flagship-cmd"><figcaption>Cursor, Claude Desktop or any MCP client</figcaption><pre tabindex="0"><code>${esc(flagship.install.json)}</code></pre></figure><figure class="flagship-cmd"><figcaption>claude.ai, ChatGPT or any client that takes a URL</figcaption><pre tabindex="0"><code>${esc(flagship.install.hosted)}</code></pre></figure><p><a href="${MCP_ROUTE}">Everything canli-mcp does</a> · <a href="/benchmarks/finance-mcp-servers">How it compares with other finance MCP servers</a></p></section>
${related.length ? `<section class="dev-section"><h2>Related questions</h2><ul class="mcp-related">${links(related.map((x) => ({ path: x.route, label: x.question })))}</ul></section>` : ''}`;
  const view = (flagship.views ?? []).find((v) => v.id === a.demo);
  const video = view && videos[a.demo] ? [videoObject(view, videos[a.demo], a.route)] : [];
  return document({ route: a.route, title: a.title ?? a.question, description: fitDescription(a.answer), structured: [faq, ...video], body, sources: `${answerFile(a)} demos/canli-mcp/index.json demos/canli-mcp/tools.json`, scripts: a.demo ? ['/js/mcp-demo.js'] : [] });
}

export function answersIndexPage(all, { flagship }) {
  const title = 'Finance questions canli-mcp answers';
  const description = 'Finance questions an AI agent can answer with canli-mcp: prices, SEC filings, options, rates, backtests and more, each with the call it makes and a recorded result.';
  const list = { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: all.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.question, url: ORIGIN + a.route })) };
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: all.map((a) => ({ '@type': 'Question', name: a.question, acceptedAnswer: { '@type': 'Answer', text: a.answer } })) };
  const body = `<section class="dev-hero">${answersNav(ANSWERS_ROUTE)}<p class="dev-kicker">canli-mcp / Questions it answers</p><h1>${esc(title)}</h1><p class="dev-lead">Each page is one question, the call canli-mcp makes to answer it and what came back when we ran it, with no API key.</p>${installButtons(flagship, 'dev-actions')}</section>
<section class="dev-section"><ul class="mcp-answers">${all.map((a) => `<li><h2><a href="${esc(a.route)}">${esc(a.question)}</a></h2><p>${esc(a.answer)}</p></li>`).join('')}</ul><p><a href="${MCP_ROUTE}">Everything canli-mcp does</a></p></section>`;
  return document({ route: ANSWERS_ROUTE, title, description, structured: [list, faq], body, sources: all.map(answerFile).join(' ') });
}

// Every tool, from the index that ships with the release (scripts/lib/mcp-catalog.mjs).
export function toolsPage({ tools, version, flagship, catalog = read('config/mcp-catalog.json') }) {
  const title = 'Every canli-mcp tool';
  const description = `All ${tools.length} canli-mcp tools by pack, with what each does and its arguments: SEC filings, prices, rates, public records, quant analytics, backtests and paper trading.`;
  const list = { '@context': 'https://schema.org', '@type': 'ItemList', numberOfItems: tools.length, itemListElement: tools.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t[0], url: `${ORIGIN}${TOOLS_ROUTE}#${t[0]}` })) };
  const body = toolsBody(tools, flagship.packs, catalog, { nav: navOf(TOOLS_ROUTE, MCP_ROUTE, ANSWERS_ROUTE), version, front: flagship.front });
  return document({ route: TOOLS_ROUTE, title, description, structured: [list], body, sources: 'demos/canli-mcp/tools.json benchmarks/finance-mcp-servers.json', scripts: ['/js/mcp-catalog.js'] });
}
export function howPage({ flagship, testing = read('config/mcp-testing.json') }) {
  const title = 'How canli-mcp works, and how it is tested';
  const description = 'What happens when an AI model asks canli-mcp a question, where the data comes from, how the tools are tested with answers written first, and what they cannot do.';
  const body = howBody({ nav: navOf(HOW_ROUTE, MCP_ROUTE, ANSWERS_ROUTE), flagship, testing, install: installButtons(flagship, 'dev-actions') });
  return document({ route: HOW_ROUTE, title, description, structured: [], body, sources: 'benchmarks/finance-mcp-servers.json benchmarks/mcp-testing.json' });
}
// How to add it, client by client.
export function installPage({ flagship, install = read('config/canli-mcp.json').install }) {
  const title = 'Add canli-mcp to Claude, Cursor or VS Code';
  const description = 'Install the canli-mcp finance MCP server in Claude, Cursor, VS Code, ChatGPT, Codex, Gemini CLI, Windsurf, Cline or Zed. Free, with no API key.';
  const clients = installClients(flagship, install);
  const howTo = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: clients.filter((c) => c.id !== 'other').map((c) => ({ '@type': 'Question', name: `How do I add canli-mcp to ${c.name}?`, acceptedAnswer: { '@type': 'Answer', text: `${c.steps.replace(/<[^>]+>/g, '')} ${c.code}` } })) };
  const body = installBody({ nav: navOf(INSTALL_ROUTE, MCP_ROUTE, ANSWERS_ROUTE), flagship, install, buttons: installButtons(flagship, 'dev-actions'), tested: { clients: 'Claude Code, Codex and Gemini CLI', date: '2026-10-30' } });
  return document({ route: INSTALL_ROUTE, title, description, structured: [howTo], body, sources: 'benchmarks/finance-mcp-servers.json' });
}
// The directory is canli-mcp's page: the flagship first (scripts/lib/mcp-flagship.mjs), then each server on its own.
// The recorded views the page plays (mcp-canli/bench/record-site-demos.mjs); none if they are absent.
const recordedDemos = () => { try { return read('public/demos/canli-mcp/index.json').demos; } catch { return []; } };

export function directoryPage(servers, { h2h = read('public/benchmarks/finance-mcp-servers.json'), npmRows = read('public/stats/adoption.json').npm?.rows ?? [], demos = recordedDemos(), tiers = TIERS, answers = [], videos = recordedVideos() } = {}) {
  const title = 'Finance MCP servers: canli-mcp and the family';
  const f = h2h.flagship;
  const summary = `canli-mcp is one open-source MCP server for SEC filings, company fundamentals, Treasury and FRED data, prices, quant analytics, backtest validation and paper trading: ${f.tools} tools behind ${f.front.length}, with interactive views in the chat.`;
  const list = { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: servers.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.package, url: ORIGIN + s.route })) };
  const app = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', '@id': `${ORIGIN}${MCP_ROUTE}#canli-mcp`, name: f.package, description: summary, url: ORIGIN + MCP_ROUTE, applicationCategory: 'DeveloperApplication', operatingSystem: 'Any MCP client (stdio)', codeRepository: `${f.source.repository}/tree/main/${f.source.path}`, license: 'https://opensource.org/licenses/MIT', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: { '@id': ORIGIN + '/#arhan-canli' } };
  const body = `<section class="dev-hero">${nav(MCP_ROUTE, servers)}<p class="dev-kicker">canli-mcp${f.current ? ` ${esc(f.current.version)}` : ''} / The flagship MCP server</p><h1>canli-mcp: every finance tool an agent needs, drawn in the chat</h1><p class="dev-lead">${esc(summary)} The model sees ${f.front.length} tools; the rest wait behind them, and a chart costs it a summary.</p><div class="dev-actions"><a class="dev-button dev-button--primary" href="#install">Add canli-mcp to your agent</a>${demos.length ? '<a class="dev-button" href="#views">Try the views</a>' : ''}<a class="dev-button" href="#cloud">Hosted plans</a><a class="dev-button" href="/benchmarks/finance-mcp-servers">See the benchmark</a></div><p class="dev-hero-note">canli-mcp loads every Canli Capital server in one process. Each of them also runs on its own, below.</p></section>
${renderFlagship(h2h, { npmRows, hosted: servers, demos, tiers, answers, videos, videoTag })}
<section class="dev-section" id="servers"><p class="eyebrow">Each server on its own</p><h2>Hosted servers, nothing to install</h2><div class="mcp-cards">${servers.map(s => `<article><p class="mcp-count">${s.tools.length} tools / Hosted ${esc(s.version)}</p><h3><a href="${s.route}">${esc(s.title)}</a></h3><p>${esc(s.summary)}</p><p><code>${esc(s.package)}</code></p><a href="${s.route}#connect">Connect ${esc(s.id)}</a></article>`).join('')}</div></section>
<section class="dev-section"><h2>Using them together</h2><p>Start with research to see what has been tried and what failed. Use fundamentals to rebuild what a company had reported by your decision date. Once you have built a strategy's returns, with your own care for costs and look-ahead, use validation to check whether the result could be luck.</p><p>Each answers a different question. Accounting numbers are not returns, a paper can describe a failed test, and no statistic promises future profit.</p></section>
<section class="dev-section"><h2>Source data, datasets and reproduction</h2><ul class="mcp-related">${links([{path:'/companies',label:'SEC company reference and source filings'},{path:'/research/filing-facts-v0',label:'FilingFacts dataset: financial questions with source evidence'},{path:'/annotate',label:'FilingFacts review and annotation workspace'},{path:'/research/null-zoo-v0',label:'Null Zoo research benchmark'},{path:'/standards/paper-evidence',label:'Open paper evidence reporting standard'},{path:'/engineering',label:'ALPHAC, point-in-time lake and backtester repositories'}])}</ul><p>FilingFacts v0 is machine-checked; its review packet does not establish independently adjudicated human gold. The paper evidence standard is a proposal with disclosed implementation and review limits.</p></section>
<section class="dev-section"><h2>Versions, privacy and trading</h2><p>The hosted servers run the released version shown on each card; npm can lag behind it for a short while. Read the setup guide before sending private strategy data anywhere.</p><p>The research and fundamentals servers read public records only. Hosted validation stores a signed receipt of each check under the free-key quotas; the npm server in local mode keeps your returns on your machine. A separate, unreleased <a href="${EXECUTION_ROUTE}">local paper-trading workflow</a> handles position sizing, pre-trade checks and signed trade journals. It connects to no broker. The <a href="/tools/execution">execution-cost calculator</a> is available in the browser. Download the <a href="/glassbox/mcp_discovery.json">discovery record with the hosted release pins and examples</a>.</p></section>`;
  const clips = (f.views ?? []).filter((v) => videos[v.id]).map((v) => videoObject(v, videos[v.id], MCP_ROUTE));
  return document({ route: MCP_ROUTE, title, description: fitDescription(summary), structured: [list, app, ...clips], body, sources: 'mcp_discovery.json benchmarks/finance-mcp-servers.json stats/adoption.json demos/canli-mcp/index.json', scripts: demos.length ? ['/js/mcp-demo.js'] : [] });
}

export function buildMcpPages({ loadExecution = executionSource, write = writeFileSync, makeDir = mkdirSync } = {}) {
  const execution = loadExecution();
  const servers = releasedCatalog();
  const record = { schema: 'canli.mcp-discovery-record.v1', directory: ORIGIN + MCP_ROUTE, servers: servers.map(({ tools, ...s }) => ({ ...s, tool_count: tools.length, tools: tools.map(({ schema, ...tool }) => tool) })), claim_boundary: 'Released hosted contracts and illustrative inputs; no measured adoption, human review, indexing or strategy outcomes.' };
  write(resolve(ROOT, 'public/glassbox/mcp_discovery.json'), JSON.stringify(record, null, 2) + '\n');
  makeDir(resolve(ROOT, 'mcp-servers'), { recursive: true });
  const h2h = read('public/benchmarks/finance-mcp-servers.json');
  const npmRows = read('public/stats/adoption.json').npm?.rows ?? [];
  const answers = loadAnswers();
  // canli-mcp's tool index, published: the answer pages' tool tables cite it, and agents can read it.
  const index = read('mcp-canli/src/index.json');
  write(resolve(ROOT, 'public/demos/canli-mcp/tools.json'), JSON.stringify({ package: 'canli-mcp', version: read('mcp-canli/package.json').version, packs: index.versions, count: index.tools.length, tools: index.tools.map(([name, pack, group, title, description]) => ({ name, pack, group, title, description })) }, null, 1) + '\n');
  write(resolve(ROOT, 'mcp-servers.html'), directoryPage(servers, { h2h, npmRows, answers }));
  makeDir(resolve(ROOT, 'mcp-servers/answers'), { recursive: true });
  const flagship = { ...h2h.flagship, views: read('config/canli-mcp.json').views };
  for (const a of answers) write(resolve(ROOT, `${a.route.slice(1)}.html`), answerPage(a, answers, { flagship }));
  write(resolve(ROOT, `${ANSWERS_ROUTE.slice(1)}.html`), answersIndexPage(answers, { flagship }));
  write(resolve(ROOT, `${TOOLS_ROUTE.slice(1)}.html`), toolsPage({ tools: index.tools, version: read('mcp-canli/package.json').version, flagship }));
  write(resolve(ROOT, `${HOW_ROUTE.slice(1)}.html`), howPage({ flagship }));
  write(resolve(ROOT, `${INSTALL_ROUTE.slice(1)}.html`), installPage({ flagship }));
  write(resolve(ROOT, 'public/benchmarks/mcp-testing.json'), JSON.stringify(read('config/mcp-testing.json'), null, 1) + '\n');
  for (const server of servers) write(resolve(ROOT, `${server.route.slice(1)}.html`), serverPage(server, servers));
  write(resolve(ROOT, `${EXECUTION_ROUTE.slice(1)}.html`), executionPage(execution, servers));
  write(resolve(ROOT, 'public/glassbox/execution_workflow_source.json'), JSON.stringify(execution, null, 2) + '\n');
  return { pages: servers.length + 6 + answers.length, answers: answers.length, hosted_tools: Object.fromEntries(servers.map(s => [s.id, s.tools.length])), private_source_tools: execution.default_tools.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log('MCP discovery:', buildMcpPages());
