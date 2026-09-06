// three.js (js/scene.js, js/shaders.js) built a 526 kB / 131.5 kB gzip chunk,
// the single largest asset on the site, with zero real loads: its only import
// was gated on `document.getElementById("scene")`, and no page ever shipped
// that canvas. This is the regression guard: if a `<canvas id="scene">` (or
// any import of ./scene.js) ever comes back, this must fail before three
// quietly reappears in a build.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "artifacts"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(resolve(dir, entry.name), out);
    } else {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
}

const SELF = fileURLToPath(import.meta.url);
const allFiles = walk(ROOT).filter((f) => f !== SELF);
const htmlFiles = allFiles.filter((f) => f.endsWith(".html"));
const jsFiles = allFiles.filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));

test("no page carries the canvas that used to gate the three.js scene", () => {
  const offenders = htmlFiles.filter((f) => /id="scene"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, [], `unexpected canvas#scene in: ${offenders.join(", ")}`);
});

test("no module imports the removed ./scene.js or ./shaders.js", () => {
  const pattern = /['"`]\.?\/?(?:js\/)?(?:scene|shaders)\.js['"`]/;
  const offenders = jsFiles.filter((f) => pattern.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, [], `unexpected scene.js/shaders.js import in: ${offenders.join(", ")}`);
});

test("js/scene.js and js/shaders.js are deleted", () => {
  assert.ok(!existsSync(resolve(ROOT, "js/scene.js")));
  assert.ok(!existsSync(resolve(ROOT, "js/shaders.js")));
});

test("three is not a dependency and not chunked by vite.config.js", () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  assert.ok(!("three" in (pkg.dependencies || {})), "three is still in package.json dependencies");
  assert.ok(!("three" in (pkg.devDependencies || {})), "three is still in package.json devDependencies");
  const viteConfig = readFileSync(resolve(ROOT, "vite.config.js"), "utf8");
  assert.ok(!viteConfig.includes("node_modules/three"), "vite.config.js still chunks node_modules/three");
});

test("dist has no three chunk after a build", () => {
  const dist = resolve(ROOT, "dist/assets");
  if (!existsSync(dist)) return; // covered by npm run build in CI; skip if dist is absent locally
  const offenders = readdirSync(dist).filter((f) => /^three-[^/]+\.js$/.test(f));
  assert.deepEqual(offenders, [], `unexpected three chunk in dist/assets: ${offenders.join(", ")}`);
});
