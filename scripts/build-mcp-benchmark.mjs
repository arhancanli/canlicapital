// =============================================================================
// build-mcp-benchmark.mjs
// -----------------------------------------------------------------------------
// Writes the MCP agent benchmark summary, config/mcp-agent-benchmark.json, from
// the per-run records in mcp/bench/agent/results/. The /developers generator
// renders its benchmark table from it and publishes a copy as the glassbox
// artifact /glassbox/mcp_agent_benchmark.json, which the page declares as a
// source, so every figure there traces to it.
//
// It lives in config/, not public/glassbox/: the hourly deploy replaces
// public/glassbox/ with the engine's export (alphaforge scripts/lib/site_snapshot.sh),
// so a file committed there never reaches the build; on 2026-09-26 that failed the
// deploy with ENOENT. The deploy does not upload mcp/bench either, so the summary is
// committed; `--check` (run by the test beside this file) fails when it no longer
// matches the results it came from.
//
// For each model the newest results file that covers every task in
// mcp/bench/agent/tasks.mjs is used; partial runs (for example --only) are skipped.
//
//   node scripts/build-mcp-benchmark.mjs          write the artifact
//   node scripts/build-mcp-benchmark.mjs --check  exit 1 if it is stale
// =============================================================================

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TASKS } from "../mcp/bench/agent/tasks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = resolve(ROOT, "mcp/bench/agent/results");
const OUT = resolve(ROOT, "config/mcp-agent-benchmark.json");

const LABELS = {
  "gpt-5.4-mini": "GPT-5.4 mini",
  "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
  "claude-sonnet-5": "Claude Sonnet 5",
};

export function buildArtifact() {
  const taskIds = TASKS.map((t) => t.id).sort();
  const complete = readdirSync(RESULTS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, data: JSON.parse(readFileSync(resolve(RESULTS, f), "utf8")) }))
    .filter(({ data }) => JSON.stringify([...data.tasks].sort()) === JSON.stringify(taskIds));
  const latest = new Map();
  for (const entry of complete) {
    const prior = latest.get(entry.data.model);
    if (!prior || entry.data.generated_at > prior.data.generated_at) latest.set(entry.data.model, entry);
  }
  const models = [...latest.values()]
    .sort((a, b) => a.data.model.localeCompare(b.data.model))
    .map(({ file, data }) => ({
      model: data.model,
      label: LABELS[data.model] ?? data.model,
      results_file: `mcp/bench/agent/results/${file}`,
      generated_at: data.generated_at,
      repeats: data.repeats,
      ...data.summary,
    }));
  if (!models.length) throw new Error("no results file covers every task in mcp/bench/agent/tasks.mjs");
  return {
    schema: "canli.mcp-agent-benchmark.v1",
    tasks: TASKS.length,
    method: "mcp/bench/agent/README.md",
    scope: "Tasks written by us, run against the server in private local mode. The per-run records also hold tokens and time, which depend on each provider's tokenizer and serving, so they compare runs of one model only.",
    models,
  };
}

const text = `${JSON.stringify(buildArtifact(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(OUT, "utf8") !== text) {
    console.error("config/mcp-agent-benchmark.json is stale: run node scripts/build-mcp-benchmark.mjs");
    process.exit(1);
  }
  console.log("config/mcp-agent-benchmark.json matches mcp/bench/agent/results");
} else {
  writeFileSync(OUT, text);
  console.log(`mcp-benchmark: ${JSON.parse(text).models.length} models written`);
}
