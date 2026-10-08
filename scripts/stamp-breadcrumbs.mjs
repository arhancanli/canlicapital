// =============================================================================
// scripts/stamp-breadcrumbs.mjs
// -----------------------------------------------------------------------------
// Runs after `vite build` (postbuild, after stamp-social-meta): every indexable page in dist/ gets the
// breadcrumbs it is missing, as a BreadcrumbList and as a visible trail. The rule lives in
// scripts/lib/breadcrumbs.mjs; checksummed files and noindex pages are left untouched.
// =============================================================================
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { completeBreadcrumbs, pageLabel } from "./lib/breadcrumbs.mjs";
import { checksummedFiles } from "./lib/social-meta.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = process.argv[2] ? resolve(process.argv[2]) : resolve(ROOT, "dist");

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "assets") out.push(...htmlFiles(full)); }
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

// dist/research/x.html -> /research/x; dist/tools/index.html -> /tools; dist/index.html -> /.
export const routeOf = (file) => {
  const rel = relative(DIST, file).replaceAll("\\", "/").replace(/(^|\/)index\.html$/, "").replace(/\.html$/, "");
  return "/" + rel.replace(/\/$/, "");
};

const frozen = checksummedFiles(DIST);
const files = htmlFiles(DIST).filter((file) => !frozen.has(file));
const pages = files.map((file) => ({ file, path: routeOf(file), html: readFileSync(file, "utf8") }));
const labels = new Map(pages.map((p) => [p.path, pageLabel(p.html)]).filter(([, label]) => label));
let changed = 0;
for (const page of pages) {
  const out = completeBreadcrumbs(page.html, page.path, labels);
  if (out !== page.html) { writeFileSync(page.file, out); changed += 1; }
}
console.log(`breadcrumbs completed on ${changed} of ${files.length} pages in ${DIST}; ${frozen.size} checksummed files left untouched`);
