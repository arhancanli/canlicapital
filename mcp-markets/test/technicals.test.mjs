// The indicators on hand-checkable series.
import assert from "node:assert/strict";
import test from "node:test";

import { atr, bollinger, emaSeries, macd, rsi, sma } from "../src/technicals.mjs";

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} is not ${b}`);

test("moving averages: the plain average, and an EMA seeded with it", () => {
  assert.equal(sma([1, 2, 3, 4, 5], 5), 3);
  assert.equal(sma([1, 2], 5), null);
  assert.deepEqual(emaSeries([1, 2, 3, 4, 5], 3), [2, 3, 4]);
  assert.deepEqual(emaSeries([1, 2], 3), []);
});

test("RSI: Wilder's smoothing, all gains is 100, a steady mix is its ratio", () => {
  assert.equal(rsi(Array.from({ length: 30 }, (_, i) => 100 + i)), 100);
  // Up 2, down 1 in turn over an even window: average gain 1, average loss 0.5, so RS 2 and RSI 66.67.
  const c = [100];
  for (let i = 0; i < 14; i++) c.push(c.at(-1) + (i % 2 ? -1 : 2));
  near(rsi(c), 100 - 100 / 3, 1e-9);
  assert.equal(rsi([1, 2, 3]), null);
});

test("MACD is zero on a flat series and the histogram is line minus signal", () => {
  assert.deepEqual(macd(Array(60).fill(50)), { line: 0, signal: 0, histogram: 0 });
  const m = macd(Array.from({ length: 80 }, (_, i) => 50 + i));
  near(m.histogram, m.line - m.signal);
  assert.ok(m.line > 0);
  assert.equal(macd([1, 2, 3]), null);
});

test("Bollinger: the population standard deviation, two either side", () => {
  const b = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
  assert.deepEqual(b, { upper: 9, middle: 5, lower: 1 });
});

test("ATR takes gaps into the true range", () => {
  const close = [10, 12, 11, 13];
  // True ranges: max(2, 2.5, 0.5) = 2.5; 2; 3 with n 3 gives their average.
  near(atr([11, 12.5, 12, 14], [9, 10.5, 10, 11], close, 3), (2.5 + 2 + 3) / 3);
});
