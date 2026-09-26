// The committed benchmark artifact must equal what the per-run records produce, so /developers
// never shows a figure the results no longer support.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public/glassbox/mcp_agent_benchmark.json matches mcp/bench/agent/results", () => {
  execFileSync(process.execPath, ["scripts/build-mcp-benchmark.mjs", "--check"], { stdio: "pipe" });
});

test("every model in the artifact ran every task the requested number of times", () => {
  const bench = JSON.parse(readFileSync("public/glassbox/mcp_agent_benchmark.json", "utf8"));
  assert.ok(bench.models.length >= 1);
  for (const m of bench.models) assert.equal(m.runs, bench.tasks * m.repeats, m.model);
});
