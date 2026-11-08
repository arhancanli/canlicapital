// The Lab's word on strategy answers (src/labnote.mjs): the dates a result is read with, never guessed; the rule's
// flat warm-up left out; the Lab not built said once; one Lab pass per series; and over stdio, a dated backtest and a
// breadth sweep come back with where they rank among the Lab's strategies over the same months.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { buildShard, finishBuild, loadSeries, VARIANTS } from "../local/lab.mjs";
import { createLabNotes, datesFor, labNote } from "../src/labnote.mjs";
import { openLab, runOriginality } from "../src/lab.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
const isoDays = (n, from = Date.UTC(1990, 0, 2)) => {
  const out = [];
  for (let t = from; out.length < n; t += 86400000) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); }
  return out;
};

test("dates: the tool's own first, then the call's, one per return or one per price row; nothing guessed", () => {
  const d = ["2020-01-02", "2020-01-03", "2020-01-06", "2020-01-07"];
  assert.deepEqual(datesFor(3, undefined, { dates: d }), d.slice(1), "one per price row: the first row has no return");
  assert.deepEqual(datesFor(4, undefined, { dates: d }), d);
  assert.deepEqual(datesFor(3, undefined, { recipe: "ma_crossover", arguments: { prices: [], dates: d } }), d.slice(1), "a sweep's fixed arguments");
  assert.deepEqual(datesFor(4, ["2021-01-04", "2021-01-05", "2021-01-06", "2021-01-07"], { dates: d }), ["2021-01-04", "2021-01-05", "2021-01-06", "2021-01-07"], "the tool's dates win");
  assert.deepEqual(datesFor(2, undefined, { dates: ["2020-01", "2020-02"] }), ["2020-01", "2020-02"]);
  assert.deepEqual(datesFor(1, undefined, { dates: ["2020-01-02T00:00:00Z"] }), ["2020-01-02"]);
  assert.equal(datesFor(2, undefined, { dates: d }), null, "a length that fits neither");
  assert.equal(datesFor(4, undefined, { dates: [1, 2, 3, 4] }), null);
  assert.equal(datesFor(4, undefined, { dates: ["a", "b", "c", "d"] }), null);
  assert.equal(datesFor(4, undefined, {}), null);
});

test("notes: warm-up left out, one Lab pass per series, the Lab not built said once, off when asked", () => {
  const dates = isoDays(800), returns = dates.map((_, i) => (i < 300 ? 0 : 0.001 * Math.sin(i)));
  const asked = [];
  const fake = (lab, a) => { asked.push(a); return { months: 24, first_month: "x", last_month: "y", sharpe_monthly_annualized: 1, near_copies: { at_least_0_7: 2 }, nearest: { rows: [[5, 0.8, 1, 24, "tsmom on X"]] }, rank: { against: 10, percentile: 70, lab_best_same_months: { sharpe: 2, id: 9 } } }; };
  const notes = createLabNotes({ lab: () => ({}), runOriginality: fake });
  const n = notes.note([returns], undefined, { dates });
  assert.equal(asked.length, 1);
  assert.equal(asked[0].dates[0], dates[300], "the flat warm-up is not months the rule traded");
  assert.equal(asked[0].returns.length, 500);
  assert.deepEqual([n.beats_percent, n.of, n.lab_best_same_months, n.nearest.id, n.near_copies_corr_0_7], [70, 10, { sharpe: 2, id: 9 }, 5, 2]);
  assert.match(n.reading, /beats 70\.0% of the 10 Lab strategies covering them; the best of those reached 2\.00/);
  notes.note([Float64Array.from(returns)], undefined, { dates });
  assert.equal(asked.length, 1, "the same series is read from the first pass");
  assert.equal(notes.note([returns], undefined, { dates: dates.slice(0, 10) }), null, "no dates that fit, no note");
  assert.equal(notes.note([returns.slice(0, 20)], undefined, { dates: dates.slice(0, 20) }), null, "too short");
  assert.equal(notes.note(undefined, undefined, { dates }), null);
  assert.equal(notes.note([[...new Array(30).fill(0), ...returns.slice(300, 310)]], undefined, { dates: dates.slice(0, 40) }), null, "too short once the warm-up is left out");

  const missing = createLabNotes({ lab: () => { throw new Error("not built"); }, runOriginality: fake });
  assert.match(missing.note([returns], undefined, { dates }).why, /npx -y canli-mcp lab build/);
  assert.equal(missing.note([returns], undefined, { dates }), null, "said once a session");
  assert.equal(createLabNotes({ lab: () => ({}), runOriginality: fake, enabled: false }).note([returns], undefined, { dates }), null);
  assert.equal(createLabNotes({ lab: null, runOriginality: fake }).note([returns], undefined, { dates }), null, "hosted: no Lab");
  assert.deepEqual(labNote({}, () => { throw new Error("No Lab strategy shares 24 months with these returns. More."); }, returns, dates), { checked: false, why: "No Lab strategy shares 24 months with these returns." });
});

// A small Lab of two French-style files, as test/lab.test.mjs builds one.
function zipOf(name, text) {
  const data = Buffer.from(text, "latin1"), fname = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(0, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fname.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(0, 10); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(fname.length, 28); cd.writeUInt32LE(0, 42);
  const cdAt = 30 + fname.length + data.length, eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(46 + fname.length, 12); eocd.writeUInt32LE(cdAt, 16);
  return Buffer.concat([local, fname, data, cd, fname, eocd]);
}
const rng = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
function smallLab(home) {
  const raw = path.join(home, "lab", "raw"), out = path.join(home, "lab", "v1");
  mkdirSync(raw, { recursive: true });
  const days = isoDays(5400).map((d) => d.replace(/-/g, "")), r1 = rng(3), r2 = rng(9);
  const csv = (cols, gen) => `Test file.\n\n  Average Value Weighted Returns -- Daily\n,${cols.join(",")}\n${days.map((d, i) => `${d},${cols.map((_, j) => gen(i, j).toFixed(2)).join(",")}`).join("\n")}\n`;
  writeFileSync(path.join(raw, "Two_Portfolios_daily_CSV.zip"), zipOf("Two.CSV", csv(["Lo", "Hi"], (i, j) => (j === 0 ? r1() * 2 + 0.03 : r2() * 3 + 0.02))));
  writeFileSync(path.join(raw, "F-F_Factors_daily_CSV.zip"), zipOf("F.CSV", csv(["Mkt-RF", "RF"], (i) => Math.sin(i / 40) * 0.8 + r1())));
  const { series, data } = loadSeries(raw);
  buildShard({ series, out, shard: { index: 0, of: 1 } });
  finishBuild({ out, series, data, of: 1 });
  return { out, strategies: series.length * VARIANTS, days: isoDays(5400) };
}

const quantHandsOver = await import("canli-quant-mcp/src/cscv.mjs").then((m) => Boolean(m.TRIAL_RETURNS), () => false);
const breadthHandsDates = await import("canli-backtest-mcp/src/sweep.mjs").then((m) => Boolean(m.TRIAL_DATES), () => false);
test("over stdio, dated backtests and sweeps rank among the Lab's strategies over the same months", { skip: quantHandsOver ? false : "the installed canli-quant-mcp hands over no returns yet" }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "canli-labnote-")), home = path.join(dir, "home");
  const { out, strategies, days } = smallLab(home);
  const c = new Client({ name: "labnote-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1", CANLI_HOME: home } }));
  try {
    const dates = days.slice(0, 1500), prices = dates.map((_, i) => 100 * Math.exp(0.0003 * i + 0.05 * Math.sin(i / 23) + 0.02 * Math.sin(i / 6.1)));
    const run = async (name, args) => JSON.parse((await c.callTool({ name: "run_tool", arguments: { name, arguments: args } })).content[0].text);
    const one = await run("backtest_ma_crossover", { prices, dates, fast: 20, slow: 100 });
    assert.ok(one.lab.months >= 60 && one.lab.months <= 72, `${one.lab.months} months, after the 100-day warm-up`);
    assert.ok(one.lab.from > "1990-01", `the first month with a position, not the warm-up (${one.lab.from})`);
    assert.ok(one.lab.of > 0 && one.lab.of <= strategies && one.lab.beats_percent >= 0 && one.lab.beats_percent <= 100);
    assert.match(one.lab.nearest.strategy, / on (F-F_Factors_daily|Two_Portfolios_daily):/);
    const shown = await run("lab_strategy", { id: one.lab.lab_best_same_months.id });
    assert.equal(shown.id, one.lab.lab_best_same_months.id, "every id it names is a Lab strategy");
    assert.equal((await run("backtest_ma_crossover", { prices, fast: 20, slow: 100 })).lab, undefined, "undated: no note");
    const swept = await run("strategy_sweep", { recipe: "ma_crossover", arguments: { prices, dates }, grid: { fast: [10, 20], slow: [60, 100] } });
    assert.ok(swept.lab.months >= 60 && swept.lab.of > 0, "a sweep's best variant");
    // A batch: at most three Lab passes, the first three dated strategy answers.
    const batch = JSON.parse((await c.callTool({ name: "run_tool", arguments: { calls: [5, 6, 7, 8].map((fast) => ({ name: "backtest_ma_crossover", arguments: { prices, dates, fast, slow: 90 } })) } })).content[0].text);
    assert.deepEqual(batch.results.map((r) => Boolean(r.result.lab)), [true, true, true, false]);
    assert.equal(openLab(out).manifest.strategies, strategies);
  } finally {
    await c.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("over stdio, a breadth sweep's days are dated by its prices file", { skip: breadthHandsDates ? false : "the installed canli-backtest-mcp hands over no dates yet" }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "canli-labnote-breadth-")), home = path.join(dir, "home");
  const { days } = smallLab(home);
  const c = new Client({ name: "labnote-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "", CANLI_PACKS: "backtest", CANLI_HOME: home } }));
  try {
    // 40 names over 1,500 of the Lab's own days.
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const tick = Array.from({ length: 40 }, (_, i) => `T${i}`), px = tick.map(() => 50), prices = path.join(dir, "p.csv");
    writeFileSync(prices, [`date,${tick.join(",")}`, ...days.slice(0, 1500).map((d) => `${d},${px.map((p, j) => (px[j] = p * (1 + (rnd() - 0.5) * 0.04)).toFixed(4)).join(",")}`)].join("\n"));
    const text = (await c.callTool({ name: "run_tool", arguments: { name: "breadth_sweep", arguments: { prices_file: prices, grid: { smoothing: [2, 6] }, workers: 2 } } })).content[0].text;
    const r = JSON.parse(text);
    assert.ok(r.lab.months >= 24 && r.lab.of > 0, JSON.stringify(r.lab));
    assert.ok(r.lab.from >= "1990-01" && r.lab.to <= "1995-12");
    assert.ok(!text.includes(days[700]), "the dates stay off the answer");
  } finally {
    await c.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
