import assert from "node:assert/strict";
import { test } from "node:test";

import { energyReport, fiveYear, historyPage, wpsrTable } from "../src/energy.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-energy-fixtures.mjs: EIA's report for the week to 2026-10-30 (gas: 2026-10-23).
const session = (fetchImpl = replayFetch().fetchImpl) => createSession({ fetchImpl, now: () => NOW, env: {}, sleep: async () => {} });
const run = (args, fetchImpl) => energyReport(session(fetchImpl), args);

test("a weekly table read with its line numbers dropped, and a history page as weeks in million barrels", () => {
  const t = wpsrTable('"STUB_1","STUB_2","10/30/26","10/23/26"\n"Crude Oil Supply ","(1)     Domestic Production","14,003","13,992"\n');
  assert.deepEqual(t.head, ["STUB_1", "STUB_2", "10/30/26", "10/23/26"]);
  assert.deepEqual(t.rows, [["Crude Oil Supply", "Domestic Production", "14,003", "13,992"]]);
  const page = JSON.parse(historyPage("<tr> <td class='B6'>&nbsp;&nbsp;2026-Oct</td> <td class='B5'>10/23&nbsp;</td> <td class='B3'>410,625&nbsp;&nbsp;</td> <td class='B5'>10/30&nbsp;</td> <td class='B3'>409,760&nbsp;</td> </tr> <td class='F2'>Release Date: 11/4/2026</td> <td class='F2'>Next Release Date: 11/12/2026</td>"));
  assert.deepEqual(page, { released: "2026-11-04", next: "2026-11-12", weeks: [["2026-10-23", 410.625], ["2026-10-30", 409.76]] });
});

test("the five-year average takes the nearest week in each of the five years before, and needs all five", () => {
  const weeks = [["2021-10-29", 5], ["2022-10-28", 4], ["2023-10-27", 3], ["2024-11-01", 2], ["2025-10-31", 1]];
  assert.deepEqual(fiveYear(weeks, "2026-10-30"), { average: 3, low: 1, high: 5 });
  assert.equal(fiveYear(weeks.slice(1), "2026-10-30"), null);
});

test("the five-year comparison agrees with EIA's own highlights for the week to 2026-09-11", async () => {
  // EIA's highlights for that week: crude 1% above, gasoline 5% below, distillate 13% below, propane 22% above.
  const said = { crude_oil_commercial: 1, gasoline: -5, distillate: -13, propane: 22 };
  for (const [stock, pct] of Object.entries(said)) {
    const r = await run({ stock, weeks: 8 });
    const week = r.rows.find((x) => x[0] === "2026-09-11");
    assert.equal(Math.round(week[3]), pct, stock);
  }
});

test("the week in oil: stocks against the five-year average, supply, refining and a plain summary", async () => {
  const r = await run({});
  assert.equal(r.oil.week_ending, "2026-10-30");
  assert.equal(r.oil.released, "2026-11-04");
  assert.equal(r.oil.next_release, "2026-11-12");
  const stock = Object.fromEntries(r.oil.stocks.rows.map((x) => [x[0], x.slice(1)]));
  assert.deepEqual(stock.crude_oil_commercial, [409.76, -0.865, 421.168, -2.7, 428.3, -4.3, 421.2, 436.8]);
  assert.deepEqual(stock.crude_oil_cushing.slice(0, 2), [27.25, 0.28]);
  assert.deepEqual(stock.crude_oil_spr.slice(4), [null, null, null, null]);
  const flow = Object.fromEntries(r.oil.supply.rows.map((x) => [x[0], x.slice(1)]));
  assert.deepEqual(flow.crude_production, [14003, 11, 13736, 13640, 0.7]);
  assert.deepEqual(flow.products_supplied_total, [21962, 1753, 21191, 20344, 4.2]);
  assert.deepEqual(r.oil.refining, { utilization_pct: 94.5, week_ago_pct: 92.8, year_ago_pct: 86, four_week_average_pct: 93.6, crude_runs: 16725, gross_inputs: 17054, operable_capacity: 18044 });
  assert.equal(r.summary[0], "Commercial crude oil stocks fell 0.9 million barrels to 409.8 million barrels, 4.3% below the five-year average for the week.");
  assert.equal(r.summary.at(-1), "Working gas in storage rose 80 Bcf to 3,724 Bcf in the week to 2026-10-23, 3.8% below a year ago and 1% above the five-year average.");
  assert.equal(r.oil.by_district, undefined);
});

test("natural gas storage by region with EIA's own comparisons, and districts on request", async () => {
  const gas = (await run({ report: "gas" })).gas;
  assert.equal(gas.five_year_basis, "5-year (2021-25) average");
  assert.deepEqual(gas.rows[0], ["total lower 48 states", 3724, 80, 80, 3871, -3.8, 3686, 1]);
  assert.equal(gas.rows.length, 8);
  const oil = (await run({ report: "oil", by_district: true })).oil;
  assert.deepEqual(oil.by_district.rows[1], ["Midwest (PADD 2)", 107.809, 3896, 92.9]);
});

test("one report missing leaves the other, said plainly", async () => {
  const { fetchImpl } = replayFetch();
  const r = await run({}, async (url, init) => (/wngsr/.test(url) ? new Response("down", { status: 503 }) : fetchImpl(url, init)));
  assert.equal(r.oil.week_ending, "2026-10-30");
  assert.match(r.gas.unavailable, /HTTP 503/);
  await assert.rejects(run({ report: "gas" }, async () => new Response("down", { status: 503 })), /HTTP 503/);
});
