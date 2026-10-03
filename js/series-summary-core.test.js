import assert from "node:assert/strict";
import test from "node:test";

import { drawdowns, jumps, summarizeSeries, volatilityRegimes } from "./series-summary-core.js";
import { makeRandom } from "./selection-risk-core.js";

function gaussianReturns(n, seed, sd = 0.01, mean = 0.0003) {
  const next = makeRandom(seed);
  return Array.from({ length: n }, () => {
    const u = Math.max(1e-12, next());
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  });
}

test("drawdown: depth, peak, trough, recovery and time under water on a hand-built curve", () => {
  const level = [100, 110, 99, 88, 95, 111, 120, 108, 114];
  const d = drawdowns(level);
  assert.equal(d.max, 88 / 110 - 1);
  assert.equal(d.peakAt, 1);
  assert.equal(d.troughAt, 3);
  assert.equal(d.recoveredAt, 5);
  assert.equal(d.current, 114 / 120 - 1);
  assert.equal(d.longestUnderwater, 4); // from the high at index 1 to the recovery at 5
});

test("jumps are found by robust deviation, so the jumps do not hide themselves", () => {
  const r = gaussianReturns(500, 3);
  r[100] = -0.15;
  r[300] = 0.12;
  const found = jumps(r).found.map((j) => j.i).sort((a, b) => a - b);
  assert.deepEqual(found, [100, 300]);
});

test("volatility regimes split by the series' own terciles and finish in the regime it is in now", () => {
  const calm = gaussianReturns(300, 5, 0.005);
  const wild = gaussianReturns(120, 6, 0.03);
  const v = volatilityRegimes([...calm, ...wild], 252);
  assert.equal(v.runs.at(-1).level, "high");
  assert.ok(v.percentile >= 2 / 3, "a high regime sits in the top third of its own history");
  assert.ok(v.runs.every((run, i) => i === 0 || run.count >= 10), "no regime shorter than ten periods after the first");
});

test("the summary is computed from prices and from the equivalent returns identically", () => {
  const r = gaussianReturns(400, 9);
  const prices = [50];
  for (const x of r) prices.push(prices.at(-1) * (1 + x));
  const fromPrices = summarizeSeries({ prices });
  const fromReturns = summarizeSeries({ returns: r });
  for (const key of ["growth", "risk", "tails", "jumps", "dependence"]) assert.deepEqual(fromPrices[key], fromReturns[key], key);
  assert.equal(fromPrices.drawdown.max, fromReturns.drawdown.max);
});

test("the text states the key figures in about a hundred words, with dates when given", () => {
  const r = gaussianReturns(800, 12);
  const dates = Array.from({ length: 801 }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10));
  const prices = [100];
  for (const x of r) prices.push(prices.at(-1) * (1 + x));
  const s = summarizeSeries({ prices, dates, name: "Test series" });
  const words = s.text.split(/\s+/).length;
  assert.ok(words >= 50 && words <= 140, `${words} words`);
  assert.match(s.text, /^Test series: 800 daily returns, 2020-01-01 to 2022-03-11/);
  assert.match(s.text, /Max drawdown -\d+\.\d%/);
  assert.equal(s.span.first, "2020-01-01");
});

test("stale data is called out", () => {
  const r = gaussianReturns(200, 13);
  for (let i = 50; i < 60; i += 1) r[i] = 0;
  const s = summarizeSeries({ returns: r });
  assert.equal(s.data_quality.longest_run_of_zero_returns, 10);
  assert.match(s.text, /10 unchanged periods in a row/);
});

test("a benchmark adds correlation and beta; mismatched lengths are refused", () => {
  const b = gaussianReturns(300, 21);
  const r = b.map((x, i) => 1.5 * x + 0.001 * Math.sin(i));
  const s = summarizeSeries({ returns: r, benchmark_returns: b });
  assert.ok(s.benchmark.correlation > 0.99);
  assert.ok(Math.abs(s.benchmark.beta - 1.5) < 0.01);
  assert.throws(() => summarizeSeries({ returns: r, benchmark_returns: b.slice(1) }), /has 299 values for 300 returns/);
  assert.throws(() => summarizeSeries({ returns: r, prices: [1, 2] }), /not both/);
});
