// The /mcp-servers page: canli-mcp, the flagship, and every server it combines.
//
// Every figure is read from published files: the head-to-head benchmark summary
// (public/benchmarks/finance-mcp-servers.json: the flagship's packs, tool counts, search and context measurements,
// and every server's results) and the npm counts the build reads (public/stats/adoption.json). A package that is
// not on npm yet is never offered as an install line without saying so.
import { cursorConfigLink, vscodeInstallLink } from "./mcp-install-links.mjs";

const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const integer = new Intl.NumberFormat("en-US");
const pct = (x) => `${Math.round(x * 100)}%`;
const secs = (x) => (x < 1 ? x.toFixed(2) : x.toFixed(1));
const lower = (label) => label.replace(/^([A-Z])(?=[a-z])/, (m) => m.toLowerCase());

// The servers in the benchmark's order of results: canli-mcp first, then the others best first.
export const fairArms = (h2h) => h2h.arms.filter((a) => !a.tuned).sort((a, b) => b.common.accuracy - a.common.accuracy);
const neverAnswered = (h2h, arm) => h2h.categories.filter((c) => arm.categories[c.id].runs && arm.categories[c.id].correct === 0);
const notRun = (h2h, arm) => h2h.categories.filter((c) => !arm.categories[c.id].runs);

// The released server's context and start-up, as last measured (flagship.current); the benchmark's
// own row when there is no newer measurement.
export function liveContext(h2h) {
  const c = h2h.flagship.current;
  if (c) return { tokens: c.tokens, seconds: c.startup_seconds ?? c.startup_ms / 1000, version: c.version, measured: c.measured, separately: c.separately_tokens };
  const row = h2h.context.rows.find((r) => r.arm === h2h.headline.ours);
  return { tokens: row.tokens, seconds: row.seconds };
}

// How many times fewer characters the model read than the view drew, in a recorded demo.
export const viewRatio = (d) => (d && d.model_chars ? d.view_chars / d.model_chars : null);

export function flagshipFigures(h2h, { demos = [] } = {}) {
  const f = h2h.flagship;
  const ours = h2h.arms.find((a) => a.id === h2h.headline.ours);
  const best = h2h.arms.find((a) => a.id === h2h.headline.best_rival);
  const live = liveContext(h2h);
  const rivals = fairArms(h2h).filter((a) => !a.ours);
  const compare = demos.find((d) => d.id === "compare"), ratio = viewRatio(compare);
  return [
    [integer.format(f.tools), `finance tools, ${f.front.length} in front`],
    [integer.format(live.tokens), live.separately ? `tokens of tools on every request; the seven servers side by side, ${integer.format(live.separately)}` : "tokens of tools on every request"],
    [`${secs(live.seconds)} s`, "from launch to ready"],
    [pct(ours.common.accuracy), `correct on the ${h2h.questions_common} benchmark questions every server finished; the best of the others, ${best.short}, ${pct(best.common.accuracy)}`],
    ratio ? [`${Math.round(ratio)}×`, `fewer characters for the model when five stocks are compared over five years: ${integer.format(compare.model_chars)}, while the view draws ${integer.format(compare.view_chars)}`]
      : [`0 of ${h2h.categories.length}`, `kinds of question never answered; each of the ${rivals.length} other setups missed at least one`],
  ];
}

export function bars(h2h) {
  return `<ol class="flagship-bars" aria-label="Correct answers on the ${h2h.questions_common} questions every server finished">${fairArms(h2h).map((a) => {
    const never = neverAnswered(h2h, a).map((c) => lower(c.label)), unrun = notRun(h2h, a).map((c) => lower(c.label));
    const note = !never.length && !unrun.length ? "answered every kind of question" : [never.length ? `never answered: ${never.join(", ")}` : "", unrun.length ? `not run: ${unrun.join(", ")}` : ""].filter(Boolean).join(" · ");
    return `<li class="flagship-bar${a.ours ? " is-ours" : ""}" style="--v:${a.common.accuracy}"><span class="flagship-bar__name">${esc(a.label)}</span><span class="flagship-bar__track" aria-hidden="true"><i></i></span><span class="flagship-bar__value">${pct(a.common.accuracy)}<small>${a.common.correct} of ${a.common.runs}</small></span><small class="flagship-bar__note">${esc(note)}</small></li>`;
  }).join("")}</ol>`;
}

function kindsTable(h2h) {
  return `<div class="flagship-table" role="region" aria-labelledby="flagship-kinds-caption" tabindex="0"><table><caption id="flagship-kinds-caption">Correct runs by kind of question, every finished run. Red: never answered correctly.</caption>
<thead><tr><th scope="col">Server</th>${h2h.categories.map((c) => `<th scope="col">${esc(c.label)}</th>`).join("")}</tr></thead>
<tbody>${fairArms(h2h).map((a) => `<tr${a.ours ? ' class="is-ours"' : ""}><th scope="row">${esc(a.short)}</th>${h2h.categories.map((c) => {
    const x = a.categories[c.id];
    return x.runs ? `<td class="${x.correct === 0 ? "zero" : x.correct === x.runs ? "full" : "part"}">${x.correct}/${x.runs}</td>` : `<td class="none">not run</td>`;
  }).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function contextTable(h2h) {
  return `<div class="flagship-table" role="region" aria-labelledby="flagship-context-caption" tabindex="0"><table><caption id="flagship-context-caption">What each server costs before the model reads the question: its instructions and tool list, counted with ${esc(h2h.context.tokenizer)} on ${esc(h2h.context.measured)}. No model is called.</caption>
<thead><tr><th scope="col">Server</th><th scope="col">Tools sent</th><th scope="col">Tools it can reach</th><th scope="col">Tokens per request</th><th scope="col">Seconds to start</th></tr></thead>
<tbody>${h2h.context.rows.map((r) => `<tr${r.arm === h2h.headline.ours ? ' class="is-ours"' : ""}><th scope="row">${esc(r.label)}</th><td>${integer.format(r.tools)}</td><td>${integer.format(r.reaches)}</td><td>${integer.format(r.tokens)}</td><td>${secs(r.seconds)}</td></tr>`).join("")}</tbody></table></div>`;
}

// One-click installs of the local server: both open the editor, which asks before adding it.
export function installLinks(f) {
  const [command, ...args] = f.install.npx.split(" ");
  return [["Add to Cursor", cursorConfigLink(f.package, { command, args })], ["Add to VS Code", vscodeInstallLink(f.package, { command, args })]];
}
// In a hero they sit in its actions row (cls "dev-actions"), the row the shared design keeps there.
export const installButtons = (f, cls = "flagship-oneclick") => `<div class="${cls}">${installLinks(f).map(([label, href], i) => `<a class="dev-button${i ? "" : " dev-button--primary"}" href="${esc(href)}" rel="nofollow">${esc(label)}</a>`).join("")}</div>`;

// What a reader can run today: canli-mcp's own lines once it is on npm, and until then each server it combines.
function install(h2h, npm) {
  const f = h2h.flagship;
  const lines = [["Claude Code", f.install.claude_code], ["Cursor, Claude Desktop or any MCP client", f.install.json]];
  if (f.install.hosted) lines.push(["claude.ai, ChatGPT or any client that takes a URL", f.install.hosted]);
  const cmds = lines.map(([where, cmd]) => `<figure class="flagship-cmd"><figcaption>${esc(where)}</figcaption><pre tabindex="0"><code>${esc(cmd)}</code></pre></figure>`).join("");
  const hosted = f.install.hosted_note ? `<p class="flagship-note">${esc(f.install.hosted_note)}</p>` : "";
  if (f.npm_published) return `${installButtons(f)}<div class="flagship-install">${cmds}</div>${hosted}`;
  const live = f.packs.filter((p) => npm.has(p.package));
  return `<div class="flagship-install">${cmds}</div><p class="flagship-note">canli-mcp is being published to npm now, so these lines will work once it is. Until then each server it combines installs on its own:</p>
<ul class="flagship-packages">${live.map((p) => `<li><code>${esc(`claude mcp add ${p.package.replace(/-mcp$/, "")} -- npx -y ${p.package}`)}</code><span>${esc(p.label)}, ${esc(npm.get(p.package).latest_version)} on npm</span></li>`).join("")}</ul>`;
}

// The views, played in the page: the real view in a sandboxed frame, answered from recordings
// (js/mcp-demo.js; public/demos/canli-mcp, written by mcp-canli/bench/record-site-demos.mjs).
function views(f, demos, videos = {}, videoTag = null) {
  const by = new Map(demos.map((d) => [d.id, d]));
  const shown = (f.views ?? []).filter((v) => by.has(v.id));
  if (!shown.length) return "";
  return `<section class="dev-section flagship-section" id="views"><p class="eyebrow">See it in the chat</p><h2>Interactive views, for a summary's tokens</h2><p class="flagship-intro">Add <code>view: true</code> to a <code>run_tool</code> call. In a host that draws MCP Apps, the person gets the whole result as an interactive view and the model reads a short summary. Sorting, ranges, zoom and tooltips cost no tokens at all. This is the real view, playing results recorded from canli-mcp.</p>
<div class="mcp-demo" data-mcp-demo><div class="mcp-demo__tabs" role="tablist" aria-label="Views">${shown.map((v, i) => `<button type="button" role="tab" data-demo="${esc(v.id)}" data-prompt="${esc(v.prompt)}" aria-selected="${i === 0}">${esc(v.label)}</button>`).join("")}</div>
<div class="mcp-demo__frame" role="tabpanel" aria-label="The view"><p class="mcp-demo__loading">The view loads here.</p><noscript><p class="mcp-demo__loading">The demo needs JavaScript; the views themselves run in your MCP host.</p></noscript></div>
<p class="mcp-demo__facts" aria-live="polite"></p><p class="mcp-demo__said" aria-live="polite" hidden></p></div>
${videoTag && shown.some((v) => videos[v.id]) ? `<h3>Short clips</h3><div class="flagship-clips">${shown.filter((v) => videos[v.id]).map((v) => videoTag(v, videos[v.id])).join("")}</div>` : ""}
<ul class="flagship-views">${shown.map((v) => `<li><h3>${esc(v.label)}</h3><p>${esc(v.does)}</p><p class="flagship-views__ratio">${integer.format(by.get(v.id).model_chars)} characters for the model, ${integer.format(by.get(v.id).view_chars)} drawn · prompt <code>${esc(v.prompt)}</code></p></li>`).join("")}</ul>
<p class="flagship-note">The view runs in the host's sandbox and sends nothing anywhere. A control that needs new data asks the host to run a tool, which the host may ask you to allow. This page plays recordings; the backtest's sliders rerun the quant pack's own code in your browser, and a control whose answer was not recorded says so.</p></section>`;
}

function firms(f) {
  if (!f.firms?.length) return "";
  return `<section class="dev-section flagship-section" id="firms"><p class="eyebrow">For firms</p><h2>Rules, a signed record and nothing sent home</h2><ul class="flagship-firms">${f.firms.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>`;
}

// canli-mcp Cloud: the hosted server and its plans. The limits are api/_lib/tiers.js, the object the
// hosted server enforces, so the page cannot promise more than the service gives.
const PLANS = [
  ["free", "Free", "Open now", "No key and no account."],
  ["pro", "Pro", "Opens with billing", "A key of your own."],
  ["team", "Team", "Opens with billing", "A key for a team's heavier use."],
  ["enterprise", "Enterprise", "Opens with billing", "The highest limits."],
];
function cloud(f, tiers) {
  if (!f.install.hosted || !tiers) return "";
  const mb = (b) => `${integer.format(Math.round(b / 1_048_576))} MB`;
  return `<section class="dev-section flagship-section" id="cloud"><p class="eyebrow">canli-mcp Cloud</p><h2>Hosted, nothing to install</h2><p class="flagship-intro">Add <code>${esc(f.install.hosted)}</code> as a connector in claude.ai, ChatGPT or any client that takes a URL. It runs the released canli-mcp with the quant, validation, fundamentals, research, backtest and markets packs, and keeps nothing between requests.</p>
<ul class="flagship-plans">${PLANS.filter(([id]) => tiers[id]).map(([id, name, status, line]) => `<li class="flagship-plan${id === "free" ? " is-open" : ""}" data-tier="${id}"><p class="flagship-plan__status">${esc(status)}</p><h3>${esc(name)}</h3><p class="flagship-plan__rate"><b>${integer.format(tiers[id].requests_per_minute)}</b> calls a minute</p><p>Requests up to ${mb(tiers[id].max_body_bytes)}. ${esc(line)}</p></li>`).join("")}</ul>
<p class="flagship-note">These are the limits the hosted server enforces. Paid plans open when billing goes live, and their prices come with them; a key is sent as <code>Authorization: Bearer</code>. ${esc(f.install.hosted_note.replace(/^Hosted, no install: [^.]+\. /, ""))} The local server stays free and MIT-licensed, limited only by your machine and the sources.</p></section>`;
}

// The question pages (/mcp-servers/answers): each a finance question and the call that answers it.
function asked(answers) {
  if (!answers.length) return "";
  return `<section class="dev-section flagship-section" id="answers"><p class="eyebrow">Questions it answers</p><h2>Ask in plain words</h2><p class="flagship-intro">Each page shows the question, the call canli-mcp makes and what came back when we ran it, with no API key.</p><ul class="flagship-answers">${answers.map((a) => `<li><a href="${esc(a.route)}">${esc(a.question)}</a></li>`).join("")}</ul><p><a href="/mcp-servers/answers">Every question</a></p></section>`;
}

export function renderFlagship(h2h, { npmRows = [], hosted = [], demos = [], tiers = null, answers = [], videos = {}, videoTag = null } = {}) {
  const f = h2h.flagship;
  const npm = new Map(npmRows.map((r) => [r.name, r]));
  const hostedBy = new Map(hosted.map((s) => [s.package, s]));
  const caveat = `${h2h.status === "interim" ? "Interim result" : "Result"} of ${h2h.captured}: ${h2h.setup.model}, ${h2h.setup.runs_per_question} runs per question, no API keys for any server. We wrote the questions, in areas our servers were built for, and what the others do well beyond them, such as news and options, is not scored.`;
  return `<section class="flagship-figures" aria-label="canli-mcp in figures"><ul>${flagshipFigures(h2h, { demos }).map(([value, label]) => `<li><b>${esc(value)}</b><span>${esc(label)}</span></li>`).join("")}</ul></section>
${views(f, demos, videos, videoTag)}
<section class="dev-section flagship-section" id="does"><p class="eyebrow">What it does</p><h2>Seven packs, one process</h2><p class="flagship-intro">Each pack is also its own server, on npm and in the open. canli-mcp loads them together, so an agent reaches all ${integer.format(f.tools)} tools through one connection${f.current?.prompts ? `, with ${integer.format(f.current.prompts)} ready-made prompts` : ""}.</p>
<p><a href="/mcp-servers/tools">See every tool, what it does and its arguments</a>. <a href="/mcp-servers/how-it-works">How it works and how it is tested</a>.</p>
<ul class="flagship-packs">${f.packs.map((p) => {
    const row = npm.get(p.package), host = hostedBy.get(p.package);
    return `<li data-pack="${esc(p.id)}"><b class="flagship-packs__n">${p.tools}</b><h3>${esc(p.label)}</h3><p>${esc(p.covers)}</p><p class="flagship-packs__pkg"><a href="https://www.npmjs.com/package/${esc(p.package)}" rel="noreferrer"><code>${esc(p.package)}</code></a>${row ? ` ${esc(row.latest_version)}` : ""}${host ? ` · <a href="${esc(host.route)}">hosted server</a>` : ""}</p></li>`;
  }).join("")}</ul></section>
<section class="dev-section flagship-section" id="front"><p class="eyebrow">How an agent uses it</p><h2>${integer.format(f.front.length)} tools in front of ${integer.format(f.tools)}</h2><p class="flagship-intro">The model is shown ${integer.format(f.front.length)} tools instead of hundreds: three that search for any tool, read its arguments and run it, and the two it asks for most. The rest never enter its context.</p>
<ol class="flagship-doors">${f.front.map((t) => `<li><code>${esc(t.name)}</code><span>${esc(t.does)}</span></li>`).join("")}</ol>
<ul class="flagship-facts">
<li><b>${f.search.first} in ${f.search.requests}</b><span>times the right tool came first when asked for in plain words; in the top three, ${f.search.top_three} in ${f.search.requests}</span></li>
<li><b>${integer.format(f.file_reference.tokens)} tokens</b><span>to pass ${integer.format(f.file_reference.prices)} prices as a file, instead of ${integer.format(f.file_reference.pasted_tokens)} pasted, and no number can be dropped on the way</span></li>
<li><b>${integer.format(f.batch.tokens)} tokens</b><span>of tool input to label ${integer.format(f.file_reference.prices)} prices and weight the labels in one round trip, against ${integer.format(f.batch.chained_tokens)} when the model copies the labels across</span></li>
</ul></section>
${firms(f)}
${cloud(f, tiers)}
<section class="dev-section flagship-section" id="gap"><p class="eyebrow">How it compares</p><h2>Same model, same questions. Only the server changed.</h2><p class="flagship-intro">${f.benchmarked ? `The benchmark ran canli-mcp with ${integer.format(f.benchmarked.tools)} tools behind ${f.benchmarked.front}. ` : ""}On the ${h2h.questions_common} questions every server finished, canli-mcp answered ${pct(h2h.headline.ours_common.accuracy)} correctly and the best of the other open-source setups ${pct(h2h.headline.best_rival_common.accuracy)}. Every other setup left at least one kind of question unanswered.</p>
${bars(h2h)}
<h3>By kind of question</h3>${kindsTable(h2h)}
<h3>What each costs before the question</h3>${contextTable(h2h)}
<p class="flagship-note">${esc(caveat)} <a href="/benchmarks/finance-mcp-servers">Every run, the method and the caveats</a>.</p></section>
${asked(answers)}
<section class="dev-section flagship-section" id="install"><p class="eyebrow">Install</p><h2>Add it in one line</h2><p class="flagship-intro">Free and MIT-licensed. It needs Node.js ${esc(String(f.node_minimum))} or later and no account; the quant and validation tools run on your machine.</p>${install(h2h, npm)}</section>`;
}

// The benchmark page's opening figures: the gap in accuracy, cost and coverage, each against the others' best.
export function benchmarkFigures(h2h) {
  const ours = h2h.arms.find((a) => a.id === h2h.headline.ours);
  const best = h2h.arms.find((a) => a.id === h2h.headline.best_rival);
  const rivals = fairArms(h2h).filter((a) => !a.ours);
  const oursCtx = h2h.context.rows.find((r) => r.arm === ours.id);
  const others = h2h.context.rows.filter((r) => r.arm !== ours.id).map((r) => r.tokens).sort((a, b) => a - b);
  const zeros = rivals.map((a) => neverAnswered(h2h, a).length).sort((a, b) => a - b);
  const perCorrect = rivals.map((a) => a.common.input_tokens_per_correct_answer).sort((a, b) => a - b);
  return [
    [pct(ours.common.accuracy), `correct on the ${h2h.questions_common} questions every server finished; the best of the others, ${best.short}, ${pct(best.common.accuracy)}`],
    [integer.format(ours.common.input_tokens_per_correct_answer), `input tokens per correct answer; the others ${integer.format(perCorrect[0])} to ${integer.format(perCorrect.at(-1))}`],
    [integer.format(oursCtx.tokens), `tokens of tools on every request; the others ${integer.format(others[0])} to ${integer.format(others.at(-1))}`],
    [`0 of ${h2h.categories.length}`, `kinds of question never answered; the others ${zeros[0]} to ${zeros.at(-1)}`],
    [`${h2h.headline.rivals_beaten_on_common} of ${h2h.headline.rivals}`, "other setups scored lower on the shared questions"],
  ];
}
