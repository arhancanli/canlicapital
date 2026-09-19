// One-shot build for canli-design-system: no watcher, run once and exit.
//   0. copy scripts/product-shell.mjs verbatim into src/shell/generated-product-shell.mjs.
//   1. esbuild bundles src/index.ts to dist/index.js (ESM, react/react-dom external).
//   2. tsc emits declaration files only, rooted at dist/index.d.ts.
//   3. build-css.mjs flattens src/styles.css into a self-contained dist/styles.css.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { buildCss } from "./build-css.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = resolve(rootDir, "..");

// scripts/product-shell.mjs lives outside design-system/, so TypeScript's rootDir (which
// keeps declaration output rooted at dist/index.d.ts rather than mirroring paths from the
// site root) cannot import it directly. Per the brief, when a site module cannot be imported
// cleanly we generate a copy at build time instead of retyping its markup by hand: this
// copies it byte for byte on every build, so it can never go stale or drift from the real
// file. See .design-sync/NOTES.md.
function generateProductShellCopy() {
  const from = resolve(siteRoot, "scripts/product-shell.mjs");
  const toDir = resolve(rootDir, "src/shell");
  mkdirSync(toDir, { recursive: true });
  const to = resolve(toDir, "generated-product-shell.mjs");
  copyFileSync(from, to);
  // Keep the shell's local dependency beside the generated copy.
  copyFileSync(resolve(siteRoot, 'scripts/optical-handoff.mjs'), resolve(toDir, 'optical-handoff.mjs'));
  return to;
}

async function buildJs() {
  await esbuild.build({
    entryPoints: [resolve(rootDir, "src/index.ts")],
    outfile: resolve(rootDir, "dist/index.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2019",
    jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
    sourcemap: true,
    logLevel: "info",
  });
}

function buildTypes() {
  const tscBin = resolve(rootDir, "node_modules/.bin/tsc");
  execFileSync(tscBin, ["--project", resolve(rootDir, "tsconfig.json")], {
    cwd: rootDir,
    stdio: "inherit",
  });
}

async function main() {
  generateProductShellCopy();
  await buildJs();
  buildTypes();
  const cssPath = buildCss(rootDir);
  console.log(`canli-design-system: build complete (dist/index.js, dist/index.d.ts, ${cssPath.replace(rootDir + "/", "")})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
