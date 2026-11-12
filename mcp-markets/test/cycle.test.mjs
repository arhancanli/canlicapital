// financial_cycle on the BIS series captured by scripts/capture-catchup-fixtures.mjs, replayed with no network.
import assert from "node:assert/strict";
import test from "node:test";

import { csvRows, financialCycle } from "../src/cycle.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {} });

test("CSV fields keep their commas and quotes", () => {
  assert.deepEqual(csvRows('A,B,C\n1,"x, y",3\r\n4,"say ""hi""",6\n'), [{ A: "1", B: "x, y", C: "3" }, { A: "4", B: 'say "hi"', C: "6" }]);
});

test("each country's latest house prices, debt service, credit and exchange rate, with the history behind them", async () => {
  const r = await financialCycle(session(), { countries: ["CA", "AU", "CN", "US", "AR"], periods: 4 });
  assert.deepEqual(r.latest.CA.house_prices, { period: "2026-Q2", nominal_change_on_year_pct: -3.97, nominal_index_2010: 201.86, real_change_on_year_pct: -6.72, real_index_2010: 139.23 });
  assert.deepEqual(r.latest.CA.debt_service, { period: "2026-Q1", companies_pct_income: 57.3, households_pct_income: 14, private_sector_pct_income: 25.5 });
  assert.equal(r.latest.CA.credit.private_sector_pct_gdp, 218.8);
  assert.deepEqual(r.house_prices.columns, ["country", "period", "nominal_change_on_year_pct", "nominal_index_2010", "real_change_on_year_pct", "real_index_2010"]);
  assert.equal(r.exchange_rate.rows.length, 60, "monthly rates: three times the quarters asked for");
});

test("a measure a country lacks is listed; government debt at nominal value says so", async () => {
  const r = await financialCycle(session(), { countries: ["CA", "AU", "CN", "US", "AR"], periods: 4 });
  assert.deepEqual(r.not_published, ["AR: house_prices", "AR: debt_service"]);
  assert.equal(r.latest.AR.credit.government_pct_gdp_basis, "nominal value");
  assert.deepEqual([r.latest.AR.exchange_rate.nominal_index_2020, r.latest.AR.exchange_rate.real_index_2020], [4.7, 144.25]);
});
