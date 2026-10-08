// What ships: cores byte-identical to the repository's tested copies, exactly pinned dependencies,
// no install scripts, Alpaca's paper endpoint as the only trading host and no way to override it.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CORE_FILES } from "../scripts/sync-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(ROOT, "..");
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

test("src/core mirrors the repository's pre-trade cores byte for byte", { skip: !existsSync(resolve(REPO, "js/pretrade-core.js")) && "installed package" }, () => {
  for (const rel of CORE_FILES) assert.ok(readFileSync(resolve(ROOT, "src/core", rel)).equals(readFileSync(resolve(REPO, rel))), `${rel} drifted; run node mcp-paper/scripts/sync-core.mjs`);
  assert.equal(walk(resolve(ROOT, "src/core")).length, CORE_FILES.length);
});

test("pinned dependencies and no lifecycle scripts", () => {
  assert.deepEqual(pkg.dependencies, { "@modelcontextprotocol/server": "2.3.1", zod: "4.6.5" });
  for (const hook of ["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly", "prepack", "postpack"]) assert.equal(pkg.scripts?.[hook], undefined, hook);
});

test("the only hosts are Alpaca's paper trading and market data endpoints, with no override", () => {
  const hosts = new Set();
  for (const f of walk(resolve(ROOT, "src"))) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]+)/g)) if (!m[1].startsWith("canlicapital.com")) hosts.add(m[1]);
    assert.doesNotMatch(text, /base_url|baseUrl|proxy|ALPACA_BASE|APCA_API_BASE|(?<!paper-)api\.alpaca\.markets/i, f);
  }
  assert.deepEqual([...hosts].sort(), ["data.alpaca.markets", "paper-api.alpaca.markets"]);
});
