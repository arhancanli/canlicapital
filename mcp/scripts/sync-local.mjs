// Mirror the validators' pure computation into the package, byte for byte, at the same relative
// paths it has in the canlicapital repository, so its relative imports resolve unchanged and
// local mode computes exactly what the API computes. test/local-parity.test.mjs fails if the copy
// drifts from the repository. Run from anywhere: node mcp/scripts/sync-local.mjs
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MCP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(MCP, "..");
export const LOCAL_FILES = [
  "js/dsr-core.js",
  "js/moments-core.js",
  "js/pbo-core.js",
  "js/selection-risk-core.js",
  "js/breadth-core.js",
  "js/paper-evidence-core.js",
  "js/validate/deflated-sharpe.js",
  "js/validate/overfitting.js",
  "js/validate/paper-evidence.js",
  "js/validate/breadth.js",
  "js/validate/track-record.js",
  "js/validate/backtest-length.js",
  "js/receipt-statement.js",
  "scripts/canonical-json.mjs",
  "js/student-t.js",
  "js/haircut-core.js",
  "js/validate/haircut-sharpe.js",
  "js/luck-core.js",
  "js/validate/luck-trials.js",
  "api/_lib/limits.js",
  "standards/paper-evidence/schema.json",
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = resolve(MCP, "src/local");
  rmSync(target, { recursive: true, force: true });
  for (const rel of LOCAL_FILES) {
    mkdirSync(dirname(resolve(target, rel)), { recursive: true });
    copyFileSync(resolve(REPO, rel), resolve(target, rel));
  }
  console.log(`mirrored ${LOCAL_FILES.length} files into mcp/src/local`);
}
