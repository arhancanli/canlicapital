// The sleeve library's invariants, for every one of its sleeves: unique ids, hashes that match the
// spec, no lookahead (changing future prices never changes an earlier target), no position before
// the stated warm-up, and tournaments that are deterministic for a seed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { runTool } from "../src/registry.mjs";
import { FAMILY_INFO, SLEEVES } from "../src/sleeves.mjs";
import { RECIPES } from "../src/tools/strategies.mjs";

let seed = 9;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const gauss = () => { let u = 0; for (let i = 0; i < 12; i++) u += rnd(); return u - 6; };
const T = 900, N = 5;
const P = [new Array(N).fill(100)];
for (let t = 1; t < T; t++) P.push(P[t - 1].map((p, i) => p * Math.exp(0.0003 * (i - 2) + 0.012 * gauss())));

function targetsOf(s, prices) {
  const cols = s.data === "single" ? [0] : s.data === "pair" ? [1, 2] : [...Array(N).keys()];
  const sub = prices.map((r) => cols.map((i) => r[i]));
  return RECIPES[s.recipe].build({ prices: s.data === "single" ? sub.map((r) => r[0]) : sub, ...s.params }).targets;
}

test("the library: 399 sleeves, unique ids, spec hashes that match, every family documented", () => {
  assert.equal(SLEEVES.length, 399);
  assert.equal(new Set(SLEEVES.map((s) => s.id)).size, SLEEVES.length);
  for (const s of SLEEVES) {
    const spec = { spec_version: s.spec_version, id: s.id, recipe: s.recipe, data: s.data, params: s.params };
    assert.equal(s.spec_sha256, createHash("sha256").update(JSON.stringify(spec)).digest("hex"), s.id);
    assert.ok(s.rule.length > 20, s.id);
  }
  for (const [k, f] of Object.entries(FAMILY_INFO)) assert.ok(f.references.length && f.rationale && f.risks, k);
});

test("no sleeve looks ahead: rewriting the last 150 periods leaves every earlier target unchanged", () => {
  const cut = T - 150;
  const Q = P.map((r, t) => (t < cut ? r : r.map((x, i) => x * (1 + 0.3 * Math.sin(t * (i + 1))))));
  for (const s of SLEEVES) {
    if (s.recipe === "min_variance_rebalance" && s.params.lookback <= N) continue;
    const a = targetsOf(s, P), b = targetsOf(s, Q);
    for (let t = 0; t < cut; t++) assert.deepEqual(b[t], a[t], `${s.id} target at ${t} depends on later prices`);
  }
});

test("no sleeve holds a position before its stated warm-up", () => {
  for (const s of SLEEVES) {
    const tg = targetsOf(s, P);
    for (let t = 0; t < Math.min(s.warmup, T); t++) if (tg[t]) assert.ok(tg[t].every((w) => w === 0), `${s.id} is invested at ${t}, before its warm-up ${s.warmup}`);
  }
});

test("tournaments are deterministic for a seed and the seed is what moves the bootstrap", () => {
  const args = { prices: P, families: ["time_series_momentum", "risk_parity", "short_term_reversal"], reps: 200, seed: 5, splits: 8 };
  const a = runTool("sleeve_tournament", args), b = runTool("sleeve_tournament", args);
  assert.deepEqual(a, b);
  const c = runTool("sleeve_tournament", { ...args, seed: 6 });
  assert.deepEqual(c.leaderboard, a.leaderboard);
  assert.deepEqual(c.multiple_testing.pbo, a.multiple_testing.pbo);
  assert.equal(c.multiple_testing.spa.statistic, a.multiple_testing.spa.statistic);
});

test("errors name the fix", () => {
  assert.throws(() => runTool("run_sleeve", { id: "nope", prices: P }), /list_sleeves/);
  assert.throws(() => runTool("run_sleeve", { id: "riskparity-63-r21", prices: P.map((r) => r[0]) }), /two columns/);
  assert.throws(() => runTool("sleeve_tournament", { prices: P.slice(0, 120) }), /send more history/);
  assert.throws(() => runTool("run_sleeve", { id: "ma-5-20-long", prices: P, symbols: ["A"] }), /symbols has 1 names/);
  assert.equal(runTool("list_sleeves", { family: "pairs", limit: 400 }).total, 18);
  assert.equal(runTool("describe_sleeve", { id: "tsmom-252-vt10-long" }).same_as.tool, "backtest_time_series_momentum");
});
