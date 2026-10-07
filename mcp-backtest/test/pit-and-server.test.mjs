import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { annualAsOf, buildFactorPanel, factorAsOf } from "../src/pit.mjs";
import { parsePanel } from "../src/panel-io.mjs";
import { monthStarts } from "../src/server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tempDir = (t) => { const d = mkdtempSync(path.join(tmpdir(), "canli-bt-")); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
// One annual period: its filings (vintages), oldest first.
const period = (end, ...vintages) => ({ kind: "annual", end, vintages: vintages.map(([filed, val]) => ({ filed, val, accn: `a-${filed}` })) });

test("a value is invisible before its filing date, and a restatement only after it is filed", () => {
  const revenue = { periods: [period("2022-12-31", ["2023-02-10", 100], ["2024-02-12", 90]), period("2023-12-31", ["2024-02-12", 120])] };
  assert.deepEqual(annualAsOf(revenue, "2023-02-09"), []);
  assert.equal(annualAsOf(revenue, "2023-06-01")[0].val, 100, "first-reported value before the restatement");
  const known = annualAsOf(revenue, "2024-03-01");
  assert.deepEqual(known.map((r) => [r.end, r.val]), [["2023-12-31", 120], ["2022-12-31", 90]]);
  assert.ok(Math.abs(factorAsOf("revenue_growth", { revenue }, "2024-03-01") - (120 / 90 - 1)) < 1e-12);
  assert.equal(factorAsOf("revenue_growth", { revenue }, "2023-06-01"), null, "growth needs two fiscal years known");
});

test("ratios pair the same fiscal year, never a newer numerator with an older denominator", () => {
  const net_income = { periods: [period("2023-12-31", ["2024-02-01", 10])] };
  const assets = { periods: [period("2022-12-31", ["2023-02-01", 100])] };
  assert.equal(factorAsOf("roa", { net_income, assets }, "2024-03-01"), null);
  assets.periods.push(period("2023-12-31", ["2024-02-01", 200]));
  assert.equal(factorAsOf("roa", { net_income, assets }, "2024-03-01"), 0.05);
  assert.throws(() => factorAsOf("magic", {}, "2024-01-01"), /unknown factor/);
});

test("the panel keeps a ticker that fails as missing and reports coverage per date", async () => {
  const loadSeries = async (t) => {
    if (t === "BAD") throw new Error("CIK 1 is not in the Canli company reference. More text");
    return { matchedName: `${t} Inc.`, series: { assets: { periods: [period("2022-12-31", ["2023-02-01", 1]), period("2023-12-31", ["2024-02-01", 2])] } } };
  };
  const panel = await buildFactorPanel({ factor: "asset_growth", tickers: ["AAA", "BAD"], dates: ["2023-06-01", "2024-06-03"], loadSeries });
  assert.deepEqual(panel.values.AAA, [null, 1]);
  assert.deepEqual(panel.missing, { BAD: "CIK 1 is not in the Canli company reference" });
  assert.deepEqual(panel.coverage.map((c) => c.companies_with_value), [0, 1]);
});

test("panels refuse unordered dates and non-numbers, and read blanks as missing", () => {
  assert.deepEqual(parsePanel("date,A,B\n2024-01-02,1,\n2024-01-03,NaN,2\n").values, { A: [1, null], B: [null, 2] });
  assert.throws(() => parsePanel("date,A\n2024-01-03,1\n2024-01-02,1\n"), /strictly increasing/);
  assert.throws(() => parsePanel("date,A\n2024-01-02,abc\n"), /is not a number/);
  assert.throws(() => parsePanel("day,A\n2024-01-02,1\n"), /first column must be "date"/);
  assert.deepEqual(monthStarts("2024-06-01", "2024-08-31"), ["2024-06-03", "2024-07-01", "2024-08-01"]);
});

test("a release never depends on a local package path", () => {
  const pkg = JSON.parse(readFileSync(path.join(HERE, "../package.json"), "utf8"));
  const changelog = readFileSync(path.join(HERE, "../CHANGELOG.md"), "utf8");
  const released = new RegExp(`^## ${pkg.version.replaceAll(".", "\\.")}\\b`, "m").test(changelog);
  const local = Object.entries(pkg.dependencies).filter(([, v]) => v.startsWith("file:"));
  if (released) assert.deepEqual(local, [], "replace file: dependencies with published versions before releasing");
});

test("over stdio: backtest_signal runs on CSV files and records every run in the ledger", async (t) => {
  const dir = tempDir(t);
  // 30 tickers, 300 business days; the signal is known a day before it matters and carries a small edge.
  let s = 3;
  const u = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const dates = [];
  const d = new Date(Date.UTC(2021, 0, 4));
  while (dates.length < 300) { if (d.getUTCDay() % 6) dates.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  const names = Array.from({ length: 30 }, (_, i) => `N${i}`);
  const quality = names.map((_, i) => (i % 3) - 1);
  const px = names.map(() => [100]);
  for (let k = 1; k < dates.length; k += 1) names.forEach((_, i) => px[i].push(px[i][k - 1] * (1 + 0.0005 * quality[i] + 0.012 * (u() - 0.5))));
  const csv = (rows) => ["date," + names.join(","), ...dates.map((dt, k) => `${dt},${rows.map((r) => r[k]).join(",")}`)].join("\n") + "\n";
  writeFileSync(path.join(dir, "prices.csv"), csv(px));
  writeFileSync(path.join(dir, "signal.csv"), csv(names.map((_, i) => dates.map(() => quality[i] + u()))));
  const client = new Client({ name: "backtest-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(HERE, "../src/server.mjs")], env: { ...process.env, CANLI_LEDGER_DIR: dir } }));
  t.after(() => client.close());
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((x) => x.name).sort(), ["backtest_signal", "list_factors", "pit_factor"]);
  for (const q of [0.2, 0.33]) {
    const res = await client.callTool({ name: "backtest_signal", arguments: { prices_file: path.join(dir, "prices.csv"), signal_file: path.join(dir, "signal.csv"), quantile: q, ledger: "test-search" } });
    assert.ok(!res.isError, JSON.stringify(res.content));
    assert.ok(res.structuredContent.causality.min_days_signal_to_trade >= 1);
  }
  const last = (await client.callTool({ name: "backtest_signal", arguments: { prices_file: path.join(dir, "prices.csv"), signal_file: path.join(dir, "signal.csv"), cost_bps: 0, ledger: "test-search" } })).structuredContent;
  assert.equal(last.search.trials, 3);
  assert.ok(last.search.deflated && last.search.plain_reading.includes("Across 3 recorded trials"));
});
