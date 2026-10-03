// =============================================================================
// build-home-answers.mjs
// -----------------------------------------------------------------------------
// The homepage has to answer the first question every visitor and every answer
// engine asks, "what is this?", before any of its cinematic narrative. It opened
// with a slogan and a list of features, and the one sentence that said what
// Canli Capital IS existed nowhere on it. A reader without JavaScript, a search
// snippet and an AI assistant all had to guess the category from a headline.
//
// This writes four regions of index.html from config/home-answers.json:
//
//   1. the hero lead: the definition sentence ("Canli Capital is a ... that
//      ...") followed by a short, self-contained answer, 40 to 60 words in all;
//   2. the comparison section (#compare): what Canli Capital, QuantConnect and
//      QuantStats each do, with the sources each cell was checked against;
//   3. the FAQ entries inside .home-questions;
//   4. a FAQPage JSON-LD block in <head>, built from the SAME entries, so the
//      structured data can never say something the page does not.
//
// Each region sits between two literal HTML comments and only the text between
// them is rewritten, so the script finds its markers again on every run and is
// idempotent (the same pattern as build-progress-corrections.mjs).
//
// The config is checked before anything is written. A definition that is not a
// definition, an answer outside 40 to 60 words, a comparison row with a missing
// cell, an unsourced comparison or an em dash fails the build instead of
// shipping.
// =============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = resolve(ROOT, "config", "home-answers.json");
const PAGE_PATH = resolve(ROOT, "index.html");
const SITE = "https://canlicapital.com";

// Built from its code point so this file does not itself carry the character the writing audit counts.
const EM_DASH = String.fromCodePoint(0x2014);

export const ANSWER_WORDS = Object.freeze({ min: 40, max: 60 });
export const REGIONS = Object.freeze({
  answer: ["<!-- home-answer:start -->", "<!-- home-answer:end -->"],
  compare: ["<!-- home-compare:start -->", "<!-- home-compare:end -->"],
  faq: ["<!-- home-faq:start -->", "<!-- home-faq:end -->"],
  ld: ["<!-- home-ld:start -->", "<!-- home-ld:end -->"],
});

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

// Every string in the config, with the path it sits at, so a check can name the
// exact field it refused.
function* strings(value, path = "config") {
  if (typeof value === "string") yield [path, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}.${k}`);
}

export function checkConfig(config) {
  const problems = [];
  const need = (ok, message) => { if (!ok) problems.push(message); };

  need(config?.schema === "canli.home-answers.v1", "schema must be canli.home-answers.v1");
  need(/^\d{4}-\d{2}-\d{2}$/.test(config?.reviewed ?? ""), "reviewed must be a YYYY-MM-DD date");

  const definition = String(config?.definition ?? "");
  need(/^Canli Capital is (a|an) [^.]+ that [^.]+\.$/.test(definition),
    'definition must read "Canli Capital is a/an [category] that [difference]." as one sentence');
  const words = wordCount(`${definition} ${config?.answer ?? ""}`);
  need(words >= ANSWER_WORDS.min && words <= ANSWER_WORDS.max,
    `the opening answer (definition + answer) must be ${ANSWER_WORDS.min} to ${ANSWER_WORDS.max} words; it is ${words}`);

  const comparison = config?.comparison ?? {};
  const columns = comparison.columns ?? [];
  need(Array.isArray(columns) && columns.length >= 2 && columns[0] === "Canli Capital",
    "comparison.columns must start with Canli Capital and name at least one alternative");
  need(Array.isArray(comparison.rows) && comparison.rows.length > 0, "comparison.rows must not be empty");
  for (const [i, row] of (comparison.rows ?? []).entries()) {
    need(typeof row.question === "string" && row.question.trim() !== "", `comparison.rows[${i}].question is empty`);
    need(Array.isArray(row.cells) && row.cells.length === columns.length,
      `comparison.rows[${i}] has ${row.cells?.length ?? 0} cells for ${columns.length} columns`);
    for (const [j, cell] of (row.cells ?? []).entries()) {
      need(typeof cell === "string" && cell.trim() !== "", `comparison.rows[${i}].cells[${j}] is empty`);
    }
  }
  need(/^\d{4}-\d{2}-\d{2}$/.test(comparison.checked ?? ""), "comparison.checked must be the YYYY-MM-DD date the cells were checked");
  need(Array.isArray(comparison.sources) && comparison.sources.length > 0, "comparison.sources must list what the cells were checked against");
  for (const [i, source] of (comparison.sources ?? []).entries()) {
    need(/^https:\/\/\S+$/.test(source.url ?? ""), `comparison.sources[${i}].url must be an https URL`);
    need(typeof source.label === "string" && source.label.trim() !== "", `comparison.sources[${i}].label is empty`);
  }

  const faq = config?.faq ?? [];
  need(Array.isArray(faq) && faq.length > 0, "faq must not be empty");
  const seen = new Set();
  for (const [i, item] of faq.entries()) {
    need(/\?$/.test(item.question ?? ""), `faq[${i}].question must end with a question mark`);
    need(!seen.has(item.question), `faq[${i}].question repeats an earlier question`);
    seen.add(item.question);
    need(typeof item.answer === "string" && wordCount(item.answer) >= 8, `faq[${i}].answer is missing or too short to answer anything`);
    need(typeof item.link?.href === "string" && /^(\/|#|https:\/\/)/.test(item.link.href) && typeof item.link?.text === "string",
      `faq[${i}].link needs an href (/, # or https://) and text`);
  }

  for (const [path, text] of strings(config)) {
    need(!text.includes(EM_DASH), `${path} contains an em dash`);
  }
  if (problems.length) throw new Error(`build-home-answers: config/home-answers.json is not publishable:\n- ${problems.join("\n- ")}`);
}

export function renderAnswer(config) {
  return `<p class="hero__lead">${escapeHtml(config.definition)} ${escapeHtml(config.answer)}</p>`;
}

const LONG_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const longDate = (iso) => LONG_DATE.format(new Date(`${iso}T00:00:00Z`));

export function renderComparison(config) {
  const c = config.comparison;
  const head = c.columns.map((name) => `<th scope="col">${escapeHtml(name)}</th>`).join("");
  const body = c.rows.map((row) =>
    `<tr><th scope="row">${escapeHtml(row.question)}</th>${row.cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
  ).join("\n          ");
  const sources = c.sources.map((s) => `<a href="${escapeHtml(s.url)}" rel="noreferrer">${escapeHtml(s.label)}</a>`).join(", ");
  return [
    `<section class="home-compare" id="${escapeHtml(c.id)}" aria-labelledby="home-compare-title">`,
    `      <div class="home-compare__heading"><p class="eyebrow">${escapeHtml(c.eyebrow)}</p><h2 id="home-compare-title">${escapeHtml(c.title)}</h2><p>${escapeHtml(c.intro)}</p></div>`,
    `      <div class="home-compare__scroll" role="region" aria-labelledby="home-compare-title" tabindex="0">`,
    `        <table class="home-compare__table">`,
    `          <caption>${escapeHtml(c.caption)}</caption>`,
    `          <thead><tr><th scope="col">Question</th>${head}</tr></thead>`,
    `          <tbody>`,
    `          ${body}`,
    `          </tbody>`,
    `        </table>`,
    `      </div>`,
    `      <p class="home-compare__sources">Checked on <time datetime="${escapeHtml(c.checked)}">${escapeHtml(longDate(c.checked))}</time> against ${sources}. Each project changes over time; its own pages are the authority.</p>`,
    `    </section>`,
  ].join("\n");
}

// The answer as it appears in the page and in the FAQPage markup: the escaped
// answer text, then its link. Built once and used for both, so the two are
// byte-identical.
export function answerHtml(item) {
  return `${escapeHtml(item.answer)} <a href="${escapeHtml(item.link.href)}">${escapeHtml(item.link.text)}</a>`;
}

export function renderFaq(config) {
  return config.faq
    .map((item) => `<details><summary>${escapeHtml(item.question)}</summary><p>${answerHtml(item)}</p></details>`)
    .join("\n        ");
}

// Links in the markup are absolute: an answer read outside the page has no base
// URL to resolve "/companies" or "#compare" against.
function absoluteLinks(html) {
  return html.replace(/href="(\/[^"]*|#[^"]*)"/g, (_, href) => `href="${SITE}${href.startsWith("#") ? `/${href}` : href}"`);
}

export function faqJsonLd(config) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${SITE}/#faq`,
    "url": `${SITE}/`,
    "inLanguage": "en",
    "isPartOf": { "@id": `${SITE}/#website` },
    "about": { "@id": `${SITE}/#organization` },
    "mainEntity": config.faq.map((item) => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": { "@type": "Answer", "text": absoluteLinks(answerHtml(item)) },
    })),
  };
}

// "<" is written as < so no answer text can close the <script> element early.
export function renderJsonLd(config) {
  const json = JSON.stringify(faqJsonLd(config)).replace(/</g, "\\u003c");
  return `<script type="application/ld+json" id="home-faq-ld">${json}</script>`;
}

export function replaceRegion(source, [startMarker, endMarker], inner, indent = "") {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`build-home-answers: index.html has no ${startMarker}`);
  if (source.indexOf(startMarker, start + 1) >= 0) throw new Error(`build-home-answers: ${startMarker} appears twice`);
  const contentStart = start + startMarker.length;
  const end = source.indexOf(endMarker, contentStart);
  if (end < 0) throw new Error(`build-home-answers: ${startMarker} never closes with ${endMarker}`);
  return `${source.slice(0, contentStart)}\n${indent}${inner}\n${indent}${source.slice(end)}`;
}

export function buildHomeAnswers(page, config) {
  checkConfig(config);
  let next = page;
  next = replaceRegion(next, REGIONS.answer, renderAnswer(config), "        ");
  next = replaceRegion(next, REGIONS.compare, renderComparison(config), "    ");
  next = replaceRegion(next, REGIONS.faq, renderFaq(config), "        ");
  next = replaceRegion(next, REGIONS.ld, renderJsonLd(config), "  ");
  return next;
}

function main() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const page = readFileSync(PAGE_PATH, "utf8");
  const next = buildHomeAnswers(page, config);
  if (next !== page) writeFileSync(PAGE_PATH, next);
  console.log(`build-home-answers: ${config.faq.length} questions, ${config.comparison.rows.length} comparison rows, ` +
    `opening answer ${wordCount(`${config.definition} ${config.answer}`)} words${next === page ? " (unchanged)" : ""}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
