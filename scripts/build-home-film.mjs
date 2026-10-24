// =============================================================================
// CANLI CAPITAL / scripts/build-home-film.mjs
// -----------------------------------------------------------------------------
// Writes the homepage film's chapters 1 to 11 into index.html, between
// <!-- home-film:start --> and <!-- home-film:end -->, from two published files:
// the FilingFacts leaderboard and the finance MCP head-to-head summary. Nothing in
// the region is typed by hand, so a figure on the homepage moves when its file
// moves, and audit-published-numbers traces every one of them to those files.
//
// Idempotent: a second run writes the same bytes.
//   node scripts/build-home-film.mjs
// =============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderHomeFilm } from "./lib/home-film.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PAGE = "index.html";
export const SOURCES = Object.freeze({
  h2h: "public/benchmarks/finance-mcp-servers.json",
  leaderboard: "public/datasets/filing-facts/v0/leaderboard.json",
});
export const REGION = Object.freeze(["<!-- home-film:start -->", "<!-- home-film:end -->"]);

export function buildHomeFilm(page, h2h, leaderboard) {
  const [open, close] = REGION;
  const start = page.indexOf(open);
  const end = page.indexOf(close);
  if (start < 0 || end < start || page.indexOf(open, start + 1) >= 0) throw new Error(`build-home-film: ${PAGE} needs exactly one ${open} ... ${close} region`);
  return `${page.slice(0, start + open.length)}\n${renderHomeFilm(h2h, leaderboard)}\n${page.slice(end)}`;
}

export function readSources(root = ROOT) {
  return {
    h2h: JSON.parse(readFileSync(resolve(root, SOURCES.h2h), "utf8")),
    leaderboard: JSON.parse(readFileSync(resolve(root, SOURCES.leaderboard), "utf8")),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { h2h, leaderboard } = readSources();
  const path = resolve(ROOT, PAGE);
  const before = readFileSync(path, "utf8");
  const after = buildHomeFilm(before, h2h, leaderboard);
  if (after !== before) writeFileSync(path, after);
  console.log(`  home film: ${after === before ? "unchanged" : "rewritten"} (11 chapters from ${Object.values(SOURCES).join(", ")})`);
}
