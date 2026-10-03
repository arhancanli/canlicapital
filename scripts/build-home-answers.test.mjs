import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ANSWER_WORDS, REGIONS, buildHomeAnswers, checkConfig, faqJsonLd, wordCount } from "./build-home-answers.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(resolve(ROOT, "config", "home-answers.json"), "utf8"));
const page = readFileSync(resolve(ROOT, "index.html"), "utf8");
const clone = () => structuredClone(config);
// Visible text of a fragment, for comparing two renderings of the same words. Tags are stripped
// until none remain (one pass can leave a tag assembled from the pieces of two), and &amp; is
// decoded last, so "&amp;quot;" stays the five characters it encodes.
function stripTags(html) {
  let previous;
  let out = html;
  do { previous = out; out = out.replace(/<[^>]*>/g, ""); } while (out !== previous);
  return out;
}
const text = (html) => stripTags(html).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const region = (html, [start, end]) => html.slice(html.indexOf(start) + start.length, html.indexOf(end));

test("the committed homepage is what the generator writes", () => {
  assert.equal(buildHomeAnswers(page, config), page, "run node scripts/build-home-answers.mjs and commit index.html");
});

test("the homepage opens with a definition and a 40 to 60 word answer, before anything else in <main>", () => {
  const words = wordCount(`${config.definition} ${config.answer}`);
  assert.ok(words >= ANSWER_WORDS.min && words <= ANSWER_WORDS.max, `${words} words`);
  assert.match(config.definition, /^Canli Capital is an? .+ that .+\.$/);
  const main = page.slice(page.indexOf("<main"));
  const firstParagraphAfterH1 = main.slice(main.indexOf("</h1>")).match(/<p\b[^>]*>([\s\S]*?)<\/p>/)[1];
  assert.equal(text(firstParagraphAfterH1), `${config.definition} ${config.answer}`);
});

test("no letter grade is left on the homepage", () => {
  assert.doesNotMatch(page, /Self-grade|self-graded|\bC\+(?!\+)/);
  assert.doesNotMatch(page, /id="hero-grade"|id="metric-grade"/);
});

test("the FAQPage markup says exactly what the visible FAQ says, in the same order", () => {
  const visible = [...region(page, REGIONS.faq).matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
    .map(([, q, a]) => ({ q: text(q), a: text(a) }));
  const ld = JSON.parse(region(page, REGIONS.ld).match(/<script type="application\/ld\+json" id="home-faq-ld">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(visible.length, config.faq.length);
  assert.deepEqual(ld.mainEntity.map((m) => ({ q: m.name, a: text(m.acceptedAnswer.text) })), visible);
  for (const m of ld.mainEntity) {
    for (const [, href] of m.acceptedAnswer.text.matchAll(/href="([^"]+)"/g)) assert.match(href, /^https:\/\//, "links in markup are absolute");
  }
});

test("every comparison row has one cell per column, and the table names its sources and the date they were checked", () => {
  const html = region(page, REGIONS.compare);
  const columns = [...html.match(/<thead>([\s\S]*?)<\/thead>/)[1].matchAll(/<th scope="col">([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
  assert.deepEqual(columns, ["Question", ...config.comparison.columns]);
  const rows = [...html.matchAll(/<tr><th scope="row">[\s\S]*?<\/tr>/g)];
  assert.equal(rows.length, config.comparison.rows.length);
  for (const [row] of rows) assert.equal((row.match(/<td>/g) ?? []).length, config.comparison.columns.length);
  assert.match(html, new RegExp(`<time datetime="${config.comparison.checked}">`));
  for (const source of config.comparison.sources) assert.ok(html.includes(`href="${source.url}"`), source.url);
  assert.match(html, /role="region"[^>]*tabindex="0"/, "a wide table scrolls inside a focusable region, never the page");
});

test("the checks refuse a config that would publish a weaker answer", () => {
  const cases = [
    ["not a definition", (c) => { c.definition = "Quant research, proved in the open."; }, /definition must read/],
    ["too long", (c) => { c.answer += " This sentence adds far too many words to what was a tight answer."; }, /must be 40 to 60 words/],
    ["missing cell", (c) => { c.comparison.rows[1].cells.pop(); }, /has 2 cells for 3 columns/],
    ["unsourced", (c) => { c.comparison.sources = []; }, /comparison.sources must list/],
    ["plain-http source", (c) => { c.comparison.sources[0].url = "http://example.com"; }, /must be an https URL/],
    ["not a question", (c) => { c.faq[0].question = "What Canli Capital is"; }, /must end with a question mark/],
    ["repeated question", (c) => { c.faq[1].question = c.faq[0].question; }, /repeats an earlier question/],
    ["em dash", (c) => { c.faq[2].answer = `${c.faq[2].answer} ${String.fromCodePoint(0x2014)} really.`; }, /contains an em dash/],
  ];
  for (const [name, mutate, message] of cases) {
    const c = clone();
    mutate(c);
    assert.throws(() => checkConfig(c), message, name);
  }
  assert.doesNotThrow(() => checkConfig(clone()));
});

test("the FAQ markup ties itself to the site's organization and website nodes", () => {
  const ld = faqJsonLd(config);
  assert.equal(ld.about["@id"], "https://canlicapital.com/#organization");
  assert.equal(ld.isPartOf["@id"], "https://canlicapital.com/#website");
  assert.match(page, /"@id":"https:\/\/canlicapital\.com\/#organization"/);
  assert.match(page, /"@id":"https:\/\/canlicapital\.com\/#website"/);
});
