// The committed benchmark artifact must equal what the per-run records produce, so /developers
// never shows a figure the results no longer support.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("config/mcp-agent-benchmark.json matches mcp/bench/agent/results", () => {
  execFileSync(process.execPath, ["scripts/build-mcp-benchmark.mjs", "--check"], { stdio: "pipe" });
});

test("every model in the artifact ran every task the requested number of times", () => {
  const bench = JSON.parse(readFileSync("config/mcp-agent-benchmark.json", "utf8"));
  assert.ok(bench.models.length >= 1);
  for (const m of bench.models) assert.equal(m.runs, bench.tasks * m.repeats, m.model);
});

test("the benchmark is read from config/ and published into glassbox/ by the page generator, never read from public/glassbox/", () => {
  // The hourly deploy replaces public/glassbox/ with the engine's export, so a build input committed
  // there is deleted before the build runs (the deploy of 2026-09-26 07:30Z failed this way).
  const generator = readFileSync("scripts/build-standards-and-developers.mjs", "utf8");
  assert.ok(generator.includes('readFileSync(resolve(ROOT, "config/mcp-agent-benchmark.json")'));
  assert.ok(generator.includes('writeFileSync(resolve(ROOT, "public/glassbox/mcp_agent_benchmark.json")'));
  assert.ok(!/readFileSync\(resolve\(ROOT, "public\/glassbox\/mcp_agent_benchmark\.json"\)/.test(generator));
});
