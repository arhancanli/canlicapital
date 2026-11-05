import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildFreshFilings, OUTPUT } from "./build-fresh-filings.mjs";
import { renderFreshFilings } from "./build-fresh-filings-page.mjs";
import { inspectHtml } from "./audit-live-seo.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the published summary is exactly what the weekly sets and their runs give", () => {
  assert.equal(read(OUTPUT), `${JSON.stringify(buildFreshFilings(), null, 1)}\n`, "rebuild it: node scripts/build-fresh-filings.mjs");
  const week = JSON.parse(read(OUTPUT)).weeks.find((w) => w.week === "2026-W44");
  assert.deepEqual(week.runs.map((r) => [r.with?.name ?? null, r.correct, r.questions, r.wrong_numbers]), [["canli-mcp", 89, 91, 0], [null, 0, 91, 0]]);
  assert.deepEqual([week.example.company, week.example.filed.value, week.example.answers.map((a) => a.said)], ["AutoZone, Inc.", 20338555000, ["20338555000", "not reported"]]);
});

test("the weekly page is the committed one, with one title, its own canonical and the receipt's figures", () => {
  const html = renderFreshFilings(JSON.parse(read(OUTPUT)));
  const meta = inspectHtml(html, "https://canlicapital.com/benchmarks/fresh-filings");
  assert.equal(meta.canonical, meta.requested_url);
  assert.equal(meta.h1.length, 1);
  assert.ok(meta.description.length >= 140 && meta.description.length <= 160, `${meta.description.length}`);
  assert.match(html, /AI on its own<\/dt><dd class="cl-was-wrong">"not reported"/);
  assert.match(html, /AI with canli-mcp<\/dt><dd class="cl-was-right">\$20,338,555,000/);
  assert.match(html, /<meta name="canli:sources" content="benchmarks\/fresh-filings.json"/);
});
