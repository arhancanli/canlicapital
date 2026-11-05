import assert from "node:assert/strict";
import { test } from "node:test";

import { commodityPrices, findCommodity } from "../src/pinksheet.mjs";
import { createSession, NotFound } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-pinksheet-fixtures.mjs on 2026-11-05: the page's link and the workbook's last 72 months.
const run = (args) => commodityPrices(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("a commodity by its everyday name", () => {
  const names = ["Crude oil, average", "Crude oil, Brent", "Maize", "Iron ore, cfr spot", "Copper"];
  assert.equal(findCommodity(names, "brent"), 1);
  assert.equal(findCommodity(names, "corn"), 2);
  assert.equal(findCommodity(names, "Iron ore"), 3);
  assert.throws(() => findCommodity(names, "unobtainium"), NotFound);
});

test("the headline commodities and the sector indexes, then one commodity with its record", async () => {
  const r = await run({});
  assert.equal(r.month, "2026-10");
  assert.equal(r.updated, "November 03, 2026");
  assert.equal(r.summary[0], "In 2026-10: Brent 125 $/bbl (+93.2% on a year); gold 4105 $/troy oz (+1.2% on a year); copper 14508 $/mt (+35.1% on a year); wheat 317 $/mt (+37.3% on a year).");
  // Copper in September, 14474 $/mt, against the IMF's 14473.06 on FRED (PCOPPUSDM).
  assert.deepEqual(r.rows.find((x) => x[0] === "Copper"), ["Copper", "$/mt", "2026-10", 14508, 0.2, 35.1, 47.6]);
  assert.deepEqual(r.indices.rows[0], ["Total Index", "2026-10", 149.2, 4.4, 58.1]);
  const io = await run({ commodity: "iron ore", months: 2 });
  assert.equal(io.summary[0], "Iron ore, cfr spot averaged 90.8 $/dmtu in 2026-10, down 12.3% on a year; its record is 214.4 (2021-06).");
  assert.equal(io.rows.length, 2);
});
