// The prebuilt index the server searches at startup must match what the packs actually register:
// every name, pack, title and description, with renames applied and no duplicate names.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { OMITTED, PACKS, RENAMES, loadPack } from "../src/packs.mjs";

const INDEX = JSON.parse(readFileSync(new URL("../src/index.json", import.meta.url), "utf8"));

test("index.json matches every pack's live registration (run npm run build-index after a pack update)", async () => {
  const live = [];
  for (const pack of Object.keys(PACKS)) for (const t of (await loadPack(pack)).values()) live.push([t.name, pack, t.toolset ?? pack, t.title, t.description, t.keywords]);
  assert.deepEqual(INDEX.tools, live);
  for (const pack of Object.keys(PACKS)) assert.equal(INDEX.versions[pack], JSON.parse(readFileSync(new URL(`../node_modules/${PACKS[pack].package}/package.json`, import.meta.url), "utf8")).version, pack);
});

test("tool names are unique across packs; renamed and omitted tools are accounted for", async () => {
  const names = INDEX.tools.map((t) => t[0]);
  assert.equal(new Set(names).size, names.length);
  for (const [pack, map] of Object.entries(RENAMES)) for (const [from, to] of Object.entries(map)) { assert.ok(names.includes(to), to); assert.ok((await loadPack(pack)).get(to).original === from); }
  for (const [pack, map] of Object.entries(OMITTED)) for (const name of Object.keys(map)) assert.ok(!INDEX.tools.some((t) => t[0] === name && t[1] === pack), `${pack}.${name} should be omitted`);
});

test("the README states the real tool counts per pack", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, new RegExp(`^Every Canli Capital MCP server in one: ${INDEX.tools.length} finance tools`, "m"));
  for (const pack of Object.keys(PACKS)) assert.ok(readme.includes(`| ${pack} | [${PACKS[pack].package}]`) && readme.includes(`| ${INDEX.tools.filter((t) => t[1] === pack).length} |`), pack);
});
