// What ships: pinned dependencies, no install scripts, versions in step, and only the hosts
// SECURITY.md names.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", ROOT), "utf8"));
const server = JSON.parse(readFileSync(new URL("server.json", ROOT), "utf8"));

test("pinned dependencies and no lifecycle scripts", () => {
  for (const v of Object.values(pkg.dependencies)) assert.match(v, /^\d+\.\d+\.\d+$/);
  for (const hook of ["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly", "prepack", "postpack"]) assert.equal(pkg.scripts?.[hook], undefined, hook);
});

test("package.json, server.json and the changelog agree on the version", () => {
  assert.equal(server.version, pkg.version);
  assert.equal(server.packages[0].version, pkg.version);
  assert.equal(server.packages[0].identifier, pkg.name);
  assert.equal(server.name, pkg.mcpName);
  assert.ok(server.description.length <= 100);
  assert.match(readFileSync(new URL("CHANGELOG.md", ROOT), "utf8"), new RegExp(`## ${pkg.version.replace(/\./g, "\\.")}\\b`));
});

test("the code reaches only the hosts SECURITY.md lists", () => {
  const allowed = ["www.sec.gov", "data.sec.gov", "efts.sec.gov", "home.treasury.gov", "fred.stlouisfed.org", "data.alpaca.markets", "api.tiingo.com", "query1.finance.yahoo.com", "canlicapital.com", "static.modelcontextprotocol.io"];
  const security = readFileSync(new URL("SECURITY.md", ROOT), "utf8");
  for (const f of readdirSync(new URL("src/", ROOT))) {
    const text = readFileSync(new URL(`src/${f}`, ROOT), "utf8");
    for (const m of text.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]+)/g)) {
      assert.ok(allowed.includes(m[1]), `${f} reaches ${m[1]}`);
      if (m[1] !== "canlicapital.com") assert.ok(security.includes(m[1]), `SECURITY.md does not name ${m[1]}`);
    }
    assert.doesNotMatch(text, /writeFile|appendFile|createWriteStream|child_process|\beval\s*\(|new Function|console\.log/, f);
  }
});
