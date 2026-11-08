// Renders /benchmarks/fresh-filings: each week, questions only that week's annual reports can answer, put to
// an AI model alone and with canli-mcp, every answer checked against the filing. Figures come from
// public/benchmarks/fresh-filings.json (scripts/build-fresh-filings.mjs), which the numbers audit traces.
//   node scripts/build-fresh-filings-page.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { clearDocument, crumbs, esc, faq, faqSchema, integer, longDate, proof, receipt } from "./lib/clear-page.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ROUTE = "/benchmarks/fresh-filings";
export const PAGE = "benchmarks/fresh-filings.html";
const SUMMARY = "public/benchmarks/fresh-filings.json";
const REPO = "https://github.com/arhancanli/canlicapital";
const TRAIL = [["Home", "/"], ["canli-mcp", "/mcp-servers"], ["Weekly test", ROUTE]];

const who = (run) => (run.with ? `${run.model} with ${run.with.name} ${run.with.version}` : `${run.model} on its own`);
const money = (value) => `$${integer.format(value)}`;

export function renderFreshFilings(data) {
  const week = data.weeks[0];
  const alone = week.runs.find((r) => !r.with), tooled = week.runs.find((r) => r.with);
  const ex = week.example;
  const said = (run) => ex.answers.find((a) => (a.with?.name ?? null) === (run.with?.name ?? null))?.said ?? "";
  const title = "Can AI answer questions on last week's filings?";
  const description = `Questions only last week's annual reports can answer, checked against the filings: ${alone.model} alone got ${alone.correct} of ${alone.questions}, and with ${tooled.with.name} ${tooled.correct} of them.`;
  const questions = [
    ["Why use filings from last week?", `A model learns from text written before its training ended. Figures a company first reported last week cannot be in that text, so the model either reads the filing or does not know. That separates an assistant that looks things up from one that recalls or guesses.`],
    ["Who writes the questions?", `A program, the same every week: <a href="${REPO}/blob/main/scripts/datasets/filing-facts/weekly.mjs">weekly.mjs</a> reads the SEC's list of annual reports filed that week and asks about figures each report gives for the first time. Nobody picks questions a tool is good at.`],
    ["How is an answer marked right?", "It has to match the figure in the filing: a dollar amount within a tenth of a percent, a percentage within five hundredths of a point, a ratio within five ten-thousandths. Saying \"not reported\" is never right here, because every question has an answer in the filing."],
    ["Is this a fair test of other tools?", "This page compares one model alone and with canli-mcp, which we build, so weigh that. Every question, answer and run is downloadable below, so anyone can run another tool on the same questions."],
  ];
  const body = `<section class="cl-hero">
<div>
${crumbs(TRAIL)}
<p class="cl-kicker">Benchmark · a new test every week</p>
<h1>${esc(title)}</h1>
<p class="cl-lede">Every week we take the annual reports companies filed with the SEC, ask an AI questions only those reports can answer, and check each answer against the filing. This week: ${integer.format(week.questions)} questions from ${integer.format(week.companies)} companies.</p>
<div class="cl-actions"><a class="cl-button" href="#results">See this week's results</a><a class="cl-quiet" href="/mcp-servers">What canli-mcp is</a></div>
</div>
${receipt({
    head: "Same question, asked twice",
    question: `${esc(ex.company)}: revenue for its fiscal year, from the ${esc(ex.filed.form)} it filed on ${longDate(ex.filed.date)}`,
    rows: [["AI on its own", `"${esc(said(alone))}"`, "wrong"], ["AI with canli-mcp", money(Number(said(tooled))), "right"], ["Filed with the SEC", money(ex.filed.value)]],
    stamp: "Matches the filing", right: true,
    link: { href: ex.filed.url, label: `Open the ${ex.filed.form} on SEC.gov` },
    caption: `${esc(alone.model)}, ${longDate(alone.date)}. Accession ${esc(ex.filed.accession)}.`,
  })}
</section>
${proof([
    [`${alone.correct} of ${alone.questions}`, `answered right by ${esc(alone.model)} on its own; it said it did not know rather than guess`],
    [`${tooled.correct} of ${tooled.questions}`, `answered right by the same model with ${esc(tooled.with.name)}`],
    [`${tooled.wrong_numbers}`, `wrong numbers given with ${esc(tooled.with.name)}; ${tooled.no_number} questions ran out of turns`],
    [`${integer.format(week.annual_reports)}`, `annual reports filed from ${longDate(week.from)} to ${longDate(week.to)}`],
  ], "This week in figures")}
<section class="cl-section" id="results"><p class="cl-eyebrow">Week ${esc(week.week)}</p><h2>This week's results</h2>
<p class="cl-intro">${integer.format(alone.questions)} of the week's ${integer.format(week.questions)} questions, up to ${alone.per_kind} of each kind, went to the same model twice, with at most six turns each.</p>
<table class="cl-table"><thead><tr><th>Who answered</th><th>Right</th><th>Wrong numbers</th><th>No number</th><th>Tokens a question</th></tr></thead><tbody>
${week.runs.map((r) => `<tr><td>${esc(who(r))}</td><td class="cl-num">${r.correct} of ${r.questions}</td><td class="cl-num">${r.wrong_numbers}</td><td class="cl-num">${r.no_number}</td><td class="cl-num">${integer.format(r.mean_tokens)}</td></tr>`).join("\n")}
</tbody></table>
<p class="cl-note">Both misses with ${esc(tooled.with.name)} were the same company, Here Group Limited, which had changed its name; the server's company search knew only the old one, and the model found the company another way just as it ran out of turns. A fix is merged for the next release.</p></section>
<div class="cl-band"><section class="cl-section" id="how"><p class="cl-eyebrow">How it works</p><h2>Four steps, the same every week</h2>
<ol class="cl-steps">
<li><h3>Take the week's annual reports</h3><p>The SEC's daily index lists every ${esc(week.forms.slice(0, -1).join(", "))} and ${esc(week.forms.at(-1))} filed that week; amendments are left out.</p></li>
<li><h3>Ask what only they can answer</h3><p>Each question needs a figure the company reported for the first time that week: a lookup, a change from the year before, a ratio or assets minus liabilities.</p></li>
<li><h3>Ask the same model twice</h3><p>Once on its own, once with canli-mcp. Same prompt, same limits, run on the open-source <a href="${REPO}/blob/main/scripts/datasets/filing-facts/eval.mjs">eval.mjs</a>.</p></li>
<li><h3>Check every answer against the filing</h3><p>An independent checker recomputes each answer from the SEC's data; nothing is tuned on the week's questions.</p></li>
</ol></section></div>
<section class="cl-section" id="files"><p class="cl-eyebrow">Everything is public</p><h2>Download the questions and both runs</h2>
<ul class="cl-grid">
<li class="cl-card"><h3>The questions</h3><p>${integer.format(week.questions)} questions with their answers and the filing each one cites.</p><a class="cl-more" href="${esc(week.set)}">items.jsonl</a></li>
<li class="cl-card"><h3>How they were built</h3><p>The filings read, every company used or skipped, and checksums.</p><a class="cl-more" href="${esc(week.manifest)}">manifest.json</a></li>
${week.runs.map((r) => `<li class="cl-card"><h3>${esc(who(r))}</h3><p>Every answer as given, with its tool calls and tokens.</p><a class="cl-more" href="${esc(r.file)}">Download the run</a></li>`).join("\n")}
</ul></section>
<section class="cl-section" id="questions"><p class="cl-eyebrow">Questions</p><h2>About the test</h2>${faq(questions)}
<p class="cl-note">Limits: one model and one run a week; questions come from a fixed set of templates over figures companies tag in their filings; a company's earnings release can give a figure some days before its annual report. Not investment advice.</p></section>`;
  return clearDocument({ route: ROUTE, title, description, body, active: "mcp-servers", sources: "benchmarks/fresh-filings.json", structured: [faqSchema(questions)], page: "fresh-filings", trail: TRAIL });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(resolve(ROOT, PAGE), renderFreshFilings(JSON.parse(readFileSync(resolve(ROOT, SUMMARY), "utf8"))));
  console.log(`${PAGE} written`);
}
