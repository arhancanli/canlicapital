// The homepage film, chapters 1 to 11: the problem, the solution, the vision, the flagship and the gap.
// Chapter 0 (the opening, with the definition the answer engines read) is authored in index.html.
// Every figure here is read from a published file: the FilingFacts leaderboard and the head-to-head
// summary (public/benchmarks/finance-mcp-servers.json). js/home-film.js plays the film behind the words
// from the same numbers, which it reads from the #film-data block this module writes.

const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const integer = new Intl.NumberFormat("en-US");
const pct = (x) => `${Math.round(x * 100)}%`;
const secs = (x) => (x < 1 ? x.toFixed(2) : x.toFixed(1));
const longDate = (iso) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

// Rivals in the order the gap chapter shows them: best first.
function fairArms(h2h) {
  return h2h.arms.filter((a) => !a.tuned).sort((a, b) => b.common.accuracy - a.common.accuracy);
}

export function filmData(h2h, leaderboard) {
  const closed = leaderboard.rows.find((r) => r.model === "gpt-5.4-mini")?.closed;
  const openbb = h2h.context.rows.find((r) => r.arm === "openbb" && r.tools === r.reaches);
  return {
    rain: { questions: closed.items, given: closed.numbers_given, wrong: closed.numbers_wrong },
    tangle: { tools: openbb.tools, tokens: openbb.tokens },
    core: { front: h2h.flagship.front.length, packs: h2h.flagship.packs.map((p) => ({ id: p.id, tools: p.tools })) },
    gap: {
      categories: h2h.categories.map((c) => c.id),
      arms: fairArms(h2h).map((a) => ({ id: a.id, label: a.label, ours: a.ours, accuracy: a.common.accuracy,
        categories: h2h.categories.map((c) => (a.categories[c.id].runs ? a.categories[c.id].correct / a.categories[c.id].runs : -1)) })),
    },
  };
}

function chapter(n, label, inner, cls = "") {
  return `<section class="chapter${cls ? ` ${cls}` : ""}" id="ch-${n}" data-chapter="${n}" aria-labelledby="ch-${n}-h"><div class="wrap chapter-inner">
<p class="kicker"><span class="ch-n">${String(n).padStart(2, "0")}</span>${esc(label)}</p>
${inner}
</div></section>`;
}

function install(flagship) {
  const lines = [
    ["Claude Code", flagship.install.claude_code],
    ["Cursor, Claude Desktop or any MCP client", flagship.install.json],
  ];
  const note = flagship.npm_published
    ? ""
    : `<p class="film-note">canli-mcp is being published to npm now. Until it is, each server it combines installs on its own from <a href="/mcp-servers">the MCP servers page</a>.</p>`;
  return `<div class="install">${lines.map(([where, cmd]) => `<figure class="cmd"><figcaption>${esc(where)}</figcaption><pre tabindex="0"><code>${esc(cmd)}</code></pre></figure>`).join("")}</div>${note}`;
}

export function renderHomeFilm(h2h, leaderboard) {
  const data = filmData(h2h, leaderboard);
  const closed = leaderboard.rows.find((r) => r.model === "gpt-5.4-mini").closed;
  const withMcp = leaderboard.rows.find((r) => r.model === "gpt-5-mini");
  const ctx = (arm, all = true) => h2h.context.rows.find((r) => r.arm === arm && (all ? r.tools === r.reaches || arm === h2h.headline.ours : r.tools !== r.reaches));
  const ours = h2h.arms.find((a) => a.id === h2h.headline.ours);
  const best = h2h.arms.find((a) => a.id === h2h.headline.best_rival);
  const fair = fairArms(h2h);
  const rivals = fair.filter((a) => !a.ours);
  const oursCtx = ctx(ours.id), openbb = ctx("openbb"), discovery = ctx("openbb", false);
  const zeroCats = h2h.categories.filter((c) => rivals.some((a) => a.categories[c.id].runs && a.categories[c.id].correct === 0)).map((c) => c.label.replace(/^([A-Z])(?=[a-z])/, (m) => m.toLowerCase()));
  const listing = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`);
  const f = h2h.flagship;
  const ex = f.example;
  const tokenRange = rivals.map((a) => a.common.input_tokens_per_correct_answer).sort((a, b) => a - b);
  const rivalsWithZero = rivals.filter((a) => a.categories_scored_zero > 0).length;

  const bars = fair.map((a) => `<li class="bar${a.ours ? " is-ours" : ""}" style="--v:${a.common.accuracy}"><span class="bar__name">${esc(a.label)}</span><span class="bar__track" aria-hidden="true"><i></i></span><span class="bar__value">${pct(a.common.accuracy)}<small>${a.common.correct} of ${a.common.runs}</small></span></li>`).join("");
  const grid = `<div class="gap-grid cc-table-scroll" role="region" aria-labelledby="gap-grid-caption" tabindex="0"><table>
<caption id="gap-grid-caption">Correct runs by kind of question, every finished run. Red: never answered correctly.</caption>
<thead><tr><th scope="col">Server</th>${h2h.categories.map((c) => `<th scope="col">${esc(c.label)}</th>`).join("")}</tr></thead>
<tbody>${fair.map((a) => `<tr${a.ours ? ' class="is-ours"' : ""}><th scope="row">${esc(a.short)}</th>${h2h.categories.map((c) => {
    const x = a.categories[c.id];
    return x.runs ? `<td class="${x.correct === 0 ? "zero" : x.correct === x.runs ? "full" : "part"}">${x.correct}/${x.runs}</td>` : `<td class="none">not run</td>`;
  }).join("")}</tr>`).join("")}</tbody></table></div>`;

  const chapters = [
    chapter(1, "The problem", `<h2 id="ch-1-h">Ask a model for a company's numbers, and it guesses.</h2>
<p class="big">We asked AI models ${closed.items} questions about what companies reported to the SEC, with no tools. GPT-5.4 mini gave ${closed.numbers_given} numbers. ${pct(closed.numbers_wrong)} of them were wrong.</p>
<p>The wrong numbers read exactly like right ones. Nothing in the answer tells you which is which.</p>
<ul class="stats" aria-label="FilingFacts, closed book"><li><b>${closed.numbers_given}</b><span>numbers given</span></li><li class="red"><b>${pct(closed.numbers_wrong)}</b><span>of them wrong</span></li><li><b>${closed.items}</b><span>questions</span></li></ul>
<p class="links"><a href="/benchmarks/filingfacts">FilingFacts, our open benchmark of SEC filing questions</a></p>`),

    chapter(2, "The tools", `<h2 id="ch-2-h">The open tools hand the model a haystack.</h2>
<p class="big">OpenBB's MCP server lists ${integer.format(openbb.tools)} tools. Sent in full, they cost ${integer.format(openbb.tokens)} tokens on every request, before the model reads the question.</p>
<p>And in our benchmark, every other server missed at least one kind of question entirely: ${esc(listing(zeroCats))}.</p>
<ul class="stats" aria-label="What the other servers cost"><li class="red"><b>${integer.format(openbb.tools)}</b><span>tools in one list</span></li><li class="red"><b>${integer.format(openbb.tokens)}</b><span>tokens per request</span></li><li><b>${rivalsWithZero} of ${rivals.length}</b><span>left a kind of question at zero</span></li></ul>`),

    chapter(3, "The solution", `<h2 id="ch-3-h" class="display">One server between the model and <span class="accent">the market.</span></h2>
<p class="lede">canli-mcp shows the model ${f.front.length} tools and keeps ${integer.format(f.tools)} behind them. The model searches for what it needs, reads that tool's arguments and runs it. The data comes from where it was first published: SEC filings, the Treasury's yield curve and FRED.</p>
<ol class="doors">${f.front.map((t) => `<li><code>${esc(t.name)}</code><span>${esc(t.does)}</span></li>`).join("")}</ol>
<p>Give a model the filings and the numbers change. With a Canli MCP server reading them, ${esc(withMcp.model)} answered ${pct(withMcp.mcp.accuracy)} of the FilingFacts questions correctly, against ${pct(withMcp.closed.accuracy)} on its own.</p>`, "turn"),

    chapter(4, "The receipt", `<h2 id="ch-4-h">An answer you can trace to the page it came from.</h2>
<p class="big">Ask for NVIDIA's head count. canli-mcp opens the latest 10-K, finds the line and returns it with the filing's accession number, its link and a SHA-256 hash of each document it read.</p>
<figure class="receipt" aria-label="A real canli-mcp result">
<figcaption><span>${esc(ex.tool)}</span><span class="tag">Real call, ${esc(longDate(ex.ran))}</span></figcaption>
<dl>
<div><dt>asked</dt><dd>${esc(ex.ticker)} · ${esc(ex.form)} · find "${esc(ex.arguments.find)}"</dd></div>
<div><dt>filed</dt><dd><time datetime="${esc(ex.filed)}">${esc(ex.filed)}</time></dd></div>
<div><dt>accession</dt><dd>${esc(ex.accession)}</dd></div>
<div><dt>found</dt><dd>"${esc(ex.match)}"</dd></div>
<div><dt>source</dt><dd><a href="${esc(ex.url)}" rel="noreferrer">${esc(ex.url.replace(/^https:\/\/www\./, ""))}</a></dd></div>
<div><dt>evidence</dt><dd>${ex.evidence_documents} documents, SHA-256 each · ${esc(ex.evidence_sha256_16)}…</dd></div>
<div><dt>time</dt><dd>${ex.milliseconds} ms</dd></div>
</dl>
</figure>`, "free"),

    chapter(5, "The vision", `<h2 id="ch-5-h">Picture every AI agent in finance <span class="accent">working from checked numbers.</span></h2>
<p class="big">Agents will research, test and trade at machine speed. Canli Capital is building what they stand on, in the open, in four parts.</p>
<ol class="pillars">
<li><b>Context</b><span>MCP servers that give agents primary-source data and quant tools for few tokens.</span><em class="chip chip-live">Live</em></li>
<li><b>Testing</b><span>An engine that counts every trial, so a lucky backtest is called luck.</span><em class="chip chip-live">Live</em></li>
<li><b>Data</b><span>Financial datasets to train and test models, starting with FilingFacts. Expert labels come next.</span><em class="chip chip-next">Started</em></li>
<li><b>Execution</b><span>Agents trading real capital under hard limits. Paper only until there is a licensed entity to do it.</span><em class="chip chip-next">Paper only</em></li>
</ol>
<p class="links"><a href="/vision">Read the full vision</a></p>`, "free"),

    chapter(6, "The flagship", `<h2 id="ch-6-h" class="display">canli-mcp</h2>
<p class="lede">Every Canli Capital server in one process. ${f.front.length} tools in front, ${integer.format(f.tools)} behind them, ${integer.format(oursCtx.tokens)} tokens of context, ready in ${secs(oursCtx.seconds)} seconds.</p>
<ul class="packs" aria-label="The packs canli-mcp loads">${f.packs.map((p) => `<li data-pack="${esc(p.id)}"><b>${esc(p.label)}</b><span class="n">${p.tools}</span><span>${esc(p.covers)}</span></li>`).join("")}</ul>
<p>Ask for a tool in plain words and the right one comes first ${f.search.first} times in ${f.search.requests}. Pass a file instead of pasting data, and ${integer.format(f.file_reference.prices)} prices cost ${f.file_reference.tokens} tokens instead of ${integer.format(f.file_reference.pasted_tokens)}.</p>
${install(f)}`, "free"),

    chapter(7, "The gap", `<h2 id="ch-7-h">Same model. Same questions. <span class="accent">Only the server changed.</span></h2>
<p class="big">On the ${h2h.questions_common} questions every server finished, ${esc(ours.label)} answered ${pct(ours.common.accuracy)} correctly. The best of the others, ${esc(best.label)}, answered ${pct(best.common.accuracy)}.</p>
<ol class="bars" aria-label="Correct answers on the ${h2h.questions_common} shared questions">${bars}</ol>
${grid}
<p>It also needed fewer tokens: ${integer.format(ours.common.input_tokens_per_correct_answer)} input tokens per correct answer, against ${integer.format(tokenRange[0])} to ${integer.format(tokenRange.at(-1))} for the others. And it sends the model ${integer.format(oursCtx.tokens)} tokens of tools, where OpenBB's tool-discovery mode sends ${integer.format(discovery.tokens)} and takes ${secs(discovery.seconds)} seconds to start.</p>
<p class="film-note">${esc(h2h.status === "interim" ? "Interim result" : "Result")} of ${esc(longDate(h2h.captured))}: ${esc(h2h.setup.model)}, ${h2h.setup.runs_per_question} runs per question, no API keys for any server. We wrote the questions, in areas our servers were built for, and what the others do well beyond them, such as news and options, is not scored.</p>
<p class="links"><a href="/benchmarks/finance-mcp-servers">Every run, the method and the caveats</a></p>`, "free"),

    chapter(8, "In the open", `<h2 id="ch-8-h">We hold our own strategies to the same standard.</h2>
<p class="big">ALPHAC, Canli Capital's trading engine, runs its strategies on paper and publishes every position, decision and broker reconciliation, hourly. Its backtests face the same tests canli-mcp ships, such as the deflated Sharpe ratio, and the trials that failed stay on the record.</p>
<p class="links"><a href="/record">The record</a><a href="/research">Research</a><a href="/trials">Every trial</a><a href="/progress">Corrections</a></p>`),

    chapter(9, "Company data", `<h2 id="ch-9-h">US public companies, each figure traced to its filing.</h2>
<p class="big">Look up what a company reported, with every figure linked to the SEC filing it came from. An agent can ask for a value as it stood on a past date, with later restatements flagged.</p>
<p class="links"><a href="/companies">Browse companies</a><a href="/datasets/filing-facts">Financial datasets</a></p>`),

    chapter(10, "The builder", `<h2 id="ch-10-h">Built by Arhan Canli.</h2>
<p class="big">Founder and quantitative researcher, in Dubai, building since July 2024. Canli Capital began as an open lab for testing trading strategies honestly and grew into the tools AI agents need to work the same way.</p>
<p>The site keeps the tools' rule. Every figure on it traces to a published file, and corrections stay visible.</p>
<p class="links"><a href="/founder">About the founder</a><a href="https://github.com/arhancanli/canlicapital" rel="noreferrer">Source on GitHub</a></p>`),

    chapter(11, "Start", `<h2 id="ch-11-h" class="display">Give your agent <span class="accent">the market.</span></h2>
<p class="lede">canli-mcp is free and open source under the MIT license. Add it to Claude Code, Cursor or any MCP client in one line.</p>
${install(f)}
<p class="links"><a href="/developers">Developer guide</a><a href="/mcp-servers">All MCP servers</a><a href="/benchmarks/finance-mcp-servers">The benchmark</a></p>`, "finale"),
  ];
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return `${chapters.join("\n")}\n<script type="application/json" id="film-data">${json}</script>`;
}
