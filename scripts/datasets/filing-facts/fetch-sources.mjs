// Downloads company records and their raw SEC snapshots from canlicapital.com for FilingFacts.
//   node scripts/datasets/filing-facts/fetch-sources.mjs <ciks.txt> <out-dir>
// ciks.txt: one record file name (0000320193.json) or CIK per line. Existing files are kept, so a
// rerun resumes. Each snapshot is checked against the sha256 its record names, whether it was just
// downloaded or already on disk.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const ORIGIN = "https://canlicapital.com";
const CIK = /^\d{10}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const [list, dir] = process.argv.slice(2);
if (!list || !dir) throw new RangeError("usage: fetch-sources.mjs <ciks.txt> <out-dir>");
mkdirSync(dir, { recursive: true });
const ciks = readFileSync(list, "utf8").split(/\s+/).filter(Boolean).map((l) => l.replace(/\.json$/, "").padStart(10, "0"));
const get = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
// Reads a file if it exists; otherwise returns null. No separate existence check, so nothing can
// change between the check and the read.
const readIfPresent = (path) => { try { return readFileSync(path); } catch (err) { if (err.code === "ENOENT") return null; throw err; } };
// Creates a file only if it does not exist yet; an existing file is never overwritten.
const createOnly = (path, buf) => { try { writeFileSync(path, buf, { flag: "wx" }); } catch (err) { if (err.code !== "EEXIST") throw err; } };
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

let ok = 0, failed = 0;
for (const cik of ciks) {
  try {
    if (!CIK.test(cik)) throw new Error("not a ten-digit CIK");
    const recPath = join(dir, `${cik}.json`), rawPath = join(dir, `${cik}.raw.json.gz`);
    let recBuf = readIfPresent(recPath);
    const fresh = recBuf === null;
    if (fresh) recBuf = await get(`${ORIGIN}/company-data/${cik}.json`);
    const record = JSON.parse(recBuf.toString("utf8"));
    if (record.cik !== cik) throw new Error(`record names CIK ${record.cik}`);
    if (!SHA256.test(record.source_sha256 ?? "")) throw new Error("record has no valid source_sha256");
    if (fresh) createOnly(recPath, recBuf);
    let gz = readIfPresent(rawPath);
    const rawFresh = gz === null;
    if (rawFresh) gz = await get(`${ORIGIN}/company-data/sources/${record.source_sha256}.json.gz`);
    if (sha256(gunzipSync(gz)) !== record.source_sha256) throw new Error("snapshot does not match its record's sha256");
    if (rawFresh) createOnly(rawPath, gz);
    ok += 1;
  } catch (err) { failed += 1; console.error(`${cik}: ${err.message}`); }
}
console.log(JSON.stringify({ requested: ciks.length, ok, failed, dir }));
