// american_option's two rules beside its tree: a call on an asset that pays nothing, at a rate that is not negative, is
// never exercised early (its price is the European one exactly); and no American price is below the European one.
import assert from "node:assert/strict";
import test from "node:test";

import { TOOLS } from "../src/tools/options.mjs";

const american = TOOLS.find((t) => t.name === "american_option");
const base = { spot: 120, strike: 100, years: 2, volatility: 0.2, steps: 200 };

test("a call with no dividend and a rate that is not negative is priced at the European price exactly", () => {
  for (const rate of [0, 0.05]) {
    const r = american.run({ ...base, type: "call", rate, dividend_yield: 0 });
    assert.equal(r.price, r.european_price, `rate ${rate}`);
    assert.equal(r.early_exercise_premium, 0);
  }
});

test("at a negative rate, a deep in-the-money call on an asset that pays nothing can be worth exercising early", () => {
  const r = american.run({ ...base, type: "call", rate: -0.03, dividend_yield: 0 });
  assert.ok(r.early_exercise_premium > 1, `premium ${r.early_exercise_premium}`);
});

test("no American price falls below the European one, calls or puts, with or without dividends", () => {
  for (const type of ["call", "put"]) {
    for (const [rate, dividend_yield] of [[0.04, 0.01], [0.01, 0.04], [0.05, 0], [0, 0.02]]) {
      for (const spot of [60, 100, 140]) {
        const r = american.run({ ...base, spot, type, rate, dividend_yield, steps: 50 });
        assert.ok(r.price >= r.european_price, `${type} spot ${spot} r ${rate} q ${dividend_yield}: ${r.price} < ${r.european_price}`);
      }
    }
  }
});
