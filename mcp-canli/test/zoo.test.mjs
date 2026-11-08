// The Null Zoo: trials kept encrypted on this machine and chained, so a removed line shows; a wrong or malformed key is
// refused; the data a strategy ran on is keyed by its numbers or its files' bytes; a second session on the same data
// is judged with the first session's tries; and over stdio, red_team writes to it, zoo_stats reads it, and
// CANLI_NULL_ZOO=off keeps it closed.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { openZoo } from "../local/zoo.mjs";
import { createLuck } from "../src/luck.mjs";
import { createRedTeam, runRedTeam } from "../src/redteam.mjs";
import { allSessionsLuck, dataKeyOf, runZooSearch, runZooStats } from "../src/zoo.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
const temp = (t) => { const d = mkdtempSync(path.join(tmpdir(), "canli-zoo-")); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const row = (label, sharpe, extra = {}) => ({ at: "2026-11-08T12:00:00.000Z", session: "s1", tool: "backtest_breakout", label, params: {}, sharpe_annualized: sharpe, periods: 1000, periods_per_year: 252, data_key: "ab".repeat(32), outcome: "failed", failed: ["luck"], ...extra });

test("trials are kept encrypted and chained; a removed line shows; a wrong or malformed key is refused", (t) => {
  const home = temp(t);
  const zoo = openZoo(home, { env: {} });
  zoo.append([row("breakout lookback=20", 0.4), row("breakout lookback=55", 0.7), row("breakout lookback=120", 0.2)]);
  const { records, broken } = zoo.read();
  assert.deepEqual(records.map((r) => r.label), ["breakout lookback=20", "breakout lookback=55", "breakout lookback=120"]);
  assert.equal(broken, null);
  const text = readFileSync(zoo.file, "utf8");
  assert.ok(!text.includes("lookback") && !text.includes("breakout"), "nothing readable in the file");
  assert.equal(statSync(zoo.file).mode & 0o777, 0o600);
  assert.equal(statSync(path.join(home, "null-zoo", "key")).mode & 0o777, 0o600);
  // A middle line removed: the chain breaks there.
  const lines = text.split("\n").filter(Boolean);
  writeFileSync(zoo.file, `${[lines[0], lines[2]].join("\n")}\n`);
  assert.equal(zoo.read().broken, 2);
  assert.throws(() => openZoo(home, { env: { CANLI_ZOO_KEY: "11".repeat(32) } }).read(), /cannot be read with this key \(CANLI_ZOO_KEY\)/);
  assert.throws(() => openZoo(home, { env: { CANLI_ZOO_KEY: "short" } }), /64 hex characters/);
});

test("the data a strategy ran on is keyed by its numbers or its files' bytes, inside a recipe's own arguments", () => {
  const files = { "a.csv": Buffer.from("close\n1\n2\n"), "b.csv": Buffer.from("close\n1\n3\n") };
  const read = (p) => { if (!(p in files)) throw new Error("missing"); return files[p]; };
  const k = (args) => dataKeyOf(args, { read });
  assert.equal(k({ prices: [1, 2, 3], lookback: 20 }), k({ lookback: 60, prices: [1, 2, 3] }), "settings are not data");
  assert.notEqual(k({ prices: [1, 2, 3] }), k({ prices: [1, 2, 4] }));
  assert.equal(k({ recipe: "breakout", arguments: { prices: [1, 2, 3] } }), k({ recipe: "x", arguments: { prices: [1, 2, 3] }, grid: { lookback: [5] } }));
  assert.equal(k({ prices_file: "a.csv" }), k({ prices_file: "a.csv", cost_bps: 9 }));
  assert.notEqual(k({ prices_file: "a.csv" }), k({ prices_file: "b.csv" }));
  assert.notEqual(k({ prices: { $file: "a.csv", column: "close" } }), k({ prices: { $file: "a.csv", column: "open" } }));
  for (const none of [{ prices: { $result: "r1" } }, { prices_file: "missing.csv" }, { sleeve: "trend" }]) assert.equal(k(none), null, JSON.stringify(none));
});

test("a second session on the same data is judged with the first session's tries", async (t) => {
  const zoo = openZoo(temp(t), { env: {} });
  const prices = [1, 2, 3, 4];
  const sweep = (sharpes) => ({ recipe: "breakout", rows: sharpes.map((s, i) => [{ lookback: 10 * (i + 1) }, s]), probability_of_backtest_overfitting: { probability: 0.2 }, every_trial: { sharpes, periods: 2000, periods_per_year: 252 } });
  const session = (answers) => { const log = createRedTeam(); return { call: async () => answers.shift(), luck: createLuck(), log, zoo: async () => zoo, session: log.id }; };

  const first = await runRedTeam(session([sweep([2.6, 0.3, 0.2, 0.1, 0, -0.1])]), { name: "strategy_sweep", arguments: { recipe: "breakout", arguments: { prices } } });
  assert.match(first.checks.luck_all_sessions.why, /No earlier session/);
  assert.deepEqual([first.null_zoo.written, first.null_zoo.earlier_trials], [6, 0]);

  // A new session, the same data: its own count starts again, the zoo's does not.
  const second = await runRedTeam(session([sweep([1.2, 1.1, 1.0])]), { name: "strategy_sweep", arguments: { recipe: "breakout", arguments: { prices } } });
  assert.equal(second.search.strategies_counted, 3, "this session alone");
  assert.equal(second.checks.luck_all_sessions.passed, false);
  assert.match(second.checks.luck_all_sessions.why, /^An earlier session did better on this data \(strategy_sweep breakout lookback=10, Sharpe 2\.60\)/);
  assert.match(second.checks.luck_all_sessions.measure, /all 9 tries on this data across 2 sessions/);
  assert.equal(second.null_zoo.earlier_on_this_data, 6);
  assert.match(second.next, /Earlier sessions already tried this data/);

  // Other data is not counted with it.
  const other = await runRedTeam(session([sweep([1.2, 1.1, 1.0])]), { name: "strategy_sweep", arguments: { recipe: "breakout", arguments: { prices: [9, 8, 7] } } });
  assert.match(other.checks.luck_all_sessions.why, /No earlier session/);

  const stats = runZooStats(zoo);
  assert.deepEqual([stats.trials, stats.sessions, stats.by_outcome.cleared, stats.chain], [12, 3, 2, "whole"], "the first session's best and the other data's best cleared");
  assert.deepEqual(stats.data_sets.rows[0].slice(1, 3), [9, 2]);
  const found = runZooSearch(zoo, { contains: "lookback=10", outcome: "failed" });
  assert.deepEqual([found.total_matching, found.rows[0][1], found.rows[0][4]], [1, "strategy_sweep breakout lookback=10", "failed"], "the second session's best failed; the other two cleared");
  assert.equal(runZooSearch(zoo, { contains: "LOOKBACK=10" }).total_matching, 3);
  assert.equal(allSessionsLuck(zoo.read().records, "f".repeat(64), 252), null);
});

test("over stdio, red_team writes to the zoo and zoo_stats reads it; CANLI_NULL_ZOO=off keeps it closed", async (t) => {
  const home = temp(t);
  const prices = Array.from({ length: 600 }, (_, i) => Number((100 * Math.exp(0.0003 * i + 0.03 * Math.sin(i / 9))).toFixed(4)));
  const connect = async (extra) => {
    const c = new Client({ name: "zoo-test", version: "0" });
    await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_HOME: home, CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1", ...extra } }));
    t.after(() => c.close());
    return async (name, args) => { const out = await c.callTool({ name: "run_tool", arguments: { name, arguments: args } }); return { error: out.isError, body: out.isError ? out.content[0].text : JSON.parse(out.content[0].text) }; };
  };
  const run = await connect({});
  const rt = await run("red_team", { name: "backtest_strategy", arguments: { family: "breakout", prices, grid: { lookback: [20, 55] } } });
  assert.equal(rt.body.null_zoo.written, 2);
  const stats = await run("zoo_stats", {});
  assert.deepEqual([stats.body.trials, stats.body.chain], [2, "whole"]);
  const off = await connect({ CANLI_NULL_ZOO: "off" });
  assert.match((await off("zoo_stats", {})).body, /The Null Zoo is off on this server/);
  assert.match((await off("red_team", { name: "backtest_strategy", arguments: { family: "breakout", prices, grid: { lookback: [20] } } })).body.null_zoo.off, /CANLI_NULL_ZOO=off/);
});
