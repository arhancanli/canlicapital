import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = resolve(ROOT, "contracts/writing-ratchet.json");
const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const literalEmDash = String.fromCodePoint(0x2014);
const namedEntity = `&${"mdash"};`;
const numericEntity = `&#${"8212"};`;

function countForms(text) {
  return text.split(literalEmDash).length - 1
    + text.toLowerCase().split(namedEntity).length - 1
    + text.toLowerCase().split(numericEntity).length - 1;
}

function walk(dir, accept, skip = new Set()) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full, accept, skip));
    else if (accept(full)) files.push(full);
  }
  return files;
}

const htmlFiles = walk(
  ROOT,
  (file) => extname(file) === ".html",
  new Set(["node_modules", "dist", ".git", ".bak", "public"]),
);
const publicationFiles = walk(
  resolve(ROOT, "public/publication"),
  (file) => file.endsWith("/paper.html"),
);

function htmlScope(file) {
  const path = relative(ROOT, file).replaceAll("\\", "/");
  if (path.startsWith("public/publication/")) return "html.publication";
  const first = path.split("/")[0];
  if (["research", "measurements", "trials"].includes(first)) return `html.${first}`;
  return "html.product";
}

const counts = {
  "html.product": 0,
  "html.research": 0,
  "html.measurements": 0,
  "html.trials": 0,
  "html.publication": 0,
  "runtime.js": 0,
  "runtime.config": 0,
  "generators.scripts": 0,
};

for (const file of [...htmlFiles, ...publicationFiles]) {
  counts[htmlScope(file)] += countForms(readFileSync(file, "utf8"));
}
for (const file of walk(resolve(ROOT, "js"), (candidate) => extname(candidate) === ".js")) {
  counts["runtime.js"] += countForms(readFileSync(file, "utf8"));
}
for (const file of walk(resolve(ROOT, "config"), (candidate) => [".js", ".json"].includes(extname(candidate)))) {
  counts["runtime.config"] += countForms(readFileSync(file, "utf8"));
}
for (const file of walk(resolve(ROOT, "scripts"), (candidate) => extname(candidate) === ".mjs")) {
  counts["generators.scripts"] += countForms(readFileSync(file, "utf8"));
}

const limits = baseline.maximum_em_dash_forms || {};
const failures = [];
for (const [scope, count] of Object.entries(counts)) {
  const limit = limits[scope];
  if (!Number.isInteger(limit) || limit < 0) {
    failures.push(`${scope}: no valid ratchet ceiling`);
    continue;
  }
  const state = count === 0 ? "clear" : count < limit ? "improved" : count === limit ? "baseline" : "regressed";
  console.log(`${scope}: ${count} / ${limit} (${state})`);
  if (count > limit) failures.push(`${scope}: ${count} exceeds ceiling ${limit}`);
}

if (failures.length) {
  console.error(`writing contract failed with ${failures.length} error${failures.length === 1 ? "" : "s"}`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("writing ratchet passed; every editable scope is locked at zero");
