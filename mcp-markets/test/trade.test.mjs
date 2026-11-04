// trade_flows on UN Comtrade records captured by scripts/capture-catchup-fixtures.mjs, replayed with no network.
import assert from "node:assert/strict";
import test from "node:test";

import { createSession } from "../src/sources.mjs";
import { findCountry, tradeFlows } from "../src/trade.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {} });

test("countries by name, alias or ISO code; Taiwan only as a partner, under the name customs give it", () => {
  const list = [
    { code: 842, name: "USA", iso2: "US", iso3: "USA" }, { code: 276, name: "Germany", iso2: "DE", iso3: "DEU" },
    { code: 410, name: "Rep. of Korea", iso2: "KR", iso3: "KOR" }, { code: 408, name: "Dem. People's Rep. of Korea", iso2: "KP", iso3: "PRK" },
    { code: 490, name: "Other Asia, nes", iso2: null, iso3: "S19" },
  ];
  assert.equal(findCountry(list, "United States", "reporter").code, 842);
  assert.equal(findCountry(list, "DEU", "reporter").code, 276);
  assert.equal(findCountry(list, "de", "reporter").code, 276);
  assert.equal(findCountry(list, "South Korea", "partner").code, 410);
  assert.equal(findCountry(list, "Taiwan", "partner").code, 490);
  assert.throws(() => findCountry(list, "Taiwan", "reporter"), /does not report to UN Comtrade/);
  assert.throws(() => findCountry(list, "Atlantis", "partner"), /no partner called/);
});

test("who supplies US chips: the latest year with data, every partner ranked by share, Taiwan named", async () => {
  const r = await tradeFlows(session(), { reporter: "United States", product: "semiconductors" });
  assert.equal(r.year, 2025);
  assert.deepEqual(r.product, { code: "8542", description: "Electronic integrated circuits" });
  assert.equal(r.total_usd, 42423323003);
  assert.equal(r.partners_reported, 110);
  assert.deepEqual(r.partners.rows.slice(0, 2).map((x) => [x[0], x[2]]), [["Taiwan (Other Asia, nes)", 0.3062], ["Malaysia", 0.2522]]);
  assert.equal(r.caution, undefined);
});

test("one partner year by year: Taiwan's share of US chip imports and its change", async () => {
  const r = await tradeFlows(session(), { reporter: "USA", partner: "Taiwan", product: "8542" });
  assert.equal(r.partner, "Taiwan (Other Asia, nes)");
  assert.deepEqual(r.series.columns, ["year", "value_usd", "change", "share_of_total", "unattributed_share", "net_weight_kg", "usd_per_kg"]);
  assert.deepEqual(r.series.rows.map((x) => [x[0], x[3]]), [[2021, 0.1306], [2022, 0.1852], [2023, 0.2032], [2024, 0.2812], [2025, 0.3062]]);
  assert.equal(r.series.rows[4][2], 0.1441);
});

test("trade with no partner named is counted and flagged: Germany's pipeline gas", async () => {
  const r = await tradeFlows(session(), { reporter: "Germany", partner: "Russia", product: "natural gas", years: [2020, 2021, 2022, 2023] });
  assert.equal(r.partner, "Russian Federation");
  assert.ok(r.series.rows.every((x) => x[4] > 0.95), JSON.stringify(r.series.rows));
  assert.equal(r.series.rows[1][3], 0.0023);
  assert.match(r.caution, /names no partner/);
});

test("a product neither coded nor known is refused with the way to name it", async () => {
  await assert.rejects(tradeFlows(session(), { reporter: "USA", product: "unobtainium" }), /HS code/);
});
