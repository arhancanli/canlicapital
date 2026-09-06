// =============================================================================
// CANLI CAPITAL / scripts/audit-module-preload.mjs
// -----------------------------------------------------------------------------
// gsap and lenis (js/scroll.js's stack, 112.93 kB / 44.39 kB gzip for gsap
// alone) should load only when js/main.js dynamically imports scroll.js.
// vite.config.js's build.modulePreload.resolveDependencies strips both chunks
// from every page's <link rel="modulepreload"> hints, including pages like
// /open whose own entry module (js/open.js) imports gsap directly for its own
// section reveals: without the filter, Vite eagerly modulepreloads gsap there
// too, fetching it on the critical path before scroll.js ever asks for it.
//
// This reads the actual BUILT HTML rather than re-deriving the config, so a
// vite.config.js edit that stops taking effect (or a Vite upgrade that changes
// the resolveDependencies contract) fails here instead of shipping silently.
// =============================================================================

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");

if (!existsSync(DIST)) {
  console.error("dist/ does not exist. Run `npm run build` first.");
  process.exit(1);
}

const CHECKED_PAGES = ["index.html", "open.html"];
const problems = [];

for (const page of CHECKED_PAGES) {
  const path = resolve(DIST, page);
  if (!existsSync(path)) {
    problems.push(`${page} was not built`);
    continue;
  }
  const html = readFileSync(path, "utf8");
  const modulepreloads = [...html.matchAll(/<link rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  if (modulepreloads.length === 0) {
    problems.push(`${page} has no modulepreload links at all; the extractor may be broken`);
    continue;
  }
  const heavy = modulepreloads.filter((href) => /\/(gsap|lenis)-[^/]+\.js$/.test(href));
  if (heavy.length > 0) {
    problems.push(`${page} eagerly modulepreloads: ${heavy.join(", ")}`);
  }
}

if (problems.length > 0) {
  console.error(`\nFAILED (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`verified ${CHECKED_PAGES.join(", ")} never eagerly modulepreload gsap or lenis`);
