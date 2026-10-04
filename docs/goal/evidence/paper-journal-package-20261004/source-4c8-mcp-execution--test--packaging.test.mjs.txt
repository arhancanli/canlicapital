// What the package ships: the cores byte-identical to the repository's tested copies, two pinned
// dependencies, no install scripts, and no trading host anywhere (this build has no broker code).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CORE_FILES } from "../scripts/sync-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(ROOT, "..");
const inRepository = existsSync(resolve(REPO, "js/pretrade-core.js"));
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

test("src/core is a byte-for-byte mirror of the repository's cores", { skip: !inRepository && "installed package, no repository beside it" }, () => {
  for (const rel of CORE_FILES) {
    assert.ok(readFileSync(resolve(ROOT, "src/core", rel)).equals(readFileSync(resolve(REPO, rel))), `${rel} differs from the repository; run node mcp-execution/scripts/sync-core.mjs`);
  }
  assert.equal(walk(resolve(ROOT, "src/core")).length, CORE_FILES.length, "src/core holds only the mirrored files");
});

test("two exactly pinned dependencies and no lifecycle scripts", () => {
  assert.deepEqual(pkg.dependencies, { "@modelcontextprotocol/server": "2.1.0", "@modelcontextprotocol/client": "2.1.0", zod: "4.6.5" });
  for (const hook of ["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly", "prepack", "postpack"]) assert.equal(pkg.scripts?.[hook], undefined, hook);
  assert.deepEqual(pkg.files, ["src", "README.md", "JOURNAL_STORAGE.md", "EXAMPLES.md", "PAPER_JOURNAL.md"]);
});

test("no trading host, key variable or base-URL override appears in any shipped file", () => {
  for (const f of walk(resolve(ROOT, "src"))) {
    const text = readFileSync(f, "utf8");
    assert.doesNotMatch(text, /alpaca\.markets|APCA_|api\.binance|coinbase\.com|base_url|proxy/i, f);
  }
});
