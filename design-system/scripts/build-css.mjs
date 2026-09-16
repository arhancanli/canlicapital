// Flattens design-system/src/styles.css into a single, self-contained dist/styles.css.
//
// Only LOCAL @import statements (a relative path, no scheme) are inlined: each one is
// replaced with the imported file's own content, resolved recursively so a chain of local
// imports collapses to one file. A remote @import (the Google Fonts request in fonts.css) is
// left exactly as written, because those fonts are meant to load from the network at
// runtime, not be vendored into this file. Any other url(...) reference inside a rule body is
// also left exactly as written: none of the stylesheets this package imports currently
// reference a local asset by a relative url(), so there is nothing to rewrite, and rewriting
// on spec (guessing a new base path) is how you introduce a broken link nobody asked for.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_IMPORT_RE = /^\s*@import\s+(?:url\()?["']?(\.\.?\/[^"')]+)["']?\)?\s*;\s*$/;

function flatten(entryPath, seen = new Set()) {
  const absolute = resolve(entryPath);
  if (seen.has(absolute)) {
    throw new Error(`build-css: circular @import detected at ${absolute}`);
  }
  seen.add(absolute);
  const source = readFileSync(absolute, "utf8");
  const lines = source.split("\n");
  const out = [];
  for (const line of lines) {
    const match = line.match(LOCAL_IMPORT_RE);
    if (match) {
      const importedPath = resolve(dirname(absolute), match[1]);
      out.push(`/* inlined: ${match[1]} */`);
      out.push(flatten(importedPath, seen));
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

export function buildCss(rootDir) {
  const entry = resolve(rootDir, "src/styles.css");
  const flattened = flatten(entry);
  const outPath = resolve(rootDir, "dist/styles.css");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, flattened, "utf8");
  return outPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const outPath = buildCss(rootDir);
  console.log(`wrote ${outPath}`);
}
