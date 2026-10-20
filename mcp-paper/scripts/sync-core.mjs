// Mirror the repository's pre-trade cores into the package byte for byte, at the same relative
// paths, so the package checks orders exactly as the repository's tests check them.
// test/packaging.test.mjs fails if a copy drifts. Run: node mcp-paper/scripts/sync-core.mjs
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(PKG, "..");
export const CORE_FILES = ["js/exec-cost-core.js", "js/pretrade-core.js"];

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = resolve(PKG, "src/core");
  rmSync(target, { recursive: true, force: true });
  for (const rel of CORE_FILES) {
    mkdirSync(dirname(resolve(target, rel)), { recursive: true });
    copyFileSync(resolve(REPO, rel), resolve(target, rel));
  }
}
