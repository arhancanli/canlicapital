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
  assert.equal(cotton.unit, "Million 480-Pound Bales");
  assert.deepEqual(cotton.rows.find((x) => x[0] === "Ending Stocks"), ["Ending Stocks", 4, 4.15, 3.6, 3.8, 0.2]);
});

test("what cannot be answered says what to ask instead", async () => {
  await assert.rejects(run({ commodity: "crude oil" }), /not a commodity in the WASDE's world tables/);
  await assert.rejects(run({ commodity: "corn", region: "Atlantis" }), /has no region "Atlantis"\. It has: World/);
  await assert.rejects(run({ commodity: "corn", report: "1999-01" }), /1999-01 is not among them/);
});
