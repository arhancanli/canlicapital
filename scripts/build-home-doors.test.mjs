import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PAGE, REGION, SOURCES, buildHomeDoors, readSources, renderHomeDoors, weekRuns } from "./build-home-doors.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(resolve(ROOT, PAGE), "utf8");
const { fresh, h2h } = readSources(ROOT);
const region = page.slice(page.indexOf(REGION[0]) + REGION[0].length, page.indexOf(REGION[1]));
const text = region.replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

test("the committed homepage is what the generator writes", () => {
  assert.equal(buildHomeDoors(page, fresh, h2h), page, "run node scripts/build-home-doors.mjs and commit index.html");
});

test("the region sits under the checker, before what the check covers", () => {
  const hero = page.indexOf('<section class="ck-hero"'), start = page.indexOf(REGION[0]), scope = page.indexOf('<section class="ck-scope"');
  assert.ok(hero >= 0 && hero < start && start < scope);
});

test("the weekly test's figures are the latest week's, with canli-mcp and without", () => {
  const { tooled, alone } = weekRuns(fresh);
  assert.match(text, new RegExp(`${tooled.correct} of ${tooled.questions} questions`));
  assert.match(text, new RegExp(`Without it: ${alone.correct} of ${alone.questions}\\.`));
  assert.match(text, new RegExp(`canli-mcp: ${h2h.flagship.tools} finance tools`));
});

test("the page declares the files its figures come from, for the published-numbers audit", () => {
  const declared = page.match(/<meta name="canli:sources" content="([^"]*)"/)[1].split(/\s+/);
  for (const source of Object.values(SOURCES)) assert.ok(declared.includes(source.replace(/^public\//, "")), source);
  assert.ok(declared.includes("claim-check-example.json"));
});

test("three doors, each a heading that links to a page the site serves", () => {
  const doors = [...region.matchAll(/<li class="ck-door"><p class="ck-door__who">([^<]+)<\/p><h3><a href="([^"]+)">([^<]+)<\/a><\/h3><p>([^<]+)<\/p><\/li>/g)];
  assert.deepEqual(doors.map((d) => [d[1], d[2]]), [["A company", "/companies"], ["Learning", "/learn"], ["AI and developers", "/mcp-servers"]]);
  const vercel = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
  const rewritten = new Set((vercel.rewrites ?? []).map((r) => r.source));
  for (const [, , href] of doors) {
    assert.ok(rewritten.has(href) || existsSync(resolve(ROOT, `${href.slice(1)}.html`)), `${href} is served`);
  }
  assert.match(region, /<h2 class="ck-hidden" id="ck-doors-title">/);
  assert.equal((page.match(/<h1\b/g) ?? []).length, 1);
});

test("a week without both runs is refused rather than shown half", () => {
  const oneRun = { weeks: [{ runs: [fresh.weeks[0].runs.find((r) => r.with)] }] };
  assert.throws(() => renderHomeDoors(oneRun, h2h), /needs a run with canli-mcp and one without/);
  assert.throws(() => renderHomeDoors(fresh, { flagship: {} }), /no flagship tool count/);
});
