// 0.1.0 reached npm with a dependency on file:../mcp, which only exists in this repository, so a
// standalone install could not load the server. Every dependency must come from the registry.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("dependencies are registry versions, not local paths, links or git URLs", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) assert.doesNotMatch(String(spec), /^(file:|link:|portal:|workspace:|git\+|github:|https?:)|\.\.?\//, `${name}: ${spec}`);
});
