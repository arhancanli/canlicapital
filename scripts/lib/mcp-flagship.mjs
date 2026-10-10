// The /mcp-servers page: canli-mcp, the flagship, and every server it combines.
//
// Every figure is read from published files: the head-to-head benchmark summary
// (public/benchmarks/finance-mcp-servers.json: the flagship's packs, tool counts, search and context measurements,
// and every server's results) and the npm counts the build reads (public/stats/adoption.json). A package that is
// not on npm yet is never offered as an install line without saying so.

const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const integer = new Intl.NumberFormat("en-US");
const pct = (x) => `${Math.round(x * 100)}%`;
const secs = (x) => (x < 1 ? x.toFixed(2) : x.toFixed(1));
const lower = (label) => label.replace(/^([A-Z])(?=[a-z])/, (m) => m.toLowerCase());

// The servers in the benchmark's order of results: canli-mcp first, then the others best first.
export const fairArms = (h2h) => h2h.arms.filter((a) => !a.tuned).sort((a, b) => b.common.accuracy - a.common.accuracy);
const neverAnswered = (h2h, arm) => h2h.categories.filter((c) => arm.categories[c.id].runs && arm.categories[c.id].correct === 0);
const notRun = (h2h, arm) => h2h.categories.filter((c) => !arm.categories[c.id].runs);

export function flagshipFigures(h2h) {
  const f = h2h.flagship;
  const ours = h2h.arms.find((a) => a.id === h2h.headline.ours);
  const best = h2h.arms.find((a) => a.id === h2h.headline.best_rival);
  const ctx = h2h.context.rows.find((r) => r.arm === ours.id);
  const rivals = fairArms(h2h).filter((a) => !a.ours);
  return [
    [integer.format(f.tools), "finance tools, behind three in front"],
    [integer.format(ctx.tokens), "tokens of tools on every request"],
    [`${secs(ctx.seconds)} s`, "from launch to ready"],
    [pct(ours.common.accuracy), `correct on the ${h2h.questions_common} questions every server finished; the best of the others, ${best.short}, ${pct(best.common.accuracy)}`],
    [`0 of ${h2h.categories.length}`, `kinds of question never answered; each of the ${rivals.length} other setups missed at least one`],
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

// What a reader can run today: canli-mcp's own lines once it is on npm, and until then each server it combines.
function install(h2h, npm) {
  const f = h2h.flagship;
  const lines = [["Claude Code", f.install.claude_code], ["Cursor, Claude Desktop or any MCP client", f.install.json]];
  const cmds = lines.map(([where, cmd]) => `<figure class="flagship-cmd"><figcaption>${esc(where)}</figcaption><pre tabindex="0"><code>${esc(cmd)}</code></pre></figure>`).join("");
  if (f.npm_published) return `<div class="flagship-install">${cmds}</div>`;
  const live = f.packs.filter((p) => npm.has(p.package));
  return `<div class="flagship-install">${cmds}</div><p class="flagship-note">canli-mcp is being published to npm now, so these lines will work once it is. Until then each server it combines installs on its own:</p>
<ul class="flagship-packages">${live.map((p) => `<li><code>${esc(`claude mcp add ${p.package.replace(/-mcp$/, "")} -- npx -y ${p.package}`)}</code><span>${esc(p.label)}, ${esc(npm.get(p.package).latest_version)} on npm</span></li>`).join("")}</ul>`;
}

export function renderFlagship(h2h, { npmRows = [], hosted = [] } = {}) {
  const f = h2h.flagship;
  const npm = new Map(npmRows.map((r) => [r.name, r]));
  const hostedBy = new Map(hosted.map((s) => [s.package, s]));
  const caveat = `${h2h.status === "interim" ? "Interim result" : "Result"} of ${h2h.captured}: ${h2h.setup.model}, ${h2h.setup.runs_per_question} runs per question, no API keys for any server. We wrote the questions, in areas our servers were built for, and what the others do well beyond them, such as news and options, is not scored.`;
  return `<section class="flagship-figures" aria-label="canli-mcp in figures"><ul>${flagshipFigures(h2h).map(([value, label]) => `<li><b>${esc(value)}</b><span>${esc(label)}</span></li>`).join("")}</ul></section>
<section class="dev-section flagship-section" id="does"><p class="eyebrow">What it does</p><h2>Seven packs, one process</h2><p class="flagship-intro">Each pack is also its own server, on npm and in the open. canli-mcp loads them together, so an agent reaches all ${integer.format(f.tools)} tools through one connection.</p>
<ul class="flagship-packs">${f.packs.map((p) => {
    const row = npm.get(p.package), host = hostedBy.get(p.package);
    return `<li data-pack="${esc(p.id)}"><b class="flagship-packs__n">${p.tools}</b><h3>${esc(p.label)}</h3><p>${esc(p.covers)}</p><p class="flagship-packs__pkg"><a href="https://www.npmjs.com/package/${esc(p.package)}" rel="noreferrer"><code>${esc(p.package)}</code></a>${row ? ` ${esc(row.latest_version)}` : ""}${host ? ` · <a href="${esc(host.route)}">hosted server</a>` : ""}</p></li>`;
  }).join("")}</ul></section>
<section class="dev-section flagship-section" id="front"><p class="eyebrow">How an agent uses it</p><h2>Three tools in front of ${integer.format(f.tools)}</h2><p class="flagship-intro">The model is shown three tools instead of hundreds. It searches for the one it needs, reads that tool's arguments and runs it, and the rest never enter its context.</p>
<ol class="flagship-doors">${f.front.map((t) => `<li><code>${esc(t.name)}</code><span>${esc(t.does)}</span></li>`).join("")}</ol>
<ul class="flagship-facts">
<li><b>${f.search.first} in ${f.search.requests}</b><span>times the right tool came first when asked for in plain words; in the top three, ${f.search.top_three} in ${f.search.requests}</span></li>
<li><b>${integer.format(f.file_reference.tokens)} tokens</b><span>to pass ${integer.format(f.file_reference.prices)} prices as a file, instead of ${integer.format(f.file_reference.pasted_tokens)} pasted, and no number can be dropped on the way</span></li>
<li><b>${integer.format(f.batch.tokens)} tokens</b><span>of tool input to label ${integer.format(f.file_reference.prices)} prices and weight the labels in one round trip, against ${integer.format(f.batch.chained_tokens)} when the model copies the labels across</span></li>
</ul></section>
<section class="dev-section flagship-section" id="gap"><p class="eyebrow">How it compares</p><h2>Same model, same questions. Only the server changed.</h2><p class="flagship-intro">On the ${h2h.questions_common} questions every server finished, canli-mcp answered ${pct(h2h.headline.ours_common.accuracy)} correctly and the best of the other open-source setups ${pct(h2h.headline.best_rival_common.accuracy)}. Every other setup left at least one kind of question unanswered.</p>
${bars(h2h)}
<h3>By kind of question</h3>${kindsTable(h2h)}
<h3>What each costs before the question</h3>${contextTable(h2h)}
<p class="flagship-note">${esc(caveat)} <a href="/benchmarks/finance-mcp-servers">Every run, the method and the caveats</a>.</p></section>
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
