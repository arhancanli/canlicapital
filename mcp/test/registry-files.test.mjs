// mcp/test/registry-files.test.mjs
//
// Proves the registry listing files describe the package this repository actually ships, rather
// than a name or version typed by hand and left to drift. mcp/package.json is read, never typed
// a second time: the identifier, the version and the boundary language it must carry all come
// from the source files a publish already has to keep current.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { LIMITS_SENTENCES } from "../src/schemas.mjs";

const MCP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(MCP_ROOT, "package.json"), "utf8"));
const serverJsonText = readFileSync(resolve(MCP_ROOT, "server.json"), "utf8");

// Every string value found under a key literally named "description", anywhere in the parsed
// object, however deep. Server.json is expected to carry exactly one, at the top level; the walk
// is recursive so this test keeps holding even if a future edit adds another.
function collectDescriptions(node, out = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectDescriptions(item, out);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "description" && typeof value === "string") out.push(value);
      else collectDescriptions(value, out);
    }
  }
  return out;
}

test("mcp/server.json parses as JSON", () => {
  assert.doesNotThrow(() => JSON.parse(serverJsonText));
});

test("mcp/server.json names the published npm package and version, not a typed copy", () => {
  const server = JSON.parse(serverJsonText);
  assert.equal(server.version, pkg.version, "top-level version must match package.json");
  assert.ok(Array.isArray(server.packages) && server.packages.length > 0, "at least one package entry");
  const npmPackage = server.packages.find((p) => p.registryType === "npm");
  assert.ok(npmPackage, "an npm package entry is required");
  assert.equal(npmPackage.identifier, pkg.name, "package identifier must match package.json name");
  assert.equal(npmPackage.version, pkg.version, "package version must match package.json version");
  assert.equal(npmPackage.transport?.type, "stdio", "this server only speaks stdio");
  // GitHub-authenticated publisher namespace: the registry rejects any other prefix for this
  // login method (see mcp/REGISTRIES.md, "Steps 1 to 4").
  assert.match(server.name, /^io\.github\.[\w-]+\/[\w.-]+$/);
});

test("every description in mcp/server.json carries a limits sentence, verbatim", () => {
  const server = JSON.parse(serverJsonText);
  const descriptions = collectDescriptions(server);
  assert.ok(descriptions.length > 0, "at least one description field must exist");
  const sentences = Object.values(LIMITS_SENTENCES);
  for (const description of descriptions) {
    assert.ok(
      sentences.some((sentence) => description.includes(sentence)),
      `description does not carry a limits sentence: ${description}`,
    );
  }
});

test("mcp/smithery.yaml names the published npm package, not a typed copy", () => {
  const smithery = readFileSync(resolve(MCP_ROOT, "smithery.yaml"), "utf8");
  assert.ok(smithery.includes(pkg.name), "smithery.yaml must reference the npm package by name");
  assert.match(smithery, /type:\s*stdio/, "this server only speaks stdio");
});

test("mcp/REGISTRIES.md names the published npm package and the three registries", () => {
  const registries = readFileSync(resolve(MCP_ROOT, "REGISTRIES.md"), "utf8");
  assert.ok(registries.includes(pkg.name), "REGISTRIES.md must reference the npm package by name");
  assert.ok(registries.includes(`${pkg.name}@${pkg.version}`), "REGISTRIES.md must name the exact published version");
  for (const registry of ["registry.modelcontextprotocol.io", "smithery.ai", "glama.ai"]) {
    assert.ok(registries.includes(registry), `REGISTRIES.md must cover ${registry}`);
  }
});
