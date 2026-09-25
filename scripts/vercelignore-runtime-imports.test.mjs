// Every file a serverless function imports at runtime must survive the upload filter.
//
// On 2026-09-25 the hosted MCP endpoint (api/mcp.js) passed every test and failed in production
// with ERR_MODULE_NOT_FOUND: it imports ../mcp/src/server.mjs, and .vercelignore excluded mcp/*
// except two files. Local tests import from the working tree, so no test could see the upload.
// This follows the relative imports of every api/ function and asks git's own ignore engine
// (the syntax .vercelignore uses) whether any of them would be left out of the upload.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const IMPORT = /(?:import|export)\s[^'"]*?from\s*["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;

function functionEntries(dir = join(ROOT, "api")) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...functionEntries(full));
    else if (/\.(m?js)$/.test(name) && !/\.test\.m?js$/.test(name)) out.push(full);
  }
  return out;
}

function runtimeClosure(entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const target = resolve(dirname(file), match[1] ?? match[2]);
      if (existsSync(target) && statSync(target).isFile()) queue.push(target);
    }
  }
  return [...seen].map((file) => relative(ROOT, file));
}

function ignoredByVercel(paths) {
  try {
    const out = execFileSync(
      "git",
      ["-c", `core.excludesFile=${join(ROOT, ".vercelignore")}`, "check-ignore", "--no-index", "--stdin"],
      { cwd: ROOT, input: paths.join("\n"), encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean);
  } catch (error) {
    if (error.status === 1) return []; // git check-ignore: nothing matched
    throw error;
  }
}

test("every file an api/ function imports at runtime is uploaded", () => {
  const closure = runtimeClosure(functionEntries());
  assert.ok(closure.includes("mcp/src/server.mjs"), "the hosted MCP endpoint's import was not followed");
  assert.deepEqual(ignoredByVercel(closure), [], "these runtime imports are excluded by .vercelignore");
});

test("the check itself can fail: an excluded path is reported", () => {
  // dist/ is excluded and, unlike node_modules in some checkouts, never a symbolic link.
  assert.deepEqual(ignoredByVercel(["dist/example.js"]), ["dist/example.js"]);
});
