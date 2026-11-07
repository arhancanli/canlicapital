// The sweep of Report's checks over the SEC's bulk companyfacts archive (scripts/sec-sweep.mjs): entries read from a
// zip as the format lays them out, each company checked as report_check_sec checks it, and every company counted,
// skipped for a stated reason, or listed as an error.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

import { sweep, zipEntries } from "../scripts/sec-sweep.mjs";
import { findingRows } from "../src/data.mjs";
import { checkSecFilings } from "../src/report.mjs";

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// A zip as the format lays it out: each entry's local header and data, then the central directory and its end record.
// An entry may carry an extra field (as most zip tools write) and a comment, which a reader must step over.
function zipOf(files) {
  const parts = [], dir = [];
  let offset = 0;
  for (const { name, text, store, extra = Buffer.alloc(0), comment = Buffer.alloc(0) } of files) {
    const data = Buffer.from(text), body = store ? data : deflateRawSync(data), n = Buffer.from(name);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(store ? 0 : 8, 8);
    head.writeUInt32LE(crc32(data), 14); head.writeUInt32LE(body.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(n.length, 26); head.writeUInt16LE(extra.length, 28);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(store ? 0 : 8, 10);
    entry.writeUInt32LE(crc32(data), 16); entry.writeUInt32LE(body.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(n.length, 28);
    entry.writeUInt16LE(extra.length, 30); entry.writeUInt16LE(comment.length, 32); entry.writeUInt32LE(offset, 42);
    parts.push(head, n, extra, body);
    dir.push(entry, n, extra, comment);
    offset += 30 + n.length + extra.length + body.length;
  }
  const central = Buffer.concat(dir), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, central, end]);
}

const fact = (accn, form, filed, val) => ({ end: "2024-12-31", val, accn, fy: Number(filed.slice(0, 4)), fp: "FY", form, filed });
const company = (cik, facts) => JSON.stringify({ cik, entityName: `Company ${cik}`, facts });
const shares = (...list) => ({ "us-gaap": { CommonStockSharesAuthorized: { units: { shares: list } } } });
// Last year's shares filed in thousands, as in report_check_sec's own test; the second filing is in the year to 19 Sep 2026.
const SLIPPED = company(1, shares(fact("A1", "10-K", "2025-02-14", 1800000000), fact("A2", "10-K", "2026-02-13", 1800000)));
// Ten 10-Qs filed in 2023, the second a thousand times the rest: the slip lies before the last eight.
const MONTHLY = company(7, shares(...Array.from({ length: 10 }, (_, i) => fact(`F${String(i + 1).padStart(2, "0")}`, "10-Q", `2023-${String(i + 1).padStart(2, "0")}-15`, i === 1 ? 1000000 : 1000))));
// An extended-timestamp extra field, as Info-ZIP writes one.
const TIMESTAMP = Buffer.from([0x55, 0x54, 0x05, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
const FILES = [
  { name: "CIK0000000001.json", text: SLIPPED, extra: TIMESTAMP },
  // Filed a year before the archive's date (outside its year), and on that date (inside).
  { name: "CIK0000000002.json", text: company(2, shares(fact("B1", "10-Q", "2024-05-01", 5000), fact("B2", "10-Q", "2025-09-19", 5000), fact("B3", "10-Q", "2026-09-19", 5000))), store: true, extra: TIMESTAMP, comment: Buffer.from("a comment") },
  { name: "CIK0000000007.json", text: MONTHLY },
  { name: "CIK0000000003.json", text: company(3, { dei: { EntityCommonStockSharesOutstanding: { units: { shares: [fact("C1", "10-K", "2025-03-01", 10)] } } } }) },
  { name: "CIK0000000004.json", text: company(4, shares(fact("D1", "8-K", "2025-12-01", 7))) },
  { name: "CIK0000000005.json", text: company(5, { "us-gaap": { Assets: { units: { USD: null } } } }) },
  { name: "CIK0000000006.json", text: "{not json" },
  { name: "README.txt", text: "Not a company.", store: true },
];

function zipFile(files) {
  const path = join(mkdtempSync(join(tmpdir(), "sec-sweep-")), "companyfacts.zip");
  writeFileSync(path, zipOf(files));
  return path;
}

test("a zip's entries come back as they went in, stored or deflated; a file that is not a zip is refused", () => {
  const read = [...zipEntries(zipFile(FILES))];
  assert.deepEqual(read.map((e) => e.name), FILES.map((f) => f.name));
  for (const [i, e] of read.entries()) assert.equal(e.bytes.toString("utf8"), FILES[i].text);
  const notZip = join(mkdtempSync(join(tmpdir(), "sec-sweep-")), "x.zip");
  writeFileSync(notZip, "not a zip at all");
  assert.throws(() => [...zipEntries(notZip)], /is not a zip file/);
});

test("every company is checked as report_check_sec checks it, skipped for a stated reason, or listed as an error", () => {
  const progress = [];
  const result = sweep(zipEntries(zipFile(FILES)), { asOf: "2026-09-19", onProgress: (n) => progress.push(n) });
  assert.equal(result.entries, 8);
  assert.deepEqual(result.skipped, { not_json: 1, unreadable: 1, no_facts: 1, no_reports: 1 });
  assert.deepEqual(result.errors.map((e) => e.entry), ["CIK0000000005.json"], "a company the checks cannot read is listed, not counted as skipped");
  assert.match(result.errors[0].error, /not iterable/);
  assert.deepEqual(result.all, { companies: 3, filings: 15, flagged: 3, flags: 3, by_rule: { scale: 3 } });
  assert.deepEqual(result.recent, { from: "2025-09-19", to: "2026-09-19", companies: 2, filings: 2, flagged: 1, flags: 1, by_rule: { scale: 1 } });
  // The rows are the ones data_pack_sec_findings writes for the same companies: every filing, not only the last eight.
  assert.deepEqual(result.rows, [SLIPPED, MONTHLY].flatMap((text) => findingRows(checkSecFilings(JSON.parse(text), { last: Infinity }))));
  assert.deepEqual(result.rows.map((r) => [r.accession, r.rule, r.prior_flagged]), [["A2", "scale", false], ["F02", "scale", false], ["F03", "scale", true]]);
  assert.deepEqual(progress, [], "progress is told every thousand entries");
  assert.throws(() => sweep([], { asOf: "19 Sep 2026" }), /asOf must be a date/);
});
