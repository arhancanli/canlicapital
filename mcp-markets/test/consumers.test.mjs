import assert from "node:assert/strict";
import { test } from "node:test";

import { consumerExpectations } from "../src/consumers.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-consumers-fixtures.mjs on 2026-11-04: the survey's tabs, their last 26 months.
const run = (args) => consumerExpectations(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("each topic's headline in the latest month, beside the month and the year before, with the license's attribution", async () => {
  const r = await run({});
  assert.equal(r.month, "2026-09");
  assert.deepEqual(r.summary, [
    "In 2026-09 households expected inflation of 3.9% over the next year (3.58% the month before, 3.38% a year earlier), 3.25% over three years and 3% over five.",
    "They put a 43.9% chance on US unemployment being higher a year from now and 40.2% on stock prices being higher.",
  ]);
  assert.equal(r.rows.length, 21);
  assert.deepEqual(r.rows.find((x) => x[0] === "job_loss_chance"), ["job_loss_chance", "losing their job within a year", "chance_pct", "2026-09", 13.52, 13.84, 14.85, -1.33]);
  assert.match(r.limits[0], /^Source: Survey of Consumer Expectations, © 2013-26 Federal Reserve Bank of New York \(FRBNY\)\..*FRBNY disclaims any responsibility/);
});

test("one topic month by month with every measure the survey gives", async () => {
  const r = await run({ topic: "inflation", months: 3 });
  assert.equal(r.columns[1], "Median one-year ahead expected inflation rate");
  assert.equal(r.columns.length, 13);
  assert.deepEqual(r.rows.map((x) => [x[0], x[1], x[2]]), [["2026-07", 3.63, 3.26], ["2026-08", 3.58, 3.19], ["2026-09", 3.9, 3.25]]);
});
