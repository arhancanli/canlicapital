// mcp/test/no-em-dash.test.mjs
//
// Enforces "no em dashes in any file" over every source, test, doc and manifest file this
// package ships (node_modules and package-lock.json excluded), rather than relying on a human
// to remember it on every future edit.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const mcpRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
// Built from a code point, not a literal character, so this file does not trip its own check.
const EM_DASH = String.fromCharCode(0x2014);
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const SKIP_FILES = new Set(["package-lock.json"]);

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || SKIP_FILES.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

test("no shipped file under mcp/ contains an em dash", () => {
  const offenders = [];
  for (const file of listFiles(mcpRoot)) {
    const text = readFileSync(file, "utf8");
    if (text.includes(EM_DASH)) offenders.push(path.relative(mcpRoot, file));
  }
  assert.deepEqual(offenders, []);
});
