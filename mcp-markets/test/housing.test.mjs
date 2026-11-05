import assert from "node:assert/strict";
import { test } from "node:test";

import { housingMarket, metroKey, zillowFile } from "../src/housing.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-housing-fixtures.mjs on 2026-11-04, trimmed as it says.
const run = (args) => housingMarket(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("a metro matched across Zillow's and Realtor.com's names, and Zillow's wide file kept as its recent months", () => {
  assert.equal(metroKey("Austin, TX"), metroKey("Austin-Round Rock-San Marcos, TX"));
  assert.equal(metroKey("New York-Newark-Jersey City, NY-NJ"), "new york|ny");
  assert.equal(metroKey("Louisville/Jefferson County, KY-IN"), metroKey("Louisville, KY"));
  const z = JSON.parse(zillowFile("RegionID,SizeRank,RegionName,RegionType,StateName,2026-08-31,2026-09-30\n102001,0,United States,country,,365800.1,366157.2\n394355,29,\"Austin, TX\",msa,TX,415000,414273.4\n"));
  assert.deepEqual(z.months, ["2026-08", "2026-09"]);
  assert.deepEqual(z.regions[1], { name: "Austin, TX", type: "msa", rank: 29, values: [415000, 414273.4] });
});

test("the US market: home values, listings (Realtor.com's September matches FRED's copies) and the mortgage rate", async () => {
  const r = await run({});
  assert.deepEqual(r.summary, [
    "Zillow's typical home value in the US was $366,157 in 2026-09, up 1.2% on a year and at its peak.",
    "Realtor.com counted 1,183,520 active listings in 2026-10 (+7.4% on a year), a median 63 days on market, and price cuts on 20.5% of listings.",
    "The 30-year mortgage rate was 7.24% (2026-10-29), against 6.17% a year earlier.",
  ]);
  assert.equal(r.home_value.change_five_years_pct, 19.7);
  assert.equal(r.listings.median_listing_price, 415000);
});

test("a metro by its main city, and the largest metros ranked by how fast values fall", async () => {
  const aus = await run({ area: "Austin" });
  assert.equal(aus.summary[0], "Zillow's typical home value in Austin, TX was $414,273 in 2026-09, down 4.3% on a year and 26.7% below its peak (2022-06).");
  assert.equal(aus.listings.median_days_on_market, 84);
  const f = await run({ rank: "falling", limit: 3 });
  assert.deepEqual(f.rows, [["Austin, TX", 414273, -4.3, -26.7, 1.3, 84, 26.3], ["Cape Coral, FL", 334479, -3.5, -18.9, -12.7, 80, 19], ["Las Vegas, NV", 422654, -2.6, -5.3, 9.8, 59, 23.8]]);
  await assert.rejects(run({ area: "Atlantis" }), /no metro area named Atlantis/);
});
