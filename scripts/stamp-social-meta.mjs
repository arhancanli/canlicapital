// =============================================================================
// scripts/stamp-social-meta.mjs
// -----------------------------------------------------------------------------
// Runs after `vite build` (first step of postbuild): every page in dist/ gets the social-card tags
// it is missing (site name, locale, the image's size and type, its alt text, the X card type), so
// link previews on X, LinkedIn, Facebook, Slack and Discord show a complete card. The rule lives in
// scripts/lib/social-meta.mjs; a tag a page already has is never changed. An image's size is read
// from the image file in dist/, never assumed.
// =============================================================================

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checksummedFiles, completeSocialMeta, imageDimensions, ORIGIN } from "./lib/social-meta.mjs";

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

const sizes = new Map();
function imageSize(url) {
  if (!url.startsWith(`${ORIGIN}/`)) return null;
  if (!sizes.has(url)) {
    let size = null;
    try { size = imageDimensions(readFileSync(join(DIST, decodeURIComponent(new URL(url).pathname)))); } catch { size = null; }
    sizes.set(url, size);
  }
  return sizes.get(url);
}

let changed = 0;
const frozen = checksummedFiles(DIST);
const files = htmlFiles(DIST).filter((file) => !frozen.has(file));
for (const file of files) {
  const html = readFileSync(file, "utf8");
  const out = completeSocialMeta(html, imageSize);
  if (out !== html) { writeFileSync(file, out); changed += 1; }
}
console.log(`social tags completed on ${changed} of ${files.length} pages in ${DIST}; ${frozen.size} checksummed files left untouched`);
