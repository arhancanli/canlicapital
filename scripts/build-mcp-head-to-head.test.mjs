import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CONFIG, FLAGSHIP, PAGE, SUMMARY, checkConfig, median, render, signTest, summarize } from "./build-mcp-head-to-head.mjs";
import { applySiteDesign } from "./build-site-design.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(resolve(ROOT, CONFIG), "utf8"));
const flagship = JSON.parse(readFileSync(resolve(ROOT, FLAGSHIP), "utf8"));
const data = summarize(config, flagship);
const arm = (id) => data.arms.find((a) => a.id === id);

test("the committed summary and page are what the generator writes", () => {
  assert.equal(readFileSync(resolve(ROOT, SUMMARY), "utf8"), JSON.stringify(data, null, 1) + "\n", "run node scripts/build-mcp-head-to-head.mjs and commit the result");
  // the page as it ships: the generator's output after the site-wide design step (scripts/build-site-design.mjs)
  assert.equal(readFileSync(resolve(ROOT, PAGE), "utf8"), applySiteDesign(render(data), PAGE));
});

test("the figures reproduce the benchmark report (mcp-canli/bench/rivals/REPORT.md)", () => {
  assert.equal(data.questions_total, 24);
  assert.equal(data.questions_common, 14);
  const common = Object.fromEntries(data.arms.map((a) => [a.id, `${a.common.correct}/${a.common.runs}`]));
  assert.deepEqual(common, { canli: "22/28", "canli-after": "23/28", "canli-final": "26/28", openbb: "11/28", edgartools: "11/28", yahoo: "14/28", "edgartools+yahoo": "15/28" });
  const all = Object.fromEntries(data.arms.map((a) => [a.id, `${a.correct}/${a.runs}`]));
  assert.deepEqual(all, { canli: "38/48", "canli-after": "40/48", "canli-final": "44/48", openbb: "11/28", edgartools: "11/41", yahoo: "18/48", "edgartools+yahoo": "19/41" });
  assert.equal(arm("canli").median_input_tokens, 11782);
  assert.equal(arm("openbb").median_input_tokens, 107112.5);
  assert.equal(arm("canli").median_seconds, 5.33);
  const pairs = Object.fromEntries(data.paired.map((p) => [p.rival, [p.better, p.worse, p.p]]));
  assert.deepEqual(pairs, { openbb: [9, 4, 0.2668], edgartools: [14, 3, 0.0127], yahoo: [14, 5, 0.0636], "edgartools+yahoo": [11, 4, 0.1185] });
});

test("the headline speaks for the untuned server and the best untuned rival only", () => {
  assert.equal(data.headline.ours, "canli");
  assert.equal(arm("canli").tuned, false);
  assert.equal(data.headline.best_rival, "edgartools+yahoo");
  assert.ok(data.arms.filter((a) => a.tuned).every((a) => a.ours), "only our own later versions are marked tuned");
  assert.equal(data.headline.rivals_beaten_on_common, 4);
  assert.equal(data.headline.rivals_with_a_zero_category, 4);
  assert.equal(arm("canli").categories_scored_zero, 0);
});

test("every caveat reaches the published file and the page", () => {
  const page = render(data);
  assert.ok(data.caveats.length >= 5);
  const escaped = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  for (const caveat of config.caveats) assert.ok(page.includes(escaped(caveat)), caveat.slice(0, 60));
  assert.match(page, /tuned/i);
  assert.match(page, new RegExp(config.source.commit.slice(0, 8)));
});

test("the sign test and the median match their definitions", () => {
  assert.equal(signTest(0, 0), 1);
  assert.equal(Number(signTest(14, 3).toFixed(4)), 0.0127);
  assert.equal(signTest(5, 5), 1);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test("the checks refuse a config that would publish a weaker claim", () => {
  const clone = () => structuredClone(config);
  const cases = [
    ["a run counted twice", (c) => c.runs.push({ ...c.runs[0] }), /appears twice/],
    ["an unknown server", (c) => { c.runs[0].arm = "mystery"; }, /unknown arm/],
    ["no caveats", (c) => { c.caveats = []; }, /caveats must be stated/],
    ["a short commit", (c) => { c.source.commit = "8c106a6f"; }, /full commit hash/],
    ["an arm without a license", (c) => { delete c.arms[3].license; }, /needs a url, version and license/],
    ["a run without a verdict", (c) => { delete c.runs[5].correct; }, /no correct flag/],
  ];
  for (const [name, mutate, message] of cases) {
    const c = clone();
    mutate(c);
    assert.throws(() => checkConfig(c, flagship), message, name);
  }
  const f = structuredClone(flagship);
  f.packs[0].tools += 1;
  assert.throws(() => checkConfig(config, f), /must equal the packs/);
  assert.doesNotThrow(() => checkConfig(clone(), flagship));
});
