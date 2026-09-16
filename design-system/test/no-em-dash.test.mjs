// Guard test 3: no literal em dash character anywhere under design-system/. The repo forbids
// writing one in anything it produces; this package is no exception. Binary files (source
// maps aside, which are text but irrelevant) and node_modules/dist build output are skipped:
// dist is regenerated from src on every build, so checking src is what actually guards
// against a human introducing one; dist is checked too since it is what ships.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Built the same way scripts/audit-writing.mjs builds its own literalEmDash constant: from a
// code point, not a literal character, so this file does not itself contain the character it
// is scanning for (which would trivially fail its own check).
const EM_DASH = String.fromCodePoint(0x2014);
const SKIP_DIRS = new Set(["node_modules"]);
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".css", ".json", ".md"]);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (TEXT_EXTENSIONS.has(extname(entry.name))) files.push(full);
  }
  return files;
}

test("no file under design-system/ contains a literal em dash character", () => {
  const offenders = [];
  for (const file of walk(packageRoot)) {
    // Source maps re-encode source text; an em dash inside a quoted site string that a
    // component legitimately renders would show up there too and is not the concern of this
    // guard (see CorrectionsList: it never inserts one itself).
    if (file.endsWith(".js.map")) continue;
    const text = readFileSync(file, "utf8");
    if (text.includes(EM_DASH)) offenders.push(relative(packageRoot, file));
  }
  assert.deepEqual(offenders, [], `em dash character found in: ${offenders.join(", ")}`);
});
