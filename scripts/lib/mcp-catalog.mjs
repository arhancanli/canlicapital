// Two pages that explain canli-mcp in full. /mcp-servers/tools lists every tool from its own index, so
// the list cannot drift from the release; /mcp-servers/how-it-works says what happens on a question,
// where the data comes from, how it is tested (failures included) and what it cannot do.
const esc = (s) => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const number = new Intl.NumberFormat("en-US");

export const TOOLS_ROUTE = "/mcp-servers/tools";
export const HOW_ROUTE = "/mcp-servers/how-it-works";
export const INSTALL_ROUTE = "/mcp-servers/install";

export const navOf = (route, mcpRoute, answersRoute) => `<nav class="mcp-breadcrumbs" aria-label="MCP navigation">${[[mcpRoute, "canli-mcp"], [INSTALL_ROUTE, "Install"], [TOOLS_ROUTE, "Every tool"], [HOW_ROUTE, "How it works"], [answersRoute, "Questions it answers"]].map(([href, label]) => `<a href="${href}"${route === href ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>`;

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Each pack's tools under its headings. Index rows: name, pack, toolset, title, description, keywords, arguments.
export function groupTools(tools, packs, catalog) {
  const byMarkets = new Map(Object.entries(catalog.markets_groups).flatMap(([group, names]) => names.map((name) => [name, group])));
  const order = Object.keys(catalog.markets_groups);
  return packs.map((pack) => {
    const own = tools.filter((t) => t[1] === pack.id);
    const groups = new Map();
    for (const t of own) {
      const label = pack.id === "markets" ? byMarkets.get(t[0]) ?? "Other" : pack.id === "quant" ? catalog.toolsets[t[2]] ?? "Other" : null;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(t);
    }
    const rank = (label) => { const i = order.indexOf(label); return i < 0 ? order.length : i; };
    const sorted = [...groups].sort(([a], [b]) => (pack.id === "markets" ? rank(a) - rank(b) : 0));
    return { ...pack, count: own.length, groups: sorted.map(([label, list]) => ({ label, tools: list })) };
  });
}

const toolItem = (t, heading) => {
  const [name, , , title, description, keywords, args] = t;
  return `<li id="${esc(name)}" data-search="${esc(`${name} ${title} ${description} ${keywords}`.toLowerCase())}"><${heading}><code>${esc(name)}</code><span>${esc(title)}</span></${heading}><p>${esc(description)}</p>${args ? `<p class="mcp-tool__args">Arguments: <code>${esc(args)}</code></p>` : ""}</li>`;
};
// A long pack folds by theme; a short one is listed open.
const groupHtml = (p, g) => (g.label
  ? `<details class="mcp-tools__group" id="${esc(`${p.id}-${slug(g.label)}`)}"><summary><h3>${esc(g.label)}</h3><span>${number.format(g.tools.length)}</span></summary><ul class="mcp-tools__list">${g.tools.map((t) => toolItem(t, "h4")).join("")}</ul></details>`
  : `<div class="mcp-tools__group-open"><ul class="mcp-tools__list">${g.tools.map((t) => toolItem(t, "h3")).join("")}</ul></div>`);

export function toolsBody(tools, packs, catalog, { nav, version, front }) {
  const grouped = groupTools(tools, packs, catalog);
  return `<section class="dev-hero">${nav}<p class="dev-kicker">canli-mcp ${esc(version)} / Every tool</p><h1>Every canli-mcp tool</h1><p class="dev-lead">${number.format(tools.length)} finance tools in ${grouped.length} packs, listed from the index that ships with this release. You do not pick from this list: the model is shown ${number.format(front.length)} tools, searches the rest with <code>find_tool</code> and runs what it finds. This page is for seeing what is there.</p>
<div class="mcp-tools__filter" hidden><label for="mcp-tool-filter">Filter the tools</label><input id="mcp-tool-filter" type="search" placeholder="Try dividends, ISIN, recall or Sharpe" autocomplete="off" /><p id="mcp-tool-count" role="status"></p></div></section>
<section class="dev-section" aria-label="Packs"><ul class="mcp-tools__packs">${grouped.map((p) => `<li><a href="#pack-${esc(p.id)}"><b>${number.format(p.count)}</b><span>${esc(p.label)}</span></a><p>${esc(p.covers)}</p></li>`).join("")}</ul></section>
${grouped.map((p) => `<section class="dev-section mcp-tools__pack" id="pack-${esc(p.id)}"><p class="eyebrow">${number.format(p.count)} tools</p><h2>${esc(p.label)}</h2><p><a href="https://www.npmjs.com/package/${esc(p.package)}" rel="noreferrer"><code>${esc(p.package)}</code></a>, also its own server.</p>${p.groups.map((g) => groupHtml(p, g)).join("")}</section>`).join("\n")}`;
}

export function howBody({ nav, flagship, testing, install }) {
  const f = flagship, c = f.current ?? {};
  const a = testing.analyst;
  return `<section class="dev-hero">${nav}<p class="dev-kicker">canli-mcp / How it works</p><h1>How canli-mcp works, and how it is tested</h1><p class="dev-lead">canli-mcp is one program that runs on your machine and gives an AI model finance tools. The model asks it for what it needs, it reads the public source or does the sum, and every answer says where it came from.</p>${install}</section>
<section class="dev-section" id="question"><p class="eyebrow">On a question</p><h2>What happens when you ask</h2><ol class="mcp-how__steps">
<li><b>The model sees a short list.</b> ${number.format(f.front.length)} tools instead of ${number.format(f.tools)}, which costs ${number.format(c.tokens)} tokens of context on each request. All ${number.format(f.tools)} listed side by side across the seven servers would cost ${number.format(c.separately_tokens)}.</li>
<li><b>It searches.</b> <code>find_tool</code> takes plain words, such as "who owns this company", and returns the tools that fit. <code>describe_tool</code> gives one tool's arguments.</li>
<li><b>It runs them.</b> <code>run_tool</code> runs one tool or up to 25 at once, on your machine. Calculations stay there. A data tool sends only the company, series or symbol you asked about, to the source named below.</li>
<li><b>It gets an answer it can check.</b> Figures come with the filing, sentence or table row they were read from, and a hash of the document received, so anyone can fetch it again and compare.</li>
<li><b>You can see it.</b> Where the app supports it, the result opens as a chart or table you can use in the chat, and the model reads a summary of it.</li></ol></section>
<section class="dev-section" id="sources"><p class="eyebrow">The data</p><h2>Where the numbers come from</h2><p>From the body that publishes them, with no key and no account: the SEC for filings, insiders and funds; the Treasury, the Fed, FRED, the ECB, the Bank of England, Japan's Ministry of Finance and the Bank of Canada for rates; the World Bank, the OECD and the BIS for the world economy; the FDIC for banks; the CFPB, the FDA, NHTSA, the Treasury's sanctions office and the Federal Register for public records; Cboe for delayed options data; Yahoo Finance for prices. Prices and options are not the original exchange feed.</p><p>The local server fetches from these sources directly. The exceptions are point-in-time SEC fundamentals and the research record, which come from copies published on canlicapital.com; those requests carry the company, measure or search words, never your own data. The hosted connector at <code>${esc(f.install?.hosted ?? "")}</code> runs the public-data and computing tools for people who cannot install anything; <a href="/privacy">the privacy policy</a> says what it sees.</p></section>
<section class="dev-section" id="refusals"><p class="eyebrow">Being wrong out loud</p><h2>It refuses instead of guessing</h2><ul class="mcp-related"><li>In the public-record tools, a name matches only when every word of it is in the record, so "Newell Brands" never returns a different Newell.</li><li>An ISIN, CUSIP or LEI with a wrong check digit is refused before any request is sent.</li><li>A question with a false premise, such as a year a company did not report, gets a refusal and the reason, not a figure.</li><li><code>verify_claims</code> sets a draft's numbers against the filing and says which are confirmed, which are contradicted and what the wrong one matches.</li></ul></section>
<section class="dev-section" id="testing"><p class="eyebrow">Testing</p><h2>How it is tested, failures included</h2><p>The test that finds real problems is a new one. So each round takes releases the tools have never seen, writes down the right answers from the text first, and only then runs the tools. The first score stays on the record. As of ${esc(testing.measured)}, on ${esc(testing.package)}, the ${number.format(a.total)} analyst questions all pass. ${esc(a.note)}</p>
<div class="mcp-table"><table class="dev-table" tabindex="0"><caption>Analyst questions by set: the first run and the score after fixes</caption><thead><tr><th scope="col">Set</th><th scope="col">What it is</th><th scope="col">First run</th><th scope="col">After fixes</th></tr></thead><tbody>${a.sets.map((s) => `<tr><th scope="row">${esc(s.set)}</th><td>${esc(s.what)}</td><td>${esc(s.first_run)}</td><td>${s.after ? esc(s.after) : "No fixes needed"}</td></tr>`).join("")}</tbody></table></div>
<p>A score on a set that has already led to fixes no longer says much about new questions, which is why the next set is written first. Other checks: a cross-check of ${number.format(testing.global_crosscheck.passed)} figures. ${esc(testing.global_crosscheck.what)} A live check of the data tools runs every night, so a source that changes its format shows up the next morning. Before a release, a sweep sends hostile arguments to the tools. Against other servers, the <a href="/benchmarks/finance-mcp-servers">head-to-head benchmark</a> gives the same model the same questions; we wrote those questions, so its page lists the caveats, and an outside benchmark is still to come.</p>
<h3>What testing has caught</h3><ul class="mcp-related">${testing.found_by_testing.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
<section class="dev-section" id="limits"><p class="eyebrow">Limits</p><h2>What it cannot do</h2><ul class="mcp-related"><li>It gives no analyst estimates or price targets, and no corporate bond prices: no public source offers them without a key.</li><li>Earnings dates ahead are estimates from a company's past dates, and are labelled so.</li><li>It reads what companies and agencies published. If a filing is wrong, so is the figure, and a parser can misread an unusual table, so the quote beside a figure is the authority.</li><li>A sanctions search is not a compliance screening, and complaint counts are not adjusted for a company's size.</li><li>It places no real orders. Trading tools work on a paper account only, and it does not give investment advice.</li></ul><p><a href="${TOOLS_ROUTE}">See every tool</a> or <a href="/mcp-servers/answers">the questions it answers</a>.</p></section>`;
}

// Each client's own way to add the server. A client's config file differs only in where it lives and,
// for VS Code and Zed, its top-level key. plugin.repo, once public, adds the plugin lines.
export function installClients(f, install) {
  const entry = { command: "npx", args: ["-y", f.package] };
  const servers = JSON.stringify({ mcpServers: { canli: entry } }, null, 2);
  const hosted = install.hosted;
  const repo = install.plugin_repo;
  return [
    { id: "claude", name: "Claude (web, desktop and mobile)", steps: "In Claude, open the connector settings and add a custom connector with this URL. Nothing to install. Prices and files need the local server.", code: hosted },
    { id: "claude-code", name: "Claude Code", steps: repo ? "As a plugin, with two skills, or as a server alone:" : "In a terminal:", code: [repo ? `/plugin install canli-mcp --marketplace ${repo}` : null, install.claude_code].filter(Boolean).join("\n") },
    { id: "claude-desktop", name: "Claude Desktop, with the local server", steps: "Add this to <code>claude_desktop_config.json</code> (Settings, Developer, Edit Config), then restart Claude.", code: servers },
    { id: "cursor", name: "Cursor", steps: "Use the Add to Cursor button at the top of this page, or add this to <code>~/.cursor/mcp.json</code>.", code: servers },
    { id: "vscode", name: "VS Code", steps: "Use the Add to VS Code button at the top of this page, or run:", code: `code --add-mcp '${JSON.stringify({ name: "canli", ...entry })}'` },
    { id: "chatgpt", name: "ChatGPT", steps: "In ChatGPT's settings, turn on developer mode for apps and add a custom app with this URL, where your plan allows it. Prices and files need the local server.", code: hosted },
    { id: "codex", name: "Codex", steps: repo ? "As a plugin, or as a server alone:" : "In a terminal:", code: [repo ? `codex plugin marketplace add ${repo}` : null, `codex mcp add canli -- npx -y ${f.package}`].filter(Boolean).join("\n") },
    { id: "gemini", name: "Gemini CLI", steps: repo ? "As an extension, or as a server alone:" : "In a terminal:", code: [repo ? `gemini extensions install https://github.com/${repo}` : null, `gemini mcp add canli npx -y ${f.package}`].filter(Boolean).join("\n") },
    { id: "windsurf", name: "Windsurf", steps: "Add this to <code>~/.codeium/windsurf/mcp_config.json</code>.", code: servers },
    { id: "cline", name: "Cline", steps: "In Cline's MCP Servers panel, choose Configure and add this to <code>cline_mcp_settings.json</code>.", code: servers },
    { id: "zed", name: "Zed", steps: "Add this to your <code>settings.json</code>.", code: JSON.stringify({ context_servers: { canli: entry } }, null, 2) },
    { id: "other", name: "Any other MCP client", steps: "Most take this form. A client that takes only a URL can use the hosted server.", code: `${servers}\n\n${hosted}` },
  ];
}

export function installBody({ nav, flagship, install, buttons, tested }) {
  const clients = installClients(flagship, install);
  return `<section class="dev-hero">${nav}<p class="dev-kicker">canli-mcp / Install</p><h1>Add canli-mcp to your AI client</h1><p class="dev-lead">Finance tools for Claude, Cursor, VS Code, ChatGPT and any other MCP client. Free and MIT-licensed, with no account and no API key. The local server needs Node.js ${esc(String(flagship.node_minimum))} or later.</p>${buttons}</section>
<section class="dev-section" aria-label="Clients"><ul class="mcp-install__jump">${clients.map((c) => `<li><a href="#${esc(c.id)}">${esc(c.name)}</a></li>`).join("")}</ul></section>
<section class="dev-section" id="which"><h2>Local or hosted</h2><p>The local server runs on your machine and has every tool. Your files, returns and prices stay there. The hosted server needs no install and runs the public-data and computing tools; it has no prices, file arguments or paper trading, and takes a limited number of requests a minute. <a href="/privacy">The privacy policy</a> says what each one sends and keeps.</p></section>
${clients.map((c) => `<section class="dev-section mcp-install__client" id="${esc(c.id)}"><h2>${esc(c.name)}</h2><p>${c.steps}</p><figure class="flagship-cmd"><pre tabindex="0"><code>${esc(c.code)}</code></pre></figure></section>`).join("\n")}
<section class="dev-section" id="next"><h2>Then ask it something</h2><p>Try "What did Apple report for revenue over the last five years, as first reported?" or "Show me the Treasury yield curve against a year ago." See <a href="/mcp-servers/answers">the questions it answers</a>, <a href="${TOOLS_ROUTE}">every tool</a> and <a href="${HOW_ROUTE}">how it works</a>.</p><p class="flagship-note">We ran the commands for ${esc(tested.clients)} on ${esc(tested.date)}. The other clients' steps follow their own documentation, which can change.</p></section>`;
}
