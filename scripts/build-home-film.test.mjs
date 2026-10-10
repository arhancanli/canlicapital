import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PAGE, REGION, buildHomeFilm, readSources } from "./build-home-film.mjs";
import { filmData, renderHomeFilm } from "./lib/home-film.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(resolve(ROOT, PAGE), "utf8");
const { h2h, leaderboard } = readSources(ROOT);
const region = page.slice(page.indexOf(REGION[0]) + REGION[0].length, page.indexOf(REGION[1]));
// Visible text of the region: the film-data block is cut out by its id, tags are stripped until none
// remain, and &amp; is decoded last so an encoded entity is never decoded twice.
const DATA_OPEN = '<script type="application/json" id="film-data">';
function visibleText(html) {
  const start = html.indexOf(DATA_OPEN), end = start < 0 ? -1 : html.indexOf("</script>", start);
  let out = start < 0 ? html : html.slice(0, start) + " " + html.slice(end + "</script>".length), previous;
  do { previous = out; out = out.replace(/<[^>]*>/g, " "); } while (out !== previous);
  return out.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}
const text = visibleText(region);

test("the committed homepage is what the generator writes", () => {
  assert.equal(buildHomeFilm(page, h2h, leaderboard), page, "run node scripts/build-home-film.mjs and commit index.html");
});

test("the film is twelve chapters, numbered in order, each labelled by its heading", () => {
  const chapters = [...page.matchAll(/<section class="chapter[^"]*" id="ch-(\d+)" data-chapter="(\d+)" aria-labelledby="([^"]+)"/g)];
  assert.deepEqual(chapters.map((m) => Number(m[2])), [...Array(12).keys()]);
  for (const [, id, , label] of chapters) {
    assert.match(page, new RegExp(`id="${label}"`), `chapter ${id} names a heading that exists`);
  }
  assert.equal((page.match(/<h1\b/g) ?? []).length, 1);
});

test("the headline figures on the homepage are the published ones", () => {
  const ours = h2h.arms.find((a) => a.id === h2h.headline.ours);
  const best = h2h.arms.find((a) => a.id === h2h.headline.best_rival);
  const closed = leaderboard.rows.find((r) => r.model === "gpt-5.4-mini").closed;
  const openbb = h2h.context.rows.find((r) => r.arm === "openbb" && r.tools === r.reaches);
  const pct = (x) => `${Math.round(x * 100)}%`;
  for (const figure of [pct(ours.common.accuracy), pct(best.common.accuracy), `${closed.numbers_given} numbers`, pct(closed.numbers_wrong), "1,056 tools", "432,001 tokens", "859 tokens", "285"]) {
    assert.ok(text.includes(figure), figure);
  }
  assert.equal(openbb.tools, 1056);
});

test("the comparison is read before it is quoted: the caveats travel with the gap chapter", () => {
  const gap = text.slice(text.indexOf("The gap"));
  assert.match(gap, /We wrote the questions/);
  assert.match(gap, /Interim result/);
  assert.match(region, /href="\/benchmarks\/finance-mcp-servers"/);
});

test("the film reads its counts from the same summary", () => {
  const start = page.indexOf(DATA_OPEN);
  assert.ok(start >= 0, "the film-data block exists");
  const json = page.slice(start + DATA_OPEN.length, page.indexOf("</script>", start));
  assert.deepEqual(JSON.parse(json), filmData(h2h, leaderboard));
  const arms = JSON.parse(json).gap.arms;
  assert.deepEqual(arms.map((a) => a.accuracy), [...arms.map((a) => a.accuracy)].sort((a, b) => b - a));
});

test("the tickers show the benchmark's own answers, and drop a label once its question asks about another period", () => {
  const ticker = filmData(h2h, leaderboard).ticker;
  assert.ok(ticker.length >= 8, "most of the answers reach the street");
  assert.ok(ticker.includes(`NVDA 10-K  ${h2h.questions.find((q) => q.id === "filing_employees").truth.toLocaleString("en-US")} EMPLOYEES`));
  const moved = structuredClone(h2h), cpi = moved.questions.find((q) => q.id === "macro_cpi");
  cpi.question = cpi.question.replace("August 2026", "September 2026");
  assert.ok(!filmData(moved, leaderboard).ticker.some((t) => t.startsWith("CPI-U")), "a stale period is never printed");
});

test("an unpublished package is never presented as installable without saying so", () => {
  const unpublished = renderHomeFilm({ ...h2h, flagship: { ...h2h.flagship, npm_published: false } }, leaderboard);
  const published = renderHomeFilm({ ...h2h, flagship: { ...h2h.flagship, npm_published: true } }, leaderboard);
  assert.match(unpublished, /being published to npm/);
  assert.doesNotMatch(published, /being published to npm/);
});

test("no em dash in the film", () => {
  assert.ok(!region.includes(String.fromCodePoint(0x2014)));
});
