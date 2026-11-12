// Captures the SEC company facts the buybacks tests replay (node scripts/capture-buybacks-fixtures.mjs),
// cut to the tags buybacks reads and Assets (which says what accounts they are in). Microsoft's and
// JPMorgan's go into test/fixtures/manifest.json as b###.gz. Apple's facts there are already cut to other
// tools' tags (r094), so its own cut goes to test/fixtures/buybacks/ and the tests serve it in its place.
// With a folder argument, the CIK##########.json files in it are cut instead of fetching them again.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { BUYBACK_TAGS } from "../src/buybacks.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
const SEC = { "User-Agent": "Canli Capital canli-markets-mcp (+https://canlicapital.com/developers)" };
const KEEP = new Set([...BUYBACK_TAGS, "Assets"]);
const name = (cik) => `CIK${String(cik).padStart(10, "0")}.json`;
const url = (cik) => `https://data.sec.gov/api/xbrl/companyfacts/${name(cik)}`;
const saved = process.argv[2];

async function cut(cik) {
  let text;
  if (saved) text = readFileSync(`${saved}/${name(cik)}`, "utf8");
  else {
    await new Promise((r) => setTimeout(r, 200));
    const res = await fetch(url(cik), { headers: SEC });
    if (!res.ok) throw new Error(`${url(cik)}: ${res.status}`);
    text = await res.text();
  }
  const d = JSON.parse(text);
  d.facts = { "us-gaap": Object.fromEntries(Object.entries(d.facts["us-gaap"] ?? {}).filter(([k]) => KEEP.has(k))) };
  return gzipSync(JSON.stringify(d), { level: 9 });
}

let n = Object.values(manifest).filter((f) => f.startsWith("b")).length;
for (const cik of [789019, 19617]) {
  if (manifest[url(cik)]) continue;
  const file = `b${String(++n).padStart(3, "0")}.gz`;
  writeFileSync(new URL(file, DIR), await cut(cik));
  manifest[url(cik)] = file;
}
mkdirSync(new URL("buybacks/", DIR), { recursive: true });
writeFileSync(new URL(`buybacks/${name(320193)}.gz`, DIR), await cut(320193));
writeFileSync(new URL("manifest.json", DIR), JSON.stringify(manifest, null, 1) + "\n");
console.log(Object.keys(manifest).length, "responses in the manifest");
