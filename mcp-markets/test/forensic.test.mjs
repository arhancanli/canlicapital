// The three screens' arithmetic on inputs whose answers are worked by hand.
import assert from "node:assert/strict";
import test from "node:test";

import { altman, beneish, piotroski } from "../src/forensic.mjs";

const year = { sales: 1000, cogs: 600, receivables: 100, current_assets: 400, current_liabilities: 200, total_assets: 1000, total_liabilities: 500, ppe: 300, securities: 0, depreciation: 50, sga: 100, net_income: 80, cfo: 80, long_term_debt: 200, retained_earnings: 300, ebit: 120, shares: 100 };

test("Beneish: unchanged years give every index 1 and M = -2.48", () => {
  const r = beneish(year, year);
  assert.equal(r.m_score, -2.48);
  assert.deepEqual(Object.values(r.indices), [1, 1, 1, 1, 1, 1, 1, 0]);
  assert.match(r.flag, /below -1.78/);
  const inflated = beneish({ ...year, receivables: 250, net_income: 200 }, year); // receivables up 150%, earnings far above cash
  assert.ok(inflated.m_score > -1.78, String(inflated.m_score));
  assert.deepEqual(beneish({ ...year, sga: null }, year).missing, ["sga (this year)"]);
});

test("Piotroski: unchanged years pass only the level signals; Altman's five ratios", () => {
  assert.equal(piotroski(year, year).f_score, 3, "ROA and CFO positive, no new shares");
  assert.equal(piotroski({ ...year, net_income: 100, cfo: 120, long_term_debt: 100, current_assets: 500, cogs: 550, sales: 1100 }, year).f_score, 9);
  // 1.2(0.2) + 1.4(0.3) + 3.3(0.12) + 0.6(2000/500) + 1.0(1.0) = 4.456
  const z = altman(year, 2000);
  assert.equal(z.z_score, 4.46); assert.match(z.zone, /safe/);
  assert.deepEqual(altman(year, null).missing, ["market_value_of_equity"]);
});
