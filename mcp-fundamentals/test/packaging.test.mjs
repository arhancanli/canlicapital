// The listing and bundle files describe the package this directory ships: the name, the version and
// the tool list are read from package.json and the server, never typed a second time, so the
// registry entry, the Claude Desktop bundle and the Smithery command cannot drift from a release.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createSession, registerTools } from "../src/server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(resolve(ROOT, file), "utf8");
const pkg = JSON.parse(read("package.json"));

function registeredToolNames() {
  const names = [];
  registerTools({ registerTool: (name) => names.push(name) }, createSession());
  return names.sort();
}

test("server.json names the npm package and version this directory ships", () => {
  const server = JSON.parse(read("server.json"));
  assert.equal(server.name, pkg.mcpName);
  assert.equal(server.version, pkg.version);
  const npm = server.packages.find((p) => p.registryType === "npm");
  assert.equal(npm.identifier, pkg.name);
  assert.equal(npm.version, pkg.version);
  assert.equal(npm.transport.type, "stdio");
  assert.ok(server.description.length <= 100, `registry cap is 100 characters; this is ${server.description.length}`);
});

test("the Claude Desktop manifest matches the package version and lists exactly the server's tools", () => {
  const manifest = JSON.parse(read("mcpb/manifest.json"));
  assert.equal(manifest.name, pkg.name);
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.server.entry_point, pkg.bin[pkg.name]);
  assert.deepEqual(manifest.tools.map((t) => t.name).sort(), registeredToolNames());
  assert.equal(manifest.license, pkg.license);
  assert.equal(manifest.compatibility.runtimes.node, `${pkg.engines.node}.0`);
});

test("smithery.yaml spawns this package", () => {
  assert.match(read("smithery.yaml"), new RegExp(`args: \\['-y', '${pkg.name}'\\]`));
});

test("no listing or policy file contains an em dash", () => {
  for (const file of ["SECURITY.md", "CONTRIBUTING.md", "CITATION.cff", "smithery.yaml", "mcpb/manifest.json"]) {
    assert.doesNotMatch(read(file), /—/, file);
  }
});
