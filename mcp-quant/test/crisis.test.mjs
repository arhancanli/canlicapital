// crisis_scenarios: synthetic years from a portfolio's own history. Monte Carlo, so checked by properties that
// must hold for any correct implementation rather than against a reference number.
import assert from "node:assert/strict";
import test from "node:test";

import { runTool } from "../src/registry.mjs";

// 1,500 days, a 30-day stress spell every 300 days with a negative drift and higher volatility (as real crises).
function history({ drift = -0.004 } = {}) {
  let s = 1;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const rows = [];
  for (let t = 0; t < 1500; t++) {
    const stress = t % 300 > 270, m = (stress ? drift : 0.0004) + r() * (stress ? 0.05 : 0.015);
    rows.push([m + r() * 0.01, m + r() * 0.02, m * 0.5 + r() * 0.015]);
  }
  return rows;
}
const at = (out, measure, col = 2) => out.rows.find((x) => x[0] === measure)[col];
const finite = (v) => (typeof v === "number" ? Number.isFinite(v) : v === null || typeof v !== "object" || Object.values(v).every(finite));

test("crisis years are worse than ordinary years when the history's stress days fall", () => {
  const out = runTool("crisis_scenarios", { returns: history(), paths: 2000 });
  assert.ok(finite(out));
  assert.ok(at(out, "max_drawdown_p95") > at(out, "max_drawdown_p95", 1), "p95 drawdown");
  assert.ok(at(out, "chance_drawdown_over_20pct") > at(out, "chance_drawdown_over_20pct", 1), "chance of a 20% drawdown");
  assert.ok(at(out, "total_return_median") < at(out, "total_return_median", 1), "median year");
  // The regimes found are the planted ones: about 10% of days, spells about 30 days, stress more correlated.
  const g = out.regimes;
  assert.equal(g.stress_days, 150);
  assert.ok(g.longest_stress_spell_days >= 29 && g.longest_stress_spell_days <= 45, String(g.longest_stress_spell_days));
  assert.ok(g.average_pairwise_correlation_stress > g.average_pairwise_correlation_calm);
  assert.ok(g.annual_volatility_stress > 2 * g.annual_volatility_calm);
});

test("the same seed gives the same answer; another seed a different one", () => {
  const a = runTool("crisis_scenarios", { returns: history(), paths: 300, seed: 11 });
  assert.deepEqual(runTool("crisis_scenarios", { returns: history(), paths: 300, seed: 11 }), a);
  assert.notDeepEqual(runTool("crisis_scenarios", { returns: history(), paths: 300, seed: 12 }).rows, a.rows);
});

test("correlation and volatility shocks deepen the stress tail", () => {
  const base = runTool("crisis_scenarios", { returns: history(), paths: 2000 });
  const corr = runTool("crisis_scenarios", { returns: history(), paths: 2000, correlation_shock: 1 });
  const vol = runTool("crisis_scenarios", { returns: history(), paths: 2000, vol_multiplier: 2 });
  assert.ok(at(vol, "max_drawdown_p95") > at(base, "max_drawdown_p95"));
  assert.ok(at(corr, "max_drawdown_p95") >= at(base, "max_drawdown_p95") * 0.98, "never materially lower");
  assert.equal(corr.settings.correlation_shock, 1);
});

test("a longer forced crisis does more damage", () => {
  const short = runTool("crisis_scenarios", { returns: history(), paths: 2000, crisis_days: 10 });
  const long = runTool("crisis_scenarios", { returns: history(), paths: 2000, crisis_days: 120 });
  assert.equal(long.settings.crisis_days, 120);
  assert.ok(at(long, "max_drawdown_median") > at(short, "max_drawdown_median"));
});

test("bad inputs are refused by name", () => {
  const rows = history();
  assert.throws(() => runTool("crisis_scenarios", { returns: rows.map((r, t) => (t === 5 ? r.slice(0, 2) : r)) }), /row 5 has 2 values/);
  assert.throws(() => runTool("crisis_scenarios", { returns: rows, weights: [0.5, 0.5] }), /weights has 2 values for 3 assets/);
  assert.throws(() => runTool("crisis_scenarios", { returns: rows.map(() => [0.001, 0.001, 0.001]) }), /never change/);
  assert.throws(() => runTool("crisis_scenarios", { returns: rows, paths: 20000, horizon_days: 2520 }), /budget/);
  assert.throws(() => runTool("crisis_scenarios", { returns: rows.map((r, t) => (t === 9 ? [-1, 0, 0] : r)) }), /cannot be -100%/);
});
