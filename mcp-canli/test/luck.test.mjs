// Luck counted by the server itself: a strategy result recognised by its tool, Sharpe and periods, labelled by
// its settings and not its data; every trial so far counted and the best one deflated; a ledger per sampling
// frequency; the hosted server saying it counts one request; every variant of a sweep, a breadth sweep's counted
// once however often it runs, its shards as they run; and over stdio, a second backtest told about the first while a
// tool that only measures a Sharpe is left alone.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { createLuck, shownTrials, trialOf, trialsOf } from "../src/luck.mjs";

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

test("a sweep counts every variant it tried, named by its settings where its table shows them; the model reads how many", () => {
  const luck = createLuck({ now: () => "2026-11-04T07:00:00.000Z" });
  const sharpes = Array.from({ length: 56 }, (_, i) => Number((1.2 - i * 0.02).toFixed(2)));
  const sweep = { recipe: "ma_crossover", combinations: 56, columns: ["params", "sharpe", "cagr", "max_drawdown", "annual_turnover"], rows: sharpes.slice(0, 50).map((x, i) => [{ fast: 5 + i, slow: 100 }, x, 0.1, -0.2, 3]), every_trial: { periods: 699, periods_per_year: 252, sharpes } };
  const found = trialsOf("strategy_sweep", { recipe: "ma_crossover", arguments: { prices: [1, 2] }, grid: { fast: [5] } }, sweep);
  assert.equal(found.length, 56);
  assert.deepEqual(found[0], { label: "strategy_sweep ma_crossover fast=5 slow=100", sharpe_annualized: 1.2, observations: 699, params: { tool: "strategy_sweep", recipe: "ma_crossover", fast: 5, slow: 100 } });
  assert.equal(found[55].label, "strategy_sweep ma_crossover variant 56 of 56", "past the table's fifty, its place");
  const note = luck.record("strategy_sweep", {}, sweep);
  assert.equal(note.trials, 56);
  assert.equal(note.best.label, "strategy_sweep ma_crossover fast=5 slow=100");
  assert.ok(note.expected_best_by_luck_annualized > 0);
  assert.equal(luck.record("backtest_ma_crossover", { fast: 9, slow: 100 }, result(0.5)).trials, 57, "a later backtest is judged against every try");
  const tournament = { sleeves_run: 3, leaderboard: [["tsmom-252-vt10-long", "time_series_momentum", 0.8]], every_trial: { periods: 500, periods_per_year: 252, sharpes: [0.8, 0.3, -0.1] } };
  assert.deepEqual(trialsOf("sleeve_tournament", {}, tournament).map((t) => t.label), ["sleeve_tournament tsmom-252-vt10-long", "sleeve_tournament variant 2 of 3", "sleeve_tournament variant 3 of 3"]);
  assert.deepEqual(shownTrials(sweep).every_trial, { periods: 699, periods_per_year: 252, counted: 56 });
  assert.equal(shownTrials(result(1)).sharpe, 1, "anything else is left as it is");
  // Before canli-quant-mcp 0.3.0 a sweep carried no every_trial, and is not counted, as before.
  assert.deepEqual(trialsOf("strategy_sweep", {}, { recipe: "ma_crossover", rows: [] }), []);
  assert.deepEqual(trialsOf("sleeve_tournament", {}, { periods: 900, leaderboard: [] }), []);
  assert.deepEqual(trialsOf("breadth_sweep", {}, { trials: 2, rows: [], best: { k: 0, sharpe: 1.2 } }), [], "nor a breadth sweep before canli-backtest-mcp gave one");
});

test("a breadth sweep counts each variant by its row, with its own days, and the same sweep run again adds nothing", () => {
  const columns = ["k", "signals", "smoothing", "target_vol", "cost_bps", "min_names", "sleeves", "effective_bets", "sharpe_search", "sharpe_after_split", "error"];
  const sweep = (id, sharpes, periods) => ({ sweep_id: id, trials: sharpes.length, columns, rows: [...sharpes.map((x, i) => [i + 1, i ? "momentum_12_1+low_vol" : "momentum_12_1", 6, null, 20, null, 4, 2.1, x, 0.1, null]), [0, "all", 2, null, 5, null, null, null, null, null, "too few names"]], every_trial: { periods, periods_per_year: 252, k: sharpes.map((_, i) => i + 1), sharpes } });
  const first = sweep("4a1f", [0.9, 0.5, 0.1], [450, 480, 470]);
  const found = trialsOf("breadth_sweep", { prices_file: "p.csv", grid: { smoothing: [6] } }, first);
  assert.deepEqual(found[0], { label: "breadth_sweep k=1 signals=momentum_12_1 smoothing=6 cost_bps=20", sharpe_annualized: 0.9, observations: 450, params: { tool: "breadth_sweep", k: 1, signals: "momentum_12_1", smoothing: 6, cost_bps: 20 }, key: "4a1f:1" });
  assert.deepEqual(found.map((t) => t.observations), [450, 480, 470], "each variant's own days");
  const luck = createLuck({ now: () => "2026-11-08T01:00:00.000Z" });
  assert.equal(luck.record("breadth_sweep", {}, first).trials, 3);
  const again = luck.record("breadth_sweep", {}, sweep("4a1f", [0.9, 0.5, 0.1], [450, 480, 470]));
  assert.equal(again.trials, 3, "run again, or its shards merged: the same tries");
  assert.match(again.reading, /These variants \(the same files, grid and split\) were counted already; nothing is added\.$/);
  const other = luck.record("breadth_sweep", {}, sweep("77c0", [0.3, 0.2], 500));
  assert.equal(other.trials, 5, "other files, grid or split: new tries");
  assert.doesNotMatch(other.reading, /counted already/);
  assert.equal(luck.trials, 5);
  assert.equal(luck.record("breadth_sweep", {}, { ...first, every_trial: { ...first.every_trial, periods_per_year: 12 } }), null, "nothing new, and nothing at that frequency yet: no note");
  // A variant is found in the table by its k, wherever its row is; with no row, it is named by k alone and still known
  // again. A list without each variant's k names it by its place and cannot know it again; too few days is no try.
  const moved = { ...first, rows: [...first.rows].reverse() };
  assert.deepEqual(trialsOf("breadth_sweep", {}, moved), trialsOf("breadth_sweep", {}, first));
  assert.deepEqual(trialsOf("breadth_sweep", {}, { ...first, rows: [] }).map((t) => [t.label, t.key]), [["breadth_sweep k=1", "4a1f:1"], ["breadth_sweep k=2", "4a1f:2"], ["breadth_sweep k=3", "4a1f:3"]]);
  const odd = sweep("90bb", [0.4, 0.2], [300, 1]);
  delete odd.every_trial.k;
  assert.deepEqual(trialsOf("breadth_sweep", {}, odd).map((t) => [t.label, t.key]), [["breadth_sweep variant 1 of 2", undefined]]);
  assert.deepEqual(shownTrials(first).every_trial, { periods_per_year: 252, counted: 3 }, "a list of days stays under the ref too");
});

test("a breadth sweep's shards are counted as they run, and their merge adds only what was not counted here", () => {
  const luck = createLuck({ now: () => "2026-11-08T03:00:00.000Z" });
  const shard = (index, k, sharpes) => ({ sweep_id: "5c2e", shard: { index, of: 2 }, ran: k.length, of: 4, shard_file: `s${index}.json`, every_trial: { periods: 450, periods_per_year: 252, k, sharpes } });
  const s0 = luck.record("breadth_sweep", {}, shard(0, [2, 0], [0.7, 0.2]));
  assert.equal(s0.trials, 2, "counted as it runs, before any merge");
  assert.equal(s0.best.label, "breadth_sweep k=2", "a shard's answer has no table: the variant by its k");
  assert.match(luck.record("breadth_sweep", {}, shard(0, [2, 0], [0.7, 0.2])).reading, /These variants \(the same files, grid and split\) were counted already; nothing is added\.$/, "the same shard again");
  // Merged with a shard run on another machine: only that shard's variants are new here.
  const columns = ["k", "signals", "smoothing", "target_vol", "cost_bps", "min_names", "sleeves", "effective_bets", "sharpe", "sharpe_after_split", "error"];
  const row = (k, x) => [k, "all", [2, 6][k % 2], null, [5, 20][k >> 1], null, 4, 2, x, null, null];
  const merged = { sweep_id: "5c2e", merged_from: 2, columns, rows: [row(2, 0.7), row(3, 0.5), row(1, 0.3), row(0, 0.2)], every_trial: { periods: 450, periods_per_year: 252, k: [2, 3, 1, 0], sharpes: [0.7, 0.5, 0.3, 0.2] } };
  const note = luck.record("breadth_sweep", {}, merged);
  assert.equal(note.trials, 4);
  assert.match(note.reading, /2 of these 4 variants were counted already\.$/);
  assert.equal(note.best.label, "breadth_sweep k=2", "the best as its shard named it");
  assert.equal(luck.record("breadth_sweep", {}, merged).trials, 4, "merged again: nothing added");
  assert.equal(luck.record("breadth_sweep", {}, shard(1, [3, 1], [0.5, 0.3])).trials, 4, "nor the other shard run here after its merge");
  assert.deepEqual(shownTrials(shard(1, [3, 1], [0.5, 0.3])).every_trial, { periods: 450, periods_per_year: 252, counted: 2 }, "the model reads the count, not the list");
});

test("backtest_strategy's grid counts every variant it ran, named by its row of top, and its own sampling frequency", () => {
  const columns = ["lookback", "skip", "sharpe", "cagr", "max_drawdown", "turnover_per_year"];
  const top = [[120, 0, 0.987, 0.13, -0.14, 8.9], [20, 0, 0.681, 0.07, -0.13, 26], [60, 0, 0.627, 0.07, -0.13, 8.9]];
  const out = { schema: "canli.backtest.v1", family: "momentum", settings: { periods_per_year: 12, cost_bps: 5, allow_short: false }, window: { evaluated_returns: 679 }, variants: { count: 4, columns, top }, every_trial: { sharpes: [0.987, 0.681, 0.627, 0.1], periods: 679, periods_per_year: 12 } };
  const found = trialsOf("backtest_strategy", { family: "momentum", prices: [1, 2] }, out);
  assert.deepEqual(found.map((t) => t.label), ["backtest_strategy momentum lookback=120 skip=0", "backtest_strategy momentum lookback=20 skip=0", "backtest_strategy momentum lookback=60 skip=0", "backtest_strategy momentum variant 4 of 4"]);
  assert.deepEqual(found[0].params, { tool: "backtest_strategy", recipe: "momentum", lookback: 120, skip: 0 });
  assert.deepEqual(found.map((t) => t.observations), [679, 679, 679, 679]);
  const luck = createLuck({ now: () => "2026-11-08T12:00:00.000Z" });
  const note = luck.record("backtest_strategy", {}, out);
  assert.deepEqual([note.trials, note.periods_per_year, note.best.sharpe_annualized], [4, 12, 0.987], "a monthly grid in the monthly ledger");
  // An older canli-validation-mcp lists only its top variants: those are counted.
  const { every_trial, ...older } = out;
  assert.equal(trialsOf("backtest_strategy", {}, older).length, 3);
  assert.equal(createLuck().record("backtest_strategy", {}, older).periods_per_year, 12);
  assert.deepEqual(shownTrials(out).every_trial, { periods: 679, periods_per_year: 12, counted: 4 });
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
