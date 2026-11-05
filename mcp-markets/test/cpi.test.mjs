import assert from "node:assert/strict";
import { test } from "node:test";

import { COMPONENTS, inflationBreakdown } from "../src/cpi.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-cpi-fixtures.mjs on 2026-11-05 (FRED's CPI series to September 2026).
const run = (args) => inflationBreakdown(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("each component on the month, over three months and on a year; the headline as the BLS states it", async () => {
  const r = await run({});
  assert.equal(r.month, "2026-09");
  // All items 3.74% and core 2.56% on a year: FRED's CPIAUCNS gives 3.7377%, the Cleveland Fed's file 3.7377% and 2.5644%.
  assert.deepEqual(r.summary, [
    "In 2026-09 consumer prices rose 0.65% on the month (seasonally adjusted) and 3.74% on a year; core prices 0.33% and 2.56% (up from 2.45% the month before).",
    "On a year: shelter 3.22%, core goods 0.74%, core services 3.15%, energy 20.45%, food 2.48%.",
    "Fastest on a year: gasoline (34.17%); slowest: used cars (-1.46%).",
  ]);
  assert.equal(r.rows.length, COMPONENTS.length);
  assert.deepEqual(r.rows.find((x) => x[0] === "shelter"), ["shelter", "shelter", 0.39, 3.2, 3.22, 3.04]);
  assert.deepEqual(r.headline_and_core.rows.at(-1), ["2026-09", 0.65, 3.74, 0.33, 2.56]);
  assert.equal(r.headline_and_core.rows.length, 13);
});
