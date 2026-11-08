// The data lake: a save is a dated vintage and a panel can be built as the lake knew it on a day; a local file is
// imported with its hash; queries are one read-only statement and DuckDB reaches nothing outside the lake folder; and
// over stdio, a tool's table is saved, queried and pivoted into a panel a backtest reads.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { openLake } from "../local/lake.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
const temp = (t) => { const d = mkdtempSync(path.join(tmpdir(), "canli-lake-")); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

test("a save is a dated vintage, and a panel can be built as the lake knew it on a day", async (t) => {
  const home = temp(t);
  let clock = "2026-11-01T10:00:00.000Z";
  const lake = await openLake(home, { now: () => clock });
  t.after(() => lake.close());
  await lake.save("eq", { columns: ["date", "symbol", "close"], rows: [["2026-10-29", "AAA", 10], ["2026-10-29", "BBB", 20], ["2026-10-30", "AAA", 11], ["2026-10-30", "BBB", 21]] }, { tool: "price_history" });
  clock = "2026-11-05T10:00:00.000Z";
  // A later vintage corrects one value and adds a day.
  await lake.save("eq", { columns: ["date", "symbol", "close"], rows: [["2026-10-30", "AAA", 11.5], ["2026-11-02", "AAA", 12], ["2026-11-02", "BBB", 22]] }, { tool: "price_history" });
  const [listed] = await lake.list();
  assert.deepEqual([listed.dataset, listed.rows, listed.vintages, listed.first_saved, listed.last_saved], ["eq", 7, 2, "2026-11-01T10:00:00.000Z", "2026-11-05T10:00:00.000Z"]);
  assert.deepEqual(listed.source, { tool: "price_history", input_sha256: undefined });

  const now = await lake.panel({ dataset: "eq", date: "date", symbol: "symbol", value: "close", name: "eq_now" });
  assert.deepEqual([now.rows, now.first, now.last, now.symbols], [3, "2026-10-29", "2026-11-02", ["AAA", "BBB"]]);
  assert.equal(readFileSync(now.panel, "utf8"), "date,AAA,BBB\n2026-10-29,10.0,20.0\n2026-10-30,11.5,21.0\n2026-11-02,12.0,22.0\n");
  const then = await lake.panel({ dataset: "eq", date: "date", symbol: "symbol", value: "close", as_of: "2026-11-03", name: "eq_then" });
  assert.equal(readFileSync(then.panel, "utf8"), "date,AAA,BBB\n2026-10-29,10.0,20.0\n2026-10-30,11.0,21.0\n", "the value before its correction, and no later day");
  const one = await lake.panel({ dataset: "eq", date: "date", symbol: "symbol", value: "close", symbols: ["BBB"], start: "2026-10-30", name: "bbb" });
  assert.equal(readFileSync(one.panel, "utf8"), "date,BBB\n2026-10-30,21.0\n2026-11-02,22.0\n");
  await assert.rejects(lake.panel({ dataset: "nope", date: "date", symbol: "symbol", value: "close", name: "x" }), /No dataset nope/);
  await assert.rejects(lake.save("Bad-Name", { columns: ["a"], rows: [[1]] }), /lower-case letters/);
  await assert.rejects(lake.save("eq", { columns: ["_saved_at"], rows: [[1]] }), /the lake's own/);
});

test("a file is imported with its hash; queries are one read-only statement, and nothing outside the lake is reached", async (t) => {
  const home = temp(t);
  const csv = path.join(home, "mine.csv");
  writeFileSync(csv, "date,symbol,close\n2024-01-02,AAA,10\n2024-01-02,BBB,20\n");
  const lake = await openLake(home);
  t.after(() => lake.close());
  const imported = await lake.import("mine", csv);
  assert.equal(imported.rows, 2);
  const meta = JSON.parse(readFileSync(path.join(home, "lake", "mine", "vintages.jsonl"), "utf8"));
  assert.match(meta.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual((await lake.query("SELECT symbol, close FROM mine ORDER BY symbol")).rows, [["AAA", 10], ["BBB", 20]]);
  for (const ok of ["DESCRIBE mine", "SUMMARIZE mine", "WITH a AS (SELECT 1 AS x) SELECT * FROM a", "FROM mine LIMIT 1"]) await lake.query(ok);
  await assert.rejects(lake.query("CREATE TABLE t AS SELECT 1"), /one read-only statement/);
  await assert.rejects(lake.query(`COPY mine TO '${path.join(home, "lake", "x.csv")}'`), /one read-only statement/);
  await assert.rejects(lake.query("SELECT 1; SELECT 2"), /One SQL statement at a time/);
  for (const outside of [`SELECT * FROM read_csv('${csv}')`, "SELECT * FROM read_csv('/etc/hosts')", "SELECT * FROM read_parquet('https://example.com/x.parquet')", "SELECT * FROM glob('/Users/*')", `SELECT * FROM read_csv('${path.join(home, "lake", "..", "mine.csv")}')`]) await assert.rejects(lake.query(outside), /Permission Error/, outside);
  await assert.rejects(lake.query("SELECT * FROM query('SET enable_external_access = true')"), /Expected a single SELECT/);
  await assert.rejects(lake.import("mine", path.join(home, "notes.txt")), /\.csv, \.tsv or \.parquet/);
});

test("over stdio, a tool's table is saved, queried and made a panel a backtest reads; the lake's own tools and writes are refused", async (t) => {
  const home = temp(t);
  const prices = (drift) => Array.from({ length: 300 }, (_, i) => Number((100 * Math.exp(drift * i + 0.02 * Math.sin(i / 5))).toFixed(4)));
  const csv = path.join(home, "long.csv");
  const [a, b] = [prices(0.0004), prices(0.0002)];
  const day = (i) => new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10);
  writeFileSync(csv, `date,symbol,close\n${a.map((p, i) => `${day(i)},AAA,${p}\n${day(i)},BBB,${b[i]}`).join("\n")}\n`);
  const c = new Client({ name: "lake-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_HOME: home, CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } }));
  t.after(() => c.close());
  const run = async (name, args) => { const out = await c.callTool({ name: "run_tool", arguments: { name, arguments: args } }); return out.isError ? { error: out.content[0].text } : JSON.parse(out.content[0].text); };
  // A tool's own table, saved: strategy_sweep answers with columns and rows.
  const saved = await run("lake_save", { dataset: "sweeps", name: "strategy_sweep", arguments: { recipe: "time_series_momentum", arguments: { prices: a }, grid: { lookback: [20, 60] } } });
  assert.equal(saved.rows, 2, JSON.stringify(saved));
  assert.equal((await run("lake_query", { sql: "SELECT count(*) AS n FROM sweeps" })).rows[0][0], 2);
  await run("lake_import", { dataset: "eq", file: csv });
  const panel = await run("lake_panel", { dataset: "eq", date: "date", symbol: "symbol", value: "close", name: "eq_close" });
  assert.equal(panel.rows, 300);
  const bt = await run("backtest_strategy", { family: "momentum", prices_file: panel.panel, prices_column: "AAA", grid: { lookback: [20, 60] } });
  assert.equal(bt.variants.count, 2, JSON.stringify(bt).slice(0, 300));
  assert.match((await run("lake_save", { dataset: "x", name: "lake_list" })).error, /not the lake's own/);
  assert.match((await run("lake_query", { sql: "DROP VIEW eq" })).error, /one read-only statement/);
});
