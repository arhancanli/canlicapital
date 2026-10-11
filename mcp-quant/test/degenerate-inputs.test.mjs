// Degenerate inputs get a clear refusal, never NaN in an answer: an asset whose returns never
// change has no risk to weigh or correlate, and quotes that put the implied forward at or below
// zero imply no carry. Found by canli-mcp's bench/robustness.mjs.
import assert from "node:assert/strict";
import test from "node:test";

import { runTool } from "../src/registry.mjs";

const finite = (v) => (typeof v === "number" ? Number.isFinite(v) : v === null || typeof v !== "object" || Object.values(v).every(finite));
const moving = (i) => [0.01 * Math.sin(i), 0.008 * Math.cos(i * 1.3), 0.012 * Math.sin(i * 0.7 + 1)];

test("an asset that never moves is refused by name, not answered with NaN", () => {
  const returns = Array.from({ length: 40 }, (_, i) => [...moving(i).slice(0, 2), 0.004]);
  for (const name of ["covariance_shrinkage", "correlation_matrix", "max_sharpe_portfolio", "min_variance_portfolio"]) {
    assert.throws(() => runTool(name, { returns }), /asset_3 has no variance/, name);
  }
  assert.throws(() => runTool("correlation_matrix", { returns, assets: ["SPY", "TLT", "CASH"] }), /CASH has no variance/);
});

test("the same tools still answer, with finite numbers, when every asset moves", () => {
  const returns = Array.from({ length: 40 }, (_, i) => moving(i));
  for (const name of ["covariance_shrinkage", "correlation_matrix", "max_sharpe_portfolio", "min_variance_portfolio"]) {
    assert.ok(finite(runTool(name, { returns })), name);
  }
});

test("put-call parity: quotes that imply a forward at or below zero give no carry, with a note", () => {
  const r = runTool("put_call_parity", { call: 0, put: 120, spot: 100, strike: 100, years: 0.5 });
  assert.ok(r.implied_forward <= 0);
  assert.equal(r.implied_carry, null);
  assert.match(r.implied_carry_note, /not positive/);
  const ok = runTool("put_call_parity", { call: 6, put: 4, spot: 100, strike: 100, years: 0.5, rate: 0.04 });
  assert.ok(Number.isFinite(ok.implied_carry) && ok.implied_carry_note === undefined);
});
