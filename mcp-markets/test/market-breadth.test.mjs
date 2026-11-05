import assert from "node:assert/strict";
import { test } from "node:test";

import { across, closed, marketBreadth, memberOn, returns } from "../src/market-breadth.mjs";
import { createSession, NotFound } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-breadth-fixtures.mjs on 2026-11-05: DIA's holdings of 3 November and its thirty members'
// daily closes to 4 November.
const run = (args, env = {}) => marketBreadth(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env, sleep: async () => {} }), args);
const up = Array.from({ length: 251 }, (_, i) => 100 + i);
const down = [...up].reverse();

test("one member on one session: its averages, its move, a 52-week closing high or low, how far below its high", () => {
  const u = memberOn(up, 250);
  assert.deepEqual([u.above50, u.above200, u.move, u.newHigh, u.newLow, u.fromHigh], [true, true, 1, true, false, 0]);
  const d = memberOn(down, 250);
  assert.deepEqual([d.above50, d.above200, d.move, d.newHigh, d.newLow], [false, false, -1, false, true]);
  assert.ok(Math.abs(d.fromHigh - (100 / 350 - 1) * 100) < 1e-9);
  // Too short a history for a 200-day average or a year's high.
  const s = memberOn(up.slice(0, 60), 59);
  assert.deepEqual([s.above50, s.above200, s.newHigh], [true, null, false]);
});

test("breadth across members, and the index rebuilt from the shares held beside the average member", () => {
  const x = across([memberOn(up, 250), memberOn(up, 250), memberOn(down, 250)]);
  assert.deepEqual([x.members, x.above_200d, x.pct_above_200d, x.advancers, x.decliners, x.new_highs, x.new_lows, x.down_20pct_from_high], [3, 2, 66.7, 2, 1, 2, 1, 1]);
  // One member doubles and one halves: the average member gained 25%; by value, 30 shares at 10 and 1 at 100 (400) end at 650.
  const members = [{ shares: 30, rows: [["2026-01-02", 10], ["2026-11-04", 20]] }, { shares: 1, rows: [["2026-01-02", 100], ["2026-11-04", 50]] }];
  assert.deepEqual(returns(members, "2026-01-02"), [25, 62.5, 2]);
  assert.deepEqual(returns(members, "2025-12-31"), [25, 62.5, 2]);   // the first close, two days after the date
  assert.deepEqual(returns(members, "2025-06-01"), [null, null, 0]);  // the closes do not reach back that far
  assert.deepEqual(returns(members.map((m) => ({ ...m, shares: null })), "2026-01-02"), [25, null, 2]);
});

test("the Dow on 4 November: breadth from its thirty members, and the index rebuilt exactly", async () => {
  const r = await run({ index: "Dow" });
  assert.deepEqual([r.index, r.through, r.holdings_as_of, r.session, r.members, r.priced], ["Dow Jones Industrial Average", "DIA", "2026-11-03", "2026-11-04", 30, 30]);
  assert.equal(r.summary[0], "On 2026-11-04, 22 of the 30 Dow Jones Industrial Average members priced (73.3%) closed above their 200-day average and 23 (76.7%) above their 50-day; 27 rose and 3 fell; 8 closed at a 52-week high and 0 at a 52-week low.");
  // The Dow itself (^DJI) moved +3.03% on the day and +4.07% over the month: the trust holds the same shares of each
  // member, so the rebuilt index is the index.
  const ret = Object.fromEntries(r.returns.rows.map(([p, avg, index]) => [p, [avg, index]]));
  assert.deepEqual([ret.day[1], ret.month[1]], [3.03, 4.07]);
  assert.deepEqual(ret.year, [15.92, 13.08]);
  assert.equal(r.daily.rows.length, 20);
  assert.deepEqual(r.daily.rows.at(-1), ["2026-11-04", 76.7, 73.3, 27, 3]);
  assert.match(r.summary[2], /weighted by share price as the Dow is/);
});

test("indexes it does not read, sectors outside the S&P 500, and prices turned off are refused plainly", async () => {
  await assert.rejects(run({ index: "Nikkei" }), NotFound);
  await assert.rejects(run({ index: "Dow", by_sector: true }), /by_sector splits the S&P 500/);
  await assert.rejects(run({}, { CANLI_KEYLESS_PRICES: "0" }), /CANLI_KEYLESS_PRICES=0/);
});

test("a quote's price stands in for a close only once its session has ended", () => {
  const at = (iso) => Date.parse(iso) / 1000;
  const period = (day) => ({ regular: { start: at(`${day}T14:30:00Z`), end: at(`${day}T21:00:00Z`) } });
  // Mid-session on 5 November, at the close on 4 November, and after hours with the period already on the next day.
  assert.equal(closed({ regularMarketTime: at("2026-11-05T18:00:00Z"), currentTradingPeriod: period("2026-11-05"), gmtoffset: -18000 }), false);
  assert.equal(closed({ regularMarketTime: at("2026-11-04T21:00:00Z"), currentTradingPeriod: period("2026-11-04"), gmtoffset: -18000 }), true);
  assert.equal(closed({ regularMarketTime: at("2026-11-04T21:00:00Z"), currentTradingPeriod: period("2026-11-05"), gmtoffset: -18000 }), true);
  assert.equal(closed({ regularMarketTime: at("2026-07-01T19:00:00Z"), gmtoffset: -14400 }), false);
  assert.equal(closed({ regularMarketTime: at("2026-07-01T20:00:00Z"), gmtoffset: -14400 }), true);
});

test("each share is of the members with closes enough for its average, and names are looked up safely", async () => {
  const x = across([memberOn(up, 250), memberOn(up.slice(0, 120), 119), memberOn(down, 250)]);
  assert.deepEqual([x.members, x.above_200d, x.with_200d, x.pct_above_200d, x.above_50d, x.with_50d, x.pct_above_50d], [3, 1, 2, 50, 2, 3, 66.7]);
  await assert.rejects(run({ index: "constructor" }), NotFound);
  assert.equal((await run({ index: "Dow Jones Industrial Average" })).through, "DIA");
});
