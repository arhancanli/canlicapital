// Canonical discovery pages describe the released hosted contracts, never unreleased source.
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://canlicapital.com';
export const MCP_ROUTE = '/mcp-servers';
const MODULES = { validation, fundamentals, research };
const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const read = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
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
    module.registerTools({ registerTool: (name, metadata) => tools.push({ name, title: metadata.title, description: metadata.description, schema: metadata.inputSchema }) }, module.createSession());
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
  if (route !== MCP_ROUTE) parts.push([label, route]);
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: parts.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: ORIGIN + path })) };
}
function document({ route, title, description, structured, body }) {
  const modified = sourceDate(ROOT, route);
  const page = { '@context': 'https://schema.org', '@type': route === MCP_ROUTE ? 'CollectionPage' : 'WebPage', '@id': ORIGIN + route, url: ORIGIN + route, name: title, description, ...(modified ? { dateModified: modified } : {}), publisher: { '@id': ORIGIN + '/#organization' } };
  return `<!doctype html>
<html lang="en" data-page="mcp-discovery"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="mcp_discovery.json" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<link rel="canonical" href="${ORIGIN}${route}" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}${route}" /><meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" /><meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/developers.css" /><link rel="stylesheet" href="/css/mcp-pages.css" />
<script type="application/ld+json">${jsonLd([page, breadcrumbs(route, title), ...structured])}</script>
</head><body class="dev-page">
<a class="dev-skip" href="#content">Skip to content</a>
${renderProductShellHeader({ active: 'developers' })}
<main id="content" tabindex="-1">${body}</main>
${renderProductShellFooter()}
<script type="module" src="/js/main.js"></script>
</body></html>\n`;
}
const links = entries => entries.map(({ path, label }) => `<li><a href="${esc(path)}">${esc(label)}</a></li>`).join('\n');
const sourceHref = s => `https://github.com/arhancanli/canlicapital/tree/${s.commit}/${s.dir}`;
const nav = (route, servers) => `<nav class="mcp-breadcrumbs" aria-label="MCP navigation"><a href="${MCP_ROUTE}"${route === MCP_ROUTE ? ' aria-current="page"' : ''}>All MCP servers</a>${servers.map(s => `<a href="${s.route}"${route === s.route ? ' aria-current="page"' : ''}>${esc(s.id)}</a>`).join('')}</nav>`;

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
<section class="dev-section" id="tools"><h2>Tools in the hosted release</h2><div class="mcp-table"><table class="dev-table"><caption>${esc(name)} ${esc(s.version)} tool reference</caption><thead><tr><th scope="col">Tool</th><th scope="col">Purpose and input scope</th></tr></thead><tbody>${s.tools.map(tool => `<tr><th scope="row"><code>${esc(tool.name)}</code></th><td>${esc(tool.description)}</td></tr>`).join('')}</tbody></table></div></section>
<section class="dev-section" id="limits"><h2>Evidence limits</h2><p>${esc(s.limits)}</p><p>Source for this tool list: <a href="${sourceHref(s)}" rel="noreferrer">released commit ${s.commit.slice(0, 12)}</a> and the <a href="/glassbox/mcp_discovery.json">machine-readable discovery record</a>. The page follows the same release pin as the hosted handler. Future package work is described in the repository and is not added here until the hosted release changes.</p></section>
<section class="dev-section"><h2>Continue with the underlying evidence</h2><ul class="mcp-related">${links(s.related)}</ul><p><a href="${MCP_ROUTE}">Compare the finance MCP servers</a> or <a href="/developers">use the developer API and open repositories</a>.</p></section>`;
  return document({ route: s.route, title: s.title, description, structured: [app], body });
}

export function directoryPage(servers) {
  const title = 'Finance and quant MCP servers';
  const summary = 'Connect AI assistants to backtest validation, point-in-time SEC fundamentals and open quant research. Compare tools, workflows, source code and evidence limits.';
  const list = { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: servers.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.package, url: ORIGIN + s.route })) };
  const body = `<section class="dev-hero">${nav(MCP_ROUTE, servers)}<p class="dev-kicker">Canli Capital / Model Context Protocol</p><h1>Finance MCP servers with inspectable evidence</h1><p class="dev-lead">${esc(summary)}</p><div class="dev-actions"><a class="dev-button dev-button--primary" href="#servers">Choose a server</a><a class="dev-button" href="/developers">API and setup guide</a></div><p class="dev-hero-note">Each server covers a different research task. The directory describes released hosted tools, with source links for every contract.</p></section>
<section class="dev-section" id="servers"><h2>Choose the task you need to answer</h2><div class="mcp-cards">${servers.map(s => `<article><p class="mcp-count">${s.tools.length} tools / Hosted ${esc(s.version)}</p><h3><a href="${s.route}">${esc(s.title)}</a></h3><p>${esc(s.summary)}</p><p><code>${esc(s.package)}</code></p><a href="${s.route}#connect">Connect ${esc(s.id)}</a></article>`).join('')}</div></section>
<section class="dev-section"><h2>Combine the servers in a research workflow</h2><p>Start with the research server to inspect a mechanism, its failed candidates and the declared search history. Use fundamentals to reconstruct the accounting information available by a decision date. After you construct strategy returns with your own causality and cost controls, use validation to assess selection bias, overfitting and record maturity.</p><p>These stages answer different questions. Accounting facts do not become returns automatically, published papers can contain failed experiments, and statistical tests do not certify a strategy's future profitability.</p></section>
<section class="dev-section"><h2>Source data, datasets and reproduction</h2><ul class="mcp-related">${links([{path:'/companies',label:'SEC company reference and source filings'},{path:'/research/filing-facts-v0',label:'FilingFacts dataset: financial questions with source evidence'},{path:'/annotate',label:'FilingFacts review and annotation workspace'},{path:'/research/null-zoo-v0',label:'Null Zoo research benchmark'},{path:'/standards/paper-evidence',label:'Open paper evidence reporting standard'},{path:'/engineering',label:'ALPHAC, point-in-time lake and backtester repositories'}])}</ul><p>FilingFacts v0 is machine-checked; its review packet does not establish independently adjudicated human gold. The paper evidence standard is a proposal with disclosed implementation and review limits.</p></section>
<section class="dev-section"><h2>Release, privacy and execution scope</h2><p>Hosted endpoints import pinned released source. npm distribution can lag those pins, so each server page explains which hosted contract its tool list describes. Read the setup guide before choosing remote or local validation and before sending private strategy inputs.</p><p>The research and fundamentals servers read public records. Remote validation stores reproducible receipts under its free-key quotas. The execution package under development has local planning and journal tools; it is private and unreleased, and this directory does not advertise a hosted trading endpoint or live broker service. The <a href="/tools/execution">execution-cost calculator</a> is available in the browser. Download the <a href="/glassbox/mcp_discovery.json">discovery record with the release pins and examples</a>.</p></section>`;
  return document({ route: MCP_ROUTE, title, description: fitDescription(summary), structured: [list], body });
}

export function buildMcpPages() {
  const servers = releasedCatalog();
  const record = { schema: 'canli.mcp-discovery-record.v1', directory: ORIGIN + MCP_ROUTE, servers: servers.map(({ tools, ...s }) => ({ ...s, tool_count: tools.length, tools: tools.map(({ schema, ...tool }) => tool) })), claim_boundary: 'Released hosted contracts and illustrative inputs; no measured adoption, human review, indexing or strategy outcomes.' };
  writeFileSync(resolve(ROOT, 'public/glassbox/mcp_discovery.json'), JSON.stringify(record, null, 2) + '\n');
  mkdirSync(resolve(ROOT, 'mcp-servers'), { recursive: true });
  writeFileSync(resolve(ROOT, 'mcp-servers.html'), directoryPage(servers));
  for (const server of servers) writeFileSync(resolve(ROOT, `${server.route.slice(1)}.html`), serverPage(server, servers));
  return { pages: servers.length + 1, tools: Object.fromEntries(servers.map(s => [s.id, s.tools.length])) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log('MCP discovery:', buildMcpPages());
