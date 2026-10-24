// explain_move's arithmetic on prices whose abnormal return is known.
import assert from "node:assert/strict";
import test from "node:test";

import { abnormalMove } from "../src/explain.mjs";

test("a day's abnormal return against a market model fitted on the year before", () => {
  const dates = Array.from({ length: 300 }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10));
  let m = 100, s = 50;
  const mClose = [m], sClose = [s];
  for (let i = 1; i < dates.length; i += 1) {
    const rm = 0.01 * Math.sin(i * 1.7), noise = 0.002 * Math.cos(i * 2.3);
    const rs = i === 280 ? 0.0005 + 1.5 * rm + 0.08 : 0.0005 + 1.5 * rm + noise; // a +8% surprise on day 280
    m *= 1 + rm; s *= 1 + rs; mClose.push(m); sClose.push(s);
  }
  const move = abnormalMove({ symbol: "TEST", dates, close: sClose }, { dates, close: mClose }, dates[280]);
  assert.ok(Math.abs(move.beta - 1.5) < 0.05, `beta ${move.beta}`);
  assert.ok(Math.abs(move.abnormal_return - 0.08) < 0.005, `abnormal ${move.abnormal_return}`);
  assert.ok(move.z_score > 10); assert.equal(move.larger_moves_in_prior_year, 0);
  assert.match(move.reading, /rare move/);
  const calm = abnormalMove({ symbol: "TEST", dates, close: sClose }, { dates, close: mClose }, dates[270]);
  assert.ok(Math.abs(calm.z_score) < 2.5); assert.match(calm.reading, /usual range/);
  assert.throws(() => abnormalMove({ symbol: "TEST", dates, close: sClose }, { dates, close: mClose }, "2030-01-01"), /has no close on 2030-01-01/);
});
