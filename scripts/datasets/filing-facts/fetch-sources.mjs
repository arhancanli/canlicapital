// Downloads company records and their raw SEC snapshots from canlicapital.com for FilingFacts.
//   node scripts/datasets/filing-facts/fetch-sources.mjs <ciks.txt> <out-dir>
// ciks.txt: one record file name (0000320193.json) or CIK per line. Existing files are kept, so a
// rerun resumes. Each snapshot is checked against the sha256 its record names.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ORIGIN = "https://canlicapital.com";
const [list, dir] = process.argv.slice(2);
if (!list || !dir) throw new RangeError("usage: fetch-sources.mjs <ciks.txt> <out-dir>");
mkdirSync(dir, { recursive: true });
const ciks = readFileSync(list, "utf8").split(/\s+/).filter(Boolean).map((l) => l.replace(/\.json$/, "").padStart(10, "0"));
const get = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
let ok = 0, failed = 0;
for (const cik of ciks) {
  try {
    const recPath = join(dir, `${cik}.json`), rawPath = join(dir, `${cik}.raw.json.gz`);
    if (!existsSync(recPath)) writeFileSync(recPath, await get(`${ORIGIN}/company-data/${cik}.json`));
    const record = JSON.parse(readFileSync(recPath, "utf8"));
    if (!existsSync(rawPath)) {
      const gz = await get(`${ORIGIN}/company-data/sources/${record.source_sha256}.json.gz`);
      const { gunzipSync } = await import("node:zlib");
      if (createHash("sha256").update(gunzipSync(gz)).digest("hex") !== record.source_sha256) throw new Error("snapshot does not match its record's sha256");
      writeFileSync(rawPath, gz);
    }
    ok += 1;
  } catch (err) { failed += 1; console.error(`${cik}: ${err.message}`); }
}
console.log(JSON.stringify({ requested: ciks.length, ok, failed, dir }));
