// trade_ticks on Kraken's public trade history captured by scripts/capture-catchup-fixtures.mjs, replayed with
// no network.
import assert from "node:assert/strict";
import test from "node:test";

import { createSession } from "../src/sources.mjs";
import { microIso, toNanos, tradeTicks } from "../src/ticks.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {} });

test("times: a date is its UTC midnight, fractions keep their microseconds, Kraken's seconds print to the microsecond", () => {
  assert.equal(toNanos("2024-01-01"), "1704067200000000000");
  assert.equal(toNanos("2024-01-01T00:00:00.000419Z"), "1704067200000419000");
  assert.equal(toNanos("2024-01-01T04:00:00+04:00"), "1704067200000000000");
  assert.equal(microIso(1704067200.0004199), "2024-01-01T00:00:00.000420Z");
});

test("bitcoin from the first moment of 2024: two thousand trades, their VWAP and sides, minute bars, and where to read on", async () => {
  const r = await tradeTicks(session(), { pair: "bitcoin", start: "2024-01-01T00:00:00Z" });
  assert.equal(r.pair, "BTC/USD");
  assert.equal(r.matched_from, "bitcoin");
  assert.equal(r.trades, 2000);
  assert.equal(r.from, "2024-01-01T00:00:00.000420Z");
  assert.equal(r.summary.vwap, 42500.802537);
  assert.ok(Math.abs(r.summary.buy_volume + r.summary.sell_volume - r.summary.volume) < 1e-7);
  assert.equal(r.summary.buy_share, 0.6035);
  assert.equal(r.bars.rows.length, 151);
  assert.deepEqual(r.bars.rows[0], ["2024-01-01T00:00", 42241.1, 42260.3, 42241.1, 42260.3, 3.1999526, 32, 42259.634608]);
  assert.deepEqual(r.ticks.rows[0], ["2024-01-01T00:00:00.000420Z", 42241.1, 0.00038521, "buy", "market", 65699891]);
  assert.equal(r.ticks.rows.length, 1000);
  assert.equal(r.ticks.shown, 1000);
  assert.match(r.next_since, /^\d{19}$/);
});

test("reading on from next_since gives exactly the trades of one longer read: fills that share a timestamp are not lost", async () => {
  const s = session();
  const one = await tradeTicks(s, { pair: "BTC/USD", start: "2024-01-01T00:00:00Z", requests: 1, ticks: false });
  const two = await tradeTicks(s, { pair: "BTC/USD", since: one.next_since, requests: 1, ticks: false });
  const both = await tradeTicks(s, { pair: "BTC/USD", start: "2024-01-01", requests: 2, ticks: false });
  assert.equal(one.trades + two.trades, both.trades);
  assert.equal(Math.round((one.summary.notional + two.summary.notional) * 100), Math.round(both.summary.notional * 100));
  assert.equal(two.to, both.to);
  assert.equal(two.next_since, both.next_since);
  assert.equal(one.ticks, undefined);
});

test("a window with an end stops there, with no cursor to read on", async () => {
  const r = await tradeTicks(session(), { pair: "ETH/EUR", start: "2025-04-07T13:30:00Z", end: "2025-04-07T13:31:00Z" });
  assert.equal(r.pair, "ETH/EUR");
  assert.equal(r.trades, 15);
  assert.equal(r.summary.vwap, 1365.544225);
  assert.equal(r.bars.rows.length, 1);
  assert.equal(r.reached_end, true);
  assert.equal(r.next_since, undefined);
});

test("start or since, one of the two", async () => {
  await assert.rejects(tradeTicks(session(), { pair: "BTC/USD" }), /one of the two/);
  await assert.rejects(tradeTicks(session(), { pair: "BTC/USD", start: "2024-01-01", since: "1704067200000000000" }), /one of the two/);
});
