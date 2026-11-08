import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");
const llms = read("public/llms.txt");

test("llms.txt has no unfilled placeholder", () => {
  // {tools} reached the file on 6 November when a server's line was printed as written.
  assert.doesNotMatch(llms, /\{[a-z_]+\}/);
});

test("llms.txt names the latest canli-mcp release and carries the vision with each item's status", () => {
  const { current } = JSON.parse(read("config/canli-mcp.json"));
  assert.ok(llms.includes(`the latest release is ${current.version}`));
  assert.match(llms, /^## What Canli Capital is working toward$/m);
  assert.match(llms, /\(canli-mcp, (Building|Planned)/);
  assert.match(llms, /^Goals, each labelled with what exists; .* The whole plan: https:\/\/canlicapital\.com\/vision$/m);
});
