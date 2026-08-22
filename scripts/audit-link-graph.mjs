// =============================================================================
// CANLI CAPITAL / scripts/audit-link-graph.mjs
// -----------------------------------------------------------------------------
// Build the internal link graph from dist/ and fail if any indexable page is
// unreachable, or further than three clicks, from the homepage.
//
// WHY. Nothing asserted it, and the answer turned out to be no. On 2026-08-22
// this audit found 22 pages beyond the bound — 14 at four clicks and 8 at five —
// because /research linked eleven papers and NOT ONE of the thirteen topic hubs
// that are its own taxonomy. Those hubs were reachable only by chance, through
// another paper's related-work section, and their exclusive members sat behind
// them. A library that does not link its own index is the defect; the depth is
// only how it shows up.
//
// THE GRAPH IS BUILT FROM STATIC HTML ONLY, and that is deliberate rather than a
// limitation. The shared nav and footer are assembled at runtime by shell.js, so
// a link that exists only there is invisible to a crawler reading the delivered
// document — and invisible to a reader with JS off. Measuring the static graph
// measures the view that actually decides whether this corpus is discoverable.
// Every static link added for this reason across the last few items was added
// because of exactly that.
//
// It also checks the graph and the sitemap describe the same site, in both
// directions: a page nobody links is an orphan, and a sitemap entry with no page
// is a 404 we advertised.
// =============================================================================

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const ORIGIN = "https://canlicapital.com";
const MAX_DEPTH = 3;

// Floors. A graph that collapses to nothing satisfies "no page is too deep" perfectly, which is
// the shape of the bug rather than the absence of it.
const MIN_PAGES = 50;
const MIN_EDGES = 100;

const problems = [];
const fail = (message) => problems.push(message);

if (!existsSync(DIST)) {
  console.error("dist/ does not exist — run `npm run build` first");
  process.exit(1);
}

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "assets") continue;
      out.push(...htmlFiles(full));
    } else if (entry.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

const routeOf = (file) =>
  "/" + relative(DIST, file).replace(/\.html$/, "").replace(/^index$/, "");

const files = htmlFiles(DIST);
const routes = new Set(files.map(routeOf));

// Edges: only links that resolve to a page we actually built. A link to a missing page is a
// different defect and is caught per-page by verify-papers.mjs; here it simply is not an edge.
const edges = new Map();
let edgeCount = 0;
for (const file of files) {
  const html = readFileSync(file, "utf8");
  const targets = new Set(
    // UNANCHORED ONCE, and a mutation test caught it: `data-href="/x"` CONTAINS `href="/x"`, so
    // any attribute ending in -href counted as a link. The same substring trap as literature_dir
    // inside app_literature_dir. Without the left boundary the extractor over-counts edges, and
    // the floor meant to catch a broken extractor never fires — which is exactly how this audit
    // passed a mutation that had neutralised every link on the site.
    [...html.matchAll(/(?:^|\s)href="(\/[^"]*)"/g)]
      .map((m) => m[1].split("#")[0].replace(/\/$/, "") || "/")
      .filter((href) => routes.has(href)),
  );
  targets.delete(routeOf(file));
  edges.set(routeOf(file), targets);
  edgeCount += targets.size;
}

if (routes.size < MIN_PAGES) {
  fail(`only ${routes.size} pages in the graph — the crawl found almost nothing and every check ` +
    `below would pass vacuously`);
}
if (edgeCount < MIN_EDGES) {
  fail(`only ${edgeCount} internal links across the whole site — the link extractor has stopped ` +
    `matching, and an empty graph satisfies a depth bound perfectly`);
}

// Breadth-first from the homepage, which is the only page a crawler is guaranteed to start at.
const depth = new Map([["/", 0]]);
const queue = ["/"];
while (queue.length > 0) {
  const current = queue.shift();
  for (const next of edges.get(current) || []) {
    if (!depth.has(next)) {
      depth.set(next, depth.get(current) + 1);
      queue.push(next);
    }
  }
}

const sitemap = readFileSync(resolve(DIST, "sitemap.xml"), "utf8");
const indexable = new Set(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    m[1].replace(ORIGIN, "").replace(/\/$/, "") || "/",
  ),
);

for (const route of [...indexable].sort()) {
  if (!routes.has(route)) {
    fail(`the sitemap advertises ${route}, which was not built — that is a 404 we published`);
    continue;
  }
  const d = depth.get(route);
  if (d === undefined) {
    fail(`${route} is in the sitemap and NOTHING links to it — an orphan page ranks for nothing`);
  } else if (d > MAX_DEPTH) {
    fail(`${route} is ${d} clicks from the homepage (limit ${MAX_DEPTH})`);
  }
}

for (const route of [...routes].sort()) {
  if (!indexable.has(route)) {
    fail(`${route} was built and is not in the sitemap, so nothing will discover it`);
  }
}

const histogram = {};
for (const [, d] of depth) histogram[d] = (histogram[d] || 0) + 1;

console.log(`link graph: ${routes.size} pages, ${edgeCount} internal links`);
console.log(
  "  depth from /: " +
    Object.entries(histogram)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([d, n]) => `${d}:${n}`)
      .join("  "),
);
if (problems.length > 0) {
  console.error(`\nFAILED (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`  every indexable page is within ${MAX_DEPTH} clicks of the homepage`);
