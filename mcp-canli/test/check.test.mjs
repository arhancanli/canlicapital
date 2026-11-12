// `canli-mcp check` for CI and `canli-mcp run` for shells: what they read, what they say, how they exit.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { asMarkdown, checkReport, readReturns } from "../src/check.mjs";

const SERVER = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [SERVER, ...args], { encoding: "utf8", env: { ...process.env, CANLI_DISK_CACHE: "0" } });

test("returns are read from the one column that is not a date, or the one asked for", () => {
  assert.deepEqual(readReturns("date,r\n2024-01-01,0.1\n2024-01-02,\n2024-01-03,-0.2\n").returns, [0.1, -0.2]);
  const two = "date,a,b\n2024-01-01,1,2\n2024-01-02,3,4\n";
  assert.deepEqual(readReturns(two, "b").returns, [2, 4]);
  assert.throws(() => readReturns(two), /choose one with --column: a, b/);
  assert.throws(() => readReturns(two, "z"), /No column z/);
  assert.throws(() => readReturns("r\n0.1\noops\n"), /Row 3: oops is not a number/);
  assert.throws(() => readReturns("r\n"), /at least two rows/);
});

test("the report keeps the limits, leaves out what does not apply here, and never says passed", () => {
  const report = checkReport({ file: "f.csv", bytes: Buffer.from("x"), column: "r", count: 2, trials: 40, version: "1", result: { data: { result: { deflated_sharpe_ratio: 0.99, expected_max_sharpe_annualized: 1 }, plain_reading: "reading" }, limits: ["A limit that stays.", "The receipt is signed.", "Quotas: many."] } });
  assert.deepEqual(report.limits, ["A limit that stays."]);
  assert.equal(report.file_sha256, "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881");
  const text = asMarkdown(report);
  assert.match(text, /99\.0%/);
  assert.match(text, /does not say the strategy is valid/);
  assert.doesNotMatch(text.replace(/does not say the strategy is valid/, ""), /\b(?:passed|verified|approved|valid)\b/i);
});

test("from the command line: figures in words, JSON on request, and it fails only under a floor you set", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "canli-check-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "r.csv");
  let s = 3;
  const u = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  writeFileSync(file, `date,r\n${Array.from({ length: 300 }, (_, i) => `d${i},${(0.02 * (u() - 0.5)).toFixed(6)}`).join("\n")}\n`);
  const plain = cli("check", file, "--trials", "40");
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /Luck check/);
  assert.match(plain.stdout, /across 40 tries/);
  const json = cli("check", file, "--trials", "40", "--format", "json");
  assert.equal(JSON.parse(json.stdout).observations, 300);
  assert.equal(cli("check", file, "--trials", "40", "--at-least", "0.999999").status, 1);
  assert.equal(cli("check", file, "--trials", "40", "--at-least", "0").status, 0);
  assert.equal(cli("check", file).status, 2, "the count of variants is never assumed");
  const run = cli("run", "return_stats", '{"returns":[0.01,-0.02,0.03,0.01],"periods_per_year":252}');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).periods, 4);
  assert.equal(cli("run").status, 2);
});

test("run reaches the tools the server answers itself, not only a pack's", () => {
  const hub = cli("run", "hub_list", '{"query":"momentum"}');
  assert.equal(hub.status, 0, hub.stderr);
  assert.ok(JSON.parse(hub.stdout).rows.length > 0);
  const found = cli("run", "find_tool", '{"query":"insider trades"}');
  assert.equal(found.status, 0, found.stderr);
  assert.match(found.stdout, /insider_trades/);
});

test("every desk tool has an answer here, so none falls through to a pack's runner", async () => {
  const { ENTRIES, selfTools, createKeeper } = await import("../src/server.mjs");
  const self = selfTools([], null, createKeeper());
  for (const e of ENTRIES.filter((x) => x.pack === "desk")) assert.equal(typeof self[e.name], "function", e.name);
});

test("run refuses a tool that sends orders", () => {
  const r = spawnSync(process.execPath, [SERVER, "run", "send_paper_orders", "{}"], { encoding: "utf8", env: { ...process.env, CANLI_PACKS: "paper" } });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /sends orders/);
});
