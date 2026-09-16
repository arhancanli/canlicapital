// Guard test 4: dist/index.d.ts exports a <Name>Props interface/type for every component it
// exports, and dist/index.js exports the matching runtime value. This is what keeps the
// package's public API typed end to end, which Claude Design's converter (and any consumer)
// depends on.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as DS from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const dts = readFileSync(resolve(here, "../dist/index.d.ts"), "utf8");

function isComponentName(name) {
  return /^[A-Z]/.test(name) && typeof DS[name] === "function";
}

const componentNames = Object.keys(DS).filter(isComponentName);

test("dist/index.js exports at least fifteen components", () => {
  assert.ok(componentNames.length >= 15, `expected >= 15 components, found ${componentNames.length}: ${componentNames.join(", ")}`);
});

for (const name of componentNames) {
  test(`dist/index.d.ts exports ${name}Props`, () => {
    const re = new RegExp(`\\bexport type\\s*\\{[^}]*\\b${name}Props\\b[^}]*\\}|\\bexport (?:interface|type)\\s+${name}Props\\b`);
    assert.match(dts, re, `${name}Props not found in dist/index.d.ts`);
  });
}
