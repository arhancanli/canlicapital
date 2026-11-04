// scenario_risk on responses captured from Yahoo's chart data and FRED (scripts/capture-scenario-fixtures.mjs),
// replayed with no network, and its arithmetic on cases worked by hand.
import assert from "node:assert/strict";
import test from "node:test";

import { conditional, fridays, regress, scenarioRisk, solve, weekly } from "../src/scenarios.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {} });
const BOOK = [{ symbol: "SPY", weight: 0.6 }, { symbol: "TLT", weight: 0.4 }];

test("weeks end on Fridays; a week's value is its last one, and a week with none is empty", () => {
  assert.deepEqual(fridays("2026-10-01", "2026-10-20"), ["2026-10-02", "2026-10-09", "2026-10-16"]);
  assert.deepEqual(weekly(["2026-09-30", "2026-10-01", "2026-10-13"], [1, 2, 3], ["2026-10-02", "2026-10-09", "2026-10-16"]), [2, null, 3]);
});

test("a shock moves the other factors by their mean given it, and leaves them less spread out", () => {
  assert.deepEqual(solve([[2, 1], [1, 3]], [3, 5]).map((x) => Math.round(x * 1e9) / 1e9), [0.8, 1.4]);
  // Standard deviations 1 and 2, correlation 0.5: given the first moves by 1, the second's mean is 1 and its
  // variance falls from 4 to 3.
  const c = conditional([[1, 1], [1, 4]], new Map([[0, 1]]));
  assert.deepEqual(c.mean, [1, 1]);
  assert.deepEqual(c.left, [[0, 0], [0, 3]]);
});

test("least squares recovers known betas, with the fit's R squared", () => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  const X = Array.from({ length: 300 }, () => [rand() * 0.04, rand() * 0.2]);
  const y = X.map(([a, b]) => 0.001 + 1.5 * a - 0.7 * b + rand() * 0.002);
  const fit = regress(y, X);
  assert.ok(Math.abs(fit.betas[0] - 1.5) < 0.05 && Math.abs(fit.betas[1] + 0.7) < 0.01, JSON.stringify(fit.betas));
  assert.ok(fit.r2 > 0.99);
  assert.equal(fit.weeks, 300);
});

test("shocks or a crisis, never both or neither; each holding once; weights as fractions; no fall past 100%", async () => {
  const s = session(), spy = [{ symbol: "SPY", weight: 1 }];
  await assert.rejects(scenarioRisk(s, { holdings: spy }), /Give shocks/);
  await assert.rejects(scenarioRisk(s, { holdings: spy, shocks: { equities: -0.1 }, scenario: "q4_2018" }), /not both/);
  await assert.rejects(scenarioRisk(s, { holdings: [{ symbol: "SPY", weight: 0.5 }, { symbol: "spy", weight: 0.5 }], shocks: { equities: -0.1 } }), /listed twice/);
  await assert.rejects(scenarioRisk(s, { holdings: [{ symbol: "SPY", weight: 60 }], shocks: { equities: -0.1 } }), /10/);
  await assert.rejects(scenarioRisk(s, { holdings: spy, shocks: { stocks: -0.1 } }), /stocks/);
  await assert.rejects(scenarioRisk(s, { holdings: spy, shocks: { equities: -1 } }), /100%/);
});

test("stocks down 20%: SPY falls by it, the other factors follow history, and a range brackets the result", async () => {
  const r = await scenarioRisk(session(), { holdings: BOOK, shocks: { equities: -0.2 }, portfolio_value: 100000 });
  assert.equal(r.kind, "hypothetical");
  assert.equal(r.horizon_weeks, 4);
  assert.deepEqual(r.betas_from, { from: "2021-10-22", to: "2026-10-09", weeks: 260 });
  const factor = Object.fromEntries(r.factors.rows.map((x) => [x[0], x]));
  assert.deepEqual([factor.equities[3], factor.equities[4]], [-0.2, "given"]);
  assert.equal(factor.volatility[4], "implied by the given moves");
  assert.ok(factor.volatility[3] > 10 && factor.rates_10y[3] > 0, "in these years the VIX jumped and yields rose when stocks fell");
  const spy = r.holdings.rows.find((x) => x[0] === "SPY");
  assert.deepEqual([spy[2], spy[4], spy[5]], [-0.2, 1, 1], "SPY is the equities factor: -20%, R squared 1, beta 1");
  assert.equal(r.portfolio.model_return, -0.1295);
  assert.deepEqual(r.portfolio.range_90, [-0.1561, -0.1028]);
  assert.equal(r.portfolio.model_pnl, -12945.93);
  assert.equal(r.model_check, undefined, "a hypothetical shock has nothing to check against");
});

test("the 2020 crash replayed: the model beside what each holding did, and how far off it was", async () => {
  const r = await scenarioRisk(session(), { holdings: BOOK, scenario: "pandemic_crash" });
  assert.deepEqual(r.scenario, { name: "pandemic_crash", what: "the February-March 2020 crash", from: "2020-02-19", to: "2020-03-23" });
  assert.ok(r.factors.rows.every((x) => x[4] === "actual"));
  const tlt = r.holdings.rows.find((x) => x[0] === "TLT");
  assert.deepEqual([tlt[2], tlt[3]], [0.0755, 0.1423], "model, then actual");
  assert.equal(r.portfolio.model_return, -0.1721);
  assert.equal(r.portfolio.actual_return, -0.1454);
  assert.deepEqual(r.model_check, { holdings_compared: 2, mean_abs_error: 0.0334, worst_miss: { symbol: "TLT", model_return: 0.0755, actual_return: 0.1423 }, portfolio_error: -0.0267 });
});

test("a crisis before the dollar index and gold fund existed: their moves are estimated from the factors with data", async () => {
  const r = await scenarioRisk(session(), { holdings: [{ symbol: "SPY", weight: 1 }], scenario: "dotcom_bust" });
  const how = Object.fromEntries(r.factors.rows.map((x) => [x[0], x[4]]));
  assert.equal(how.dollar, "estimated from the others (no data then)");
  assert.equal(how.gold, "estimated from the others (no data then)");
  assert.equal(how.equities, "actual");
  assert.match(r.factor_note, /^dollar and gold had no data/);
  assert.equal(r.portfolio.actual_return, -0.4752);
  assert.equal(r.model_check.portfolio_error, 0);
});
