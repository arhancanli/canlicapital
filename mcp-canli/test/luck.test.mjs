// Luck counted by the server itself: a strategy result recognised by its tool, Sharpe and periods, labelled by
// its settings and not its data; every trial so far counted and the best one deflated; a ledger per sampling
// frequency; the hosted server saying it counts one request; every variant of a sweep, a breadth sweep's counted
// once however often it runs, its shards as they run; variants run on the same data pooled across the session and
// picking the best of them measured for overfitting; and over stdio, a second backtest told about the first while a
// tool that only measures a Sharpe is left alone.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { defaultSplits, pbo } from "canli-quant-mcp/src/cscv.mjs";
import { mulberry32 } from "canli-quant-mcp/src/math.mjs";

import { createLuck, shownTrials, TRIAL_RETURNS, trialOf, trialsOf } from "../src/luck.mjs";

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

// k variants' returns over n periods from a seed, and a sweep's answer as canli-quant-mcp gives it in this process:
// every variant's Sharpe best first, with the returns in the same order under the symbol key.
const noiseOf = (seed, k, n = 320) => { const u = mulberry32(seed); return Array.from({ length: k }, () => Array.from({ length: n }, () => (u() + u() + u() - 1.5) * 0.01)); };
const annual = (x) => { const m = x.reduce((s, v) => s + v, 0) / x.length, v = x.reduce((s, y) => s + (y - m) ** 2, 0) / (x.length - 1); return (m / Math.sqrt(v)) * Math.sqrt(252); };
const sweepOf = (series, periods_per_year = 252) => { const best = [...series].sort((x, y) => annual(y) - annual(x)); return { recipe: "ma_crossover", every_trial: { periods: series[0].length, periods_per_year, sharpes: best.map(annual) }, [TRIAL_RETURNS]: best }; };
const swept = (prices, grid = { fast: [5, 10, 20] }) => ({ recipe: "ma_crossover", arguments: { prices }, grid });

test("variants run on the same data are pooled across the session, and picking the best of them is measured for overfitting", () => {
  const prices = [100, 101, 103, 102];
  const [a, b, c] = [noiseOf(1, 3), noiseOf(2, 3), noiseOf(3, 1)];
  const luck = createLuck({ now: () => "2026-11-08T06:00:00.000Z" });
  const first = sweepOf(a);
  const one = luck.record("strategy_sweep", swept(prices), first);
  assert.equal(first[TRIAL_RETURNS], undefined, "taken off the result, so nothing that keeps it keeps them");
  assert.deepEqual([one.overfitting_across_session.variants, one.overfitting_across_session.periods, one.overfitting_across_session.splits], [3, 320, 8]);
  const two = luck.record("strategy_sweep", swept(prices, { fast: [30, 40, 50] }), sweepOf(b)).overfitting_across_session;
  const pooled = [...sweepOf(a)[TRIAL_RETURNS], ...sweepOf(b)[TRIAL_RETURNS]];
  assert.deepEqual([two.variants, two.probability], [6, pbo(pooled, defaultSplits(320)).probability]);
  // A backtest on the same prices joins the sweeps' pool.
  const three = luck.record("backtest_ma_crossover", { prices, fast: 50, slow: 200 }, { sharpe: annual(c[0]), periods: 320, [TRIAL_RETURNS]: c });
  assert.equal(three.trials, 7);
  assert.deepEqual([three.overfitting_across_session.variants, three.overfitting_across_session.probability], [7, pbo([...pooled, c[0]], 8).probability]);
  assert.match(three.overfitting_across_session.reading, /^Picking the best of the 7 variants run on this data in this session: in \d+% of the 70 ways to split the periods in halves \(CSCV\), the in-sample winner was below the median out of sample; above 50%, the choice did worse than a random pick\.$/);
  // One variant has nothing to pick among.
  assert.equal(createLuck().record("backtest_ma_crossover", { prices, fast: 5, slow: 20 }, { sharpe: annual(c[0]), periods: 320, [TRIAL_RETURNS]: c }).overfitting_across_session, undefined);
});

test("variants are pooled apart by data, length and frequency, a variant run again once, and only as many as the session keeps", () => {
  const luck = createLuck(), a = noiseOf(4, 3), across = (args, answer, ran) => luck.record("strategy_sweep", args, answer, ran)?.overfitting_across_session;
  across(swept([1, 2, 3]), sweepOf(a));
  assert.equal(across(swept([1, 2, 4]), sweepOf(noiseOf(5, 2))).variants, 2, "other prices, another pool");
  assert.equal(across(swept([1, 2, 3]), sweepOf(noiseOf(6, 2, 400))).variants, 2, "another length, another pool");
  assert.equal(across(swept([1, 2, 3]), sweepOf(noiseOf(7, 2), 12)).variants, 2, "monthly, another pool");
  assert.equal(across(swept([1, 2, 3]), sweepOf(a)).variants, 3, "the same variants run again are pooled once");
  // Data the server cannot know here (another call's result) is not pooled, unless the arguments as run name it.
  const unknown = swept({ $result: 0, path: "close" });
  assert.equal(across(unknown, sweepOf(noiseOf(8, 3))), undefined);
  assert.equal(across(unknown, sweepOf(noiseOf(8, 3)), swept([1, 2, 3])).variants, 6, "the arguments as run name the data");
  // Too short to split in halves, or not all finite: not pooled.
  assert.equal(across(swept([9]), sweepOf(noiseOf(9, 3, 39))), undefined);
  assert.equal(across(swept([9]), { every_trial: { periods: 320, sharpes: [1, 0.5] }, [TRIAL_RETURNS]: [[...noiseOf(10, 1)[0].slice(1), Number.NaN], noiseOf(11, 1)[0]] }), undefined);
  // As many variants and numbers as a session keeps; past that, the measure says on how many.
  const capped = createLuck({ scope: "request", pool: { variants: 4, numbers: 1e9 } });
  capped.record("strategy_sweep", swept([1]), sweepOf(noiseOf(12, 3)));
  const full = capped.record("strategy_sweep", swept([1]), sweepOf(noiseOf(13, 3))).overfitting_across_session;
  assert.deepEqual([full.variants, full.variants_tried], [4, 6]);
  assert.match(full.reading, /^Picking the best of the 4 variants run on this data in this request: .* Measured on the first 4 of 6, as many as this request keeps\.$/);
  const small = createLuck({ pool: { variants: 1000, numbers: 3 * 320 } });
  small.record("strategy_sweep", swept([1]), sweepOf(noiseOf(14, 2)));
  const kept = small.record("strategy_sweep", swept([1]), sweepOf(noiseOf(15, 2))).overfitting_across_session;
  assert.deepEqual([kept.variants, kept.variants_tried], [3, 4], "numbers for three series of 320");
});

test("a large pool is measured on fewer splits, so the measure stays quick", () => {
  const luck = createLuck(), many = noiseOf(16, 120, 700), across = (series) => luck.record("strategy_sweep", swept([7]), sweepOf(series)).overfitting_across_session;
  const first = across(many.slice(0, 116));
  assert.deepEqual([first.variants, first.splits], [116, 16], "16 choose 8 ways for up to 116 variants");
  const more = across(many.slice(116));
  assert.deepEqual([more.variants, more.splits], [120, 14]);
  assert.equal(more.probability, pbo([...sweepOf(many.slice(0, 116))[TRIAL_RETURNS], ...sweepOf(many.slice(116))[TRIAL_RETURNS]], 14).probability);
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

const { TRIAL_RETURNS: handedOver } = await import("canli-quant-mcp/src/cscv.mjs");
test("over stdio, two sweeps and a backtest on the same prices are pooled, and the model reads no returns", { skip: handedOver ? false : "the installed canli-quant-mcp hands over no returns yet" }, async () => {
  const c = new Client({ name: "luck-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } }));
  try {
    const prices = Array.from({ length: 700 }, (_, i) => 100 * Math.exp(0.0004 * i + 0.05 * Math.sin(i / 17) + 0.02 * Math.sin(i / 5.3)));
    const run = async (name, args, more = {}) => (await c.callTool({ name: "run_tool", arguments: { name, arguments: args, ...more } })).content[0].text;
    const a = await run("strategy_sweep", { recipe: "ma_crossover", arguments: { prices }, grid: { fast: [5, 10, 20], slow: [60, 120] } });
    const b = await run("strategy_sweep", { recipe: "ma_crossover", arguments: { prices }, grid: { fast: [30, 40], slow: [150, 200] } });
    const one = await run("backtest_ma_crossover", { prices, fast: 50, slow: 250 }, { digits: 4 });
    assert.deepEqual([a, b, one].map((t) => JSON.parse(t).luck.overfitting_across_session.variants), [6, 10, 11], "rounded to 4 figures too");
    assert.equal(JSON.parse(one).luck.overfitting_across_session.periods, prices.length - 1);
    assert.ok(a.length < 20000, `the returns stay off the answer (${a.length} characters)`);
    // Prices read from an earlier call's result (buy and hold's curve) are known by the arguments as run.
    const other = prices.slice(0, 300), curve = { $result: 0, path: "curve.rows", pick: [2] };
    const batch = JSON.parse((await c.callTool({ name: "run_tool", arguments: { calls: [
      { name: "backtest_ma_crossover", arguments: { prices: other, fast: 10, slow: 50, curve: true } },
      { name: "strategy_sweep", arguments: { recipe: "ma_crossover", arguments: { prices: curve }, grid: { fast: [5, 10], slow: [60, 120] } } },
      { name: "strategy_sweep", arguments: { recipe: "ma_crossover", arguments: { prices: curve }, grid: { fast: [20, 30], slow: [150, 200] } } },
    ] } })).content[0].text);
    assert.deepEqual(batch.results.map((r) => r.result.luck.overfitting_across_session?.variants), [undefined, 4, 8]);
  } finally {
    await c.close();
  }
});
