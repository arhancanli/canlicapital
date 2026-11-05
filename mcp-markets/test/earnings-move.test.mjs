import assert from "node:assert/strict";
import { test } from "node:test";

import { earningsMove, pastMoves, resultsMove, straddle } from "../src/earnings-move.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-earnings-move-fixtures.mjs on 2026-11-05: Apple's daily closes; its EDGAR releases and
// Cboe chain are the files the other tests use (the chain trimmed to its nearest expirations).
const run = (args) => earningsMove(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("the at-the-money straddle of one expiration, and the results' own move backed out of two", () => {
  const c = (strike, type, mid, iv) => ({ expiry: "2026-11-20", strike, type, mid, iv });
  const s = straddle([c(95, "call", 7, 0.5), c(100, "call", 3, 0.52), c(100, "put", 2, 0.5), c(105, "put", 6, 0.5)], "2026-11-20", 101);
  assert.deepEqual(s, { expiration: "2026-11-20", strike: 100, price: 5, move_pct: 4.95, atm_iv: 0.51 });
  assert.equal(straddle([c(100, "call", 3, 0.5)], "2026-11-20", 101), null);
  // NVIDIA on 5 November: the 20 November expiration at 54.06% against the 13 November one at 44.83% leaves a
  // results move of one standard deviation 6.56%, an expected 5.23% either way.
  assert.deepEqual(resultsMove({ expiration: "2026-11-20", atm_iv: 0.5406 }, { expiration: "2026-11-13", atm_iv: 0.4483 }, "2026-11-05"), { one_sd_pct: 6.56, expected_abs_pct: 5.23 });
  // No premium for the results: nothing to back out.
  assert.equal(resultsMove({ expiration: "2026-11-20", atm_iv: 0.3 }, { expiration: "2026-11-13", atm_iv: 0.35 }, "2026-11-05"), null);
});

test("each past release's move from the session before its reaction session, after the close or before the open", () => {
  const dates = ["2026-05-19", "2026-05-20", "2026-05-21", "2026-08-25", "2026-08-26", "2026-08-27"];
  const closes = [100, 102, 99.96, 50, 50, 54];
  const rows = pastMoves([["2026-08-26", "Wednesday", "16:21", "after the close"], ["2026-05-20", "Wednesday", "08:00", "before the open"], ["2026-01-02", "Friday", "16:00", "after the close"]], dates, closes);
  assert.deepEqual(rows, [["2026-08-26", "after the close", "2026-08-27", 8], ["2026-05-20", "before the open", "2026-05-20", 2], ["2026-01-02", "after the close", null, null]]);
});

test("Apple's past reactions from its own releases and closes, and the options named when they cannot price the date", async () => {
  const r = await run({ company: "AAPL" });
  assert.equal(r.next.expected, "2026-10-29");
  // As the record shows them: -7.35% on 31 July 2026, -3.74% on 2 May 2025, -1.33% on 1 November 2024.
  assert.deepEqual(r.past_moves.rows.map((x) => [x[2], x[3]]), [["2026-07-31", -7.35], ["2026-05-01", 3.24], ["2026-01-30", 0.46], ["2025-10-31", -0.38], ["2025-08-01", -2.5], ["2025-05-02", -3.74], ["2025-01-31", -0.67], ["2024-11-01", -1.33]]);
  assert.equal(r.summary[1], "Over its last 8 releases the shares moved 2.46% on average in the session after the results (median 1.92%, largest -7.35% on 2026-07-31).");
  // The captured chain stops at 23 October, before the expected results.
  assert.equal(r.implied_move, null);
  assert.match(r.limits.join(" "), /no AAPL option expiring after 2026-10-29/);
  assert.equal(r.before_results.expiration, "2026-10-23");
});
