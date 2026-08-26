import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "artifacts/qa/product-contract-inventory.json");
const ROUTE_DIRS = new Set(["research", "measurements", "trials"]);
const METRIC_TERMS = /\b(?:sharpe|drawdown|correlation|sleeves?|paper|positions?|orders?|returns?|volatility|trials?|identit(?:y|ies)|accounts?|capital)\b/i;
const NUMBER = /(?:^|[^A-Za-z])[-+]?\d+(?:\.\d+)?%?/;
const EM_DASH = /\u2014|&mdash;|&#8212;/gi;

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", ".git", ".bak", "public"].includes(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else if (entry.endsWith(".html")) files.push(full);
  }
  return files;
}

function walkPublicationPapers(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walkPublicationPapers(full));
    else if (entry === "paper.html") files.push(full);
  }
  return files;
}

function routeFor(file) {
  const path = relative(ROOT, file).replaceAll("\\", "/");
  const publicPath = path.startsWith("public/") ? path.slice("public/".length) : path;
  if (publicPath === "index.html") return "/";
  if (publicPath.endsWith("/index.html")) return `/${publicPath.slice(0, -"/index.html".length)}`;
  return `/${publicPath.replace(/\.html$/, "")}`;
}

function familyFor(html) {
  if (/data-product-shell="v3"/i.test(html)) return "product_v3";
  if (/<header\s+class="site-header"/i.test(html)) return "product_v3_home";
  if (/<html[^>]+data-page=/i.test(html) && /class="nav(?:__|\s|\")/i.test(html)) return "legacy_product_v2";
  if (/class="(?:paper__)?masthead(?:__|\s|\")/i.test(html)) return "evidence_document_v1";
  if (/class="cover"/i.test(html) && /class="paper"/i.test(html)) return "archival_publication_v1";
  return "unclassified";
}

function originFor(file) {
  const path = relative(ROOT, file).replaceAll("\\", "/");
  if (path.startsWith("public/publication/") || path.startsWith("publication/")) return "publication";
  const first = path.split("/")[0];
  if (ROUTE_DIRS.has(first)) return first;
  return "product";
}

function requiresMigration(file, shellFamily) {
  if (shellFamily === "archival_publication_v1") {
    const archivePath = relative(resolve(ROOT, "public/publication"), file).replaceAll("\\", "/");
    const wrapper = resolve(ROOT, "publication", archivePath.replace(/\/paper\.html$/, ".html"));
    return !existsSync(wrapper);
  }
  return !["product_v3", "product_v3_home"].includes(shellFamily);
}

function countMatches(text, expression) {
  return [...text.matchAll(expression)].length;
}

function metricCandidates(html) {
  const withoutScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  return withoutScripts.split("\n").reduce((count, line) => {
    const text = line.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return count + (text && METRIC_TERMS.test(text) && NUMBER.test(text) ? 1 : 0);
  }, 0);
}

const pages = [...walk(ROOT), ...walkPublicationPapers(resolve(ROOT, "public/publication"))]
  .sort()
  .map((file) => {
    const html = readFileSync(file, "utf8");
    const path = relative(ROOT, file).replaceAll("\\", "/");
    const shellFamily = familyFor(html);
    const emDashCount = countMatches(html, EM_DASH);
    return {
      path,
      route: routeFor(file),
      origin: originFor(file),
      shell_family: shellFamily,
      indexable: !/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html),
      em_dash_count: emDashCount,
      hardcoded_metric_candidate_lines: metricCandidates(html),
      migration_required: requiresMigration(file, shellFamily),
    };
  });

const countBy = (field) => Object.fromEntries(
  [...new Set(pages.map((page) => page[field]))]
    .sort()
    .map((key) => [key, pages.filter((page) => page[field] === key).length]),
);

const inventory = {
  schema: "canli.product-contract-inventory.v1",
  claim_boundary: "This is a deterministic source-tree inventory. A migration flag identifies a shell mismatch, not a content or evidence failure. Hardcoded metric candidates require human review and are not automatically classified as defects.",
  summary: {
    pages: pages.length,
    indexable_pages: pages.filter((page) => page.indexable).length,
    noindex_pages: pages.filter((page) => !page.indexable).length,
    pages_requiring_shell_migration: pages.filter((page) => page.migration_required).length,
    pages_with_em_dashes: pages.filter((page) => page.em_dash_count > 0).length,
    em_dash_occurrences: pages.reduce((sum, page) => sum + page.em_dash_count, 0),
    hardcoded_metric_candidate_lines: pages.reduce((sum, page) => sum + page.hardcoded_metric_candidate_lines, 0),
    shell_families: countBy("shell_family"),
    origins: countBy("origin"),
  },
  product_routes: pages.filter((page) => page.origin === "product"),
  migration_groups: {
    legacy_product_routes: pages.filter((page) => page.shell_family === "legacy_product_v2").map((page) => page.route),
    archival_publications_without_wrappers: pages
      .filter((page) => page.shell_family === "archival_publication_v1" && page.migration_required)
      .map((page) => page.route),
    evidence_document_generators: [
      "scripts/build-papers.mjs",
      "scripts/build-measurements.mjs",
      "scripts/build-trials.mjs",
      "scripts/build-verify.mjs",
      "scripts/build-founder.mjs",
      "scripts/build-methodology.mjs"
    ],
    em_dash_offenders: pages
      .filter((page) => page.em_dash_count > 0)
      .map(({ path, route, origin, em_dash_count }) => ({ path, route, origin, em_dash_count })),
  },
};

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");

const { summary } = inventory;
console.log(`inventoried ${summary.pages} pages across ${Object.keys(summary.shell_families).length} shell families`);
console.log(`${summary.pages_requiring_shell_migration} pages require shell migration`);
console.log(`${summary.pages_with_em_dashes} pages contain ${summary.em_dash_occurrences} em-dash forms`);
console.log(`${summary.hardcoded_metric_candidate_lines} metric-bearing lines require provenance review`);

if (summary.shell_families.unclassified) {
  console.error(`${summary.shell_families.unclassified} pages have an unclassified shell`);
  process.exit(1);
}
