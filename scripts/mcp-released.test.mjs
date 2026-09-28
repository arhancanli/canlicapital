// The hosted MCP endpoints serve the released packages, never work in progress: each handler
// imports only from mcp-released/, every file there matches the sha256 its RELEASE.json records,
// and each copy is the version and commit config/mcp-hosted-releases.json names.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(ROOT, p));
const { servers } = JSON.parse(read("config/mcp-hosted-releases.json"));
const HANDLERS = { validation: "api/mcp.js", fundamentals: "api/mcp-fundamentals.js", research: "api/mcp-research.js" };

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

test("each hosted handler imports its server from the released copy only", () => {
  for (const [name, file] of Object.entries(HANDLERS)) {
    const source = read(file).toString();
    assert.match(source, new RegExp(`from "\\.\\./mcp-released/${name}/src/server\\.mjs"`), file);
    assert.doesNotMatch(source, /from "\.\.\/mcp(-fundamentals|-research)?\/src\//, `${file} imports a package's working source`);
  }
});

test("every released file matches its recorded sha256, and nothing else is there", () => {
  for (const name of Object.keys(servers)) {
    const dir = resolve(ROOT, "mcp-released", name);
    const manifest = JSON.parse(readFileSync(join(dir, "RELEASE.json"), "utf8"));
    const present = walk(dir).map((p) => relative(dir, p)).filter((p) => p !== "RELEASE.json").sort();
    assert.deepEqual(present, Object.keys(manifest.files).sort(), `${name}: files differ from RELEASE.json`);
    for (const [path, hash] of Object.entries(manifest.files)) {
      assert.equal(createHash("sha256").update(readFileSync(join(dir, path))).digest("hex"), hash, `${name}/${path} was edited after release`);
    }
  }
});

test("each released copy is the version and commit the release config names", () => {
  for (const [name, release] of Object.entries(servers)) {
    const manifest = JSON.parse(read(`mcp-released/${name}/RELEASE.json`));
    const pkg = JSON.parse(read(`mcp-released/${name}/package.json`));
    assert.deepEqual([manifest.package, manifest.version, manifest.commit], [release.package, release.version, release.commit], name);
    assert.deepEqual([pkg.name, pkg.version], [release.package, release.version], name);
  }
});

test("vercel.json bundles each hosted function with its released copy", () => {
  const { functions } = JSON.parse(read("vercel.json"));
  for (const [name, file] of Object.entries(HANDLERS)) assert.equal(functions[file].includeFiles, `mcp-released/${name}/{package.json,src/**}`, file);
});
