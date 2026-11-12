// mcp-books/scripts/sec-sweep.mjs
//
// Report's checks (report_check_sec) on every company in the SEC's bulk companyfacts archive
// (https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip: one CIK##########.json per filer), read entry
// by entry from the zip, never unpacked. Writes to a new directory:
// - summary.json: companies, filings checked, filings with a flag and flags by rule, for every filing and for those
//   filed in the year to --as-of (the archive's date), with any company the checks could not read listed by name;
// - data.csv and README.md: every flag, as data_pack_sec_findings writes them.
// Flags point at facts to look at, not errors proved: a sample is read in the filings before any rate is published,
// and publishing is the owner's decision.
//
//   node mcp-books/scripts/sec-sweep.mjs companyfacts.zip out_dir --as-of 2026-09-19
import { createHash } from "node:crypto";
import { closeSync, fstatSync, mkdirSync, openSync, readSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

import { FINDING_COLUMNS, findingRows, packDataset } from "../src/data.mjs";
import { checkSecFilings, SEC_FORMS } from "../src/report.mjs";

function readAt(fd, length, position) {
  const buf = Buffer.alloc(length);
  for (let n = 0; n < length;) {
    const got = readSync(fd, buf, n, length - n, position + n);
    if (!got) throw new Error("The zip file ends early");
    n += got;
  }
  return buf;
}

// A zip file's entries one at a time, { name, bytes }: the central directory read from the end of the file, each entry
// stored or deflated. An archive over 4 GB (zip64) is refused rather than misread.
export function* zipEntries(path) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const tail = readAt(fd, Math.min(size, 22 + 0xffff), Math.max(0, size - 22 - 0xffff));
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0) throw new Error(`${path} is not a zip file`);
    const [count, dirSize, dirOffset] = [tail.readUInt16LE(end + 10), tail.readUInt32LE(end + 12), tail.readUInt32LE(end + 16)];
    if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) throw new Error(`${path} is a zip64 archive, which this does not read`);
    const dir = readAt(fd, dirSize, dirOffset);
    for (let i = 0, at = 0; i < count; i++) {
      if (dir.readUInt32LE(at) !== 0x02014b50) throw new Error(`${path}: entry ${i + 1} of the central directory is damaged`);
      const method = dir.readUInt16LE(at + 10);
      const compressed = dir.readUInt32LE(at + 20);
      const local = dir.readUInt32LE(at + 42);
      const nameLength = dir.readUInt16LE(at + 28);
      const name = dir.toString("utf8", at + 46, at + 46 + nameLength);
      at += 46 + nameLength + dir.readUInt16LE(at + 30) + dir.readUInt16LE(at + 32);
      if (method !== 0 && method !== 8) throw new Error(`${path}: ${name} uses compression method ${method}`);
      const header = readAt(fd, 30, local);
      if (header.readUInt32LE(0) !== 0x04034b50) throw new Error(`${path}: the header of ${name} is damaged`);
      const data = readAt(fd, compressed, local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28));
      yield { name, bytes: method === 8 ? inflateRawSync(data) : data };
    }
  } finally {
    closeSync(fd);
  }
}

const tally = () => ({ companies: 0, filings: 0, flagged: 0, flags: 0, by_rule: {} });

// Each company's filings checked as report_check_sec checks them (every filing, not only the last eight), counted for
// all filings and for those filed in the year to asOf. A company the checks cannot read is listed, never hidden.
export function sweep(entries, { asOf, forms = SEC_FORMS, onProgress } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? "")) throw new Error("asOf must be a date, YYYY-MM-DD");
  const from = `${Number(asOf.slice(0, 4)) - 1}${asOf.slice(4)}`;
  const inYear = (filed) => filed > from && filed <= asOf;
  const all = tally(), recent = tally();
  const skipped = { not_json: 0, unreadable: 0, no_facts: 0, no_reports: 0 };
  const errors = [];
  const rows = [];
  let entries_read = 0;
  for (const { name, bytes } of entries) {
    if (++entries_read % 1000 === 0) onProgress?.(entries_read);
    if (!name.endsWith(".json")) { skipped.not_json++; continue; }
    let facts, checked;
    try { facts = JSON.parse(bytes.toString("utf8")); } catch { skipped.unreadable++; continue; }
    try {
      checked = checkSecFilings(facts, { forms, last: Infinity });
    } catch (e) {
      if (/no us-gaap or ifrs-full facts/.test(e.message)) skipped.no_facts++;
      else errors.push({ entry: name, error: e.message });
      continue;
    }
    if (!checked.checked) { skipped.no_reports++; continue; }
    all.companies++;
    if (checked.filings.some((f) => inYear(f.filed))) recent.companies++;
    for (const f of checked.filings) {
      for (const t of inYear(f.filed) ? [all, recent] : [all]) {
        t.filings++;
        if (!f.ok) t.flagged++;
        t.flags += f.findings.length;
        for (const x of f.findings) t.by_rule[x.rule] = (t.by_rule[x.rule] ?? 0) + 1;
      }
    }
    rows.push(...findingRows(checked));
  }
  return { entries: entries_read, skipped, errors, all, recent: { from, to: asOf, ...recent }, rows };
}

function fileSha256(path) {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(1 << 22);
    for (let n; (n = readSync(fd, buf, 0, buf.length, null)) > 0;) hash.update(buf.subarray(0, n));
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [zip, out, flag, asOf] = process.argv.slice(2);
  if (!zip || !out || flag !== "--as-of" || !asOf) {
    console.error("Usage: node mcp-books/scripts/sec-sweep.mjs companyfacts.zip out_dir --as-of YYYY-MM-DD");
    process.exit(2);
  }
  mkdirSync(out); // a new directory: an earlier run is never overwritten
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 1000);
  const archive = { file: zip, sha256: fileSha256(zip) };
  const { rows, ...result } = sweep(zipEntries(zip), { asOf, onProgress: (n) => console.error(`read ${n} entries, ${seconds()} s`) });
  const pack = packDataset({
    name: "sec-report-flags",
    title: "Report's flags on the SEC's bulk companyfacts",
    description: `Report's checks (report_check_sec) on every 10-K, 10-Q, 20-F and 40-F in the SEC's companyfacts archive of ${asOf}. A flag points at a fact to look at, not an error proved. Not published: whether and how is the owner's decision.`,
    source: `companyfacts.zip, SHA-256 ${archive.sha256}`,
    license: "other",
    columns: FINDING_COLUMNS,
    rows,
  });
  writeFileSync(join(out, "data.csv"), pack.csv, { flag: "wx" });
  writeFileSync(join(out, "README.md"), pack.card, { flag: "wx" });
  const summary = { schema: "canli.report-sec-sweep.v1", archive, as_of: asOf, forms: SEC_FORMS, ...result, flags_csv: { rows: pack.rows, sha256: pack.sha256 }, seconds: seconds() };
  writeFileSync(join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx" });
  console.error(`DONE ${result.entries} entries, ${result.all.companies} companies, ${result.all.filings} filings, ${result.all.flagged} with a flag, ${result.errors.length} errors, ${seconds()} s`);
}
