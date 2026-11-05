import assert from "node:assert/strict";
import { test } from "node:test";

import { billBondEquivalent, curveRecessionChance, normalCdf, recessionWatch } from "../src/recession.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-recession-fixtures.mjs on 2026-11-04 (FRED's series to that day).
const run = (args) => recessionWatch(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("the New York Fed's yield-curve model, reproduced: September 2026's spread 0.95509 and 12.7587%, as its chart of 4 October shows", () => {
  assert.equal(Math.round(billBondEquivalent(3.94) * 1e4) / 1e4, 4.0349);
  assert.equal(Math.round((4.99 - billBondEquivalent(3.94)) * 1e5) / 1e5, 0.95509);
  assert.equal(Math.round(curveRecessionChance(0.95509) * 1e6) / 1e4, 12.7587);
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-8);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-4);
});

test("each indicator beside its line, a count of those past it, and the model month by month", async () => {
  const r = await run({ months: 3 });
  assert.equal(r.summary[0], "0 of 7 recession indicators are past their lines.");
  assert.equal(r.summary[1], "The New York Fed's yield-curve model gives a 12.42% chance of the US being in recession in 2027-10, twelve months ahead (10-year less 3-month spread 0.98128 points in 2026-10).");
  assert.deepEqual(r.yield_curve_model.rows, [["2026-08", 0.87253, 13.88], ["2026-09", 0.95509, 12.76], ["2026-10", 0.98128, 12.42]]);
  const by = Object.fromEntries(r.rows.map((x) => [x[0], x]));
  assert.deepEqual([by.curve_10y_2y[2], by.curve_10y_2y[3], by.curve_10y_2y[6]], [0.32, "2026-11-04", "clear"]);
  assert.deepEqual([by.jobless_claims[2], by.jobless_claims[7]], [196750, -13.2]);
  assert.match(r.summary.find((x) => x.includes("10-year less 2-year")), /last inverted on 2024-09-05/);
  // The Fed Board's file: est_prob 0.0912 for September 2026.
  assert.deepEqual([by.ebp_model[2], by.ebp_model[3], by.ebp_model[6]], [9.1, "2026-09", "clear"]);
  assert.equal(r.summary[2], "The Fed Board staff's excess bond premium model gives a 9.1% chance of a recession starting within twelve months (2026-09; the premium -0.39 points).");
});
