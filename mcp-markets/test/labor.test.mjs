import assert from "node:assert/strict";
import { test } from "node:test";

import { laborMarket } from "../src/labor.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-labor-fixtures.mjs on 2026-11-05 (FRED's series to September and late October 2026).
const run = (args) => laborMarket(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("the jobs picture: payroll gains and their average, unemployment, wages, openings per unemployed, claims", async () => {
  const r = await run({ months: 4 });
  assert.deepEqual(r.summary, [
    "Payrolls rose 29 thousand in 2026-09 (three-month average 51 thousand); unemployment was 4.2% (4.1% the month before), U-6 7.6%.",
    "Average hourly earnings rose 3% on a year.",
    "There were 7.52 million job openings in 2026-09 (1.06 per unemployed person); quits 2.1%, layoffs 1%.",
    "Initial jobless claims were 194,000 in the week to 2026-10-24.",
  ]);
  assert.deepEqual(r.rows.find((x) => x[0] === "unemployment_rate"), ["unemployment_rate", "unemployment rate", "percent", "2026-09", 4.2, 4.1, 0.1, 4.4, -0.2]);
  assert.deepEqual(r.rows.find((x) => x[0] === "initial_claims").slice(3, 5), ["2026-10-24", 194000]);
  assert.deepEqual(r.payrolls.rows, [["2026-06", 31, 4.2], ["2026-07", -10, 4.1], ["2026-08", 133, 4.1], ["2026-09", 29, 4.2]]);
  assert.equal(r.openings_per_unemployed, 1.06);
});
