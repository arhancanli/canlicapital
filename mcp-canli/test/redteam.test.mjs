// red_team: a tool that backtests nothing is refused before it runs; one strategy cannot be judged yet; a grid is
// judged at the session's whole count, with its overfitting probability and against holding; an attempt worse than
// an earlier one cannot pass; the count only grows; many failed attempts are told to stop; a pass points at the holdout,
// once; and over stdio, the attempts of a session are counted together with every other backtest it ran.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { createVault } from "../src/holdout.mjs";
import { createLuck } from "../src/luck.mjs";
import { createRedTeam, runRedTeam } from "../src/redteam.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
const NOW = () => "2026-11-08T12:00:00.000Z";

const single = (sharpe, hold = 0.4, parameters = { fast: 20, slow: 100 }) => ({ rule: "ma crossover", parameters, sharpe, periods: 2000, buy_and_hold: { sharpe: hold } });
const sweep = (sharpes, pbo, hold = 0.4) => ({
  recipe: "time_series_momentum",
  rows: sharpes.map((s, i) => [{ lookback: 20 * (i + 1) }, s]),
  best: { params: { lookback: 20 }, sharpe: sharpes[0] },
  probability_of_backtest_overfitting: { probability: pbo },
  buy_and_hold: { sharpe: hold },
  every_trial: { sharpes, periods: 2000, periods_per_year: 252 },
});

function harness({ vault = null, hosted = false, answers = [] } = {}) {
  const calls = [];
  const ctx = { call: async (name, args) => { calls.push(name); return answers.shift(); }, luck: createLuck({ now: NOW }), log: createRedTeam({ now: NOW }), vault, hosted };
  return { ctx, calls };
}

test("a tool that backtests nothing is refused before it runs", async () => {
  const { ctx, calls } = harness();
  for (const name of ["audit_backtest", "sharpe_ratio", "cpcv", "holdout_test"]) await assert.rejects(runRedTeam(ctx, { name }), /red_team runs a tool that backtests a strategy/);
  assert.equal(calls.length, 0);
  await assert.rejects(runRedTeam({ ...ctx, call: async () => ({ price: 3 }) }, { name: "backtest_breakout" }), /returned no strategy Sharpe/);
});

test("one strategy cannot be judged yet; a grid is judged at the whole count; a worse attempt cannot pass; the count only grows", async () => {
  const vault = createVault({ now: NOW });
  const strong = [2.6, 0.3, 0.2, 0.1, 0.05, 0, -0.1, -0.2];
  const { ctx } = harness({ vault, answers: [single(0.5), sweep(strong, 0.1), single(0.9, 0.4, { fast: 5, slow: 30 }), sweep([0.6, 0.5, 0.4], 0.7, 0.9)] });

  const first = await runRedTeam(ctx, { name: "backtest_ma_crossover", arguments: { fast: 20, slow: 100 } });
  assert.equal(first.attempt, 1);
  assert.equal(first.checks.luck.passed, false);
  assert.match(first.checks.luck.why, /^One strategy tried/);
  assert.equal(first.checks.overfitting.passed, null, "one setting: not measured");
  assert.equal(first.checks.beats_holding.passed, true);
  assert.match(first.checks.holdout.why, /No holdout is set/);
  assert.equal(first.verdict, "fails: luck");

  const second = await runRedTeam(ctx, { name: "strategy_sweep", arguments: { recipe: "time_series_momentum" }, change: "a lookback grid instead of one crossover" });
  assert.equal(second.search.strategies_counted, 9, "the first attempt and all eight variants");
  assert.ok(second.checks.luck.value >= 0.95, `deflated Sharpe ${second.checks.luck.value}`);
  assert.deepEqual([second.checks.luck.passed, second.checks.overfitting.passed, second.checks.beats_holding.passed], [true, true, true]);
  assert.equal(second.verdict, "clears the checks that ran (track_record not measured)");
  assert.match(second.next, /every attempt saw every year\. Set a holdout/);
  assert.deepEqual(second.attempts.rows[1].slice(0, 3), [2, "strategy_sweep", "a lookback grid instead of one crossover"]);

  const third = await runRedTeam(ctx, { name: "backtest_ma_crossover", arguments: { fast: 5, slow: 30 } });
  assert.equal(third.checks.luck.passed, false);
  assert.match(third.checks.luck.why, /^An earlier try did better \(strategy_sweep time_series_momentum lookback=20, Sharpe 2\.60\)/);
  assert.match(third.next, /Go back to the better earlier idea/);

  const fourth = await runRedTeam(ctx, { name: "strategy_sweep", arguments: {} });
  assert.deepEqual(fourth.verdict, "fails: luck, overfitting, beats_holding");
  assert.match(fourth.checks.beats_holding.why, /Holding the asset did as well or better/);
  assert.equal(fourth.search.strategies_counted, 13);
  assert.ok(fourth.search.luck_bar_at_first > 0 && fourth.search.luck_bar_now > 0, "the luck bar at the first defined attempt and now");
  assert.deepEqual(fourth.attempts.rows.map((r) => r[5]), [1, 9, 10, 13], "the count only grows");
  assert.equal(fourth.search.attempts, 4);
});

test("a pass with a holdout set points at its one test; ten failed attempts are told to stop; hosted says what it counts", async () => {
  const vault = createVault({ now: NOW });
  vault.set({ from: "2024-01-01" });
  const { ctx } = harness({ vault, answers: [sweep([2.6, 0.3, 0.2, 0.1, 0.05, 0, -0.1, -0.2], 0.1)] });
  const pass = await runRedTeam(ctx, { name: "strategy_sweep", arguments: { recipe: "time_series_momentum" } });
  assert.match(pass.checks.holdout.why, /Hidden from 2024-01-01; this attempt did not see them/);
  assert.match(pass.next, /The last check: holdout_test with \{"name": "strategy_sweep"/);

  const losing = harness({ answers: Array.from({ length: 11 }, (_, i) => single(0.1 + i / 100)) });
  let out;
  for (let i = 0; i < 11; i += 1) out = await runRedTeam(losing.ctx, { name: "backtest_breakout" });
  assert.match(out.next, /^11 attempts in, the search itself is now the main source of any Sharpe found\. Stop rewriting/);
  assert.deepEqual([out.attempts.rows.length, out.attempts.earlier], [10, 1]);

  const hosted = harness({ hosted: true, answers: [single(1)] });
  const h = await runRedTeam(hosted.ctx, { name: "backtest_breakout" });
  assert.match(h.limits, /Hosted: only this request is counted/);
  assert.match(h.checks.holdout.why, /run locally/);
});

test("over stdio, red_team's attempts are counted with every other backtest of the session", async (t) => {
  const home = mkdtempSync(path.join(tmpdir(), "canli-redteam-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const client = new Client({ name: "redteam-test", version: "0.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_HOME: home, CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } });
  await client.connect(transport);
  t.after(() => client.close());
  let p = 100, s = 7;
  const prices = Array.from({ length: 900 }, () => { s = (s * 16807) % 2147483647; p *= 1 + (s / 2147483647 - 0.49) * 0.03; return Number(p.toFixed(4)); });
  const run = async (args) => { const out = await client.callTool({ name: "run_tool", arguments: args }); assert.ok(!out.isError, out.content?.[0]?.text); return JSON.parse(out.content[0].text); };
  const plain = await run({ name: "backtest_time_series_momentum", arguments: { prices, lookback: 60 } });
  assert.equal(plain.luck.trials, 1);
  const rt = await run({ name: "red_team", arguments: { name: "backtest_strategy", arguments: { family: "momentum", prices, grid: { lookback: [20, 60, 120] } }, change: "a grid" } });
  assert.equal(rt.attempt, 1);
  assert.equal(rt.search.strategies_counted, 4, "the plain backtest before it and the grid's three variants");
  assert.equal(typeof rt.checks.overfitting.value, "number");
  assert.equal(rt.result.every_trial?.counted ?? 3, 3, "the model reads how many, not the list");
  const again = await run({ name: "red_team", arguments: { name: "strategy_sweep", arguments: { recipe: "time_series_momentum", arguments: { prices }, grid: { lookback: [10, 30] } } } });
  assert.deepEqual([again.attempt, again.search.strategies_counted], [2, 6]);
});
