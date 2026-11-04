// Luck counted by the server itself: a strategy result recognised by its tool, Sharpe and periods, labelled by
// its settings and not its data; every trial so far counted and the best one deflated; a ledger per sampling
// frequency; the hosted server saying it counts one request; and over stdio, a second backtest told about the
// first while a tool that only measures a Sharpe is left alone.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { createLuck, trialOf } from "../src/luck.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
const result = (sharpe, periods = 500, parameters = { fast: 20, slow: 100 }) => ({ rule: "ma crossover", parameters, sharpe, periods, total_return: 0.1 });

test("a strategy result is a trial: its Sharpe and periods, labelled by its settings, not its data", () => {
  const t = trialOf("backtest_ma_crossover", { prices: [1, 2, 3], fast: 20, slow: 100 }, result(0.9));
  assert.deepEqual(t, { label: "backtest_ma_crossover fast=20 slow=100", sharpe_annualized: 0.9, observations: 500, params: { tool: "backtest_ma_crossover", fast: 20, slow: 100 } });
  // Without parameters of its own, the arguments other than data and $result references name it.
  assert.equal(trialOf("backtest_weights", { weights: [[0.5, 0.5]], rebalance_every: 21, prices: { $result: 0, path: "close" } }, { sharpe: 0.5, periods: 120 }).label, "backtest_weights rebalance_every=21");
  assert.equal(trialOf("sharpe_ratio", { prices: [1, 2, 3] }, { sharpe: 1.4, periods: 299 }), null, "measuring a Sharpe tests no strategy");
  for (const other of [{ sharpe: "high", periods: 500 }, { sharpe: 1.2 }, { sharpe: 1.2, periods: 1 }, { price: 3.2 }, [1, 2], null]) assert.equal(trialOf("backtest_breakout", {}, other), null, JSON.stringify(other));
});

test("every trial so far is counted and the best one deflated; each sampling frequency has its own ledger", () => {
  const luck = createLuck({ now: () => "2026-11-04T06:00:00.000Z" });
  assert.equal(luck.record("black_scholes", {}, { price: 10.45 }), null, "not a strategy");
  const first = luck.record("backtest_ma_crossover", { fast: 20, slow: 100 }, result(0.6));
  assert.deepEqual([first.trials, first.deflated_sharpe_ratio, first.best.label], [1, null, "backtest_ma_crossover fast=20 slow=100"]);
  assert.match(first.reading, /^The first strategy tested in this session/);
  luck.record("backtest_ma_crossover", { fast: 50, slow: 200 }, result(1.1, 500, { fast: 50, slow: 200 }));
  const third = luck.record("backtest_ma_crossover", { fast: 10, slow: 50 }, result(0.2, 500, { fast: 10, slow: 50 }));
  assert.deepEqual([third.trials, third.best.trial, third.best.sharpe_annualized], [3, 2, 1.1]);
  assert.ok(third.deflated_sharpe_ratio > 0 && third.deflated_sharpe_ratio < 1, "a probability once two trials differ");
  assert.ok(third.expected_best_by_luck_annualized > 0);
  assert.equal(third.best.label, "backtest_ma_crossover fast=50 slow=200");
  assert.match(third.reading, /^3 strategies tested in this session\. The best \(trial 2, Sharpe 1\.10\) against about \d\.\d\d from luck alone: deflated Sharpe 0\.\d\d/);
  assert.ok(third.reading.length < 220, "short: it rides on every strategy answer");
  // Monthly backtests are a ledger of their own.
  const monthly = luck.record("backtest_time_series_momentum", { lookback: 12, periods_per_year: 12 }, { sharpe: 0.8, periods: 120 });
  assert.deepEqual([monthly.periods_per_year, monthly.trials], [12, 1]);
  assert.match(monthly.reading, /3 more at other frequencies, counted apart/);
  assert.equal(luck.trials, 4);
  // The hosted server says what it counts.
  assert.match(createLuck({ scope: "request" }).record("backtest_ma_crossover", {}, result(1)).reading, /Hosted: only this request is counted/);
});

test("over stdio, the second backtest of a session is told about the first, and measuring a Sharpe is not counted", async () => {
  const c = new Client({ name: "luck-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } }));
  try {
    const prices = Array.from({ length: 400 }, (_, i) => 100 * Math.exp(0.0004 * i + 0.02 * Math.sin(i / 7)));
    const run = async (name, args) => JSON.parse((await c.callTool({ name: "run_tool", arguments: { name, arguments: { prices, ...args } } })).content[0].text);
    const measured = await run("sharpe_ratio", {});
    const a = await run("backtest_ma_crossover", { fast: 10, slow: 50 });
    const b = await run("backtest_ma_crossover", { fast: 20, slow: 100 });
    assert.equal(measured.luck, undefined);
    assert.deepEqual([a.luck.trials, b.luck.trials], [1, 2]);
    assert.notEqual(b.luck.deflated_sharpe_ratio, null);
    assert.match(b.luck.reading, /^2 strategies tested in this session/);
  } finally {
    await c.close();
  }
});
