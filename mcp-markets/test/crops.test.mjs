import assert from "node:assert/strict";
import { test } from "node:test";

import { cropOutlook, findCommodity, reportsFrom } from "../src/crops.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-crop-fixtures.mjs: ESMIS's list of reports and the October 2026 WASDE's XML.
const run = (args) => cropOutlook(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("commodities by the words people use; reports newest first, a re-issue replacing the first", () => {
  const cases = { corn: "corn", maize: "corn", "soybean meal": "soybean_meal", "soy oil": "soybean_oil", soybeans: "soybeans", "coarse grains": "coarse_grains", "crude oil": null, gold: null };
  for (const [q, want] of Object.entries(cases)) assert.equal(findCommodity(q), want, q);
  const html = '<a href="/sites/default/release-files/1/wasde0626.xml"></a><a href="/sites/default/release-files/2/wasde0626v2.xml"></a><a href="/sites/default/release-files/3/wasde0726.xml"></a>';
  assert.deepEqual(reportsFrom(html), [{ month: "2026-07", url: "https://esmis.nal.usda.gov/sites/default/release-files/3/wasde0726.xml" }, { month: "2026-06", url: "https://esmis.nal.usda.gov/sites/default/release-files/2/wasde0626v2.xml" }]);
});

test("world corn in the October 2026 WASDE: this year's projection as September and October set it, and the revision", async () => {
  const r = await run({ commodity: "corn" });
  assert.equal(r.report.month, "October 2026");
  assert.equal(r.unit, "Million Metric Tons");
  assert.equal(r.region, "World");
  assert.deepEqual(r.columns, ["attribute", "2024/25", "2025/26 Est.", "2026/27 Proj. (Sep)", "2026/27 Proj. (Oct)", "change Sep to Oct"]);
  // Checked against the report's text version: World 3/ Sep 301.38 1290.95 ... 272.10; Oct 307.16 1293.75 ... 280.44.
  assert.deepEqual(r.rows.find((x) => x[0] === "Ending Stocks"), ["Ending Stocks", 295.64, 307.16, 272.1, 280.44, 8.34]);
  assert.deepEqual(r.rows.find((x) => x[0] === "Production"), ["Production", 1234.98, 1330.62, 1290.95, 1293.75, 2.8]);
  assert.ok(r.changes.some((c) => c.attribute === "Ending Stocks" && c.change === 8.34));
  assert.ok(r.regions.includes("China") && r.regions.includes("Brazil"));
});

test("one country's balance sheet, every country at once, and US cotton in bales", async () => {
  const china = await run({ commodity: "soybeans", region: "China" });
  assert.deepEqual(china.rows.find((x) => x[0] === "Imports"), ["Imports", 108, 113, 115, 115, 0]);
  assert.deepEqual(china.changes, []);
  const all = await run({ commodity: "wheat", region: "all" });
  assert.deepEqual(all.rows[0].slice(0, 2), ["World", 281.55]);
  assert.equal(all.columns.at(-1), "ending_stocks_change");
  assert.equal(all.market_year, "2026/27 as projected in Oct");
  const cotton = await run({ commodity: "cotton", region: "US" });
  assert.deepEqual(cotton.rows.find((x) => x[0] === "Ending Stocks"), ["Ending Stocks", "million 480-pound bales", 4, 4.15, 3.6, 3.8, 0.2]);
  // "776 *" and "790 **" in the report: its footnote stars are dropped, the figures kept.
  assert.deepEqual(cotton.rows.find((x) => x[0] === "Yield per Harvested Acre"), ["Yield per Harvested Acre", "pounds per acre", 892, 852, 776, 790, 14]);
});

test("the US balance sheet from its own page, with its season-average farm price, each line with its unit", async () => {
  // Checked against the report's text version: corn 2026/27 Sep and Oct.
  const corn = await run({ commodity: "corn", region: "United States" });
  assert.equal(corn.region, "United States");
  assert.deepEqual(corn.rows.find((x) => x[0] === "Ending Stocks"), ["Ending Stocks", "million bushels", 1551, 2095, 1567, 1849, 282]);
  assert.deepEqual(corn.rows.find((x) => x[0] === "Avg. Farm Price ($/bu)"), ["Avg. Farm Price ($/bu)", "$/bu", 4.24, 4.16, 4.8, 4.7, -0.1]);
  assert.deepEqual(corn.rows.find((x) => x[0] === "Yield per Harvested Acre").slice(1), ["bushels per acre", 179.3, 186.5, 178.5, 181.2, 2.7]);
  const sorghum = await run({ commodity: "sorghum" });
  assert.deepEqual(sorghum.rows.find((x) => x[0] === "Production"), ["Production", "million bushels", 344, 437, 284, 291, 7]);
  await assert.rejects(run({ commodity: "oats", region: "China" }), /oats for the United States only/);
});

test("what cannot be answered says what to ask instead", async () => {
  await assert.rejects(run({ commodity: "crude oil" }), /not a commodity in the WASDE's tables/);
  await assert.rejects(run({ commodity: "corn", region: "Atlantis" }), /has no region "Atlantis"\. It has: World/);
  await assert.rejects(run({ commodity: "corn", report: "1999-01" }), /1999-01 is not among them/);
});

test("the USDA's own record of this month's projections beside them: world wheat as the report's note gives it", async () => {
  const wheat = await run({ commodity: "wheat" });
  assert.equal(wheat.reliability.region, "World");
  // The report's note: "chances are 2 out of 3 ... not ... more than 1.6 percent ... 9 out of 10 ... 2.8 percent ... average
  // difference ... 7.5 million tons, ranging from 0.1 million to 27.8 million ... below the estimate 32 times and above 11".
  assert.deepEqual(wheat.reliability.rows.find((x) => x[0] === "Production"), ["Production", 1.6, 2.8, 7.5, 0.1, 27.8, 32, 11]);
  const soy = await run({ commodity: "soybeans", region: "United States" });
  assert.equal(soy.reliability.region, "U.S.");
  assert.equal(soy.reliability.rows.find((x) => x[0] === "Ending Stocks")[1], 42.5);
  assert.equal((await run({ commodity: "corn" })).reliability, undefined, "corn's record is not on the world reliability pages");
});

test("US meats: two projection years, each with its own revision, per capita in pounds a person", async () => {
  // Checked against the report's text version: Beef 2026 Proj. Sep 24945, Oct 24870; 2027 Proj. Sep 24903, Oct 24743.
  const beef = await run({ commodity: "beef" });
  assert.deepEqual(beef.columns, ["attribute", "unit", "2025", "2026 Proj. (Sep)", "2026 Proj. (Oct)", "change Sep to Oct (2026)", "2027 Proj. (Sep)", "2027 Proj. (Oct)", "change Sep to Oct (2027)"]);
  assert.deepEqual(beef.rows.find((x) => x[0] === "Production"), ["Production", "million pounds", 26071, 24945, 24870, -75, 24903, 24743, -160]);
  assert.deepEqual(beef.rows.find((x) => x[0] === "Per Capita").slice(0, 3), ["Per Capita", "pounds per person (retail weight)", 59.2]);
  assert.equal((await run({ commodity: "chicken" })).rows.find((x) => x[0] === "Production")[4], 49188);
});
