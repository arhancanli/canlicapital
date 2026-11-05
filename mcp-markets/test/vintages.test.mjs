import assert from "node:assert/strict";
import { test } from "node:test";

import { createSession } from "../src/sources.mjs";
import { economicSeries } from "../src/tools.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-vintage-fixtures.mjs.
const run = (args) => economicSeries(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("payrolls as published on 1 September 2025, and the million jobs the benchmark revision took out since", async () => {
  const r = await run({ series: "PAYEMS", as_of: "2025-09-01", revisions: true, start: "2025-01-01" });
  assert.equal(r.vintage, "2025-09-01");
  assert.deepEqual(r.latest, { date: "2025-07-01", value: 159539 });
  assert.match(r.as_published, /before any later revision/);
  assert.deepEqual(r.revisions.columns, ["date", "then", "now", "revision", "revision_pct"]);
  assert.deepEqual(r.revisions.rows.at(-1), ["2025-07-01", 159539, 158542, -997, -0.006249]);
  assert.deepEqual(r.revisions.largest, ["2025-07-01", 159539, 158542, -997, -0.006249]);
  assert.match(r.source, /^https:\/\/alfred\.stlouisfed\.org\/series\?seid=PAYEMS$/);
});

test("the unemployment rate as known on 1 April 2020 ends in February, before the pandemic reached the figures", async () => {
  const r = await run({ series: "unemployment rate", as_of: "2020-04-01", last: 3 });
  assert.equal(r.series, "UNRATE");
  assert.deepEqual(r.dates, ["2019-12-01", "2020-01-01", "2020-02-01"]);
  assert.deepEqual(r.values, [3.5, 3.6, 3.5]);
});

test("revisions needs a vintage, and a vintage cannot be in the future", async () => {
  await assert.rejects(run({ series: "PAYEMS", revisions: true }), /give as_of too/);
  await assert.rejects(run({ series: "PAYEMS", as_of: "2027-01-01" }), /in the future/);
});

test("a series ALFRED keeps no past releases of is read as it stands up to the date, and says so", async () => {
  const r = await run({ series: "SP500", as_of: "2024-06-03", last: 2 });
  assert.equal(r.vintage, null);
  assert.deepEqual(r.latest, { date: "2024-06-03", value: 5283.4 });
  assert.match(r.as_published, /ALFRED keeps no past releases of SP500/);
});
