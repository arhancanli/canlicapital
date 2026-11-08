// The sample of the sweep's flags to read in the filings (scripts/sec-sample.mjs): drawn only from the window, per
// stratum, in an order anyone can recompute from data.csv and the seed, and written so that a sample being read is
// never overwritten.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { drawSample, filingUrl, SAMPLE_COLUMNS, stratumOf } from "../scripts/sec-sample.mjs";
import { parseCsv } from "../src/close.mjs";
import { FINDING_COLUMNS, packDataset } from "../src/data.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/sec-sample.mjs", import.meta.url));
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const WINDOW = { from: "2025-09-19", to: "2026-09-19" };

let n = 0;
const flag = (over) => ({ cik: 320193, entity: "Example Inc.", taxonomy: "us-gaap", accession: `0000320193-26-${String(++n).padStart(6, "0")}`, form: "10-Q", filed: "2026-02-01", rule: "scale", concept: "Revenues", unit: "USD", start: "2025-10-01", end: "2025-12-31", value: n * 1000, prior_value: n, prior_start: "2025-10-01", prior_end: "2025-12-31", prior_flagged: false, detail: "check the scale", ...over });
const FLAGS = [
  ...Array.from({ length: 30 }, () => flag()),
  flag({ entity: 'Owens & "Minor", Inc.' }),
  flag({ unit: "CNY", taxonomy: "ifrs-full", form: "20-F", cik: "0001828098", accession: "0001213900-26-050174" }),
  flag({ unit: "CNY", filed: "2026-09-19" }),
  ...Array.from({ length: 5 }, () => flag({ unit: "shares", concept: "WeightedAverageNumberOfSharesOutstandingBasic" })),
  flag({ unit: "USD/shares", concept: "EarningsPerShareBasic" }),
  flag({ unit: "pure", concept: "EffectiveIncomeTaxRateContinuingOperations" }),
  ...Array.from({ length: 3 }, () => flag({ rule: "balance", concept: "Assets", start: null, prior_value: null, prior_start: null, prior_end: null })),
  flag({ rule: "sign", concept: "Revenues", value: -5 }),
  flag({ filed: "2025-09-19" }),
  flag({ filed: "2026-09-20" }),
  flag({ rule: "sign", filed: "2024-01-10" }),
];
const CSV = packDataset({ name: "sec-report-flags", source: "a test", license: "other", columns: FINDING_COLUMNS, rows: FLAGS }).csv;
const LINES = CSV.split("\n").slice(1, -1);
const inWindow = (f) => f.filed > WINDOW.from && f.filed <= WINDOW.to;

test("flags are put in strata by rule, and scale flags by unit", () => {
  assert.equal(stratumOf({ rule: "scale", unit: "USD" }), "scale-money");
  assert.equal(stratumOf({ rule: "scale", unit: "CNY" }), "scale-money");
  assert.equal(stratumOf({ rule: "scale", unit: "shares" }), "scale-shares");
  assert.equal(stratumOf({ rule: "scale", unit: "USD/shares" }), "scale-per-share");
  assert.equal(stratumOf({ rule: "scale", unit: "pure" }), "scale-other");
  assert.equal(stratumOf({ rule: "scale", unit: "Bitcoin" }), "scale-other");
  assert.equal(stratumOf({ rule: "balance", unit: "USD" }), "balance");
  assert.equal(stratumOf({ rule: "sign", unit: "USD" }), "sign");
});

test("the sample comes from the window only, the first `per` of each stratum, with each stratum's size", () => {
  const s = drawSample(CSV, { ...WINDOW, per: 4 });
  assert.deepEqual(s.strata, {
    balance: { flags: 3, drawn: 3 },
    "scale-money": { flags: 33, drawn: 4 },
    "scale-other": { flags: 1, drawn: 1 },
    "scale-per-share": { flags: 1, drawn: 1 },
    "scale-shares": { flags: 5, drawn: 4 },
    sign: { flags: 1, drawn: 1 },
  });
  assert.equal(s.rows.length, 14);
  for (const r of s.rows) {
    assert.ok(inWindow(r), `${r.accession} filed ${r.filed} is outside the window`);
    assert.equal(r.stratum, stratumOf(r));
    assert.equal(r.stratum_flags, s.strata[r.stratum].flags);
    assert.equal(r.filing, filingUrl(r.cik, r.accession));
    assert.equal(r.verdict, "");
  }
  // companyfacts gives some CIKs zero-padded; EDGAR's folders are named by the number.
  assert.equal(filingUrl("0001828098", "0001213900-26-050174"), "https://www.sec.gov/Archives/edgar/data/1828098/000121390026050174/");
  assert.equal(filingUrl("320193", "0000320193-26-000001"), "https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/");
  assert.deepEqual(s.rows.filter((r) => r.stratum === "scale-shares").map((r) => r.rank), [1, 2, 3, 4]);
  assert.throws(() => drawSample(CSV, { ...WINDOW, per: 0 }), /per must be/);
  assert.throws(() => drawSample(CSV, { from: "2025-9-19", to: WINDOW.to, per: 4 }), /from must be a date/);
  assert.throws(() => drawSample("a,b\n1,2\n", { ...WINDOW, per: 4 }), /not the sweep's data.csv/);
});

test("the order is the SHA-256 of the seed and the flag's line, so the draw repeats and a larger one starts with a smaller", () => {
  const all = drawSample(CSV, { ...WINDOW, per: 100 });
  assert.equal(all.seed, sha256(CSV));
  assert.equal(all.sha256, sha256(CSV));
  // Recomputed from data.csv's own lines, as someone without this script would.
  const expected = LINES.filter((_, i) => inWindow(FLAGS[i]) && stratumOf(FLAGS[i]) === "scale-money")
    .map((l) => ({ l, order: sha256(`${all.seed}\n${l}`) })).sort((a, b) => (a.order < b.order ? -1 : 1)).map(({ l }) => parseCsv(l)[0][3]);
  const money = (s) => s.rows.filter((r) => r.stratum === "scale-money").map((r) => r.accession);
  assert.deepEqual(money(all), expected);
  assert.ok(all.rows.some((r) => r.entity === 'Owens & "Minor", Inc.'));
  const small = drawSample(CSV, { ...WINDOW, per: 4 });
  assert.deepEqual(drawSample(CSV, { ...WINDOW, per: 4 }), small);
  for (const name of Object.keys(small.strata)) {
    const pick = (s) => s.rows.filter((r) => r.stratum === name).map((r) => r.accession);
    assert.deepEqual(pick(all).slice(0, pick(small).length), pick(small));
  }
  const seeded = drawSample(CSV, { ...WINDOW, per: 100, seed: "another seed" });
  assert.equal(seeded.seed, "another seed");
  assert.notDeepEqual(money(seeded), money(all));
  assert.deepEqual([...money(seeded)].sort(), [...money(all)].sort());
});

test("the script writes sample.csv and sample.json to a new directory and never overwrites a sample", () => {
  const dir = mkdtempSync(join(tmpdir(), "sec-sample-"));
  const data = join(dir, "data.csv"), out = join(dir, "sample");
  writeFileSync(data, CSV);
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  const args = [data, out, "--from", WINDOW.from, "--to", WINDOW.to, "--per", "2"];
  assert.equal(run(...args).status, 0);
  const [header, ...rows] = parseCsv(readFileSync(join(out, "sample.csv"), "utf8"));
  assert.deepEqual(header, SAMPLE_COLUMNS);
  const record = JSON.parse(readFileSync(join(out, "sample.json"), "utf8"));
  assert.equal(record.schema, "canli.report-sec-sample.v1");
  assert.deepEqual(record.data_csv, { file: data, sha256: sha256(CSV) });
  assert.equal(record.seed, sha256(CSV));
  assert.equal(rows.length, Object.values(record.strata).reduce((s, x) => s + x.drawn, 0));
  const expected = drawSample(CSV, { ...WINDOW, per: 2 }).rows.map((r) => SAMPLE_COLUMNS.map((c) => String(r[c])));
  assert.deepEqual(rows, expected);
  writeFileSync(join(out, "sample.csv"), "verdicts being read\n");
  assert.notEqual(run(...args).status, 0);
  assert.equal(readFileSync(join(out, "sample.csv"), "utf8"), "verdicts being read\n");
  assert.equal(run(data, join(dir, "other"), "--from", WINDOW.from, "--to", WINDOW.to, "--per", "2", "--seeds", "x").status, 2);
  assert.equal(existsSync(join(dir, "other")), false);
});
