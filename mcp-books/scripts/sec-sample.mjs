// mcp-books/scripts/sec-sample.mjs
//
// A random sample of the sweep's flags (sec-sweep.mjs's data.csv) to read in the filings, so that how many flags are
// real slips is estimated before any rate is published. The flags filed in a window are put in strata (scale on money,
// shares, per-share amounts and other units; balance; sign; duplicate), and each stratum is ordered by the SHA-256 of
// the seed, a line end and the flag's line in data.csv. Anyone with the same data.csv and seed draws the same sample,
// and a larger sample starts with the smaller one. Without --seed the seed is data.csv's own SHA-256, so no one picks
// it. Writes to a new directory:
// - sample.csv: each flag drawn, with its stratum, the stratum's size in the window and the flag's rank in it, the
//   filing's folder on EDGAR, and empty verdict and note columns for the reader;
// - sample.json: data.csv's SHA-256, the window, the seed and each stratum's size and draw.
//
//   node mcp-books/scripts/sec-sample.mjs data.csv out_dir --from 2025-09-19 --to 2026-09-19 --per 4 [--seed text]
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { parseCsv } from "../src/close.mjs";
import { FINDING_COLUMNS } from "../src/data.mjs";

// A line as data.csv writes it (packDataset): a field is quoted only when it holds a quote, comma or line end.
const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const line = (fields) => fields.map(cell).join(",");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

export const SAMPLE_COLUMNS = ["stratum", "stratum_flags", "rank", ...FINDING_COLUMNS.map((c) => c.name), "filing", "verdict", "note"];

// Scale flags are split by unit: a slip in a share count and one in dollars are read in different places.
export function stratumOf(flag) {
  if (flag.rule !== "scale") return flag.rule;
  if (/^[A-Z]{3}$/.test(flag.unit)) return "scale-money";
  if (flag.unit === "shares") return "scale-shares";
  if (flag.unit.endsWith("/shares")) return "scale-per-share";
  return "scale-other";
}

// companyfacts gives some CIKs zero-padded ("0001851484"); EDGAR's folders are named by the number.
export const filingUrl = (cik, accession) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}/`;

// csv: data.csv's text. The flags filed after `from`, up to and including `to`; the first `per` of each stratum.
export function drawSample(csv, { from, to, per, seed } = {}) {
  for (const [name, date] of Object.entries({ from, to })) if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error(`${name} must be a date, YYYY-MM-DD`);
  if (!Number.isInteger(per) || per < 1) throw new Error("per must be a whole number of flags, 1 or more");
  const [header = [], ...lines] = parseCsv(csv);
  const names = FINDING_COLUMNS.map((c) => c.name);
  if (line(header) !== line(names)) throw new Error("This is not the sweep's data.csv: its columns differ");
  const digest = sha256(csv);
  seed ??= digest;
  const strata = new Map();
  for (const fields of lines) {
    const flag = Object.fromEntries(names.map((n, i) => [n, fields[i] ?? ""]));
    if (!(flag.filed > from && flag.filed <= to)) continue;
    const name = stratumOf(flag);
    if (!strata.has(name)) strata.set(name, []);
    strata.get(name).push({ order: sha256(`${seed}\n${line(fields)}`), flag });
  }
  const sizes = {}, rows = [];
  for (const [name, list] of [...strata].sort(([a], [b]) => (a < b ? -1 : 1))) {
    list.sort((a, b) => (a.order < b.order ? -1 : 1));
    const drawn = list.slice(0, per);
    sizes[name] = { flags: list.length, drawn: drawn.length };
    drawn.forEach(({ flag }, i) => rows.push({ stratum: name, stratum_flags: list.length, rank: i + 1, ...flag, filing: filingUrl(flag.cik, flag.accession), verdict: "", note: "" }));
  }
  return { sha256: digest, seed, strata: sizes, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [data, out, ...rest] = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) opts[rest[i]] = rest[i + 1];
  const known = ["--from", "--to", "--per", "--seed"];
  if (!data || !out || rest.length % 2 || Object.keys(opts).some((k) => !known.includes(k)) || !opts["--from"] || !opts["--to"] || !opts["--per"]) {
    console.error("Usage: node mcp-books/scripts/sec-sample.mjs data.csv out_dir --from YYYY-MM-DD --to YYYY-MM-DD --per N [--seed text]");
    process.exit(2);
  }
  const sample = drawSample(readFileSync(data, "utf8"), { from: opts["--from"], to: opts["--to"], per: Number(opts["--per"]), seed: opts["--seed"] });
  mkdirSync(out); // a new directory: a sample being read is never overwritten
  writeFileSync(join(out, "sample.csv"), `${[line(SAMPLE_COLUMNS), ...sample.rows.map((r) => line(SAMPLE_COLUMNS.map((c) => r[c])))].join("\n")}\n`, { flag: "wx" });
  const record = { schema: "canli.report-sec-sample.v1", data_csv: { file: data, sha256: sample.sha256 }, from: opts["--from"], to: opts["--to"], per: Number(opts["--per"]), seed: sample.seed, strata: sample.strata };
  writeFileSync(join(out, "sample.json"), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  console.error(`${sample.rows.length} flags drawn from ${Object.keys(sample.strata).length} strata into ${out}`);
}
