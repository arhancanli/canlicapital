import test from "node:test";
import assert from "node:assert/strict";
import { leaderboard, render, summary, wilson } from "./build-filingfacts-leaderboard.mjs";

const run = (model, arm, accuracy, extra = {}) => ({ model, arm, provider: "openai", date: "2026-10-07", items: 150, correct: Math.round(accuracy * 150),
  accuracy, ci95: wilson(Math.round(accuracy * 150), 150), errors: 0, numbers_given: 84, numbers_wrong: 0.9643, unanswerable_abstention: 0.9667,
  mean_tokens: 187, dataset_sha256: "x", evidence: `/datasets/filing-facts/v0/runs/2026-10-07/${model}-${arm}.json`, ...extra });

test("the Wilson interval matches a hand computation and stays inside [0, 1]", () => {
  const [lo, hi] = wilson(32, 150);
  assert.ok(Math.abs(lo - 0.1554) < 5e-4 && Math.abs(hi - 0.2856) < 5e-4);
  assert.deepEqual(wilson(0, 10).map((x) => x >= 0), [true, true]);
  assert.ok(wilson(10, 10)[1] <= 1);
  assert.deepEqual(wilson(0, 0), [null, null]);
});

test("models are ordered by accuracy with the MCP server, and a missing arm says so", () => {
  const rows = [run("a", "closed", 0.2), run("a", "mcp", 0.6), run("b", "closed", 0.3), run("b", "mcp", 0.7), run("c", "closed", 0.25)];
  assert.deepEqual(leaderboard(rows).map((t) => t.model), ["b", "a", "c"]);
  const html = render(summary(rows, "2026-10-07"));
  assert.match(html, /not yet run/);
  assert.match(html, /b answered 30\.0% correctly on its own and 70\.0% with an MCP server/);
});

test("every row links to its run record and the page declares the summary as its source", () => {
  const html = render(summary([run("a", "closed", 0.2), run("a", "mcp", 0.6)], "2026-10-07"));
  assert.match(html, /href="\/datasets\/filing-facts\/v0\/runs\/2026-10-07\/a-closed\.json"/);
  assert.match(html, /<meta name="canli:sources" content="datasets\/filing-facts\/v0\/leaderboard\.json"/);
  assert.match(html, /BreadcrumbList/);
});
