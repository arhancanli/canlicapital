// Mirror the shared cores into the package, byte for byte, at the same relative paths they have in
// the canlicapital repository, so their relative imports resolve unchanged and the package computes
// exactly what the repository's tests check. test/core-mirror.test.mjs fails if a copy drifts.
// Run from anywhere: node mcp-execution/scripts/sync-core.mjs
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(PKG, "..");
export const CORE_FILES = [
  "js/exec-cost-core.js",
  "js/pretrade-core.js",
  "js/sizing-core.js",
  "js/shortfall-core.js",
  "js/trade-journal-core.js",
  "scripts/canonical-json.mjs",
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = resolve(PKG, "src/core");
  rmSync(target, { recursive: true, force: true });
  for (const rel of CORE_FILES) {
    mkdirSync(dirname(resolve(target, rel)), { recursive: true });
    copyFileSync(resolve(REPO, rel), resolve(target, rel));
  }
  console.log(`mirrored ${CORE_FILES.length} files into mcp-execution/src/core`);
}
