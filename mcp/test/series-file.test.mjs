// Reading a series from a file: the formats a backtest writes, the column rules, the limits, and
// that no error message repeats what is in the file.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MAX_SERIES_FILE_BYTES, readMatrixFile, readSeriesFile } from "../src/series-file.mjs";
import { createSession, toolAuditBacktest } from "../src/server.mjs";

const dir = mkdtempSync(join(tmpdir(), "canli-series-"));
const file = (name, text) => { const p = join(dir, name); writeFileSync(p, text); return p; };
const values = (p, column) => readSeriesFile(p, column).values;

test("a date,return CSV with a header reads the return column and skips the dates", () => {
  const p = file("dated.csv", "date,return\n2024-01-02,0.01\n2024-01-03,-0.005\n2024-01-04,0.002\n");
  assert.deepEqual(readSeriesFile(p), { values: [0.01, -0.005, 0.002], skipped: [] });
});

test("one number per line, a JSON array, and semicolon or tab separated files all read", () => {
  assert.deepEqual(values(file("plain.txt", "0.01\n-0.02\n\n0.03\n")), [0.01, -0.02, 0.03]);
  assert.deepEqual(values(file("arr.json", "[0.01, -0.02, 0.03]")), [0.01, -0.02, 0.03]);
  assert.deepEqual(values(file("semi.csv", "d;r\nx;0.5\ny;0.25\n")), [0.5, 0.25]);
  assert.deepEqual(values(file("tab.tsv", "d\tr\nx\t1\ny\t2\n")), [1, 2]);
});

test("a pandas export's unnamed or counting index column is skipped and reported", () => {
  const unnamed = file("pandas.csv", ",ret\n0,0.01\n1,-0.02\n2,0.03\n3,0.01\n");
  assert.deepEqual(readSeriesFile(unnamed), { values: [0.01, -0.02, 0.03, 0.01], skipped: [1] });
  const counting = file("counting.csv", "n,ret\n1,0.01\n2,-0.02\n3,0.03\n");
  assert.deepEqual(readSeriesFile(counting), { values: [0.01, -0.02, 0.03], skipped: [1] });
  const matrix = file("pandas-vars.csv", ",a,b\n0,0.1,0.2\n1,0.3,0.4\n2,0.5,0.6\n");
  assert.deepEqual(readMatrixFile(matrix), { matrix: [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]], skipped: [1] });
});

test("several numeric columns need returns_column, by header name or 1-based position", () => {
  const p = file("multi.csv", "date,strategy,benchmark\n2024-01-02,0.01,0.002\n2024-01-03,0.02,0.001\n");
  assert.throws(() => readSeriesFile(p), /2 numeric columns \(positions 2, 3\)/);
  assert.deepEqual(values(p, "benchmark"), [0.002, 0.001]);
  assert.deepEqual(values(p, 2), [0.01, 0.02]);
  assert.throws(() => readSeriesFile(p, "missing"), /matches no numeric column/);
});

test("no error message repeats a cell or a header from the file", () => {
  const secret = "sk-live-0123456789abcdef";
  const attempts = [
    () => readSeriesFile(file("secret.csv", `${secret},token-header\nkey-${secret},0.5\n`)),
    () => readSeriesFile(file("secret2.csv", `${secret},a,b\nx,0.1,0.2\n`), "nope"),
    () => readMatrixFile(file("secret3.csv", `${secret}\n0.5\n`)),
    () => readSeriesFile(file("ragged.csv", `${secret},1\n2\n`)),
    () => readSeriesFile(file(".env", `API_KEY=${secret}\n`)),
  ];
  // Each attempt either yields numbers only or fails; a failure never quotes the file.
  for (const attempt of attempts) {
    let result;
    try {
      result = attempt();
    } catch (error) {
      assert.ok(!error.message.includes(secret) && !error.message.includes("token-header"), error.message);
      continue;
    }
    const numbers = result.values ?? result.matrix.flat();
    assert.ok(numbers.every((v) => typeof v === "number"), "only numbers come back");
  }
});

test("a missing file, a directory, an oversized file and broken JSON are refused", () => {
  assert.throws(() => readSeriesFile(join(dir, "nope.csv")), /no such file/);
  const sub = join(dir, "sub");
  mkdirSync(sub);
  assert.throws(() => readSeriesFile(sub), /not a regular file/);
  const big = file("big.txt", "0.1\n".repeat(Math.ceil((MAX_SERIES_FILE_BYTES + 10) / 4)));
  assert.throws(() => readSeriesFile(big), /larger than/);
  assert.throws(() => readSeriesFile(file("bad.json", "[0.1, ")), /does not parse as JSON/);
});

test("a variants file reads every numeric column as one variant, rows as periods", () => {
  const p = file("variants.csv", "date,a,b,c\n2024-01-02,0.1,0.2,0.3\n2024-01-03,0.4,0.5,0.6\n");
  assert.deepEqual(readMatrixFile(p), { matrix: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]], skipped: [] });
  assert.throws(() => readMatrixFile(file("one.csv", "a\n0.1\n0.2\n")), /at least 2 numeric columns/);
});

let seed = 5;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const RETURNS = Array.from({ length: 300 }, () => Number(((rnd() - 0.47) * 0.02).toFixed(6)));
const VARIANTS = RETURNS.map((r) => [r, Number(((rnd() - 0.5) * 0.02).toFixed(6)), Number(((rnd() - 0.49) * 0.02).toFixed(6))]);
const ARGS = { periods_per_year: 252, effective_independent_trials: 8, cross_trial_sharpe_sd_annualized: 0.4, n_splits: 6 };
const local = () => createSession({ base: "https://example.test", fetchImpl: async () => { throw new Error("no network"); }, local: true });

test("audit_backtest from files equals the audit of the same numbers sent inline", async () => {
  const returnsFile = file("bt.csv", `,ret\n${RETURNS.map((r, i) => `${i},${r}`).join("\n")}\n`);
  const variantsFile = file("vars.csv", `date,a,b,c\n${VARIANTS.map((row, i) => `2024-01-${i},${row.join(",")}`).join("\n")}\n`);
  const fromFiles = JSON.parse((await toolAuditBacktest(local(), { ...ARGS, returns_file: returnsFile, variants_file: variantsFile })).content[0].text);
  const inline = JSON.parse((await toolAuditBacktest(local(), { ...ARGS, returns: RETURNS, variants: VARIANTS })).content[0].text);
  const dataOf = (a) => Object.fromEntries(Object.entries(a.checks).map(([k, v]) => [k, v.data]));
  assert.deepEqual(dataOf(fromFiles), dataOf(inline));
  assert.deepEqual(fromFiles.source, {
    returns_file: returnsFile, observations: 300, skipped_row_counter_columns: [1],
    variants_file: variantsFile, variants: 3, periods: 300,
  });
  assert.equal(inline.source, undefined);
});

test("the hosted endpoint never reads a file, and returns come from exactly one place", async () => {
  const hosted = createSession({ base: "https://example.test", fetchImpl: async () => { throw new Error("no network"); }, hosted: { keySource: "shared" } });
  await assert.rejects(() => toolAuditBacktest(hosted, { ...ARGS, returns_file: "/etc/hosts" }), /hosted endpoint cannot read files/);
  await assert.rejects(() => toolAuditBacktest(hosted, { ...ARGS, returns: RETURNS, variants_file: "/etc/hosts" }), /hosted endpoint cannot read files/);
  await assert.rejects(() => toolAuditBacktest(local(), { ...ARGS, returns: RETURNS, returns_file: "x.csv" }), /exactly one of returns or returns_file/);
  await assert.rejects(() => toolAuditBacktest(local(), { ...ARGS, returns: RETURNS, returns_column: "ret" }), /returns_column applies only to returns_file/);
});
