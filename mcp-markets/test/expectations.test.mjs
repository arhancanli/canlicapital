import assert from "node:assert/strict";
import { test } from "node:test";

import { contractOf, meetingRates, moves, rateExpectations } from "../src/expectations.mjs";
import { createSession } from "../src/sources.mjs";
import { replayFetch } from "./replay.mjs";

// Captured by scripts/capture-expectations-fixtures.mjs at 2026-11-04 23:00 UTC (and at replay.mjs's NOW for stdio).
const AT = Date.parse("2026-11-04T23:00:00Z");
const run = (args) => rateExpectations(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => AT, env: {}, sleep: async () => {} }), args);

test("contract symbols by month, and a meeting month's rate in and out by FedWatch's method", () => {
  assert.equal(contractOf(2026, 11), "ZQX26.CBT");
  assert.equal(contractOf(2027, 1), "ZQF27.CBT");
  const months = [
    { key: "2026-11", days: 30, meeting: null, implied: 3.88 },
    { key: "2026-12", days: 31, meeting: "2026-12-09", implied: 4.025 },
    { key: "2027-01", days: 31, meeting: "2027-01-27", implied: 4.095 },
    { key: "2027-02", days: 28, meeting: null, implied: 4.145 },
  ];
  const [dec, jan] = meetingRates(months, 3.88);
  // December: 9 days at 3.88% and 22 at the new rate average 4.025%; January ends where February's contract holds.
  assert.equal(dec.start, 3.88);
  assert.ok(Math.abs(dec.end - (31 * 4.025 - 9 * 3.88) / 22) < 1e-12);
  assert.equal(jan.start, dec.end);
  assert.equal(jan.end, 4.145);
});

test("an expected change split between the nearest quarter-point moves", () => {
  const [[k0, p0], [k1, p1]] = moves(0.2043);
  assert.deepEqual([k0, k1], [0, 1]);
  assert.ok(Math.abs(p0 - 0.1828) < 1e-9 && Math.abs(p1 - 0.8172) < 1e-9);
  assert.deepEqual(moves(-0.3).map(([k, p]) => [k, Math.round(p * 100)]), [[-1, 80], [-2, 20]]);
  assert.deepEqual(moves(0), [[0, 1]]);
});

test("the market's odds at each meeting, the target ranges after each, and the futures behind them", async () => {
  const r = await run({});
  assert.equal(r.summary[0], "Fed funds futures price 81.7% a 25 bp hike and 18.3% no change at the 2026-12-09 meeting; the target range is 3.75-4.00% and the effective rate 3.88% (2026-11-03).");
  assert.deepEqual(r.current, { target_range: "3.75-4.00", lower: 3.75, upper: 4, effective_rate: 3.88, effective_rate_date: "2026-11-03" });
  assert.deepEqual(r.meetings.rows[0], ["2026-12-09", 4.084, 20.4, 20.4, 18.3, 81.7, 0, "4.00-4.25", 81.7]);
  assert.equal(r.meetings.rows.length, 8);
  for (const row of r.target_ranges.rows) assert.ok(Math.abs(row.slice(1).reduce((s, x) => s + x, 0) - 100) < 0.3, row[0]);
  assert.deepEqual(r.futures.rows[0], ["2026-11", "ZQX26.CBT", 96.12, 3.88, null, "2026-11-04"]);
  assert.equal((await run({ meetings: 2 })).meetings.rows.length, 2);
});

test("a server with keyless prices off says so", async () => {
  const session = createSession({ fetchImpl: replayFetch().fetchImpl, now: () => AT, env: { CANLI_KEYLESS_PRICES: "0" }, sleep: async () => {} });
  await assert.rejects(rateExpectations(session, {}), /CANLI_KEYLESS_PRICES=0/);
});
