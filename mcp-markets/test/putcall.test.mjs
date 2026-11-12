import assert from "node:assert/strict";
import { test } from "node:test";

import { dayStats, putCallRatios, weekdaysBack } from "../src/putcall.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-putcall-fixtures.mjs: Cboe's daily statistics before 2026-10-09, the fields read.
const run = (args) => putCallRatios(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("weekdays counted back over a weekend, and a day's ratios and volumes", () => {
  assert.deepEqual(weekdaysBack(Date.parse("2026-10-12T12:00:00Z"), 3), ["2026-10-12", "2026-10-09", "2026-10-08"]);
  const s = dayStats({ ratios: [{ name: "TOTAL PUT/CALL RATIO", value: "0.86" }, { name: "EQUITY PUT/CALL RATIO", value: "0.60" }], "EQUITY OPTIONS": [{ name: "VOLUME", call: 1760460, put: 1063868, total: 2824328 }] });
  assert.equal(s.ratios.total, 0.86);
  assert.equal(s.ratios.index, null);
  assert.deepEqual(s.volumes.equity, { calls: 1760460, puts: 1063868 });
});

test("the latest trading day's ratios, the days before with their averages", async () => {
  const r = await run({});
  assert.equal(r.date, "2026-10-08");
  assert.equal(r.summary[0], "On 2026-10-08 the equity put/call ratio on Cboe's options was 0.62 (its 10-day average 0.56), the total 0.89 and the index 1.03; above 1, more puts traded than calls.");
  assert.deepEqual(r.latest.ratios, { total: 0.89, equity: 0.62, index: 1.03, etp: 1.1, vix: 0.34, spx: 1.18 });
  assert.deepEqual(r.latest.volumes.equity, { calls: 3135783, puts: 1956246 });
  assert.equal(r.rows.length, 20);
  assert.deepEqual([r.rows[0][0], r.rows.at(-1)[0]], ["2026-09-11", "2026-10-08"]);
  assert.equal((await run({ days: 5 })).rows.length, 5);
});
