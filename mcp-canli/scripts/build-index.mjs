// Writes src/index.json: every tool's name, pack, title, description and keywords, so the server
// can search all packs at startup without loading any of them. test/catalog.test.mjs fails if the
// index and the live packs ever disagree.
import { writeFileSync } from "node:fs";

import { PACKS, loadPack } from "../src/packs.mjs";
import { signature } from "../src/signature.mjs";

const tools = [], versions = {};
for (const pack of Object.keys(PACKS)) {
  const m = await loadPack(pack);
  for (const t of m.values()) tools.push([t.name, pack, t.toolset ?? pack, t.title, t.description, t.keywords, signature(t.input)]);
  versions[pack] = (await import(`${PACKS[pack].package}/package.json`, { with: { type: "json" } })).default.version;
}
writeFileSync(new URL("../src/index.json", import.meta.url), `${JSON.stringify({ versions, tools })}\n`);
console.log(`${tools.length} tools`, versions);
